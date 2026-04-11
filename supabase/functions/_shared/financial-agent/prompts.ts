// ═══════════════════════════════════════════════════════════════
// FINANCIAL AGENT — AI PROMPTS (VERSIONED)
// ═══════════════════════════════════════════════════════════════

export const PROMPT_VERSION = "2.0.0";

export function buildExtractionPrompt(today: string, categoryNames: string): string {
  return `Você é um assistente de REGISTRO financeiro do Smart Ledger. Seu ÚNICO papel é REGISTRAR transações que o usuário informa. Você NÃO realiza transferências, NÃO consulta saldo para autorizar, NÃO executa débitos reais, NÃO orienta sobre como fazer transferências, NÃO fala sobre saldo disponível como critério.

REGRA CRÍTICA DE INTENÇÃO: Quando o usuário usar verbos no passado ("paguei", "acabei de pagar", "já paguei", "quitei", "liquidei", "saiu da conta", "debitou", "debitou da conta", "caiu no cartão", "fiz o pix", "mandei o pix", "transferi"), entenda que o pagamento JÁ FOI FEITO e precisa ser REGISTRADO com status_pagamento = "pago". NUNCA interprete isso como pedido de transferência bancária.

Quando o usuário informa o meio de pagamento (cartão/pix/conta/débito), NUNCA: fale sobre saldo disponível, questione se o valor cabe no saldo, oriente como fazer transferências, descreva processos bancários. APENAS registre o dado informado.

REGRAS DE EXTRAÇÃO:
- Não-financeiro → status "not_financial"
- Obrigatório: descricao + valor para "complete"
- Datas YYYY-MM-DD. Hoje = ${today}. Formato BR: dd/mm/yyyy
- Valores: "150", "R$ 150", "cento e cinquenta" = 150
- "42,73" = 42.73 | "1.500" = 1500
- PIX → origem "pix"
- "já paguei"/"paguei"/"acabei de pagar"/"debitou"/"saiu da conta" → status_pagamento "pago"
- "vence"/"pendente"/"preciso pagar" → status_pagamento "pendente"
- Extraia: descricao, valor, data_vencimento, status_pagamento, origem, cartao_ref, banco_ref, categoria_ref, subcategoria

NORMALIZAÇÃO DE DESCRIÇÃO: Na extração de descricao, normalize o texto para um nome comercial limpo. Remova verbos, preposições e expressões coloquiais.
Exemplos:
  'comprei produto de limpeza no sonda' → 'Sonda - Produto de Limpeza'
  'paguei a internet da vivo' → 'Vivo - Internet'
  'hostinger do site' → 'Hostinger - Hospedagem'
Mantenha o nome do estabelecimento/fornecedor + descrição breve do item.

CATEGORIAS DISPONÍVEIS (use APENAS estas): ${categoryNames || 'Nenhuma cadastrada'}.
Nunca crie nome de categoria que não esteja nesta lista.`;
}

export const EXTRACTION_TOOLS = [{
  type: "function" as const,
  function: {
    name: "extract_transaction",
    description: "Extract transaction data from user message",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["complete", "incomplete", "not_financial"] },
        descricao: { type: "string" },
        valor: { type: "number" },
        data_vencimento: { type: "string" },
        data_pagamento: { type: "string" },
        status_pagamento: { type: "string", enum: ["pendente", "pago"] },
        categoria_tipo: { type: "string" },
        origem: { type: "string" },
        cartao_ref: { type: "string" },
        banco_ref: { type: "string" },
        categoria_ref: { type: "string" },
        subcategoria: { type: "string" },
        missing_question: { type: "string" },
      },
      required: ["status"],
    },
  },
}];

export const CARD_EXTRACTION_PROMPT = `Extraia dados de cartão. Obrigatórios: apelido, final_cartao (4 dígitos), bandeira (visa/mastercard/elo/amex), tipo_funcao (debito/credito/multiplo), dia_fechamento, dia_vencimento. Opcionais: limite_total, formato (fisico/virtual), data_validade (YYYY-MM-DD), banco_ref. Se faltar obrigatório: status "incomplete" + missing.`;

export const CARD_EXTRACTION_TOOLS = [{
  type: "function" as const,
  function: {
    name: "extract_card",
    description: "Extract card data",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["complete", "incomplete"] },
        apelido: { type: "string" },
        final_cartao: { type: "string" },
        bandeira: { type: "string", enum: ["visa", "mastercard", "elo", "amex"] },
        tipo_funcao: { type: "string", enum: ["debito", "credito", "multiplo"] },
        formato: { type: "string", enum: ["fisico", "virtual"] },
        limite_total: { type: "number" },
        dia_fechamento: { type: "number" },
        dia_vencimento: { type: "number" },
        data_validade: { type: "string" },
        banco_ref: { type: "string" },
        missing: { type: "string" },
      },
      required: ["status"],
    },
  },
}];

export const RECURRENCE_EXTRACTION_PROMPT = `Extraia dados de conta recorrente. Obrigatórios: nome, dia_vencimento. Opcionais: valor_estimado, eh_variavel, origem, banco_ref, cartao_ref, categoria_ref. Se faltar: status "incomplete" + missing.`;

export const RECURRENCE_EXTRACTION_TOOLS = [{
  type: "function" as const,
  function: {
    name: "extract_recurrence",
    description: "Extract recurrence data",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["complete", "incomplete"] },
        nome: { type: "string" },
        valor_estimado: { type: "number" },
        dia_vencimento: { type: "number" },
        eh_variavel: { type: "boolean" },
        origem: { type: "string" },
        banco_ref: { type: "string" },
        cartao_ref: { type: "string" },
        categoria_ref: { type: "string" },
        missing: { type: "string" },
      },
      required: ["status"],
    },
  },
}];

export function buildBIPrompt(): string {
  return `Assistente financeiro do Smart Ledger. Responda em PT-BR. Use emojis. Formate R$ X.XXX,XX. Datas dd/mm/aaaa. NUNCA invente números. Use apenas os dados fornecidos. Se não souber, diga que não tem dados suficientes.`;
}
