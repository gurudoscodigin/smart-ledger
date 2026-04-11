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
      .filter((t: any) => {
        // If data_inicio exists, only materialize if month >= start
        if (t.data_inicio) {
          const inicio = new Date(t.data_inicio);
          const mesCorrente = new Date(now.getFullYear(), now.getMonth(), 1);
          const mesInicio = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
          if (mesCorrente < mesInicio) return false;
        }
        // If data_fim exists, only materialize if month <= end
        if (t.data_fim) {
          const fim = new Date(t.data_fim);
          if (now > fim) return false;
        }
        return true;
      })
      .map((t: any) => ({
        descricao: t.nome,
        valor: t.eh_variavel ? 0 : t.valor_estimado,
        data_vencimento: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(t.dia_vencimento_padrao).padStart(2, "0")}`,
        status: "pendente" as const,
        categoria_tipo: t.eh_variavel ? "variavel" as const : t.eh_divida ? "divida" as const : "fixa" as const,
        recorrencia_id: t.id,
        cartao_id: t.cartao_id,
        banco_id: t.banco_id,
        categoria_id: t.categoria_id,
        origem: t.origem,
        url_site_login: t.url_site_login,
        instrucoes_coleta: t.instrucoes_coleta,
        user_id: t.user_id,
        subcategoria: t.subcategoria,
      }));

    let generated = 0;
    if (newTransactions.length > 0) {
      const { error: insertErr } = await supabase.from("transacoes").insert(newTransactions);
      if (insertErr) throw insertErr;
      generated = newTransactions.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        overdue_marked: overdue?.length || 0,
        recurring_generated: generated,
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
