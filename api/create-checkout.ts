

import { createClient } from "@supabase/supabase-js";

const BRAVOPAY_URL = "https://bravopay.club/api/v1";
const DEFAULT_STORE_URL = "https://ilume-tech-store.vercel.app";
const REQUEST_TIMEOUT_MS = 15000;

type Gateway = "mercadopago" | "bravopay";

interface CheckoutItem {
  variantId: string;
  quantity: number;
}

interface Customer {
  name: string;
  email: string;
  phone?: string;
  cpf?: string;
}

function normalizeDigits(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function isValidCPF(value: string): boolean {
  const cpf = normalizeDigits(value);

  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }

  const calculateDigit = (base: string, factor: number): number => {
    let total = 0;

    for (const digit of base) {
      total += Number(digit) * factor--;
    }

    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const firstDigit = calculateDigit(cpf.slice(0, 9), 10);
  const secondDigit = calculateDigit(cpf.slice(0, 10), 11);

  return (
    firstDigit === Number(cpf[9]) &&
    secondDigit === Number(cpf[10])
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
    .eq("id", orderId);

  if (error) {
    console.error(
      "CHECKOUT: Não foi possível atualizar o pedido para failed.",
      error
    );
  }
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
    // 1. Consultar gateway ativo

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("payment_settings")
        .select("active_gateway")
        .eq("id", 1)
        .single();

      if (error || !data) {
        console.error("CHECKOUT: Erro ao consultar gateway.", error);

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

    // 2. Validar dados recebidos

    const { customer, items } = req.body || {};

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

    // 3. Identificar gateway diretamente no banco

    const { data: paymentSettings, error: settingsError } =
      await supabase
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

    const activeGateway = paymentSettings.active_gateway as Gateway;

    if (!["mercadopago", "bravopay"].includes(activeGateway)) {
      return res.status(500).json({
        error: "Gateway de pagamento inválido."
      });
    }

    // 4. Validar informações específicas do gateway

    if (activeGateway === "bravopay") {
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
      activeGateway === "mercadopago" &&
      !process.env.MP_ACCESS_TOKEN
    ) {
      console.error("CHECKOUT: MP_ACCESS_TOKEN ausente.");

      return res.status(500).json({
        error: "A configuração do Mercado Pago está incompleta."
      });
    }

    // 5. Validar e consolidar itens do carrinho

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

      const accumulated = (quantities.get(variantId) || 0) + quantity;

      if (accumulated > 10) {
        return res.status(400).json({
          error: "A quantidade máxima por variante é 10."
        });
      }

      quantities.set(variantId, accumulated);
    }

    const validatedItems: Array<{
      variantId: string;
      quantity: number;
      priceCents: number;
      title: string;
    }> = [];

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

      const title = `${productName} - ${
        variant.color || "Padrão"
      } (${storage})`;

      validatedItems.push({
        variantId,
        quantity,
        priceCents,
        title
      });
    }

    // 6. Criar pedido principal

    const { data: order, error: orderError } =
      await supabase
        .from("orders")
        .insert([{
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone || null,
          total_amount_cents: totalCents,
          status: "pending",
          gateway: activeGateway
        }])
        .select()
        .single();

    if (orderError || !order) {
      console.error(
        "CHECKOUT: Erro ao registrar pedido.",
        orderError
      );

      return res.status(500).json({
        error: "Não foi possível registrar seu pedido."
      });
    }

    orderId = order.id;

    // 7. Registrar os produtos em order_items

    const orderItems = validatedItems.map((item) => ({
      order_id: order.id,
      product_variant_id: item.variantId,
      quantity: item.quantity,
      unit_price_cents: item.priceCents
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      console.error(
        "CHECKOUT: Erro ao registrar itens do pedido.",
        itemsError
      );

      await markOrderFailed(supabase, order.id);

      return res.status(500).json({
        error: "Não foi possível registrar os produtos do pedido."
      });
    }

    const storeUrl = (
      process.env.STORE_URL || DEFAULT_STORE_URL
    ).replace(/\/$/, "");

    // 8. Fluxo Mercado Pago

    if (activeGateway === "mercadopago") {
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

        await markOrderFailed(supabase, order.id);

        return res.status(502).json({
          error: "Não foi possível iniciar o pagamento no Mercado Pago."
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

        await markOrderFailed(supabase, order.id);

        return res.status(500).json({
          error: "Não foi possível finalizar a preparação do pagamento."
        });
      }

      return res.status(200).json({
        success: true,
        gateway: "mercadopago",
        orderId: order.id,
        paymentUrl: mpData.init_point
      });
    }

    // 9. Fluxo BravoPay — criação da cobrança PIX

    const bravoResponse = await fetch(
      `${BRAVOPAY_URL}/transactions`,
      {
        method: "POST",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.BRAVOPAY_API_KEY}`
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

    if (
      !bravoResponse.ok ||
      !bravoData?.id ||
      !bravoData?.pix?.copy_paste ||
      !Number.isSafeInteger(returnedAmount) ||
      returnedAmount !== totalCents
    ) {
      console.error(
        "CHECKOUT: Resposta inválida da BravoPay.",
        bravoData
      );

      await markOrderFailed(supabase, order.id);

      return res.status(502).json({
        error: "Não foi possível validar a cobrança PIX."
      });
    }

    // 10. Salvar identificador da transação

    const transactionId = String(bravoData.id);

    const { error: transactionError } = await supabase
      .from("orders")
      .update({
        gateway_payment_id: transactionId
      })
      .eq("id", order.id);

    if (transactionError) {
      console.error(
        "CHECKOUT: Erro ao salvar transação BravoPay.",
        transactionError
      );

      await markOrderFailed(supabase, order.id);

      return res.status(500).json({
        error: "Não foi possível vincular o pagamento ao pedido."
      });
    }

    // 11. Retornar informações PIX

    return res.status(200).json({
      success: true,
      gateway: "bravopay",
      orderId: order.id,
      transactionId,
      payment: {
        method: "PIX",
        status: bravoData.status,
        amountCents: returnedAmount,
        copyPaste: bravoData.pix.copy_paste,
        expiresAt: bravoData.pix.expires_at || null
      }
    });

  } catch (error: any) {
    console.error(
      "CHECKOUT: Erro inesperado.",
      error
    );

    if (orderId) {
      await markOrderFailed(supabase, orderId);
    }

    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return res.status(504).json({
        error: "O serviço de pagamento demorou para responder. Tente novamente."
      });
    }

    return res.status(500).json({
      error: "Ocorreu um erro ao processar seu pedido."
    });
  }
}
