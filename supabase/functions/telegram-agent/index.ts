// ═══════════════════════════════════════════════════════════════
// TELEGRAM AGENT — THIN ENTRY POINT
// Delegates all logic to the financial-agent shared module
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { processMessage, jsonResponse } from "../_shared/financial-agent/index.ts";

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} not configured`);
  return value;
}

Deno.serve(async (req) => {
  try {
    const { update } = await req.json();
    if (!update?.message) return jsonResponse({ ok: true, skipped: true });

    const lovableKey = getRequiredEnv("LOVABLE_API_KEY");
    const openaiKey = getRequiredEnv("OPENIA_API_KEY");
    const telegramKey = getRequiredEnv("TELEGRAM_API_KEY");
    const supabaseUrl = getRequiredEnv("SUPABASE_URL");
    const serviceKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    return await processMessage(update, supabase, lovableKey, telegramKey, openaiKey);
  } catch (err: any) {
    console.error("Agent error:", err);
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
});
