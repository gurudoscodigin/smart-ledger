import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addMonths, format, parseISO, setDate as setDayOfMonth, lastDayOfMonth } from "date-fns";

export function useContratosDivida() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["contratos-divida"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos_divida_resumo")
        .select("*, bancos(nome), cartoes(apelido, final_cartao), categorias(nome)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).filter((c: any) => !c.deleted_at);
    },
    enabled: !!user,
  });

  const criarContrato = useMutation({
    mutationFn: async (params: {
      descricao: string;
      credor?: string;
      valorTotal: number;
      valorParcela: number;
      totalParcelas: number;
      parcelasPagas: number;
      dataContrato: string;
      dataPrimeiraParcela: string;
      diaVencimento: number;
      bancoId?: string;
      cartaoId?: string;
      categoriaId?: string;
      subcategoria?: string;
      origem?: string;
      observacoes?: string;
    }) => {
      const {
        descricao, credor, valorTotal, valorParcela, totalParcelas,
        parcelasPagas, dataContrato, dataPrimeiraParcela, diaVencimento,
        bancoId, cartaoId, categoriaId, subcategoria, origem, observacoes
      } = params;

      // Create contrato
      const { data: contrato, error: cErr } = await supabase
        .from("contratos_divida")
        .insert({
          descricao,
          credor: credor || null,
          valor_total: valorTotal,
          valor_parcela: valorParcela,
          total_parcelas: totalParcelas,
          parcelas_pagas: parcelasPagas,
          data_contrato: dataContrato,
          data_primeira_parcela: dataPrimeiraParcela,
          dia_vencimento: diaVencimento,
          banco_id: bancoId || null,
          cartao_id: cartaoId || null,
          categoria_id: categoriaId || null,
          subcategoria: subcategoria || null,
          origem: (origem as any) || null,
          observacoes: observacoes || null,
          user_id: user!.id,
          status: parcelasPagas >= totalParcelas ? "quitado" : "ativo",
        })
        .select("id")
        .single();
      if (cErr) throw cErr;

      // Generate parcelas
      const baseParcela = parseISO(dataPrimeiraParcela);
      const BATCH_SIZE = 50;
      const allParcelas: any[] = [];

      for (let i = 0; i < totalParcelas; i++) {
        let dataVenc = addMonths(baseParcela, i);
        // Adjust to diaVencimento respecting last day of month
        const lastDay = lastDayOfMonth(dataVenc).getDate();
        const dia = Math.min(diaVencimento, lastDay);
        dataVenc = setDayOfMonth(dataVenc, dia);

        const parcelaNum = i + 1;
        const jaPaga = parcelaNum <= parcelasPagas;

        allParcelas.push({
          descricao: `${descricao} (${parcelaNum}/${totalParcelas})`,
          valor: valorParcela,
          data_vencimento: format(dataVenc, "yyyy-MM-dd"),
          status: jaPaga ? "pago" : "pendente",
          data_pagamento: jaPaga ? format(dataVenc, "yyyy-MM-dd") : null,
          categoria_tipo: "divida" as const,
          contrato_id: contrato.id,
          parcela_atual: parcelaNum,
          parcela_total: totalParcelas,
          cartao_id: cartaoId || null,
          banco_id: bancoId || null,
          categoria_id: categoriaId || null,
          subcategoria: subcategoria || null,
          origem: (origem as any) || null,
          user_id: user!.id,
        });
      }

      // Insert in batches
      for (let i = 0; i < allParcelas.length; i += BATCH_SIZE) {
        const batch = allParcelas.slice(i, i + BATCH_SIZE);
        const { error: txErr } = await supabase.from("transacoes").insert(batch);
        if (txErr) throw txErr;
      }

      return contrato;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contratos-divida"] });
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      toast.success("Dívida cadastrada com sucesso!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const registrarAmortizacao = useMutation({
    mutationFn: async (params: {
      contratoId: string;
      tipo: string;
      valor: number;
      dataPagamento: string;
      parcelasAntecipadas?: number;
      efeito?: string;
      bancoId?: string;
      observacoes?: string;
    }) => {
      const { contratoId, tipo, valor, dataPagamento, parcelasAntecipadas, efeito, bancoId, observacoes } = params;

      // Create amortization transaction
      const { data: tx, error: txErr } = await supabase.from("transacoes").insert({
        descricao: `Amortização — ${tipo}`,
        valor,
        data_vencimento: dataPagamento,
        data_pagamento: dataPagamento,
        status: "pago" as const,
        categoria_tipo: "divida" as const,
        contrato_id: contratoId,
        banco_id: bancoId || null,
        user_id: user!.id,
      }).select("id").single();
      if (txErr) throw txErr;

      // Insert amortization record
      const { error: amErr } = await supabase.from("amortizacoes").insert({
        contrato_id: contratoId,
        tipo,
        valor,
        data_pagamento: dataPagamento,
        parcelas_antecipadas: parcelasAntecipadas || 0,
        efeito: efeito || "reduz_prazo",
        banco_id: bancoId || null,
        observacoes: observacoes || null,
        transacao_id: tx.id,
        user_id: user!.id,
      });
      if (amErr) throw amErr;

      // If antecipating parcels, mark them as paid
      if (tipo === "parcelas_antecipadas" && parcelasAntecipadas && parcelasAntecipadas > 0) {
        const { data: pendentes } = await supabase
          .from("transacoes")
          .select("id")
          .eq("contrato_id", contratoId)
          .eq("status", "pendente")
          .is("deleted_at", null)
          .order("data_vencimento", { ascending: true })
          .limit(parcelasAntecipadas);

        if (pendentes?.length) {
          const ids = pendentes.map(p => p.id);
          await supabase
            .from("transacoes")
            .update({ status: "pago" as any, data_pagamento: dataPagamento })
            .in("id", ids);
        }
      }

      // Update parcelas_pagas on contract
      const { data: paidCount } = await supabase
        .from("transacoes")
        .select("id", { count: "exact", head: true })
        .eq("contrato_id", contratoId)
        .eq("status", "pago")
        .is("deleted_at", null);

      const newPagas = paidCount ? (paidCount as any).length || 0 : 0;

      // Get total parcelas to check if quitado
      const { data: contrato } = await supabase
        .from("contratos_divida")
        .select("total_parcelas")
        .eq("id", contratoId)
        .single();

      const updates: any = { parcelas_pagas: newPagas };
      if (contrato && newPagas >= contrato.total_parcelas) {
        updates.status = "quitado";
        updates.data_quitacao = dataPagamento;
      }

      await supabase.from("contratos_divida").update(updates).eq("id", contratoId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contratos-divida"] });
      queryClient.invalidateQueries({ queryKey: ["transacoes"] });
      queryClient.invalidateQueries({ queryKey: ["parcelas-contrato"] });
      toast.success("Amortização registrada!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { ...query, criarContrato, registrarAmortizacao };
}

export function useParcelasContrato(contratoId: string | null) {
  return useQuery({
    queryKey: ["parcelas-contrato", contratoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transacoes")
        .select("*")
        .eq("contrato_id", contratoId!)
        .is("deleted_at", null)
        .order("data_vencimento", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!contratoId,
  });
}
