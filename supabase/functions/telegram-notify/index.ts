import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

Deno.serve(async (req) => {
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all profiles with telegram_id
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, telegram_id, display_name")
      .not("telegram_id", "is", null);

    if (!profiles?.length) {
      return new Response(JSON.stringify({ ok: true, notified: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let notified = 0;
    const today = new Date().toISOString().split("T")[0];
    const threeDaysFromNow = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];

    for (const profile of profiles) {
      const userId = profile.user_id;
      const chatId = Number(profile.telegram_id);
      if (!chatId) continue;

      // 1. Pending comprovantes (today's transactions without receipt)
      const { data: todayTxs } = await supabase
        .from("transacoes")
        .select("id, descricao, valor")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .eq("data_vencimento", today)
        .in("status", ["pendente", "pago"]);

      const txIds = (todayTxs || []).map((t: any) => t.id);
      let pendingReceipts: any[] = [];

      if (txIds.length > 0) {
        const { data: comps } = await supabase
          .from("comprovantes")
          .select("transacao_id")
          .in("transacao_id", txIds);
        const compSet = new Set((comps || []).map((c: any) => c.transacao_id));
        pendingReceipts = (todayTxs || []).filter((t: any) => !compSet.has(t.id));
      }

      // 2. Upcoming due dates (next 3 days)
      const { data: upcoming } = await supabase
        .from("transacoes")
        .select("descricao, valor, data_vencimento")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .eq("status", "pendente")
        .gt("data_vencimento", today)
        .lte("data_vencimento", threeDaysFromNow)
        .order("data_vencimento");

      // 3. Overdue count
      const { data: overdue } = await supabase
        .from("transacoes")
        .select("id")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .eq("status", "atrasado");

      // Build notification
      const parts: string[] = [];

      if (pendingReceipts.length > 0) {
        parts.push(`⚠️ *${pendingReceipts.length} lançamento(s) de hoje sem comprovante:*`);
        for (const tx of pendingReceipts.slice(0, 5)) {
          parts.push(`  • ${tx.descricao} - R$ ${Number(tx.valor).toFixed(2)}`);
        }
        parts.push("Envie as fotos/PDFs para regularizar.\n");
      }

      if (upcoming?.length) {
        parts.push(`📅 *Próximos vencimentos (3 dias):*`);
        for (const tx of upcoming.slice(0, 5)) {
          const dt = new Date(tx.data_vencimento).toLocaleDateString("pt-BR");
          parts.push(`  • ${dt} - ${tx.descricao} - R$ ${Number(tx.valor).toFixed(2)}`);
        }
        parts.push("");
      }

      if (overdue?.length) {
        parts.push(`🔴 Você tem *${overdue.length} conta(s) atrasada(s)*. Use /pendencias para ver.`);
      }

      if (parts.length === 0) continue;

      const greeting = profile.display_name ? `Olá, ${profile.display_name}! 👋\n\n` : "👋\n\n";
      const msg = greeting + parts.join("\n");

      await fetch(`${GATEWAY_URL}/sendMessage`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": TELEGRAM_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "Markdown" }),
      });
      notified++;
    }

    return new Response(
      JSON.stringify({ ok: true, notified }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Notify error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
