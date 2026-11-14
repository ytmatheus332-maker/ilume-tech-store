
import { createClient } from "@supabase/supabase-js";

const BRAVOPAY_URL = "https://bravopay.club/api/v1";
const DEFAULT_STORE_URL = "https://ilume-tech-store.vercel.app";
const REQUEST_TIMEOUT_MS = 15000;

// Proteção temporária: este pedido só pode recuperar uma cobrança.
// Nunca poderá criar uma nova transação durante nosso teste.
const TEST_RECOVERY_ONLY_ORDER_ID =
  "031186ae-b8de-41c9-b583-79382f356c41";

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
      "CHECKOUT: Não foi possível atualizar o pedido para failed.",
      error
    );
  }
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
  items: ValidatedItem[]
): Promise<boolean> {
  const { data: existingItems, error: readError } =
    await supabase
      .from("order_items")
      .select("product_variant_id, quantity, unit_price_cents")
      .eq("order_id", orderId);

  if (readError) {
    console.error(
      "CHECKOUT: Erro ao consultar itens do pedido.",
      readError
    );

    return false;
  }

  if (existingItems?.length) {
    return sameItems(existingItems, items);
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
    "CHECKOUT: Erro ao registrar itens do pedido.",
    insertError
  );

  return false;
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
  const { error } = await supabase
    .from("orders")
    .update({
      gateway_payment_id: String(transaction.id)
    })
    .eq("id", orderId)
    .eq("gateway", "bravopay");

  if (error) {
    console.error(
      "CHECKOUT: Não foi possível salvar o ID da transação BravoPay.",
      error
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
      expiresAt: transaction.pix.expires_at || null
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

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    "";

  const supabaseServiceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("CHECKOUT: Variáveis do Supabase ausentes.");

    return res.status(500).json({
      error: "Erro de configuração do servidor."
    });
  }

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

  let orderId: string | null = null;

  try {
    // 1. Consultar gateway ativo.

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("payment_settings")
        .select("active_gateway")
        .eq("id", 1)
        .single();

      if (error || !data) {
        console.error(
          "CHECKOUT: Erro ao consultar gateway.",
          error
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

      return res.status(200).json({
        success: true,
        gateway: data.active_gateway
      });
    }

    // 2. Validar dados recebidos.

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

    // 3. Consultar gateway configurado.

    const {
      data: paymentSettings,
      error: settingsError
    } = await supabase
      .from("payment_settings")
      .select("active_gateway")
      .eq("id", 1)
      .single();

    if (settingsError || !paymentSettings) {
      console.error(
        "CHECKOUT: Erro ao consultar payment_settings.",
        settingsError
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

    // 4. Consolidar quantidades.

    const quantities = new Map<string, number>();

    for (const item of items as CheckoutItem[]) {
      const variantId = String(item?.variantId || "").trim();
      const quantity = Number(item?.quantity);

      if (
        !variantId ||
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

    // 5. Validar preços e disponibilidade no banco.

    const validatedItems: ValidatedItem[] = [];
    let totalCents = 0;

    for (const [variantId, quantity] of quantities.entries()) {
      const { data: variant, error: variantError } =
        await supabase
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
          .eq("id", variantId)
          .single();

      if (variantError || !variant) {
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

    // 6. Recuperar pedido existente ou criar um novo.

    let order: any = null;

    const {
      data: insertedOrder,
      error: orderInsertError
    } = await supabase
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
      .single();

    if (!orderInsertError && insertedOrder) {
      order = insertedOrder;
    } else if (orderInsertError?.code === "23505") {
      const {
        data: existingOrder,
        error: existingOrderError
      } = await supabase
        .from("orders")
        .select("*")
        .eq("checkout_request_id", checkoutRequestId)
        .maybeSingle();

      if (existingOrderError || !existingOrder) {
        console.error(
          "CHECKOUT: Não foi possível recuperar o pedido existente.",
          existingOrderError
        );

        return res.status(500).json({
          error: "Não foi possível recuperar sua tentativa de pagamento."
        });
      }

      order = existingOrder;
    } else {
      console.error(
        "CHECKOUT: Erro ao registrar pedido.",
        orderInsertError
      );

      return res.status(500).json({
        error: "Não foi possível registrar seu pedido."
      });
    }

    orderId = order.id;

    // 7. Validar se a chave pertence à mesma compra.

    const orderGateway = order.gateway as Gateway;

    if (
      !["mercadopago", "bravopay"].includes(orderGateway) ||
      order.customer_email !== customerEmail ||
      order.customer_name !== customerName ||
      Number(order.total_amount_cents) !== totalCents ||
      (order.customer_phone || "") !== (customerPhone || "")
    ) {
      return res.status(409).json({
        error: "Esta tentativa já está vinculada a outro pedido. Inicie uma nova compra."
      });
    }

    // 8. Garantir integridade dos itens.

    const itemsReady = await ensureOrderItems(
      supabase,
      order.id,
      validatedItems
    );

    if (!itemsReady) {
      return res.status(500).json({
        error: "Não foi possível confirmar os produtos do pedido. Tente novamente."
      });
    }

    // 9. Validar configuração do gateway original do pedido.

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
        console.error("CHECKOUT: BRAVOPAY_API_KEY ausente.");

        return res.status(500).json({
          error: "A configuração da BravoPay está incompleta."
        });
      }
    }

    if (
      orderGateway === "mercadopago" &&
      !process.env.MP_ACCESS_TOKEN
    ) {
      console.error("CHECKOUT: MP_ACCESS_TOKEN ausente.");

      return res.status(500).json({
        error: "A configuração do Mercado Pago está incompleta."
      });
    }

    const storeUrl = (
      process.env.STORE_URL || DEFAULT_STORE_URL
    ).replace(/\/$/, "");

    // 10. Fluxo Mercado Pago.

    if (orderGateway === "mercadopago") {
      if (order.preference_id) {
        const preferenceResponse = await fetch(
          `https://api.mercadopago.com/checkout/preferences/${encodeURIComponent(
            order.preference_id
          )}`,
          {
            method: "GET",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            headers: {
              Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
            }
          }
        );

        const preferenceData = await readJson(
          preferenceResponse
        );

        if (
          preferenceResponse.ok &&
          preferenceData?.init_point
        ) {
          return res.status(200).json({
            success: true,
            gateway: "mercadopago",
            orderId: order.id,
            paymentUrl: preferenceData.init_point
          });
        }

        console.error(
          "CHECKOUT: Não foi possível recuperar preferência existente.",
          preferenceData
        );

        return res.status(502).json({
          error: "Estamos verificando seu pagamento anterior. Tente novamente em instantes."
        });
      }

      const mpResponse = await fetch(
        "https://api.mercadopago.com/checkout/preferences",
        {
          method: "POST",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
      );

      const mpData = await readJson(mpResponse);

      if (
        !mpResponse.ok ||
        !mpData?.id ||
        !mpData?.init_point
      ) {
        console.error(
          "CHECKOUT: Erro Mercado Pago.",
          mpData
        );

        if (
          mpResponse.status >= 400 &&
          mpResponse.status < 500 &&
          ![408, 409, 429].includes(mpResponse.status)
        ) {
          await markOrderFailed(supabase, order.id);
        }

        return res.status(502).json({
          error: "Não foi possível confirmar a criação do pagamento. Tente novamente."
        });
      }

      const { error: preferenceError } = await supabase
        .from("orders")
        .update({
          preference_id: String(mpData.id)
        })
        .eq("id", order.id);

      if (preferenceError) {
        console.error(
          "CHECKOUT: Erro ao salvar preferência Mercado Pago.",
          preferenceError
        );

        return res.status(500).json({
          error: "O pagamento está em verificação. Tente novamente em instantes."
        });
      }

      return res.status(200).json({
        success: true,
        gateway: "mercadopago",
        orderId: order.id,
        paymentUrl: mpData.init_point
      });
    }

    // 11. Consultar transação existente na BravoPay.

    const bravoHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.BRAVOPAY_API_KEY}`
    };

    let existingTransaction: any = null;
    let lookupSucceeded = false;

    try {
      const lookupResponse = await fetch(
        `${BRAVOPAY_URL}/transactions?external_reference=${encodeURIComponent(
          order.id
        )}`,
        {
          method: "GET",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: bravoHeaders
        }
      );

      const lookupData = await readJson(lookupResponse);

      if (!lookupResponse.ok) {
        console.error(
          "CHECKOUT: Consulta BravoPay retornou HTTP não aprovado.",
          lookupResponse.status,
          lookupData
        );

        // No pedido protegido, não continuar para criação.
        if (order.id === TEST_RECOVERY_ONLY_ORDER_ID) {
          return res.status(503).json({
            success: false,
            pending: true,
            orderId: order.id,
            error: "Não foi possível consultar a cobrança existente. Nenhuma nova cobrança foi criada."
          });
        }
      } else {
        lookupSucceeded = true;

        existingTransaction = getValidBravoTransaction(
          lookupData,
          order.id,
          totalCents
        );
      }
    } catch (lookupError) {
      console.error(
        "CHECKOUT: Consulta BravoPay inconclusiva.",
        lookupError
      );

      // Pedido de teste: nunca criar cobrança após falha no GET.
      if (order.id === TEST_RECOVERY_ONLY_ORDER_ID) {
        return res.status(503).json({
          success: false,
          pending: true,
          orderId: order.id,
          error: "A consulta da cobrança anterior falhou. Nenhuma nova cobrança foi criada."
        });
      }
    }

    // 12. Se encontrou a cobrança, sincronizar e retornar PIX.

    if (existingTransaction) {
      const saved = await saveBravoTransaction(
        supabase,
        order.id,
        existingTransaction
      );

      if (!saved) {
        return res.status(202).json({
          success: false,
          pending: true,
          orderId: order.id,
          error: "Encontramos sua cobrança, mas estamos sincronizando o pagamento. Tente novamente em instantes."
        });
      }

      return returnBravoPayment(
        res,
        order.id,
        existingTransaction,
        totalCents
      );
    }

    // 13. Proteção do teste:
    // se a consulta funcionou, mas não encontrou a cobrança,
    // bloquear qualquer tentativa de criação.

    if (order.id === TEST_RECOVERY_ONLY_ORDER_ID) {
      return res.status(409).json({
        success: false,
        pending: true,
        orderId: order.id,
        lookupSucceeded,
        error: "A cobrança existente não foi localizada com os dados esperados. Nenhuma nova cobrança foi criada."
      });
    }

    // 14. Criar PIX para pedidos normais.
    // O teste protegido acima não consegue chegar até este trecho.

    const bravoResponse = await fetch(
      `${BRAVOPAY_URL}/transactions`,
      {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
    );

    const bravoData = await readJson(bravoResponse);
    const returnedAmount = Number(bravoData?.amount_cents);

    const validBravoResponse =
      bravoResponse.ok &&
      String(bravoData?.id || "").length > 0 &&
      typeof bravoData?.pix?.copy_paste === "string" &&
      bravoData.pix.copy_paste.length > 0 &&
      Number.isSafeInteger(returnedAmount) &&
      returnedAmount === totalCents;

    if (!validBravoResponse) {
      console.error(
        "CHECKOUT: Resposta BravoPay não confirmada.",
        {
          httpStatus: bravoResponse.status,
          response: bravoData
        }
      );

      return res.status(502).json({
        success: false,
        pending: true,
        orderId: order.id,
        error: "Não foi possível confirmar o resultado da cobrança. Sua compra está em verificação. Tente novamente em instantes."
      });
    }

    // 15. Salvar identificador da transação.

    const saved = await saveBravoTransaction(
      supabase,
      order.id,
      bravoData
    );

    if (!saved) {
      return res.status(202).json({
        success: false,
        pending: true,
        orderId: order.id,
        error: "A cobrança foi criada e está em verificação. Tente novamente em instantes."
      });
    }

    // 16. Retornar PIX.

    return returnBravoPayment(
      res,
      order.id,
      bravoData,
      totalCents
    );

  } catch (error: any) {
    console.error(
      "CHECKOUT: Erro inesperado.",
      error
    );

    // Nunca marcar failed em timeout ou erro inconclusivo.
    // A cobrança pode ter sido criada no gateway.

    if (
      error?.name === "TimeoutError" ||
      error?.name === "AbortError"
    ) {
      return res.status(504).json({
        success: false,
        pending: true,
        orderId,
        error: "Não foi possível confirmar a resposta do pagamento. Sua compra permanece em verificação. Tente novamente em instantes."
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
