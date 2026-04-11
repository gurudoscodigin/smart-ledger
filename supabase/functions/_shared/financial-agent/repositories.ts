// ═══════════════════════════════════════════════════════════════
// FINANCIAL AGENT — REPOSITORIES
// FIX #11: All operations now check for errors and log them
// ═══════════════════════════════════════════════════════════════

import type { DecisionLog, DecisionBasis, AgentIntent } from "./types.ts";

// ═══════════════ AGENT REPO ═══════════════

export async function logDecision(
  supabase: any,
  log: DecisionLog
): Promise<void> {
  const { error } = await supabase.from("agent_decision_logs").insert({
    user_id: log.user_id,
    message_text: log.message_text,
    intent: log.intent,
    vendor_detected: log.vendor_detected,
    categoria_suggested: log.categoria_suggested,
    subcategoria_suggested: log.subcategoria_suggested,
    recurrence_used: log.recurrence_used,
    payment_source: log.payment_source,
    confidence_level: log.confidence_level,
    decision_basis: log.decision_basis,
    user_correction: log.user_correction,
    confirmed: log.confirmed,
  });
  if (error) console.error("logDecision error:", error.message);
}

export async function saveVendorAlias(
  supabase: any,
  userId: string,
  alias: string,
  canonicalName: string,
  details: {
    categoria_id?: string | null;
    subcategoria?: string | null;
    cartao_id?: string | null;
    banco_id?: string | null;
    origem?: string | null;
    categoria_tipo?: string | null;
    is_recurrent?: boolean;
    is_variable?: boolean;
    confidence?: number;
  }
): Promise<void> {
  const { error } = await supabase.from("agent_vendor_aliases").upsert({
    user_id: userId,
    alias: alias.toLowerCase().trim(),
    canonical_name: canonicalName,
    categoria_id: details.categoria_id || null,
    subcategoria: details.subcategoria || null,
    cartao_id: details.cartao_id || null,
    banco_id: details.banco_id || null,
    origem: details.origem || null,
    categoria_tipo: details.categoria_tipo || null,
    is_recurrent: details.is_recurrent || false,
    is_variable: details.is_variable || false,
    confidence: details.confidence || 80,
  }, { onConflict: "user_id,alias" });
  if (error) console.error("saveVendorAlias error:", error.message);
}

export async function saveMemoryRule(
  supabase: any,
  userId: string,
  ruleType: string,
  ruleKey: string,
  ruleValue: Record<string, unknown>,
  source: string
): Promise<void> {
  const { error } = await supabase.from("agent_memory_rules").upsert({
    user_id: userId,
    rule_type: ruleType,
    rule_key: ruleKey,
    rule_value: ruleValue,
    source,
  }, { onConflict: "user_id,rule_type,rule_key" });
  if (error) console.error("saveMemoryRule error:", error.message);
}

export async function getMemoryRule(
  supabase: any,
  userId: string,
  ruleType: string,
  ruleKey: string
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from("agent_memory_rules")
    .select("rule_value")
    .eq("user_id", userId)
    .eq("rule_type", ruleType)
    .eq("rule_key", ruleKey)
    .maybeSingle();
  return data?.rule_value || null;
}

export async function getClassificationRules(
  supabase: any,
  userId: string
): Promise<Array<{
  pattern: string;
  categoria_id: string | null;
  subcategoria: string | null;
  categoria_tipo: string | null;
  priority: number;
}>> {
  const { data } = await supabase
    .from("agent_classification_rules")
    .select("pattern, categoria_id, subcategoria, categoria_tipo, priority")
    .eq("user_id", userId)
    .eq("active", true)
    .order("priority", { ascending: false });
  return data || [];
}

// ═══════════════ SYSTEM REPO ═══════════════

export async function getMonthlyTransactions(
  supabase: any,
  userId: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const { data } = await supabase
    .from("transacoes")
    .select("*, categorias(nome)")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .gte("data_vencimento", startDate)
    .lt("data_vencimento", endDate)
    .order("data_vencimento");
  return data || [];
}

export async function getPendingTransactions(
  supabase: any,
  userId: string,
  limit = 15
): Promise<any[]> {
  const { data } = await supabase
    .from("transacoes")
    .select("id, descricao, valor, data_vencimento, status")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("status", ["pendente", "atrasado"])
    .order("data_vencimento")
    .limit(limit);
  return data || [];
}

export async function searchTransactions(
  supabase: any,
  userId: string,
  term: string,
  limit = 10
): Promise<any[]> {
  const { data } = await supabase
    .from("transacoes")
    .select("descricao, valor, data_vencimento, status")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .ilike("descricao", `%${term}%`)
    .order("data_vencimento", { ascending: false })
    .limit(limit);
  return data || [];
}

export async function getReceiptsByTransactionIds(
  supabase: any,
  txIds: string[]
): Promise<Set<string>> {
  const { data } = await supabase
    .from("comprovantes")
    .select("transacao_id")
    .in("transacao_id", txIds);
  return new Set((data || []).map((c: any) => c.transacao_id));
}

export async function insertTransaction(
  supabase: any,
  txData: Record<string, unknown>
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("transacoes")
    .insert(txData)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function insertReceipt(
  supabase: any,
  receipt: {
    transacao_id: string;
    file_path: string;
    file_name: string;
    file_type: string;
    uploaded_by: string;
  }
): Promise<void> {
  const { error } = await supabase.from("comprovantes").insert(receipt);
  if (error) console.error("insertReceipt error:", error.message);
}

export async function savePreference(
  supabase: any,
  userId: string,
  itemName: string,
  details: {
    cartao_id?: string | null;
    banco_id?: string | null;
    origem?: string | null;
    categoria_id?: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from("preferencias_origem").upsert({
    user_id: userId,
    item_nome: itemName,
    cartao_id: details.cartao_id || null,
    banco_id: details.banco_id || null,
    origem: details.origem || null,
    categoria_id: details.categoria_id || null,
  }, { onConflict: "user_id,item_nome" });
  if (error) console.error("savePreference error:", error.message);
}

export async function updateBankBalance(
  supabase: any,
  bankId: string,
  newBalance: number
): Promise<void> {
  const { error } = await supabase.from("bancos").update({ saldo_atual: newBalance }).eq("id", bankId);
  if (error) console.error("updateBankBalance error:", error.message);
}

export async function getRecentTransactionsForBI(
  supabase: any,
  userId: string,
  fromDate: string,
  limit = 100
): Promise<any[]> {
  const { data } = await supabase
    .from("transacoes")
    .select("descricao, valor, data_vencimento, status, categoria_tipo")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .gte("data_vencimento", fromDate)
    .order("data_vencimento", { ascending: false })
    .limit(limit);
  return data || [];
}
