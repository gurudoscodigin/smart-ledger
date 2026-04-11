// ═══════════════════════════════════════════════════════════════
// FINANCIAL AGENT — COMMAND HANDLERS
// ═══════════════════════════════════════════════════════════════

import { sendTelegram, jsonResponse } from "./telegram.ts";
import { extractCardData, extractRecurrenceData, extractTransactionData } from "./ai.ts";
import {
  classifyByKeywords, extractValue, extractDate, detectStatus,
  extractCardRef, extractBankRef, resolveBank, resolveCard,
  resolveCategory, getUserCategories,
} from "./services.ts";
import type { AgentContext } from "./types.ts";

export async function handleCommand(
  text: string,
  chatId: number,
  userId: string,
  userRole: string,
  update: any,
  supabase: any,
  lovableKey: string,
  telegramKey: string,
  openaiKey: string,
  // Callback to enter the conversational flow
  enterFlow: (ctx: AgentContext, chatId: number, userId: string, update: any) => Promise<Response>
): Promise<Response> {
  const [cmd, ...args] = text.split(" ");
  const argStr = args.join(" ").trim();

  switch (cmd.toLowerCase()) {
    case "/resumo": {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

      const { data: txs } = await supabase.from("transacoes").select("valor, status").eq("user_id", userId).is("deleted_at", null).gte("data_vencimento", startDate).lt("data_vencimento", endDate);
      const pago = (txs || []).filter((t: any) => t.status === "pago").reduce((s: number, t: any) => s + Number(t.valor), 0);
      const pendente = (txs || []).filter((t: any) => t.status === "pendente").reduce((s: number, t: any) => s + Number(t.valor), 0);
      const atrasado = (txs || []).filter((t: any) => t.status === "atrasado").reduce((s: number, t: any) => s + Number(t.valor), 0);
      const { data: bancos } = await supabase.from("bancos").select("saldo_atual").eq("user_id", userId);
      const saldo = (bancos || []).reduce((s: number, b: any) => s + Number(b.saldo_atual), 0);

      await sendTelegram(chatId,
        `📊 Resumo do Mês\n\n💳 Saldo: R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n✅ Pago: R$ ${pago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n⏳ Pendente: R$ ${pendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n🔴 Atrasado: R$ ${atrasado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n📈 A pagar: R$ ${(pendente + atrasado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        lovableKey, telegramKey);
      break;
    }

    case "/pendencias": {
      const { data: pending } = await supabase.from("transacoes").select("id, descricao, valor, data_vencimento, status").eq("user_id", userId).is("deleted_at", null).in("status", ["pendente", "atrasado"]).order("data_vencimento").limit(15);
      if (!pending?.length) { await sendTelegram(chatId, "🎉 Nenhuma pendência!", lovableKey, telegramKey); break; }
      const txIds = pending.map((t: any) => t.id);
      const { data: comps } = await supabase.from("comprovantes").select("transacao_id").in("transacao_id", txIds);
      const compSet = new Set((comps || []).map((c: any) => c.transacao_id));
      let msg = "📋 Pendências\n\n";
      for (const tx of pending) {
        const [y, m, d] = tx.data_vencimento.split("-");
        msg += `${tx.status === "atrasado" ? "🔴" : "⏳"} ${d}/${m}/${y} - ${tx.descricao} - R$ ${Number(tx.valor).toFixed(2)} ${compSet.has(tx.id) ? "📎" : "❌"}\n`;
      }
      msg += `\n❌ = sem comprovante | 📎 = com`;
      await sendTelegram(chatId, msg, lovableKey, telegramKey);
      break;
    }

    case "/limite": {
      const { data: cartoes } = await supabase.from("cartoes").select("id, apelido, final_cartao, limite_total, bandeira").eq("user_id", userId).is("deleted_at", null);
      if (!cartoes?.length) { await sendTelegram(chatId, "💳 Nenhum cartão cadastrado.", lovableKey, telegramKey); break; }
      let msg = "💳 Limites\n\n";
      for (const c of cartoes) {
        const { data: txs } = await supabase.from("transacoes").select("valor").eq("cartao_id", c.id).is("deleted_at", null).in("status", ["pendente", "atrasado"]);
        const used = (txs || []).reduce((s: number, t: any) => s + Number(t.valor), 0);
        const disponivel = Number(c.limite_total) - used;
        const pct = Number(c.limite_total) > 0 ? Math.round((disponivel / Number(c.limite_total)) * 100) : 0;
        msg += `${c.apelido} (${c.final_cartao})\nR$ ${disponivel.toFixed(2)} / R$ ${Number(c.limite_total).toFixed(2)} (${pct}%)\n\n`;
      }
      await sendTelegram(chatId, msg, lovableKey, telegramKey);
      break;
    }

    case "/pix": {
      if (!argStr) { await sendTelegram(chatId, "Use: /pix [fornecedor]", lovableKey, telegramKey); break; }
      const { data: forn } = await supabase.from("fornecedores").select("nome, chave_pix, cnpj").eq("user_id", userId).ilike("nome", `%${argStr}%`).limit(3);
      if (!forn?.length) { await sendTelegram(chatId, `❌ "${argStr}" não encontrado.`, lovableKey, telegramKey); break; }
      let msg = "";
      for (const f of forn) { msg += `🏢 ${f.nome}\n${f.chave_pix ? `🔑 PIX: ${f.chave_pix}\n` : ""}${f.cnpj ? `CNPJ: ${f.cnpj}\n` : ""}\n`; }
      await sendTelegram(chatId, msg, lovableKey, telegramKey);
      break;
    }

    case "/buscar": {
      if (!argStr) { await sendTelegram(chatId, "Use: /buscar [termo]", lovableKey, telegramKey); break; }
      const { data: results } = await supabase.from("transacoes").select("descricao, valor, data_vencimento, status").eq("user_id", userId).is("deleted_at", null).ilike("descricao", `%${argStr}%`).order("data_vencimento", { ascending: false }).limit(10);
      if (!results?.length) { await sendTelegram(chatId, `🔍 Nenhum resultado para "${argStr}".`, lovableKey, telegramKey); break; }
      let msg = `🔍 "${argStr}"\n\n`;
      for (const r of results) { const [y,m,d] = r.data_vencimento.split("-"); msg += `${r.status === "pago" ? "✅" : r.status === "atrasado" ? "🔴" : "⏳"} ${d}/${m}/${y} - ${r.descricao} - R$ ${Number(r.valor).toFixed(2)}\n`; }
      await sendTelegram(chatId, msg, lovableKey, telegramKey);
      break;
    }

    case "/alterar_limite": {
      if (userRole !== "admin") { await sendTelegram(chatId, "⛔ Sem permissão.", lovableKey, telegramKey); break; }
      const parts = argStr.split(" ");
      const newLimit = Number(parts.pop());
      const cardName = parts.join(" ");
      if (!cardName || isNaN(newLimit)) { await sendTelegram(chatId, "Use: /alterar_limite [cartão] [valor]", lovableKey, telegramKey); break; }
      const { data: card } = await supabase.from("cartoes").select("id, limite_total, limite_disponivel").eq("user_id", userId).ilike("apelido", `%${cardName}%`).single();
      if (!card) { await sendTelegram(chatId, `❌ "${cardName}" não encontrado.`, lovableKey, telegramKey); break; }
      const diff = newLimit - card.limite_total;
      await supabase.from("cartoes").update({ limite_total: newLimit, limite_disponivel: card.limite_disponivel + diff }).eq("id", card.id);
      await sendTelegram(chatId, `✅ Limite atualizado: R$ ${newLimit.toFixed(2)}`, lovableKey, telegramKey);
      break;
    }

    case "/novo_banco": {
      if (!argStr) { await sendTelegram(chatId, "Use: /novo_banco [nome] [saldo]\nEx: /novo_banco Nubank 5000", lovableKey, telegramKey); break; }
      const bankParts = argStr.split(" ");
      const saldoStr = bankParts.pop();
      const saldo = Number(saldoStr);
      const bankName = !isNaN(saldo) && bankParts.length > 0 ? bankParts.join(" ") : argStr;
      const bankSaldo = !isNaN(saldo) && bankParts.length > 0 ? saldo : 0;
      const { data: newBank, error: bankErr } = await supabase.from("bancos").insert({ nome: bankName, saldo_atual: bankSaldo, user_id: userId }).select("nome, saldo_atual").single();
      if (bankErr) { await sendTelegram(chatId, `❌ ${bankErr.message}`, lovableKey, telegramKey); }
      else { await sendTelegram(chatId, `🏦 Cadastrado: ${newBank.nome} | R$ ${Number(newBank.saldo_atual).toFixed(2)}`, lovableKey, telegramKey); }
      break;
    }

    case "/novo_cartao": {
      if (!argStr) { await sendTelegram(chatId, "Use: /novo_cartao [dados]\nEx: /novo_cartao Roxinho final 4523 Visa crédito Nubank limite 8000 fecha dia 3 vence dia 10", lovableKey, telegramKey); break; }
      const cardExtraction = await extractCardData(argStr, openaiKey);
      if (!cardExtraction || cardExtraction.status === "incomplete") { await sendTelegram(chatId, `❓ ${cardExtraction?.missing || "Informe todos os dados."}`, lovableKey, telegramKey); break; }
      let bancoId: string | null = null;
      if (cardExtraction.banco_ref) {
        const bank = await resolveBank(supabase, userId, cardExtraction.banco_ref);
        if (bank) bancoId = bank.id;
      }
      const { data: newCard, error: cardErr } = await supabase.from("cartoes").insert({
        apelido: cardExtraction.apelido, final_cartao: cardExtraction.final_cartao,
        bandeira: cardExtraction.bandeira, tipo_funcao: cardExtraction.tipo_funcao,
        formato: cardExtraction.formato || "fisico",
        limite_total: cardExtraction.limite_total || 0, limite_disponivel: cardExtraction.limite_total || 0,
        dia_fechamento: cardExtraction.dia_fechamento, dia_vencimento: cardExtraction.dia_vencimento,
        data_validade: cardExtraction.data_validade || null,
        banco_id: bancoId, user_id: userId,
      }).select("apelido, final_cartao, bandeira").single();
      if (cardErr) { await sendTelegram(chatId, `❌ ${cardErr.message}`, lovableKey, telegramKey); }
      else { await sendTelegram(chatId, `💳 ${newCard.apelido} (${newCard.final_cartao}) ${newCard.bandeira} cadastrado!`, lovableKey, telegramKey); }
      break;
    }

    case "/nova_conta": {
      if (!argStr) { await sendTelegram(chatId, "Use: /nova_conta [dados]\nOu escreva em linguagem natural!", lovableKey, telegramKey); break; }
      const kwClass = classifyByKeywords(argStr);
      const localVal = extractValue(argStr);
      const localDt = extractDate(argStr);
      const localSt = detectStatus(argStr);
      const txExtraction = await extractTransactionData(argStr, userId, supabase, openaiKey);
      if (!txExtraction || txExtraction.status === "not_financial") { await sendTelegram(chatId, "❌ Não entendi. Tente novamente.", lovableKey, telegramKey); break; }

      const ctx: AgentContext = {
        step: "ask_status",
        descricao: txExtraction.descricao || argStr.substring(0, 100),
        valor: localVal || txExtraction.valor || null,
        data_vencimento: localDt || txExtraction.data_vencimento || new Date().toISOString().split("T")[0],
        data_pagamento: null,
        status_pagamento: localSt || txExtraction.status_pagamento || null,
        categoria_ref: kwClass?.categoria || txExtraction.categoria_ref || null,
        subcategoria: kwClass?.subcategoria || txExtraction.subcategoria || null,
        origem: (txExtraction.origem as any) || null,
        cartao_ref: extractCardRef(argStr) || txExtraction.cartao_ref || null,
        banco_ref: extractBankRef(argStr) || txExtraction.banco_ref || null,
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

      if (ctx.categoria_ref) {
        const cat = await resolveCategory(supabase, userId, ctx.categoria_ref);
        if (cat) ctx.categoria_id_resolved = cat.id;
      }

      if (!ctx.valor) {
        const contextToStore = { step: "extraction" as const, descricao: ctx.descricao, missing_question: "Qual o valor?" };
        await supabase.from("telegram_messages").update({ pending_context: contextToStore }).eq("update_id", update.update_id);
        await sendTelegram(chatId, `📝 ${ctx.descricao}\n\n❓ Qual o valor?`, lovableKey, telegramKey);
        break;
      }

      return await enterFlow(ctx, chatId, userId, update);
    }

    case "/relatorio": {
      let rMonth: number, rYear: number;
      if (argStr) {
        const rParts = argStr.split(/[\s\/\-]+/);
        rMonth = Number(rParts[0]);
        rYear = rParts[1] ? Number(rParts[1]) : new Date().getFullYear();
      } else {
        rMonth = new Date().getMonth() + 1;
        rYear = new Date().getFullYear();
      }
      if (isNaN(rMonth) || rMonth < 1 || rMonth > 12) { await sendTelegram(chatId, "Use: /relatorio [mês] [ano]", lovableKey, telegramKey); break; }
      const rStart = `${rYear}-${String(rMonth).padStart(2, "0")}-01`;
      const rEnd = rMonth === 12 ? `${rYear + 1}-01-01` : `${rYear}-${String(rMonth + 1).padStart(2, "0")}-01`;
      const { data: rTxs } = await supabase.from("transacoes").select("descricao, valor, status, categoria_tipo, categorias(nome)").eq("user_id", userId).is("deleted_at", null).gte("data_vencimento", rStart).lt("data_vencimento", rEnd).order("data_vencimento");
      if (!rTxs?.length) { await sendTelegram(chatId, `📊 Nenhuma transação em ${String(rMonth).padStart(2, "0")}/${rYear}.`, lovableKey, telegramKey); break; }
      const pago = rTxs.filter((t: any) => t.status === "pago").reduce((s: number, t: any) => s + Number(t.valor), 0);
      const pendente = rTxs.filter((t: any) => t.status === "pendente").reduce((s: number, t: any) => s + Number(t.valor), 0);
      const atrasado = rTxs.filter((t: any) => t.status === "atrasado").reduce((s: number, t: any) => s + Number(t.valor), 0);
      const total = pago + pendente + atrasado;
      const byCat: Record<string, number> = {};
      for (const t of rTxs) {
        const catName = (t as any).categorias?.nome || "Sem categoria";
        byCat[catName] = (byCat[catName] || 0) + Number(t.valor);
      }
      const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      let msg = `📊 ${meses[rMonth - 1]}/${rYear}\n\n💰 Total: R$ ${total.toFixed(2)}\n✅ Pago: R$ ${pago.toFixed(2)}\n⏳ Pendente: R$ ${pendente.toFixed(2)}\n🔴 Atrasado: R$ ${atrasado.toFixed(2)}\n\nPor categoria:\n`;
      for (const [cat, val] of Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
        msg += `• ${cat}: R$ ${val.toFixed(2)} (${Math.round((val / total) * 100)}%)\n`;
      }
      await sendTelegram(chatId, msg, lovableKey, telegramKey);
      break;
    }

    case "/anexar": {
      if (!argStr) { await sendTelegram(chatId, "Use: /anexar [descrição]\nDepois envie o arquivo.", lovableKey, telegramKey); break; }
      const { data: matchTxs } = await supabase.from("transacoes").select("id, descricao, valor, data_vencimento").eq("user_id", userId).is("deleted_at", null).ilike("descricao", `%${argStr}%`).order("data_vencimento", { ascending: false }).limit(5);
      if (!matchTxs?.length) { await sendTelegram(chatId, `❌ Nenhuma transação com "${argStr}".`, lovableKey, telegramKey); break; }
      await supabase.from("telegram_messages").update({ pending_context: { last_transaction_id: matchTxs[0].id } }).eq("update_id", update.update_id);
      let msg = `📎 Encontrei:\n\n`;
      for (const t of matchTxs) { const [y,m,d] = t.data_vencimento.split("-"); msg += `• ${t.descricao} - R$ ${Number(t.valor).toFixed(2)} (${d}/${m}/${y})\n`; }
      msg += `\nEnvie o comprovante agora.`;
      await sendTelegram(chatId, msg, lovableKey, telegramKey);
      break;
    }

    case "/nova_recorrencia": {
      if (!argStr) { await sendTelegram(chatId, "Use: /nova_recorrencia [dados]\nEx: /nova_recorrencia Internet Vivo R$ 130 vence dia 15 fixa boleto", lovableKey, telegramKey); break; }
      const recExtraction = await extractRecurrenceData(argStr, openaiKey);
      if (!recExtraction || recExtraction.status === "incomplete") { await sendTelegram(chatId, `❓ ${recExtraction?.missing || "Informe nome, valor e dia."}`, lovableKey, telegramKey); break; }
      const recData: any = {
        nome: recExtraction.nome, valor_estimado: recExtraction.valor_estimado || 0,
        dia_vencimento_padrao: recExtraction.dia_vencimento,
        eh_variavel: recExtraction.eh_variavel || false,
        origem: recExtraction.origem || null, user_id: userId,
      };
      if (recExtraction.banco_ref) {
        const bank = await resolveBank(supabase, userId, recExtraction.banco_ref);
        if (bank) recData.banco_id = bank.id;
      }
      if (recExtraction.cartao_ref) {
        const card = await resolveCard(supabase, userId, recExtraction.cartao_ref);
        if (card) recData.cartao_id = card.id;
      }
      if (recExtraction.categoria_ref) {
        const cat = await resolveCategory(supabase, userId, recExtraction.categoria_ref);
        if (cat) recData.categoria_id = cat.id;
      }
      const { error: recErr } = await supabase.from("recorrencias_fixas").insert(recData);
      if (recErr) { await sendTelegram(chatId, `❌ ${recErr.message}`, lovableKey, telegramKey); }
      else { await sendTelegram(chatId, `🔄 Recorrência cadastrada: ${recData.nome} | R$ ${Number(recData.valor_estimado).toFixed(2)} | Dia ${recData.dia_vencimento_padrao}`, lovableKey, telegramKey); }
      break;
    }

    case "/adicionar_saldo": {
      if (!argStr) { await sendTelegram(chatId, "Use: /adicionar_saldo [banco] [valor]\nEx: /adicionar_saldo Nubank 20000", lovableKey, telegramKey); break; }
      const saldoParts = argStr.split(" ");
      const addVal = Number(saldoParts.pop());
      const bName = saldoParts.join(" ");
      if (!bName || isNaN(addVal) || addVal <= 0) { await sendTelegram(chatId, "Use: /adicionar_saldo [banco] [valor]", lovableKey, telegramKey); break; }
      const { data: bk } = await supabase.from("bancos").select("id, nome, saldo_atual").eq("user_id", userId).ilike("nome", `%${bName}%`).single();
      if (!bk) { await sendTelegram(chatId, `❌ Banco "${bName}" não encontrado.`, lovableKey, telegramKey); break; }
      const newSaldo = bk.saldo_atual + addVal;
      await supabase.from("bancos").update({ saldo_atual: newSaldo }).eq("id", bk.id);
      await sendTelegram(chatId, `✅ +R$ ${addVal.toFixed(2)} adicionados ao ${bk.nome}\n💰 Novo saldo: R$ ${newSaldo.toFixed(2)}`, lovableKey, telegramKey);
      break;
    }

    case "/lembretes": {
      const { data: lembs } = await supabase.from("lembretes").select("id, titulo, descricao, data_lembrete")
        .eq("user_id", userId).eq("confirmado", false).order("data_lembrete", { nullsFirst: false });
      if (!lembs?.length) { await sendTelegram(chatId, "✅ Nenhum lembrete aberto!", lovableKey, telegramKey); break; }
      let msg = "📝 Lembretes abertos:\n\n";
      for (const l of lembs) {
        const data = l.data_lembrete ? ` (${l.data_lembrete})` : "";
        msg += `• ${l.titulo}${data}\n`;
        if (l.descricao) msg += `  ${l.descricao}\n`;
      }
      await sendTelegram(chatId, msg, lovableKey, telegramKey);
      break;
    }

    default:
      await sendTelegram(chatId,
        "📋 Comandos:\n\n💰 Cadastro:\n/nova_conta — Nova conta\n/novo_banco — Novo banco\n/novo_cartao — Novo cartão\n/nova_recorrencia — Conta fixa\n/adicionar_saldo — Entrada no banco\n\n📊 Consultas:\n/resumo — Gastos do mês\n/relatorio — Relatório mensal\n/pendencias — Pendentes\n/limite — Limites\n/buscar — Buscar\n/pix — Dados PIX\n/anexar — Comprovante\n/lembretes — Lembretes\n\n⚙️ Admin:\n/alterar_limite",
        lovableKey, telegramKey);
  }

  return jsonResponse({ ok: true });
}
