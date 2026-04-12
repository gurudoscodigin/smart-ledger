import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_drive";

type DriveMirrorPayload = {
  transacao_id: string;
  file_path: string;
  file_name: string;
  doc_type?: string;
};

type CategoriaInfo = {
  nome?: string | null;
  eh_colaborador?: boolean | null;
};

type TransactionInfo = {
  descricao: string;
  data_vencimento: string;
  categorias?: CategoriaInfo | CategoriaInfo[] | null;
};

class DriveMirrorQueuedError extends Error {
  payload: Record<string, unknown>;

  constructor(payload: Record<string, unknown>) {
    super(String(payload.message ?? "Drive mirror queued"));
    this.name = "DriveMirrorQueuedError";
    this.payload = payload;
  }
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getCategoriaInfo(tx: TransactionInfo): CategoriaInfo | null {
  if (!tx.categorias) return null;
  return Array.isArray(tx.categorias) ? tx.categorias[0] ?? null : tx.categorias;
}

function buildDrivePath(tx: TransactionInfo, docType: string) {
  const vencimento = new Date(tx.data_vencimento);
  const year = vencimento.getFullYear();
  const monthNum = String(vencimento.getMonth() + 1).padStart(2, "0");
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const month = `${monthNum}-${monthNames[vencimento.getMonth()]}`;

  const categoria = getCategoriaInfo(tx);
  const isColaborador = categoria?.eh_colaborador === true;
  const categoryName = categoria?.nome || "Sem Categoria";
  const rootFolder = `CONTROLE FINANCEIRO - financeiro ${year}`;

  if (isColaborador) {
    const docTypeLabel = docType === "nf"
      ? "NF"
      : docType === "vr"
        ? "VR"
        : docType === "inss_fgts"
          ? "INSS + FGTS"
          : "Comprovantes";

    return [rootFolder, month, "Colaboradores", categoryName, docTypeLabel];
  }

  const docTypeLabel = docType === "boleto"
    ? "Boleto"
    : docType === "nfe"
      ? "NFe"
      : "Comprovante";

  return [rootFolder, month, categoryName, docTypeLabel];
}

function buildStandardizedName(tx: TransactionInfo, fileName: string) {
  const dateStr = tx.data_vencimento;
  const cleanDesc = tx.descricao
    .replace(/[^a-zA-Z0-9áàãâéèêíìóòõôúùç\s-]/gi, "")
    .trim()
    .replace(/\s+/g, "_");
  const ext = fileName.split(".").pop() || "pdf";

  return `${dateStr}_${cleanDesc}_Comprovante.${ext}`;
}

function buildQueuePayload(drivePath: string[], standardizedName: string, message: string) {
  return {
    ok: true,
    queued: true,
    drive_path: drivePath.join("/"),
    standardized_name: standardizedName,
    message,
  };
}

function validatePayload(payload: Partial<DriveMirrorPayload>) {
  if (!payload.transacao_id || !payload.file_path || !payload.file_name) {
    throw new Error("transacao_id, file_path e file_name são obrigatórios");
  }
}

function buildDriveFolderQuery(folderName: string, parentId: string) {
  const params = new URLSearchParams({
    q: `name='${folderName.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
  });

  return `${GATEWAY_URL}/drive/v3/files?${params.toString()}`;
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function maybeThrowConnectorQueuedError(
  response: Response,
  responseData: any,
  drivePath: string[],
  standardizedName: string,
) {
  const credentialMissing = [401, 403].includes(response.status)
    && responseData?.type === "unauthorized"
    && responseData?.message === "Credential not found"
    && responseData?.props?.source === "connectors_gateway";

  if (credentialMissing) {
    throw new DriveMirrorQueuedError(
      buildQueuePayload(
        drivePath,
        standardizedName,
        "Google Drive não está vinculado ao projeto. Arquivo mantido em fila no Supabase.",
      ),
    );
  }
}

async function ensureDriveFolder(
  folderName: string,
  parentId: string,
  headers: Record<string, string>,
  drivePath: string[],
  standardizedName: string,
) {
  const searchResp = await fetch(buildDriveFolderQuery(folderName, parentId), { headers });
  const searchData = await parseJsonResponse(searchResp);

  maybeThrowConnectorQueuedError(searchResp, searchData, drivePath, standardizedName);

  if (!searchResp.ok) {
    throw new Error(`Failed to search folder [${searchResp.status}]: ${JSON.stringify(searchData)}`);
  }

  const existingFolder = searchData?.files?.[0];
  if (existingFolder?.id) return existingFolder.id as string;

  const createResp = await fetch(`${GATEWAY_URL}/drive/v3/files`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });

  const createData = await parseJsonResponse(createResp);
  maybeThrowConnectorQueuedError(createResp, createData, drivePath, standardizedName);

  if (!createResp.ok || !createData?.id) {
    throw new Error(`Failed to create folder [${createResp.status}]: ${JSON.stringify(createData)}`);
  }

  return createData.id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json() as Partial<DriveMirrorPayload>;
    validatePayload(payload);

    const { transacao_id, file_path, file_name, doc_type = "comprovante" } = payload as DriveMirrorPayload;

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

    const drivePath = buildDrivePath(tx as TransactionInfo, doc_type);
    const standardizedName = buildStandardizedName(tx as TransactionInfo, file_name);

    // Check if Google Drive connector is available
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GOOGLE_DRIVE_API_KEY = Deno.env.get("GOOGLE_DRIVE_API_KEY");

    if (!LOVABLE_API_KEY || !GOOGLE_DRIVE_API_KEY) {
      console.log("Google Drive not configured. File queued for manual sync.");
      return jsonResponse(
        buildQueuePayload(
          drivePath,
          standardizedName,
          "Google Drive não configurado. Arquivo salvo apenas no Supabase.",
        ),
      );
    }

    // Download file from Supabase Storage
    const { data: fileData, error: downloadErr } = await supabase.storage
      .from("comprovantes")
      .download(file_path);

    if (downloadErr) throw downloadErr;

    // Create folder structure in Drive
    const gatewayHeaders = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GOOGLE_DRIVE_API_KEY,
    };
    let parentId = "root";

    for (const folderName of drivePath) {
      parentId = await ensureDriveFolder(folderName, parentId, gatewayHeaders, drivePath, standardizedName);
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
          ...gatewayHeaders,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: combined,
      }
    );

    const uploadData = await parseJsonResponse(uploadResp);
    maybeThrowConnectorQueuedError(uploadResp, uploadData, drivePath, standardizedName);

    if (!uploadResp.ok) {
      throw new Error(`Drive upload failed [${uploadResp.status}]: ${JSON.stringify(uploadData)}`);
    }

    // Update comprovante with Drive URL
    const { error: updateErr } = await supabase
      .from("comprovantes")
      .update({ drive_url: uploadData.webViewLink })
      .eq("transacao_id", transacao_id)
      .eq("file_path", file_path);

    if (updateErr) throw updateErr;

    return jsonResponse({
        ok: true,
        drive_file_id: uploadData.id,
        drive_url: uploadData.webViewLink,
        drive_path: drivePath.join("/"),
      standardized_name: standardizedName,
      });
  } catch (err: any) {
    if (err instanceof DriveMirrorQueuedError) {
      console.warn("Drive mirror queued:", err.payload);
      return jsonResponse(err.payload);
    }

    console.error("Drive mirror error:", err);
    return jsonResponse({ error: err.message, queued: true }, 500);
  }
});
