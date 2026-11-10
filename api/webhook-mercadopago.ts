
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";

type ApiRequest = {
  method?: string;
  body?: any;
  query: Record<string, string | string[] | undefined>;
  headers: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
  end: () => void;
};

function getValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function validateSignature(
  signature: string,
  requestId: string,
  dataId: string,
  secret: string
): boolean {
  if (!signature || !requestId || !dataId || !secret) {
    return false;
  }

  const parts: Record<string, string> = {};

  for (const part of signature.split(",")) {
    const [key, ...values] = part.trim().split("=");

    if (key && values.length) {
      parts[key] = values.join("=");
    }
  }

  const timestamp = parts.ts;
  const receivedHash = parts.v1;

  if (!timestamp || !receivedHash) {
    return false;
  }

  const manifest =
    `id:${dataId};request-id:${requestId};ts:${timestamp};`;

  const expectedHash = createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  if (!/^[a-f0-9]{64}$/i.test(receivedHash)) {
    return false;
  }

  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const receivedBuffer = Buffer.from(receivedHash, "hex");

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export default async function handler(
  req: ApiRequest,
  res: ApiResponse
) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido."
    });
  }

  try {
    const supabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      "";

    const supabaseServiceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    const mpAccessToken =
      process.env.MP_ACCESS_TOKEN || "";

    const webhookSecret =
      process.env.MP_WEBHOOK_SECRET || "";

    if (!supabaseUrl || !supabaseServiceKey || !mpAccessToken) {
      console.error("[Webhook] Configuração do servidor incompleta.");

      return res.status(500).json({
        error: "Configuração do servidor incompleta."
      });
    }

    if (!webhookSecret) {
      console.error("[Webhook] MP_WEBHOOK_SECRET não configurado.");

      return res.status(500).json({
        error: "Assinatura do webhook não configurada."
      });
    }

    const body = req.body || {};

    const eventType = String(
      body.type || body.topic || ""
    ).toLowerCase();

    const action = String(body.action || "").toLowerCase();

    if (
      eventType !== "payment" &&
      !action.includes("payment")
    ) {
      return res.status(200).json({
        received: true,
        message: "Evento ignorado."
      });
    }

    const dataId = getValue(req.query["data.id"]);

    const signature = getValue(
      req.headers["x-signature"]
    );

    const requestId = getValue(
      req.headers["x-request-id"]
    );

    if (!dataId || !signature || !requestId) {
      return res.status(400).json({
        error: "Dados necessários para validar o webhook ausentes."
      });
    }

    // 1. Validar assinatura do Mercado Pago

    const signatureIsValid = validateSignature(
      signature,
      requestId,
      dataId,
      webhookSecret
    );

    if (!signatureIsValid) {
      console.warn("[Webhook] Assinatura inválida.");

      return res.status(401).json({
        error: "Assinatura inválida."
      });
    }

    // 2. Consultar pagamento diretamente no Mercado Pago

    const paymentResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${mpAccessToken}`
        }
      }
    );

    if (!paymentResponse.ok) {
      console.error(
        "[Webhook] Falha ao consultar pagamento:",
        paymentResponse.status
      );

      return res.status(500).json({
        error: "Não foi possível consultar o pagamento."
      });
    }

    const payment = await paymentResponse.json();

    const orderId = String(
      payment.external_reference || ""
    );

    if (!orderId) {
      console.warn("[Webhook] Pagamento sem external_reference.");

      return res.status(200).json({
        received: true,
        message: "Pagamento sem referência de pedido."
      });
    }

    // 3. Inicializar Supabase

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

    // 4. Buscar pedido correspondente

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(
        "id, total_amount_cents, status, gateway, preference_id, gateway_payment_id"
      )
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      console.error("[Webhook] Erro ao buscar pedido:", orderError);

      return res.status(500).json({
        error: "Erro ao consultar pedido."
      });
    }

    if (!order) {
      console.warn("[Webhook] Pedido não encontrado:", orderId);

      return res.status(200).json({
        received: true,
        message: "Pedido não encontrado."
      });
    }

    if (order.gateway !== "mercadopago") {
      return res.status(200).json({
        received: true,
        message: "Gateway incompatível."
      });
    }

    // 5. Conferir valor e moeda

    const paidAmountCents = Math.round(
      Number(payment.transaction_amount) * 100
    );

    if (
      payment.currency_id !== "BRL" ||
      !Number.isFinite(paidAmountCents) ||
      paidAmountCents !== Number(order.total_amount_cents)
    ) {
      console.error(
        "[Webhook] Divergência de valor ou moeda.",
        orderId
      );

      return res.status(400).json({
        error: "Valor ou moeda do pagamento incompatível."
      });
    }

    // 6. Conferir preferência, quando disponível

    if (
      order.preference_id &&
      payment.preference_id &&
      String(order.preference_id) !== String(payment.preference_id)
    ) {
      console.error("[Webhook] Preferência incompatível:", orderId);

      return res.status(400).json({
        error: "Preferência de pagamento incompatível."
      });
    }

    // 7. Mapear status confirmado pelo Mercado Pago

    const paymentStatus = String(payment.status || "");

    const statusMap: Record<string, string> = {
      approved: "approved",
      pending: "pending",
      in_process: "pending",
      authorized: "pending",
      in_mediation: "pending",
      rejected: "rejected",
      cancelled: "rejected"
    };

    const mappedStatus = statusMap[paymentStatus];

    if (!mappedStatus) {
      console.log(
        "[Webhook] Status não processado:",
        paymentStatus
      );

      return res.status(200).json({
        received: true,
        message: "Status não processado."
      });
    }

    const paymentId = String(payment.id);

    // 8. Impedir que uma notificação antiga ou outro
    // pagamento altere um pedido já aprovado.

    if (
      order.status === "approved" &&
      order.gateway_payment_id &&
      String(order.gateway_payment_id) !== paymentId
    ) {
      console.warn(
        "[Webhook] Pedido já aprovado por outro pagamento:",
        orderId
      );

      return res.status(200).json({
        received: true,
        message: "Pedido já possui pagamento aprovado."
      });
    }

    if (
      order.status === "approved" &&
      mappedStatus !== "approved"
    ) {
      return res.status(200).json({
        received: true,
        message: "Pedido já aprovado; status preservado."
      });
    }

    // 9. Atualizar pedido no Supabase

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: mappedStatus,
        gateway_payment_id: paymentId
      })
      .eq("id", orderId);

    if (updateError) {
      console.error(
        "[Webhook] Erro ao atualizar pedido:",
        updateError
      );

      return res.status(500).json({
        error: "Falha ao atualizar pedido."
      });
    }

    console.log(
      `[Webhook] Pedido ${orderId} atualizado para ${mappedStatus}.`
    );

    return res.status(200).json({
      received: true,
      orderId,
      paymentId,
      status: mappedStatus
    });

  } catch (error: any) {
    console.error(
      "[Webhook] Erro interno:",
      error?.message || error
    );

    return res.status(500).json({
      error: "Erro interno no webhook."
    });
  }
}
