
import { createClient } from "@supabase/supabase-js";

const BRAVOPAY_URL = "https://bravopay.club/api/v1";
const DEFAULT_STORE_URL = "https://ilume-tech-store.vercel.app";

// A função terá até 30 segundos na configuração da Vercel.
// Os timeouts individuais deixam margem para finalizar a resposta.
const SUPABASE_TIMEOUT_MS = 5000;
const BRAVO_LOOKUP_TIMEOUT_MS = 5000;
const BRAVO_CREATE_TIMEOUT_MS = 12000;
const MP_TIMEOUT_MS = 7000;

type Gateway = "mercadopago" | "bravopay";

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

function normalizeDigits(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
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

function getBravoTransactions(data: any): any[] {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.data)) {
    return data.data;
  }

  if (Array.isArray(data?.transactions)) {
    return data.transactions;
  }

  if (data && typeof data === "object" && data.id) {
    return [data];
  }

  return [];
}

function getValidBravoTransaction(
  data: any,
  orderId: string,
  totalCents: number
): any | null {
  const transactions = getBravoTransactions(data);

  return (
    transactions.find((transaction) => {
      return (
        String(transaction?.id || "").length > 0 &&
        String(transaction?.external_reference || "") === orderId &&
        Number(transaction?.amount_cents) === totalCents &&
        typeof transaction?.pix?.copy_paste === "string" &&
        transaction.pix.copy_paste.length > 0
      );
    }) || null
  );
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

function returnBravoPayment(
  res: any,
  orderId: string,
  transaction: any,
  totalCents: number
) {
  return res.status(200).json({
    success: true,
    gateway: "bravopay",
    orderId,
    transactionId: String(transaction.id),
    payment: {
      method: "PIX",
      status: transaction.status || "PENDING",
      amountCents: totalCents,
      copyPaste: transaction.pix.copy_paste,
      qrCode: transaction.pix.qr_code || null,
      qrCodeBase64: transaction.pix.qr_code_base64 || null,
      expiresAt: transaction.pix.expires_at || null
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
    orderId,
    error: message
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

  // Mede cada etapa sem registrar dados pessoais ou respostas completas.
  async function runStep<T>(
    step: string,
    action: () => Promise<T>
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

  try {
    // =====================================================
    // 1. GET: CONSULTAR GATEWAY ATIVO
    // =====================================================

    if (req.method === "GET") {
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
        !["mercadopago", "bravopay"].includes(data.active_gateway)
      ) {
        return res.status(500).json({
          error: "Gateway de pagamento inválido."
        });
      }

      trace("request_completed", {
        gateway: data.active_gateway
      });

      return res.status(200).json({
        success: true,
        gateway: data.active_gateway
      });
    }

    // =====================================================
    // 2. VALIDAR DADOS RECEBIDOS
    // =====================================================

    const {
      customer,
      items,
      checkoutRequestId
    } = req.body || {};

    if (!isValidUUID(checkoutRequestId)) {
      return res.status(400).json({
        error: "Identificador da tentativa de checkout inválido."
      });
    }

    traceId = checkoutRequestId;

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

    // =====================================================
    // 3. CONSULTAR GATEWAY CONFIGURADO
    // =====================================================

    const {
      data: paymentSettings,
      error: settingsError
    } = await runStep(
      "payment_settings",
      () =>
        supabase
          .from("payment_settings")
          .select("active_gateway")
          .eq("id", 1)
          .single()
    );

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

    if (
      !["mercadopago", "bravopay"].includes(configuredGateway)
    ) {
      return res.status(500).json({
        error: "Gateway de pagamento inválido."
      });
    }

    // Validação antecipada: evita criar pedidos novos com dados inválidos.
    if (configuredGateway === "bravopay") {
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
        console.error("CHECKOUT: BRAVOPAY_API_KEY ausente.");

        return res.status(500).json({
          error: "A configuração da BravoPay está incompleta."
        });
      }
    }

    if (
      configuredGateway === "mercadopago" &&
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

    // =====================================================
    // 4. CONSOLIDAR QUANTIDADES
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

    // =====================================================
    // 5. CONSULTAR VARIANTES
    // =====================================================

    const variantIds = Array.from(quantities.keys());

    const {
      data: variants,
      error: variantsError
    } = await runStep(
      "product_variants",
      () =>
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
    );

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

    // =====================================================
    // 6. CRIAR OU RECUPERAR PEDIDO
    // =====================================================

    let order: any = null;
    let newlyCreated = false;

    const {
      data: insertedOrder,
      error: orderInsertError
    } = await runStep(
      "order_insert",
      () =>
        supabase
          .from("orders")
          .insert([{
            checkout_request_id: checkoutRequestId,
            customer_name: customerName,
            customer_email: customerEmail,
            customer_phone: customerPhone || null,
            total_amount_cents: totalCents,
            status: "pending",
            gateway: configuredGateway
          }])
          .select()
          .single()
    );

    if (!orderInsertError && insertedOrder) {
      order = insertedOrder;
      newlyCreated = true;

      trace("order_created");
    } else if (orderInsertError?.code === "23505") {
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
    // 7. VALIDAR PROPRIEDADE DA TENTATIVA
    // =====================================================

    const orderGateway = order.gateway as Gateway;

    if (
      !["mercadopago", "bravopay"].includes(orderGateway) ||
      order.customer_email !== customerEmail ||
      order.customer_name !== customerName ||
      Number(order.total_amount_cents) !== totalCents ||
      (order.customer_phone || "") !== (customerPhone || "")
    ) {
      trace("order_validation_failed");

      return res.status(409).json({
        error: "Esta tentativa já está vinculada a outro pedido. Inicie uma nova compra."
      });
    }

    if (
      ["failed", "refunded", "chargeback"].includes(
        String(order.status).toLowerCase()
      )
    ) {
      return res.status(409).json({
        error: "Este pedido não pode ser reutilizado. Inicie uma nova compra."
      });
    }

    // Se o gateway foi alterado no painel enquanto existia uma
    // tentativa pendente, respeitamos o gateway salvo no pedido.
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
    // 8. REGISTRAR ITENS DO PEDIDO
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

    const storeUrl = (
      process.env.STORE_URL || DEFAULT_STORE_URL
    ).replace(/\/$/, "");

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

    // =====================================================
    // 11. RECUPERAR TRANSAÇÃO EXISTENTE
    // =====================================================

    if (!newlyCreated) {
      trace("bravo_lookup_started");

      try {
        const lookupResponse = await runStep(
          "bravo_lookup",
          () =>
            fetch(
              `${BRAVOPAY_URL}/transactions?external_reference=${encodeURIComponent(
                order.id
              )}`,
              {
                method: "GET",
                signal: AbortSignal.timeout(
                  BRAVO_LOOKUP_TIMEOUT_MS
                ),
                headers: bravoHeaders
              }
            )
        );

        if (lookupResponse.ok) {
          const lookupData = await readJson(lookupResponse);

          existingTransaction = getValidBravoTransaction(
            lookupData,
            order.id,
            totalCents
          );

          trace("bravo_lookup_result", {
            httpStatus: lookupResponse.status,
            transactionFound: Boolean(existingTransaction)
          });
        } else {
          trace("bravo_lookup_http_error", {
            httpStatus: lookupResponse.status
          });
        }
      } catch (lookupError: any) {
        trace("bravo_lookup_failed", {
          errorName: getErrorName(lookupError),
          errorCode: getErrorCode(lookupError)
        });

        console.error(
          "CHECKOUT: Consulta BravoPay inconclusiva.",
          getErrorName(lookupError)
        );
      }
    }

    // =====================================================
    // 12. RETORNAR PIX RECUPERADO
    // =====================================================

    if (existingTransaction) {
      const saved = await runStep(
        "bravo_transaction_recovery_save",
        () =>
          saveBravoTransaction(
            supabase,
            order.id,
            existingTransaction
          )
      );

      if (!saved) {
        return pendingPayment(
          res,
          order.id,
          "Encontramos sua cobrança, mas estamos sincronizando o pagamento."
        );
      }

      trace("request_completed", {
        gateway: "bravopay",
        recovered: true
      });

      return returnBravoPayment(
        res,
        order.id,
        existingTransaction,
        totalCents
      );
    }

    // =====================================================
    // 13. CRIAR PIX NA BRAVOPAY
    // =====================================================

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

    const returnedAmount = Number(
      bravoData?.amount_cents
    );

    const validBravoResponse =
      bravoResponse.ok &&
      String(bravoData?.id || "").length > 0 &&
      typeof bravoData?.pix?.copy_paste === "string" &&
      bravoData.pix.copy_paste.length > 0 &&
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

      return pendingPayment(
        res,
        order.id,
        "Não foi possível confirmar a cobrança. Sua compra permanece em verificação."
      );
    }

    // =====================================================
    // 14. SALVAR ID DA TRANSAÇÃO
    // =====================================================

    const saved = await runStep(
      "bravo_transaction_save",
      () =>
        saveBravoTransaction(
          supabase,
          order.id,
          bravoData
        )
    );

    if (!saved) {
      return pendingPayment(
        res,
        order.id,
        "A cobrança foi criada e está em verificação. Tente novamente em instantes."
      );
    }

    // =====================================================
    // 15. RETORNAR PIX
    // =====================================================

    trace("request_completed", {
      gateway: "bravopay",
      recovered: false,
      httpStatus: bravoResponse.status
    });

    return returnBravoPayment(
      res,
      order.id,
      bravoData,
      totalCents
    );

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

    // Nunca marcar como failed em timeout ou erro de comunicação.
    // A cobrança pode ter sido criada no gateway.

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
