import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const AI_GATEWAY = "https://api.openai.com/v1/chat/completions";
const AI_MODEL = "gpt-4o-mini";

// ─── KEYWORD-BASED CATEGORY CLASSIFICATION ───
const CATEGORY_KEYWORDS: Record<string, { keywords: string[]; subcategoria?: string }[]> = {
  "Insumos e Diversos": [
    { keywords: ["sonda", "mercado", "mercadinho", "supermercado", "amazon", "mercado livre", "limpeza", "produto de limpeza", "papel toalha", "detergente", "sabao", "esponja", "cafe", "acucar", "agua", "galao", "lavanderia", "secagem", "lava e seca", "eletronico", "celular", "fone", "notebook", "extensao", "fita", "alicate", "chave de fenda", "parafuso", "ferramenta", "material", "suporte", "rodinha", "cadeira", "uniforme", "copo", "talher", "descartavel", "utensilio", "ifood", "delivery", "refeicao", "almoco", "lanche", "pizza", "alimentacao", "uber", "transporte", "combustivel", "estacionamento", "impressora", "toner", "papel", "cartucho", "mantimentos"] },
  ],
  "Custos Fixos": [
    { keywords: ["aluguel", "condominio", "energia", "luz", "conta de luz", "cpfl", "enel", "elektro", "sabesp", "gas", "iptu", "imposto predial", "tributo imobiliario"], subcategoria: "Imóvel" },
    { keywords: ["vivo", "claro", "tim", "oi", "net", "internet", "fibra", "banda larga", "wifi", "wi-fi", "chip", "plano movel", "vivo movel", "celular corporativo", "linha"], subcategoria: "Internet" },
    { keywords: ["diarista", "faxina", "limpeza do escritorio", "mary help", "pamela", "contabilidade", "contador", "escritorio contabil", "assessoria contabil"], subcategoria: "Escritório" },
  ],
  "Software": [
    { keywords: ["assinatura", "plano", "licenca", "software", "saas", "app", "plataforma", "sistema", "ferramenta digital", "google workspace", "notion", "miro", "clicksign", "hostinger", "lovable", "capcut", "icloud", "apple", "microsoft", "adobe", "elevenlabs", "manus", "supvr", "z-api", "umbler", "epidemic sound", "canva", "openrouter", "claude", "aws", "appfy", "kiwifi", "udemy", "kaspersky", "antivirus", "dominio", "godaddy", "cloudflare", "vercel", "github", "figma", "slack", "zoom", "meet", "teams", "hubspot", "crm", "erp", "sulivan"] },
  ],
  "Colaboradores": [
    { keywords: ["salario", "folha de pagamento", "adiantamento", "adiantamento salarial", "13", "decimo terceiro", "ferias", "rescisao", "aviso previo", "fgts", "inss", "encargo", "contribuicao", "vale refeicao", "vr", "vale alimentacao", "va", "vale transporte", "vt", "beneficio", "plano de saude", "freelancer", "prestador", "autonomo", "designer", "roteirista", "editor", "julio", "larissa", "thais", "sophia", "luiz", "gabriel", "nathan", "kaue", "comissao", "hora extra", "pro-labore"] },
  ],
  "Marketing": [
    { keywords: ["influencer", "ugc", "creator", "conteudo patrocinado", "publi", "publicidade", "anuncio", "ads", "meta ads", "facebook ads", "instagram ads", "google ads", "tiktok ads", "youtube ads", "trafego pago", "impulsionamento", "boost", "campanha", "midia paga", "criativo", "video de anuncio", "patrocinio", "ganhadores", "dinamica", "sorteio", "brinde promocional"] },
  ],
};

function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function classifyByKeywords(text: string): { categoria: string; subcategoria?: string } | null {
  const normalized = removeAccents(text.toLowerCase());
  for (const [catName, groups] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const group of groups) {
      for (const kw of group.keywords) {
        const normalizedKw = removeAccents(kw.toLowerCase());
        if (normalized.includes(normalizedKw)) {
          return { categoria: catName, subcategoria: group.subcategoria };
        }
      }
    }
  }
  return null;
}

// ─── STATUS DETECTION ───
function detectStatus(text: string): "pago" | "pendente" | null {
  const normalized = removeAccents(text.toLowerCase());
  const paidPatterns = ["paguei", "ja paguei", "foi pago", "quitei", "liquidei", "efetuei o pagamento", "saiu do banco", "debitou", "debitou da conta", "paga", "pago"];
  const pendingPatterns = ["vence", "vai vencer", "tenho que pagar", "preciso pagar", "vencimento dia", "a pagar", "pendente"];
  
  for (const p of paidPatterns) {
    if (normalized.includes(removeAccents(p))) return "pago";
  }
  for (const p of pendingPatterns) {
    if (normalized.includes(removeAccents(p))) return "pendente";
  }
  return null;
}

// ─── DATE EXTRACTION ───
function extractDate(text: string): string | null {
  const normalized = removeAccents(text.toLowerCase());
  const today = new Date();
  
  if (/\bhoje\b/.test(normalized)) return today.toISOString().split("T")[0];
  if (/\bontem\b/.test(normalized)) {
    const d = new Date(today); d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }
  if (/semana passada/.test(normalized)) {
    const d = new Date(today); d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  }
  
  // dd/mm/yyyy or dd/mm
  const fullDate = normalized.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (fullDate) {
    const day = parseInt(fullDate[1]);
    const month = parseInt(fullDate[2]);
    const year = fullDate[3] ? (fullDate[3].length === 2 ? 2000 + parseInt(fullDate[3]) : parseInt(fullDate[3])) : today.getFullYear();
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  
  // "dia X"
  const diaMatch = normalized.match(/\bdia\s+(\d{1,2})\b/);
  if (diaMatch) {
    const day = parseInt(diaMatch[1]);
    let month = today.getMonth();
    let year = today.getFullYear();
    if (day < today.getDate()) { month++; if (month > 11) { month = 0; year++; } }
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  
  return null;
}

// ─── VALUE EXTRACTION ───
function extractValue(text: string): number | null {
  const normalized = removeAccents(text.toLowerCase());
  
  // R$ X.XXX,XX or R$X.XXX,XX
  const brFormat = text.match(/R\$\s*([\d.]+,\d{2})/);
  if (brFormat) {
    return parseFloat(brFormat[1].replace(/\./g, "").replace(",", "."));
  }
  
  // X.XXX,XX (Brazilian format)
  const brFormat2 = text.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
  if (brFormat2) {
    return parseFloat(brFormat2[1].replace(/\./g, "").replace(",", "."));
  }
  
  // R$ XXXX or R$XXXX (without cents)
  const simpleR = text.match(/R\$\s*([\d.]+)/);
  if (simpleR) {
    const val = simpleR[1].replace(/\./g, "");
    return parseFloat(val);
  }
  
  // XXXX reais
  const reais = normalized.match(/([\d.]+)\s*reais/);
  if (reais) {
    return parseFloat(reais[1].replace(/\./g, ""));
  }
  
  // "mil e quinhentos" etc
  if (/mil e quinhentos/.test(normalized)) return 1500;
  if (/mil/.test(normalized)) {
    const milMatch = normalized.match(/(\d+)\s*mil/);
    if (milMatch) return parseInt(milMatch[1]) * 1000;
  }
  
  // Standalone number (last resort)
  const nums = text.match(/\b(\d+(?:[.,]\d+)?)\b/g);
  if (nums) {
    for (const n of nums) {
      const val = parseFloat(n.replace(",", "."));
      if (val > 0 && val < 1000000) return val;
    }
  }
  
  return null;
}

// ─── CARD/BANK DETECTION ───
function extractCardRef(text: string): string | null {
  const normalized = removeAccents(text.toLowerCase());
  // "final XXXX"
  const finalMatch = normalized.match(/final\s*(\d{4})/);
  if (finalMatch) return finalMatch[1];
  // "cartão do X"
  const cartaoDoMatch = normalized.match(/cart[aã]o\s+(?:do|da|de)\s+(\w+)/);
  if (cartaoDoMatch) return cartaoDoMatch[1];
  return null;
}

function extractBankRef(text: string): string | null {
  const normalized = removeAccents(text.toLowerCase());
  const banks = ["nubank", "itau", "bradesco", "santander", "inter", "c6", "caixa", "conta simples", "conta empresa"];
  for (const b of banks) {
    if (normalized.includes(b)) return b;
  }
  const contaMatch = normalized.match(/(?:conta|banco)\s+(\w+)/);
  if (contaMatch) return contaMatch[1];
  return null;
}

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

    // ─── VOICE MESSAGE → Transcription ───
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

          if (!uploadErr) fileUrl = storagePath;
        }
      }

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
      return await handlePendingContext(pendingContext, processedText, chatId, userId, fileUrl, fileName, update, supabase, LOVABLE_API_KEY, TELEGRAM_API_KEY, OPENAI_KEY);
    }

    // ─── FIRST MESSAGE: Smart extraction ───
    // 1. Try local keyword classification first
    const kwClassification = classifyByKeywords(processedText);
    const localStatus = detectStatus(processedText);
    const localDate = extractDate(processedText);
    const localValue = extractValue(processedText);
    const localCardRef = extractCardRef(processedText);
    const localBankRef = extractBankRef(processedText);

    // 2. Use AI for full extraction (description, missing fields)
    const extraction = await extractTransactionData(processedText, userId, supabase, OPENAI_KEY);

    if (!extraction || extraction.status === "not_financial") {
      const answer = await handleBIQuery(processedText, userId, supabase, OPENAI_KEY);
      await sendTelegram(chatId, answer, LOVABLE_API_KEY, TELEGRAM_API_KEY);
      return jsonResponse({ ok: true });
    }

    if (extraction.status === "incomplete" && !extraction.valor && !localValue) {
      const contextToStore = {
        step: "extraction",
        descricao: extraction.descricao || null,
        valor: localValue || extraction.valor || null,
        data_vencimento: localDate || extraction.data_vencimento || null,
        missing_question: extraction.missing_question,
      };
      await supabase.from("telegram_messages").update({ pending_context: contextToStore }).eq("update_id", update.update_id);
      await sendTelegram(chatId, `📝 ${contextToStore.descricao || "?"}\n\n❓ ${extraction.missing_question}`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
      return jsonResponse({ ok: true, incomplete: true });
    }

    // 3. Merge local + AI results (local takes priority for keywords)
    const descricao = extraction.descricao || processedText.substring(0, 100);
    const valor = localValue || extraction.valor;
    const dataVenc = localDate || extraction.data_vencimento || new Date().toISOString().split("T")[0];
    const statusPag = localStatus || extraction.status_pagamento || null;
    const cardRef = localCardRef || extraction.cartao_ref || null;
    const bankRef = localBankRef || extraction.banco_ref || null;
    const categoriaRef = kwClassification?.categoria || extraction.categoria_ref || null;
    const subcategoriaRef = kwClassification?.subcategoria || extraction.subcategoria || null;

    // 4. Build context and start confirmation flow
    const ctx: any = {
      step: "confirm",
      descricao,
      valor,
      data_vencimento: dataVenc,
      status_pagamento: statusPag,
      cartao_ref: cardRef,
      banco_ref: bankRef,
      categoria_ref: categoriaRef,
      subcategoria: subcategoriaRef,
      origem: extraction.origem || (cardRef ? "cartao" : null),
    };

    // Resolve categoria_id from name
    if (categoriaRef) {
      const { data: cat } = await supabase.from("categorias").select("id").eq("user_id", userId).ilike("nome", `%${categoriaRef}%`).limit(1).single();
      if (cat) ctx.categoria_id_resolved = cat.id;
    }

    // Resolve card
    if (cardRef) {
      const { data: card } = await supabase.from("cartoes").select("id, apelido, final_cartao, banco_id").eq("user_id", userId).is("deleted_at", null)
        .or(`final_cartao.eq.${cardRef},apelido.ilike.%${cardRef}%`).limit(1).single();
      if (card) {
        ctx.cartao_id_resolved = card.id;
        ctx.cartao_display = `${card.apelido} (${card.final_cartao})`;
        ctx.banco_id_resolved = card.banco_id;
        ctx.origem = "cartao";
      }
    }

    // Resolve bank
    if (bankRef && !ctx.banco_id_resolved) {
      const { data: bank } = await supabase.from("bancos").select("id, nome").eq("user_id", userId).ilike("nome", `%${bankRef}%`).limit(1).single();
      if (bank) {
        ctx.banco_id_resolved = bank.id;
        ctx.banco_display = bank.nome;
      }
    }

    // Determine what's missing
    const missing: string[] = [];
    if (!ctx.status_pagamento) missing.push("status");
    if (!ctx.cartao_id_resolved && !ctx.banco_id_resolved && !ctx.origem) missing.push("pagamento");
    if (!ctx.categoria_ref) missing.push("categoria");

    if (missing.length === 0) {
      // Everything identified! Show confirmation
      await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("update_id", update.update_id);
      return await showConfirmation(chatId, ctx, supabase, LOVABLE_API_KEY, TELEGRAM_API_KEY);
    }

    // Ask first missing field
    if (missing[0] === "status") {
      ctx.step = "ask_status";
      await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("update_id", update.update_id);
      await sendTelegram(chatId, `📝 Entendi: "${descricao}" por R$ ${Number(valor).toFixed(2)}.\n\n❓ Essa conta já foi paga ou ainda está pendente?`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
    } else if (missing[0] === "pagamento") {
      ctx.step = "ask_pagamento";
      await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("update_id", update.update_id);
      await sendTelegram(chatId, `📝 "${descricao}" por R$ ${Number(valor).toFixed(2)}.\n\n❓ Essa despesa foi no cartão ou debitou direto da conta? Se cartão, qual?`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
    } else if (missing[0] === "categoria") {
      ctx.step = "ask_categoria";
      await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("update_id", update.update_id);
      const { data: cats } = await supabase.from("categorias").select("id, nome").eq("user_id", userId).order("nome");
      const catList = (cats || []).map((c: any, i: number) => `${i + 1}. ${c.nome}`).join("\n");
      await sendTelegram(chatId, `📝 "${descricao}" por R$ ${Number(valor).toFixed(2)}.\n\n🏷️ Qual a categoria?\n\n${catList}`, LOVABLE_API_KEY, TELEGRAM_API_KEY);
    }

    return jsonResponse({ ok: true });

  } catch (err: any) {
    console.error("Agent error:", err);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
});

// ─── HANDLE PENDING CONTEXT ───
async function handlePendingContext(
  pendingContext: any, processedText: string, chatId: number, userId: string,
  fileUrl: string | null, fileName: string | null, update: any,
  supabase: any, lovableKey: string, telegramKey: string, openaiKey: string
) {
  const step = pendingContext.step || "extraction";
  const ctx = { ...pendingContext };

  if (step === "ask_status") {
    const status = detectStatus(processedText);
    if (status) {
      ctx.status_pagamento = status;
    } else if (/sim|pag|ja/i.test(removeAccents(processedText.toLowerCase()))) {
      ctx.status_pagamento = "pago";
    } else {
      ctx.status_pagamento = "pendente";
    }
    return await continueFlow(ctx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
  }

  if (step === "ask_pagamento") {
    const lower = removeAccents(processedText.toLowerCase().trim());
    if (/pix/i.test(lower)) {
      ctx.origem = "pix";
      ctx.step = "ask_banco_pix";
      await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("chat_id", chatId).not("pending_context", "is", null);
      const { data: bancos } = await supabase.from("bancos").select("nome").eq("user_id", userId);
      const bankList = (bancos || []).map((b: any, i: number) => `${i + 1}. ${b.nome}`).join("\n");
      await sendTelegram(chatId, `🏦 De qual banco sai o PIX?\n\n${bankList}`, lovableKey, telegramKey);
      return jsonResponse({ ok: true });
    }
    if (/cart[aã]o/i.test(lower) || /final\s*\d{4}/.test(lower)) {
      ctx.origem = "cartao";
      const finalMatch = lower.match(/final\s*(\d{4})/);
      if (finalMatch) {
        const { data: card } = await supabase.from("cartoes").select("id, apelido, final_cartao, banco_id").eq("user_id", userId).is("deleted_at", null).eq("final_cartao", finalMatch[1]).single();
        if (card) {
          ctx.cartao_id_resolved = card.id;
          ctx.cartao_display = `${card.apelido} (${card.final_cartao})`;
          ctx.banco_id_resolved = card.banco_id;
          return await continueFlow(ctx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
        }
      }
      ctx.step = "ask_cartao";
      await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("chat_id", chatId).not("pending_context", "is", null);
      const { data: cartoes } = await supabase.from("cartoes").select("apelido, final_cartao, tipo_funcao").eq("user_id", userId).is("deleted_at", null);
      const cardList = (cartoes || []).map((c: any, i: number) => `${i + 1}. ${c.apelido} (${c.final_cartao})`).join("\n");
      await sendTelegram(chatId, `💳 Qual cartão?\n\n${cardList}`, lovableKey, telegramKey);
      return jsonResponse({ ok: true });
    }
    if (/boleto/i.test(lower)) {
      ctx.origem = "boleto";
    } else if (/d[eé]bito/i.test(lower)) {
      ctx.origem = "debito_automatico";
    } else if (/dinheiro/i.test(lower)) {
      ctx.origem = "dinheiro";
    } else {
      // Try matching card/bank name
      const { data: matchCard } = await supabase.from("cartoes").select("id, apelido, final_cartao, banco_id").eq("user_id", userId).is("deleted_at", null).or(`apelido.ilike.%${lower}%,final_cartao.eq.${lower}`).limit(1).maybeSingle();
      if (matchCard) {
        ctx.origem = "cartao";
        ctx.cartao_id_resolved = matchCard.id;
        ctx.cartao_display = `${matchCard.apelido} (${matchCard.final_cartao})`;
        ctx.banco_id_resolved = matchCard.banco_id;
      } else {
        const { data: matchBank } = await supabase.from("bancos").select("id, nome").eq("user_id", userId).ilike("nome", `%${lower}%`).limit(1).maybeSingle();
        if (matchBank) {
          ctx.origem = "pix";
          ctx.banco_id_resolved = matchBank.id;
          ctx.banco_display = matchBank.nome;
        } else {
          ctx.origem = lower;
        }
      }
    }
    return await continueFlow(ctx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
  }

  if (step === "ask_banco_pix") {
    const { data: bancos } = await supabase.from("bancos").select("id, nome").eq("user_id", userId);
    const matched = (bancos || []).find((b: any, i: number) =>
      processedText.trim() === String(i + 1) || removeAccents(b.nome.toLowerCase()).includes(removeAccents(processedText.toLowerCase().trim()))
    );
    if (matched) {
      ctx.banco_id_resolved = matched.id;
      ctx.banco_display = matched.nome;
    }
    return await continueFlow(ctx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
  }

  if (step === "ask_cartao") {
    const { data: cartoes } = await supabase.from("cartoes").select("id, apelido, final_cartao, tipo_funcao, banco_id").eq("user_id", userId).is("deleted_at", null);
    const matched = (cartoes || []).find((c: any, i: number) =>
      processedText.trim() === String(i + 1) || removeAccents(c.apelido.toLowerCase()).includes(removeAccents(processedText.toLowerCase().trim())) || c.final_cartao === processedText.trim()
    );
    if (matched) {
      ctx.cartao_id_resolved = matched.id;
      ctx.cartao_display = `${matched.apelido} (${matched.final_cartao})`;
      ctx.banco_id_resolved = matched.banco_id;
    }
    return await continueFlow(ctx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
  }

  if (step === "ask_categoria") {
    const { data: cats } = await supabase.from("categorias").select("id, nome").eq("user_id", userId).order("nome");
    const matched = (cats || []).find((c: any, i: number) =>
      processedText.trim() === String(i + 1) || removeAccents(c.nome.toLowerCase()).includes(removeAccents(processedText.toLowerCase().trim()))
    );
    if (matched) {
      ctx.categoria_ref = matched.nome;
      ctx.categoria_id_resolved = matched.id;
      
      // Check for subcategories from DB
      const { data: subs } = await (supabase as any).from("subcategorias").select("id, nome").eq("categoria_id", matched.id).order("nome");
      if (subs && subs.length > 0) {
        ctx.step = "ask_subcategoria";
        ctx.available_subs = subs;
        await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("chat_id", chatId).not("pending_context", "is", null);
        const subList = subs.map((s: any, i: number) => `${i + 1}. ${s.nome}`).join("\n");
        await sendTelegram(chatId, `📂 Subcategoria de ${matched.nome}:\n\n${subList}`, lovableKey, telegramKey);
        return jsonResponse({ ok: true });
      }
    }
    return await continueFlow(ctx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
  }

  if (step === "ask_subcategoria") {
    const subs = ctx.available_subs || [];
    const matched = subs.find((s: any, i: number) =>
      processedText.trim() === String(i + 1) || removeAccents(s.nome.toLowerCase()).includes(removeAccents(processedText.toLowerCase().trim()))
    );
    ctx.subcategoria = matched?.nome || processedText.trim();
    return await continueFlow(ctx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
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
    // Re-show confirmation
    return await showConfirmation(chatId, ctx, supabase, lovableKey, telegramKey);
  }

  // Legacy extraction step
  if (step === "extraction") {
    let enrichedText = `Contexto anterior: Descrição="${pendingContext.descricao || ""}", Valor=${pendingContext.valor || "?"}, Data=${pendingContext.data_vencimento || "?"}. Resposta do usuário: "${processedText}". Combine tudo.`;
    await supabase.from("telegram_messages").update({ pending_context: null }).eq("chat_id", chatId).not("pending_context", "is", null);

    const extraction = await extractTransactionData(enrichedText, userId, supabase, openaiKey);
    if (extraction && (extraction.status === "complete" || extraction.valor)) {
      const newCtx: any = {
        step: "ask_status",
        descricao: extraction.descricao || pendingContext.descricao,
        valor: extraction.valor || pendingContext.valor || extractValue(processedText),
        data_vencimento: extraction.data_vencimento || pendingContext.data_vencimento || new Date().toISOString().split("T")[0],
        origem: extraction.origem,
        cartao_ref: extraction.cartao_ref,
        banco_ref: extraction.banco_ref,
        categoria_ref: classifyByKeywords(extraction.descricao || pendingContext.descricao || "")?.categoria || extraction.categoria_ref,
        subcategoria: classifyByKeywords(extraction.descricao || pendingContext.descricao || "")?.subcategoria || extraction.subcategoria,
        status_pagamento: detectStatus(processedText) || extraction.status_pagamento,
      };
      
      if (newCtx.status_pagamento) {
        return await continueFlow(newCtx, chatId, userId, fileUrl, fileName, update, supabase, lovableKey, telegramKey);
      }
      
      await supabase.from("telegram_messages").update({ pending_context: newCtx }).eq("chat_id", chatId).not("pending_context", "is", null);
      await sendTelegram(chatId, `📝 "${newCtx.descricao}" por R$ ${Number(newCtx.valor).toFixed(2)}.\n\n❓ Já foi pago ou está pendente?`, lovableKey, telegramKey);
      return jsonResponse({ ok: true });
    }
    
    if (extraction && extraction.status === "incomplete") {
      const contextToStore = {
        step: "extraction",
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

// ─── CONTINUE FLOW (check what's still missing) ───
async function continueFlow(
  ctx: any, chatId: number, userId: string,
  fileUrl: string | null, fileName: string | null, update: any,
  supabase: any, lovableKey: string, telegramKey: string
) {
  const missing: string[] = [];
  if (!ctx.status_pagamento) missing.push("status");
  if (!ctx.cartao_id_resolved && !ctx.banco_id_resolved && !ctx.origem) missing.push("pagamento");
  if (!ctx.categoria_ref) missing.push("categoria");

  if (missing.length === 0) {
    ctx.step = "confirm";
    await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("chat_id", chatId).not("pending_context", "is", null);
    return await showConfirmation(chatId, ctx, supabase, lovableKey, telegramKey);
  }

  const nextMissing = missing[0];
  if (nextMissing === "status") {
    ctx.step = "ask_status";
    await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("chat_id", chatId).not("pending_context", "is", null);
    await sendTelegram(chatId, `❓ Essa conta já foi paga ou ainda está pendente?`, lovableKey, telegramKey);
  } else if (nextMissing === "pagamento") {
    ctx.step = "ask_pagamento";
    await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("chat_id", chatId).not("pending_context", "is", null);
    await sendTelegram(chatId, `❓ Essa despesa foi no cartão ou debitou direto da conta? Se cartão, qual?`, lovableKey, telegramKey);
  } else if (nextMissing === "categoria") {
    ctx.step = "ask_categoria";
    await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("chat_id", chatId).not("pending_context", "is", null);
    const { data: cats } = await supabase.from("categorias").select("id, nome").eq("user_id", userId).order("nome");
    const catList = (cats || []).map((c: any, i: number) => `${i + 1}. ${c.nome}`).join("\n");
    await sendTelegram(chatId, `🏷️ Qual a categoria?\n\n${catList}`, lovableKey, telegramKey);
  }

  return jsonResponse({ ok: true });
}

// ─── SHOW CONFIRMATION ───
async function showConfirmation(chatId: number, ctx: any, supabase: any, lovableKey: string, telegramKey: string) {
  const fmtDate = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };
  
  let msg = `📋 Vou cadastrar:\n\n`;
  msg += `📝 ${ctx.descricao}\n`;
  msg += `💰 R$ ${Number(ctx.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
  msg += `📅 ${ctx.data_vencimento ? fmtDate(ctx.data_vencimento) : "Hoje"}\n`;
  msg += `📊 Status: ${ctx.status_pagamento === "pago" ? "✅ Pago" : "⏳ Pendente"}\n`;
  if (ctx.categoria_ref) msg += `🏷️ ${ctx.categoria_ref}`;
  if (ctx.subcategoria) msg += ` > ${ctx.subcategoria}`;
  if (ctx.categoria_ref) msg += `\n`;
  if (ctx.cartao_display) msg += `💳 ${ctx.cartao_display}\n`;
  else if (ctx.banco_display) msg += `🏦 ${ctx.banco_display}\n`;
  else if (ctx.origem) msg += `💳 ${ctx.origem}\n`;
  msg += `\n✅ Está correto? (sim/não)`;
  
  await sendTelegram(chatId, msg, lovableKey, telegramKey);
  return jsonResponse({ ok: true });
}

// ─── FINALIZE TRANSACTION ───
async function finalizeTransaction(
  chatId: number, userId: string, ctx: any,
  fileUrl: string | null, fileName: string | null, update: any,
  supabase: any, lovableKey: string, telegramKey: string
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

  if (ctx.cartao_id_resolved) txData.cartao_id = ctx.cartao_id_resolved;
  else if (ctx.cartao_ref) {
    const { data: cartao } = await supabase.from("cartoes").select("id, banco_id").eq("user_id", userId)
      .or(`apelido.ilike.%${ctx.cartao_ref}%,final_cartao.eq.${ctx.cartao_ref}`).limit(1).single();
    if (cartao) { txData.cartao_id = cartao.id; if (cartao.banco_id) txData.banco_id = cartao.banco_id; }
  }

  if (ctx.banco_id_resolved) txData.banco_id = ctx.banco_id_resolved;
  else if (ctx.banco_ref && !txData.banco_id) {
    const { data: banco } = await supabase.from("bancos").select("id").eq("user_id", userId).ilike("nome", `%${ctx.banco_ref}%`).limit(1).single();
    if (banco) txData.banco_id = banco.id;
  }

  if (ctx.categoria_id_resolved) txData.categoria_id = ctx.categoria_id_resolved;
  else if (ctx.categoria_ref) {
    const { data: cat } = await supabase.from("categorias").select("id").eq("user_id", userId).ilike("nome", `%${ctx.categoria_ref}%`).limit(1).single();
    if (cat) txData.categoria_id = cat.id;
  }

  // Deduct card limit for credit card transactions
  if (txData.cartao_id) {
    const { data: card } = await supabase.from("cartoes").select("limite_disponivel").eq("id", txData.cartao_id).single();
    if (card) {
      await supabase.from("cartoes").update({ limite_disponivel: card.limite_disponivel - ctx.valor }).eq("id", txData.cartao_id);
    }
  }

  const { data: newTx, error: txErr } = await supabase.from("transacoes").insert(txData).select("id").single();

  if (txErr) {
    await sendTelegram(chatId, `❌ Erro ao registrar: ${txErr.message}`, lovableKey, telegramKey);
    return jsonResponse({ ok: false, error: txErr.message });
  }

  // Save preference
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

  // Build confirmation response
  const fmtDate = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };
  let response = `✅ Cadastrado!\n\n`;
  response += `📝 ${ctx.descricao}\n`;
  response += `💰 R$ ${Number(ctx.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
  response += `📅 ${ctx.data_vencimento ? fmtDate(ctx.data_vencimento) : "Hoje"}\n`;
  response += `📊 ${txData.status === "pago" ? "✅ Pago" : "⏳ Pendente"}`;
  if (ctx.categoria_ref) response += `\n🏷️ ${ctx.categoria_ref}`;
  if (ctx.subcategoria) response += ` > ${ctx.subcategoria}`;
  if (ctx.cartao_display) response += `\n💳 ${ctx.cartao_display}`;
  else if (ctx.banco_display) response += `\n🏦 ${ctx.banco_display}`;

  if (!fileUrl) {
    response += `\n\n📎 Envie o comprovante agora para vincular.`;
  } else {
    response += `\n📎 Comprovante anexado!`;
  }

  await sendTelegram(chatId, response, lovableKey, telegramKey);
  return jsonResponse({ ok: true, transaction_id: newTx.id });
}

// ─── COMMAND HANDLER ───
async function handleCommand(
  text: string, chatId: number, userId: string, userRole: string,
  supabase: any, lovableKey: string, telegramKey: string, openaiKey: string
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
      const cardExtraction = await extractCardData(argStr, userId, supabase, openaiKey);
      if (!cardExtraction || cardExtraction.status === "incomplete") { await sendTelegram(chatId, `❓ ${cardExtraction?.missing || "Informe todos os dados."}`, lovableKey, telegramKey); break; }
      let bancoId: string | null = null;
      if (cardExtraction.banco_ref) {
        const { data: banco } = await supabase.from("bancos").select("id").eq("user_id", userId).ilike("nome", `%${cardExtraction.banco_ref}%`).limit(1).single();
        if (banco) bancoId = banco.id;
      }
      const { data: newCard, error: cardErr } = await supabase.from("cartoes").insert({
        apelido: cardExtraction.apelido, final_cartao: cardExtraction.final_cartao, bandeira: cardExtraction.bandeira, tipo_funcao: cardExtraction.tipo_funcao,
        formato: cardExtraction.formato || "fisico", limite_total: cardExtraction.limite_total || 0, limite_disponivel: cardExtraction.limite_total || 0,
        dia_fechamento: cardExtraction.dia_fechamento, dia_vencimento: cardExtraction.dia_vencimento, data_validade: cardExtraction.data_validade || null,
        banco_id: bancoId, user_id: userId,
      }).select("apelido, final_cartao, bandeira").single();
      if (cardErr) { await sendTelegram(chatId, `❌ ${cardErr.message}`, lovableKey, telegramKey); }
      else { await sendTelegram(chatId, `💳 ${newCard.apelido} (${newCard.final_cartao}) ${newCard.bandeira} cadastrado!`, lovableKey, telegramKey); }
      break;
    }

    case "/nova_conta": {
      if (!argStr) { await sendTelegram(chatId, "Use: /nova_conta [dados]\nOu escreva em linguagem natural!", lovableKey, telegramKey); break; }
      // Reuse the NLP flow by processing as a regular message
      const kwClass = classifyByKeywords(argStr);
      const localVal = extractValue(argStr);
      const localDt = extractDate(argStr);
      const localSt = detectStatus(argStr);
      
      const txExtraction = await extractTransactionData(argStr, userId, supabase, openaiKey);
      if (!txExtraction || txExtraction.status === "not_financial") { await sendTelegram(chatId, "❌ Não entendi. Tente novamente.", lovableKey, telegramKey); break; }
      
      const ctx: any = {
        step: "ask_status",
        descricao: txExtraction.descricao || argStr.substring(0, 100),
        valor: localVal || txExtraction.valor,
        data_vencimento: localDt || txExtraction.data_vencimento || new Date().toISOString().split("T")[0],
        categoria_ref: kwClass?.categoria || txExtraction.categoria_ref,
        subcategoria: kwClass?.subcategoria || txExtraction.subcategoria,
        status_pagamento: localSt || txExtraction.status_pagamento,
        origem: txExtraction.origem,
        cartao_ref: extractCardRef(argStr) || txExtraction.cartao_ref,
        banco_ref: extractBankRef(argStr) || txExtraction.banco_ref,
      };

      if (!ctx.valor) {
        const contextToStore = { step: "extraction", descricao: ctx.descricao, missing_question: "Qual o valor?" };
        await supabase.from("telegram_messages").update({ pending_context: contextToStore }).eq("update_id", update.update_id);
        await sendTelegram(chatId, `📝 ${ctx.descricao}\n\n❓ Qual o valor?`, lovableKey, telegramKey);
        break;
      }

      // Resolve category
      if (ctx.categoria_ref) {
        const { data: cat } = await supabase.from("categorias").select("id").eq("user_id", userId).ilike("nome", `%${ctx.categoria_ref}%`).limit(1).single();
        if (cat) ctx.categoria_id_resolved = cat.id;
      }

      if (ctx.status_pagamento) {
        await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("update_id", update.update_id);
        return await continueFlow(ctx, chatId, userId, null, null, update, supabase, lovableKey, telegramKey);
      }

      await supabase.from("telegram_messages").update({ pending_context: ctx }).eq("update_id", update.update_id);
      await sendTelegram(chatId, `📝 "${ctx.descricao}" por R$ ${Number(ctx.valor).toFixed(2)}.\n\n❓ Já foi pago ou está pendente?`, lovableKey, telegramKey);
      break;
    }

    case "/relatorio": {
      let rMonth: number, rYear: number;
      if (argStr) { const rParts = argStr.split(/[\s\/\-]+/); rMonth = Number(rParts[0]); rYear = rParts[1] ? Number(rParts[1]) : new Date().getFullYear(); }
      else { rMonth = new Date().getMonth() + 1; rYear = new Date().getFullYear(); }
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
      for (const t of rTxs) { const catName = (t as any).categorias?.nome || "Sem categoria"; byCat[catName] = (byCat[catName] || 0) + Number(t.valor); }
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
      const recExtraction = await extractRecurrenceData(argStr, userId, supabase, openaiKey);
      if (!recExtraction || recExtraction.status === "incomplete") { await sendTelegram(chatId, `❓ ${recExtraction?.missing || "Informe nome, valor e dia."}`, lovableKey, telegramKey); break; }
      const recData: any = { nome: recExtraction.nome, valor_estimado: recExtraction.valor_estimado || 0, dia_vencimento_padrao: recExtraction.dia_vencimento, eh_variavel: recExtraction.eh_variavel || false, origem: recExtraction.origem || null, user_id: userId };
      if (recExtraction.banco_ref) { const { data: banco } = await supabase.from("bancos").select("id").eq("user_id", userId).ilike("nome", `%${recExtraction.banco_ref}%`).limit(1).single(); if (banco) recData.banco_id = banco.id; }
      if (recExtraction.cartao_ref) { const { data: cartao } = await supabase.from("cartoes").select("id").eq("user_id", userId).or(`apelido.ilike.%${recExtraction.cartao_ref}%,final_cartao.eq.${recExtraction.cartao_ref}`).limit(1).single(); if (cartao) recData.cartao_id = cartao.id; }
      if (recExtraction.categoria_ref) { const { data: cat } = await supabase.from("categorias").select("id").eq("user_id", userId).ilike("nome", `%${recExtraction.categoria_ref}%`).limit(1).single(); if (cat) recData.categoria_id = cat.id; }
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
      const { data: lembs } = await supabase
        .from("lembretes")
        .select("id, titulo, descricao, data_lembrete")
        .eq("user_id", userId)
        .eq("confirmado", false)
        .order("data_lembrete", { nullsFirst: false });
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

// ─── CARD DATA EXTRACTION ───
async function extractCardData(text: string, _userId: string, _supabase: any, apiKey: string) {
  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: `Extraia dados de cartão. Obrigatórios: apelido, final_cartao (4 dígitos), bandeira (visa/mastercard/elo/amex), tipo_funcao (debito/credito/multiplo), dia_fechamento, dia_vencimento. Opcionais: limite_total, formato (fisico/virtual), data_validade (YYYY-MM-DD), banco_ref. Se faltar obrigatório: status "incomplete" + missing.` },
        { role: "user", content: text },
      ],
      tools: [{ type: "function", function: { name: "extract_card", description: "Extract card data", parameters: { type: "object", properties: { status: { type: "string", enum: ["complete", "incomplete"] }, apelido: { type: "string" }, final_cartao: { type: "string" }, bandeira: { type: "string", enum: ["visa", "mastercard", "elo", "amex"] }, tipo_funcao: { type: "string", enum: ["debito", "credito", "multiplo"] }, formato: { type: "string", enum: ["fisico", "virtual"] }, limite_total: { type: "number" }, dia_fechamento: { type: "number" }, dia_vencimento: { type: "number" }, data_validade: { type: "string" }, banco_ref: { type: "string" }, missing: { type: "string" } }, required: ["status"] } } }],
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
async function extractRecurrenceData(text: string, _userId: string, _supabase: any, apiKey: string) {
  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: `Extraia dados de conta recorrente. Obrigatórios: nome, dia_vencimento. Opcionais: valor_estimado, eh_variavel, origem, banco_ref, cartao_ref, categoria_ref. Se faltar: status "incomplete" + missing.` },
        { role: "user", content: text },
      ],
      tools: [{ type: "function", function: { name: "extract_recurrence", description: "Extract recurrence data", parameters: { type: "object", properties: { status: { type: "string", enum: ["complete", "incomplete"] }, nome: { type: "string" }, valor_estimado: { type: "number" }, dia_vencimento: { type: "number" }, eh_variavel: { type: "boolean" }, origem: { type: "string" }, banco_ref: { type: "string" }, cartao_ref: { type: "string" }, categoria_ref: { type: "string" }, missing: { type: "string" } }, required: ["status"] } } }],
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
async function extractTransactionData(text: string, _userId: string, _supabase: any, apiKey: string) {
  const today = new Date().toISOString().split("T")[0];
  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [
        { role: "system", content: `Você é um assistente de REGISTRO financeiro do Smart Ledger. Seu ÚNICO papel é REGISTRAR transações que o usuário informa. Você NÃO realiza transferências, NÃO consulta saldo para autorizar, NÃO executa débitos reais, NÃO orienta sobre como fazer transferências, NÃO fala sobre saldo disponível como critério.

REGRA CRÍTICA DE INTENÇÃO: Quando o usuário usar verbos no passado ("paguei", "acabei de pagar", "já paguei", "quitei", "liquidei", "saiu da conta", "debitou", "foi debitado", "caiu no cartão", "fiz o pix", "mandei o pix", "transferi"), entenda que o pagamento JÁ FOI FEITO e precisa ser REGISTRADO com status_pagamento = "pago". NUNCA interprete isso como pedido de transferência bancária.

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
- Extraia: descricao, valor, data_vencimento, status_pagamento, origem, cartao_ref, banco_ref, categoria_ref, subcategoria` },
        { role: "user", content: text },
      ],
      tools: [{ type: "function", function: { name: "extract_transaction", description: "Extract transaction", parameters: { type: "object", properties: { status: { type: "string", enum: ["complete", "incomplete", "not_financial"] }, descricao: { type: "string" }, valor: { type: "number" }, data_vencimento: { type: "string" }, data_pagamento: { type: "string" }, status_pagamento: { type: "string", enum: ["pendente", "pago"] }, categoria_tipo: { type: "string" }, origem: { type: "string" }, cartao_ref: { type: "string" }, banco_ref: { type: "string" }, categoria_ref: { type: "string" }, subcategoria: { type: "string" }, missing_question: { type: "string" } }, required: ["status"] } } }],
      tool_choice: { type: "function", function: { name: "extract_transaction" } },
    }),
  });
  if (!response.ok) { console.error("AI extraction failed:", response.status); return null; }
  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return null;
  try { return JSON.parse(toolCall.function.arguments); } catch { return null; }
}

// ─── BI QUERY ───
async function handleBIQuery(question: string, userId: string, supabase: any, apiKey: string) {
  const threeMonthsAgo = new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1).toISOString().split("T")[0];
  const { data: recentTxs } = await supabase.from("transacoes").select("descricao, valor, data_vencimento, status, categoria_tipo").eq("user_id", userId).is("deleted_at", null).gte("data_vencimento", threeMonthsAgo).order("data_vencimento", { ascending: false }).limit(100);
  const { data: bancos } = await supabase.from("bancos").select("nome, saldo_atual").eq("user_id", userId);
  const { data: cartoes } = await supabase.from("cartoes").select("apelido, limite_total, limite_disponivel").eq("user_id", userId).is("deleted_at", null);
  const context = JSON.stringify({ transacoes_recentes: recentTxs || [], bancos: bancos || [], cartoes: cartoes || [], data_atual: new Date().toISOString().split("T")[0] });
  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: AI_MODEL, messages: [{ role: "system", content: `Assistente financeiro. Responda em PT-BR. Use emojis. Formate R$ X.XXX,XX. Datas dd/mm/aaaa. NUNCA invente números.` }, { role: "user", content: `Dados:\n${context}\n\nPergunta: ${question}` }] }),
  });
  if (!response.ok) return "❌ Erro ao processar. Tente novamente.";
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "❌ Sem resposta.";
}

// ─── ORPHAN FILE ───
async function handleOrphanFile(chatId: number, userId: string, fileUrl: string, fileName: string, supabase: any, lovableKey: string, telegramKey: string) {
  const { data: pendingTxs } = await supabase.from("transacoes").select("id, descricao, valor, data_vencimento").eq("user_id", userId).is("deleted_at", null).in("status", ["pendente", "pago"]).order("data_vencimento", { ascending: false }).limit(20);
  if (!pendingTxs?.length) { await sendTelegram(chatId, "📎 Arquivo recebido, mas não encontrei transações.", lovableKey, telegramKey); return jsonResponse({ ok: true }); }
  const txIds = pendingTxs.map((t: any) => t.id);
  const { data: existingComps } = await supabase.from("comprovantes").select("transacao_id").in("transacao_id", txIds);
  const compSet = new Set((existingComps || []).map((c: any) => c.transacao_id));
  const withoutComp = pendingTxs.filter((t: any) => !compSet.has(t.id));
  if (!withoutComp.length) { await sendTelegram(chatId, "📎 Todas as transações já possuem comprovante.", lovableKey, telegramKey); return jsonResponse({ ok: true }); }
  const target = withoutComp[0];
  await supabase.from("comprovantes").insert({ transacao_id: target.id, file_path: fileUrl, file_name: fileName, file_type: fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg", uploaded_by: userId });
  const [y, m, d] = target.data_vencimento.split("-");
  await sendTelegram(chatId, `📎 Comprovante vinculado a: ${target.descricao} - R$ ${Number(target.valor).toFixed(2)} (${d}/${m}/${y})`, lovableKey, telegramKey);
  return jsonResponse({ ok: true });
}

// ─── AUDIO TRANSCRIPTION ───
async function transcribeAudio(fileId: string, lovableKey: string, telegramKey: string, openaiKey: string): Promise<string | null> {
  try {
    const fileResponse = await fetch(`${GATEWAY_URL}/getFile`, { method: "POST", headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": telegramKey, "Content-Type": "application/json" }, body: JSON.stringify({ file_id: fileId }) });
    const fileData = await fileResponse.json();
    const filePath = fileData.result?.file_path;
    if (!filePath) return null;
    const downloadResp = await fetch(`${GATEWAY_URL}/file/${filePath}`, { headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": telegramKey } });
    if (!downloadResp.ok) return null;
    const audioBytes = await downloadResp.arrayBuffer();
    const formData = new FormData();
    formData.append("file", new Blob([audioBytes], { type: "audio/ogg" }), "audio.ogg");
    formData.append("model", "whisper-1");
    formData.append("language", "pt");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${openaiKey}` }, body: formData });
    if (!response.ok) return null;
    const data = await response.json();
    return data.text || null;
  } catch (e) { console.error("Transcription error:", e); return null; }
}

// ─── TELEGRAM SEND ───
async function sendTelegram(chatId: number, text: string, lovableKey: string, telegramKey: string, parseMode?: string) {
  const primaryAttempt = await postTelegramMessage(chatId, text, lovableKey, telegramKey, parseMode);
  if (primaryAttempt.ok) return primaryAttempt;
  if (!parseMode) throw new Error(`Telegram send failed (${primaryAttempt.status})`);
  const fallbackAttempt = await postTelegramMessage(chatId, text, lovableKey, telegramKey);
  if (fallbackAttempt.ok) return fallbackAttempt;
  throw new Error(`Telegram send failed (${primaryAttempt.status}/${fallbackAttempt.status})`);
}

async function postTelegramMessage(chatId: number, text: string, lovableKey: string, telegramKey: string, parseMode?: string) {
  const payload: Record<string, unknown> = { chat_id: chatId, text };
  if (parseMode) payload.parse_mode = parseMode;
  const response = await fetch(`${GATEWAY_URL}/sendMessage`, { method: "POST", headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": telegramKey, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const body = await response.text();
  try { const parsed = body ? JSON.parse(body) : null; if (!response.ok || parsed?.ok === false) return { ok: false, status: response.status, body }; } catch { if (!response.ok) return { ok: false, status: response.status, body }; }
  return { ok: true, status: response.status, body };
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}
