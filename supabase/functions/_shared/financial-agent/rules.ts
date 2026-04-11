// ═══════════════════════════════════════════════════════════════
// FINANCIAL AGENT — BUSINESS RULES & KNOWLEDGE BASE
// ═══════════════════════════════════════════════════════════════

// ─── CATEGORY KEYWORD MAPPING ───
export const CATEGORY_KEYWORDS: Record<string, { keywords: string[]; subcategoria?: string }[]> = {
  "Insumos e Diversos": [
    { keywords: ["sonda", "mercado", "mercadinho", "supermercado", "amazon", "mercado livre", "limpeza", "produto de limpeza", "papel toalha", "detergente", "sabao", "esponja", "cafe", "acucar", "agua", "galao", "lavanderia", "secagem", "lava e seca", "eletronico", "celular", "fone", "notebook", "extensao", "fita", "alicate", "chave de fenda", "parafuso", "ferramenta", "material", "suporte", "rodinha", "cadeira", "uniforme", "copo", "talher", "descartavel", "utensilio", "ifood", "delivery", "refeicao", "almoco", "lanche", "pizza", "alimentacao", "uber", "transporte", "combustivel", "estacionamento", "impressora", "toner", "papel", "cartucho", "mantimentos"] },
  ],
  "Custos Fixos": [
    { keywords: ["aluguel", "condominio", "energia", "luz", "conta de luz", "cpfl", "enel", "elektro", "sabesp", "gas", "iptu", "imposto predial", "tributo imobiliario"], subcategoria: "Imóvel" },
    { keywords: ["vivo", "claro", "tim", "oi", "net", "internet", "fibra", "banda larga", "wifi", "wi-fi", "chip", "plano movel", "vivo movel", "celular corporativo", "linha"], subcategoria: "Internet" },
    { keywords: ["diarista", "faxina", "limpeza do escritorio", "mary help", "pamela", "contabilidade", "contador", "escritorio contabil", "assessoria contabil"], subcategoria: "Escritório" },
  ],
  "Software": [
    { keywords: ["assinatura", "plano", "licenca", "software", "saas", "app", "plataforma", "sistema", "ferramenta digital", "google workspace", "notion", "miro", "clicksign", "hostinger", "lovable", "capcut", "icloud", "apple", "microsoft", "adobe", "elevenlabs", "manus", "supvr", "z-api", "umbler", "epidemic sound", "canva", "openrouter", "claude", "aws", "appfy", "kiwifi", "udemy", "kaspersky", "antivirus", "dominio", "godaddy", "cloudflare", "vercel", "github", "figma", "slack", "zoom", "meet", "teams", "hubspot", "crm", "erp", "sulivan"] },
  ],
  "Colaboradores": [
    { keywords: ["salario", "folha de pagamento", "adiantamento", "adiantamento salarial", "13", "decimo terceiro", "ferias", "rescisao", "aviso previo", "fgts", "inss", "encargo", "contribuicao", "vale refeicao", "vr", "vale alimentacao", "va", "vale transporte", "vt", "beneficio", "plano de saude", "freelancer", "prestador", "autonomo", "designer", "roteirista", "editor", "julio", "larissa", "thais", "sophia", "luiz", "gabriel", "nathan", "kaue", "comissao", "hora extra", "pro-labore"] },
  ],
  "Marketing": [
    { keywords: ["influencer", "ugc", "creator", "conteudo patrocinado", "publi", "publicidade", "anuncio", "ads", "meta ads", "facebook ads", "instagram ads", "google ads", "tiktok ads", "youtube ads", "trafego pago", "impulsionamento", "boost", "campanha", "midia paga", "criativo", "video de anuncio", "patrocinio", "ganhadores", "dinamica", "sorteio", "brinde promocional"] },
  ],
};

// ─── STATUS DETECTION PATTERNS ───
export const PAID_PATTERNS = [
  "paguei", "ja paguei", "foi pago", "quitei", "liquidei",
  "efetuei o pagamento", "saiu do banco", "debitou", "debitou da conta",
  "paga", "pago", "acabei de pagar", "fiz o pix", "mandei o pix", "transferi",
];

export const PENDING_PATTERNS = [
  "vence", "vai vencer", "tenho que pagar", "preciso pagar",
  "vencimento dia", "a pagar", "pendente",
];

// ─── REMINDER DETECTION PATTERNS ───
export const REMINDER_PATTERNS = [
  "me lembra", "lembrar de", "criar lembrete", "lembrete:",
  "me avisa", "nao esquecer", "não esquecer", "me lembre",
];

// ─── KNOWN BANK NAME PATTERNS ───
export const KNOWN_BANKS = [
  "nubank", "itau", "bradesco", "santander", "inter",
  "c6", "caixa", "conta simples", "conta empresa",
];

// ─── SUBCATEGORY REQUIREMENTS ───
// Categories that require subcategory when identified
export const CATEGORIES_REQUIRING_SUBCATEGORY = [
  "Colaboradores",
  "Custos Fixos",
  "Insumos e Diversos",
];

// Categories where subcategory is NOT used by default
export const CATEGORIES_NO_SUBCATEGORY = [
  "Marketing",
  "Software",
];

// ─── SPECIAL VENDOR RULES ───
export const VENDOR_CANONICAL_RULES: Record<string, {
  canonical: string;
  categoria: string;
  tipo: "fixa" | "avulsa" | "variavel";
  is_variable: boolean;
  extract_person?: boolean;
  description_template?: string;
}> = {
  "claude": {
    canonical: "Claude IA",
    categoria: "Software",
    tipo: "fixa",
    is_variable: true,
    extract_person: true,
    description_template: "Claude IA do {person}",
  },
  "claude ai": {
    canonical: "Claude IA",
    categoria: "Software",
    tipo: "fixa",
    is_variable: true,
    extract_person: true,
    description_template: "Claude IA do {person}",
  },
  "claude ia": {
    canonical: "Claude IA",
    categoria: "Software",
    tipo: "fixa",
    is_variable: true,
    extract_person: true,
    description_template: "Claude IA do {person}",
  },
};

// ─── KNOWN VARIABLE ACCOUNTS ───
// Accounts that recur monthly but with variable amounts
export const KNOWN_VARIABLE_ACCOUNTS = [
  "energia", "luz", "conta de luz", "cpfl", "enel", "elektro",
  "agua", "sabesp",
  "gas",
  "condominio",
  "vivo movel", "claro movel", "tim movel",
  "google workspace",
  "aws", "amazon web services",
  "openrouter",
  "claude",
];

// ─── PAYMENT RULES ───
export const PAYMENT_RULES: Record<string, { requires: string }> = {
  pix: { requires: "banco" },
  dinheiro: { requires: "none" },
  cartao: { requires: "cartao" },
  boleto: { requires: "none" },
};
