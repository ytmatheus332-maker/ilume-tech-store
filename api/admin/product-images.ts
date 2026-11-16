import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const publicKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const bucketName = "product-images";
const cleanupTokenLifetimeMs = 30 * 24 * 60 * 60 * 1000;

type ImageRow = {
  id: string;
  product_id: string;
  variant_id: string | null;
  storage_path: string;
  position: number;
  is_primary: boolean;
};

type CleanupPayload = { path: string; productId: string; issuedAt: number };

function jsonError(res: any, status: number, error: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ success: false, error, ...extra });
}

function isValidUUID(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function getObjectPath(value: string): string | null {
  try {
    const url = new URL(value);
    const configuredOrigin = new URL(supabaseUrl).origin;
    const prefix = `/storage/v1/object/public/${bucketName}/`;
    if (url.origin !== configuredOrigin || !url.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    const segments = path.split("/");
    if (!path || path.includes("\\") || segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
    return path;
  } catch {
    return null;
  }
}

function signCleanup(payload: CleanupPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", serviceRoleKey).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function readCleanupToken(token: unknown): CleanupPayload | null {
  if (typeof token !== "string") return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = createHmac("sha256", serviceRoleKey).update(encoded).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(signature, "base64url"); } catch { return null; }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as CleanupPayload;
    if (typeof payload.path !== "string" || !payload.path || !isValidUUID(payload.productId) || !Number.isFinite(payload.issuedAt)) return null;
    if (Date.now() - payload.issuedAt > cleanupTokenLifetimeMs || payload.issuedAt > Date.now() + 60_000) return null;
    return payload;
  } catch { return null; }
}

async function listImageRows(client: any): Promise<{ rows: ImageRow[] | null; error: string | null }> {
  const rows: ImageRow[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client.from("product_images")
      .select("id, product_id, variant_id, storage_path, position, is_primary")
      .order("id")
      .range(from, from + pageSize - 1);
    if (error) return { rows: null, error: error.message };
    rows.push(...((data || []) as ImageRow[]));
    if (!data || data.length < pageSize) return { rows, error: null };
  }
}

function sameObject(row: ImageRow, path: string): boolean | null {
  const otherPath = getObjectPath(row.storage_path);
  if (otherPath === null) return null;
  return otherPath === path;
}

async function ensureUnshared(client: any, path: string, ignoredImageId?: string) {
  const result = await listImageRows(client);
  if (!result.rows) return { ok: false as const, reason: "Não foi possível verificar as referências das imagens.", status: 500 };
  for (const row of result.rows) {
    if (row.id === ignoredImageId) continue;
    const matches = sameObject(row, path);
    if (matches === null) return { ok: false as const, reason: "Há uma referência de imagem que não pôde ser identificada com segurança. Nenhum arquivo foi excluído.", status: 409 };
    if (matches) return { ok: false as const, reason: "Este arquivo é compartilhado por outro registro de imagem. Remova ou substitua a outra referência antes de excluí-lo.", status: 409 };
  }
  return { ok: true as const, rows: result.rows };
}

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return jsonError(res, 405, "Método não permitido.");
  }
  if (!supabaseUrl || !serviceRoleKey || !publicKey) {
    console.error("[Product Images API] Configuração do Supabase ausente.");
    return jsonError(res, 500, "Configuração do servidor incompleta.");
  }

  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return jsonError(res, 401, "Autenticação necessária.");

  let deletedImage: { path: string; productId: string } | null = null;
  try {
    const authClient = createClient(supabaseUrl, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(match[1]);
    if (authError || !authData.user) return jsonError(res, 401, "Sessão inválida ou expirada.");
    const { data: role, error: roleError } = await adminClient.from("ilume_user_roles").select("role")
      .eq("user_id", authData.user.id).eq("role", "owner").maybeSingle();
    if (roleError) {
      console.error("[Product Images API] Falha ao verificar papel administrativo:", roleError.message);
      return jsonError(res, 500, "Não foi possível verificar as permissões.");
    }
    if (!role) return jsonError(res, 403, "Acesso restrito ao proprietário da loja.");

    const { action } = req.body || {};
    if (action === "cleanup") {
      const cleanup = readCleanupToken(req.body?.cleanup_token);
      if (!cleanup) return jsonError(res, 400, "A autorização para a limpeza expirou ou é inválida. A imagem não foi removida do banco; contate o suporte para conferir o Storage.");
      const refs = await ensureUnshared(adminClient, cleanup.path);
      if (!refs.ok) return jsonError(res, refs.status, refs.reason, { cleanupPending: true });
      const { error } = await adminClient.storage.from(bucketName).remove([cleanup.path]);
      if (error) {
        console.error("[Product Images API] Limpeza pendente no Storage:", error.message);
        return jsonError(res, 502, "A imagem já foi removida da galeria, mas a exclusão do arquivo no Storage falhou. Tente novamente.", { cleanupPending: true });
      }
      return res.status(200).json({ success: true, message: "Arquivo removido do Storage." });
    }

    if (action !== "delete" || !isValidUUID(req.body?.image_id) || !isValidUUID(req.body?.product_id)) {
      return jsonError(res, 400, "Solicitação de remoção inválida.");
    }

    const { data: imageData, error: imageError } = await adminClient.from("product_images")
      .select("id, product_id, variant_id, storage_path, position, is_primary")
      .eq("id", req.body.image_id).eq("product_id", req.body.product_id).maybeSingle();
    if (imageError) {
      console.error("[Product Images API] Falha ao buscar imagem:", imageError.message);
      return jsonError(res, 500, "Não foi possível carregar a imagem para remoção.");
    }
    if (!imageData) return jsonError(res, 404, "A imagem não foi encontrada.");
    const image = imageData as ImageRow;
    const objectPath = getObjectPath(image.storage_path);
    if (!objectPath) return jsonError(res, 409, "O caminho salvo não corresponde com segurança a um arquivo público do bucket product-images. Nenhum dado foi removido.");

    const refs = await ensureUnshared(adminClient, objectPath, image.id);
    if (!refs.ok) return jsonError(res, refs.status, refs.reason);
    const productImages = refs.rows.filter((row) => row.product_id === image.product_id && row.id !== image.id)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    const replacement = image.is_primary
      ? productImages.find((row) => row.variant_id === image.variant_id) || productImages.find((row) => row.variant_id === null) || productImages[0]
      : undefined;
    if (image.is_primary && !replacement) return jsonError(res, 409, "Esta é a última imagem do produto. Cadastre outra imagem antes de remover a principal.");

    if (replacement) {
      const { error: clearPrimaryError } = await adminClient.from("product_images").update({ is_primary: false }).eq("id", image.id);
      if (clearPrimaryError) {
        console.error("[Product Images API] Falha ao liberar a imagem principal:", clearPrimaryError.message);
        return jsonError(res, 500, "Não foi possível preparar a troca da imagem principal. Nenhum arquivo foi removido.");
      }
      const { error } = await adminClient.from("product_images").update({ is_primary: true }).eq("id", replacement.id);
      if (error) {
        await adminClient.from("product_images").update({ is_primary: true }).eq("id", image.id);
        console.error("[Product Images API] Falha ao promover imagem substituta:", error.message);
        return jsonError(res, 500, "Não foi possível definir outra imagem principal. Nenhum arquivo foi removido.");
      }
    }

    const { error: deleteError } = await adminClient.from("product_images").delete().eq("id", image.id).eq("product_id", image.product_id);
    if (deleteError) {
      if (replacement) {
        await adminClient.from("product_images").update({ is_primary: false }).eq("id", replacement.id);
        await adminClient.from("product_images").update({ is_primary: true }).eq("id", image.id);
      }
      console.error("[Product Images API] Falha ao remover registro da imagem:", deleteError.message);
      return jsonError(res, 500, "Não foi possível remover o registro da imagem. O arquivo do Storage foi preservado.");
    }
    deletedImage = { path: objectPath, productId: image.product_id };

    let reindexFailed = false;
    for (let index = 0; index < productImages.length; index += 1) {
      const row = productImages[index];
      if (row.position === index) continue;
      const { error } = await adminClient.from("product_images").update({ position: index }).eq("id", row.id);
      if (error) { reindexFailed = true; console.error("[Product Images API] Falha ao reordenar imagens:", error.message); break; }
    }

    // Recheck immediately before deletion. If a reference appeared during the operation,
    // leave the object in Storage and return a signed retry handle for later verification.
    const finalRefs = await ensureUnshared(adminClient, objectPath);
    const cleanupToken = signCleanup({ path: objectPath, productId: image.product_id, issuedAt: Date.now() });
    if (!finalRefs.ok) {
      return res.status(207).json({ success: false, imageRemoved: true, cleanupPending: true, cleanupToken,
        error: `${finalRefs.reason} O registro foi removido, mas o arquivo permanece no Storage.` });
    }
    const { error: storageError } = await adminClient.storage.from(bucketName).remove([objectPath]);
    if (storageError) {
      console.error("[Product Images API] Exclusão do Storage pendente:", storageError.message);
      return res.status(207).json({ success: false, imageRemoved: true, cleanupPending: true, cleanupToken,
        error: `O registro foi removido da galeria, mas o arquivo permaneceu no Storage. ${reindexFailed ? "Também não foi possível concluir a ordenação das imagens. " : ""}Você pode tentar a limpeza novamente.` });
    }
    if (reindexFailed) return res.status(207).json({ success: false, imageRemoved: true, cleanupPending: false,
      error: "A imagem e o arquivo foram removidos, mas não foi possível concluir a ordenação das imagens. Recarregue a galeria e tente ajustar a ordenação." });
    return res.status(200).json({ success: true, message: "Imagem removida definitivamente." });
  } catch (error) {
    console.error("[Product Images API] Erro inesperado:", error instanceof Error ? error.message : "unknown");
    if (deletedImage) {
      const cleanupToken = signCleanup({ ...deletedImage, issuedAt: Date.now() });
      return res.status(207).json({ success: false, imageRemoved: true, cleanupPending: true, cleanupToken,
        error: "O registro foi removido, mas não foi possível confirmar a exclusão do arquivo no Storage. Tente a limpeza novamente." });
    }
    return jsonError(res, 500, "Ocorreu um erro ao processar a imagem.");
  }
}
