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
    const twoDaysFromNow = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
    const startOfMonth = today.substring(0, 8) + "01";

    for (const profile of profiles) {
      const userId = profile.user_id;
      const chatId = Number(profile.telegram_id);
      if (!chatId) continue;

      const parts: string[] = [];

      // 1. Upcoming due (48h)
      const { data: upcoming } = await supabase
        .from("transacoes")
        .select("descricao, valor, data_vencimento")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .eq("status", "pendente")
        .gt("data_vencimento", today)
        .lte("data_vencimento", twoDaysFromNow)
        .order("data_vencimento");

      if (upcoming?.length) {
        parts.push(`📅 *Contas vencendo em até 48h:*`);
        for (const tx of upcoming.slice(0, 5)) {
          const [y, m, d] = tx.data_vencimento.split("-");
          parts.push(`  • ${d}/${m}/${y} - ${tx.descricao} - R$ ${Number(tx.valor).toFixed(2)}`);
          parts.push(`    _Chefe, o boleto dessa conta já chegou?_`);
        }
        parts.push("");
      }

      // 2. Overdue
      const { data: overdue } = await supabase
        .from("transacoes")
        .select("id, descricao, valor, data_vencimento")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .eq("status", "atrasado")
        .order("data_vencimento")
        .limit(5);

      if (overdue?.length) {
        parts.push(`🔴 *${overdue.length} conta(s) atrasada(s):*`);
        for (const tx of overdue) {
          const [y, m, d] = tx.data_vencimento.split("-");
          parts.push(`  • ${d}/${m}/${y} - ${tx.descricao} - R$ ${Number(tx.valor).toFixed(2)}`);
        }
        parts.push("Use /pendencias para ver todas.\n");
      }

      // 3. Paid without receipt
      const { data: paidTxs } = await supabase
        .from("transacoes")
        .select("id, descricao, valor")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .eq("status", "pago")
        .gte("data_vencimento", startOfMonth);

      if (paidTxs?.length) {
        const paidIds = paidTxs.map((t: any) => t.id);
        const { data: comps } = await supabase
          .from("comprovantes")
          .select("transacao_id")
          .in("transacao_id", paidIds);
        const compSet = new Set((comps || []).map((c: any) => c.transacao_id));
        const noReceipt = paidTxs.filter((t: any) => !compSet.has(t.id));

        if (noReceipt.length > 0) {
          parts.push(`⚠️ *${noReceipt.length} conta(s) paga(s) sem comprovante:*`);
          for (const tx of noReceipt.slice(0, 5)) {
            parts.push(`  • ${tx.descricao} - R$ ${Number(tx.valor).toFixed(2)}`);
            parts.push(`    _Chefe, envie o comprovante dessa conta._`);
          }
          parts.push("");
        }
      }

      // 4. Variable bills with R$ 0 — ask for value
      const { data: variableZero } = await supabase
        .from("transacoes")
        .select("id, descricao, data_vencimento")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .eq("status", "pendente")
        .eq("categoria_tipo", "variavel")
        .eq("valor", 0)
        .gte("data_vencimento", startOfMonth);

      if (variableZero?.length) {
        parts.push(`💰 *Contas variáveis aguardando valor:*`);
        for (const tx of variableZero) {
          const [y, m, d] = tx.data_vencimento.split("-");
          parts.push(`  • ${tx.descricao} (vence ${d}/${m}/${y})`);
        }
        parts.push(`\n_Responda com: "Valor [nome da conta] R$ XX,XX" para atualizar._\n`);
      }

      // Mark telegram notifications as read
      await supabase
        .from("notificacoes")
        .update({ lida_telegram: true })
        .eq("user_id", userId)
        .eq("lida_telegram", false);

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
