// ═══════════════════════════════════════════════════════════════
// FINANCIAL AGENT — TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════

export type AgentIntent =
  | "create_fixed_account"
  | "create_variable_fixed_account"
  | "create_one_time_account"
  | "create_debt"
  | "register_payment"
  | "attach_receipt"
  | "read_report"
  | "read_summary"
  | "read_pending_items"
  | "read_limits"
  | "search_transactions"
  | "correct_previous_decision"
  | "create_recurrence"
  | "create_reminder"
  | "not_financial";

export type FlowType = "account" | "debt" | "report" | "payment" | "receipt" | "reminder" | "recurrence";

export type AccountType = "fixed_account" | "one_time_account" | "debt";

export type PaymentMethod = "pix" | "boleto" | "cartao" | "dinheiro";

export type ConfidenceLevel = number; // 0-100

export type DecisionBasis =
  | "explicit_correction"
  | "recurrence"
  | "vendor_alias"
  | "learned_rule"
  | "inference"
  | "asked_user";

export type ConversationStep =
  | "extraction"
  | "ask_status"
  | "ask_pagamento"
  | "ask_banco_pix"
  | "ask_cartao"
  | "ask_categoria"
  | "ask_subcategoria"
  | "confirm";

export interface AgentContext {
  step: ConversationStep;
  descricao: string | null;
  valor: number | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status_pagamento: "pago" | "pendente" | null;
  categoria_ref: string | null;
  subcategoria: string | null;
  origem: PaymentMethod | null;
  cartao_ref: string | null;
  banco_ref: string | null;
  categoria_id_resolved: string | null;
  cartao_id_resolved: string | null;
  cartao_display: string | null;
  banco_id_resolved: string | null;
  banco_display: string | null;
  recorrencia_id: string | null;
  contrato_id: string | null;
  parcela_atual: number | null;
  parcela_total: number | null;
  categoria_tipo: "fixa" | "avulsa" | "variavel" | "divida";
  is_recurrent: boolean;
  is_variable_amount: boolean;
  available_subs?: Array<{ id: string; nome: string }>;
  last_transaction_id?: string;
  missing_question?: string;
  user_id?: string;
}

export interface AgentOutput {
  intent: AgentIntent;
  flow_type: FlowType;
  account_type: AccountType | null;
  is_recurrent: boolean;
  is_variable_amount: boolean;
  description: string;
  vendor_name: string | null;
  amount: number | null;
  due_date: string | null;
  due_day: number | null;
  category: string | null;
  subcategory: string | null;
  payment_method: PaymentMethod | null;
  payment_source_type: "bank" | "card" | "none";
  payment_source_ref: string | null;
  bank_id: string | null;
  card_id: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  recurrence_id: string | null;
  contract_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  missing_fields: string[];
  confidence_level: ConfidenceLevel;
  decision_basis: DecisionBasis;
}

export interface ExtractionResult {
  status: "complete" | "incomplete" | "not_financial";
  descricao?: string;
  valor?: number;
  data_vencimento?: string;
  data_pagamento?: string;
  status_pagamento?: "pago" | "pendente";
  categoria_tipo?: string;
  origem?: string;
  cartao_ref?: string;
  banco_ref?: string;
  categoria_ref?: string;
  subcategoria?: string;
  missing_question?: string;
}

export interface CardExtractionResult {
  status: "complete" | "incomplete";
  apelido?: string;
  final_cartao?: string;
  bandeira?: string;
  tipo_funcao?: string;
  formato?: string;
  limite_total?: number;
  dia_fechamento?: number;
  dia_vencimento?: number;
  data_validade?: string;
  banco_ref?: string;
  missing?: string;
}

export interface RecurrenceExtractionResult {
  status: "complete" | "incomplete";
  nome?: string;
  valor_estimado?: number;
  dia_vencimento?: number;
  eh_variavel?: boolean;
  origem?: string;
  banco_ref?: string;
  cartao_ref?: string;
  categoria_ref?: string;
  missing?: string;
}

export interface VendorAlias {
  id: string;
  user_id: string;
  alias: string;
  canonical_name: string;
  categoria_id: string | null;
  subcategoria: string | null;
  cartao_id: string | null;
  banco_id: string | null;
  origem: string | null;
  categoria_tipo: string | null;
  is_recurrent: boolean;
  is_variable: boolean;
  confidence: number;
}

export interface DecisionLog {
  user_id: string;
  message_text: string;
  intent: AgentIntent;
  vendor_detected: string | null;
  categoria_suggested: string | null;
  subcategoria_suggested: string | null;
  recurrence_used: string | null;
  payment_source: string | null;
  confidence_level: number;
  decision_basis: DecisionBasis;
  user_correction: boolean;
  confirmed: boolean;
}

export interface EnvKeys {
  lovableKey: string;
  telegramKey: string;
  openaiKey: string;
  supabaseUrl: string;
  serviceKey: string;
}
