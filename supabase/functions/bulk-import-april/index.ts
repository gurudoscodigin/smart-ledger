import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const USER_ID = "77193628-bdd3-41b5-95e4-15a5176c3590";
  const CAT = {
    custos: "d67feb5c-421f-4a24-a6e4-c421b6587904",
    software: "c25c79ee-0f0d-41d1-ba68-fc5353102636",
    marketing: "7020522d-c983-4cc5-9ce6-6bb28d66e0a0",
    colaboradores: "8a2f55b2-3f60-4784-b2d9-8b07b81a6b7c",
    insumos: "f7c9613f-458c-45ae-8b8c-cba0100949e2",
  };
  const CARTAO_0981 = "37183181-f9e6-4940-946c-2bd43bdb5755";

  const items = [
    // CUSTOS OPERACIONAIS - FIXOS
    { descricao: "Aluguel", valor: 2607.00, data_vencimento: "2026-04-13", status: "pendente", categoria_id: CAT.custos, categoria_tipo: "fixa", origem: "pix" },
    { descricao: "Internet", valor: 99.99, data_vencimento: "2026-04-13", status: "pendente", categoria_id: CAT.custos, categoria_tipo: "fixa", origem: "pix" },
    { descricao: "Energia", valor: 215.24, data_vencimento: "2026-04-13", status: "pendente", categoria_id: CAT.custos, categoria_tipo: "fixa", origem: "pix" },
    { descricao: "Vivo Movel", valor: 479.88, data_vencimento: "2026-04-17", status: "pendente", categoria_id: CAT.custos, categoria_tipo: "fixa", origem: "pix" },
    { descricao: "Condominio", valor: 601.42, data_vencimento: "2026-04-05", status: "pago", data_pagamento: "2026-04-05", categoria_id: CAT.custos, categoria_tipo: "fixa", origem: "pix" },
    { descricao: "Pamela - faxina", valor: 200.00, data_vencimento: "2026-04-08", status: "pago", data_pagamento: "2026-04-08", categoria_id: CAT.custos, categoria_tipo: "fixa", origem: "pix" },
    { descricao: "Contabilidade", valor: 1053.00, data_vencimento: "2026-04-05", status: "pago", data_pagamento: "2026-04-05", categoria_id: CAT.custos, categoria_tipo: "fixa", origem: "pix" },

    // SOFTWARE E LICENÇAS
    { descricao: "SuperVR - fixo", valor: 59.90, data_vencimento: "2026-04-02", status: "pendente", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "Google Workspace", valor: 1666.00, data_vencimento: "2026-04-01", status: "pago", data_pagamento: "2026-04-01", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "Google Dominio Temp", valor: 294.00, data_vencimento: "2026-04-02", status: "pago", data_pagamento: "2026-04-02", categoria_id: CAT.software, categoria_tipo: "avulsa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "ClickSing", valor: 99.00, data_vencimento: "2026-04-11", status: "pendente", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "Manus", valor: 226.98, data_vencimento: "2026-04-04", status: "pago", data_pagamento: "2026-04-04", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "Sulivan", valor: 7477.11, data_vencimento: "2026-04-10", status: "pendente", categoria_id: CAT.software, categoria_tipo: "fixa", origem: "boleto", parcela_atual: 2, parcela_total: 2 },
    { descricao: "CapCut PRO", valor: 65.90, data_vencimento: "2026-04-09", status: "pendente", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "Icloud Apple", valor: 66.90, data_vencimento: "2026-04-09", status: "pendente", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "Microsoft Business", valor: 105.21, data_vencimento: "2026-04-11", status: "pendente", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "Notion", valor: 64.08, data_vencimento: "2026-04-12", status: "pendente", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "Hostinger", valor: 159.99, data_vencimento: "2026-04-05", status: "pago", data_pagamento: "2026-04-05", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "Epidemic Sound", valor: 59.00, data_vencimento: "2026-04-09", status: "pendente", categoria_id: CAT.software, categoria_tipo: "fixa", origem: "cartao" },
    { descricao: "MIRO", valor: 233.45, data_vencimento: "2026-04-12", status: "pendente", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "Lovable", valor: 150.32, data_vencimento: "2026-04-19", status: "pendente", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "Claude - Kaue", valor: 115.08, data_vencimento: "2026-04-09", status: "pendente", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "Lovable - Kaue", valor: 134.89, data_vencimento: "2026-04-10", status: "pendente", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "Claude", valor: 110.00, data_vencimento: "2026-04-12", status: "pendente", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "Claude - Nathan", valor: 110.00, data_vencimento: "2026-04-15", status: "pendente", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "ElevenLabs", valor: 119.02, data_vencimento: "2026-04-26", status: "pendente", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "AWS", valor: 170.00, data_vencimento: "2026-04-30", status: "pendente", categoria_id: CAT.software, categoria_tipo: "variavel", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "Openrouter", valor: 31.14, data_vencimento: "2026-04-02", status: "pago", data_pagamento: "2026-04-02", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },
    { descricao: "Canva", valor: 50.00, data_vencimento: "2026-04-06", status: "pago", data_pagamento: "2026-04-06", categoria_id: CAT.software, categoria_tipo: "fixa", cartao_id: CARTAO_0981, origem: "cartao" },

    // MARKETING
    { descricao: "Influencers", valor: 0, data_vencimento: "2026-04-30", status: "pendente", categoria_id: CAT.marketing, categoria_tipo: "variavel", subcategoria: "Influencer", origem: "pix" },
    { descricao: "UGC", valor: 0, data_vencimento: "2026-04-30", status: "pendente", categoria_id: CAT.marketing, categoria_tipo: "variavel", subcategoria: "UGC", origem: "pix" },
    { descricao: "Anuncios Meta", valor: 0, data_vencimento: "2026-04-30", status: "pendente", categoria_id: CAT.marketing, categoria_tipo: "variavel", subcategoria: "Tráfego Pago", origem: "cartao" },

    // COLABORADORES
    { descricao: "Folha de Pagamento 1/2", valor: 4429.33, data_vencimento: "2026-04-05", status: "pago", data_pagamento: "2026-04-05", categoria_id: CAT.colaboradores, categoria_tipo: "fixa", subcategoria: "Colaborador Fixo", origem: "pix" },
    { descricao: "Folha de Pagamento 2/2", valor: 0, data_vencimento: "2026-04-20", status: "pendente", categoria_id: CAT.colaboradores, categoria_tipo: "variavel", subcategoria: "Colaborador Fixo", origem: "pix" },
    { descricao: "VR + VA - fixo", valor: 990.00, data_vencimento: "2026-04-27", status: "pendente", categoria_id: CAT.colaboradores, categoria_tipo: "fixa", subcategoria: "Colaborador Fixo", origem: "pix" },
    { descricao: "FGTS + INSS", valor: 0, data_vencimento: "2026-04-20", status: "pendente", categoria_id: CAT.colaboradores, categoria_tipo: "variavel", subcategoria: "Colaborador Fixo", origem: "pix" },
    { descricao: "Larissa - 1/2", valor: 1350.00, data_vencimento: "2026-04-01", status: "pago", data_pagamento: "2026-04-01", categoria_id: CAT.colaboradores, categoria_tipo: "fixa", subcategoria: "PJ", origem: "pix" },

    // INSUMOS E DIVERSOS
    { descricao: "Sonda - Mantimentos", valor: 42.73, data_vencimento: "2026-04-09", status: "pendente", categoria_id: CAT.insumos, categoria_tipo: "avulsa", origem: "cartao" },
  ];

  // Check existing to avoid duplicates
  const { data: existing } = await supabase
    .from("transacoes")
    .select("descricao, valor, data_vencimento")
    .eq("user_id", USER_ID)
    .is("deleted_at", null)
    .gte("data_vencimento", "2026-04-01")
    .lte("data_vencimento", "2026-04-30");

  const existingSet = new Set(
    (existing || []).map((e: any) => `${e.descricao}|${e.valor}|${e.data_vencimento}`)
  );

  const toInsert = items
    .filter(i => !existingSet.has(`${i.descricao}|${i.valor}|${i.data_vencimento}`))
    .map(i => ({
      user_id: USER_ID,
      importado_via_excel: true,
      id_contrato: `04_${i.categoria_tipo}_${i.descricao.toLowerCase().replace(/\s+/g, '_')}_${i.valor}_${i.data_vencimento}`,
      ...i,
    }));

  const { data, error } = await supabase.from("transacoes").insert(toInsert).select("id");

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });

  return new Response(JSON.stringify({ inserted: toInsert.length, skipped: items.length - toInsert.length }));
});
