
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";

interface BravoPayTransaction {
  id?: unknown;
  amount_cents?: unknown;
  currency?: unknown;
  status?: unknown;
  external_reference?: unknown;
}

interface BravoPayEvent {
  id?: unknown;
  type?: unknown;
  created?: unknown;
  data?: unknown;
}

interface BravoPayRpcResult {
  received?: boolean;
  duplicate?: boolean;
  message?: string;
  orderId?: string;
  transactionId?: string;
  eventId?: string;
  status?: string;
}

interface RpcError {
  code?: string;
  message?: string;
}

interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;

  on(
    event: "data",
    listener: (chunk: Buffer | string) => void
  ): this;

  on(event: "end", listener: () => void): this;

  on(event: "error", listener: (error: Error) => void): this;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(data: unknown): void;
}

export const config = {
  api: {
    bodyParser: false
  }
};

const SIGNATURE_TOLERANCE_SECONDS = 300;
const MAX_BODY_SIZE = 1024 * 1024;

const STATUS_MAP: Record<string, string> = {
  "transaction.created": "pending",
  "transaction.paid": "approved",
  "transaction.expired": "failed",
  "transaction.failed": "failed",
  "transaction.refunded": "refunded",
  "transaction.chargeback": "chargeback"
};

const EXPECTED_TRANSACTION_STATUS: Record<string, string> = {
  "transaction.created": "PENDING",
  "transaction.paid": "PAID",
  "transaction.expired": "EXPIRED",
  "transaction.failed": "FAILED",
  "transaction.refunded": "REFUNDED",
  "transaction.chargeback": "CHARGEBACK"
};

class BodyTooLargeError extends Error {
  constructor() {
    super("Corpo da requisição muito grande.");
    this.name = "BodyTooLargeError";
  }
}

function jsonResponse(
  res: ApiResponse,
  data: unknown,
  status = 200
): void {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(data);
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

// Lê o corpo diretamente do fluxo nativo da requisição Node.js.
// O bodyParser da Vercel permanece desativado para preservar
// exatamente os bytes utilizados na assinatura HMAC.
async function readRequestBody(
  request: ApiRequest
): Promise<Uint8Array> {
  const contentLength = getHeader(
    request.headers,
    "content-length"
  );

  if (contentLength !== "") {
    if (/^\d+$/.test(contentLength)) {
      const declaredSize = Number(contentLength);

      if (
        Number.isSafeInteger(declaredSize) &&
        declaredSize > MAX_BODY_SIZE
      ) {
        throw new BodyTooLargeError();
      }
    }
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let settled = false;

    request.on("data", (chunk) => {
      if (settled) {
        return;
      }

      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk, "utf8");

      totalSize += buffer.byteLength;

      if (totalSize > MAX_BODY_SIZE) {
        settled = true;
        reject(new BodyTooLargeError());
        return;
      }

      chunks.push(buffer);
    });

    request.on("end", () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(Buffer.concat(chunks, totalSize));
    });

    request.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    });
  });
}

function validateSignature(
  rawBody: Uint8Array,
  signatureHeader: string,
  secret: string
): boolean {
  if (
    rawBody.byteLength === 0 ||
    !signatureHeader ||
    !secret
  ) {
    return false;
  }

  const parts: Record<string, string> = {};

  for (const item of signatureHeader.split(",")) {
    const separator = item.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();

    if (key && value) {
      parts[key] = value;
    }
  }

  const timestamp = parts.t;
  const receivedSignature = parts.v1;

  if (
    !timestamp ||
    !receivedSignature ||
    !/^\d+$/.test(timestamp) ||
    !/^[a-f0-9]{64}$/i.test(receivedSignature)
  ) {
    return false;
  }

  const timestampNumber = Number(timestamp);

  if (!Number.isSafeInteger(timestampNumber)) {
    return false;
  }

  const currentTimestamp = Math.floor(Date.now() / 1000);

  if (
    Math.abs(currentTimestamp - timestampNumber) >
    SIGNATURE_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(`${timestamp}.`, "utf8")
    .update(rawBody)
    .digest();

  const receivedBuffer = Buffer.from(
    receivedSignature,
    "hex"
  );

  if (
    expectedSignature.length !== receivedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    expectedSignature,
    receivedBuffer
  );
}

function getRpcErrorStatus(error: RpcError): number {
  switch (error.code) {
    case "22023":
    case "22P02":
      return 400;

    case "P0002":
      return 404;

    case "23505":
      return 409;

    default:
      return 500;
  }
}

export default async function handler(
  req: ApiRequest,
  res: ApiResponse
): Promise<void> {
  if (req.method !== "POST") {
    return jsonResponse(
      res,
      { error: "Método não permitido." },
      405
    );
  }

  try {
    // 1. Configurações

    const supabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      "";

    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    const webhookSecret =
      process.env.BRAVOPAY_WEBHOOK_SECRET || "";

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error(
        "[BravoPay Webhook] Configuração do Supabase incompleta."
      );

      return jsonResponse(
        res,
        { error: "Configuração do servidor incompleta." },
        500
      );
    }

    if (!webhookSecret) {
      console.error(
        "[BravoPay Webhook] BRAVOPAY_WEBHOOK_SECRET não configurado."
      );

      return jsonResponse(
        res,
        { error: "Segredo do webhook não configurado." },
        500
      );
    }

    // 2. Capturar o corpo original

    let rawBody: Uint8Array;

    try {
      rawBody = await readRequestBody(req);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return jsonResponse(
          res,
          { error: "Corpo da requisição muito grande." },
          413
        );
      }

      throw error;
    }

    if (rawBody.byteLength === 0) {
      return jsonResponse(
        res,
        { error: "Corpo da requisição vazio." },
        400
      );
    }

    // 3. Validar assinatura HMAC

    const signature =
      getHeader(req.headers, "bravopay-signature") ||
      getHeader(req.headers, "x-bravopay-signature");

    if (
      !validateSignature(
        rawBody,
        signature,
        webhookSecret
      )
    ) {
      console.warn(
        "[BravoPay Webhook] Assinatura inválida ou expirada."
      );

      return jsonResponse(
        res,
        { error: "Assinatura inválida." },
        401
      );
    }

    // 4. Decodificar JSON após validar a assinatura

    let rawBodyText: string;

    try {
      rawBodyText = new TextDecoder("utf-8", {
        fatal: true
      }).decode(rawBody);
    } catch {
      return jsonResponse(
        res,
        { error: "Codificação do corpo inválida." },
        400
      );
    }

    let event: BravoPayEvent;

    try {
      const parsed: unknown = JSON.parse(rawBodyText);

      if (!isRecord(parsed)) {
        return jsonResponse(
          res,
          { error: "Estrutura do evento inválida." },
          400
        );
      }

      event = parsed as BravoPayEvent;
    } catch {
      return jsonResponse(
        res,
        { error: "JSON inválido." },
        400
      );
    }

    // 5. Validar identificação do evento

    if (
      typeof event.id !== "string" ||
      typeof event.type !== "string" ||
      !isRecord(event.data)
    ) {
      return jsonResponse(
        res,
        { error: "Estrutura do evento inválida." },
        400
      );
    }

    const eventId = event.id.trim();
    const eventType = event.type.trim().toLowerCase();

    if (
      !eventId ||
      eventId.length > 200 ||
      !eventType ||
      eventType.length > 64
    ) {
      return jsonResponse(
        res,
        { error: "Identificação do evento inválida." },
        400
      );
    }

    // 6. Identificar eventos permitidos

    const mappedStatus = STATUS_MAP[eventType];

    if (!mappedStatus) {
      return jsonResponse(res, {
        received: true,
        message: "Evento não processado."
      });
    }

    // 7. Validar dados da transação

    const transaction =
      event.data as BravoPayTransaction;

    if (
      typeof transaction.id !== "string" ||
      typeof transaction.external_reference !== "string"
    ) {
      return jsonResponse(
        res,
        {
          error: "Transação sem ID ou referência externa."
        },
        400
      );
    }

    const transactionId = transaction.id.trim();
    const orderId = transaction.external_reference.trim();

    if (
      !transactionId ||
      transactionId.length > 200 ||
      !orderId ||
      orderId.length > 36
    ) {
      return jsonResponse(
        res,
        {
          error: "ID da transação ou pedido inválido."
        },
        400
      );
    }

    // 8. Validar UUID do pedido

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(orderId)) {
      return jsonResponse(
        res,
        { error: "Referência externa do pedido inválida." },
        400
      );
    }

    // 9. Validar status da transação

    if (
      transaction.status !== undefined &&
      transaction.status !== null
    ) {
      if (
        typeof transaction.status !== "string" ||
        transaction.status.toUpperCase() !==
          EXPECTED_TRANSACTION_STATUS[eventType]
      ) {
        return jsonResponse(
          res,
          {
            error: "Status da transação incompatível com o evento."
          },
          400
        );
      }
    }

    // 10. Validar valor e moeda

    if (
      typeof transaction.amount_cents !== "number" ||
      !Number.isSafeInteger(transaction.amount_cents) ||
      transaction.amount_cents <= 0 ||
      transaction.currency !== "BRL"
    ) {
      return jsonResponse(
        res,
        { error: "Valor ou moeda inválidos." },
        400
      );
    }

    const transactionAmount = transaction.amount_cents;

    // 11. Inicializar Supabase

    const supabase = createClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    // 12. Processamento atômico pela RPC

    const { data, error } = await supabase.rpc(
      "process_bravopay_webhook",
      {
        p_event_id: eventId,
        p_event_type: eventType,
        p_order_id: orderId,
        p_transaction_id: transactionId,
        p_amount_cents: transactionAmount,
        p_currency: transaction.currency
      }
    );

    if (error) {
      const rpcError = error as RpcError;

      console.error(
        "[BravoPay Webhook] Erro na RPC:",
        {
          code: rpcError.code,
          message: rpcError.message
        }
      );

      return jsonResponse(
        res,
        {
          error: "Não foi possível processar o evento."
        },
        getRpcErrorStatus(rpcError)
      );
    }

    // 13. Validar resposta da RPC

    if (!isRecord(data)) {
      console.error(
        "[BravoPay Webhook] Resposta inesperada da RPC."
      );

      return jsonResponse(
        res,
        { error: "Resposta inválida do processamento." },
        500
      );
    }

    const result = data as BravoPayRpcResult;

    if (result.received !== true) {
      console.error(
        "[BravoPay Webhook] RPC não confirmou o recebimento."
      );

      return jsonResponse(
        res,
        { error: "Resposta inválida do processamento." },
        500
      );
    }

    // 14. Tratar evento duplicado

    if (result.duplicate === true) {
      console.log(
        `[BravoPay Webhook] Evento duplicado: ${eventId}`
      );

      return jsonResponse(res, {
        received: true,
        duplicate: true,
        message: "Evento já recebido ou processado."
      });
    }

    // 15. Validar resultado do processamento

    if (
      typeof result.orderId !== "string" ||
      typeof result.transactionId !== "string" ||
      typeof result.eventId !== "string" ||
      typeof result.status !== "string"
    ) {
      console.error(
        "[BravoPay Webhook] Dados incompletos na resposta da RPC."
      );

      return jsonResponse(
        res,
        { error: "Resposta inválida do processamento." },
        500
      );
    }

    // 16. Confirmar processamento

    console.log(
      `[BravoPay Webhook] Pedido ${result.orderId} atualizado para ${result.status}.`
    );

    return jsonResponse(res, {
      received: true,
      orderId: result.orderId,
      transactionId: result.transactionId,
      eventId: result.eventId,
      status: result.status
    });

  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    console.error(
      "[BravoPay Webhook] Erro interno:",
      message
    );

    return jsonResponse(
      res,
      { error: "Erro interno no webhook." },
      500
    );
  }
}
