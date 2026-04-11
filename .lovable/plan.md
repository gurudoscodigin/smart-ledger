

# Relatório de Auditoria Final + Plano de Correção

## O QUE FUNCIONA

1. **Identidade unificada** -- O SQL executado vinculou `telegram_id = 8485488912` ao user `e8fb6f24`. O agente agora resolve corretamente o user com dados.
2. **telegram-poll** -- Executando ~50s por ciclo (correto). Cron `* * * * *` ativo.
3. **Comandos do agente** -- `/resumo`, `/pendencias`, `/limite`, `/buscar`, `/relatorio`, `/pix`, `/nova_conta`, `/nova_divida`, `/novo_banco`, `/novo_cartao` todos retornam `ok: true` e executam queries no user correto.
4. **Pending context** -- `savePendingContext` com fallback por `chat_id` implementado.
5. **Fluxo conversacional** -- Steps ask_status, ask_pagamento, ask_cartao, ask_categoria, ask_subcategoria, confirm todos implementados.
6. **Dívida** -- Fluxo completo com contrato + parcelas implementado.
7. **Lembretes** -- Criação e confirmação via `/lembretes` funcionando.
8. **Cron jobs** -- `poll-telegram-updates` (cada minuto), `monthly-rollover-daily` (00:05 UTC), `monthly-rollover` (dia 1).
9. **Web UI** -- Todas as rotas (`/`, `/bills`, `/cards`, `/reports`, `/categorias`, `/lembretes`, `/settings`, `/trash`) funcionando.
10. **Regex de confirmação** -- Corrigido com word boundaries (`^sim$`, `^ok$`, etc.).

---

## BUGS RESTANTES (5 itens)

### BUG 1 — CRÍTICO: telegram-notify pega o admin errado

Existem 2 admins no `user_roles`: `77193628` (sem telegram_id) e `e8fb6f24` (com telegram_id). A query `.limit(1).single()` retorna o `77193628` primeiro, que não tem `telegram_id` no profile. Resultado: `"reason": "no chat_id"` — notificações nunca são enviadas.

**Correção:** Na query do admin, fazer JOIN com profiles e filtrar pelo que tem `telegram_id` preenchido. Ou reordenar para pegar o admin com telegram_id.

### BUG 2 — MÉDIO: Falta cron para telegram-notify

Não existe cron job para `telegram-notify`. Os 3 crons existentes são: `poll-telegram-updates`, `monthly-rollover`, `monthly-rollover-daily`. Sem cron, as notificações proativas (contas vencendo, atrasadas, lembretes do dia) nunca são disparadas automaticamente.

**Correção:** Criar cron job `notify-telegram-daily` com schedule `0 11 * * *` (8h BRT) chamando `/functions/v1/telegram-notify`.

### BUG 3 — MÉDIO: Rota /auditor inexistente

`src/pages/Auditor.tsx` existe mas não está registrada em `App.tsx` nem no sidebar.

**Correção:** Adicionar rota `/auditor` em `App.tsx` e item no sidebar com ícone `Shield` ou `FileSearch`.

### BUG 4 — MÉDIO: Comprovantes antigos têm path com user_id errado

5 comprovantes usam path `77193628-bdd3.../transacaoId/...` mas o user correto é `e8fb6f24`. Os arquivos no Storage estão com o path antigo. O `useComprovantes.ts` busca por `transacao_id` na tabela (não pelo path), então a listagem funciona. Porém o download via `supabase.storage.download(file_path)` ainda funciona porque o path no Storage é o mesmo que está salvo. Isso é cosmético — funciona, mas está inconsistente.

**Correção:** Nenhuma ação urgente. Novos uploads já usam o user_id correto (`e8fb6f24`).

### BUG 5 — BAIXO: Drive Mirror sem connector Google Drive

O secret `GOOGLE_DRIVE_API_KEY` existe mas não há connector Google Drive linkado ao projeto. O `drive-mirror` function corretamente retorna `queued: true` quando as keys não estão configuradas. Para ativar o espelhamento real, é preciso conectar o Google Drive via `standard_connectors--connect`.

**Correção:** Conectar o Google Drive connector. Sem isso, o drive-mirror vai sempre retornar "queued" sem fazer upload real.

---

## PLANO DE CORREÇÃO

### Passo 1 — Fix telegram-notify (admin errado)
Alterar `telegram-notify/index.ts` para fazer JOIN com profiles e filtrar admin que tenha `telegram_id` preenchido:
```sql
SELECT ur.user_id FROM user_roles ur 
JOIN profiles p ON p.user_id = ur.user_id 
WHERE ur.role = 'admin' AND p.telegram_id IS NOT NULL
LIMIT 1
```

### Passo 2 — Criar cron para telegram-notify
Executar SQL no Supabase (via insert tool, não migration):
```sql
SELECT cron.schedule(
  'notify-telegram-daily',
  '0 11 * * *',
  $$ SELECT net.http_post(
    url:='https://fjevawaawhnoxskalwsm.supabase.co/functions/v1/telegram-notify',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <anon_key>"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id; $$
);
```

### Passo 3 — Registrar rota /auditor
- Importar `Auditor` em `App.tsx`
- Adicionar `<Route path="/auditor" ...>`
- Adicionar item no sidebar com ícone adequado

### Passo 4 — Deploy telegram-notify atualizado

