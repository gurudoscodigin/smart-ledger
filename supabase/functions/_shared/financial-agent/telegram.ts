// ═══════════════════════════════════════════════════════════════
// FINANCIAL AGENT — TELEGRAM INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

export { GATEWAY_URL };

export async function sendTelegram(
  chatId: number,
  text: string,
  lovableKey: string,
  telegramKey: string,
  parseMode?: string
): Promise<{ ok: boolean; status: number; body: string }> {
  const primary = await postTelegramMessage(chatId, text, lovableKey, telegramKey, parseMode);
  if (primary.ok) return primary;
  if (!parseMode) throw new Error(`Telegram send failed (${primary.status})`);
  const fallback = await postTelegramMessage(chatId, text, lovableKey, telegramKey);
  if (fallback.ok) return fallback;
  throw new Error(`Telegram send failed (${primary.status}/${fallback.status})`);
}

async function postTelegramMessage(
  chatId: number,
  text: string,
  lovableKey: string,
  telegramKey: string,
  parseMode?: string
): Promise<{ ok: boolean; status: number; body: string }> {
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
    if (!response.ok || parsed?.ok === false)
      return { ok: false, status: response.status, body };
  } catch {
    if (!response.ok) return { ok: false, status: response.status, body };
  }
  return { ok: true, status: response.status, body };
}

export function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── File download from Telegram ───
export async function downloadTelegramFile(
  fileId: string,
  lovableKey: string,
  telegramKey: string
): Promise<{ bytes: Uint8Array; filePath: string } | null> {
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

  const bytes = new Uint8Array(await downloadResp.arrayBuffer());
  return { bytes, filePath };
}
