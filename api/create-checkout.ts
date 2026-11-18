
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createRevantPayRecoveryCookie,
  getRevantPayCheckoutSession,
  hasRevantPayRecoveryProof,
  isTerminalRevantPayOrder
} from "../server/payments/revantpay.ts";

const BRAVOPAY_URL = "https://bravopay.club/api/v1";
const DEFAULT_STORE_URL = "https://ilume-tech-store.vercel.app";

const SUPABASE_TIMEOUT_MS = 3000;
const BRAVO_LOOKUP_TIMEOUT_MS = 3000;
const BRAVO_CREATE_TIMEOUT_MS = 15000;
const MP_TIMEOUT_MS = 7000;
const CHECKOUT_FUNCTION_TIMEOUT_MS = 30_000;
const FINALIZATION_RESERVE_MS = 1_500;
const BRAVO_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

type Gateway = "mercadopago" | "bravopay" | "revantpay";
const GATEWAYS: readonly Gateway[] = ["mercadopago", "bravopay", "revantpay"];

interface CheckoutItem {
  variantId: string;
  quantity: number;
}

interface ValidatedItem {
  variantId: string;
  quantity: number;
  priceCents: number;
  title: string;
}

interface CheckoutAddress {
  recipientName: string;
  recipientPhone: string;
  postalCode: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  reference: string;
  country: string;
}

const BRAZILIAN_STATES = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF",
  "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS",
  "RO", "RR", "SC", "SP", "SE", "TO"
]);

function normalizeDigits(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function normalizeAddressText(value: unknown): string {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function isValidUUID(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function safeCode(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const code = value.trim();

  if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(code)) {
    return null;
  }

  return code;
}

function getErrorName(error: any): string {
  return safeCode(error?.name) || "UNKNOWN";
}

function getErrorCode(error: any): string | null {
  return (
    safeCode(error?.cause?.code) ||
    safeCode(error?.code) ||
    null
  );
}

function isValidCPF(value: string): boolean {
  const cpf = normalizeDigits(value);

  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  const calculateDigit = (
    base: string,
    factor: number
  ): number => {
    let total = 0;

    for (const digit of base) {
      total += Number(digit) * factor--;
    }

    const remainder = (total * 10) % 11;

    return remainder === 10 ? 0 : remainder;
  };

  return (
    calculateDigit(cpf.slice(0, 9), 10) === Number(cpf[9]) &&
    calculateDigit(cpf.slice(0, 10), 11) === Number(cpf[10])
  );
}

function validateCheckoutAddress(value: any): CheckoutAddress | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const address: CheckoutAddress = {
    recipientName: normalizeAddressText(value.recipientName),
    recipientPhone: normalizeDigits(value.recipientPhone),
    postalCode: normalizeDigits(value.postalCode),
    street: normalizeAddressText(value.street),
    number: normalizeAddressText(value.number),
    complement: normalizeAddressText(value.complement),
    neighborhood: normalizeAddressText(value.neighborhood),
    city: normalizeAddressText(value.city),
    state: normalizeAddressText(value.state).toUpperCase(),
    reference: normalizeAddressText(value.reference),
    country: "Brasil"
  };

  if (
    address.recipientName.length < 3 ||
    address.recipientName.length > 150 ||
    address.recipientPhone.length < 10 ||
    address.recipientPhone.length > 13 ||
    address.postalCode.length !== 8 ||
    address.street.length < 2 ||
    address.street.length > 200 ||
    address.number.length < 1 ||
    address.number.length > 30 ||
    address.complement.length > 100 ||
    address.neighborhood.length < 2 ||
    address.neighborhood.length > 100 ||
    address.city.length < 2 ||
    address.city.length > 100 ||
    !BRAZILIAN_STATES.has(address.state) ||
    address.reference.length > 200
  ) {
    return null;
  }

  return address;
}

function sameAddress(existing: any, expected: CheckoutAddress): boolean {
  return (
    normalizeAddressText(existing.recipient_name) === expected.recipientName &&
    normalizeDigits(existing.recipient_phone) === expected.recipientPhone &&
    normalizeDigits(existing.postal_code) === expected.postalCode &&
    normalizeAddressText(existing.street) === expected.street &&
    normalizeAddressText(existing.number) === expected.number &&
    normalizeAddressText(existing.complement) === expected.complement &&
    normalizeAddressText(existing.neighborhood) === expected.neighborhood &&
    normalizeAddressText(existing.city) === expected.city &&
    normalizeAddressText(existing.state).toUpperCase() === expected.state &&
    normalizeAddressText(existing.reference) === expected.reference &&
    normalizeAddressText(existing.country || "Brasil") === expected.country
  );
}

async function ensureOrderAddress(
  supabase: any,
  orderId: string,
  address: CheckoutAddress
): Promise<"saved" | "conflict" | "error"> {
  const addressColumns = [
    "recipient_name",
    "recipient_phone",
    "postal_code",
    "street",
    "number",
    "complement",
    "neighborhood",
    "city",
    "state",
    "reference",
    "country"
  ].join(", ");

  const { data: existingAddress, error: readError } = await supabase
    .from("order_addresses")
    .select(addressColumns)
    .eq("order_id", orderId)
    .maybeSingle();

  if (readError) {
    console.error(
      "CHECKOUT: Erro ao consultar endereço do pedido.",
      readError.code || "UNKNOWN"
    );

    return "error";
  }

  if (existingAddress) {
    return sameAddress(existingAddress, address)
      ? "saved"
      : "conflict";
  }

  const { error: insertError } = await supabase
    .from("order_addresses")
    .insert({
      order_id: orderId,
      recipient_name: address.recipientName,
      recipient_phone: address.recipientPhone,
      postal_code: address.postalCode,
      street: address.street,
      number: address.number,
      complement: address.complement || null,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      reference: address.reference || null,
      country: address.country
    });

  if (!insertError) {
    return "saved";
  }

  if (insertError.code === "23505") {
    const { data: retryAddress, error: retryError } = await supabase
      .from("order_addresses")
      .select(addressColumns)
      .eq("order_id", orderId)
      .maybeSingle();

    if (retryError) {
      console.error(
        "CHECKOUT: Erro ao confirmar endereço após conflito.",
        retryError.code || "UNKNOWN"
      );

      return "error";
    }

    if (retryAddress) {
      return sameAddress(retryAddress, address)
        ? "saved"
        : "conflict";
    }
  }

  console.error(
    "CHECKOUT: Erro ao salvar endereço.",
    insertError.code || "UNKNOWN"
  );

  return "error";
}

function getProductName(products: unknown): string {
  if (Array.isArray(products)) {
    return products[0]?.name || "Produto";
  }

  if (products && typeof products === "object") {
    return (products as { name?: string }).name || "Produto";
  }

  return "Produto";
}

async function readJson(response: Response): Promise<any> {
  return response.json().catch(() => null);
}

function getGatewayErrorCode(data: any): string | null {
  return (
    safeCode(data?.error?.code) ||
    safeCode(data?.code) ||
    safeCode(data?.error_code) ||
    null
  );
}

function sameItems(
  existing: any[],
  expected: ValidatedItem[]
): boolean {
  if (existing.length !== expected.length) {
    return false;
  }

  const existingMap = new Map(
    existing.map((item) => [
      item.product_variant_id,
      {
        quantity: Number(item.quantity),
        price: Number(item.unit_price_cents)
      }
    ])
  );

  return expected.every((item) => {
    const saved = existingMap.get(item.variantId);

    return (
      saved !== undefined &&
      saved.quantity === item.quantity &&
      saved.price === item.priceCents
    );
  });
}

async function ensureOrderItems(
  supabase: any,
  orderId: string,
  items: ValidatedItem[],
  newlyCreated: boolean
): Promise<boolean> {
  if (!newlyCreated) {
    const { data: existingItems, error: readError } =
      await supabase
        .from("order_items")
        .select("product_variant_id, quantity, unit_price_cents")
        .eq("order_id", orderId);

    if (readError) {
      console.error(
        "CHECKOUT: Erro ao consultar itens existentes.",
        readError.code || "UNKNOWN"
      );

      return false;
    }

    if (existingItems?.length) {
      return sameItems(existingItems, items);
    }
  }

  const rows = items.map((item) => ({
    order_id: orderId,
    product_variant_id: item.variantId,
    quantity: item.quantity,
    unit_price_cents: item.priceCents
  }));

  const { error: insertError } = await supabase
    .from("order_items")
    .insert(rows);

  if (!insertError) {
    return true;
  }

  if (insertError.code === "23505") {
    const { data: retryItems, error: retryError } =
      await supabase
        .from("order_items")
        .select("product_variant_id, quantity, unit_price_cents")
        .eq("order_id", orderId);

    if (!retryError && retryItems) {
      return sameItems(retryItems, items);
    }
  }

  console.error(
    "CHECKOUT: Erro ao registrar itens.",
    insertError.code || "UNKNOWN"
  );

  return false;
}

async function markOrderFailed(
  supabase: any,
  orderId: string
): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .update({ status: "failed" })
    .eq("id", orderId)
    .eq("status", "pending");

  if (error) {
    console.error(
      "CHECKOUT: Não foi possível atualizar o pedido.",
      error.code || "UNKNOWN"
    );
  }
}

const BRAVO_TRANSACTION_STATUSES = new Set([
  "PENDING",
  "PAID",
  "EXPIRED",
  "FAILED",
  "REFUNDED",
  "CHARGEBACK"
]);

function getBravoTransactionForOrder(
  data: any,
  orderId: string
): { transaction: any | null; confirmedNoMatch: boolean } {
  let transactions: any[] | null = null;
  let absenceIsConfirmed = false;

  if (Array.isArray(data?.data)) {
    transactions = data.data;
    absenceIsConfirmed =
      typeof data.has_more === "boolean" &&
      data.has_more === false;
  } else if (Array.isArray(data?.transactions)) {
    transactions = data.transactions;
  } else if (Array.isArray(data)) {
    transactions = data;
  } else if (data && typeof data === "object" && data.id) {
    transactions = [data];
  }

  if (!transactions) {
    return { transaction: null, confirmedNoMatch: false };
  }

  const transaction = transactions.find(
    (item) => String(item?.external_reference || "") === orderId
  );

  if (transaction) {
    return { transaction, confirmedNoMatch: false };
  }

  return {
    transaction: null,
    confirmedNoMatch:
      transactions.length === 0 && absenceIsConfirmed
  };
}

function getBravoTransactionStatus(transaction: any): string | null {
  const status = String(transaction?.status || "").toUpperCase();

  return BRAVO_TRANSACTION_STATUSES.has(status) ? status : null;
}

async function saveBravoTransaction(
  supabase: any,
  orderId: string,
  transaction: any
): Promise<boolean> {
  const { data, error } = await supabase
    .from("orders")
    .update({
      gateway_payment_id: String(transaction.id)
    })
    .eq("id", orderId)
    .eq("gateway", "bravopay")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error(
      "CHECKOUT: Não foi possível vincular a transação BravoPay.",
      error?.code || "ORDER_NOT_UPDATED"
    );

    return false;
  }

  return true;
}

async function syncBravoOrderStatus(
  supabase: any,
  orderId: string,
  transactionStatus: string
): Promise<boolean> {
  const transitions: Record<string, { status: string; from: string[] }> = {
    PAID: { status: "approved", from: ["pending", "approved"] },
    EXPIRED: { status: "failed", from: ["pending", "failed"] },
    FAILED: { status: "failed", from: ["pending", "failed"] },
    REFUNDED: {
      status: "refunded",
      from: ["pending", "approved", "refunded"]
    },
    CHARGEBACK: {
      status: "chargeback",
      from: ["pending", "approved", "chargeback"]
    }
  };

  const transition = transitions[transactionStatus];

  if (!transition) return true;

  const { error } = await supabase
    .from("orders")
    .update({ status: transition.status })
    .eq("id", orderId)
    .eq("gateway", "bravopay")
    .in("status", transition.from);

  if (error) {
    console.error(
      "CHECKOUT: Não foi possível sincronizar o status BravoPay.",
      error.code || "UNKNOWN"
    );
    return false;
  }

  return true;
}

function returnBravoPayment(
  res: any,
  orderId: string,
  transaction: any,
  totalCents: number
) {
  const status = getBravoTransactionStatus(transaction) || "PENDING";
  const copyPaste = status === "PENDING"
    ? transaction.pix?.copy_paste || ""
    : "";

  return res.status(200).json({
    success: true,
    gateway: "bravopay",
    state: status === "PAID"
      ? "paid"
      : ["EXPIRED", "FAILED", "REFUNDED", "CHARGEBACK"].includes(status)
        ? "terminal"
        : copyPaste
          ? "available"
          : "processing",
    orderId,
    transactionId: String(transaction.id),
    payment: {
      method: "PIX",
      status,
      amountCents: totalCents,
      copyPaste,
      qrCode:
        getBravoTransactionStatus(transaction) === "PENDING"
          ? transaction.pix?.qr_code || null
          : null,
      qrCodeBase64:
        getBravoTransactionStatus(transaction) === "PENDING"
          ? transaction.pix?.qr_code_base64 || null
          : null,
      expiresAt: transaction.pix?.expires_at || null
    }
  });
}

function pendingPayment(
  res: any,
  orderId: string,
  message: string
) {
  return res.status(202).json({
    success: false,
    pending: true,
    state: "processing",
    orderId,
    error: message
  });
}

function findCheckoutOrder(supabase: SupabaseClient, checkoutRequestId: string) {
  return supabase
    .from("orders")
    .select("id, gateway, status, checkout_request_id, customer_name, customer_email, customer_phone")
    .eq("checkout_request_id", checkoutRequestId)
    .maybeSingle();
}

function terminalRevantPayOrder(res: any, orderId: string) {
  return res.status(409).json({
    success: false,
    gateway: "revantpay",
    state: "terminal",
    terminal: true,
    orderId,
    error: "Esta tentativa foi encerrada. Você pode iniciar uma nova compra."
  });
}

function checkoutTraceId(requestId: string): string {
  return createHash("sha256").update(requestId).digest("hex").slice(0, 24);
}

function returnStoredBravoOrderStatus(res: any, order: any) {
  const knownStatuses: Record<string, string> = {
    approved: "PAID",
    failed: "FAILED",
    refunded: "REFUNDED",
    chargeback: "CHARGEBACK"
  };

  const status = knownStatuses[String(order.status || "").toLowerCase()];

  if (!status) {
    return pendingPayment(
      res,
      order.id,
      "Ainda estamos verificando sua cobrança na BravoPay."
    );
  }

  return res.status(200).json({
    success: true,
    gateway: "bravopay",
    state: status === "PAID" ? "paid" : "terminal",
    orderId: order.id,
    transactionId: order.gateway_payment_id || null,
    payment: {
      method: "PIX",
      status,
      amountCents: Number(order.total_amount_cents),
      copyPaste: "",
      qrCode: null,
      qrCodeBase64: null,
      expiresAt: null
    }
  });
}

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");

    return res.status(405).json({
      error: "Método não permitido."
    });
  }

  const requestStartedAt = Date.now();

  let traceId = "unassigned";
  let orderId: string | null = null;

  function trace(event: string, details: Record<string, any> = {}) {
    console.info(
      "CHECKOUT_TRACE",
      JSON.stringify({
        event,
        traceId,
        orderId,
        elapsedMs: Date.now() - requestStartedAt,
        ...details
      })
    );
  }

  async function runStep<T>(
    step: string,
    action: () => PromiseLike<T>
  ): Promise<T> {
    const startedAt = Date.now();

    try {
      const result: any = await action();

      trace(`${step}_completed`, {
        durationMs: Date.now() - startedAt,
        databaseErrorCode: safeCode(result?.error?.code)
      });

      return result;
    } catch (error: any) {
      trace(`${step}_failed`, {
        durationMs: Date.now() - startedAt,
        errorName: getErrorName(error),
        errorCode: getErrorCode(error)
      });

      throw error;
    }
  }

  trace("request_started", {
    method: req.method
  });

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    "";

  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !supabaseServiceKey) {
    trace("supabase_configuration_missing");

    console.error("CHECKOUT: Configuração do Supabase ausente.");

    return res.status(500).json({
      error: "Erro de configuração do servidor."
    });
  }

  const supabaseFetch: typeof fetch = async (input, init = {}) => {
    return fetch(input, {
      ...init,
      signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS)
    });
  };

  const supabase = createClient(
    supabaseUrl,
    supabaseServiceKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        fetch: supabaseFetch
      }
    }
  );

  const storeUrl = (
    process.env.STORE_URL || DEFAULT_STORE_URL
  ).replace(/\/$/, "");

  async function returnRevantPaySession(
    order: { id: string; checkout_request_id: string },
    session: { id: string; url: string }
  ) {
    const { data: currentOrder, error } = await runStep("revantpay_session_recheck", () =>
      supabase
        .from("orders")
        .select("status, preference_id")
        .eq("id", order.id)
        .eq("checkout_request_id", order.checkout_request_id)
        .eq("gateway", "revantpay")
        .maybeSingle()
    ).catch(() => ({ data: null, error: true }));

    if (!error && isTerminalRevantPayOrder(currentOrder?.status)) {
      return terminalRevantPayOrder(res, order.id);
    }

    if (error || currentOrder?.status !== "pending" || currentOrder.preference_id !== session.id) {
      return pendingPayment(res, order.id, "Ainda não foi possível confirmar o link da Revant Pay.");
    }

    return res.status(200).json({
      success: true,
      gateway: "revantpay",
      ...(req.method === "GET" ? { state: "hosted_checkout" } : {}),
      orderId: order.id,
      paymentUrl: session.url
    });
  }

  try {
    // =====================================================
    // 1. GET: CONSULTAR GATEWAY ATIVO
    // =====================================================

    if (req.method === "GET") {
      const requestHeader = req.headers?.["x-checkout-request-id"];
      const statusCheckoutRequestId = Array.isArray(requestHeader)
        ? requestHeader[0]
        : requestHeader;

      if (statusCheckoutRequestId !== undefined) {
        if (!isValidUUID(statusCheckoutRequestId)) {
          return res.status(400).json({
            error: "Identificador da tentativa inválido."
          });
        }

        traceId = checkoutTraceId(statusCheckoutRequestId);
        trace("payment_status_started");

        const { data: order, error: orderError } = await runStep(
          "payment_status_order_lookup",
          () =>
            supabase
              .from("orders")
              .select("id, checkout_request_id, total_amount_cents, status, gateway, gateway_payment_id, preference_id, created_at")
              .eq("checkout_request_id", statusCheckoutRequestId)
              .maybeSingle()
        );

        if (orderError) {
          return res.status(503).json({
            success: false,
            state: "processing"
          });
        }

        if (!order) {
          return res.status(404).json({
            success: false,
            state: "not_found"
          });
        }

        orderId = order.id;

        if (order.gateway === "revantpay") {
          if (!hasRevantPayRecoveryProof(req.headers?.cookie, order, supabaseServiceKey)) {
            return res.status(403).json({
              success: false,
              gateway: "revantpay",
              state: "recovery_required"
            });
          }

          if (isTerminalRevantPayOrder(order.status)) {
            return terminalRevantPayOrder(res, order.id);
          }

          if (order.status !== "pending") {
            return pendingPayment(res, order.id, "Esta tentativa ainda está em processamento.");
          }

          const apiKey = process.env.REVANTPAY_API_KEY?.trim();
          const session = apiKey && typeof order.preference_id === "string" && order.preference_id.trim()
            ? await runStep("payment_status_revantpay_lookup", () =>
                getRevantPayCheckoutSession(order, storeUrl, apiKey, "lookup")
              ).catch(() => null)
            : null;

          if (!session) {
            return pendingPayment(
              res,
              order.id,
              "Ainda não foi possível recuperar o link de pagamento da Revant Pay."
            );
          }

          return returnRevantPaySession(order, session);
        }

        if (order.gateway !== "bravopay") {
          return res.status(409).json({
            success: false,
            state: "unsupported"
          });
        }

        if (!process.env.BRAVOPAY_API_KEY) {
          return res.status(500).json({
            success: false,
            state: "processing"
          });
        }

        try {
          const lookupResponse = await runStep(
            "payment_status_bravo_lookup",
            () =>
              fetch(
                BRAVOPAY_URL +
                  "/transactions?external_reference=" +
                  encodeURIComponent(order.id) +
                  "&limit=100",
                {
                  method: "GET",
                  signal: AbortSignal.timeout(BRAVO_LOOKUP_TIMEOUT_MS),
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.BRAVOPAY_API_KEY}`
                  }
                }
              )
          );

          if (!lookupResponse.ok) {
            trace("payment_status_bravo_http_error", {
              httpStatus: lookupResponse.status
            });

            return returnStoredBravoOrderStatus(res, order);
          }

          const lookupData = await readJson(lookupResponse);
          const transactionResult = getBravoTransactionForOrder(
            lookupData,
            order.id
          );

          if (!transactionResult.transaction) {
            trace("payment_status_bravo_transaction_not_found", {
              responseUsable: transactionResult.confirmedNoMatch
            });

            return returnStoredBravoOrderStatus(res, order);
          }

          const transaction = transactionResult.transaction;
          const transactionStatus = getBravoTransactionStatus(transaction);
          const transactionAmount = Number(transaction.amount_cents);
          const transactionId = String(transaction.id || "");

          if (
            !transactionId ||
            !transactionStatus ||
            !Number.isSafeInteger(transactionAmount) ||
            transactionAmount !== Number(order.total_amount_cents)
          ) {
            trace("payment_status_bravo_transaction_mismatch", {
              idPresent: Boolean(transactionId),
              statusValid: Boolean(transactionStatus),
              amountMatches:
                transactionAmount === Number(order.total_amount_cents)
            });

            return returnStoredBravoOrderStatus(res, order);
          }

          const idSaved = await runStep(
            "payment_status_transaction_save",
            () => saveBravoTransaction(supabase, order.id, transaction)
          );

          if (!idSaved) {
            return pendingPayment(
              res,
              order.id,
              "Encontramos a cobrança, mas ainda não conseguimos sincronizar o pedido. A consulta será repetida sem criar outro PIX."
            );
          }

          const statusSynced = await runStep(
            "payment_status_order_sync",
            () => syncBravoOrderStatus(supabase, order.id, transactionStatus)
          );

          if (!statusSynced) {
            return pendingPayment(
              res,
              order.id,
              "Encontramos a cobrança, mas ainda não conseguimos sincronizar o pedido. A consulta será repetida sem criar outro PIX."
            );
          }

          const copyPaste =
            transactionStatus === "PENDING" &&
            typeof transaction.pix?.copy_paste === "string"
              ? transaction.pix.copy_paste
              : "";

          if (transactionStatus === "PENDING" && !copyPaste) {
            trace("payment_status_pix_data_pending");

            return pendingPayment(
              res,
              order.id,
              "A BravoPay registrou seu pagamento e está preparando os dados do PIX. Vamos consultar esta mesma cobrança novamente."
            );
          }

          return returnBravoPayment(
            res,
            order.id,
            transaction,
            Number(order.total_amount_cents)
          );
        } catch (statusError: any) {
          trace("payment_status_bravo_lookup_failed", {
            errorName: getErrorName(statusError),
            errorCode: getErrorCode(statusError)
          });

          return res.status(202).json({
            success: false,
            pending: true,
            state: "processing",
            orderId: order.id
          });
        }
      }

      traceId = "gateway-config";

      const { data, error } = await runStep(
        "gateway_settings",
        () =>
          supabase
            .from("payment_settings")
            .select("active_gateway")
            .eq("id", 1)
            .single()
      );

      if (error || !data) {
        console.error(
          "CHECKOUT: Erro ao consultar gateway.",
          error?.code || "UNKNOWN"
        );

        return res.status(500).json({
          error: "Não foi possível consultar o meio de pagamento."
        });
      }

      if (
        !GATEWAYS.includes(data.active_gateway)
      ) {
        return res.status(500).json({
          error: "Gateway de pagamento inválido."
        });
      }

      let gateway = data.active_gateway;
      const gatewayRequestId = req.headers?.["x-checkout-gateway-request-id"];
      if (isValidUUID(gatewayRequestId)) {
        const { data: savedOrder } = await supabase
          .from("orders")
          .select("gateway")
          .eq("checkout_request_id", gatewayRequestId)
          .maybeSingle();
        if (
          savedOrder && GATEWAYS.includes(savedOrder.gateway) &&
          (gateway === "revantpay" || savedOrder.gateway === "revantpay")
        ) {
          gateway = savedOrder.gateway;
        }
      }

      trace("request_completed", { gateway });

      return res.status(200).json({
        success: true,
        gateway
      });
    }

    // =====================================================
    // 2. VALIDAR DADOS RECEBIDOS
    // =====================================================

    const {
      customer,
      address: rawAddress,
      items,
      checkoutRequestId
    } = req.body || {};

    if (!isValidUUID(checkoutRequestId)) {
      return res.status(400).json({
        error: "Identificador da tentativa de checkout inválido."
      });
    }

    traceId = checkoutTraceId(checkoutRequestId);

    trace("request_validating");

    if (
      !customer ||
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 50
    ) {
      return res.status(400).json({
        error: "Dados do pedido incompletos ou inválidos."
      });
    }

    const customerName = String(customer.name || "").trim();

    const customerEmail = String(customer.email || "")
      .trim()
      .toLowerCase();

    const customerPhone = normalizeDigits(customer.phone);
    const customerCPF = normalizeDigits(customer.cpf);

    if (customerName.length < 3 || customerName.length > 150) {
      return res.status(400).json({
        error: "Informe seu nome completo."
      });
    }

    if (
      customerEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
    ) {
      return res.status(400).json({
        error: "Informe um e-mail válido."
      });
    }

    const checkoutAddress = validateCheckoutAddress(rawAddress);

    if (!checkoutAddress) {
      return res.status(400).json({
        error: "Preencha corretamente todos os campos obrigatórios do endereço de entrega. Confira também a sigla da UF."
      });
    }

    // =====================================================
    // 3. CONSULTAR CONFIGURAÇÃO, VARIANTES E VÍNCULO DO PEDIDO
    // =====================================================

    const quantities = new Map<string, number>();

    for (const item of items as CheckoutItem[]) {
      const variantId = String(item?.variantId || "").trim();
      const quantity = Number(item?.quantity);

      if (
        !variantId ||
        !isValidUUID(variantId) ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 10
      ) {
        return res.status(400).json({
          error: "Um ou mais itens do carrinho são inválidos."
        });
      }

      const accumulated =
        (quantities.get(variantId) || 0) + quantity;

      if (accumulated > 10) {
        return res.status(400).json({
          error: "A quantidade máxima por variante é 10."
        });
      }

      quantities.set(variantId, accumulated);
    }

    const variantIds = Array.from(quantities.keys());

    const [
      { data: paymentSettings, error: settingsError },
      { data: variants, error: variantsError },
      { data: savedOrder }
    ] = await Promise.all([
      runStep("payment_settings", () =>
        supabase
          .from("payment_settings")
          .select("active_gateway")
          .eq("id", 1)
          .single()
      ),
      runStep("product_variants", () =>
        supabase
          .from("product_variants")
          .select(`
            id,
            price_cents,
            products(name),
            color,
            storage_gb,
            availability_status,
            is_active
          `)
          .in("id", variantIds)
      ),
      runStep("checkout_gateway_lookup", () => findCheckoutOrder(supabase, checkoutRequestId))
    ]);

    if (settingsError || !paymentSettings) {
      console.error(
        "CHECKOUT: Erro ao consultar payment_settings.",
        settingsError?.code || "UNKNOWN"
      );

      return res.status(500).json({
        error: "Não foi possível identificar o meio de pagamento."
      });
    }

    const configuredGateway =
      paymentSettings.active_gateway as Gateway;

    if (!GATEWAYS.includes(configuredGateway)) {
      return res.status(500).json({
        error: "Gateway de pagamento inválido."
      });
    }

    const matchesCustomer = (order: {
      customer_email: string;
      customer_name: string;
      customer_phone: string | null;
    }) => order.customer_email === customerEmail && order.customer_name === customerName &&
      (order.customer_phone || "") === (customerPhone || "");

    if (
      savedOrder?.gateway === "revantpay" && isTerminalRevantPayOrder(savedOrder.status) &&
      (matchesCustomer(savedOrder) || hasRevantPayRecoveryProof(req.headers?.cookie, savedOrder, supabaseServiceKey))
    ) {
      return terminalRevantPayOrder(res, savedOrder.id);
    }

    // Preserve the prechecks of the original gateway on a Revant Pay transition.
    const validationGateway =
      savedOrder && GATEWAYS.includes(savedOrder.gateway) &&
      (configuredGateway === "revantpay" || savedOrder.gateway === "revantpay")
        ? savedOrder.gateway
        : configuredGateway;

    if (validationGateway === "bravopay") {
      if (customerPhone.length < 10 || customerPhone.length > 13) {
        return res.status(400).json({
          error: "Informe um telefone válido com DDD."
        });
      }

      if (!isValidCPF(customerCPF)) {
        return res.status(400).json({
          error: "Informe um CPF válido."
        });
      }

      if (!process.env.BRAVOPAY_API_KEY) {
        console.error("CHECKOUT: BRAVOPAY_API_KEY ausente.");

        return res.status(500).json({
          error: "A configuração da BravoPay está incompleta."
        });
      }
    }

    if (
      validationGateway === "mercadopago" &&
      !process.env.MP_ACCESS_TOKEN
    ) {
      console.error("CHECKOUT: MP_ACCESS_TOKEN ausente.");

      return res.status(500).json({
        error: "A configuração do Mercado Pago está incompleta."
      });
    }

    trace("gateway_selected", {
      gateway: configuredGateway
    });

    if (variantsError || !variants) {
      console.error(
        "CHECKOUT: Erro ao consultar variantes.",
        variantsError?.code || "UNKNOWN"
      );

      return res.status(500).json({
        error: "Não foi possível validar os produtos do pedido."
      });
    }

    const variantsMap = new Map(
      variants.map((variant: any) => [
        variant.id,
        variant
      ])
    );

    const validatedItems: ValidatedItem[] = [];
    let totalCents = 0;

    for (const [variantId, quantity] of quantities.entries()) {
      const variant: any = variantsMap.get(variantId);

      if (!variant) {
        return res.status(400).json({
          error: "Um produto do carrinho não está disponível."
        });
      }

      if (
        variant.is_active !== true ||
        !["available", "preorder"].includes(
          variant.availability_status
        )
      ) {
        return res.status(400).json({
          error: "Um produto do carrinho está indisponível."
        });
      }

      const priceCents = Number(variant.price_cents);

      if (
        !Number.isSafeInteger(priceCents) ||
        priceCents <= 0
      ) {
        return res.status(400).json({
          error: "O preço de um produto está inválido."
        });
      }

      const subtotal = priceCents * quantity;

      if (!Number.isSafeInteger(subtotal)) {
        return res.status(400).json({
          error: "O subtotal de um produto é inválido."
        });
      }

      totalCents += subtotal;

      if (!Number.isSafeInteger(totalCents)) {
        return res.status(400).json({
          error: "O valor total do pedido é inválido."
        });
      }

      const productName = getProductName(variant.products);

      const storage = variant.storage_gb
        ? `${variant.storage_gb}GB`
        : "128GB";

      validatedItems.push({
        variantId,
        quantity,
        priceCents,
        title: `${productName} - ${variant.color || "Padrão"} (${storage})`
      });
    }

    trace("products_validated", {
      itemCount: validatedItems.length,
      totalCents
    });

    if (validationGateway === "revantpay" && !process.env.REVANTPAY_API_KEY?.trim()) {
      return res.status(503).json({
        error: "A configuração da Revant Pay está incompleta."
      });
    }

    if (validationGateway === "bravopay" && totalCents < 500) {
      return res.status(400).json({
        error: "O valor mínimo para gerar um PIX é R$ 5,00."
      });
    }

    // =====================================================
    // 4. CRIAR OU RECUPERAR PEDIDO
    // =====================================================

    let order: any = null;
    let newlyCreated = false;

    const recoverKnownOrder = savedOrder &&
      (configuredGateway === "revantpay" || savedOrder.gateway === "revantpay");
    const isNewRevantAttempt = configuredGateway === "revantpay" && !savedOrder;
    const orderData = {
      checkout_request_id: checkoutRequestId,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone || null,
      total_amount_cents: totalCents,
      status: "pending",
      gateway: configuredGateway
    };

    const { data: insertedOrder, error: orderInsertError } = recoverKnownOrder
      ? { data: null, error: null }
      : await runStep("order_insert", () => {
          const orders = supabase.from("orders");
          return isNewRevantAttempt
            ? orders.upsert(orderData, { onConflict: "checkout_request_id", ignoreDuplicates: true })
                .select().maybeSingle()
            : orders.insert([orderData]).select().single();
        });

    if (!orderInsertError && insertedOrder) {
      order = insertedOrder;
      newlyCreated = true;

      trace("order_created");
    } else if (recoverKnownOrder || (isNewRevantAttempt && !orderInsertError) || orderInsertError?.code === "23505") {
      const {
        data: existingOrder,
        error: existingOrderError
      } = await runStep(
        "order_recovery",
        () =>
          supabase
            .from("orders")
            .select("*")
            .eq("checkout_request_id", checkoutRequestId)
            .maybeSingle()
      );

      if (existingOrderError || !existingOrder) {
        console.error(
          "CHECKOUT: Erro ao recuperar pedido existente.",
          existingOrderError?.code || "NOT_FOUND"
        );

        return res.status(500).json({
          error: "Não foi possível recuperar sua tentativa de pagamento."
        });
      }

      order = existingOrder;

      trace("order_recovered");
    } else {
      console.error(
        "CHECKOUT: Erro ao registrar pedido.",
        orderInsertError?.code || "UNKNOWN"
      );

      return res.status(500).json({
        error: "Não foi possível registrar seu pedido."
      });
    }

    orderId = order.id;

    // =====================================================
    // 5. VALIDAR PROPRIEDADE DA TENTATIVA
    // =====================================================

    const orderGateway = order.gateway as Gateway;

    if (
      !GATEWAYS.includes(orderGateway) ||
      !matchesCustomer(order) ||
      Number(order.total_amount_cents) !== totalCents
    ) {
      trace("order_validation_failed");

      return res.status(409).json({
        error: "Esta tentativa continua vinculada a um pedido anterior. Use os mesmos dados e itens para recuperar a cobrança; não inicie outra compra enquanto o resultado estiver em verificação."
      });
    }

    if (orderGateway === "revantpay" && order.status !== "pending") {
      return isTerminalRevantPayOrder(order.status)
        ? terminalRevantPayOrder(res, order.id)
        : pendingPayment(res, order.id, "Esta tentativa ainda está em processamento.");
    }

    if (
      ["failed", "refunded", "chargeback"].includes(
        String(order.status).toLowerCase()
      )
    ) {
      return res.status(409).json({
        terminal: true,
        orderId: order.id,
        error: "Esta tentativa foi encerrada e não pode ser reutilizada. Você pode iniciar uma nova compra."
      });
    }

    if (orderGateway === "bravopay") {
      if (
        customerPhone.length < 10 ||
        customerPhone.length > 13
      ) {
        return res.status(400).json({
          error: "Informe um telefone válido com DDD."
        });
      }

      if (!isValidCPF(customerCPF)) {
        return res.status(400).json({
          error: "Informe um CPF válido."
        });
      }

      if (!process.env.BRAVOPAY_API_KEY) {
        return res.status(500).json({
          error: "A configuração da BravoPay está incompleta."
        });
      }
    }

    if (
      orderGateway === "mercadopago" &&
      !process.env.MP_ACCESS_TOKEN
    ) {
      return res.status(500).json({
        error: "A configuração do Mercado Pago está incompleta."
      });
    }

    // =====================================================
    // 6. REGISTRAR ITENS DO PEDIDO
    // =====================================================

    const itemsReady = await runStep(
      "order_items",
      () =>
        ensureOrderItems(
          supabase,
          order.id,
          validatedItems,
          newlyCreated
        )
    );

    if (!itemsReady) {
      return res.status(500).json({
        error: "Não foi possível confirmar os produtos do pedido."
      });
    }

    trace("order_items_ready");

    // =====================================================
    // 7. REGISTRAR E VALIDAR ENDEREÇO DE ENTREGA
    // =====================================================

    const addressResult = await runStep(
      "order_address",
      () =>
        ensureOrderAddress(
          supabase,
          order.id,
          checkoutAddress
        )
    );

    if (addressResult === "conflict") {
      trace("order_address_conflict");

      return res.status(409).json({
        error: "Esta tentativa já está vinculada a outro endereço de entrega. Para preservar os dados do pedido, não é possível alterar o endereço nesta tentativa."
      });
    }

    if (addressResult !== "saved") {
      trace("order_address_save_failed");

      return res.status(500).json({
        error: "Não foi possível salvar o endereço de entrega. Nenhuma cobrança foi iniciada. Tente novamente."
      });
    }

    trace("order_address_ready");

    // =====================================================
    // 8. MODO DE TESTE DA PERSISTÊNCIA DO ENDEREÇO
    // =====================================================

    const isProductionEnvironment =
      process.env.VERCEL_ENV === "production" ||
      process.env.NODE_ENV === "production";

    const addressOnlyTestMode =
      process.env.CHECKOUT_ADDRESS_TEST_MODE === "true" &&
      !isProductionEnvironment;

    if (addressOnlyTestMode) {
      trace("address_test_mode_completed", {
        gateway: orderGateway,
        addressSaved: true,
        gatewayCalled: false
      });

      return res.status(200).json({
        success: true,
        testMode: true,
        addressSaved: true,
        gatewayCalled: false,
        orderId: order.id,
        message: "Endereço validado e salvo. Nenhuma cobrança foi iniciada."
      });
    }

    if (orderGateway === "revantpay") {
      const apiKey = process.env.REVANTPAY_API_KEY?.trim();
      if (!apiKey) {
        return res.status(503).json({
          error: "A configuração da Revant Pay está incompleta."
        });
      }

      res.setHeader("Set-Cookie", createRevantPayRecoveryCookie(order, supabaseServiceKey));

      const pendingMessage =
        "Não foi possível recuperar o link da Revant Pay. A tentativa deste pedido foi preservada.";
      const session = await runStep(
        order.preference_id != null ? "revantpay_session_lookup" : "revantpay_session_create",
        () => getRevantPayCheckoutSession(order, storeUrl, apiKey)
      ).catch(() => null);
      if (!session) return pendingPayment(res, order.id, pendingMessage);

      if (order.preference_id == null) {
        const { data: savedSession, error: saveError } = await runStep(
          "revantpay_session_save",
          () => supabase
            .from("orders")
            .update({ preference_id: session.id })
            .eq("id", order.id)
            .eq("gateway", "revantpay")
            .eq("status", "pending")
            .is("preference_id", null)
            .select("id")
            .maybeSingle()
        );

        if (saveError || !savedSession) {
          return pendingPayment(res, order.id, pendingMessage);
        }
      }

      return returnRevantPaySession(order, session);
    }

    // =====================================================
    // 9. MERCADO PAGO
    // =====================================================

    if (orderGateway === "mercadopago") {
      if (order.preference_id) {
        const preferenceResponse = await runStep(
          "mp_preference_lookup",
          () =>
            fetch(
              `https://api.mercadopago.com/checkout/preferences/${encodeURIComponent(
                order.preference_id
              )}`,
              {
                method: "GET",
                signal: AbortSignal.timeout(MP_TIMEOUT_MS),
                headers: {
                  Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
                }
              }
            )
        );

        const preferenceData = await readJson(
          preferenceResponse
        );

        if (
          preferenceResponse.ok &&
          preferenceData?.init_point
        ) {
          trace("request_completed", {
            gateway: "mercadopago",
            recovered: true
          });

          return res.status(200).json({
            success: true,
            gateway: "mercadopago",
            orderId: order.id,
            paymentUrl: preferenceData.init_point
          });
        }

        console.error(
          "CHECKOUT: Falha ao recuperar preferência existente.",
          preferenceResponse.status
        );

        return pendingPayment(
          res,
          order.id,
          "Estamos verificando seu pagamento anterior. Tente novamente em instantes."
        );
      }

      const mpResponse = await runStep(
        "mp_preference_create",
        () =>
          fetch(
            "https://api.mercadopago.com/checkout/preferences",
            {
              method: "POST",
              signal: AbortSignal.timeout(MP_TIMEOUT_MS),
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
              },
              body: JSON.stringify({
                items: validatedItems.map((item) => ({
                  title: item.title,
                  quantity: item.quantity,
                  unit_price: item.priceCents / 100,
                  currency_id: "BRL"
                })),
                external_reference: order.id,
                back_urls: {
                  success: `${storeUrl}/checkout/sucesso`,
                  failure: `${storeUrl}/checkout/falha`
                },
                auto_return: "approved"
              })
            }
          )
      );

      const mpData = await readJson(mpResponse);

      if (
        !mpResponse.ok ||
        !mpData?.id ||
        !mpData?.init_point
      ) {
        console.error(
          "CHECKOUT: Resposta Mercado Pago inválida.",
          {
            httpStatus: mpResponse.status
          }
        );

        if (
          mpResponse.status >= 400 &&
          mpResponse.status < 500 &&
          ![408, 409, 429].includes(mpResponse.status)
        ) {
          await markOrderFailed(supabase, order.id);
        }

        return pendingPayment(
          res,
          order.id,
          "Não foi possível confirmar a criação do pagamento. Tente novamente."
        );
      }

      const { error: preferenceError } = await runStep(
        "mp_preference_save",
        () =>
          supabase
            .from("orders")
            .update({
              preference_id: String(mpData.id)
            })
            .eq("id", order.id)
      );

      if (preferenceError) {
        console.error(
          "CHECKOUT: Erro ao salvar preferência.",
          preferenceError.code || "UNKNOWN"
        );

        return pendingPayment(
          res,
          order.id,
          "O pagamento está em verificação. Tente novamente em instantes."
        );
      }

      trace("request_completed", {
        gateway: "mercadopago",
        recovered: false
      });

      return res.status(200).json({
        success: true,
        gateway: "mercadopago",
        orderId: order.id,
        paymentUrl: mpData.init_point
      });
    }

    // =====================================================
    // 10. BRAVOPAY — CONFIGURAÇÃO
    // =====================================================

    const bravoHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.BRAVOPAY_API_KEY}`
    };

    let existingTransaction: any = null;
    let lookupConfirmedNoTransaction = false;
    let bravoLookupHttpStatus: number | null = null;

    async function lookupBravoOrder(orderReference: string) {
      trace("bravo_lookup_started");

      const lookupResponse = await runStep(
        "bravo_lookup",
        () =>
          fetch(
            BRAVOPAY_URL +
              "/transactions?external_reference=" +
              encodeURIComponent(orderReference) +
              "&limit=100",
            {
              method: "GET",
              signal: AbortSignal.timeout(BRAVO_LOOKUP_TIMEOUT_MS),
              headers: bravoHeaders
            }
          )
      );

      bravoLookupHttpStatus = lookupResponse.status;

      if (!lookupResponse.ok) {
        trace("bravo_lookup_http_error", {
          httpStatus: lookupResponse.status
        });

        return { transaction: null, confirmedNoTransaction: false };
      }

      const lookupData = await readJson(lookupResponse);
      const lookupResult = getBravoTransactionForOrder(
        lookupData,
        orderReference
      );

      trace("bravo_lookup_result", {
        httpStatus: lookupResponse.status,
        transactionFound: Boolean(lookupResult.transaction),
        confirmedNoTransaction: lookupResult.confirmedNoMatch,
        responseUsable:
          Boolean(lookupResult.transaction) || lookupResult.confirmedNoMatch
      });

      return {
        transaction: lookupResult.transaction,
        confirmedNoTransaction: lookupResult.confirmedNoMatch
      };
    }

    async function persistAndReturnBravoTransaction(
      transaction: any,
      recovered: boolean
    ) {
      const transactionId = String(transaction?.id || "");
      const transactionAmount = Number(transaction?.amount_cents);
      const transactionStatus = getBravoTransactionStatus(transaction);
      const hasCopyPaste =
        typeof transaction?.pix?.copy_paste === "string" &&
        transaction.pix.copy_paste.length > 0;

      if (
        !transactionId ||
        transactionAmount !== totalCents ||
        !transactionStatus
      ) {
        trace("bravo_transaction_validation_failed", {
          amountMatches: transactionAmount === totalCents,
          transactionIdPresent: Boolean(transactionId),
          statusValid: Boolean(transactionStatus),
          pixCodePresent: hasCopyPaste
        });

        return pendingPayment(
          res,
          order.id,
          "Encontramos uma transação vinculada a este pedido, mas ainda não foi possível validar seus dados. Não gere outro PIX; tente recuperar esta tentativa novamente."
        );
      }

      const saved = await runStep(
        recovered ? "bravo_transaction_recovery_save" : "bravo_transaction_save",
        () => saveBravoTransaction(supabase, order.id, transaction)
      );

      if (!saved) {
        return pendingPayment(
          res,
          order.id,
          "Encontramos sua cobrança, mas ainda não foi possível sincronizar o pedido. Não gere outro PIX; tente recuperar esta tentativa novamente."
        );
      }

      const statusSynced = await runStep(
        "bravo_order_status_sync",
        () => syncBravoOrderStatus(supabase, order.id, transactionStatus)
      );

      if (!statusSynced) {
        return pendingPayment(
          res,
          order.id,
          "Encontramos sua cobrança, mas ainda não foi possível sincronizar o pedido. Não gere outro PIX; tente novamente em instantes."
        );
      }

      if (transactionStatus === "PENDING" && !hasCopyPaste) {
        trace("bravo_pix_data_pending", { recovered });

        return pendingPayment(
          res,
          order.id,
          "A BravoPay registrou seu pagamento e está preparando os dados do PIX. Vamos consultar esta mesma cobrança automaticamente."
        );
      }

      trace("request_completed", {
        gateway: "bravopay",
        recovered
      });

      return returnBravoPayment(res, order.id, transaction, totalCents);
    }

    if (!newlyCreated) {
      try {
        const lookup = await lookupBravoOrder(order.id);
        existingTransaction = lookup.transaction;
        lookupConfirmedNoTransaction = lookup.confirmedNoTransaction;
      } catch (lookupError: any) {
        trace("bravo_lookup_failed", {
          errorName: getErrorName(lookupError),
          errorCode: getErrorCode(lookupError)
        });

        console.error(
          "CHECKOUT: Consulta BravoPay inconclusiva.",
          getErrorName(lookupError),
          getErrorCode(lookupError) || ""
        );
      }
    }

    // =====================================================
    // 11. RETORNAR PIX RECUPERADO
    // =====================================================

    if (existingTransaction) {
      const transactionStatus =
        getBravoTransactionStatus(existingTransaction);

      const hasCopyPaste =
        typeof existingTransaction?.pix?.copy_paste === "string" &&
        existingTransaction.pix.copy_paste.length > 0;

      if (
        !existingTransaction.id ||
        Number(existingTransaction.amount_cents) !== totalCents ||
        !transactionStatus
      ) {
        trace("bravo_lookup_transaction_mismatch", {
          httpStatus: bravoLookupHttpStatus,
          amountMatches:
            Number(existingTransaction.amount_cents) === totalCents,
          transactionIdPresent: Boolean(existingTransaction.id),
          statusValid: Boolean(transactionStatus),
          pixCodePresent: hasCopyPaste
        });

        return pendingPayment(
          res,
          order.id,
          "Encontramos uma transação vinculada a este pedido, mas a resposta está incompleta. Não gere outro PIX; tente recuperar esta tentativa novamente."
        );
      }

      if (
        CHECKOUT_FUNCTION_TIMEOUT_MS - (Date.now() - requestStartedAt) <
        SUPABASE_TIMEOUT_MS * 2 + FINALIZATION_RESERVE_MS
      ) {
        trace("bravo_recovery_save_skipped_deadline", {
          remainingMs:
            CHECKOUT_FUNCTION_TIMEOUT_MS -
            (Date.now() - requestStartedAt)
        });

        return pendingPayment(
          res,
          order.id,
          "Encontramos sua cobrança e ela permanece preservada. Tente recuperar o PIX novamente em instantes."
        );
      }

      return persistAndReturnBravoTransaction(existingTransaction, true);
    }

    if (!newlyCreated && !lookupConfirmedNoTransaction) {
      trace("bravo_creation_blocked_unconfirmed_lookup");

      return pendingPayment(
        res,
        order.id,
        "Não foi possível confirmar se já existe uma cobrança para este pedido. Não gere outro PIX; tente recuperar esta tentativa novamente em instantes."
      );
    }

    if (!newlyCreated) {
      const orderCreatedAt = Date.parse(String(order.created_at || ""));
      const orderAgeMs = Date.now() - orderCreatedAt;

      if (
        !Number.isFinite(orderCreatedAt) ||
        orderAgeMs >= BRAVO_IDEMPOTENCY_TTL_MS
      ) {
        trace("bravo_creation_blocked_idempotency_window_expired", {
          orderAgeMs: Number.isFinite(orderAgeMs) ? orderAgeMs : null
        });

        return pendingPayment(
          res,
          order.id,
          "Não foi possível confirmar uma transação e a janela de idempotência expirou. O pedido foi preservado para verificação; não gere outra cobrança."
        );
      }
    }

    // =====================================================
    // 12. CRIAR PIX NA BRAVOPAY
    // =====================================================

    const remainingMsBeforeCreate =
      CHECKOUT_FUNCTION_TIMEOUT_MS -
      (Date.now() - requestStartedAt);

    const requiredMsForCreate =
      BRAVO_CREATE_TIMEOUT_MS +
      BRAVO_LOOKUP_TIMEOUT_MS +
      SUPABASE_TIMEOUT_MS * 2 +
      FINALIZATION_RESERVE_MS;

    if (remainingMsBeforeCreate < requiredMsForCreate) {
      trace("bravo_create_skipped_deadline", {
        remainingMs: remainingMsBeforeCreate,
        requiredMs: requiredMsForCreate
      });

      return pendingPayment(
        res,
        order.id,
        "Sua tentativa está preservada e o resultado segue em verificação. Tente recuperar este mesmo pedido em instantes; não inicie outra compra."
      );
    }

    trace("bravo_create_started", {
      timeoutMs: BRAVO_CREATE_TIMEOUT_MS
    });

    let bravoResponse: Response;

    try {
      bravoResponse = await runStep(
        "bravo_create",
        () =>
          fetch(
            `${BRAVOPAY_URL}/transactions`,
            {
              method: "POST",
              signal: AbortSignal.timeout(
                BRAVO_CREATE_TIMEOUT_MS
              ),
              headers: {
                ...bravoHeaders,
                "Idempotency-Key": checkoutRequestId
              },
              body: JSON.stringify({
                amount_cents: totalCents,
                method: "pix",
                customer: {
                  name: customerName,
                  email: customerEmail,
                  phone: customerPhone,
                  cpf: customerCPF
                },
                external_reference: order.id
              })
            }
          )
      );
    } catch (bravoError: any) {
      trace("bravo_create_failed", {
        errorName: getErrorName(bravoError),
        errorCode: getErrorCode(bravoError),
        timeoutMs: BRAVO_CREATE_TIMEOUT_MS
      });

      console.error(
        "CHECKOUT: Comunicação com BravoPay inconclusiva.",
        getErrorName(bravoError),
        getErrorCode(bravoError) || ""
      );

      try {
        const lookup = await lookupBravoOrder(order.id);

        if (lookup.transaction) {
          return await persistAndReturnBravoTransaction(
            lookup.transaction,
            true
          );
        }

        trace("bravo_timeout_recovery_no_transaction", {
          confirmedNoTransaction: lookup.confirmedNoTransaction
        });
      } catch (recoveryError: any) {
        trace("bravo_timeout_recovery_failed", {
          errorName: getErrorName(recoveryError),
          errorCode: getErrorCode(recoveryError)
        });
      }

      return pendingPayment(
        res,
        order.id,
        "A cobrança está em verificação. Tente recuperar seu PIX em instantes."
      );
    }

    trace("bravo_create_http_response", {
      httpStatus: bravoResponse.status
    });

    const bravoData = await readJson(bravoResponse);

    const returnedAmount = Number(bravoData?.amount_cents);

    const createdTransactionStatus =
      getBravoTransactionStatus(bravoData);

    const hasCreatedPixCode =
      typeof bravoData?.pix?.copy_paste === "string" &&
      bravoData.pix.copy_paste.length > 0;

    const validBravoResponse =
      bravoResponse.ok &&
      String(bravoData?.id || "").length > 0 &&
      Boolean(createdTransactionStatus) &&
      Number.isSafeInteger(returnedAmount) &&
      returnedAmount === totalCents;

    if (!validBravoResponse) {
      const responseCode = getGatewayErrorCode(bravoData);

      trace("bravo_create_invalid_response", {
        httpStatus: bravoResponse.status,
        responseCode
      });

      console.error(
        "CHECKOUT: Resposta BravoPay não confirmada.",
        {
          httpStatus: bravoResponse.status,
          responseCode
        }
      );

      try {
        const lookup = await lookupBravoOrder(order.id);

        if (lookup.transaction) {
          return await persistAndReturnBravoTransaction(
            lookup.transaction,
            true
          );
        }
      } catch (recoveryError: any) {
        trace("bravo_invalid_response_recovery_failed", {
          errorName: getErrorName(recoveryError),
          errorCode: getErrorCode(recoveryError)
        });
      }

      return pendingPayment(
        res,
        order.id,
        "Não foi possível confirmar a cobrança. Sua compra permanece em verificação."
      );
    }

    // =====================================================
    // 13. SALVAR ID DA TRANSAÇÃO
    // =====================================================

    const remainingMsBeforeSave =
      CHECKOUT_FUNCTION_TIMEOUT_MS -
      (Date.now() - requestStartedAt);

    if (
      remainingMsBeforeSave <
      SUPABASE_TIMEOUT_MS * 2 + FINALIZATION_RESERVE_MS
    ) {
      trace("bravo_transaction_save_skipped_deadline", {
        remainingMs: remainingMsBeforeSave
      });

      return pendingPayment(
        res,
        order.id,
        "A cobrança foi criada e permanece preservada. Tente recuperar o PIX novamente em instantes."
      );
    }

    trace("bravo_pix_response", {
      hasCopyPaste: hasCreatedPixCode,
      status: createdTransactionStatus,
      httpStatus: bravoResponse.status
    });

    return persistAndReturnBravoTransaction(bravoData, false);

  } catch (error: any) {
    trace("request_failed", {
      errorName: getErrorName(error),
      errorCode: getErrorCode(error)
    });

    console.error(
      "CHECKOUT: Erro inesperado.",
      getErrorName(error),
      getErrorCode(error) || ""
    );

    if (
      error?.name === "TimeoutError" ||
      error?.name === "AbortError"
    ) {
      return res.status(202).json({
        success: false,
        pending: true,
        orderId,
        error: "Sua compra permanece em verificação. Tente recuperar o PIX em instantes."
      });
    }

    return res.status(500).json({
      success: false,
      pending: true,
      orderId,
      error: "Ocorreu um erro ao processar o pedido. Tente novamente em instantes."
    });
  }
}
