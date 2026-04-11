// ═══════════════════════════════════════════════════════════════
// FINANCIAL AGENT — AI INTEGRATION (LLM calls)
// ═══════════════════════════════════════════════════════════════

import {
  buildExtractionPrompt, EXTRACTION_TOOLS,
  CARD_EXTRACTION_PROMPT, CARD_EXTRACTION_TOOLS,
  RECURRENCE_EXTRACTION_PROMPT, RECURRENCE_EXTRACTION_TOOLS,
  buildBIPrompt,
} from "./prompts.ts";
import { getUserCategories } from "./services.ts";
import type { ExtractionResult, CardExtractionResult, RecurrenceExtractionResult } from "./types.ts";

const AI_GATEWAY = "https://api.openai.com/v1/chat/completions";
const AI_MODEL = "gpt-4o-mini";

async function callAI(
  apiKey: string,
  systemPrompt: string,
  userContent: string,
  tools?: any[],
  toolChoice?: any
): Promise<any> {
  const body: any = {
    model: AI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  };
  if (tools) {
    body.tools = tools;
    body.tool_choice = toolChoice;
  }

  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error("AI call failed:", response.status);
    return null;
  }

  return await response.json();
}

function extractToolResult(data: any): any {
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) return null;
  try {
    return JSON.parse(toolCall.function.arguments);
  } catch {
    return null;
  }
}

// ─── Transaction Extraction ───
export async function extractTransactionData(
  text: string,
  userId: string,
  supabase: any,
  apiKey: string
): Promise<ExtractionResult | null> {
  const today = new Date().toISOString().split("T")[0];
  const cats = await getUserCategories(supabase, userId);
  const catNames = cats.map(c => c.nome).join(", ");

  const systemPrompt = buildExtractionPrompt(today, catNames);
  const data = await callAI(
    apiKey, systemPrompt, text,
    EXTRACTION_TOOLS,
    { type: "function", function: { name: "extract_transaction" } }
  );

  return extractToolResult(data);
}

// ─── Card Extraction ───
export async function extractCardData(
  text: string,
  apiKey: string
): Promise<CardExtractionResult | null> {
  const data = await callAI(
    apiKey, CARD_EXTRACTION_PROMPT, text,
    CARD_EXTRACTION_TOOLS,
    { type: "function", function: { name: "extract_card" } }
  );
  return extractToolResult(data);
}

// ─── Recurrence Extraction ───
export async function extractRecurrenceData(
  text: string,
  apiKey: string
): Promise<RecurrenceExtractionResult | null> {
  const data = await callAI(
    apiKey, RECURRENCE_EXTRACTION_PROMPT, text,
    RECURRENCE_EXTRACTION_TOOLS,
    { type: "function", function: { name: "extract_recurrence" } }
  );
  return extractToolResult(data);
}

// ─── BI / Natural language query ───
export async function handleBIQuery(
  question: string,
  userId: string,
  supabase: any,
  apiKey: string
): Promise<string> {
  const threeMonthsAgo = new Date(
    new Date().getFullYear(),
    new Date().getMonth() - 3,
    1
  ).toISOString().split("T")[0];

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
    data_atual: new Date().toISOString().split("T")[0],
  });

  const systemPrompt = buildBIPrompt();
  const data = await callAI(apiKey, systemPrompt, `Dados:\n${context}\n\nPergunta: ${question}`);

  return data?.choices?.[0]?.message?.content || "❌ Sem resposta.";
}

// ─── Audio Transcription ───
export async function transcribeAudio(
  fileId: string,
  gatewayUrl: string,
  lovableKey: string,
  telegramKey: string,
  openaiKey: string
): Promise<string | null> {
  try {
    const fileResponse = await fetch(`${gatewayUrl}/getFile`, {
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

    const downloadResp = await fetch(`${gatewayUrl}/file/${filePath}`, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
      },
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
