import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useTransacoes(filters?: { month?: number; year?: number; includeOverdue?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const now = new Date();
  const month = filters?.month ?? now.getMonth() + 1;
  const year = filters?.year ?? now.getFullYear();

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const query = useQuery({
    queryKey: ["transacoes", month, year],
    queryFn: async () => {
      // Current month transactions
      const { data: currentMonth, error: err1 } = await supabase
        .from("transacoes")
        .select("*, categorias(nome, eh_colaborador), cartoes(apelido, final_cartao), bancos(nome)")
        .is("deleted_at", null)
        .gte("data_vencimento", startDate)
        .lt("data_vencimento", endDate)
        .order("data_vencimento");
      if (err1) throw err1;

      // Overdue from previous months
      const { data: overdue, error: err2 } = await supabase
        .from("transacoes")
        .select("*, categorias(nome, eh_colaborador), cartoes(apelido, final_cartao), bancos(nome)")
        .is("deleted_at", null)
        .eq("status", "atrasado")
        .lt("data_vencimento", startDate)
        .order("data_vencimento");
      if (err2) throw err2;

      return { currentMonth: currentMonth || [], overdue: overdue || [] };
    },
    enabled: !!user,
  });

  const createTransaction = useMutation({
    mutationFn: async (tx: any) => {
      const { data, error } = await supabase
        .from("transacoes")
        .insert({ ...tx, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      toast.success("Transação registrada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Credit card installment engine
  const createInstallments = useMutation({
    mutationFn: async (params: {
      descricao: string;
      valorTotal: number;
      parcelas: number;
      cartaoId: string;
      categoriaId?: string;
      categoriaTipo: "fixa" | "avulsa" | "variavel" | "divida";
      diaCobranca: number;
    }) => {
      const { descricao, valorTotal, parcelas, cartaoId, categoriaId, categoriaTipo, diaCobranca } = params;
      const valorParcela = Math.round((valorTotal / parcelas) * 100) / 100;

      // Get card info for cut-off date logic
      const { data: cartao, error: cartaoErr } = await supabase
        .from("cartoes")
        .select("dia_fechamento, dia_vencimento, limite_disponivel")
        .eq("id", cartaoId)
        .single();
      if (cartaoErr) throw cartaoErr;

      const today = new Date();
      const transactions = [];

      for (let i = 0; i < parcelas; i++) {
        // Calculate which invoice month this installment falls into
        let invoiceMonth = today.getMonth() + i;
        let invoiceYear = today.getFullYear();

        // If charge day is after cut-off, it goes to next month's invoice
        if (diaCobranca > cartao.dia_fechamento) {
          invoiceMonth += 1;
        }

        // Normalize month/year
        invoiceYear += Math.floor(invoiceMonth / 12);
        invoiceMonth = invoiceMonth % 12;

        const vencimento = new Date(invoiceYear, invoiceMonth, cartao.dia_vencimento);

        transactions.push({
          descricao: `${descricao} (${i + 1}/${parcelas})`,
          valor: valorParcela,
          data_vencimento: vencimento.toISOString().split("T")[0],
          status: "pendente" as const,
          categoria_tipo: categoriaTipo,
          cartao_id: cartaoId,
          categoria_id: categoriaId || null,
          parcela_atual: i + 1,
          parcela_total: parcelas,
          user_id: user!.id,
        });
      }

      // Insert all installment transactions
      const { error: txErr } = await supabase.from("transacoes").insert(transactions);
      if (txErr) throw txErr;

      // Block full amount from card limit immediately
      const newLimit = cartao.limite_disponivel - valorTotal;
      const { error: cardErr } = await supabase
        .from("cartoes")
        .update({ limite_disponivel: newLimit })
        .eq("id", cartaoId);
      if (cardErr) throw cardErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      toast.success("Parcelamento registrado e limite atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Boleto/financing installments (no limit impact)
  const createBoletoInstallments = useMutation({
    mutationFn: async (params: {
      descricao: string;
      valorTotal: number;
      parcelas: number;
      idContrato: string;
      bancoId?: string;
      categoriaId?: string;
      datas: string[]; // array of due dates
    }) => {
      const { descricao, valorTotal, parcelas, idContrato, bancoId, categoriaId, datas } = params;
      const valorParcela = Math.round((valorTotal / parcelas) * 100) / 100;

      const transactions = datas.map((data, i) => ({
        descricao: `${descricao} (${i + 1}/${parcelas})`,
        valor: valorParcela,
        data_vencimento: data,
        status: "pendente" as const,
        categoria_tipo: "divida" as const,
        id_contrato: idContrato,
        banco_id: bancoId || null,
        categoria_id: categoriaId || null,
        parcela_atual: i + 1,
        parcela_total: parcelas,
        user_id: user!.id,
      }));

      const { error } = await supabase.from("transacoes").insert(transactions);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      toast.success("Parcelamento via boleto registrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Pay transaction — releases card limit if card-linked
  const payTransaction = useMutation({
    mutationFn: async (txId: string) => {
      const { data: tx, error: fetchErr } = await supabase
        .from("transacoes")
        .select("valor, cartao_id")
        .eq("id", txId)
        .single();
      if (fetchErr) throw fetchErr;

      const { error: updateErr } = await supabase
        .from("transacoes")
        .update({ status: "pago", data_pagamento: new Date().toISOString().split("T")[0] })
        .eq("id", txId);
      if (updateErr) throw updateErr;

      // Release limit if card-linked
      if (tx.cartao_id) {
        const { data: cartao } = await supabase
          .from("cartoes")
          .select("limite_disponivel")
          .eq("id", tx.cartao_id)
          .single();
        if (cartao) {
          await supabase
            .from("cartoes")
            .update({ limite_disponivel: cartao.limite_disponivel + tx.valor })
            .eq("id", tx.cartao_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      queryClient.invalidateQueries({ queryKey: ["cartoes"] });
      toast.success("Pagamento registrado — limite atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Quick PIX payment (immediate)
  const createPixPayment = useMutation({
    mutationFn: async (params: { descricao: string; valor: number; bancoId: string; categoriaId?: string }) => {
      const today = new Date().toISOString().split("T")[0];
      const { error: txErr } = await supabase.from("transacoes").insert({
        descricao: params.descricao,
        valor: params.valor,
        data_vencimento: today,
        data_pagamento: today,
        status: "pago",
        categoria_tipo: "avulsa",
        origem: "pix",
        banco_id: params.bancoId,
        categoria_id: params.categoriaId || null,
        user_id: user!.id,
      });
      if (txErr) throw txErr;

      // Deduct from bank balance
      const { data: banco } = await supabase
        .from("bancos")
        .select("saldo_atual")
        .eq("id", params.bancoId)
        .single();
      if (banco) {
        await supabase
          .from("bancos")
          .update({ saldo_atual: banco.saldo_atual - params.valor })
          .eq("id", params.bancoId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      queryClient.invalidateQueries({ queryKey: ["bancos"] });
      toast.success("Pagamento PIX registrado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    ...query,
    createTransaction,
    createInstallments,
    createBoletoInstallments,
    payTransaction,
    createPixPayment,
  };
}

// Dashboard summary hook
export function useDashboardSummary() {
  const { user } = useAuth();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  return useQuery({
    queryKey: ["dashboard-summary", month, year],
    queryFn: async () => {
      // Bank balances
      const { data: bancos } = await supabase.from("bancos").select("saldo_atual");
      const saldoTotal = (bancos || []).reduce((sum, b) => sum + Number(b.saldo_atual), 0);

      // Month transactions
      const { data: txs } = await supabase
        .from("transacoes")
        .select("valor, status")
        .is("deleted_at", null)
        .gte("data_vencimento", startDate)
        .lt("data_vencimento", endDate);

      const totalPago = (txs || []).filter(t => t.status === "pago").reduce((s, t) => s + Number(t.valor), 0);
      const totalPendente = (txs || []).filter(t => t.status === "pendente").reduce((s, t) => s + Number(t.valor), 0);
      const totalAtrasado = (txs || []).filter(t => t.status === "atrasado").reduce((s, t) => s + Number(t.valor), 0);

      return { saldoTotal, totalPago, totalPendente, totalAtrasado, totalAPagar: totalPendente + totalAtrasado };
    },
    enabled: !!user,
  });
}
