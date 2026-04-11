# Relatório Completo de Auditoria do Agente Financeiro  
  
faça a correção de todos os erros, implemente o drive mirror, já tem key no supabase e corrija tambem os bugs que você me relatou, desde de os criticos ate os mais aceitaveis: 

## PROBLEMA #1 — CRÍTICO: Identidade fragmentada (dados divididos entre 2 users)

**Evidência direta do banco:**

- Todas as transações, categorias, bancos e recorrências pertencem ao user `e8fb6f24`
- O profile com telegram vinculado pertence ao user `77193628`
- O agente resolve o Telegram ID `8485488912` → user `77193628` (que não tem NENHUM dado)
- Resultado: **TODOS os comandos /resumo, /pendencias, /relatorio, /buscar retornam ZERO** porque consultam dados do user `77193628` que está vazio

**Impacto:** O agente está funcionando em um vácuo. Nenhum comando de leitura funciona. Nenhuma transação criada via Telegram aparece no dashboard web (user diferente).

**Correção:** Atualizar o `profiles` do user `e8fb6f24` para incluir `telegram_id = '8485488912'`. Isso unifica tudo.

---

## PROBLEMA #2 — CRÍTICO: Pending context não persiste corretamente

**Evidência no código (orchestrator.ts linhas 378-384):**

```
await supabase.from("telegram_messages")
  .update({ pending_context: ctx })
  .eq("update_id", update.update_id);
```

Quando o `telegram-poll` chama o `telegram-agent`, o update_id é real e existe em `telegram_messages`. Porém, quando o agente quer **salvar** o pending_context no step seguinte (ex: "ask_status"), ele faz `.eq("update_id", update.update_id)` — mas o update_id da **resposta do usuário** pode ser um novo update_id que ainda não foi inserido no `telegram_messages` pelo poll.

**Timing race:** `telegram-poll` insere a row com `upsert`, depois chama `telegram-agent`. Mas a inserção e a chamada ao agente acontecem **sequencialmente dentro do mesmo loop** (linhas 73-113 do poll), então o insert DEVE ter acontecido antes. Este fluxo está correto.

**Porém**, quando o `enterConversationalFlow` faz `eq("update_id", update.update_id)` e esse update_id NÃO existe (como nos testes diretos), o update silenciosamente não atualiza nada — **falha silenciosa**.

**Pior:** Na linha 381-384, há um **duplo update** desnecessário que confunde a lógica:

```
if (!update?.update_id) {
  // update by chat_id (fallback)
} else {
  // update by update_id
}
```

**Correção:** Consolidar a lógica de save para usar `chat_id` como fallback confiável.

---

## PROBLEMA #3 — GRAVE: Transações NÃO são criadas (user sem categorias)

**Evidência:** Testei `"paguei a internet da vivo 130 reais hoje no cartao final 4523"` → O agente registrou um `agent_decision_logs` mas **nenhuma transação foi criada**.

**Causa raiz:** O fluxo detectou `categoria_ref = "Custos Fixos"` via keyword, mas quando tenta `resolveCategory(supabase, userId, "Custos Fixos")` para o user `77193628`, retorna NULL (user não tem categorias). O cartão `final 4523` também não existe para esse user (só tem cartão `0981`). O agente segue para `enterConversationalFlow`, pergunta o que falta, salva pending_context — mas o pending_context falha silenciosamente (problema #2).

**Resultado:** A conversa fica travada. O usuário responde, mas o agente não encontra pending_context e trata como nova mensagem.

---

## PROBLEMA #4 — GRAVE: Comando /lembretes não tem handler de confirmação

**Evidência no código (commands.ts linhas 289-301):** O `/lembretes` lista os lembretes abertos com bullets, mas:

- Não mostra numeração para seleção
- Não salva pending_context com step `lembretes_listados`
- Se o usuário responde com um número, o agente interpreta como nova mensagem financeira

**Correção:** Adicionar numeração, salvar pending_context, e handler no `handlePendingContext`.

---

## PROBLEMA #5 — GRAVE: Notificação proativa de lembretes NÃO EXISTE

**Evidência:** O `telegram-notify/index.ts` não consulta a tabela `lembretes`. Ele notifica sobre:

- Contas vencendo em 48h ✅
- Contas atrasadas ✅  
- Pagas sem comprovante ✅
- Variáveis com valor 0 ✅
- Lembretes do dia ❌ **AUSENTE**

Também não existe cron para chamar o `telegram-notify` — não encontrei nenhum job configurado para isso.

**Correção:** Adicionar seção de lembretes no `telegram-notify` e criar/verificar o cron job.

---

## PROBLEMA #6 — MÉDIO: Drive Mirror nunca é chamado

**Evidência:**

- Nenhuma transação tem `drive_url` preenchido no banco
- O `finalizeTransaction` (orchestrator.ts linhas 696-704) salva comprovante em `comprovantes` mas **nunca chama** `drive-mirror`
- O front `useComprovantes.ts` também não chama `drive-mirror` no onSuccess

**Correção:** Após inserir comprovante, invocar `drive-mirror` assincronamente.

---

## PROBLEMA #7 — MÉDIO: Agente não suporta fluxo de dívida

**Evidência:** O tipo `AgentIntent` inclui `create_debt`, mas:

- Nenhum handler no orchestrator ou commands detecta intenção de dívida
- O comando `/nova_conta` sempre define `categoria_tipo: "avulsa"` (commands.ts linha 182)
- Não existe um `/nova_divida` command
- O `contextToTransactionPayload` mapeia `contrato_id` e parcelas, mas nunca são populados

**Correção:** Adicionar detecção de intenção de dívida e handler que cria contratos + parcelas.

---

## PROBLEMA #8 — MÉDIO: Agente não diferencia conta fixa de avulsa

**Evidência:** O fluxo natural (mensagem livre) sempre começa com `categoria_tipo: "avulsa"` no context. Mesmo quando o agente detecta recorrência via `resolveRecurrence`, ele muda `categoria_tipo` para `"fixa"` ou `"variavel"` — **mas apenas no fluxo principal** (orchestrator.ts linhas 236-247). 

No comando `/nova_conta` (commands.ts linhas 152-199), o `categoria_tipo` é hardcoded como `"avulsa"` (linha 182) e **nunca é corrigido** mesmo quando recorrência é detectada.

**Correção:** No `/nova_conta`, verificar recorrência e ajustar tipo.

---

## PROBLEMA #9 — MÉDIO: `resolveRecurrence` faz match fraco

**Evidência (services.ts linha 239):**

```
.ilike("nome", `%${description}%`)
```

Se o user envia "paguei a vivo", `description` será `"vivo"`. Isso vai dar match em QUALQUER recorrência com "vivo" no nome. Se houver "Vivo Móvel" e "Vivo Internet", retorna a primeira arbitrariamente.

**Pior:** `descForRecurrence` (orchestrator.ts linha 183) usa `vendorCanonical?.canonical || processedText.substring(0, 50)`. Se o texto for longo, pega 50 chars de texto bruto como busca ILIKE — resultados imprevisíveis.

---

## PROBLEMA #10 — BAIXO: `resolveVendorAlias` busca TODOS os aliases

**Evidência (services.ts linhas 259-263):**

```
const { data } = await supabase
  .from("agent_vendor_aliases")
  .select("*")
  .eq("user_id", userId)
  .order("confidence", { ascending: false });
```

Busca TODOS os aliases do user sem limite. Com o tempo, isso vai ficar lento. Precisa de `.limit(100)` no mínimo.

---

## PROBLEMA #11 — BAIXO: `logDecision` e `saveVendorAlias` falham silenciosamente

**Evidência (repositories.ts):** Todas as funções fazem `await supabase.from(...).insert(...)` mas **não checam o error**. Se o insert falhar (ex: constraint violation), o agente não sabe.

---

## PROBLEMA #12 — BAIXO: Confirmação mostra "Está correto? (sim/não)" mas aceita regex fraco

**Evidência (orchestrator.ts linhas 560-561):**

```
if (/sim|ok|isso|pode|confirma|certo|correto/i.test(lower))
```

Isso faz match em palavras como "possível" (contém "sim" e "pode"), "cartão" (não, mas seguro), etc. Risco baixo mas real.

---

## PROBLEMA #13 — BAIXO: `telegram-notify` usa Markdown parse_mode

**Evidência (telegram-notify/index.ts linha 162):**

```
parse_mode: "Markdown"
```

Se qualquer descrição de transação contiver `*`, `_`, ``` ou `[`, o Telegram rejeita a mensagem. O `sendTelegram` do módulo compartilhado tem fallback para texto simples, mas o `telegram-notify` usa `fetch` direto sem fallback.

---

## PLANO DE CORREÇÃO (ordem de execução)

### Passo 1 — Unificar identidade (SQL no Supabase Editor)

```sql
UPDATE profiles SET telegram_id = '8485488912' 
WHERE user_id = 'e8fb6f24-ebb8-492e-8cfe-e932b0a79850';
```

### Passo 2 — Corrigir pending_context (orchestrator.ts)

- Refatorar `enterConversationalFlow` para usar `savePendingContext` em vez de update inline duplicado
- No `savePendingContext`, fazer fallback: tentar `update_id` primeiro, se 0 rows afetadas, fazer upsert por `chat_id`

### Passo 3 — Corrigir `/nova_conta` (commands.ts)

- Adicionar resolução de recorrência e ajuste de `categoria_tipo`
- Adicionar comando `/nova_divida` com fluxo de criação de contrato

### Passo 4 — Corrigir notificação de lembretes (telegram-notify/index.ts)

- Adicionar query de `lembretes` com `data_lembrete = today` e `notificado_telegram = false`
- Marcar `notificado_telegram = true` após envio
- Adicionar handler de confirmação de lembrete no `handlePendingContext`

### Passo 5 — Integrar drive-mirror (orchestrator.ts + useComprovantes.ts)

- Chamar `drive-mirror` após insert de comprovante em `finalizeTransaction`

### Passo 6 — Fixes menores

- Adicionar `.limit(100)` ao `resolveVendorAlias`
- Adicionar error handling no `repositories.ts`
- Usar `sendTelegram` com fallback no `telegram-notify` em vez de `fetch` direto
- Melhorar regex de confirmação  
  
🔍 AUDITORIA COMPLETA DO SMART LEDGER — Relatório Honesto
  🔴 PROBLEMAS CRÍTICOS
  1. Usuário logado (e8fb6f24) NÃO tem profile nem role
  O auth.users tem e8fb6f24-ebb8-492e-8cfe-e932b0a79850 (admin@fincontrol.temp)
  NÃO existe registro em profiles para esse user_id
  NÃO existe registro em user_roles para esse user_id
  get_user_role retorna NULL → o sistema não sabe que esse usuário é admin
  O badge no sidebar mostra "Assistente" por padrão quando role é null
  Impacto: RLS policies que checam has_role(auth.uid(), 'admin') FALHAM para esse user — ele não consegue deletar transações, ver logs de auditoria, gerenciar convites, etc.
  2. Dois user_ids em transacoes = dados fragmentados
  e8fb6f24 (admin@fincontrol.temp — login web) → tem transações mas sem profile/role
  77193628 (Gabriel Gato — via trigger handle_new_user) → tem profile+role admin, é usado pelo Telegram
  Transações criadas pelo agente Telegram usam 77193628, transações criadas pela web usam e8fb6f24
  Resultado: quando o admin faz login na web, ele NÃO vê as transações que o agente criou (RLS user_id = auth.uid())
  3. Comprovantes com path inconsistente
  5 comprovantes têm path 77193628-bdd3-41b5-95e4-15a5176c3590/{transacao_id}/... (padrão antigo: userId/transacaoId/timestamp)
  2 comprovantes têm path 77193628-bdd3-41b5-95e4-15a5176c3590/2026-04-11_comprovante_... (padrão novo: userId/date_filename)
  O useComprovantes.ts da web usa pattern userId/transacaoId/timestamp.ext
  O orchestrator do agente usa pattern userId/date_filename
  São paths diferentes → nem a web nem o drive-mirror encontram comprovantes de forma confiável
  4. Nenhum comprovante espelhado no Drive
  drive_url é NULL em todos os 7 comprovantes
  A edge function drive-mirror nunca foi chamada com sucesso (logs vazios)
  Motivo: o drive-mirror espera LOVABLE_API_KEY + GOOGLE_DRIVE_API_KEY como secrets, e o fluxo de upload (tanto web quanto Telegram) não chama o drive-mirror automaticamente
  Falta: trigger ou chamada pós-upload ao drive-mirror
  🟡 PROBLEMAS MÉDIOS
  5. telegram-poll bootando e morrendo a cada 15 segundos
  Logs mostram ciclos de booted → shutdown com apenas ~15s de vida
  Deveria rodar ~55s num loop de long-polling
  Provável causa: a edge function telegram-poll chama telegram-agent que importa de _shared/financial-agent/, e se ocorrer qualquer erro de import/runtime, o poll morre silenciosamente
  Impacto: latência maior no Telegram (mensagens podem demorar até 60s para processar)
  6. 1 mensagem Telegram não processada
  update_id: 600f137b com text "Sim" de 10/04 ficou processed: false
  Era provavelmente uma confirmação que não foi processada porque o poll morreu antes
  7. Lembrete funciona parcialmente
  1 lembrete criado com sucesso: "pagar a sulivam dia 20" com data 12/04
  Problema: notificado_telegram está false → não há lógica implementada para enviar notificações proativas de lembretes via Telegram (não existe cron job nem edge function que verifique lembretes do dia e envie)
  A página /lembretes na web funciona (criar, confirmar, deletar)
  8. Recorrências duplicadas
  Existem 2 recorrências para "Lovable - credito" (IDs diferentes, valor_estimado ligeiramente diferente: 82.60 vs 83.12)
  Ambas ativas, com eh_variavel: true
  O agente pode criar duplicatas se o usuário cadastrar pelo Telegram sem checagem de duplicidade
  9. Sidebar: sem link para "Auditor" (/auditor)
  Existe src/pages/Auditor.tsx mas nenhuma rota no App.tsx
  Nenhum item de menu no sidebar aponta para /auditor
  Página inacessível
  🟢 O QUE FUNCIONA
  ✅ Navegação básica
  /login → tela de login renderiza OK
  /bills → lista de contas (com tabs fixa/avulsa/variavel/divida)
  /cards → Card Vault
  /reports → relatórios
  /categorias → gestão de categorias e subcategorias
  /lembretes → criação e confirmação de lembretes
  /settings → configurações
  /trash → lixeira
  ✅ Integridade de dados
  Nenhuma transação com referências órfãs (categoria_id, banco_id, cartao_id todos válidos)
  Nenhuma transação referenciando recorrência ou contrato inexistente
  Contrato de dívida ("financiamento do carro") com 60 parcelas criadas corretamente
  ✅ Arquitetura do Agente Modular
  O módulo _shared/financial-agent/ está bem estruturado: types, rules, services, repositories, orchestrator, mapper, commands, telegram, ai
  Separação de responsabilidades clara
  Fluxo conversacional com pending_context funciona
  Detecção de lembrete funciona
  Comandos /resumo, /pendencias, /relatorio, /buscar, /limite, /pix implementados
  📋 RESUMO DE AÇÕES NECESSÁRIAS
  #	Prioridade	Problema	Ação
  1	🔴 CRÍTICO	User e8fb6f24 sem profile/role	Criar profile + role admin via SQL
  2	🔴 CRÍTICO	Dados fragmentados entre 2 users	Decidir: migrar tudo para 1 user ou configurar telegram_id no profile do e8fb6f24
  3	🔴 CRÍTICO	Path de comprovantes inconsistente	Padronizar pattern no agente e no hook web
  4	🟡 MÉDIO	Drive mirror nunca executado	Criar chamada automática pós-upload no agente e na web
  5	🟡 MÉDIO	telegram-poll morrendo cedo	Investigar logs de erro do agente na chamada
  6	🟡 MÉDIO	Notificação de lembrete não implementada	Criar cron que verifica lembretes do dia e envia no Telegram
  7	🟡 MÉDIO	Recorrências duplicadas	Adicionar checagem de duplicidade no agente
  8	🟢 MENOR  
