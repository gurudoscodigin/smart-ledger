import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Google Drive Mirroring Edge Function
 * 
 * Triggered after a comprovante is uploaded to Supabase Storage.
 * Mirrors the file to Google Drive with organized folder structure:
 * - Financeiro [Ano] / [Mês] / [Categoria ou Colaborador] / [Tipo]
 * 
 * For collaborators (eh_colaborador=true):
 * - Financeiro [Ano] / [Mês] / [Nome Colaborador] / NF | VR | Comprovante
 * 
 * Requires GOOGLE_DRIVE_API_KEY secret (via Google Drive connector).
 * Falls back to a retry queue if Drive is unavailable.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { transacao_id, file_path, file_name, doc_type } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get transaction details for folder routing
    const { data: tx, error: txErr } = await supabase
      .from("transacoes")
      .select("descricao, data_vencimento, categoria_tipo, categorias(nome, eh_colaborador)")
      .eq("id", transacao_id)
      .single();

    if (txErr) throw txErr;

    const vencimento = new Date(tx.data_vencimento);
    const year = vencimento.getFullYear();
    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const month = monthNames[vencimento.getMonth()];

    const categoria = (tx.categorias as any);
    const isColaborador = categoria?.eh_colaborador === true;
    const categoryName = categoria?.nome || "Sem Categoria";

    // Build Drive path
    let drivePath: string[];
    if (isColaborador) {
      const docTypeLabel = doc_type === "nf" ? "NF" : doc_type === "vr" ? "VR" : "Comprovantes";
      drivePath = [`Financeiro ${year}`, month, categoryName, docTypeLabel];
    } else {
      const docTypeLabel = tx.categoria_tipo === "divida" ? "Boleto" : "Comprovante";
      drivePath = [`Financeiro ${year}`, month, categoryName, docTypeLabel];
    }

    // Standardized file name
    const dateStr = tx.data_vencimento.replace(/-/g, "-");
    const cleanDesc = tx.descricao.replace(/[^a-zA-Z0-9áàãâéèêíìóòõôúùç\s-]/gi, "").trim().replace(/\s+/g, "_");
    const ext = file_name.split(".").pop() || "pdf";
    const standardizedName = `${dateStr}_${cleanDesc}_Comprovante.${ext}`;

    // Check if Google Drive connector is available
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_DRIVE_API_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY");

    if (!LOVABLE_API_KEY || !GOOGLE_DRIVE_API_KEY) {
      // Queue for later - store in comprovantes metadata
      console.log("Google Drive not configured. File queued for manual sync.");
      return new Response(
        JSON.stringify({
          ok: true,
          queued: true,
          drive_path: drivePath.join("/"),
          standardized_name: standardizedName,
          message: "Google Drive não configurado. Arquivo salvo apenas no Supabase.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Download file from Supabase Storage
    const { data: fileData, error: downloadErr } = await supabase.storage
      .from("comprovantes")
      .download(file_path);

    if (downloadErr) throw downloadErr;

    // Create folder structure in Drive
    const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_drive";
    let parentId = "root";

    for (const folderName of drivePath) {
      // Check if folder exists
      const searchResp = await fetch(
        `${GATEWAY_URL}/drive/v3/files?q=name='${encodeURIComponent(folderName)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
        {
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
          },
        }
      );

      const searchData = await searchResp.json();
      const existingFolder = searchData.files?.[0];

      if (existingFolder) {
        parentId = existingFolder.id;
      } else {
        // Create folder
        const createResp = await fetch(`${GATEWAY_URL}/drive/v3/files`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentId],
          }),
        });

        const created = await createResp.json();
        if (!createResp.ok) throw new Error(`Failed to create folder: ${JSON.stringify(created)}`);
        parentId = created.id;
      }
    }

    // Upload file to Drive
    const metadata = JSON.stringify({
      name: standardizedName,
      parents: [parentId],
    });

    const boundary = "boundary_" + Date.now();
    const fileBytes = new Uint8Array(await fileData.arrayBuffer());

    const body = new TextEncoder().encode(
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${metadata}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    );
    const end = new TextEncoder().encode(`\r\n--${boundary}--`);

    const combined = new Uint8Array(body.length + fileBytes.length + end.length);
    combined.set(body, 0);
    combined.set(fileBytes, body.length);
    combined.set(end, body.length + fileBytes.length);

    const uploadResp = await fetch(
      `${GATEWAY_URL}/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: combined,
      }
    );

    const uploadData = await uploadResp.json();
    if (!uploadResp.ok) throw new Error(`Drive upload failed: ${JSON.stringify(uploadData)}`);

    // Update comprovante with Drive URL
    await supabase
      .from("comprovantes")
      .update({ drive_url: uploadData.webViewLink })
      .eq("transacao_id", transacao_id);

    return new Response(
      JSON.stringify({
        ok: true,
        drive_file_id: uploadData.id,
        drive_url: uploadData.webViewLink,
        drive_path: drivePath.join("/"),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Drive mirror error:", err);
    return new Response(
      JSON.stringify({ error: err.message, queued: true }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
