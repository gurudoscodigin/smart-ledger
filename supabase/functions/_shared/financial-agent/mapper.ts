// ═══════════════════════════════════════════════════════════════
// FINANCIAL AGENT — MAPPERS
// ═══════════════════════════════════════════════════════════════

import type { AgentContext } from "./types.ts";

/**
 * Build standardized description format:
 * DD/MM/AAAA — Cartão final XXXX — Categoria — Subcategoria
 * DD/MM/AAAA — Banco NomeDoBanco — Categoria — Subcategoria
 */
export function buildFormattedDescription(ctx: AgentContext): string {
  const date = ctx.data_vencimento || new Date().toISOString().split("T")[0];
  const [y, m, d] = date.split("-");
  const datePart = `${d}/${m}/${y}`;

  let sourcePart = "—";
  if (ctx.cartao_display) {
    sourcePart = `Cartão final ${ctx.cartao_display.match(/\d{4}/)?.[0] || "????"}`;
  } else if (ctx.banco_display) {
    sourcePart = `Banco ${ctx.banco_display}`;
  } else if (ctx.origem) {
    const labels: Record<string, string> = { pix: "PIX", boleto: "Boleto", dinheiro: "Dinheiro", cartao: "Cartão" };
    sourcePart = labels[ctx.origem] || ctx.origem;
  }

  const catPart = ctx.categoria_ref || "Sem categoria";
  const subPart = ctx.subcategoria || "Geral";

  return `${datePart} — ${sourcePart} — ${catPart} — ${subPart}`;
}

/**
 * Map agent context → transacoes INSERT payload
 */
export function contextToTransactionPayload(
  ctx: AgentContext,
  userId: string
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    descricao: ctx.descricao,
    valor: ctx.valor,
    data_vencimento: ctx.data_vencimento || new Date().toISOString().split("T")[0],
    status: ctx.status_pagamento === "pago" ? "pago" : "pendente",
    categoria_tipo: ctx.categoria_tipo || "avulsa",
    origem: ctx.origem || null,
    subcategoria: ctx.subcategoria || null,
    user_id: userId,
  };

  if (ctx.status_pagamento === "pago") {
    payload.data_pagamento = ctx.data_pagamento || new Date().toISOString().split("T")[0];
  }

  if (ctx.cartao_id_resolved) payload.cartao_id = ctx.cartao_id_resolved;
  if (ctx.banco_id_resolved) payload.banco_id = ctx.banco_id_resolved;
  if (ctx.categoria_id_resolved) payload.categoria_id = ctx.categoria_id_resolved;
  if (ctx.recorrencia_id) payload.recorrencia_id = ctx.recorrencia_id;
  if (ctx.contrato_id) payload.contrato_id = ctx.contrato_id;
  if (ctx.parcela_atual) payload.parcela_atual = ctx.parcela_atual;
  if (ctx.parcela_total) payload.parcela_total = ctx.parcela_total;

  return payload;
}

/**
 * Map agent context → confirmation message for Telegram
 */
export function contextToConfirmationMessage(ctx: AgentContext): string {
  const fmtDate = (d: string) => {
    const [y, m, dd] = d.split("-");
    return `${dd}/${m}/${y}`;
  };

  let msg = `📋 Vou cadastrar:\n\n`;
  msg += `📝 ${ctx.descricao}\n`;
  msg += `💰 R$ ${Number(ctx.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
  msg += `📅 ${ctx.data_vencimento ? fmtDate(ctx.data_vencimento) : "Hoje"}\n`;
  msg += `📊 Status: ${ctx.status_pagamento === "pago" ? "✅ Pago" : "⏳ Pendente"}\n`;
  msg += `📦 Tipo: ${ctx.categoria_tipo || "avulsa"}\n`;

  if (ctx.categoria_ref) {
    msg += `🏷️ ${ctx.categoria_ref}`;
    if (ctx.subcategoria) msg += ` > ${ctx.subcategoria}`;
    msg += `\n`;
  }

  if (ctx.is_recurrent) {
    msg += `🔄 Recorrente${ctx.is_variable_amount ? " (valor variável)" : ""}\n`;
  }

  if (ctx.cartao_display) {
    msg += `💳 ${ctx.cartao_display}\n`;
  } else if (ctx.banco_display) {
    msg += `🏦 ${ctx.banco_display}\n`;
  } else if (ctx.origem) {
    const labels: Record<string, string> = {
      pix: "PIX",
      cartao: "💳 Cartão",
      boleto: "Boleto",
      dinheiro: "💵 Dinheiro",
    };
    msg += `💳 ${labels[ctx.origem] || ctx.origem}\n`;
  }

  if (ctx.parcela_atual && ctx.parcela_total) {
    msg += `📦 Parcela ${ctx.parcela_atual}/${ctx.parcela_total}\n`;
  }

  msg += `\n✅ Está correto? (sim/não)`;
  return msg;
}

/**
 * Map agent context → success message after transaction created
 */
export function contextToSuccessMessage(
  ctx: AgentContext,
  hasFile: boolean
): string {
  const fmtDate = (d: string) => {
    const [y, m, dd] = d.split("-");
    return `${dd}/${m}/${y}`;
  };

  let msg = `✅ Cadastrado!\n\n`;
  msg += `📝 ${ctx.descricao}\n`;
  msg += `💰 R$ ${Number(ctx.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
  msg += `📅 ${ctx.data_vencimento ? fmtDate(ctx.data_vencimento) : "Hoje"}\n`;
  msg += `📊 ${ctx.status_pagamento === "pago" ? "✅ Pago" : "⏳ Pendente"}`;

  if (ctx.categoria_ref) {
    msg += `\n🏷️ ${ctx.categoria_ref}`;
    if (ctx.subcategoria) msg += ` > ${ctx.subcategoria}`;
  }

  if (ctx.cartao_display) msg += `\n💳 ${ctx.cartao_display}`;
  else if (ctx.banco_display) msg += `\n🏦 ${ctx.banco_display}`;

  if (!hasFile) {
    msg += `\n\n📎 Envie o comprovante agora para vincular.`;
  } else {
    msg += `\n📎 Comprovante anexado!`;
  }

  return msg;
}

/**
 * Create a fresh, empty AgentContext
 */
export function createEmptyContext(): AgentContext {
  return {
    step: "extraction",
    descricao: null,
    valor: null,
    data_vencimento: null,
    data_pagamento: null,
    status_pagamento: null,
    categoria_ref: null,
    subcategoria: null,
    origem: null,
    cartao_ref: null,
    banco_ref: null,
    categoria_id_resolved: null,
    cartao_id_resolved: null,
    cartao_display: null,
    banco_id_resolved: null,
    banco_display: null,
    recorrencia_id: null,
    contrato_id: null,
    parcela_atual: null,
    parcela_total: null,
    categoria_tipo: "avulsa",
    is_recurrent: false,
    is_variable_amount: false,
  };
}
