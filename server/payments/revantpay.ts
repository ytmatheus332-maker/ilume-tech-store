import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const CHECKOUT_SESSIONS_URL = "https://api.revantpay.com/v1/checkout-sessions";
const REQUEST_TIMEOUT_MS = 7_000;
// Keep retries inside the provider's documented 24-hour window.
const CREATE_WINDOW_MS = 23 * 60 * 60 * 1000;
const RECOVERY_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const TERMINAL_ORDER_STATUSES = new Set([
  "approved", "paid", "shipped", "delivered", "failed", "rejected",
  "cancelled", "canceled", "expired", "refunded", "chargeback"
]);

export interface RevantPayOrder {
  id: string;
  checkout_request_id: string;
  created_at: string;
  total_amount_cents: number;
  preference_id?: string | null;
}

type RecoveryOrder = Pick<RevantPayOrder, "id" | "checkout_request_id">;

export function isTerminalRevantPayOrder(status: unknown): boolean {
  return typeof status === "string" && TERMINAL_ORDER_STATUSES.has(status.toLowerCase());
}

function recoveryCookieName(requestId: string): string {
  const fingerprint = createHash("sha256").update(requestId).digest("hex").slice(0, 24);
  return `__Secure-ilume-revant-${fingerprint}`;
}

function signRecovery(order: RecoveryOrder, expires: number, secret: string): string {
  return createHmac("sha256", secret)
    .update(JSON.stringify(["ilume-revantpay-recovery-v1", order.id, order.checkout_request_id, expires]))
    .digest("hex");
}

export function createRevantPayRecoveryCookie(order: RecoveryOrder, secret: string): string {
  const expires = Math.floor(Date.now() / 1000) + RECOVERY_MAX_AGE_SECONDS;
  const value = `${expires}.${signRecovery(order, expires, secret)}`;
  return `${recoveryCookieName(order.checkout_request_id)}=${value}; Max-Age=${RECOVERY_MAX_AGE_SECONDS}; Path=/api/create-checkout; HttpOnly; Secure; SameSite=Strict`;
}

export function hasRevantPayRecoveryProof(cookie: unknown, order: RecoveryOrder, secret: string): boolean {
  if (typeof cookie !== "string") return false;

  const name = `${recoveryCookieName(order.checkout_request_id)}=`;
  const value = cookie.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(name))?.slice(name.length);
  const match = value?.match(/^(\d{1,12})\.([0-9a-f]{64})$/);
  if (!match) return false;

  const expires = Number(match[1]);
  if (expires <= Math.floor(Date.now() / 1000)) return false;

  return timingSafeEqual(
    Buffer.from(match[2], "hex"),
    Buffer.from(signRecovery(order, expires, secret), "hex")
  );
}

function isSessionId(value: unknown): value is string {
  return typeof value === "string" && !!value && value.trim() === value && value !== "." && value !== "..";
}

export async function getRevantPayCheckoutSession(
  order: RevantPayOrder,
  storeUrl: string,
  apiKey: string,
  mode: "lookup" | "create-or-lookup" = "create-or-lookup"
): Promise<{ id: string; url: string } | null> {
  const storedSessionId = order.preference_id;
  const headers: Record<string, string> = { "x-api-key": apiKey };
  const request: RequestInit = {
    method: "GET",
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  };
  let url = CHECKOUT_SESSIONS_URL;

  if (storedSessionId != null || mode === "lookup") {
    if (!isSessionId(storedSessionId)) return null;
    url += `/${encodeURIComponent(storedSessionId)}`;
  } else {
    const age = Date.now() - Date.parse(order.created_at);
    if (!Number.isFinite(age) || age < -60_000 || age >= CREATE_WINDOW_MS) {
      return null;
    }

    headers["Content-Type"] = "application/json";
    headers["Idempotency-Key"] = order.checkout_request_id;
    request.method = "POST";
    request.body = JSON.stringify({
      amount: order.total_amount_cents / 100,
      description: `Pedido ${order.id} da ILUME Tech Store`,
      product_name: "Pedido ILUME Tech Store",
      external_id: order.id,
      success_url: `${storeUrl}/checkout?revantpay=retorno`,
      cancel_url: `${storeUrl}/checkout?revantpay=cancelado`
    });
  }

  const response = await fetch(url, request);
  if (!response.ok) return null;

  const data = await response.json();
  if (
    !isSessionId(data?.session_id) ||
    (storedSessionId != null && data.session_id !== storedSessionId) ||
    data.external_id !== order.id ||
    typeof data.checkout_url !== "string"
  ) {
    return null;
  }

  const checkoutUrl = new URL(data.checkout_url);
  const isRevantPayHost = checkoutUrl.hostname === "revantpay.com" ||
    checkoutUrl.hostname.endsWith(".revantpay.com");
  if (
    checkoutUrl.protocol !== "https:" ||
    !isRevantPayHost ||
    checkoutUrl.port ||
    checkoutUrl.username ||
    checkoutUrl.password
  ) {
    return null;
  }

  return { id: data.session_id, url: checkoutUrl.href };
}
