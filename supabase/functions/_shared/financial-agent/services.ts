// ═══════════════════════════════════════════════════════════════
// FINANCIAL AGENT — SERVICES (Parser, Classifier, Resolver)
// ═══════════════════════════════════════════════════════════════

import {
  CATEGORY_KEYWORDS, PAID_PATTERNS, PENDING_PATTERNS,
  REMINDER_PATTERNS, KNOWN_BANKS, VENDOR_CANONICAL_RULES,
  KNOWN_VARIABLE_ACCOUNTS, CATEGORIES_REQUIRING_SUBCATEGORY,
} from "./rules.ts";
import type { AgentIntent, PaymentMethod } from "./types.ts";

// ═══════════════ PARSER ═══════════════

export function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function extractDate(text: string): string | null {
  const normalized = removeAccents(text.toLowerCase());
  const today = new Date();

  if (/\bhoje\b/.test(normalized)) return today.toISOString().split("T")[0];
  if (/\bontem\b/.test(normalized)) {
    const d = new Date(today); d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }
  if (/semana passada/.test(normalized)) {
    const d = new Date(today); d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  }

  const fullDate = normalized.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (fullDate) {
    const day = parseInt(fullDate[1]);
    const month = parseInt(fullDate[2]);
    const year = fullDate[3]
      ? (fullDate[3].length === 2 ? 2000 + parseInt(fullDate[3]) : parseInt(fullDate[3]))
      : today.getFullYear();
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const diaMatch = normalized.match(/\bdia\s+(\d{1,2})\b/);
  if (diaMatch) {
    const day = parseInt(diaMatch[1]);
    let month = today.getMonth();
    let year = today.getFullYear();
    if (day < today.getDate()) { month++; if (month > 11) { month = 0; year++; } }
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

export function extractValue(text: string): number | null {
  const normalized = removeAccents(text.toLowerCase());

  const brFormat = text.match(/R\$\s*([\d.]+,\d{2})/);
  if (brFormat) return parseFloat(brFormat[1].replace(/\./g, "").replace(",", "."));

  const brFormat2 = text.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
  if (brFormat2) return parseFloat(brFormat2[1].replace(/\./g, "").replace(",", "."));

  const simpleR = text.match(/R\$\s*([\d.]+)/);
  if (simpleR) return parseFloat(simpleR[1].replace(/\./g, ""));

  const reais = normalized.match(/([\d.]+)\s*reais/);
  if (reais) return parseFloat(reais[1].replace(/\./g, ""));

  if (/mil e quinhentos/.test(normalized)) return 1500;
  if (/mil/.test(normalized)) {
    const milMatch = normalized.match(/(\d+)\s*mil/);
    if (milMatch) return parseInt(milMatch[1]) * 1000;
  }

  const nums = text.match(/\b(\d+(?:[.,]\d+)?)\b/g);
  if (nums) {
    for (const n of nums) {
      const val = parseFloat(n.replace(",", "."));
      if (val > 0 && val < 1000000) return val;
    }
  }

  return null;
}

export function detectStatus(text: string): "pago" | "pendente" | null {
  const normalized = removeAccents(text.toLowerCase());
  for (const p of PAID_PATTERNS) {
    if (normalized.includes(removeAccents(p))) return "pago";
  }
  for (const p of PENDING_PATTERNS) {
    if (normalized.includes(removeAccents(p))) return "pendente";
  }
  return null;
}

export function extractCardRef(text: string): string | null {
  const normalized = removeAccents(text.toLowerCase());
  const finalMatch = normalized.match(/final\s*(\d{4})/);
  if (finalMatch) return finalMatch[1];
  const cartaoDoMatch = normalized.match(/cart[aã]o\s+(?:do|da|de)\s+(\w+)/);
  if (cartaoDoMatch) return cartaoDoMatch[1];
  return null;
}

export function extractBankRef(text: string): string | null {
  const normalized = removeAccents(text.toLowerCase());
  for (const b of KNOWN_BANKS) {
    if (normalized.includes(b)) return b;
  }
  const contaMatch = normalized.match(/(?:conta|banco)\s+(\w+)/);
  if (contaMatch) return contaMatch[1];
  return null;
}

// ═══════════════ CLASSIFIER ═══════════════

export function classifyByKeywords(text: string): { categoria: string; subcategoria?: string } | null {
  const normalized = removeAccents(text.toLowerCase());
  for (const [catName, groups] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const group of groups) {
      for (const kw of group.keywords) {
        if (normalized.includes(removeAccents(kw.toLowerCase()))) {
          return { categoria: catName, subcategoria: group.subcategoria };
        }
      }
    }
  }
  return null;
}

export function isIntencaoLembrete(text: string): boolean {
  const normalized = removeAccents(text.toLowerCase());
  return REMINDER_PATTERNS.some(p => normalized.includes(removeAccents(p)));
}

export function detectPaymentMethod(text: string): PaymentMethod | null {
  const lower = removeAccents(text.toLowerCase().trim());
  if (/pix/i.test(lower)) return "pix";
  if (/cart[aã]o/i.test(lower) || /final\s*\d{4}/.test(lower)) return "cartao";
  if (/boleto/i.test(lower)) return "boleto";
  if (/dinheiro/i.test(lower)) return "dinheiro";
  return null;
}

export function detectVendorCanonical(text: string): {
  canonical: string;
  categoria: string;
  tipo: "fixa" | "avulsa" | "variavel";
  is_variable: boolean;
  person?: string;
} | null {
  const normalized = removeAccents(text.toLowerCase());
  for (const [alias, rule] of Object.entries(VENDOR_CANONICAL_RULES)) {
    if (normalized.includes(removeAccents(alias))) {
      let person: string | undefined;
      if (rule.extract_person) {
        const personMatch = normalized.match(/(?:do|da|de)\s+([a-záéíóúàâêôãõç]+)/i);
        if (personMatch) person = personMatch[1].charAt(0).toUpperCase() + personMatch[1].slice(1);
      }
      return {
        canonical: rule.canonical,
        categoria: rule.categoria,
        tipo: rule.tipo,
        is_variable: rule.is_variable,
        person,
      };
    }
  }
  return null;
}

export function isKnownVariableAccount(text: string): boolean {
  const normalized = removeAccents(text.toLowerCase());
  return KNOWN_VARIABLE_ACCOUNTS.some(kw => normalized.includes(removeAccents(kw)));
}

export function requiresSubcategory(categoryName: string): boolean {
  return CATEGORIES_REQUIRING_SUBCATEGORY.some(
    c => removeAccents(c.toLowerCase()) === removeAccents(categoryName.toLowerCase())
  );
}

// ═══════════════ RESOLVER ═══════════════

export async function resolveCategory(
  supabase: any, userId: string, categoryRef: string
): Promise<{ id: string; nome: string } | null> {
  const { data } = await supabase
    .from("categorias")
    .select("id, nome")
    .eq("user_id", userId)
    .ilike("nome", `%${categoryRef}%`)
    .limit(1)
    .single();
  return data;
}

export async function resolveCard(
  supabase: any, userId: string, cardRef: string
): Promise<{ id: string; apelido: string; final_cartao: string; banco_id: string | null } | null> {
  const { data } = await supabase
    .from("cartoes")
    .select("id, apelido, final_cartao, banco_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .or(`final_cartao.eq.${cardRef},apelido.ilike.%${cardRef}%`)
    .limit(1)
    .maybeSingle();
  return data;
}

export async function resolveBank(
  supabase: any, userId: string, bankRef: string
): Promise<{ id: string; nome: string } | null> {
  const { data } = await supabase
    .from("bancos")
    .select("id, nome")
    .eq("user_id", userId)
    .ilike("nome", `%${bankRef}%`)
    .limit(1)
    .maybeSingle();
  return data;
}

export async function resolveRecurrence(
  supabase: any, userId: string, description: string
): Promise<{
  id: string; nome: string; categoria_id: string | null;
  cartao_id: string | null; banco_id: string | null;
  origem: string | null; eh_variavel: boolean;
  subcategoria: string | null; valor_estimado: number;
} | null> {
  const { data } = await supabase
    .from("recorrencias_fixas")
    .select("id, nome, categoria_id, cartao_id, banco_id, origem, eh_variavel, subcategoria, valor_estimado")
    .eq("user_id", userId)
    .eq("ativo", true)
    .ilike("nome", `%${description}%`)
    .limit(1)
    .maybeSingle();
  return data;
}

export async function resolveVendorAlias(
  supabase: any, userId: string, text: string
): Promise<{
  canonical_name: string;
  categoria_id: string | null;
  subcategoria: string | null;
  cartao_id: string | null;
  banco_id: string | null;
  origem: string | null;
  categoria_tipo: string | null;
  is_recurrent: boolean;
  is_variable: boolean;
} | null> {
  const normalized = removeAccents(text.toLowerCase());
  const { data } = await supabase
    .from("agent_vendor_aliases")
    .select("*")
    .eq("user_id", userId)
    .order("confidence", { ascending: false });

  if (!data) return null;

  for (const alias of data) {
    if (normalized.includes(removeAccents(alias.alias.toLowerCase()))) {
      return alias;
    }
  }
  return null;
}

export async function resolvePreference(
  supabase: any, userId: string, itemName: string
): Promise<{
  cartao_id: string | null;
  banco_id: string | null;
  origem: string | null;
  categoria_id: string | null;
} | null> {
  const { data } = await supabase
    .from("preferencias_origem")
    .select("cartao_id, banco_id, origem, categoria_id")
    .eq("user_id", userId)
    .ilike("item_nome", `%${itemName}%`)
    .limit(1)
    .maybeSingle();
  return data;
}

export async function getUserCategories(
  supabase: any, userId: string
): Promise<Array<{ id: string; nome: string }>> {
  const { data } = await supabase
    .from("categorias")
    .select("id, nome")
    .eq("user_id", userId)
    .order("nome");
  return data || [];
}

export async function getSubcategories(
  supabase: any, categoryId: string
): Promise<Array<{ id: string; nome: string }>> {
  const { data } = await supabase
    .from("subcategorias")
    .select("id, nome")
    .eq("categoria_id", categoryId)
    .order("nome");
  return data || [];
}

export async function getUserCards(
  supabase: any, userId: string
): Promise<Array<{ id: string; apelido: string; final_cartao: string; tipo_funcao: string; banco_id: string | null }>> {
  const { data } = await supabase
    .from("cartoes")
    .select("id, apelido, final_cartao, tipo_funcao, banco_id")
    .eq("user_id", userId)
    .is("deleted_at", null);
  return data || [];
}

export async function getUserBanks(
  supabase: any, userId: string
): Promise<Array<{ id: string; nome: string; saldo_atual: number }>> {
  const { data } = await supabase
    .from("bancos")
    .select("id, nome, saldo_atual")
    .eq("user_id", userId);
  return data || [];
}
