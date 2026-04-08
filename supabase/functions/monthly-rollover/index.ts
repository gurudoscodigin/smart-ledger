import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const endOfLastMonth = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}-${String(lastMonth.getDate()).padStart(2, "0")}`;

    // 1. ROLLOVER: Mark overdue transactions from previous months
    const { data: overdue, error: overdueErr } = await supabase
      .from("transacoes")
      .update({ status: "atrasado" })
      .eq("status", "pendente")
      .is("deleted_at", null)
      .lte("data_vencimento", endOfLastMonth)
      .select("id");

    if (overdueErr) throw overdueErr;

    // 2. RECURRING: Generate this month's transactions from templates
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    // Check if recurring already generated this month
    const { data: existingRecurring } = await supabase
      .from("transacoes")
      .select("recorrencia_id")
      .gte("data_vencimento", startOfMonth)
      .not("recorrencia_id", "is", null);

    const existingIds = new Set((existingRecurring || []).map((t: any) => t.recorrencia_id));

    const { data: templates, error: tplErr } = await supabase
      .from("recorrencias_fixas")
      .select("*")
      .eq("ativo", true);

    if (tplErr) throw tplErr;

    const newTransactions = (templates || [])
      .filter((t: any) => !existingIds.has(t.id))
      .map((t: any) => ({
        descricao: t.nome,
        // REGRA: Fixas copiam valor; Variáveis entram com R$ 0,00
        valor: t.eh_variavel ? 0 : t.valor_estimado,
        data_vencimento: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(t.dia_vencimento_padrao).padStart(2, "0")}`,
        status: "pendente" as const,
        // REGRA: Variáveis = "variavel", Fixas = "fixa"
        categoria_tipo: t.eh_variavel ? "variavel" as const : "fixa" as const,
        recorrencia_id: t.id,
        cartao_id: t.cartao_id,
        banco_id: t.banco_id,
        categoria_id: t.categoria_id,
        origem: t.origem,
        url_site_login: t.url_site_login,
        instrucoes_coleta: t.instrucoes_coleta,
        user_id: t.user_id,
      }));

    let generated = 0;
    if (newTransactions.length > 0) {
      const { error: insertErr } = await supabase.from("transacoes").insert(newTransactions);
      if (insertErr) throw insertErr;
      generated = newTransactions.length;
    }

    // 3. NOTIFICATIONS: Generate alerts
    let notificationsCreated = 0;

    // 3a. Upcoming due (48h)
    const twoDaysFromNow = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
    const today = now.toISOString().split("T")[0];

    const { data: upcoming } = await supabase
      .from("transacoes")
      .select("id, descricao, valor, data_vencimento, user_id")
      .is("deleted_at", null)
      .eq("status", "pendente")
      .gt("data_vencimento", today)
      .lte("data_vencimento", twoDaysFromNow);

    // 3b. Overdue (just marked)
    const { data: overdueList } = await supabase
      .from("transacoes")
      .select("id, descricao, valor, data_vencimento, user_id")
      .is("deleted_at", null)
      .eq("status", "atrasado")
      .gte("data_vencimento", endOfLastMonth);

    // 3c. Paid without receipt
    const { data: paidNoReceipt } = await supabase
      .from("transacoes")
      .select("id, descricao, valor, user_id")
      .is("deleted_at", null)
      .eq("status", "pago")
      .gte("data_vencimento", startOfMonth);

    let paidWithoutComprovante: any[] = [];
    if (paidNoReceipt?.length) {
      const paidIds = paidNoReceipt.map((t: any) => t.id);
      const { data: comps } = await supabase
        .from("comprovantes")
        .select("transacao_id")
        .in("transacao_id", paidIds);
      const compSet = new Set((comps || []).map((c: any) => c.transacao_id));
      paidWithoutComprovante = paidNoReceipt.filter((t: any) => !compSet.has(t.id));
    }

    // 3d. Variable bills with R$ 0 (need value update)
    const { data: variableZero } = await supabase
      .from("transacoes")
      .select("id, descricao, data_vencimento, user_id")
      .is("deleted_at", null)
      .eq("status", "pendente")
      .eq("categoria_tipo", "variavel")
      .eq("valor", 0)
      .gte("data_vencimento", startOfMonth);

    // Deduplicate: check existing notifications this month
    const { data: existingNotifs } = await supabase
      .from("notificacoes")
      .select("transacao_id, tipo")
      .gte("created_at", startOfMonth);

    const existingNotifSet = new Set(
      (existingNotifs || []).map((n: any) => `${n.transacao_id}_${n.tipo}`)
    );

    const notifications: any[] = [];

    for (const tx of (upcoming || [])) {
      const key = `${tx.id}_vencimento_proximo`;
      if (existingNotifSet.has(key)) continue;
      const dt = (() => { const [y,m,d] = tx.data_vencimento.split("-"); return `${d}/${m}/${y}`; })();
      notifications.push({
        user_id: tx.user_id,
        tipo: "vencimento_proximo",
        titulo: `Conta vencendo: ${tx.descricao}`,
        mensagem: `A conta "${tx.descricao}" de R$ ${Number(tx.valor).toFixed(2)} vence em ${dt}. O boleto já chegou?`,
        transacao_id: tx.id,
      });
    }

    for (const tx of (overdueList || [])) {
      const key = `${tx.id}_atraso`;
      if (existingNotifSet.has(key)) continue;
      notifications.push({
        user_id: tx.user_id,
        tipo: "atraso",
        titulo: `Conta atrasada: ${tx.descricao}`,
        mensagem: `A conta "${tx.descricao}" de R$ ${Number(tx.valor).toFixed(2)} está atrasada!`,
        transacao_id: tx.id,
      });
    }

    for (const tx of paidWithoutComprovante) {
      const key = `${tx.id}_sem_comprovante`;
      if (existingNotifSet.has(key)) continue;
      notifications.push({
        user_id: tx.user_id,
        tipo: "sem_comprovante",
        titulo: `Sem comprovante: ${tx.descricao}`,
        mensagem: `A conta "${tx.descricao}" foi paga, mas o comprovante ainda não foi enviado.`,
        transacao_id: tx.id,
      });
    }

    for (const tx of (variableZero || [])) {
      const key = `${tx.id}_valor_variavel`;
      if (existingNotifSet.has(key)) continue;
      notifications.push({
        user_id: tx.user_id,
        tipo: "valor_variavel",
        titulo: `Informe o valor: ${tx.descricao}`,
        mensagem: `A conta variável "${tx.descricao}" está com valor R$ 0,00. Informe o valor correto.`,
        transacao_id: tx.id,
      });
    }

    if (notifications.length > 0) {
      const { error: notifErr } = await supabase.from("notificacoes").insert(notifications);
      if (notifErr) console.error("Notification insert error:", notifErr);
      else notificationsCreated = notifications.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        overdue_marked: overdue?.length || 0,
        recurring_generated: generated,
        notifications_created: notificationsCreated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
