import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  try {
    const { update } = await req.json();
    if (!update?.message) return jsonResponse({ ok: true, skipped: true });

    const message = update.message;
    const chatId = message.chat.id;
    const text = message.text ?? "";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ─── WHITELIST: Verify telegram_id ───
    const telegramId = String(message.from.id);
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .eq("telegram_id", telegramId)
      .single();

    if (profileErr || !profile) {
      await sendTelegram(chatId, "⛔ Acesso negado. Seu Telegram não está vinculado a nenhuma conta no sistema.", LOVABLE_API_KEY, TELEGRAM_API_KEY);
      return jsonResponse({ ok: true, denied: true });
    }

    const userId = profile.user_id;

    // Get user role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();
    const userRole = roleData?.role ?? "assistente";

    // ─── COMMAND ROUTING ───
    if (text.startsWith("/")) {
      return await handleCommand(text, chatId, userId, userRole, supabase, LOVABLE_API_KEY, TELEGRAM_API_KEY);
    }

    // ─── VOICE MESSAGE → Transcription via AI ───
    let processedText = text;
    if (message.voice || message.audio) {
      const fileId = message.voice?.file_id || message.audio?.file_id;
      processedText = await transcribeAudio(fileId, LOVABLE_API_KEY, TELEGRAM_API_KEY);
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

      // Download file
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

          // Upload to Supabase Storage
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
        return await handleOrphanFile(chatId, userId, fileUrl, fileName!, supabase, LOVABLE_API_KEY, TELEGRAM_API_KEY);
      }
    }

    // ─── NLP: Extract transaction data via AI ───
    const extraction = await extractTransactionData(processedText, userId, supabase, LOVABLE_API_KEY);

    if (!extraction || extraction.status === "not_financial") {
      // It's a general query — handle as ad-hoc BI question
      const answer = await handleBIQuery(processedText, userId, supabase, LOVABLE_API_KEY);
      await sendTelegram(chatId, answer, LOVABLE_API_KEY, TELEGRAM_API_KEY);
      return jsonResponse({ ok: true });
    }

    if (extraction.status === "incomplete") {
      await sendTelegram(
        chatId,
        `📝 Entendi parcialmente:\n• Descrição: ${extraction.descricao || "?"}\n• Valor: ${extraction.valor ? `R$ ${extraction.valor}` : "?"}\n• Data: ${extraction.data_vencimento || "?"}\n\n❓ ${extraction.missing_question}`,
        LOVABLE_API_KEY,
        TELEGRAM_API_KEY
      );
      return jsonResponse({ ok: true, incomplete: true });
    }

    // ─── CREATE TRANSACTION ───
    const txData: any = {
      descricao: extraction.descricao,
      valor: extraction.valor,
      data_vencimento: extraction.data_vencimento || new Date().toISOString().split("T")[0],
      status: extraction.status_pagamento === "pago" ? "pago" : "pendente",
      categoria_tipo: extraction.categoria_tipo || "avulsa",
      origem: extraction.origem || null,
      user_id: userId,
    };

    if (extraction.status_pagamento === "pago") {
      txData.data_pagamento = extraction.data_pagamento || new Date().toISOString().split("T")[0];
    }

    // Match card by name/final
    if (extraction.cartao_ref) {
      const { data: cartao } = await supabase
        .from("cartoes")
        .select("id")
        .eq("user_id", userId)
        .or(`apelido.ilike.%${extraction.cartao_ref}%,final_cartao.eq.${extraction.cartao_ref}`)
        .limit(1)
        .single();
      if (cartao) txData.cartao_id = cartao.id;
    }

    // Match bank
    if (extraction.banco_ref) {
      const { data: banco } = await supabase
        .from("bancos")
        .select("id")
        .eq("user_id", userId)
        .ilike("nome", `%${extraction.banco_ref}%`)
        .limit(1)
        .single();
      if (banco) txData.banco_id = banco.id;
    }

    // Match category
    if (extraction.categoria_ref) {
      const { data: cat } = await supabase
        .from("categorias")
        .select("id")
        .eq("user_id", userId)
        .ilike("nome", `%${extraction.categoria_ref}%`)
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
      await sendTelegram(chatId, `❌ Erro ao registrar: ${txErr.message}`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
      return jsonResponse({ ok: false, error: txErr.message });
    }

    // Link file if present
    if (fileUrl && newTx) {
      await supabase.from("comprovantes").insert({
        transacao_id: newTx.id,
        file_path: fileUrl,
        file_name: fileName!,
        file_type: message.document?.mime_type || "image/jpeg",
        uploaded_by: userId,
      });
    }

    // PIX: deduct bank balance
    if (extraction.origem === "pix" && txData.banco_id && extraction.status_pagamento === "pago") {
      const { data: banco } = await supabase
        .from("bancos")
        .select("saldo_atual")
        .eq("id", txData.banco_id)
        .single();
      if (banco) {
        await supabase
          .from("bancos")
          .update({ saldo_atual: banco.saldo_atual - extraction.valor })
          .eq("id", txData.banco_id);
      }
    }

    // Build response
    let response = `✅ Lançamento registrado!\n\n`;
    response += `📝 ${extraction.descricao}\n`;
    response += `💰 R$ ${Number(extraction.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
    response += `📅 ${extraction.data_vencimento || "Hoje"}\n`;
    response += `📊 Status: ${txData.status === "pago" ? "✅ Pago" : "⏳ Pendente"}`;

    if (!fileUrl) {
      response += `\n\n⚠️ Comprovante não detectado. Envie a foto/PDF agora ou marcarei como pendente.`;
    } else {
      response += `\n📎 Comprovante anexado!`;
    }

    await sendTelegram(chatId, response, LOVABLE_API_KEY, TELEGRAM_API_KEY);
    return jsonResponse({ ok: true, transaction_id: newTx.id });
  } catch (err: any) {
    console.error("Agent error:", err);
    return jsonResponse({ error: err.message }, 500);
  }
});

// ─── COMMAND HANDLER ───
async function handleCommand(
  text: string,
  chatId: number,
  userId: string,
  userRole: string,
  supabase: any,
  lovableKey: string,
  telegramKey: string
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
        `📊 *Resumo do Mês*\n\n` +
        `💳 Saldo em contas: R$ ${saldo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n` +
        `✅ Total pago: R$ ${pago.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n` +
        `⏳ Pendente: R$ ${pendente.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n` +
        `🔴 Atrasado: R$ ${atrasado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n` +
        `📈 Total a pagar: R$ ${(pendente + atrasado).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        lovableKey, telegramKey, "Markdown"
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

      // Check which have comprovantes
      const txIds = pending.map((t: any) => t.id);
      const { data: comps } = await supabase
        .from("comprovantes")
        .select("transacao_id")
        .in("transacao_id", txIds);
      const compSet = new Set((comps || []).map((c: any) => c.transacao_id));

      let msg = "📋 *Pendências*\n\n";
      for (const tx of pending) {
        const dt = new Date(tx.data_vencimento).toLocaleDateString("pt-BR");
        const statusIcon = tx.status === "atrasado" ? "🔴" : "⏳";
        const compIcon = compSet.has(tx.id) ? "📎" : "❌";
        msg += `${statusIcon} ${dt} - ${tx.descricao} - R$ ${Number(tx.valor).toFixed(2)} ${compIcon}\n`;
      }
      msg += `\n❌ = sem comprovante | 📎 = com comprovante`;

      await sendTelegram(chatId, msg, lovableKey, telegramKey, "Markdown");
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

      let msg = "💳 *Limites dos Cartões*\n\n";
      for (const c of cartoes) {
        const pct = Math.round((c.limite_disponivel / c.limite_total) * 100);
        const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
        msg += `*${c.apelido}* (${c.final_cartao} - ${c.bandeira})\n`;
        msg += `${bar} ${pct}%\n`;
        msg += `Disponível: R$ ${Number(c.limite_disponivel).toFixed(2)} / R$ ${Number(c.limite_total).toFixed(2)}\n\n`;
      }
      await sendTelegram(chatId, msg, lovableKey, telegramKey, "Markdown");
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
        msg += `🏢 *${f.nome}*\n`;
        if (f.chave_pix) msg += `🔑 Chave PIX: \`${f.chave_pix}\`\n`;
        if (f.cnpj) msg += `CNPJ: ${f.cnpj}\n`;
        msg += "\n";
      }
      await sendTelegram(chatId, msg, lovableKey, telegramKey, "Markdown");
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

      let msg = `🔍 *Resultados para "${argStr}"*\n\n`;
      for (const r of results) {
        const dt = new Date(r.data_vencimento).toLocaleDateString("pt-BR");
        const icon = r.status === "pago" ? "✅" : r.status === "atrasado" ? "🔴" : "⏳";
        msg += `${icon} ${dt} - ${r.descricao} - R$ ${Number(r.valor).toFixed(2)}\n`;
      }
      await sendTelegram(chatId, msg, lovableKey, telegramKey, "Markdown");
      break;
    }

    case "/alterar_limite": {
      if (userRole !== "admin") {
        await sendTelegram(chatId, "⛔ Seu perfil de Assistente não tem permissão para alterar limites de cartão.", lovableKey, telegramKey);
        break;
      }
      // Parse: /alterar_limite Roxinho 15000
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
      await sendTelegram(chatId, `✅ Limite do cartão atualizado para R$ ${newLimit.toFixed(2)}`, lovableKey, telegramKey);
      break;
    }

    default:
      await sendTelegram(chatId,
        "📋 *Comandos disponíveis:*\n\n" +
        "/resumo — Gastos do mês atual\n" +
        "/pendencias — Contas pendentes/atrasadas\n" +
        "/limite — Limites dos cartões\n" +
        "/pix [nome] — Dados PIX de fornecedor\n" +
        "/buscar [termo] — Buscar no histórico\n" +
        "/alterar\\_limite [cartão] [valor] — Alterar limite (Admin)",
        lovableKey, telegramKey, "Markdown"
      );
  }

  return jsonResponse({ ok: true });
}

// ─── NLP EXTRACTION ───
async function extractTransactionData(text: string, userId: string, supabase: any, apiKey: string) {
  const today = new Date().toISOString().split("T")[0];

  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `Você é um extrator de dados financeiros. Analise a mensagem do usuário e extraia informações de transações financeiras.
REGRAS RÍGIDAS:
- Se NÃO for sobre finanças, retorne status "not_financial"
- Se faltar valor, data ou descrição, retorne status "incomplete" com missing_question
- Só retorne status "complete" quando tiver pelo menos descrição e valor
- Datas relativas: "hoje" = ${today}, "ontem" = calcule
- Valores: interprete "150", "R$ 150", "cento e cinquenta" como 150.00
- Se mencionar PIX, defina origem como "pix"
- Se mencionar cartão, extraia a referência (nome ou últimos 4 dígitos)
- Se disser "já paguei" ou "paguei", status_pagamento = "pago"
- categoria_tipo: fixa (recorrente), avulsa (única), variavel (dia-a-dia), divida (parcelamento)`,
        },
        { role: "user", content: text },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_transaction",
            description: "Extract transaction data from user message",
            parameters: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["complete", "incomplete", "not_financial"] },
                descricao: { type: "string" },
                valor: { type: "number" },
                data_vencimento: { type: "string", description: "YYYY-MM-DD" },
                data_pagamento: { type: "string", description: "YYYY-MM-DD if already paid" },
                status_pagamento: { type: "string", enum: ["pendente", "pago"] },
                categoria_tipo: { type: "string", enum: ["fixa", "avulsa", "variavel", "divida"] },
                origem: { type: "string", enum: ["email", "site", "pix", "boleto", "debito_automatico", "dinheiro", "cartao"] },
                cartao_ref: { type: "string", description: "Card name or last 4 digits" },
                banco_ref: { type: "string", description: "Bank name" },
                categoria_ref: { type: "string", description: "Category name" },
                missing_question: { type: "string", description: "Question to ask if incomplete" },
              },
              required: ["status"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_transaction" } },
    }),
  });

  if (!response.ok) {
    console.error("AI extraction failed:", response.status);
    return null;
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return null;

  try {
    return JSON.parse(toolCall.function.arguments);
  } catch {
    return null;
  }
}

// ─── BI QUERY HANDLER ───
async function handleBIQuery(question: string, userId: string, supabase: any, apiKey: string) {
  // Fetch recent financial data for context
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

  const { data: bancos } = await supabase
    .from("bancos")
    .select("nome, saldo_atual")
    .eq("user_id", userId);

  const { data: cartoes } = await supabase
    .from("cartoes")
    .select("apelido, limite_total, limite_disponivel")
    .eq("user_id", userId)
    .is("deleted_at", null);

  const context = JSON.stringify({
    transacoes_recentes: recentTxs || [],
    bancos: bancos || [],
    cartoes: cartoes || [],
    data_atual: now.toISOString().split("T")[0],
  });

  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content: `Você é um assistente financeiro. Responda perguntas sobre finanças do usuário baseado nos dados fornecidos. Seja direto e use emojis. Se não tiver dados suficientes, diga. NUNCA invente números. Responda em português do Brasil. Formate valores como R$ X.XXX,XX.`,
        },
        {
          role: "user",
          content: `Dados financeiros:\n${context}\n\nPergunta: ${question}`,
        },
      ],
    }),
  });

  if (!response.ok) return "❌ Não consegui processar sua pergunta. Tente novamente.";
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "❌ Sem resposta.";
}

// ─── ORPHAN FILE HANDLER ───
async function handleOrphanFile(
  chatId: number,
  userId: string,
  fileUrl: string,
  fileName: string,
  supabase: any,
  lovableKey: string,
  telegramKey: string
) {
  // Find recent transactions without comprovante
  const { data: pendingTxs } = await supabase
    .from("transacoes")
    .select("id, descricao, valor, data_vencimento")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("status", ["pendente", "pago"])
    .order("data_vencimento", { ascending: false })
    .limit(20);

  if (!pendingTxs?.length) {
    await sendTelegram(chatId, "📎 Arquivo recebido, mas não encontrei transações para vincular. Envie junto com uma descrição.", lovableKey, telegramKey);
    return jsonResponse({ ok: true });
  }

  // Check which already have comprovantes
  const txIds = pendingTxs.map((t: any) => t.id);
  const { data: existingComps } = await supabase
    .from("comprovantes")
    .select("transacao_id")
    .in("transacao_id", txIds);
  const compSet = new Set((existingComps || []).map((c: any) => c.transacao_id));

  const withoutComp = pendingTxs.filter((t: any) => !compSet.has(t.id));
  if (!withoutComp.length) {
    await sendTelegram(chatId, "📎 Arquivo salvo, mas todas as transações recentes já possuem comprovante.", lovableKey, telegramKey);
    return jsonResponse({ ok: true });
  }

  // Link to most recent transaction without comprovante
  const target = withoutComp[0];
  await supabase.from("comprovantes").insert({
    transacao_id: target.id,
    file_path: fileUrl,
    file_name: fileName,
    file_type: fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
    uploaded_by: userId,
  });

  const dt = new Date(target.data_vencimento).toLocaleDateString("pt-BR");
  await sendTelegram(
    chatId,
    `📎 Comprovante vinculado a:\n${target.descricao} - R$ ${Number(target.valor).toFixed(2)} (${dt})\n\n✅ Vincular corretamente? Responda com a descrição da conta para alterar.`,
    lovableKey,
    telegramKey
  );

  return jsonResponse({ ok: true });
}

// ─── AUDIO TRANSCRIPTION ───
async function transcribeAudio(fileId: string, lovableKey: string, telegramKey: string): Promise<string | null> {
  try {
    // Download audio file
    const fileResponse = await fetch(`${GATEWAY_URL}/getFile`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file_id: fileId }),
    });
    const fileData = await fileResponse.json();
    const filePath = fileData.result?.file_path;
    if (!filePath) return null;

    const downloadResp = await fetch(`${GATEWAY_URL}/file/${filePath}`, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
      },
    });
    if (!downloadResp.ok) return null;

    const audioBytes = await downloadResp.arrayBuffer();

    // Use AI to transcribe (send as base64 in prompt)
    const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBytes)));

    const response = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "Transcreva o áudio em texto. Retorne APENAS a transcrição, sem comentários.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcreva este áudio:" },
              {
                type: "input_audio",
                input_audio: { data: base64Audio, format: "ogg" },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.error("Transcription error:", e);
    return null;
  }
}

// ─── TELEGRAM SEND ───
async function sendTelegram(chatId: number, text: string, lovableKey: string, telegramKey: string, parseMode = "HTML") {
  await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
  });
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
