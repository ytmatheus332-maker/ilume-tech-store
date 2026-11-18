export const CHECKOUT_REQUEST_KEY = "ilume_checkout_request_id";

const CHECKOUT_ATTEMPT_LOCK = "ilume-checkout-request-id";

type CheckoutLocks = Pick<LockManager, "request"> | undefined;

export function isCheckoutRequestId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function reserveRevantCheckoutAttempt(
  storage: Pick<Storage, "getItem" | "setItem">,
  locks: CheckoutLocks,
  readLegacyId: () => string | null,
  createId = () => crypto.randomUUID()
): Promise<string> {
  if (!locks) {
    const existing = storage.getItem(CHECKOUT_REQUEST_KEY);
    if (isCheckoutRequestId(existing)) return existing;
    throw new Error("Use um navegador com suporte a checkout entre abas para iniciar o pagamento com a Revant Pay.");
  }

  return locks.request(CHECKOUT_ATTEMPT_LOCK, () => {
    const existing = storage.getItem(CHECKOUT_REQUEST_KEY);
    if (isCheckoutRequestId(existing)) return existing;

    const requestId = readLegacyId() ?? createId();
    storage.setItem(CHECKOUT_REQUEST_KEY, requestId);
    return requestId;
  });
}

export async function releaseRevantCheckoutAttempt(
  storage: Pick<Storage, "getItem" | "removeItem">,
  locks: CheckoutLocks,
  requestId: string
): Promise<void> {
  const release = () => {
    if (storage.getItem(CHECKOUT_REQUEST_KEY) === requestId) {
      storage.removeItem(CHECKOUT_REQUEST_KEY);
    }
  };
  if (locks) await locks.request(CHECKOUT_ATTEMPT_LOCK, release);
  else release();
}
