

# Plano de Correção Final — Smart Ledger

## Estado Atual (Testes Realizados)

**O QUE FUNCIONA:**
- Identidade unificada (e8fb6f24 com telegram_id correto)
- telegram-notify: retornou `notified: 1` com sucesso
- Agente resolve o user correto via telegram_id
- Fluxo conversacional com pending_context funciona (savePendingContext by chat_id)
- Rota /auditor registrada em App.tsx e no sidebar
- Todas as rotas web funcionando

**O QUE ESTÁ QUEBRADO:**

### BUG 1 — CRÍTICO: Drive Mirror falha com "Credential not found"
O `drive-mirror` usa `GOOGLE_DRIVE_API_KEY` como secret, mas **não existe um Google Drive connector linkado ao projeto**. O secret `GOOGLE_DRIVE_API_KEY` existe mas não é um connector válido — é apenas um valor solto. O gateway retorna `unauthorized`.

**Correção:** Conectar o Google Drive connector via `standard_connectors--connect`. Isso gera credentials válidas para o gateway. Sem isso, o `drive-mirror` nunca vai funcionar.

### BUG 2 — MÉDIO: telegram-poll morre em ~15s
O poll faz boot e shutdown a cada 15 segundos ao invés de rodar 55s. Provável causa: o `getUpdates` com long-polling de 20s está retornando imediatamente (offset já consumido) e o loop termina quando `timeout < 1`. Ou a edge function tem um wall-clock timeout menor que 55s.

**Correção:** Investigar o timeout real da edge function. Adicionar um `await new Promise(r => setTimeout(r, 2000))` quando `updates.length === 0` para evitar busy-loop e permitir que o long-polling do Telegram funcione.

### BUG 3 — MÉDIO: Falta cron para telegram-notify
Não existe cron job configurado. As notificações só funcionam quando chamadas manualmente.

**Correção:** O user precisa executar o SQL de criação do cron no Supabase SQL Editor (já fornecido anteriormente).

### BUG 4 — BAIXO: Comprovantes antigos com path do user errado
7 comprovantes usam o user_id `77193628` no path. Funciona porque o `file_path` salvo no DB corresponde ao path real no Storage. Cosmético.

**Correção:** Nenhuma ação necessária. Novos uploads usam o path correto.

---

## Plano de Implementação

### Passo 1 — Conectar Google Drive Connector
Usar `standard_connectors--connect` com `connector_id: google_drive` para linkar uma conta Google Drive ao projeto. Isso disponibiliza credentials válidas para o gateway.

### Passo 2 — Atualizar drive-mirror para usar connector correto
O código atual já usa `GOOGLE_DRIVE_API_KEY` e `LOVABLE_API_KEY` — após conectar o connector, esses secrets são providos automaticamente. Verificar se os nomes dos secrets correspondem ao que o connector gera.

### Passo 3 — Fix telegram-poll timeout
Adicionar um sleep de 2s no loop quando não há updates para evitar que o loop termine prematuramente. Isso permite que o long-polling do Telegram tenha tempo para retornar updates reais.

### Passo 4 — Redeploy + Teste
- Deploy `telegram-poll` e `drive-mirror`
- Testar drive-mirror com um comprovante existente
- Verificar que telegram-poll roda >45s por ciclo
- Enviar mensagem no Telegram e confirmar processamento

### Passo 5 — Orientar user sobre cron do telegram-notify
Fornecer SQL pronto para o user executar no Supabase SQL Editor.

