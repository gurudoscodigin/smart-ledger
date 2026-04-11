import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

// FIX #13: Escape Markdown special characters
function escapeMarkdown(text: string): string {
  return text.replace(/[*_`\[\]()~>#+\-=|{}.!]/g, "\\$&");
}

// Send message with Markdown fallback to plain text
async function safeSendTelegram(
  chatId: number,
  text: string,
  lovableKey: string,
  telegramKey: string
): Promise<void> {
  const resp = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });

  if (!resp.ok) {
    // Fallback: send without Markdown
    await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: chatId, text: text.replace(/[*_`]/g, "") }),
    });
  }
}

Deno.serve(async (req) => {
  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const globalChatId = Deno.env.get("TELEGRAM_CHAT_ID");

    // FIX #1: Query admin that actually has a telegram_id linked
    let adminUserId: string;
    let chatId: number;
    let adminDisplayName: string | null = null;

    if (globalChatId) {
      chatId = Number(globalChatId);
      // Still need to find an admin user for data queries
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin")
        .limit(1)
        .single();
      if (!adminRole) {
        return new Response(JSON.stringify({ ok: true, notified: 0, reason: "no admin" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      adminUserId = adminRole.user_id;
    } else {
      // JOIN user_roles with profiles to find admin WITH telegram_id
      const { data: adminsWithTelegram } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (!adminsWithTelegram?.length) {
        return new Response(JSON.stringify({ ok: true, notified: 0, reason: "no admin" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Find which admin has telegram_id
      const adminIds = adminsWithTelegram.map((a: any) => a.user_id);
      const { data: profileWithTelegram } = await supabase
        .from("profiles")
        .select("user_id, telegram_id, display_name")
        .in("user_id", adminIds)
        .not("telegram_id", "is", null)
        .limit(1)
        .single();

      if (!profileWithTelegram?.telegram_id) {
        return new Response(JSON.stringify({ ok: true, notified: 0, reason: "no chat_id" }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      chatId = Number(profileWithTelegram.telegram_id);
      adminUserId = profileWithTelegram.user_id;
      adminDisplayName = profileWithTelegram.display_name;
    }

    if (!adminDisplayName) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", adminUserId)
        .single();
      adminDisplayName = prof?.display_name ?? null;
    }

    let notified = 0;
    const userId = adminUserId;
    const today = new Date().toISOString().split("T")[0];
    const twoDaysFromNow = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
    const startOfMonth = today.substring(0, 8) + "01";

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
        const desc = escapeMarkdown(tx.descricao);
        parts.push(`  • ${d}/${m}/${y} \\- ${desc} \\- R$ ${Number(tx.valor).toFixed(2)}`);
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
        const desc = escapeMarkdown(tx.descricao);
        parts.push(`  • ${d}/${m}/${y} \\- ${desc} \\- R$ ${Number(tx.valor).toFixed(2)}`);
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
          const desc = escapeMarkdown(tx.descricao);
          parts.push(`  • ${desc} \\- R$ ${Number(tx.valor).toFixed(2)}`);
          parts.push(`    _Chefe, envie o comprovante dessa conta._`);
        }
        parts.push("");
      }
    }

    // 4. Variable bills with R$ 0
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
        const desc = escapeMarkdown(tx.descricao);
        parts.push(`  • ${desc} (vence ${d}/${m}/${y})`);
      }
      parts.push(`\n_Responda com: "Valor [nome da conta] R$ XX,XX" para atualizar._\n`);
    }

    // FIX #5: Reminders for today
    const { data: todayReminders } = await supabase
      .from("lembretes")
      .select("id, titulo, descricao")
      .eq("user_id", userId)
      .eq("confirmado", false)
      .eq("notificado_telegram", false)
      .eq("data_lembrete", today);

    if (todayReminders?.length) {
      parts.push(`🔔 *Lembretes para hoje:*`);
      for (const l of todayReminders) {
        const titulo = escapeMarkdown(l.titulo);
        parts.push(`  • ${titulo}`);
        if (l.descricao) parts.push(`    ${escapeMarkdown(l.descricao)}`);
      }
      parts.push("");

      // Mark as notified
      const reminderIds = todayReminders.map((l: any) => l.id);
      await supabase
        .from("lembretes")
        .update({ notificado_telegram: true })
        .in("id", reminderIds);
    }

    if (parts.length > 0) {
      const greeting = adminProfile?.display_name ? `Olá, ${escapeMarkdown(adminProfile.display_name)}! 👋\n\n` : "👋\n\n";
      const msg = greeting + parts.join("\n");

      await safeSendTelegram(chatId, msg, LOVABLE_API_KEY, TELEGRAM_API_KEY);
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
