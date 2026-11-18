import assert from "node:assert/strict";
import { afterEach, before, beforeEach, test } from "node:test";
import checkout from "../../api/create-checkout.ts";
import { setCheckoutDatabaseState } from "./mock-supabase.mjs";
import {
  CHECKOUT_REQUEST_KEY,
  releaseRevantCheckoutAttempt,
  reserveRevantCheckoutAttempt
} from "../../src/utils/revantCheckoutAttempt.ts";

const requestId = "11111111-1111-4111-8111-111111111111";
const variantId = "22222222-2222-4222-8222-222222222222";
const endpoint = "https://api.revantpay.com/v1/checkout-sessions";
const paymentUrl = "https://checkout.revantpay.com/test-session";
const storeUrl = "https://ilume.example.test";

let database;
let requests;
let providerResponse;
let recoveryCookie;
let traces;
const originalFetch = globalThis.fetch;
const originalConsoleInfo = console.info;
let paymentSettings;

before(async () => {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.SUPABASE_ANON_KEY = "test-public-key";
  ({ default: paymentSettings } = await import("../../api/admin/payment-settings.ts"));
});

beforeEach(() => {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.REVANTPAY_API_KEY = "test-revantpay-key";
  process.env.STORE_URL = storeUrl;
  database = {
    gateway: "revantpay",
    variants: [{
      id: variantId,
      is_active: true,
      availability_status: "available",
      price_cents: 5037,
      products: { name: "Produto" }
    }],
    items: []
  };
  setCheckoutDatabaseState(database);
  requests = [];
  recoveryCookie = undefined;
  traces = [];
  console.info = (...args) => traces.push(args);
  providerResponse = () => Response.json({
    session_id: "test-session",
    external_id: database.order.id,
    checkout_url: paymentUrl
  });
  globalThis.fetch = async (url, init) => {
    requests.push({ url, ...init });
    assert.ok(url === endpoint || url === `${endpoint}/test-session`);
    return providerResponse();
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.info = originalConsoleInfo;
});

function makeResponse() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
}

async function request(method = "POST", headers = {}) {
  const response = makeResponse();
  await checkout({
    method,
    headers: { cookie: recoveryCookie, ...headers },
    body: {
      checkoutRequestId: requestId,
      customer: { name: "Cliente Teste", email: "cliente@example.test" },
      address: {
        recipientName: "Cliente Teste",
        recipientPhone: "11912345678",
        postalCode: "01001000",
        street: "Rua Teste",
        number: "10",
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP"
      },
      items: [{ variantId, quantity: 2 }]
    }
  }, response);
  if (response.headers["set-cookie"]) {
    recoveryCookie = response.headers["set-cookie"].split(";", 1)[0];
  }
  return response;
}

function readPaymentStatus(headers = {}) {
  return request("GET", { "x-checkout-request-id": requestId, ...headers });
}

async function selectGateway(gateway) {
  const response = makeResponse();
  await paymentSettings({
    method: "POST",
    headers: { authorization: "Bearer test-owner-token" },
    body: { active_gateway: gateway }
  }, response);
  return response;
}

test("only the owner can select Revant Pay and the selection leaves existing orders alone", async () => {
  database.gateway = "mercadopago";
  database.order = { gateway: "mercadopago", status: "approved" };
  database.user = { id: "test-user" };
  database.role = { user_id: database.user.id, role: "customer" };

  assert.equal((await selectGateway("revantpay")).statusCode, 403);
  assert.equal(database.gateway, "mercadopago");

  database.role.role = "owner";
  const result = await selectGateway("revantpay");
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.settings.active_gateway, "revantpay");
  assert.equal((await request("GET")).body.gateway, "revantpay");
  assert.deepEqual(database.order, { gateway: "mercadopago", status: "approved" });
});

test("Revant Pay requires the server key to be selected while BravoPay remains selectable", async () => {
  database.gateway = "mercadopago";
  database.user = { id: "test-owner" };
  database.role = { user_id: database.user.id, role: "owner" };
  delete process.env.REVANTPAY_API_KEY;

  assert.equal((await selectGateway("revantpay")).statusCode, 503);
  assert.equal(database.gateway, "mercadopago");
  assert.equal((await selectGateway("bravopay")).statusCode, 200);
  assert.equal(database.gateway, "bravopay");
});

test("creates the hosted session using catalog prices and persists its ID before redirecting", async () => {
  const response = await request();
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    success: true,
    gateway: "revantpay",
    orderId: database.order.id,
    paymentUrl
  });
  assert.equal(database.order.gateway, "revantpay");
  assert.equal(database.order.status, "pending");
  assert.equal(database.order.preference_id, "test-session");
  assert.equal(database.order.gateway_payment_id, null);
  assert.equal(requests.length, 1);
  const [outgoing] = requests;
  assert.equal(outgoing.method, "POST");
  assert.equal(outgoing.url, endpoint);
  assert.equal(outgoing.headers["x-api-key"], "test-revantpay-key");
  assert.equal(outgoing.headers["Idempotency-Key"], requestId);
  assert.equal(outgoing.redirect, "error");
  assert.deepEqual(JSON.parse(outgoing.body), {
    amount: 100.74,
    description: `Pedido ${database.order.id} da ILUME Tech Store`,
    product_name: "Pedido ILUME Tech Store",
    external_id: database.order.id,
    success_url: `${storeUrl}/checkout?revantpay=retorno`,
    cancel_url: `${storeUrl}/checkout?revantpay=cancelado`
  });
});

test("recovers the stored session after switching the active gateway to BravoPay", async () => {
  assert.equal((await request()).statusCode, 200);
  database.gateway = "bravopay";

  assert.equal((await request("GET")).body.gateway, "bravopay");
  const gateway = await request("GET", { "x-checkout-gateway-request-id": requestId });
  assert.equal(gateway.body.gateway, "revantpay");
  const status = await readPaymentStatus();
  assert.equal(status.statusCode, 200);
  assert.deepEqual(status.body, {
    success: true,
    gateway: "revantpay",
    state: "hosted_checkout",
    orderId: database.order.id,
    paymentUrl
  });
  assert.equal(database.order.status, "pending");
  assert.deepEqual(requests.slice(1).map(({ method, url }) => [method, url]), [
    ["GET", `${endpoint}/test-session`]
  ]);

  const recovered = await request();
  assert.equal(recovered.body.paymentUrl, paymentUrl);
  assert.deepEqual(requests.map(({ method }) => method), ["POST", "GET", "GET"]);
});

test("GET keeps an order without a stored session pending without contacting Revant Pay", async () => {
  providerResponse = () => new Response(null, { status: 503 });
  assert.equal((await request()).statusCode, 202);
  assert.equal(database.order.preference_id, null);
  requests.length = 0;

  const response = await readPaymentStatus();
  assert.equal(response.statusCode, 202);
  assert.equal(response.body.state, "processing");
  assert.equal(response.body.pending, true);
  assert.equal(response.body.paymentUrl, undefined);
  assert.equal(database.order.status, "pending");
  assert.equal(database.order.preference_id, null);
  assert.deepEqual(requests, []);
});

test("GET never returns a URL for an invalid session or a different order", async () => {
  assert.equal((await request()).statusCode, 200);
  const storedOrder = { ...database.order };

  for (const invalidSession of [
    { session_id: "wrong-session", external_id: storedOrder.id, checkout_url: paymentUrl },
    { session_id: "test-session", external_id: "wrong-order", checkout_url: paymentUrl },
    { session_id: "test-session", checkout_url: paymentUrl },
    { session_id: "test-session", external_id: storedOrder.id, checkout_url: "http://checkout.revantpay.com/test-session" }
  ]) {
    providerResponse = () => Response.json(invalidSession);
    const response = await readPaymentStatus();
    assert.equal(response.statusCode, 202);
    assert.equal(response.body.state, "processing");
    assert.equal(response.body.paymentUrl, undefined);
  }

  assert.deepEqual(database.order, storedOrder);
  assert.deepEqual(requests.map(({ method }) => method), ["POST", "GET", "GET", "GET", "GET"]);
});

test("GET never exposes a session for an order that is no longer pending", async () => {
  assert.equal((await request()).statusCode, 200);
  requests.length = 0;

  for (const status of ["approved", "failed", "refunded"]) {
    database.order.status = status;
    const response = await readPaymentStatus();
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.state, "terminal");
    assert.equal(response.body.terminal, true);
    assert.equal(response.body.paymentUrl, undefined);
    assert.equal(database.order.status, status);
  }

  assert.deepEqual(requests, []);
});

test("GET preserves the pending order and its session after lookup failures", async () => {
  assert.equal((await request()).statusCode, 200);
  const storedOrder = { ...database.order };

  for (const failedLookup of [
    () => new Response(null, { status: 404 }),
    () => new Response(null, { status: 503 }),
    () => { throw new DOMException("Request timed out", "TimeoutError"); }
  ]) {
    providerResponse = failedLookup;
    const response = await readPaymentStatus();
    assert.equal(response.statusCode, 202);
    assert.equal(response.body.state, "processing");
    assert.equal(response.body.paymentUrl, undefined);
  }

  assert.deepEqual(database.order, storedOrder);
  assert.deepEqual(requests.map(({ method }) => method), ["POST", "GET", "GET", "GET"]);
});

test("keeps an existing BravoPay attempt bound to BravoPay after selecting Revant Pay", async () => {
  assert.equal((await request()).statusCode, 200);
  database.order.gateway = "bravopay";
  const gateway = await request("GET", { "x-checkout-gateway-request-id": requestId });
  assert.equal(gateway.body.gateway, "bravopay");

  const response = await request();
  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /telefone/);
  assert.equal(database.order.gateway, "bravopay");
  assert.equal(requests.length, 1);
});

test("retries the same session creation key after a database save failure", async () => {
  database.failOperation = "orders:update";
  const first = await request();
  assert.equal(first.statusCode, 202);
  assert.equal(first.body.paymentUrl, undefined);
  assert.equal(database.order.preference_id, null);

  database.failOperation = null;
  assert.equal((await request()).statusCode, 200);
  assert.deepEqual(requests.map(({ headers }) => headers["Idempotency-Key"]), [requestId, requestId]);
  assert.equal(database.order.preference_id, "test-session");
});

test("keeps the order pending when the creation window has closed", async () => {
  providerResponse = () => new Response(null, { status: 503 });
  assert.equal((await request()).statusCode, 202);
  database.order.created_at = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  assert.equal((await request()).statusCode, 202);
  assert.equal(database.order.status, "pending");
  assert.equal(requests.length, 1);
});

test("concurrent requests share the same creation key and keep one stored session", async () => {
  const results = await Promise.all([request(), request()]);
  assert.ok(results.some(({ statusCode }) => statusCode === 200));
  assert.ok(results.every(({ statusCode }) => statusCode === 200 || statusCode === 202));
  const createRequests = requests.filter(({ method }) => method === "POST");
  assert.ok(createRequests.length > 0);
  assert.ok(createRequests.every(({ headers }) => headers["Idempotency-Key"] === requestId));
  assert.equal(database.order.preference_id, "test-session");
  assert.equal(database.order.status, "pending");
});

test("does not issue a new session if the stored session cannot be verified", async () => {
  assert.equal((await request()).statusCode, 200);
  providerResponse = () => Response.json({
    session_id: "wrong-session",
    external_id: database.order.id,
    checkout_url: paymentUrl
  });

  const response = await request();
  assert.equal(response.statusCode, 202);
  assert.equal(response.body.paymentUrl, undefined);
  assert.deepEqual(requests.map(({ method }) => method), ["POST", "GET"]);
});

test("does not expose a checkout URL outside the Revant Pay domain", async () => {
  providerResponse = () => Response.json({
    session_id: "test-session",
    checkout_url: "https://revantpay.com.example.test/checkout"
  });
  const response = await request();
  assert.equal(response.statusCode, 202);
  assert.equal(response.body.paymentUrl, undefined);
  assert.equal(database.order.preference_id, null);
});

test("checkout traces correlate the attempt without logging the request ID or credentials", async () => {
  const created = await request();
  assert.equal(created.statusCode, 200);
  assert.equal((await readPaymentStatus()).statusCode, 200);

  const entries = traces.filter(([label]) => label === "CHECKOUT_TRACE").map(([, entry]) => JSON.parse(entry));
  const submission = entries.find(({ event }) => event === "request_validating");
  const recovery = entries.find(({ event }) => event === "payment_status_started");
  assert.match(submission.traceId, /^[0-9a-f]{24}$/);
  assert.equal(recovery.traceId, submission.traceId);
  for (const secret of [requestId, process.env.REVANTPAY_API_KEY, recoveryCookie]) {
    assert.equal(JSON.stringify(traces).includes(secret), false);
  }
});

test("GET requires a signed recovery cookie tied to the order and does not contact Revant Pay without it", async () => {
  const created = await request();
  assert.match(created.headers["set-cookie"], /; HttpOnly; Secure; SameSite=Strict$/);
  assert.match(created.headers["set-cookie"], /; Path=\/api\/create-checkout;/);

  for (const cookie of [undefined, `${recoveryCookie}invalid`]) {
    const response = await readPaymentStatus({ cookie });
    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.body, { success: false, gateway: "revantpay", state: "recovery_required" });
  }

  const originalOrderId = database.order.id;
  database.order.id = "another-order";
  assert.equal((await readPaymentStatus()).statusCode, 403);
  database.order.id = originalOrderId;
  assert.equal(requests.length, 1);
  assert.equal((await readPaymentStatus()).body.paymentUrl, paymentUrl);
});

test("an existing attempt without a cookie recovers through the original order form", async () => {
  assert.equal((await request()).statusCode, 200);
  recoveryCookie = undefined;
  assert.equal((await readPaymentStatus()).statusCode, 403);
  const recovered = await request();
  assert.equal(recovered.body.paymentUrl, paymentUrl);
  assert.ok(recovered.headers["set-cookie"]);
  assert.deepEqual(requests.map(({ method }) => method), ["POST", "GET"]);
});

test("creation requires the provider to confirm the order reference before saving a session", async () => {
  providerResponse = () => Response.json({ session_id: "test-session", checkout_url: paymentUrl });
  const response = await request();
  assert.equal(response.statusCode, 202);
  assert.equal(response.body.paymentUrl, undefined);
  assert.equal(database.order.preference_id, null);
});

test("a missing database uniqueness constraint stops new Revant Pay attempts before the provider call", async () => {
  database.checkoutRequestUnique = false;
  assert.equal((await request()).statusCode, 500);
  assert.deepEqual(database.lastOrderUpsert, { onConflict: "checkout_request_id", ignoreDuplicates: true });
  assert.equal(database.order, undefined);
  assert.deepEqual(requests, []);
});

test("switching to Revant Pay recovers an existing Mercado Pago order without inserting another order", async () => {
  assert.equal((await request()).statusCode, 200);
  database.order.gateway = "mercadopago";
  database.order.preference_id = "legacy-preference";
  database.failOperation = "orders:insert";
  const previousKey = process.env.MP_ACCESS_TOKEN;
  process.env.MP_ACCESS_TOKEN = "test-mercado-pago-key";

  const legacyUrl = "https://www.mercadopago.com.br/test-preference";
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.mercadopago.com/checkout/preferences/legacy-preference");
    assert.equal(init.method, "GET");
    return Response.json({ init_point: legacyUrl });
  };

  try {
    const response = await request();
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.gateway, "mercadopago");
    assert.equal(response.body.paymentUrl, legacyUrl);
    assert.equal(database.order.gateway, "mercadopago");
  } finally {
    if (previousKey === undefined) delete process.env.MP_ACCESS_TOKEN;
    else process.env.MP_ACCESS_TOKEN = previousKey;
  }
});

test("POST lets the buyer retire terminal Revant Pay attempts even when catalog items are unavailable", async () => {
  assert.equal((await request()).statusCode, 200);
  database.variants = [];
  for (const status of ["approved", "paid", "cancelled", "failed"]) {
    database.order.status = status;
    const response = await request();
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.gateway, "revantpay");
    assert.equal(response.body.terminal, true);
  }
  assert.equal(requests.length, 1);
});

test("GET and POST keep a processing Revant Pay attempt without returning a link or retiring it", async () => {
  assert.equal((await request()).statusCode, 200);
  database.order.status = "processing";
  for (const response of [await readPaymentStatus(), await request()]) {
    assert.equal(response.statusCode, 202);
    assert.equal(response.body.pending, true);
    assert.equal(response.body.terminal, undefined);
    assert.equal(response.body.paymentUrl, undefined);
  }
  assert.equal(database.order.preference_id, "test-session");
  assert.equal(requests.length, 1);
});

test("GET and POST withhold the URL if the order closes during the provider lookup", async () => {
  assert.equal((await request()).statusCode, 200);
  const validResponse = providerResponse;
  providerResponse = () => {
    database.order.status = "approved";
    return validResponse();
  };

  for (const lookup of [readPaymentStatus, request]) {
    database.order.status = "pending";
    const response = await lookup();
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.terminal, true);
    assert.equal(response.body.paymentUrl, undefined);
    assert.equal(database.order.status, "approved");
  }
  assert.deepEqual(requests.map(({ method }) => method), ["POST", "GET", "GET"]);
});

test("GET withholds the URL if the stored session changes during the provider lookup", async () => {
  assert.equal((await request()).statusCode, 200);
  const validResponse = providerResponse;
  providerResponse = () => {
    database.order.preference_id = "changed-session";
    return validResponse();
  };

  const response = await readPaymentStatus();
  assert.equal(response.statusCode, 202);
  assert.equal(response.body.paymentUrl, undefined);
  assert.equal(database.order.preference_id, "changed-session");
});

test("two tabs reserve one shared ID, and old terminal responses cannot erase a new attempt", async () => {
  const stored = new Map();
  const storage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key)
  };
  let queue = Promise.resolve();
  const locks = {
    request(name, operation) {
      assert.equal(name, "ilume-checkout-request-id");
      const result = queue.then(operation);
      queue = result;
      return result;
    }
  };
  const readLegacy = () => null;
  const nextId = "33333333-3333-4333-8333-333333333333";
  const [first, second] = await Promise.all([
    reserveRevantCheckoutAttempt(storage, locks, readLegacy, () => requestId),
    reserveRevantCheckoutAttempt(storage, locks, readLegacy, () => assert.fail("second tab generated a new ID"))
  ]);
  assert.equal(first, requestId);
  assert.equal(second, first);

  await releaseRevantCheckoutAttempt(storage, locks, first);
  assert.equal(await reserveRevantCheckoutAttempt(storage, locks, readLegacy, () => nextId), nextId);
  await releaseRevantCheckoutAttempt(storage, locks, first);
  assert.equal(stored.get(CHECKOUT_REQUEST_KEY), nextId);
});

test("without cross-tab locking, the browser can reuse a saved attempt but cannot create a new one", async () => {
  const storage = { getItem: () => requestId, setItem: () => assert.fail("unexpected write") };
  assert.equal(await reserveRevantCheckoutAttempt(storage, undefined, () => null), requestId);
  await assert.rejects(reserveRevantCheckoutAttempt({ ...storage, getItem: () => null }, undefined, () => null));
});
