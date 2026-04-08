import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

Deno.serve(async (_req) => {
  const startTime = Date.now();
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return errorResponse("LOVABLE_API_KEY not configured");

    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
    if (!TELEGRAM_API_KEY) return errorResponse("TELEGRAM_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let totalProcessed = 0;

    // Read initial offset
    const { data: state, error: stateErr } = await supabase
      .from("telegram_bot_state")
      .select("update_offset")
      .eq("id", 1)
      .single();

    if (stateErr) return errorResponse(stateErr.message);
    let currentOffset = state.update_offset;

    // Poll continuously until time runs out (~55s)
    while (true) {
      const elapsed = Date.now() - startTime;
      const remainingMs = MAX_RUNTIME_MS - elapsed;

      if (remainingMs < MIN_REMAINING_MS) break;

      // Dynamic timeout: up to 20s, but never exceed remaining time minus buffer
      const timeout = Math.min(20, Math.floor(remainingMs / 1000) - 5);
      if (timeout < 1) break;

      const response = await fetch(`${GATEWAY_URL}/getUpdates`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": TELEGRAM_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offset: currentOffset,
          timeout,
          allowed_updates: ["message"],
        }),
      });

      const data = await response.json();
      if (!response.ok) return errorResponse(JSON.stringify(data), 502);

      const updates = data.result ?? [];
      if (updates.length === 0) continue;

      // Store messages
      const rows = updates
        .filter((u: any) => u.message)
        .map((u: any) => ({
          update_id: u.update_id,
          chat_id: u.message.chat.id,
          text: u.message.text ?? null,
          raw_update: u,
        }));

      if (rows.length > 0) {
        await supabase
          .from("telegram_messages")
          .upsert(rows, { onConflict: "update_id" });
      }

      // Advance offset
      const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
      await supabase
        .from("telegram_bot_state")
        .update({ update_offset: newOffset, updated_at: new Date().toISOString() })
        .eq("id", 1);
      currentOffset = newOffset;

      // Process each update through the agent
      for (const update of updates) {
        if (!update.message) continue;
        try {
          const agentResp = await fetch(`${supabaseUrl}/functions/v1/telegram-agent`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ update }),
          });
          const agentResultText = await agentResp.text();
          console.log(`Agent response for update ${update.update_id}:`, agentResultText);

          let agentResult: { ok?: boolean } | null = null;
          try {
            agentResult = JSON.parse(agentResultText);
          } catch {
            agentResult = null;
          }

          if (agentResp.ok && agentResult?.ok !== false) {
            await supabase
              .from("telegram_messages")
              .update({ processed: true })
              .eq("update_id", update.update_id);
            totalProcessed++;
          } else {
            console.error(`telegram-agent failed for update ${update.update_id}:`, {
              status: agentResp.status,
              body: agentResultText,
            });
          }
        } catch (e) {
          console.error("Error calling telegram-agent:", e);
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed: totalProcessed, finalOffset: currentOffset }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Poll error:", err);
    return errorResponse(err.message);
  }
});

function errorResponse(msg: string, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
