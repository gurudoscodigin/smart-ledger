// ═══════════════════════════════════════════════════════════════
// FINANCIAL AGENT — ORCHESTRATOR (Main Flow Control)
// ═══════════════════════════════════════════════════════════════

import { sendTelegram, jsonResponse, downloadTelegramFile, GATEWAY_URL } from "./telegram.ts";
import { transcribeAudio, extractTransactionData, handleBIQuery } from "./ai.ts";
import {
  removeAccents, extractDate, extractValue, detectStatus,
  extractCardRef, extractBankRef, classifyByKeywords,
  isIntencaoLembrete, detectPaymentMethod, detectVendorCanonical,
  isKnownVariableAccount, requiresSubcategory,
  resolveCategory, resolveCard, resolveBank,
  resolveRecurrence, resolveVendorAlias, resolvePreference,
  getUserCategories, getSubcategories, getUserCards, getUserBanks,
} from "./services.ts";
import { logDecision, saveVendorAlias, savePreference } from "./repositories.ts";
import {
  contextToTransactionPayload, contextToConfirmationMessage,
  contextToSuccessMessage, createEmptyContext,
} from "./mapper.ts";
import { handleCommand } from "./commands.ts";
import type { AgentContext, DecisionBasis } from "./types.ts";

// ═══════════════ MAIN ENTRY POINT ═══════════════

export async function processMessage(
  update: any,
  supabase: any,
  lovableKey: string,
  telegramKey: string,
  openaiKey: string
): Promise<Response> {
  const message = update.message;
  if (!message) return jsonResponse({ ok: true, skipped: true });

  const chatId = message.chat.id;
  const text = message.text ?? "";

  // ─── Resolve user ───
  const telegramId = String(message.from.id);
  let userId: string;
  let _displayName: string | null = null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (profile) {
    userId = profile.user_id;
    _displayName = profile.display_name;
  } else {
    const { data: adminRole } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1)
      .single();
    if (!adminRole) {
      await sendTelegram(chatId, "⛔ Nenhum administrador configurado no sistema.", lovableKey, telegramKey);
      return jsonResponse({ ok: true, denied: true });
    }
    userId = adminRole.user_id;
    const { data: adminProfile } = await supabase.from("profiles").select("display_name").eq("user_id", userId).single();
    _displayName = adminProfile?.display_name || null;
  }

  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();
  const userRole = roleData?.role ?? "assistente";

  // ─── COMMAND ROUTING ───
  if (text.startsWith("/")) {
    await supabase.from("telegram_messages").update({ pending_context: null }).eq("chat_id", chatId).not("pending_context", "is", null);
    return await handleCommand(
      text, chatId, userId, userRole, update, supabase,
      lovableKey, telegramKey, openaiKey,
      (ctx, cId, uId, upd) => enterConversationalFlow(ctx, cId, uId, null, null, upd, supabase, lovableKey, telegramKey)
    );
  }

  // ─── PENDING CONTEXT ───
  const { data: pendingMsg } = await supabase
    .from("telegram_messages")
    .select("pending_context")
    .eq("chat_id", chatId)
    .not("pending_context", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  const pendingContext = pendingMsg?.pending_context as any | null;

  // ─── VOICE → Transcription ───
  let processedText = text;
  if (message.voice || message.audio) {
    const fileId = message.voice?.file_id || message.audio?.file_id;
    processedText = await transcribeAudio(fileId, GATEWAY_URL, lovableKey, telegramKey, openaiKey) || "";
    if (!processedText) {
      await sendTelegram(chatId, "❌ Não consegui transcrever o áudio. Tente enviar como texto.", lovableKey, telegramKey);
      return jsonResponse({ ok: true });
    }
  }

  // ─── PHOTO/DOCUMENT handling ───
  let fileUrl: string | null = null;
  let fileName: string | null = null;
  if (message.photo || message.document) {
    const fileId = message.photo
      ? message.photo[message.photo.length - 1].file_id
      : message.document.file_id;
    fileName = message.document?.file_name || `comprovante_${Date.now()}.jpg`;

    const downloaded = await downloadTelegramFile(fileId, lovableKey, telegramKey);
    if (downloaded) {
      const storagePath = `${userId}/${new Date().toISOString().split("T")[0]}_${fileName}`;
      const { error: uploadErr } = await supabase.storage
        .from("comprovantes")
        .upload(storagePath, downloaded.bytes, {
          contentType: message.document?.mime_type || "image/jpeg",
          upsert: true,
        });
      if (!uploadErr) fileUrl = storagePath;
    }

    if (!processedText && fileUrl) {
      if (pendingContext?.last_transaction_id) {
        await supabase.from("comprovantes").insert({
          transacao_id: pendingContext.last_transaction_id,
          file_path: fileUrl,
          file_name: fileName!,
          file_type: message.document?.mime_type || "image/jpeg",
          uploaded_by: userId,
        });
        await supabase.from("telegram_messages").update({ pending_context: null }).eq("chat_id", chatId).not("pending_context", "is", null);
        const { data: linkedTx } = await supabase.from("transacoes").select("descricao, valor, data_vencimento").eq("id", pendingContext.last_transaction_id).single();
        const dtStr = linkedTx ? (() => { const [y,m,d] = linkedTx.data_vencimento.split("-"); return `${d}/${m}/${y}`; })() : "";
        await sendTelegram(chatId, `📎 Comprovante vinculado à conta:\n${linkedTx?.descricao || "?"} - R$ ${Number(linkedTx?.valor || 0).toFixed(2)} (${dtStr})`, lovableKey, telegramKey);
        return jsonResponse({ ok: true });
      }
      return await handleOrphanFile(chatId, userId, fileUrl, fileName!, supabase, lovableKey, telegramKey);
    }
  }

  // ─── PENDING CONTEXT ───
  if (pendingContext) {
    return await handlePendingContext(pendingContext, processedText, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey, openaiKey);
  }

  // ─── REMINDER DETECTION ───
  if (isIntencaoLembrete(processedText)) {
    const titulo = processedText
      .replace(/me lembra(r)? de?|lembrete:?|me avisa(r)?|n[aã]o esquecer de?/gi, '')
      .trim().substring(0, 200);
    const dataLembrete = extractDate(processedText);
    await supabase.from('lembretes').insert({
      user_id: userId, titulo: titulo || processedText.substring(0, 200),
      data_lembrete: dataLembrete || null, confirmado: false,
    });
    const dtStr = dataLembrete ? ` para ${dataLembrete.split('-').reverse().join('/')}` : '';
    await sendTelegram(chatId, `📝 Lembrete criado: ${titulo || processedText.substring(0, 100)}${dtStr}`, lovableKey, telegramKey);
    return jsonResponse({ ok: true });
  }

  // ═══════════════ SMART EXTRACTION FLOW ═══════════════
  // Priority: 1) Explicit correction 2) Recurrence 3) Vendor alias 4) Learned rule 5) Inference 6) Ask

  // 1. Local parsing
  const kwClassification = classifyByKeywords(processedText);
  const localStatus = detectStatus(processedText);
  const localDate = extractDate(processedText);
  const localValue = extractValue(processedText);
  const localCardRef = extractCardRef(processedText);
  const localBankRef = extractBankRef(processedText);

  // 2. Check for known vendor (canonical rules)
  const vendorCanonical = detectVendorCanonical(processedText);

  // 3. Check recurrence in DB
  const descForRecurrence = vendorCanonical?.canonical || processedText.substring(0, 50);
  const recurrence = await resolveRecurrence(supabase, userId, descForRecurrence);

  // 4. Check vendor alias in agent memory
  const vendorAlias = await resolveVendorAlias(supabase, userId, processedText);

  // 5. Check preferences
  const preference = await resolvePreference(supabase, userId, descForRecurrence);

  // 6. AI extraction
  const extraction = await extractTransactionData(processedText, userId, supabase, openaiKey);

  if (!extraction || extraction.status === "not_financial") {
    const answer = await handleBIQuery(processedText, userId, supabase, openaiKey);
    await sendTelegram(chatId, answer, lovableKey, telegramKey);
    return jsonResponse({ ok: true });
  }

  if (extraction.status === "incomplete" && !extraction.valor && !localValue) {
    const contextToStore = {
      step: "extraction" as const,
      descricao: extraction.descricao || null,
      valor: localValue || extraction.valor || null,
      data_vencimento: localDate || extraction.data_vencimento || null,
      missing_question: extraction.missing_question,
    };
    await supabase.from("telegram_messages").update({ pending_context: contextToStore }).eq("update_id", update.update_id);
    await sendTelegram(chatId, `📝 ${contextToStore.descricao || "?"}\n\n❓ ${extraction.missing_question}`, lovableKey, telegramKey);
    return jsonResponse({ ok: true, incomplete: true });
  }

  // ─── Build context merging all sources (priority order) ───
  let decisionBasis: DecisionBasis = "inference";

  const ctx: AgentContext = createEmptyContext();
  ctx.step = "confirm";
  ctx.descricao = extraction.descricao || processedText.substring(0, 100);
  ctx.valor = localValue || extraction.valor || null;
  ctx.data_vencimento = localDate || extraction.data_vencimento || new Date().toISOString().split("T")[0];
  ctx.status_pagamento = localStatus || extraction.status_pagamento || null;

  // Apply vendor canonical rules (priority 3: vendor alias)
  if (vendorCanonical) {
    ctx.categoria_ref = vendorCanonical.categoria;
    ctx.categoria_tipo = vendorCanonical.tipo;
    ctx.is_variable_amount = vendorCanonical.is_variable;
    if (vendorCanonical.person && vendorCanonical.canonical) {
      ctx.descricao = `${vendorCanonical.canonical} do ${vendorCanonical.person}`;
    }
    decisionBasis = "vendor_alias";
  }

  // Apply recurrence (priority 2)
  if (recurrence) {
    ctx.recorrencia_id = recurrence.id;
    ctx.is_recurrent = true;
    ctx.is_variable_amount = recurrence.eh_variavel;
    ctx.categoria_tipo = recurrence.eh_variavel ? "variavel" : "fixa";
    if (recurrence.categoria_id) ctx.categoria_id_resolved = recurrence.categoria_id;
    if (recurrence.cartao_id) ctx.cartao_id_resolved = recurrence.cartao_id;
    if (recurrence.banco_id) ctx.banco_id_resolved = recurrence.banco_id;
    if (recurrence.origem) ctx.origem = recurrence.origem as any;
    if (recurrence.subcategoria) ctx.subcategoria = recurrence.subcategoria;
    decisionBasis = "recurrence";
  }

  // Apply vendor alias from agent memory (priority 3)
  if (vendorAlias && !recurrence) {
    if (vendorAlias.categoria_id) ctx.categoria_id_resolved = vendorAlias.categoria_id;
    if (vendorAlias.subcategoria) ctx.subcategoria = vendorAlias.subcategoria;
    if (vendorAlias.cartao_id) ctx.cartao_id_resolved = vendorAlias.cartao_id;
    if (vendorAlias.banco_id) ctx.banco_id_resolved = vendorAlias.banco_id;
    if (vendorAlias.origem) ctx.origem = vendorAlias.origem as any;
    if (vendorAlias.categoria_tipo) ctx.categoria_tipo = vendorAlias.categoria_tipo as any;
    ctx.is_recurrent = vendorAlias.is_recurrent;
    ctx.is_variable_amount = vendorAlias.is_variable;
    decisionBasis = "vendor_alias";
  }

  // Apply preference (priority 4: learned rule)
  if (preference && !ctx.cartao_id_resolved && !ctx.banco_id_resolved) {
    if (preference.cartao_id) ctx.cartao_id_resolved = preference.cartao_id;
    if (preference.banco_id) ctx.banco_id_resolved = preference.banco_id;
    if (preference.origem) ctx.origem = preference.origem as any;
    if (preference.categoria_id && !ctx.categoria_id_resolved) ctx.categoria_id_resolved = preference.categoria_id;
    if (decisionBasis === "inference") decisionBasis = "learned_rule";
  }

  // Apply keyword classification (priority 5: inference)
  if (!ctx.categoria_ref && kwClassification) {
    ctx.categoria_ref = kwClassification.categoria;
    if (kwClassification.subcategoria) ctx.subcategoria = kwClassification.subcategoria;
  }
  if (!ctx.categoria_ref && extraction.categoria_ref) {
    ctx.categoria_ref = extraction.categoria_ref;
  }
  if (!ctx.subcategoria && extraction.subcategoria) {
    ctx.subcategoria = extraction.subcategoria;
  }

  // Apply card/bank refs
  ctx.cartao_ref = localCardRef || extraction.cartao_ref || null;
  ctx.banco_ref = localBankRef || extraction.banco_ref || null;
  if (!ctx.origem) {
    ctx.origem = (extraction.origem as any) || (ctx.cartao_ref ? "cartao" : null);
  }

  // Check if known variable account
  if (isKnownVariableAccount(ctx.descricao || "")) {
    ctx.is_variable_amount = true;
    if (ctx.categoria_tipo === "avulsa") ctx.categoria_tipo = "variavel";
  }

  // Resolve category ID
  if (ctx.categoria_ref && !ctx.categoria_id_resolved) {
    const cat = await resolveCategory(supabase, userId, ctx.categoria_ref);
    if (cat) ctx.categoria_id_resolved = cat.id;
  }

  // Resolve card
  if (ctx.cartao_ref && !ctx.cartao_id_resolved) {
    const card = await resolveCard(supabase, userId, ctx.cartao_ref);
    if (card) {
      ctx.cartao_id_resolved = card.id;
      ctx.cartao_display = `${card.apelido} (${card.final_cartao})`;
      ctx.banco_id_resolved = card.banco_id;
      ctx.origem = "cartao";
    }
  }

  // Resolve bank
  if (ctx.banco_ref && !ctx.banco_id_resolved) {
    const bank = await resolveBank(supabase, userId, ctx.banco_ref);
    if (bank) {
      ctx.banco_id_resolved = bank.id;
      ctx.banco_display = bank.nome;
    }
  }

  // Resolve card display if we have ID but no display
  if (ctx.cartao_id_resolved && !ctx.cartao_display) {
    const { data: cardData } = await supabase.from("cartoes").select("apelido, final_cartao").eq("id", ctx.cartao_id_resolved).single();
    if (cardData) ctx.cartao_display = `${cardData.apelido} (${cardData.final_cartao})`;
  }

  // Resolve bank display
  if (ctx.banco_id_resolved && !ctx.banco_display) {
    const { data: bankData } = await supabase.from("bancos").select("nome").eq("id", ctx.banco_id_resolved).single();
    if (bankData) ctx.banco_display = bankData.nome;
  }

  // Resolve category name if we have ID
  if (ctx.categoria_id_resolved && !ctx.categoria_ref) {
    const { data: catData } = await supabase.from("categorias").select("nome").eq("id", ctx.categoria_id_resolved).single();
    if (catData) ctx.categoria_ref = catData.nome;
  }

  // ─── Log decision ───
  await logDecision(supabase, {
    user_id: userId,
    message_text: processedText,
    intent: "create_one_time_account",
    vendor_detected: vendorCanonical?.canonical || vendorAlias?.canonical_name || null,
    categoria_suggested: ctx.categoria_ref,
    subcategoria_suggested: ctx.subcategoria,
    recurrence_used: recurrence?.nome || null,
    payment_source: ctx.cartao_display || ctx.banco_display || ctx.origem,
    confidence_level: recurrence ? 95 : vendorAlias ? 85 : preference ? 75 : 50,
    decision_basis: decisionBasis,
    user_correction: false,
    confirmed: false,
  });

  // ─── Check what's missing ───
  return await enterConversationalFlow(ctx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
}

// ═══════════════ CONVERSATIONAL FLOW ═══════════════

async function enterConversationalFlow(
  ctx: AgentContext,
  chatId: number,
  userId: string,
  fileUrl: string | null,
  fileName: string | null,
  update: any,
  supabase: any,
  lovableKey: string,
  telegramKey: string
): Promise<Response> {
  const missing: string[] = [];
  if (!ctx.status_pagamento) missing.push("status");
  if (!ctx.cartao_id_resolved && !ctx.banco_id_resolved && !ctx.origem) missing.push("pagamento");
  if (!ctx.categoria_ref) missing.push("categoria");

  if (missing.length === 0) {
    ctx.step = "confirm";
    await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("chat_id", chatId).not("pending_context", "is", null);
    if (!update?.update_id) {
      await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("chat_id", chatId).not("pending_context", "is", null);
    } else {
      await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("update_id", update.update_id);
    }
    const msg = contextToConfirmationMessage(ctx);
    await sendTelegram(chatId, msg, lovableKey, telegramKey);
    return jsonResponse({ ok: true });
  }

  const nextMissing = missing[0];
  if (nextMissing === "status") {
    ctx.step = "ask_status";
    await savePendingContext(supabase, chatId, update, ctx);
    await sendTelegram(chatId, `📝 Entendi: "${ctx.descricao}" por R$ ${Number(ctx.valor).toFixed(2)}.\n\n❓ Essa conta já foi paga ou ainda está pendente?`, lovableKey, telegramKey);
  } else if (nextMissing === "pagamento") {
    ctx.step = "ask_pagamento";
    await savePendingContext(supabase, chatId, update, ctx);
    await sendTelegram(chatId, `📝 "${ctx.descricao}" por R$ ${Number(ctx.valor).toFixed(2)}.\n\n❓ Essa despesa foi no cartão ou debitou direto da conta? Se cartão, qual?`, lovableKey, telegramKey);
  } else if (nextMissing === "categoria") {
    ctx.step = "ask_categoria";
    await savePendingContext(supabase, chatId, update, ctx);
    const cats = await getUserCategories(supabase, userId);
    const catList = cats.map((c, i) => `${i + 1}. ${c.nome}`).join("\n");
    await sendTelegram(chatId, `📝 "${ctx.descricao}" por R$ ${Number(ctx.valor).toFixed(2)}.\n\n🏷️ Qual a categoria?\n\n${catList}`, lovableKey, telegramKey);
  }

  return jsonResponse({ ok: true });
}

// ═══════════════ PENDING CONTEXT HANDLER ═══════════════

async function handlePendingContext(
  pendingContext: any,
  processedText: string,
  chatId: number,
  userId: string,
  fileUrl: string | null,
  fileName: string | null,
  update: any,
  supabase: any,
  lovableKey: string,
  telegramKey: string,
  openaiKey: string
): Promise<Response> {
  const step = pendingContext.step || "extraction";
  const ctx = { ...pendingContext } as AgentContext;

  if (step === "ask_status") {
    const status = detectStatus(processedText);
    if (status) {
      ctx.status_pagamento = status;
    } else if (/sim|pag|ja/i.test(removeAccents(processedText.toLowerCase()))) {
      ctx.status_pagamento = "pago";
    } else {
      ctx.status_pagamento = "pendente";
    }
    return await enterConversationalFlow(ctx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
  }

  if (step === "ask_pagamento") {
    const lower = removeAccents(processedText.toLowerCase().trim());
    if (/pix/i.test(lower)) {
      ctx.origem = "pix";
      ctx.step = "ask_banco_pix";
      await savePendingContext(supabase, chatId, update, ctx);
      const bancos = await getUserBanks(supabase, userId);
      const bankList = bancos.map((b, i) => `${i + 1}. ${b.nome}`).join("\n");
      await sendTelegram(chatId, `🏦 De qual banco sai o PIX?\n\n${bankList}`, lovableKey, telegramKey);
      return jsonResponse({ ok: true });
    }
    if (/cart[aã]o/i.test(lower) || /final\s*\d{4}/.test(lower)) {
      ctx.origem = "cartao";
      const finalMatch = lower.match(/final\s*(\d{4})/);
      if (finalMatch) {
        const card = await resolveCard(supabase, userId, finalMatch[1]);
        if (card) {
          ctx.cartao_id_resolved = card.id;
          ctx.cartao_display = `${card.apelido} (${card.final_cartao})`;
          ctx.banco_id_resolved = card.banco_id;
          return await enterConversationalFlow(ctx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
        }
      }
      ctx.step = "ask_cartao";
      await savePendingContext(supabase, chatId, update, ctx);
      const cards = await getUserCards(supabase, userId);
      const cardList = cards.map((c, i) => `${i + 1}. ${c.apelido} (${c.final_cartao})`).join("\n");
      await sendTelegram(chatId, `💳 Qual cartão?\n\n${cardList}`, lovableKey, telegramKey);
      return jsonResponse({ ok: true });
    }
    if (/boleto/i.test(lower)) {
      ctx.origem = "boleto";
    } else if (/d[eé]bito/i.test(lower)) {
      await sendTelegram(chatId, "Poderia especificar? A despesa foi no 💳 Cartão, via PIX, em 💵 Dinheiro ou Boleto?", lovableKey, telegramKey);
      return jsonResponse({ ok: true });
    } else if (/dinheiro/i.test(lower)) {
      ctx.origem = "dinheiro";
    } else {
      const matchCard = await resolveCard(supabase, userId, lower);
      if (matchCard) {
        ctx.origem = "cartao";
        ctx.cartao_id_resolved = matchCard.id;
        ctx.cartao_display = `${matchCard.apelido} (${matchCard.final_cartao})`;
        ctx.banco_id_resolved = matchCard.banco_id;
      } else {
        const matchBank = await resolveBank(supabase, userId, lower);
        if (matchBank) {
          ctx.origem = "pix";
          ctx.banco_id_resolved = matchBank.id;
          ctx.banco_display = matchBank.nome;
        } else {
          ctx.origem = lower as any;
        }
      }
    }
    return await enterConversationalFlow(ctx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
  }

  if (step === "ask_banco_pix") {
    const bancos = await getUserBanks(supabase, userId);
    const matched = bancos.find((b, i) =>
      processedText.trim() === String(i + 1) || removeAccents(b.nome.toLowerCase()).includes(removeAccents(processedText.toLowerCase().trim()))
    );
    if (matched) {
      ctx.banco_id_resolved = matched.id;
      ctx.banco_display = matched.nome;
    }
    return await enterConversationalFlow(ctx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
  }

  if (step === "ask_cartao") {
    const cards = await getUserCards(supabase, userId);
    const matched = cards.find((c, i) =>
      processedText.trim() === String(i + 1) || removeAccents(c.apelido.toLowerCase()).includes(removeAccents(processedText.toLowerCase().trim())) || c.final_cartao === processedText.trim()
    );
    if (matched) {
      ctx.cartao_id_resolved = matched.id;
      ctx.cartao_display = `${matched.apelido} (${matched.final_cartao})`;
      ctx.banco_id_resolved = matched.banco_id;
    }
    return await enterConversationalFlow(ctx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
  }

  if (step === "ask_categoria") {
    const cats = await getUserCategories(supabase, userId);
    const matched = cats.find((c, i) =>
      processedText.trim() === String(i + 1) || removeAccents(c.nome.toLowerCase()).includes(removeAccents(processedText.toLowerCase().trim()))
    );
    if (matched) {
      ctx.categoria_ref = matched.nome;
      ctx.categoria_id_resolved = matched.id;

      // Check subcategories
      if (requiresSubcategory(matched.nome)) {
        const subs = await getSubcategories(supabase, matched.id);
        if (subs.length > 0) {
          ctx.step = "ask_subcategoria";
          (ctx as any).available_subs = subs;
          await savePendingContext(supabase, chatId, update, ctx);
          const subList = subs.map((s, i) => `${i + 1}. ${s.nome}`).join("\n");
          await sendTelegram(chatId, `📂 Subcategoria de ${matched.nome}:\n\n${subList}`, lovableKey, telegramKey);
          return jsonResponse({ ok: true });
        }
      }
    }
    return await enterConversationalFlow(ctx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
  }

  if (step === "ask_subcategoria") {
    const subs = (ctx as any).available_subs || [];
    const matched = subs.find((s: any, i: number) =>
      processedText.trim() === String(i + 1) || removeAccents(s.nome.toLowerCase()).includes(removeAccents(processedText.toLowerCase().trim()))
    );
    ctx.subcategoria = matched?.nome || processedText.trim();
    return await enterConversationalFlow(ctx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
  }

  if (step === "confirm") {
    const lower = removeAccents(processedText.toLowerCase().trim());
    if (/sim|ok|isso|pode|confirma|certo|correto/i.test(lower)) {
      return await finalizeTransaction(chatId, userId, ctx, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
    }
    if (/n[aã]o|errado|cancela/i.test(lower)) {
      await supabase.from("telegram_messages").update({ pending_context: null }).eq("chat_id", chatId).not("pending_context", "is", null);
      await sendTelegram(chatId, "❌ Cancelado. Envie os dados novamente.", lovableKey, telegramKey);
      return jsonResponse({ ok: true });
    }
    const msg = contextToConfirmationMessage(ctx);
    await sendTelegram(chatId, msg, lovableKey, telegramKey);
    return jsonResponse({ ok: true });
  }

  // Legacy extraction step
  if (step === "extraction") {
    const enrichedText = `Contexto anterior: Descrição="${pendingContext.descricao || ""}", Valor=${pendingContext.valor || "?"}, Data=${pendingContext.data_vencimento || "?"}. Resposta do usuário: "${processedText}". Combine tudo.`;
    await supabase.from("telegram_messages").update({ pending_context: null }).eq("chat_id", chatId).not("pending_context", "is", null);

    const extraction = await extractTransactionData(enrichedText, userId, supabase, openaiKey);
    if (extraction && (extraction.status === "complete" || extraction.valor)) {
      const newCtx = createEmptyContext();
      newCtx.step = "ask_status";
      newCtx.descricao = extraction.descricao || pendingContext.descricao;
      newCtx.valor = extraction.valor || pendingContext.valor || extractValue(processedText);
      newCtx.data_vencimento = extraction.data_vencimento || pendingContext.data_vencimento || new Date().toISOString().split("T")[0];
      newCtx.origem = extraction.origem as any || null;
      newCtx.cartao_ref = extraction.cartao_ref || null;
      newCtx.banco_ref = extraction.banco_ref || null;
      newCtx.categoria_ref = classifyByKeywords(extraction.descricao || pendingContext.descricao || "")?.categoria || extraction.categoria_ref || null;
      newCtx.subcategoria = classifyByKeywords(extraction.descricao || pendingContext.descricao || "")?.subcategoria || extraction.subcategoria || null;
      newCtx.status_pagamento = detectStatus(processedText) || extraction.status_pagamento || null;

      if (newCtx.status_pagamento) {
        return await enterConversationalFlow(newCtx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
      }

      await savePendingContext(supabase, chatId, update, newCtx);
      await sendTelegram(chatId, `📝 "${newCtx.descricao}" por R$ ${Number(newCtx.valor).toFixed(2)}.\n\n❓ Já foi pago ou está pendente?`, lovableKey, telegramKey);
      return jsonResponse({ ok: true });
    }

    if (extraction?.status === "incomplete") {
      const contextToStore = {
        step: "extraction" as const,
        descricao: extraction.descricao || pendingContext.descricao,
        valor: extraction.valor || pendingContext.valor,
        data_vencimento: extraction.data_vencimento || pendingContext.data_vencimento,
        missing_question: extraction.missing_question,
      };
      await supabase.from("telegram_messages").update({ pending_context: contextToStore }).eq("update_id", update.update_id);
      await sendTelegram(chatId, `📝 ${contextToStore.descricao || "?"} - R$ ${contextToStore.valor || "?"}\n\n❓ ${extraction.missing_question}`, lovableKey, telegramKey);
      return jsonResponse({ ok: true, incomplete: true });
    }

    const answer = await handleBIQuery(processedText, userId, supabase, openaiKey);
    await sendTelegram(chatId, answer, lovableKey, telegramKey);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ ok: true });
}

// ═══════════════ FINALIZE TRANSACTION ═══════════════

async function finalizeTransaction(
  chatId: number,
  userId: string,
  ctx: AgentContext,
  fileUrl: string | null,
  fileName: string | null,
  update: any,
  supabase: any,
  lovableKey: string,
  telegramKey: string
): Promise<Response> {
  // Resolve any remaining refs
  if (ctx.cartao_ref && !ctx.cartao_id_resolved) {
    const card = await resolveCard(supabase, userId, ctx.cartao_ref);
    if (card) {
      ctx.cartao_id_resolved = card.id;
      if (card.banco_id) ctx.banco_id_resolved = card.banco_id;
    }
  }
  if (ctx.banco_ref && !ctx.banco_id_resolved) {
    const bank = await resolveBank(supabase, userId, ctx.banco_ref);
    if (bank) ctx.banco_id_resolved = bank.id;
  }
  if (ctx.categoria_ref && !ctx.categoria_id_resolved) {
    const cat = await resolveCategory(supabase, userId, ctx.categoria_ref);
    if (cat) ctx.categoria_id_resolved = cat.id;
  }

  const txData = contextToTransactionPayload(ctx, userId);

  const { data: newTx, error: txErr } = await supabase
    .from("transacoes")
    .insert(txData)
    .select("id")
    .single();

  if (txErr) {
    await sendTelegram(chatId, `❌ Erro ao registrar: ${txErr.message}`, lovableKey, telegramKey);
    return jsonResponse({ ok: false, error: txErr.message });
  }

  // Save preference for future
  if (ctx.descricao && (txData.cartao_id || txData.banco_id)) {
    await savePreference(supabase, userId, ctx.descricao, {
      cartao_id: txData.cartao_id as string || null,
      banco_id: txData.banco_id as string || null,
      origem: txData.origem as string || null,
      categoria_id: txData.categoria_id as string || null,
    });
  }

  // Save vendor alias for agent memory
  if (ctx.descricao) {
    await saveVendorAlias(supabase, userId, ctx.descricao, ctx.descricao, {
      categoria_id: txData.categoria_id as string || null,
      subcategoria: ctx.subcategoria,
      cartao_id: txData.cartao_id as string || null,
      banco_id: txData.banco_id as string || null,
      origem: ctx.origem,
      categoria_tipo: ctx.categoria_tipo,
      is_recurrent: ctx.is_recurrent,
      is_variable: ctx.is_variable_amount,
      confidence: 80,
    });
  }

  // Store last transaction ID for receipt linking
  await supabase.from("telegram_messages").update({
    pending_context: { last_transaction_id: newTx.id },
  }).eq("chat_id", chatId).not("pending_context", "is", null);

  // Link file if present
  if (fileUrl && newTx) {
    await supabase.from("comprovantes").insert({
      transacao_id: newTx.id,
      file_path: fileUrl,
      file_name: fileName!,
      file_type: "image/jpeg",
      uploaded_by: userId,
    });
  }

  // PIX: deduct bank balance
  if (ctx.origem === "pix" && ctx.banco_id_resolved && ctx.status_pagamento === "pago" && ctx.valor) {
    const { data: banco } = await supabase.from("bancos").select("saldo_atual").eq("id", ctx.banco_id_resolved).single();
    if (banco) {
      await supabase.from("bancos").update({ saldo_atual: banco.saldo_atual - ctx.valor }).eq("id", ctx.banco_id_resolved);
    }
  }

  // Log confirmed decision
  await logDecision(supabase, {
    user_id: userId,
    message_text: ctx.descricao || "",
    intent: ctx.is_recurrent ? "create_fixed_account" : "create_one_time_account",
    vendor_detected: ctx.descricao,
    categoria_suggested: ctx.categoria_ref,
    subcategoria_suggested: ctx.subcategoria,
    recurrence_used: ctx.recorrencia_id,
    payment_source: ctx.cartao_display || ctx.banco_display || ctx.origem,
    confidence_level: 100,
    decision_basis: "asked_user",
    user_correction: false,
    confirmed: true,
  });

  const response = contextToSuccessMessage(ctx, !!fileUrl);
  await sendTelegram(chatId, response, lovableKey, telegramKey);
  return jsonResponse({ ok: true, transaction_id: newTx.id });
}

// ═══════════════ ORPHAN FILE HANDLER ═══════════════

async function handleOrphanFile(
  chatId: number,
  userId: string,
  fileUrl: string,
  fileName: string,
  supabase: any,
  lovableKey: string,
  telegramKey: string
): Promise<Response> {
  const { data: pendingTxs } = await supabase.from("transacoes")
    .select("id, descricao, valor, data_vencimento")
    .eq("user_id", userId).is("deleted_at", null)
    .in("status", ["pendente", "pago"])
    .order("data_vencimento", { ascending: false }).limit(20);

  if (!pendingTxs?.length) {
    await sendTelegram(chatId, "📎 Arquivo recebido, mas não encontrei transações.", lovableKey, telegramKey);
    return jsonResponse({ ok: true });
  }

  const txIds = pendingTxs.map((t: any) => t.id);
  const { data: existingComps } = await supabase.from("comprovantes").select("transacao_id").in("transacao_id", txIds);
  const compSet = new Set((existingComps || []).map((c: any) => c.transacao_id));
  const withoutComp = pendingTxs.filter((t: any) => !compSet.has(t.id));

  if (!withoutComp.length) {
    await sendTelegram(chatId, "📎 Todas as transações já possuem comprovante.", lovableKey, telegramKey);
    return jsonResponse({ ok: true });
  }

  const target = withoutComp[0];
  await supabase.from("comprovantes").insert({
    transacao_id: target.id, file_path: fileUrl, file_name: fileName,
    file_type: fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
    uploaded_by: userId,
  });
  const [y, m, d] = target.data_vencimento.split("-");
  await sendTelegram(chatId, `📎 Comprovante vinculado a: ${target.descricao} - R$ ${Number(target.valor).toFixed(2)} (${d}/${m}/${y})`, lovableKey, telegramKey);
  return jsonResponse({ ok: true });
}

// ═══════════════ HELPERS ═══════════════

async function savePendingContext(
  supabase: any,
  chatId: number,
  update: any,
  ctx: any
): Promise<void> {
  if (update?.update_id) {
    await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("update_id", update.update_id);
  } else {
    await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("chat_id", chatId).not("pending_context", "is", null);
  }
}
