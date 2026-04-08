import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const AI_GATEWAY = "https://api.openai.com/v1/chat/completions";
const AI_MODEL = "gpt-4o-mini";

// Subcategorias por categoria
const SUBCATEGORIAS: Record<string, string[]> = {
  "Marketing": ["Influencer", "UGC", "Tráfego Pago"],
  "Colaboradores": ["PJ", "Colaborador Fixo"],
};

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} not configured`);
  return value;
}

Deno.serve(async (req) => {
  try {
    const { update } = await req.json();
    if (!update?.message) return jsonResponse({ ok: true, skipped: true });

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text ?? "";

    const LOVABLE_API_KEY = getRequiredEnv("LOVABLE_API_KEY");
    const OPENAI_KEY = getRequiredEnv("OPENIA_API_KEY");
    const TELEGRAM_API_KEY = getRequiredEnv("TELEGRAM_API_KEY");
    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    // ─── GLOBAL BOT: Resolve user ───
    // Try to match by telegram_id first, then fall back to first admin
    const telegramId = String(message.from.id);
    let userId: string;
    let displayName: string | null = null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (profile) {
      userId = profile.user_id;
      displayName = profile.display_name;
    } else {
      // Fall back to first admin user
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1)
        .single();

      if (!adminRole) {
        await sendTelegram(chatId, "⛔ Nenhum administrador configurado no sistema.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
        return jsonResponse({ ok: true, denied: true });
      }
      userId = adminRole.user_id;
      const { data: adminProfile } = await supabase.from("profiles").select("display_name").eq("user_id", userId).single();
      displayName = adminProfile?.display_name || null;
    }

    // Get user role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();
    const userRole = roleData?.role ?? "assistente";

    // ─── COMMAND ROUTING ───
    if (text.startsWith("/")) {
      await supabase.from("telegram_messages").update({ pending_context: null }).eq("chat_id", chatId).not("pending_context", "is", null);
      return await handleCommand(text, chatId, userId, userRole, supabase, LOVABLE_API_KEY, TELEGRAM_API_KEY, OPENAI_KEY);
    }

    // ─── CHECK PENDING CONVERSATION CONTEXT ───
    const { data: pendingMsg } = await supabase
      .from("telegram_messages")
      .select("pending_context")
      .eq("chat_id", chatId)
      .not("pending_context", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const pendingContext = pendingMsg?.pending_context as any | null;

    // ─── VOICE MESSAGE → Transcription via AI ───
    let processedText = text;
    if (message.voice || message.audio) {
      const fileId = message.voice?.file_id || message.audio?.file_id;
      processedText = await transcribeAudio(fileId, LOVABLE_API_KEY, TELEGRAM_API_KEY, OPENAI_KEY);
      if (!processedText) {
        await sendTelegram(chatId, "❌ Não consegui transcrever o áudio. Tente enviar como texto.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
        return jsonResponse({ ok: true });
      }
    }

    // ─── PHOTO/DOCUMENT: File handling ───
    let fileUrl: string | null = null;
    let fileName: string | null = null;
    if (message.photo || message.document) {
      const fileId = message.photo
        ? message.photo[message.photo.length - 1].file_id
        : message.document.file_id;
      fileName = message.document?.file_name || `comprovante_${Date.now()}.jpg`;

      const fileResponse = await fetch(`${GATEWAY_URL}/getFile`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": TELEGRAM_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file_id: fileId }),
      });
      const fileData = await fileResponse.json();
      const filePath = fileData.result?.file_path;

      if (filePath) {
        const downloadResp = await fetch(`${GATEWAY_URL}/file/${filePath}`, {
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": TELEGRAM_API_KEY,
          },
        });

        if (downloadResp.ok) {
          const fileBytes = new Uint8Array(await downloadResp.arrayBuffer());
          const storagePath = `${userId}/${new Date().toISOString().split("T")[0]}_${fileName}`;

          const { error: uploadErr } = await supabase.storage
            .from("comprovantes")
            .upload(storagePath, fileBytes, {
              contentType: message.document?.mime_type || "image/jpeg",
              upsert: true,
            });

          if (!uploadErr) {
            fileUrl = storagePath;
          }
        }
      }

      // If only a file (no text), try to match with pending transactions
      if (!processedText && fileUrl) {
        if (pendingContext && pendingContext.last_transaction_id) {
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
          await sendTelegram(chatId, `📎 Comprovante vinculado à conta:\n${linkedTx?.descricao || "?"} - R$ ${Number(linkedTx?.valor || 0).toFixed(2)} (${dtStr})`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          return jsonResponse({ ok: true });
        }
        return await handleOrphanFile(chatId, userId, fileUrl, fileName!, supabase, LOVABLE_API_KEY, TELEGRAM_API_KEY);
      }
    }

    // ─── HANDLE PENDING CONTEXT RESPONSES ───
    if (pendingContext) {
      const step = pendingContext.step || "extraction";

      // Step: waiting for recurrence answer
      if (step === "ask_recurrence") {
        const isRecurrent = /mensal|recorrente|todo\s*m[eê]s|fixa|sim/i.test(processedText);
        const updatedCtx = { ...pendingContext, step: "ask_variable" };
        
        if (isRecurrent) {
          updatedCtx.is_recorrente = true;
          // Ask if fixed or variable value
          await supabase.from("telegram_messages").update({ pending_context: updatedCtx }).eq("chat_id", chatId).not("pending_context", "is", null);
          await sendTelegram(chatId, `📊 O valor de "${pendingContext.descricao}" é:\n\n1️⃣ Fixo (mesmo valor todo mês)\n2️⃣ Variável (muda todo mês, ex: conta de luz)`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          return jsonResponse({ ok: true });
        } else {
          updatedCtx.is_recorrente = false;
          updatedCtx.categoria_tipo = "avulsa";
          updatedCtx.step = "ask_origin";
          await supabase.from("telegram_messages").update({ pending_context: updatedCtx }).eq("chat_id", chatId).not("pending_context", "is", null);
          return await askOrigin(chatId, userId, pendingContext.descricao, supabase, LOVABLE_API_KEY, TELEGRAM_API_KEY, updatedCtx);
        }
      }

      // Step: waiting for variable answer
      if (step === "ask_variable") {
        const isVariable = /vari[aá]vel|muda|2/i.test(processedText);
        const updatedCtx = { ...pendingContext };
        if (isVariable) {
          updatedCtx.categoria_tipo = "variavel";
          updatedCtx.eh_variavel = true;
        } else {
          updatedCtx.categoria_tipo = "fixa";
          updatedCtx.eh_variavel = false;
        }
        updatedCtx.step = "ask_origin";
        await supabase.from("telegram_messages").update({ pending_context: updatedCtx }).eq("chat_id", chatId).not("pending_context", "is", null);
        return await askOrigin(chatId, userId, pendingContext.descricao, supabase, LOVABLE_API_KEY, TELEGRAM_API_KEY, updatedCtx);
      }

      // Step: waiting for origin/payment method answer
      if (step === "ask_origin") {
        const updatedCtx = { ...pendingContext };
        // Parse the user response for origin selection
        const lowerText = processedText.toLowerCase().trim();
        
        if (/sim|ok|isso|pode|confirma/i.test(lowerText) && updatedCtx.suggested_origin) {
          // User confirmed the suggestion
          updatedCtx.origem = updatedCtx.suggested_origin;
          updatedCtx.cartao_ref = updatedCtx.suggested_cartao_ref || null;
          updatedCtx.banco_ref = updatedCtx.suggested_banco_ref || null;
        } else if (/pix/i.test(lowerText)) {
          updatedCtx.origem = "pix";
          updatedCtx.step = "ask_banco_pix";
          await supabase.from("telegram_messages").update({ pending_context: updatedCtx }).eq("chat_id", chatId).not("pending_context", "is", null);
          const { data: bancos } = await supabase.from("bancos").select("nome").eq("user_id", userId);
          const bankList = (bancos || []).map((b: any, i: number) => `${i + 1}. ${b.nome}`).join("\n");
          await sendTelegram(chatId, `🏦 De qual banco sai o PIX?\n\n${bankList}`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          return jsonResponse({ ok: true });
        } else if (/cart[aã]o/i.test(lowerText)) {
          updatedCtx.origem = "cartao";
          updatedCtx.step = "ask_cartao";
          await supabase.from("telegram_messages").update({ pending_context: updatedCtx }).eq("chat_id", chatId).not("pending_context", "is", null);
          const { data: cartoes } = await supabase.from("cartoes").select("apelido, final_cartao, tipo_funcao").eq("user_id", userId).is("deleted_at", null);
          const cardList = (cartoes || []).map((c: any, i: number) => `${i + 1}. ${c.apelido} (${c.final_cartao}) - ${c.tipo_funcao}`).join("\n");
          await sendTelegram(chatId, `💳 Qual cartão?\n\n${cardList}`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          return jsonResponse({ ok: true });
        } else if (/boleto/i.test(lowerText)) {
          updatedCtx.origem = "boleto";
        } else if (/d[eé]bito/i.test(lowerText)) {
          updatedCtx.origem = "debito_automatico";
        } else {
          // Try to match a card/bank name directly
          const { data: matchCard } = await supabase.from("cartoes").select("apelido, final_cartao").eq("user_id", userId).is("deleted_at", null).or(`apelido.ilike.%${lowerText}%,final_cartao.eq.${lowerText}`).limit(1).single();
          if (matchCard) {
            updatedCtx.origem = "cartao";
            updatedCtx.cartao_ref = matchCard.apelido;
          } else {
            const { data: matchBank } = await supabase.from("bancos").select("nome").eq("user_id", userId).ilike("nome", `%${lowerText}%`).limit(1).single();
            if (matchBank) {
              updatedCtx.origem = "pix";
              updatedCtx.banco_ref = matchBank.nome;
            } else {
              updatedCtx.origem = lowerText;
            }
          }
        }

        updatedCtx.step = "ask_categoria";
        await supabase.from("telegram_messages").update({ pending_context: updatedCtx }).eq("chat_id", chatId).not("pending_context", "is", null);
        // Ask category
        const { data: cats } = await supabase.from("categorias").select("id, nome").eq("user_id", userId).order("nome");
        const catList = (cats || []).map((c: any, i: number) => `${i + 1}. ${c.nome}`).join("\n");
        await sendTelegram(chatId, `🏷️ Qual a categoria?\n\n${catList}`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
        return jsonResponse({ ok: true });
      }

      // Step: waiting for banco for PIX
      if (step === "ask_banco_pix") {
        const { data: bancos } = await supabase.from("bancos").select("id, nome").eq("user_id", userId);
        const matchedBank = (bancos || []).find((b: any, i: number) => 
          processedText.trim() === String(i + 1) || b.nome.toLowerCase().includes(processedText.toLowerCase().trim())
        );
        const updatedCtx = { ...pendingContext };
        if (matchedBank) {
          updatedCtx.banco_ref = matchedBank.nome;
        }
        updatedCtx.step = "ask_categoria";
        await supabase.from("telegram_messages").update({ pending_context: updatedCtx }).eq("chat_id", chatId).not("pending_context", "is", null);
        const { data: cats } = await supabase.from("categorias").select("id, nome").eq("user_id", userId).order("nome");
        const catList = (cats || []).map((c: any, i: number) => `${i + 1}. ${c.nome}`).join("\n");
        await sendTelegram(chatId, `🏷️ Qual a categoria?\n\n${catList}`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
        return jsonResponse({ ok: true });
      }

      // Step: waiting for card selection
      if (step === "ask_cartao") {
        const { data: cartoes } = await supabase.from("cartoes").select("id, apelido, final_cartao, tipo_funcao").eq("user_id", userId).is("deleted_at", null);
        const matchedCard = (cartoes || []).find((c: any, i: number) => 
          processedText.trim() === String(i + 1) || c.apelido.toLowerCase().includes(processedText.toLowerCase().trim()) || c.final_cartao === processedText.trim()
        );
        const updatedCtx = { ...pendingContext };
        if (matchedCard) {
          updatedCtx.cartao_ref = matchedCard.apelido;
          // If card is multiplo, ask debit or credit
          if (matchedCard.tipo_funcao === "multiplo") {
            updatedCtx.step = "ask_funcao_cartao";
            updatedCtx.cartao_id_resolved = matchedCard.id;
            await supabase.from("telegram_messages").update({ pending_context: updatedCtx }).eq("chat_id", chatId).not("pending_context", "is", null);
            await sendTelegram(chatId, `💳 ${matchedCard.apelido} é um cartão múltiplo. Foi:\n\n1️⃣ Crédito\n2️⃣ Débito`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
            return jsonResponse({ ok: true });
          }
        }
        updatedCtx.step = "ask_categoria";
        await supabase.from("telegram_messages").update({ pending_context: updatedCtx }).eq("chat_id", chatId).not("pending_context", "is", null);
        const { data: cats } = await supabase.from("categorias").select("id, nome").eq("user_id", userId).order("nome");
        const catList = (cats || []).map((c: any, i: number) => `${i + 1}. ${c.nome}`).join("\n");
        await sendTelegram(chatId, `🏷️ Qual a categoria?\n\n${catList}`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
        return jsonResponse({ ok: true });
      }

      // Step: asking debit or credit for multiplo card
      if (step === "ask_funcao_cartao") {
        const updatedCtx = { ...pendingContext };
        if (/cr[eé]dito|1/i.test(processedText)) {
          updatedCtx.funcao_usada = "credito";
        } else {
          updatedCtx.funcao_usada = "debito";
        }
        updatedCtx.step = "ask_categoria";
        await supabase.from("telegram_messages").update({ pending_context: updatedCtx }).eq("chat_id", chatId).not("pending_context", "is", null);
        const { data: cats } = await supabase.from("categorias").select("id, nome").eq("user_id", userId).order("nome");
        const catList = (cats || []).map((c: any, i: number) => `${i + 1}. ${c.nome}`).join("\n");
        await sendTelegram(chatId, `🏷️ Qual a categoria?\n\n${catList}`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
        return jsonResponse({ ok: true });
      }

      // Step: waiting for category
      if (step === "ask_categoria") {
        const { data: cats } = await supabase.from("categorias").select("id, nome").eq("user_id", userId).order("nome");
        const matchedCat = (cats || []).find((c: any, i: number) =>
          processedText.trim() === String(i + 1) || c.nome.toLowerCase().includes(processedText.toLowerCase().trim())
        );
        const updatedCtx = { ...pendingContext };
        if (matchedCat) {
          updatedCtx.categoria_ref = matchedCat.nome;
          updatedCtx.categoria_id_resolved = matchedCat.id;
          
          // Check if this category has subcategories
          const subs = SUBCATEGORIAS[matchedCat.nome];
          if (subs && subs.length > 0) {
            updatedCtx.step = "ask_subcategoria";
            await supabase.from("telegram_messages").update({ pending_context: updatedCtx }).eq("chat_id", chatId).not("pending_context", "is", null);
            const subList = subs.map((s, i) => `${i + 1}. ${s}`).join("\n");
            await sendTelegram(chatId, `📂 Subcategoria de ${matchedCat.nome}:\n\n${subList}`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
            return jsonResponse({ ok: true });
          }
        }
        // No subcategory needed, finalize
        updatedCtx.step = "finalize";
        return await finalizeTransaction(chatId, userId, updatedCtx, fileUrl, fileName, update, supabase, LOVABLE_API_KEY, TELEGRAM_API_KEY);
      }

      // Step: waiting for subcategory
      if (step === "ask_subcategoria") {
        const updatedCtx = { ...pendingContext };
        const catName = updatedCtx.categoria_ref;
        const subs = SUBCATEGORIAS[catName] || [];
        const matchedSub = subs.find((s, i) => processedText.trim() === String(i + 1) || s.toLowerCase().includes(processedText.toLowerCase().trim()));
        updatedCtx.subcategoria = matchedSub || processedText.trim();
        updatedCtx.step = "finalize";
        return await finalizeTransaction(chatId, userId, updatedCtx, fileUrl, fileName, update, supabase, LOVABLE_API_KEY, TELEGRAM_API_KEY);
      }

      // Legacy: NLP-based pending context (old flow)
      if (step === "extraction") {
        let enrichedText = processedText;
        enrichedText = `Contexto anterior: Descrição="${pendingContext.descricao || ""}", Valor=${pendingContext.valor || "?"}, Data=${pendingContext.data_vencimento || "?"}, Categoria=${pendingContext.categoria_tipo || "?"}, Origem=${pendingContext.origem || "?"}, Cartão=${pendingContext.cartao_ref || "?"}, Banco=${pendingContext.banco_ref || "?"}, Status=${pendingContext.status_pagamento || "pendente"}. Pergunta feita: "${pendingContext.missing_question || ""}". Resposta do usuário: "${processedText}". Combine tudo e complete os dados.`;
        await supabase.from("telegram_messages").update({ pending_context: null }).eq("chat_id", chatId).not("pending_context", "is", null);

        const extraction = await extractTransactionData(enrichedText, userId, supabase, OPENAI_KEY);
        if (extraction && extraction.status === "complete") {
          // Start smart flow with extracted data
          const ctx = {
            step: "ask_recurrence",
            descricao: extraction.descricao,
            valor: extraction.valor,
            data_vencimento: extraction.data_vencimento,
            origem: extraction.origem,
            cartao_ref: extraction.cartao_ref,
            banco_ref: extraction.banco_ref,
            categoria_ref: extraction.categoria_ref,
            status_pagamento: extraction.status_pagamento,
          };
          await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("chat_id", chatId).not("pending_context", "is", null);
          
          // Check if it's a known category for recurrence question
          const catName = extraction.categoria_ref?.toLowerCase() || "";
          if (["software", "contas do escritório", "contas fixas"].some(c => catName.includes(c.toLowerCase()))) {
            await sendTelegram(chatId, `📋 "${extraction.descricao}" por R$ ${Number(extraction.valor).toFixed(2)}.\n\nEsse gasto é:\n1️⃣ Mensal/Recorrente\n2️⃣ Apenas este mês`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          } else {
            await sendTelegram(chatId, `📋 "${extraction.descricao}" por R$ ${Number(extraction.valor).toFixed(2)}.\n\nÉ um pagamento:\n1️⃣ Mensal/Recorrente\n2️⃣ Apenas este mês (avulso)`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          }
          return jsonResponse({ ok: true });
        }
        // If still incomplete, ask again
        if (extraction && extraction.status === "incomplete") {
          const contextToStore = {
            step: "extraction",
            descricao: extraction.descricao || pendingContext?.descricao || null,
            valor: extraction.valor || pendingContext?.valor || null,
            data_vencimento: extraction.data_vencimento || pendingContext?.data_vencimento || null,
            missing_question: extraction.missing_question,
          };
          await supabase.from("telegram_messages").update({ pending_context: contextToStore }).eq("update_id", update.update_id);
          await sendTelegram(chatId, `📝 ${extraction.descricao || "?"} - R$ ${extraction.valor || "?"}\n\n❓ ${extraction.missing_question}`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
          return jsonResponse({ ok: true, incomplete: true });
        }
        // Not financial
        const answer = await handleBIQuery(processedText, userId, supabase, OPENAI_KEY);
        await sendTelegram(chatId, answer, LOVABLE_API_KEY, TELEGRAM_API_KEY);
        return jsonResponse({ ok: true });
      }
    }

    // ─── NLP: Extract transaction data via AI (first message) ───
    const extraction = await extractTransactionData(processedText, userId, supabase, OPENAI_KEY);

    if (!extraction || extraction.status === "not_financial") {
      const answer = await handleBIQuery(processedText, userId, supabase, OPENAI_KEY);
      await sendTelegram(chatId, answer, LOVABLE_API_KEY, TELEGRAM_API_KEY);
      return jsonResponse({ ok: true });
    }

    if (extraction.status === "incomplete") {
      const contextToStore = {
        step: "extraction",
        descricao: extraction.descricao || null,
        valor: extraction.valor || null,
        data_vencimento: extraction.data_vencimento || null,
        categoria_tipo: extraction.categoria_tipo || null,
        origem: extraction.origem || null,
        cartao_ref: extraction.cartao_ref || null,
        banco_ref: extraction.banco_ref || null,
        categoria_ref: extraction.categoria_ref || null,
        status_pagamento: extraction.status_pagamento || null,
        missing_question: extraction.missing_question,
      };
      await supabase.from("telegram_messages").update({ pending_context: contextToStore }).eq("update_id", update.update_id);
      await sendTelegram(chatId,
        `📝 Entendi parcialmente:\n• ${contextToStore.descricao || "?"}\n• R$ ${contextToStore.valor || "?"}\n\n❓ ${extraction.missing_question}`,
        LOVABLE_API_KEY, TELEGRAM_API_KEY
      );
      return jsonResponse({ ok: true, incomplete: true });
    }

    // ─── SMART FLOW: Start multi-step conversation ───
    const ctx: any = {
      step: "ask_recurrence",
      descricao: extraction.descricao,
      valor: extraction.valor,
      data_vencimento: extraction.data_vencimento || new Date().toISOString().split("T")[0],
      origem: extraction.origem,
      cartao_ref: extraction.cartao_ref,
      banco_ref: extraction.banco_ref,
      categoria_ref: extraction.categoria_ref,
      status_pagamento: extraction.status_pagamento,
      subcategoria: extraction.subcategoria || null,
    };

    // Store context
    await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("update_id", update.update_id);

    // Ask recurrence question
    await sendTelegram(chatId,
      `📋 "${extraction.descricao}" por R$ ${Number(extraction.valor).toFixed(2)}.\n\nEsse gasto é:\n1️⃣ Mensal/Recorrente\n2️⃣ Apenas este mês (avulso)`,
      LOVABLE_API_KEY, TELEGRAM_API_KEY
    );
    return jsonResponse({ ok: true });

  } catch (err: any) {
    console.error("Agent error:", err);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
});

// ─── ASK ORIGIN with memory ───
async function askOrigin(
  chatId: number,
  userId: string,
  descricao: string,
  supabase: any,
  lovableKey: string,
  telegramKey: string,
  ctx: any
) {
  // Check preferences: item-specific first, then category-level
  const { data: itemPref } = await supabase
    .from("preferencias_origem")
    .select("cartao_id, banco_id, origem, cartoes(apelido, final_cartao), bancos(nome)")
    .eq("user_id", userId)
    .ilike("item_nome", `%${descricao}%`)
    .limit(1)
    .maybeSingle();

  if (itemPref) {
    let suggestion = "";
    if (itemPref.cartoes) {
      suggestion = `o cartão ${itemPref.cartoes.apelido} (${itemPref.cartoes.final_cartao})`;
      ctx.suggested_origin = itemPref.origem || "cartao";
      ctx.suggested_cartao_ref = itemPref.cartoes.apelido;
    } else if (itemPref.bancos) {
      suggestion = `${itemPref.origem === "pix" ? "PIX pelo" : ""} banco ${itemPref.bancos.nome}`;
      ctx.suggested_origin = itemPref.origem || "pix";
      ctx.suggested_banco_ref = itemPref.bancos.nome;
    }
    if (suggestion) {
      await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("chat_id", chatId).not("pending_context", "is", null);
      await sendTelegram(chatId, `💳 Da última vez, "${descricao}" foi paga com ${suggestion}. Usar o mesmo?\n\nResponda "sim" ou informe outra forma (PIX, Cartão, Boleto, Débito Automático)`, lovableKey, telegramKey);
      return jsonResponse({ ok: true });
    }
  }

  // Check last transaction with same description
  const { data: lastTx } = await supabase
    .from("transacoes")
    .select("origem, cartao_id, banco_id, cartoes(apelido, final_cartao), bancos(nome)")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .ilike("descricao", `%${descricao}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastTx && (lastTx.cartao_id || lastTx.banco_id)) {
    let suggestion = "";
    if (lastTx.cartoes) {
      suggestion = `o cartão ${(lastTx as any).cartoes.apelido} (${(lastTx as any).cartoes.final_cartao})`;
      ctx.suggested_origin = lastTx.origem || "cartao";
      ctx.suggested_cartao_ref = (lastTx as any).cartoes.apelido;
    } else if (lastTx.bancos) {
      suggestion = `${lastTx.origem === "pix" ? "PIX pelo" : ""} banco ${(lastTx as any).bancos.nome}`;
      ctx.suggested_origin = lastTx.origem || "pix";
      ctx.suggested_banco_ref = (lastTx as any).bancos.nome;
    }
    if (suggestion) {
      await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("chat_id", chatId).not("pending_context", "is", null);
      await sendTelegram(chatId, `💳 Da última vez, "${descricao}" foi paga com ${suggestion}. Usar o mesmo?\n\nResponda "sim" ou informe outra forma (PIX, Cartão, Boleto, Débito Automático)`, lovableKey, telegramKey);
      return jsonResponse({ ok: true });
    }
  }

  // No history: ask normally
  await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("chat_id", chatId).not("pending_context", "is", null);
  await sendTelegram(chatId, `💳 Como será pago "${descricao}"?\n\n• PIX\n• Cartão\n• Boleto\n• Débito Automático`, lovableKey, telegramKey);
  return jsonResponse({ ok: true });
}

// ─── FINALIZE TRANSACTION ───
async function finalizeTransaction(
  chatId: number,
  userId: string,
  ctx: any,
  fileUrl: string | null,
  fileName: string | null,
  update: any,
  supabase: any,
  lovableKey: string,
  telegramKey: string
) {
  const txData: any = {
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
    txData.data_pagamento = ctx.data_pagamento || new Date().toISOString().split("T")[0];
  }

  // Match card
  if (ctx.cartao_ref) {
    const { data: cartao } = await supabase
      .from("cartoes")
      .select("id, banco_id")
      .eq("user_id", userId)
      .or(`apelido.ilike.%${ctx.cartao_ref}%,final_cartao.eq.${ctx.cartao_ref}`)
      .limit(1)
      .single();
    if (cartao) {
      txData.cartao_id = cartao.id;
      if (cartao.banco_id) txData.banco_id = cartao.banco_id;
    }
  }

  // Match bank
  if (ctx.banco_ref && !txData.banco_id) {
    const { data: banco } = await supabase
      .from("bancos")
      .select("id")
      .eq("user_id", userId)
      .ilike("nome", `%${ctx.banco_ref}%`)
      .limit(1)
      .single();
    if (banco) txData.banco_id = banco.id;
  }

  // Match category
  if (ctx.categoria_id_resolved) {
    txData.categoria_id = ctx.categoria_id_resolved;
  } else if (ctx.categoria_ref) {
    const { data: cat } = await supabase
      .from("categorias")
      .select("id")
      .eq("user_id", userId)
      .ilike("nome", `%${ctx.categoria_ref}%`)
      .limit(1)
      .single();
    if (cat) txData.categoria_id = cat.id;
  }

  const { data: newTx, error: txErr } = await supabase
    .from("transacoes")
    .insert(txData)
    .select("id")
    .single();

  if (txErr) {
    await sendTelegram(chatId, `❌ Erro ao registrar: ${txErr.message}`, lovableKey, telegramKey);
    return jsonResponse({ ok: false, error: txErr.message });
  }

  // Save preference for future memory
  if (ctx.descricao && (txData.cartao_id || txData.banco_id)) {
    await supabase.from("preferencias_origem").upsert({
      user_id: userId,
      item_nome: ctx.descricao,
      cartao_id: txData.cartao_id || null,
      banco_id: txData.banco_id || null,
      origem: txData.origem || null,
      categoria_id: txData.categoria_id || null,
    }, { onConflict: "user_id,item_nome" });
  }

  // If recurrent, also create recorrencia
  if (ctx.is_recorrente) {
    const dia = new Date(txData.data_vencimento).getDate();
    await supabase.from("recorrencias_fixas").insert({
      nome: ctx.descricao,
      valor_estimado: ctx.valor,
      dia_vencimento_padrao: dia,
      eh_variavel: ctx.eh_variavel || false,
      cartao_id: txData.cartao_id || null,
      banco_id: txData.banco_id || null,
      categoria_id: txData.categoria_id || null,
      origem: txData.origem || null,
      user_id: userId,
    });
  }

  // Store last transaction ID for receipt linking
  await supabase.from("telegram_messages").update({ pending_context: { last_transaction_id: newTx.id } }).eq("chat_id", chatId).not("pending_context", "is", null);

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
  if (ctx.origem === "pix" && txData.banco_id && ctx.status_pagamento === "pago") {
    const { data: banco } = await supabase.from("bancos").select("saldo_atual").eq("id", txData.banco_id).single();
    if (banco) {
      await supabase.from("bancos").update({ saldo_atual: banco.saldo_atual - ctx.valor }).eq("id", txData.banco_id);
    }
  }

  // Build response
  const fmtDate = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };
  let response = `✅ Lançamento registrado!\n\n`;
  response += `📝 ${ctx.descricao}\n`;
  response += `💰 R$ ${Number(ctx.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
  response += `📅 ${ctx.data_vencimento ? fmtDate(ctx.data_vencimento) : "Hoje"}\n`;
  response += `📊 ${txData.categoria_tipo === "fixa" ? "🔒 Fixa" : txData.categoria_tipo === "variavel" ? "📊 Variável" : "📝 Avulsa"}`;
  if (ctx.is_recorrente) response += ` | 🔄 Recorrente`;
  if (ctx.origem) response += `\n💳 ${ctx.origem}`;
  if (ctx.categoria_ref) response += `\n🏷️ ${ctx.categoria_ref}`;
  if (ctx.subcategoria) response += ` > ${ctx.subcategoria}`;
  response += `\n📊 Status: ${txData.status === "pago" ? "✅ Pago" : "⏳ Pendente"}`;

  if (!fileUrl) {
    response += `\n\n📎 Envie o comprovante/boleto agora para eu vincular.`;
  } else {
    response += `\n📎 Comprovante anexado!`;
  }

  await sendTelegram(chatId, response, lovableKey, telegramKey);
  return jsonResponse({ ok: true, transaction_id: newTx.id });
}

// ─── COMMAND HANDLER ───
async function handleCommand(
  text: string,
  chatId: number,
  userId: string,
  userRole: string,
  supabase: any,
  lovableKey: string,
  telegramKey: string,
  openaiKey: string
) {
  const [cmd, ...args] = text.split(" ");
  const argStr = args.join(" ").trim();

  switch (cmd.toLowerCase()) {
    case "/resumo": {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

      const { data: txs } = await supabase
        .from("transacoes")
        .select("valor, status")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .gte("data_vencimento", startDate)
        .lt("data_vencimento", endDate);

      const pago = (txs || []).filter((t: any) => t.status === "pago").reduce((s: number, t: any) => s + Number(t.valor), 0);
      const pendente = (txs || []).filter((t: any) => t.status === "pendente").reduce((s: number, t: any) => s + Number(t.valor), 0);
      const atrasado = (txs || []).filter((t: any) => t.status === "atrasado").reduce((s: number, t: any) => s + Number(t.valor), 0);

      const { data: bancos } = await supabase.from("bancos").select("saldo_atual").eq("user_id", userId);
      const saldo = (bancos || []).reduce((s: number, b: any) => s + Number(b.saldo_atual), 0);

      await sendTelegram(chatId,
        `📊 Resumo do Mês\n\n` +
        `💳 Saldo em contas: R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n` +
        `✅ Total pago: R$ ${pago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n` +
        `⏳ Pendente: R$ ${pendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n` +
        `🔴 Atrasado: R$ ${atrasado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n` +
        `📈 Total a pagar: R$ ${(pendente + atrasado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        lovableKey, telegramKey
      );
      break;
    }

    case "/pendencias": {
      const { data: pending } = await supabase
        .from("transacoes")
        .select("id, descricao, valor, data_vencimento, status")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .in("status", ["pendente", "atrasado"])
        .order("data_vencimento")
        .limit(15);

      if (!pending?.length) {
        await sendTelegram(chatId, "🎉 Nenhuma pendência encontrada!", lovableKey, telegramKey);
        break;
      }

      const txIds = pending.map((t: any) => t.id);
      const { data: comps } = await supabase.from("comprovantes").select("transacao_id").in("transacao_id", txIds);
      const compSet = new Set((comps || []).map((c: any) => c.transacao_id));

      let msg = "📋 Pendências\n\n";
      for (const tx of pending) {
        const [y, m, d] = tx.data_vencimento.split("-");
        const dt = `${d}/${m}/${y}`;
        const statusIcon = tx.status === "atrasado" ? "🔴" : "⏳";
        const compIcon = compSet.has(tx.id) ? "📎" : "❌";
        msg += `${statusIcon} ${dt} - ${tx.descricao} - R$ ${Number(tx.valor).toFixed(2)} ${compIcon}\n`;
      }
      msg += `\n❌ = sem comprovante | 📎 = com comprovante`;

      await sendTelegram(chatId, msg, lovableKey, telegramKey);
      break;
    }

    case "/limite": {
      const { data: cartoes } = await supabase
        .from("cartoes")
        .select("apelido, final_cartao, limite_total, limite_disponivel, bandeira")
        .eq("user_id", userId)
        .is("deleted_at", null);

      if (!cartoes?.length) {
        await sendTelegram(chatId, "💳 Nenhum cartão cadastrado.", lovableKey, telegramKey);
        break;
      }

      let msg = "💳 Limites dos Cartões\n\n";
      for (const c of cartoes) {
        const pct = Math.round((c.limite_disponivel / c.limite_total) * 100);
        msg += `${c.apelido} (${c.final_cartao} - ${c.bandeira})\n`;
        msg += `Disponível: R$ ${Number(c.limite_disponivel).toFixed(2)} / R$ ${Number(c.limite_total).toFixed(2)} (${pct}%)\n\n`;
      }
      await sendTelegram(chatId, msg, lovableKey, telegramKey);
      break;
    }

    case "/pix": {
      if (!argStr) {
        await sendTelegram(chatId, "Use: /pix [nome do fornecedor]", lovableKey, telegramKey);
        break;
      }
      const { data: forn } = await supabase
        .from("fornecedores")
        .select("nome, chave_pix, cnpj, notas")
        .eq("user_id", userId)
        .ilike("nome", `%${argStr}%`)
        .limit(3);

      if (!forn?.length) {
        await sendTelegram(chatId, `❌ Fornecedor "${argStr}" não encontrado.`, lovableKey, telegramKey);
        break;
      }

      let msg = "";
      for (const f of forn) {
        msg += `🏢 ${f.nome}\n`;
        if (f.chave_pix) msg += `🔑 Chave PIX: ${f.chave_pix}\n`;
        if (f.cnpj) msg += `CNPJ: ${f.cnpj}\n`;
        msg += "\n";
      }
      await sendTelegram(chatId, msg, lovableKey, telegramKey);
      break;
    }

    case "/buscar": {
      if (!argStr) {
        await sendTelegram(chatId, "Use: /buscar [termo]", lovableKey, telegramKey);
        break;
      }
      const { data: results } = await supabase
        .from("transacoes")
        .select("descricao, valor, data_vencimento, status")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .ilike("descricao", `%${argStr}%`)
        .order("data_vencimento", { ascending: false })
        .limit(10);

      if (!results?.length) {
        await sendTelegram(chatId, `🔍 Nenhum resultado para "${argStr}".`, lovableKey, telegramKey);
        break;
      }

      let msg = `🔍 Resultados para "${argStr}"\n\n`;
      for (const r of results) {
        const [y, m, d] = r.data_vencimento.split("-");
        const dt = `${d}/${m}/${y}`;
        const icon = r.status === "pago" ? "✅" : r.status === "atrasado" ? "🔴" : "⏳";
        msg += `${icon} ${dt} - ${r.descricao} - R$ ${Number(r.valor).toFixed(2)}\n`;
      }
      await sendTelegram(chatId, msg, lovableKey, telegramKey);
      break;
    }

    case "/alterar_limite": {
      if (userRole !== "admin") {
        await sendTelegram(chatId, "⛔ Sem permissão para alterar limites.", lovableKey, telegramKey);
        break;
      }
      const parts = argStr.split(" ");
      const newLimit = Number(parts.pop());
      const cardName = parts.join(" ");
      if (!cardName || isNaN(newLimit)) {
        await sendTelegram(chatId, "Use: /alterar_limite [nome cartão] [novo limite]", lovableKey, telegramKey);
        break;
      }
      const { data: card } = await supabase
        .from("cartoes")
        .select("id, limite_total, limite_disponivel")
        .eq("user_id", userId)
        .ilike("apelido", `%${cardName}%`)
        .single();
      if (!card) {
        await sendTelegram(chatId, `❌ Cartão "${cardName}" não encontrado.`, lovableKey, telegramKey);
        break;
      }
      const diff = newLimit - card.limite_total;
      await supabase
        .from("cartoes")
        .update({ limite_total: newLimit, limite_disponivel: card.limite_disponivel + diff })
        .eq("id", card.id);
      await sendTelegram(chatId, `✅ Limite atualizado para R$ ${newLimit.toFixed(2)}`, lovableKey, telegramKey);
      break;
    }

    case "/novo_banco": {
      if (!argStr) {
        await sendTelegram(chatId, "Use: /novo_banco [nome] [saldo inicial]\nExemplo: /novo_banco Nubank 5000", lovableKey, telegramKey);
        break;
      }
      const bankParts = argStr.split(" ");
      const saldoStr = bankParts.pop();
      const saldo = Number(saldoStr);
      let bankName: string;
      let bankSaldo: number;

      if (!isNaN(saldo) && bankParts.length > 0) {
        bankName = bankParts.join(" ");
        bankSaldo = saldo;
      } else {
        bankName = argStr;
        bankSaldo = 0;
      }

      const { data: newBank, error: bankErr } = await supabase
        .from("bancos")
        .insert({ nome: bankName, saldo_atual: bankSaldo, user_id: userId })
        .select("id, nome, saldo_atual")
        .single();

      if (bankErr) {
        await sendTelegram(chatId, `❌ Erro ao criar banco: ${bankErr.message}`, lovableKey, telegramKey);
      } else {
        await sendTelegram(chatId,
          `🏦 Banco cadastrado!\n\n📌 Nome: ${newBank.nome}\n💰 Saldo: R$ ${Number(newBank.saldo_atual).toFixed(2)}`,
          lovableKey, telegramKey
        );
      }
      break;
    }

    case "/novo_cartao": {
      if (!argStr) {
        await sendTelegram(chatId,
          "Use: /novo_cartao [dados do cartão]\n\n" +
          "Exemplo:\n/novo_cartao Roxinho final 4523 Visa crédito Nubank limite 8000 fecha dia 3 vence dia 10\n\n" +
          "Dados necessários: apelido, final (4 dígitos), bandeira, função, banco, limite, dia fechamento, dia vencimento",
          lovableKey, telegramKey
        );
        break;
      }

      const cardExtraction = await extractCardData(argStr, userId, supabase, openaiKey);
      if (!cardExtraction || cardExtraction.status === "incomplete") {
        await sendTelegram(chatId,
          `❓ Faltam informações do cartão:\n${cardExtraction?.missing || "Envie todos os dados necessários."}`,
          lovableKey, telegramKey
        );
        break;
      }

      let bancoId: string | null = null;
      if (cardExtraction.banco_ref) {
        const { data: banco } = await supabase
          .from("bancos")
          .select("id")
          .eq("user_id", userId)
          .ilike("nome", `%${cardExtraction.banco_ref}%`)
          .limit(1)
          .single();
        if (banco) bancoId = banco.id;
      }

      const { data: newCard, error: cardErr } = await supabase
        .from("cartoes")
        .insert({
          apelido: cardExtraction.apelido,
          final_cartao: cardExtraction.final_cartao,
          bandeira: cardExtraction.bandeira,
          tipo_funcao: cardExtraction.tipo_funcao,
          formato: cardExtraction.formato || "fisico",
          limite_total: cardExtraction.limite_total || 0,
          limite_disponivel: cardExtraction.limite_total || 0,
          dia_fechamento: cardExtraction.dia_fechamento,
          dia_vencimento: cardExtraction.dia_vencimento,
          data_validade: cardExtraction.data_validade || null,
          banco_id: bancoId,
          user_id: userId,
        })
        .select("id, apelido, final_cartao, bandeira")
        .single();

      if (cardErr) {
        await sendTelegram(chatId, `❌ Erro ao criar cartão: ${cardErr.message}`, lovableKey, telegramKey);
      } else {
        await sendTelegram(chatId,
          `💳 Cartão cadastrado!\n\n📌 ${newCard.apelido} (${newCard.final_cartao})\n🏷️ ${newCard.bandeira}\n💰 Limite: R$ ${Number(cardExtraction.limite_total || 0).toFixed(2)}`,
          lovableKey, telegramKey
        );
      }
      break;
    }

    case "/nova_conta": {
      if (!argStr) {
        await sendTelegram(chatId,
          "Use: /nova_conta [dados da conta]\n\n" +
          "Exemplo:\n/nova_conta Aluguel R$ 2500 vence dia 10\n\nOu simplesmente me escreva em linguagem natural!",
          lovableKey, telegramKey
        );
        break;
      }
      // Delegate to NLP - the smart flow will handle the rest
      const txExtraction = await extractTransactionData(argStr, userId, supabase, openaiKey);
      if (!txExtraction || txExtraction.status === "not_financial") {
        await sendTelegram(chatId, "❌ Não consegui identificar os dados da conta. Tente novamente com mais detalhes.", lovableKey, telegramKey);
        break;
      }
      if (txExtraction.status === "incomplete") {
        const contextToStore = {
          step: "extraction",
          descricao: txExtraction.descricao || null,
          valor: txExtraction.valor || null,
          data_vencimento: txExtraction.data_vencimento || null,
          missing_question: txExtraction.missing_question,
        };
        // Store in latest message row
        await supabase.from("telegram_messages").update({ pending_context: contextToStore }).eq("update_id", update.update_id);
        await sendTelegram(chatId, `📝 ${txExtraction.descricao || "?"} - R$ ${txExtraction.valor || "?"}\n\n❓ ${txExtraction.missing_question}`, lovableKey, telegramKey);
        break;
      }

      // Start smart flow
      const ctx: any = {
        step: "ask_recurrence",
        descricao: txExtraction.descricao,
        valor: txExtraction.valor,
        data_vencimento: txExtraction.data_vencimento || new Date().toISOString().split("T")[0],
        origem: txExtraction.origem,
        cartao_ref: txExtraction.cartao_ref,
        banco_ref: txExtraction.banco_ref,
        categoria_ref: txExtraction.categoria_ref,
        status_pagamento: txExtraction.status_pagamento,
      };
      await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("update_id", update.update_id);
      await sendTelegram(chatId,
        `📋 "${txExtraction.descricao}" por R$ ${Number(txExtraction.valor).toFixed(2)}.\n\nEsse gasto é:\n1️⃣ Mensal/Recorrente\n2️⃣ Apenas este mês (avulso)`,
        lovableKey, telegramKey
      );
      break;
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

      if (isNaN(rMonth) || rMonth < 1 || rMonth > 12) {
        await sendTelegram(chatId, "Use: /relatorio [mês] [ano]\nExemplo: /relatorio 6 2026", lovableKey, telegramKey);
        break;
      }

      const rStart = `${rYear}-${String(rMonth).padStart(2, "0")}-01`;
      const rEnd = rMonth === 12 ? `${rYear + 1}-01-01` : `${rYear}-${String(rMonth + 1).padStart(2, "0")}-01`;

      const { data: rTxs } = await supabase
        .from("transacoes")
        .select("descricao, valor, status, categoria_tipo, data_vencimento, categorias(nome)")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .gte("data_vencimento", rStart)
        .lt("data_vencimento", rEnd)
        .order("data_vencimento");

      if (!rTxs?.length) {
        await sendTelegram(chatId, `📊 Nenhuma transação em ${String(rMonth).padStart(2, "0")}/${rYear}.`, lovableKey, telegramKey);
        break;
      }

      const pago = rTxs.filter((t: any) => t.status === "pago").reduce((s: number, t: any) => s + Number(t.valor), 0);
      const pendente = rTxs.filter((t: any) => t.status === "pendente").reduce((s: number, t: any) => s + Number(t.valor), 0);
      const atrasado = rTxs.filter((t: any) => t.status === "atrasado").reduce((s: number, t: any) => s + Number(t.valor), 0);
      const total = pago + pendente + atrasado;

      const byTipo: Record<string, number> = {};
      for (const t of rTxs) { byTipo[t.categoria_tipo] = (byTipo[t.categoria_tipo] || 0) + Number(t.valor); }

      const byCat: Record<string, number> = {};
      for (const t of rTxs) {
        const catName = (t as any).categorias?.nome || "Sem categoria";
        byCat[catName] = (byCat[catName] || 0) + Number(t.valor);
      }

      const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      let msg = `📊 Relatório ${meses[rMonth - 1]}/${rYear}\n\n`;
      msg += `📋 Total de lançamentos: ${rTxs.length}\n`;
      msg += `💰 Total: R$ ${total.toFixed(2)}\n`;
      msg += `✅ Pago: R$ ${pago.toFixed(2)}\n`;
      msg += `⏳ Pendente: R$ ${pendente.toFixed(2)}\n`;
      msg += `🔴 Atrasado: R$ ${atrasado.toFixed(2)}\n\n`;

      msg += `Por tipo:\n`;
      for (const [tipo, val] of Object.entries(byTipo)) {
        const icon = tipo === "fixa" ? "🔒" : tipo === "avulsa" ? "📝" : tipo === "variavel" ? "📊" : "💳";
        msg += `${icon} ${tipo}: R$ ${val.toFixed(2)}\n`;
      }

      msg += `\nPor categoria:\n`;
      const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
      for (const [cat, val] of sortedCats.slice(0, 8)) {
        const pct = Math.round((val / total) * 100);
        msg += `• ${cat}: R$ ${val.toFixed(2)} (${pct}%)\n`;
      }

      await sendTelegram(chatId, msg, lovableKey, telegramKey);
      break;
    }

    case "/anexar": {
      if (!argStr) {
        await sendTelegram(chatId,
          "Use: /anexar [descrição da conta]\n\nDepois envie a foto/PDF do comprovante.",
          lovableKey, telegramKey
        );
        break;
      }

      const { data: matchTxs } = await supabase
        .from("transacoes")
        .select("id, descricao, valor, data_vencimento")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .ilike("descricao", `%${argStr}%`)
        .order("data_vencimento", { ascending: false })
        .limit(5);

      if (!matchTxs?.length) {
        await sendTelegram(chatId, `❌ Nenhuma transação encontrada com "${argStr}".`, lovableKey, telegramKey);
        break;
      }

      // Store context for receipt linking
      await supabase.from("telegram_messages").update({ pending_context: { last_transaction_id: matchTxs[0].id } }).eq("update_id", update.update_id);

      let msg = `📎 Encontrei ${matchTxs.length} transação(ões):\n\n`;
      for (const t of matchTxs) {
        const [y, m, d] = t.data_vencimento.split("-");
        msg += `• ${t.descricao} - R$ ${Number(t.valor).toFixed(2)} (${d}/${m}/${y})\n`;
      }
      msg += `\nEnvie o comprovante agora.`;
      await sendTelegram(chatId, msg, lovableKey, telegramKey);
      break;
    }

    case "/nova_recorrencia": {
      if (!argStr) {
        await sendTelegram(chatId,
          "Use: /nova_recorrencia [dados]\n\nExemplo:\n/nova_recorrencia Internet Vivo R$ 130 vence dia 15 fixa boleto",
          lovableKey, telegramKey
        );
        break;
      }

      const recExtraction = await extractRecurrenceData(argStr, userId, supabase, openaiKey);
      if (!recExtraction || recExtraction.status === "incomplete") {
        await sendTelegram(chatId,
          `❓ Faltam informações:\n${recExtraction?.missing || "Informe nome, valor estimado e dia de vencimento."}`,
          lovableKey, telegramKey
        );
        break;
      }

      const recData: any = {
        nome: recExtraction.nome,
        valor_estimado: recExtraction.valor_estimado || 0,
        dia_vencimento_padrao: recExtraction.dia_vencimento,
        eh_variavel: recExtraction.eh_variavel || false,
        origem: recExtraction.origem || null,
        user_id: userId,
      };

      if (recExtraction.banco_ref) {
        const { data: banco } = await supabase.from("bancos").select("id").eq("user_id", userId).ilike("nome", `%${recExtraction.banco_ref}%`).limit(1).single();
        if (banco) recData.banco_id = banco.id;
      }
      if (recExtraction.cartao_ref) {
        const { data: cartao } = await supabase.from("cartoes").select("id").eq("user_id", userId).or(`apelido.ilike.%${recExtraction.cartao_ref}%,final_cartao.eq.${recExtraction.cartao_ref}`).limit(1).single();
        if (cartao) recData.cartao_id = cartao.id;
      }
      if (recExtraction.categoria_ref) {
        const { data: cat } = await supabase.from("categorias").select("id").eq("user_id", userId).ilike("nome", `%${recExtraction.categoria_ref}%`).limit(1).single();
        if (cat) recData.categoria_id = cat.id;
      }

      const { error: recErr } = await supabase.from("recorrencias_fixas").insert(recData);
      if (recErr) {
        await sendTelegram(chatId, `❌ Erro: ${recErr.message}`, lovableKey, telegramKey);
      } else {
        await sendTelegram(chatId,
          `🔄 Recorrência cadastrada!\n\n📌 ${recData.nome}\n💰 R$ ${Number(recData.valor_estimado).toFixed(2)}\n📅 Dia ${recData.dia_vencimento_padrao}\n${recData.eh_variavel ? "📊 Variável" : "🔒 Fixa"}`,
          lovableKey, telegramKey
        );
      }
      break;
    }

    default:
      await sendTelegram(chatId,
        "📋 Comandos disponíveis:\n\n" +
        "💰 Cadastro:\n" +
        "/nova_conta [dados] — Nova conta\n" +
        "/novo_banco [nome] [saldo] — Novo banco\n" +
        "/novo_cartao [dados] — Novo cartão\n" +
        "/nova_recorrencia [dados] — Nova conta fixa\n\n" +
        "📊 Consultas:\n" +
        "/resumo — Gastos do mês\n" +
        "/relatorio [mês] [ano] — Relatório mensal\n" +
        "/pendencias — Contas pendentes\n" +
        "/limite — Limites dos cartões\n" +
        "/buscar [termo] — Buscar no histórico\n" +
        "/pix [nome] — Dados PIX\n" +
        "/anexar [nome] — Anexar comprovante\n\n" +
        "⚙️ Admin:\n" +
        "/alterar_limite [cartão] [valor]",
        lovableKey, telegramKey
      );
  }

  return jsonResponse({ ok: true });
}

// ─── CARD DATA EXTRACTION ───
async function extractCardData(text: string, userId: string, supabase: any, apiKey: string) {
  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: `Extraia dados de um cartão de crédito/débito da mensagem. Campos obrigatórios: apelido, final_cartao (4 dígitos), bandeira (visa/mastercard/elo/amex), tipo_funcao (debito/credito/multiplo), dia_fechamento, dia_vencimento. Opcionais: limite_total, formato (fisico/virtual), data_validade (YYYY-MM-DD), banco_ref. Se faltar algum obrigatório, retorne status "incomplete" com campo missing.` },
        { role: "user", content: text },
      ],
      tools: [{
        type: "function",
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
      }],
      tool_choice: { type: "function", function: { name: "extract_card" } },
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return null;
  try { return JSON.parse(toolCall.function.arguments); } catch { return null; }
}

// ─── RECURRENCE DATA EXTRACTION ───
async function extractRecurrenceData(text: string, userId: string, supabase: any, apiKey: string) {
  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: `Extraia dados de uma conta recorrente/fixa. Campos obrigatórios: nome, dia_vencimento (1-31). Opcionais: valor_estimado, eh_variavel, origem (email/site/pix/boleto/debito_automatico/dinheiro/cartao), banco_ref, cartao_ref, categoria_ref. Se faltar obrigatório, retorne status "incomplete" com campo missing.` },
        { role: "user", content: text },
      ],
      tools: [{
        type: "function",
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
              origem: { type: "string", enum: ["email", "site", "pix", "boleto", "debito_automatico", "dinheiro", "cartao"] },
              banco_ref: { type: "string" },
              cartao_ref: { type: "string" },
              categoria_ref: { type: "string" },
              missing: { type: "string" },
            },
            required: ["status"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_recurrence" } },
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return null;
  try { return JSON.parse(toolCall.function.arguments); } catch { return null; }
}

// ─── NLP EXTRACTION ───
async function extractTransactionData(text: string, userId: string, supabase: any, apiKey: string) {
  const today = new Date().toISOString().split("T")[0];

  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        {
          role: "system",
          content: `Você é um extrator de dados financeiros. Analise a mensagem e extraia dados de transação.
REGRAS:
- Se NÃO for sobre finanças, retorne status "not_financial"
- Para "complete": OBRIGATÓRIO ter descrição e valor
- Datas no formato YYYY-MM-DD. Hoje = ${today}. Datas brasileiras: "15/04/2026" = 2026-04-15
- Valores: "150", "R$ 150", "cento e cinquenta" = 150.00
- Se mencionar PIX, origem = "pix"
- Se mencionar cartão, extraia cartao_ref
- Se disser "já paguei" ou "paguei", status_pagamento = "pago"
- NÃO pergunte sobre categoria, origem ou recorrência (o sistema cuida disso)
- Apenas extraia: descricao, valor, data_vencimento, status_pagamento`,
        },
        { role: "user", content: text },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract_transaction",
          description: "Extract transaction data",
          parameters: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["complete", "incomplete", "not_financial"] },
              descricao: { type: "string" },
              valor: { type: "number" },
              data_vencimento: { type: "string" },
              data_pagamento: { type: "string" },
              status_pagamento: { type: "string", enum: ["pendente", "pago"] },
              categoria_tipo: { type: "string", enum: ["fixa", "avulsa", "variavel", "divida"] },
              origem: { type: "string", enum: ["email", "site", "pix", "boleto", "debito_automatico", "dinheiro", "cartao"] },
              cartao_ref: { type: "string" },
              banco_ref: { type: "string" },
              categoria_ref: { type: "string" },
              subcategoria: { type: "string" },
              missing_question: { type: "string" },
            },
            required: ["status"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract_transaction" } },
    }),
  });

  if (!response.ok) { console.error("AI extraction failed:", response.status); return null; }
  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return null;
  try { return JSON.parse(toolCall.function.arguments); } catch { return null; }
}

// ─── BI QUERY HANDLER ───
async function handleBIQuery(question: string, userId: string, supabase: any, apiKey: string) {
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split("T")[0];

  const { data: recentTxs } = await supabase
    .from("transacoes")
    .select("descricao, valor, data_vencimento, status, categoria_tipo")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .gte("data_vencimento", threeMonthsAgo)
    .order("data_vencimento", { ascending: false })
    .limit(100);

  const { data: bancos } = await supabase.from("bancos").select("nome, saldo_atual").eq("user_id", userId);
  const { data: cartoes } = await supabase.from("cartoes").select("apelido, limite_total, limite_disponivel").eq("user_id", userId).is("deleted_at", null);

  const context = JSON.stringify({ transacoes_recentes: recentTxs || [], bancos: bancos || [], cartoes: cartoes || [], data_atual: now.toISOString().split("T")[0] });

  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: `Você é um assistente financeiro. Responda perguntas sobre finanças baseado nos dados fornecidos. Seja direto, use emojis. NUNCA invente números. Responda em português do Brasil. Formate valores como R$ X.XXX,XX. Datas no formato dd/mm/aaaa.` },
        { role: "user", content: `Dados:\n${context}\n\nPergunta: ${question}` },
      ],
    }),
  });

  if (!response.ok) return "❌ Não consegui processar sua pergunta. Tente novamente.";
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "❌ Sem resposta.";
}

// ─── ORPHAN FILE HANDLER ───
async function handleOrphanFile(chatId: number, userId: string, fileUrl: string, fileName: string, supabase: any, lovableKey: string, telegramKey: string) {
  const { data: pendingTxs } = await supabase
    .from("transacoes")
    .select("id, descricao, valor, data_vencimento")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("status", ["pendente", "pago"])
    .order("data_vencimento", { ascending: false })
    .limit(20);

  if (!pendingTxs?.length) {
    await sendTelegram(chatId, "📎 Arquivo recebido, mas não encontrei transações para vincular.", lovableKey, telegramKey);
    return jsonResponse({ ok: true });
  }

  const txIds = pendingTxs.map((t: any) => t.id);
  const { data: existingComps } = await supabase.from("comprovantes").select("transacao_id").in("transacao_id", txIds);
  const compSet = new Set((existingComps || []).map((c: any) => c.transacao_id));

  const withoutComp = pendingTxs.filter((t: any) => !compSet.has(t.id));
  if (!withoutComp.length) {
    await sendTelegram(chatId, "📎 Todas as transações recentes já possuem comprovante.", lovableKey, telegramKey);
    return jsonResponse({ ok: true });
  }

  const target = withoutComp[0];
  await supabase.from("comprovantes").insert({
    transacao_id: target.id,
    file_path: fileUrl,
    file_name: fileName,
    file_type: fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
    uploaded_by: userId,
  });

  const [y, m, d] = target.data_vencimento.split("-");
  await sendTelegram(chatId, `📎 Comprovante vinculado a:\n${target.descricao} - R$ ${Number(target.valor).toFixed(2)} (${d}/${m}/${y})`, lovableKey, telegramKey);
  return jsonResponse({ ok: true });
}

// ─── AUDIO TRANSCRIPTION ───
async function transcribeAudio(fileId: string, lovableKey: string, telegramKey: string, openaiKey: string): Promise<string | null> {
  try {
    const fileResponse = await fetch(`${GATEWAY_URL}/getFile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": telegramKey, "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const fileData = await fileResponse.json();
    const filePath = fileData.result?.file_path;
    if (!filePath) return null;

    const downloadResp = await fetch(`${GATEWAY_URL}/file/${filePath}`, {
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": telegramKey },
    });
    if (!downloadResp.ok) return null;

    const audioBytes = await downloadResp.arrayBuffer();
    const formData = new FormData();
    formData.append("file", new Blob([audioBytes], { type: "audio/ogg" }), "audio.ogg");
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.text || null;
  } catch (e) {
    console.error("Transcription error:", e);
    return null;
  }
}

// ─── TELEGRAM SEND ───
async function sendTelegram(chatId: number, text: string, lovableKey: string, telegramKey: string, parseMode?: string) {
  const primaryAttempt = await postTelegramMessage(chatId, text, lovableKey, telegramKey, parseMode);
  if (primaryAttempt.ok) return primaryAttempt;

  console.error("Telegram send failed", { chatId, parseMode, status: primaryAttempt.status });

  if (!parseMode) throw new Error(`Telegram send failed (${primaryAttempt.status})`);

  const fallbackAttempt = await postTelegramMessage(chatId, text, lovableKey, telegramKey);
  if (fallbackAttempt.ok) return fallbackAttempt;

  throw new Error(`Telegram send failed (${primaryAttempt.status}/${fallbackAttempt.status})`);
}

async function postTelegramMessage(chatId: number, text: string, lovableKey: string, telegramKey: string, parseMode?: string) {
  const payload: Record<string, unknown> = { chat_id: chatId, text };
  if (parseMode) payload.parse_mode = parseMode;

  const response = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  try {
    const parsed = body ? JSON.parse(body) : null;
    if (!response.ok || parsed?.ok === false) return { ok: false, status: response.status, body };
  } catch {
    if (!response.ok) return { ok: false, status: response.status, body };
  }
  return { ok: true, status: response.status, body };
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
