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
      // FIX #3: Standardize path to userId/transacaoId/timestamp.ext (pending tx link)
      // For orphan files, use userId/orphan/timestamp.ext temporarily
      const ext = fileName.split(".").pop() || "jpg";
      const storagePath = `${userId}/orphan/${Date.now()}.${ext}`;
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
        // Re-upload to correct path: userId/transacaoId/timestamp.ext
        const txId = pendingContext.last_transaction_id;
        const ext = fileName.split(".").pop() || "jpg";
        const correctPath = `${userId}/${txId}/${Date.now()}.${ext}`;

        // Move file: download from orphan path, upload to correct path
        const { data: fileData } = await supabase.storage.from("comprovantes").download(fileUrl);
        if (fileData) {
          const bytes = new Uint8Array(await fileData.arrayBuffer());
          await supabase.storage.from("comprovantes").upload(correctPath, bytes, {
            contentType: message.document?.mime_type || "image/jpeg",
            upsert: true,
          });
          await supabase.storage.from("comprovantes").remove([fileUrl]);
          fileUrl = correctPath;
        }

        await supabase.from("comprovantes").insert({
          transacao_id: txId,
          file_path: fileUrl,
          file_name: fileName!,
          file_type: message.document?.mime_type || "image/jpeg",
          uploaded_by: userId,
        });
        await supabase.from("telegram_messages").update({ pending_context: null }).eq("chat_id", chatId).not("pending_context", "is", null);

        // FIX #6: Trigger drive-mirror
        await triggerDriveMirror(supabase, txId, fileUrl, fileName!);

        const { data: linkedTx } = await supabase.from("transacoes").select("descricao, valor, data_vencimento").eq("id", txId).single();
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

  // 3. Check recurrence in DB — FIX #9: use shorter, cleaner search term
  const descForRecurrence = vendorCanonical?.canonical || extractCleanDescription(processedText);
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
    await savePendingContext(supabase, chatId, update, contextToStore);
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
  if (!ctx.categoria_ref && !ctx.categoria_id_resolved) missing.push("categoria");

  if (missing.length === 0) {
    ctx.step = "confirm";
    // FIX #2: Use savePendingContext with chat_id fallback
    await savePendingContext(supabase, chatId, update, ctx);
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
    } else if (/d[eé]bito\s*autom/i.test(lower)) {
      ctx.origem = "debito_automatico";
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
          await sendTelegram(chatId, "Poderia especificar? A despesa foi no 💳 Cartão, via PIX, em 💵 Dinheiro ou Boleto?", lovableKey, telegramKey);
          return jsonResponse({ ok: true });
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
    // FIX #12: Stricter confirmation regex using word boundaries
    if (/^(sim|ok|isso|confirma|certo|correto|s)$/i.test(lower) || /^pode\s*(sim|registrar|salvar)?$/i.test(lower)) {
      return await finalizeTransaction(chatId, userId, ctx, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
    }
    if (/^(n[aã]o|errado|cancela|n)$/i.test(lower)) {
      await supabase.from("telegram_messages").update({ pending_context: null }).eq("chat_id", chatId).not("pending_context", "is", null);
      await sendTelegram(chatId, "❌ Cancelado. Envie os dados novamente.", lovableKey, telegramKey);
      return jsonResponse({ ok: true });
    }
    const msg = contextToConfirmationMessage(ctx);
    await sendTelegram(chatId, msg, lovableKey, telegramKey);
    return jsonResponse({ ok: true });
  }

  // FIX #4: Handle lembretes confirmation
  if (step === "lembretes_listados") {
    const lembretes = (ctx as any).lembretes_list || [];
    const num = parseInt(processedText.trim());
    if (!isNaN(num) && num >= 1 && num <= lembretes.length) {
      const lembrete = lembretes[num - 1];
      const { error } = await supabase.from("lembretes").update({
        confirmado: true,
        confirmado_at: new Date().toISOString(),
      }).eq("id", lembrete.id);
      if (!error) {
        await sendTelegram(chatId, `✅ Lembrete "${lembrete.titulo}" confirmado!`, lovableKey, telegramKey);
      } else {
        await sendTelegram(chatId, `❌ Erro ao confirmar: ${error.message}`, lovableKey, telegramKey);
      }
    } else {
      await sendTelegram(chatId, "❓ Responda com o número do lembrete para confirmar, ou envie uma nova mensagem.", lovableKey, telegramKey);
    }
    await supabase.from("telegram_messages").update({ pending_context: null }).eq("chat_id", chatId).not("pending_context", "is", null);
    return jsonResponse({ ok: true });
  }

  // FIX #7: Handle debt creation flow
  if (step === "ask_debt_parcelas") {
    const totalParcelas = parseInt(processedText.trim());
    if (isNaN(totalParcelas) || totalParcelas < 1) {
      await sendTelegram(chatId, "❓ Informe um número válido de parcelas.", lovableKey, telegramKey);
      return jsonResponse({ ok: true });
    }
    (ctx as any).total_parcelas = totalParcelas;
    ctx.step = "ask_debt_parcelas_pagas" as any;
    await savePendingContext(supabase, chatId, update, ctx);
    await sendTelegram(chatId, `📝 ${totalParcelas} parcelas. Quantas já foram pagas?`, lovableKey, telegramKey);
    return jsonResponse({ ok: true });
  }

  if (step === "ask_debt_parcelas_pagas") {
    const parcelasPagas = parseInt(processedText.trim());
    if (isNaN(parcelasPagas) || parcelasPagas < 0) {
      await sendTelegram(chatId, "❓ Informe um número válido (0 ou mais).", lovableKey, telegramKey);
      return jsonResponse({ ok: true });
    }
    (ctx as any).parcelas_pagas = parcelasPagas;
    ctx.step = "ask_debt_dia_vencimento" as any;
    await savePendingContext(supabase, chatId, update, ctx);
    await sendTelegram(chatId, `📝 ${parcelasPagas} pagas. Qual o dia do vencimento mensal?`, lovableKey, telegramKey);
    return jsonResponse({ ok: true });
  }

  if (step === "ask_debt_dia_vencimento") {
    const diaVenc = parseInt(processedText.trim());
    if (isNaN(diaVenc) || diaVenc < 1 || diaVenc > 31) {
      await sendTelegram(chatId, "❓ Informe um dia válido (1-31).", lovableKey, telegramKey);
      return jsonResponse({ ok: true });
    }
    return await finalizeDebt(chatId, userId, ctx, diaVenc, update, supabase, lovableKey, telegramKey);
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
      await savePendingContext(supabase, chatId, update, contextToStore);
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
  await savePendingContext(supabase, chatId, update, { last_transaction_id: newTx.id });

  // Link file if present
  if (fileUrl && newTx) {
    // Re-upload to correct path: userId/transacaoId/timestamp.ext
    const ext = (fileName || "jpg").split(".").pop() || "jpg";
    const correctPath = `${userId}/${newTx.id}/${Date.now()}.${ext}`;

    const { data: fileData } = await supabase.storage.from("comprovantes").download(fileUrl);
    if (fileData) {
      const bytes = new Uint8Array(await fileData.arrayBuffer());
      await supabase.storage.from("comprovantes").upload(correctPath, bytes, {
        contentType: "image/jpeg",
        upsert: true,
      });
      await supabase.storage.from("comprovantes").remove([fileUrl]);

      await supabase.from("comprovantes").insert({
        transacao_id: newTx.id,
        file_path: correctPath,
        file_name: fileName!,
        file_type: "image/jpeg",
        uploaded_by: userId,
      });

      // FIX #6: Trigger drive-mirror
      await triggerDriveMirror(supabase, newTx.id, correctPath, fileName!);
    }
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

// ═══════════════ FINALIZE DEBT ═══════════════
// FIX #7: Full debt creation flow

async function finalizeDebt(
  chatId: number,
  userId: string,
  ctx: any,
  diaVencimento: number,
  update: any,
  supabase: any,
  lovableKey: string,
  telegramKey: string
): Promise<Response> {
  const totalParcelas = ctx.total_parcelas || 1;
  const parcelasPagas = ctx.parcelas_pagas || 0;
  const valorParcela = ctx.valor || 0;
  const valorTotal = valorParcela * totalParcelas;
  const today = new Date();
  const dataPrimeiraParcela = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(diaVencimento).padStart(2, "0")}`;

  // Resolve categoria
  let categoriaId: string | null = null;
  if (ctx.categoria_ref) {
    const cat = await resolveCategory(supabase, userId, ctx.categoria_ref);
    if (cat) categoriaId = cat.id;
  }

  // Resolve banco/cartao
  let bancoId: string | null = ctx.banco_id_resolved || null;
  let cartaoId: string | null = ctx.cartao_id_resolved || null;
  if (ctx.banco_ref && !bancoId) {
    const bank = await resolveBank(supabase, userId, ctx.banco_ref);
    if (bank) bancoId = bank.id;
  }

  const { data: contrato, error: contratoErr } = await supabase.from("contratos_divida").insert({
    user_id: userId,
    descricao: ctx.descricao || "Dívida",
    valor_total: valorTotal,
    valor_parcela: valorParcela,
    total_parcelas: totalParcelas,
    parcelas_pagas: parcelasPagas,
    dia_vencimento: diaVencimento,
    data_contrato: today.toISOString().split("T")[0],
    data_primeira_parcela: dataPrimeiraParcela,
    status: parcelasPagas >= totalParcelas ? "quitado" : "ativo",
    categoria_id: categoriaId,
    banco_id: bancoId,
    cartao_id: cartaoId,
    origem: ctx.origem || null,
    subcategoria: ctx.subcategoria || null,
  }).select("id").single();

  if (contratoErr) {
    await sendTelegram(chatId, `❌ Erro ao criar dívida: ${contratoErr.message}`, lovableKey, telegramKey);
    return jsonResponse({ ok: false, error: contratoErr.message });
  }

  // Create transaction entries for each installment
  const parcelas: any[] = [];
  for (let i = 0; i < totalParcelas; i++) {
    const parcelaDate = new Date(today.getFullYear(), today.getMonth() + i, diaVencimento);
    parcelas.push({
      user_id: userId,
      descricao: `${ctx.descricao} (${i + 1}/${totalParcelas})`,
      valor: valorParcela,
      data_vencimento: parcelaDate.toISOString().split("T")[0],
      status: i < parcelasPagas ? "pago" : "pendente",
      data_pagamento: i < parcelasPagas ? parcelaDate.toISOString().split("T")[0] : null,
      categoria_tipo: "divida",
      categoria_id: categoriaId,
      banco_id: bancoId,
      cartao_id: cartaoId,
      origem: ctx.origem || null,
      contrato_id: contrato.id,
      parcela_atual: i + 1,
      parcela_total: totalParcelas,
      subcategoria: ctx.subcategoria || null,
    });
  }

  const { error: parcelasErr } = await supabase.from("transacoes").insert(parcelas);
  if (parcelasErr) {
    console.error("Error creating installments:", parcelasErr);
  }

  await supabase.from("telegram_messages").update({ pending_context: null }).eq("chat_id", chatId).not("pending_context", "is", null);

  const restantes = totalParcelas - parcelasPagas;
  await sendTelegram(chatId,
    `✅ Dívida registrada!\n\n📋 ${ctx.descricao}\n💰 R$ ${valorParcela.toFixed(2)} x ${totalParcelas} = R$ ${valorTotal.toFixed(2)}\n📊 ${parcelasPagas} pagas | ${restantes} restantes\n📅 Vencimento: dia ${diaVencimento}`,
    lovableKey, telegramKey);

  return jsonResponse({ ok: true, contrato_id: contrato.id });
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

  // Move file to correct path
  const ext = fileName.split(".").pop() || "jpg";
  const correctPath = `${userId}/${target.id}/${Date.now()}.${ext}`;
  const { data: fileData } = await supabase.storage.from("comprovantes").download(fileUrl);
  if (fileData) {
    const bytes = new Uint8Array(await fileData.arrayBuffer());
    await supabase.storage.from("comprovantes").upload(correctPath, bytes, {
      contentType: fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
      upsert: true,
    });
    await supabase.storage.from("comprovantes").remove([fileUrl]);
  }

  await supabase.from("comprovantes").insert({
    transacao_id: target.id, file_path: correctPath, file_name: fileName,
    file_type: fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
    uploaded_by: userId,
  });

  // Trigger drive-mirror
  await triggerDriveMirror(supabase, target.id, correctPath, fileName);

  const [y, m, d] = target.data_vencimento.split("-");
  await sendTelegram(chatId, `📎 Comprovante vinculado a: ${target.descricao} - R$ ${Number(target.valor).toFixed(2)} (${d}/${m}/${y})`, lovableKey, telegramKey);
  return jsonResponse({ ok: true });
}

// ═══════════════ HELPERS ═══════════════

// FIX #2: Robust pending context save with chat_id fallback
async function savePendingContext(
  supabase: any,
  chatId: number,
  update: any,
  ctx: any
): Promise<void> {
  // Try update_id first (most precise)
  if (update?.update_id) {
    const { count } = await supabase
      .from("telegram_messages")
      .update({ pending_context: ctx })
      .eq("update_id", update.update_id)
      .select("id", { count: "exact", head: true });

    // If update_id matched, we're done
    if (count && count > 0) return;
  }

  // Fallback: update latest message for this chat_id
  const { data: latest } = await supabase
    .from("telegram_messages")
    .select("id")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (latest) {
    await supabase
      .from("telegram_messages")
      .update({ pending_context: ctx })
      .eq("id", latest.id);
  }
}

// FIX #9: Extract a clean, short description for recurrence matching
function extractCleanDescription(text: string): string {
  // Remove common filler words and financial terms
  const cleaned = text
    .replace(/paguei|pago|paga|pagamento|conta|vence|vencimento|reais|hoje|ontem|dia\s+\d+/gi, "")
    .replace(/R\$\s*[\d.,]+/g, "")
    .replace(/final\s*\d{4}/gi, "")
    .replace(/cart[aã]o|banco|pix|boleto|dinheiro/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  // Take first meaningful word(s), max 30 chars
  const words = cleaned.split(" ").filter(w => w.length > 2);
  return words.slice(0, 3).join(" ").substring(0, 30) || text.substring(0, 20);
}

// FIX #6: Trigger drive-mirror edge function
async function triggerDriveMirror(
  supabase: any,
  transacaoId: string,
  filePath: string,
  fileName: string,
  docType: string = "comprovante"
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return;

    await fetch(`${supabaseUrl}/functions/v1/drive-mirror`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transacao_id: transacaoId,
        file_path: filePath,
        file_name: fileName,
        doc_type: docType,
      }),
    }).catch(err => console.error("Drive mirror trigger error:", err));
  } catch (err) {
    console.error("Drive mirror trigger error:", err);
  }
}
