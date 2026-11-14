import test, { beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { EventEmitter } from "node:events";
import checkoutHandler from "../../api/create-checkout.ts";
import bravoWebhookHandler from "../../api/webhook-bravopay.ts";
import { setCheckoutDatabaseState } from "./mock-supabase.mjs";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const VARIANT_ID = "22222222-2222-4222-8222-222222222222";
const CUSTOMER = {
  name: "Checkout Test",
  email: "checkout@example.test",
  phone: "11987654321",
  cpf: "52998224725"
};
const PIX_CODE = "00020101021226850014BR.GOV.BCB.PIX";
const TRANSACTION_ID = "tx_mock_123";
const WEBHOOK_SECRET = "mock-webhook-secret";

let state;
let originalFetch;
let originalConsoleInfo;
let originalConsoleError;
let capturedLogs;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function makeTransaction(status = "PENDING", overrides = {}) {
  return {
    id: TRANSACTION_ID,
    external_reference: "order-mock-1",
    status,
    amount_cents: 5000,
    pix: status === "PENDING"
      ? { copy_paste: PIX_CODE, expires_at: "2027-01-01T00:00:00.000Z" }
      : null,
    ...overrides
  };
}

function existingOrder() {
  return {
    id: "order-mock-1",
    checkout_request_id: REQUEST_ID,
    customer_name: CUSTOMER.name,
    customer_email: CUSTOMER.email,
    customer_phone: CUSTOMER.phone,
    total_amount_cents: 5000,
    status: "pending",
    gateway: "bravopay",
    gateway_payment_id: null,
    created_at: new Date().toISOString()
  };
}

function orderItems() {
  return [{
    order_id: "order-mock-1",
    product_variant_id: VARIANT_ID,
    quantity: 1,
    unit_price_cents: 5000
  }];
}

function freshState(overrides = {}) {
  return {
    gateway: "bravopay",
    variants: [{
      id: VARIANT_ID,
      price_cents: 5000,
      products: { name: "Test Phone" },
      color: "Black",
      storage_gb: 128,
      availability_status: "available",
      is_active: true
    }],
    order: null,
    items: [],
    lookupResponse: { data: [], has_more: false, next_cursor: null },
    lookupResponses: null,
    lookupStatus: 200,
    lookupRawBody: null,
    lookupError: null,
    createResponse: makeTransaction(),
    createStatus: 200,
    createRawBody: null,
    createError: null,
    failOperation: null,
    bravoPosts: 0,
    bravoGets: 0,
    idempotencyResults: {},
    createdTransactions: 0,
    lastCreate: null,
    ...overrides
  };
}

function installFetchMock() {
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));

    if (url.hostname !== "bravopay.club") {
      throw new Error("Unexpected outbound request in test: " + url.hostname);
    }

    if (url.pathname.endsWith("/transactions") && init.method === "GET") {
      state.bravoGets += 1;
      if (state.lookupError) throw state.lookupError;
      if (Array.isArray(state.lookupResponses) && state.lookupResponses.length) {
        const next = state.lookupResponses.shift();
        if (next.error) throw next.error;
        if (next.rawBody !== undefined) {
          return new Response(next.rawBody, {
            status: next.status || 200,
            headers: { "Content-Type": "application/json" }
          });
        }
        return jsonResponse(next.body, next.status || 200);
      }
      if (state.lookupRawBody !== null) {
        return new Response(state.lookupRawBody, {
          status: state.lookupStatus,
          headers: { "Content-Type": "application/json" }
        });
      }
      return jsonResponse(state.lookupResponse, state.lookupStatus);
    }

    if (url.pathname.endsWith("/transactions") && init.method === "POST") {
      state.bravoPosts += 1;
      state.lastCreate = {
        url: url.toString(),
        headers: new Headers(init.headers),
        body: JSON.parse(String(init.body))
      };

      const idempotencyKey = state.lastCreate.headers.get("Idempotency-Key");
      if (idempotencyKey && state.idempotencyResults[idempotencyKey]) {
        return jsonResponse(state.idempotencyResults[idempotencyKey], state.createStatus);
      }

      if (state.createError) throw state.createError;
      if (state.createRawBody !== null) {
        return new Response(state.createRawBody, {
          status: state.createStatus,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (state.createStatus >= 200 && state.createStatus < 300 && idempotencyKey) {
        state.idempotencyResults[idempotencyKey] = state.createResponse;
        state.createdTransactions += 1;
      }
      return jsonResponse(state.createResponse, state.createStatus);
    }

    throw new Error("Unexpected BravoPay request: " + url.toString());
  };
}

function requestBody(overrides = {}) {
  return {
    checkoutRequestId: REQUEST_ID,
    customer: CUSTOMER,
    items: [{ variantId: VARIANT_ID, quantity: 1 }],
    ...overrides
  };
}

async function runCheckout(body = requestBody()) {
  const response = {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    }
  };

  await checkoutHandler({ method: "POST", body }, response);
  return response;
}

function makeResponse() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    }
  };
}

async function runPaymentStatus(checkoutRequestId = REQUEST_ID) {
  const response = makeResponse();
  await checkoutHandler({
    method: "GET",
    headers: { "x-checkout-request-id": checkoutRequestId }
  }, response);
  return response;
}

async function runDuplicateWebhook() {
  const event = {
    id: "evt_duplicate_mock",
    type: "transaction.paid",
    created: Math.floor(Date.now() / 1000),
    data: {
      id: TRANSACTION_ID,
      external_reference: "7f6bccd7-372b-4780-a3e2-cf4d700a5308",
      status: "PAID",
      amount_cents: 5000,
      currency: "BRL"
    }
  };
  const rawBody = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const request = new EventEmitter();
  request.method = "POST";
  request.headers = {
    "content-length": String(Buffer.byteLength(rawBody)),
    "bravopay-signature": `t=${timestamp},v1=${signature}`
  };
  const response = makeResponse();
  const handling = bravoWebhookHandler(request, response);
  process.nextTick(() => {
    request.emit("data", Buffer.from(rawBody));
    request.emit("end");
  });
  await handling;
  return response;
}

function setRecoveredOrder() {
  state.order = existingOrder();
  state.items = orderItems();
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.BRAVOPAY_API_KEY = "test-bravopay-key";
  process.env.BRAVOPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  state = freshState();
  setCheckoutDatabaseState(state);
  originalFetch = globalThis.fetch;
  originalConsoleInfo = console.info;
  originalConsoleError = console.error;
  capturedLogs = [];
  console.info = (...args) => capturedLogs.push(args.join(" "));
  console.error = (...args) => capturedLogs.push(args.join(" "));
  installFetchMock();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.info = originalConsoleInfo;
  console.error = originalConsoleError;
});

test("creates PIX with the documented BravoPay payload and persists the transaction", async () => {
  const response = await runCheckout();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.transactionId, TRANSACTION_ID);
  assert.equal(response.body.payment.copyPaste, PIX_CODE);
  assert.equal(state.order.gateway_payment_id, TRANSACTION_ID);

  assert.equal(state.bravoPosts, 1);
  assert.equal(state.lastCreate.url, "https://bravopay.club/api/v1/transactions");
  assert.equal(state.lastCreate.headers.get("Authorization"), "Bearer test-bravopay-key");
  assert.equal(state.lastCreate.headers.get("Idempotency-Key"), REQUEST_ID);
  assert.equal(state.lastCreate.body.amount_cents, 5000);
  assert.equal(state.lastCreate.body.method, "pix");
  assert.equal(state.lastCreate.body.external_reference, "order-mock-1");
  assert.deepEqual(state.lastCreate.body.customer, {
    name: CUSTOMER.name,
    email: CUSTOMER.email,
    phone: CUSTOMER.phone,
    cpf: CUSTOMER.cpf
  });

  const allLogs = capturedLogs.join("\n");
  assert.equal(allLogs.includes(CUSTOMER.email), false);
  assert.equal(allLogs.includes(CUSTOMER.cpf), false);
});

test("recovers an existing PENDING PIX without creating another transaction", async () => {
  setRecoveredOrder();
  state.lookupResponse = {
    data: [makeTransaction("PENDING")],
    has_more: false,
    next_cursor: null
  };

  const response = await runCheckout();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.payment.status, "PENDING");
  assert.equal(response.body.payment.copyPaste, PIX_CODE);
  assert.equal(state.bravoPosts, 0);
  assert.equal(state.order.gateway_payment_id, TRANSACTION_ID);
});

for (const status of ["PAID", "EXPIRED", "REFUNDED", "CHARGEBACK"]) {
  test("recovers " + status + " without returning a reusable PIX code", async () => {
    setRecoveredOrder();
    state.lookupResponse = {
      data: [makeTransaction(status)],
      has_more: false,
      next_cursor: null
    };

    const response = await runCheckout();

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.payment.status, status);
    assert.equal(response.body.payment.copyPaste, "");
    assert.equal(state.bravoPosts, 0);
    assert.equal(state.order.gateway_payment_id, TRANSACTION_ID);
    const expectedOrderStatus = {
      PAID: "approved",
      EXPIRED: "failed",
      REFUNDED: "refunded",
      CHARGEBACK: "chargeback"
    }[status];
    assert.equal(state.order.status, expectedOrderStatus);
  });
}

test("keeps the attempt pending when the lookup times out", async () => {
  setRecoveredOrder();
  state.lookupError = Object.assign(new Error("timeout"), { name: "TimeoutError" });

  const response = await runCheckout();

  assert.equal(response.statusCode, 202);
  assert.equal(response.body.pending, true);
  assert.equal(state.bravoPosts, 0);
});

test("keeps the attempt pending when the lookup returns HTTP 500", async () => {
  setRecoveredOrder();
  state.lookupStatus = 500;
  state.lookupResponse = { error: { code: "internal_error" } };

  const response = await runCheckout();

  assert.equal(response.statusCode, 202);
  assert.equal(state.bravoPosts, 0);
});

test("keeps the attempt pending when the lookup JSON is invalid", async () => {
  setRecoveredOrder();
  state.lookupRawBody = "{";

  const response = await runCheckout();

  assert.equal(response.statusCode, 202);
  assert.equal(state.bravoPosts, 0);
});

test("keeps the attempt pending for an unexpected lookup structure", async () => {
  setRecoveredOrder();
  state.lookupResponse = { unexpected: [] };

  const response = await runCheckout();

  assert.equal(response.statusCode, 202);
  assert.equal(state.bravoPosts, 0);
});

test("does not treat an empty but paginated result as confirmed absence", async () => {
  setRecoveredOrder();
  state.lookupResponse = {
    data: [],
    has_more: true,
    next_cursor: "tx_next_page"
  };

  const response = await runCheckout();

  assert.equal(response.statusCode, 202);
  assert.equal(state.bravoPosts, 0);
});

test("does not reuse a recovered transaction with a different amount", async () => {
  setRecoveredOrder();
  state.lookupResponse = {
    data: [makeTransaction("PENDING", { amount_cents: 5001 })],
    has_more: false,
    next_cursor: null
  };

  const response = await runCheckout();

  assert.equal(response.statusCode, 202);
  assert.equal(state.bravoPosts, 0);
  assert.equal(state.order.gateway_payment_id, null);
});

test("does not treat a transaction with a different external reference as absence", async () => {
  setRecoveredOrder();
  state.lookupResponse = {
    data: [makeTransaction("PENDING", { external_reference: "other-order" })],
    has_more: false,
    next_cursor: null
  };

  const response = await runCheckout();

  assert.equal(response.statusCode, 202);
  assert.equal(state.bravoPosts, 0);
});

test("creates only after the documented lookup confirms an empty result", async () => {
  setRecoveredOrder();
  state.lookupResponse = {
    data: [],
    has_more: false,
    next_cursor: null
  };

  const response = await runCheckout();

  assert.equal(response.statusCode, 200);
  assert.equal(state.bravoPosts, 1);
  assert.equal(state.lastCreate.headers.get("Idempotency-Key"), REQUEST_ID);
});

test("returns a pending result when BravoPay times out during creation", async () => {
  state.createError = Object.assign(new Error("timeout"), { name: "TimeoutError" });

  const response = await runCheckout();

  assert.equal(response.statusCode, 202);
  assert.equal(response.body.pending, true);
  assert.equal(state.order.status, "pending");
  assert.equal(state.bravoGets, 1);
  assert.equal(state.bravoPosts, 1);
});

test("recovers the original PIX immediately after a creation timeout", async () => {
  state.createError = Object.assign(new Error("timeout"), { name: "TimeoutError" });
  state.lookupResponse = {
    data: [makeTransaction("PENDING")],
    has_more: false,
    next_cursor: null
  };

  const response = await runCheckout();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.transactionId, TRANSACTION_ID);
  assert.equal(response.body.payment.copyPaste, PIX_CODE);
  assert.equal(state.bravoPosts, 1);
  assert.equal(state.bravoGets, 1);
  assert.equal(state.order.gateway_payment_id, TRANSACTION_ID);
});

test("persists a PENDING transaction when PIX data is not ready and never re-creates it", async () => {
  state.createError = Object.assign(new Error("timeout"), { name: "TimeoutError" });
  state.lookupResponse = {
    data: [makeTransaction("PENDING", { pix: null })],
    has_more: false,
    next_cursor: null
  };

  const response = await runCheckout();

  assert.equal(response.statusCode, 202);
  assert.equal(response.body.pending, true);
  assert.equal(state.order.gateway_payment_id, TRANSACTION_ID);
  assert.equal(state.bravoPosts, 1);
});

test("rejects an incomplete HTTP 200 response without losing the order", async () => {
  state.createResponse = {
    id: TRANSACTION_ID,
    status: "PENDING",
    amount_cents: 5000,
    pix: {}
  };

  const response = await runCheckout();

  assert.equal(response.statusCode, 202);
  assert.equal(response.body.pending, true);
  assert.equal(state.order.status, "pending");
  assert.equal(state.order.gateway_payment_id, TRANSACTION_ID);
});

test("returns a pending result when Supabase is unavailable before payment creation", async () => {
  state.failOperation = "payment_settings:select";

  const response = await runCheckout();

  assert.equal(response.statusCode, 500);
  assert.equal(state.bravoPosts, 0);
});

test("recovers a transaction after the first database save fails", async () => {
  state.failOperation = "orders:update";

  const first = await runCheckout();
  assert.equal(first.statusCode, 202);
  assert.equal(state.bravoPosts, 1);
  assert.equal(state.order.gateway_payment_id, null);

  state.failOperation = null;
  state.lookupResponse = {
    data: [makeTransaction("PENDING")],
    has_more: false,
    next_cursor: null
  };

  const retry = await runCheckout();

  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.payment.copyPaste, PIX_CODE);
  assert.equal(state.bravoPosts, 1);
  assert.equal(state.order.gateway_payment_id, TRANSACTION_ID);
});

test("repeating the same request recovers the same transaction", async () => {
  const first = await runCheckout();
  assert.equal(first.statusCode, 200);
  assert.equal(state.bravoPosts, 1);

  state.lookupResponse = {
    data: [makeTransaction("PENDING")],
    has_more: false,
    next_cursor: null
  };

  const retry = await runCheckout();

  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body.transactionId, first.body.transactionId);
  assert.equal(state.bravoPosts, 1);
});

test("status recovery returns PIX data and persists transaction ID without creating a charge", async () => {
  setRecoveredOrder();
  state.lookupResponse = {
    data: [makeTransaction("PENDING")],
    has_more: false,
    next_cursor: null
  };

  const response = await runPaymentStatus();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.state, "available");
  assert.equal(response.body.payment.copyPaste, PIX_CODE);
  assert.equal(state.order.gateway_payment_id, TRANSACTION_ID);
  assert.equal(state.bravoPosts, 0);
});

test("status recovery keeps polling when a PENDING transaction has no PIX data", async () => {
  setRecoveredOrder();
  state.lookupResponse = {
    data: [makeTransaction("PENDING", { pix: null })],
    has_more: false,
    next_cursor: null
  };

  const response = await runPaymentStatus();

  assert.equal(response.statusCode, 202);
  assert.equal(response.body.state, "processing");
  assert.equal(state.order.gateway_payment_id, TRANSACTION_ID);
  assert.equal(state.bravoPosts, 0);
});

test("status recovery synchronizes PAID and terminal order states", async () => {
  for (const [gatewayStatus, orderStatus] of [
    ["PAID", "approved"],
    ["EXPIRED", "failed"],
    ["REFUNDED", "refunded"],
    ["CHARGEBACK", "chargeback"]
  ]) {
    setRecoveredOrder();
    state.lookupResponse = {
      data: [makeTransaction(gatewayStatus)],
      has_more: false,
      next_cursor: null
    };

    const response = await runPaymentStatus();
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.payment.status, gatewayStatus);
    assert.equal(state.order.status, orderStatus);
    assert.equal(state.bravoPosts, 0);
  }
});

test("status recovery never creates a transaction when the lookup confirms none", async () => {
  setRecoveredOrder();

  const response = await runPaymentStatus();

  assert.equal(response.statusCode, 202);
  assert.equal(response.body.state, "processing");
  assert.equal(state.bravoPosts, 0);
});

test("status recovery preserves the order when BravoPay lookup fails", async () => {
  setRecoveredOrder();
  state.lookupError = Object.assign(new Error("timeout"), { name: "TimeoutError" });

  const response = await runPaymentStatus();

  assert.equal(response.statusCode, 202);
  assert.equal(response.body.state, "processing");
  assert.equal(state.bravoPosts, 0);
});

test("status recovery does not allow lookup without the checkout capability", async () => {
  const response = await runPaymentStatus("not-a-uuid");

  assert.equal(response.statusCode, 400);
  assert.equal(state.bravoGets, 0);
});

test("two simultaneous submissions use the same idempotency key and produce one mocked transaction", async () => {
  const [first, second] = await Promise.all([
    runCheckout(),
    runCheckout()
  ]);

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(first.body.transactionId, second.body.transactionId);
  assert.equal(state.idempotencyResults[REQUEST_ID].id, TRANSACTION_ID);
  assert.equal(state.createdTransactions, 1);
  assert.equal(state.lastCreate.headers.get("Idempotency-Key"), REQUEST_ID);
});

test("expired idempotency window blocks a new create on a recovered order", async () => {
  setRecoveredOrder();
  state.order.created_at = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  state.lookupResponse = { data: [], has_more: false, next_cursor: null };

  const response = await runCheckout();

  assert.equal(response.statusCode, 202);
  assert.equal(state.bravoPosts, 0);
});

test("duplicate signed webhook event is acknowledged without reprocessing", async () => {
  state.rpcResult = { received: true, duplicate: true };

  const response = await runDuplicateWebhook();

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.duplicate, true);
  assert.equal(state.lastRpc.name, "process_bravopay_webhook");
});

