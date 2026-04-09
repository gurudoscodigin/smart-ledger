

## Problema

A transação "Sonda - Mantimentos" (R$ 42.73) foi restaurada da lixeira com sucesso (`deleted_at = null`), porém o status permanece como `pendente` quando deveria ser `pago`. Isso causa uma diferença no total de contas pendentes.

## Correções

### 1. Corrigir o status da transação no banco
- Migration SQL para atualizar o status de "Sonda - Mantimentos" (id: `a9dd2c06-f446-429b-a95c-87d41b7854fb`) de `pendente` para `pago`, com `data_pagamento` = `2026-04-09`

### 2. Verificar o total pendente
- Após a correção, o total pendente de abril deve diminuir em R$ 42.73, ficando consistente com o valor esperado de R$ 13.361,97 (menos os R$ 42.73 que agora serão "pago")

### Detalhes Técnicos
- Tabela: `transacoes`
- ID do registro: `a9dd2c06-f446-429b-a95c-87d41b7854fb`
- Campo: `status` → `pago`, `data_pagamento` → `2026-04-09`

