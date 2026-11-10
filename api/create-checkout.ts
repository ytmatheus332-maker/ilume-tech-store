import { createClient } from "@supabase/supabase-js";

// Inicializa Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export default async function handler(req: any, res: any) {
  // Garante que o erro sempre retorne JSON
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido." });
  }

  try {
    const { customer, items, gateway = "mercadopago" } = req.body;

    if (!customer || !items || items.length === 0) {
      return res.status(400).json({ error: "Dados do pedido incompletos." });
    }

    // 1. Validar preços no banco para evitar fraude
    let totalCents = 0;
    const itemsParaGateway = [];

    for (const item of items) {
      const { data: variant, error: vError } = await supabase
        .from("product_variants")
        .select("id, price_cents, products(name), color, storage_gb")
        .eq("id", item.variantId)
        .single();

      if (vError || !variant) {
        return res.status(400).json({ error: "Um dos produtos selecionados não está mais disponível." });
      }

      totalCents += variant.price_cents * item.quantity;
      itemsParaGateway.push({
        title: `${(variant.products as any).name} - ${variant.color} (${variant.storage_gb}GB)`,
        quantity: item.quantity,
        unit_price: variant.price_cents / 100
      });
    }

    // 2. Criar Pedido no Supabase
    const { data: order, error: oError } = await supabase
      .from("orders")
      .insert([{
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
        total_amount_cents: totalCents,
        status: "pending",
        gateway
      }])
      .select()
      .single();

    if (oError || !order) {
      throw new Error("Não foi possível registrar o pedido no banco de dados.");
    }

    // 3. Gerar Link no Mercado Pago
    const mpToken = process.env.MP_ACCESS_TOKEN;

    if (!mpToken) {
      return res.status(500).json({ 
        error: "Configuração do Mercado Pago ausente. Adicione o MP_ACCESS_TOKEN nas variáveis de ambiente." 
      });
    }

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mpToken}`
      },
      body: JSON.stringify({
        items: itemsParaGateway.map(i => ({
          title: i.title,
          quantity: i.quantity,
          unit_price: i.unit_price,
          currency_id: "BRL"
        })),
        external_reference: order.id,
        back_urls: {
          success: `${process.env.STORE_URL}/checkout/sucesso`,
          failure: `${process.env.STORE_URL}/checkout/falha`,
        },
        auto_return: "approved"
      })
    });

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      throw new Error(mpData.message || "Erro ao gerar preferência no Mercado Pago.");
    }

    // Atualiza pedido com o ID do gateway
    await supabase.from("orders").update({ preference_id: mpData.id }).eq("id", order.id);

    return res.status(200).json({ 
      success: true, 
      paymentUrl: mpData.init_point 
    });

  } catch (err: any) {
    console.error("Erro na API de Checkout:", err.message);
    return res.status(500).json({ error: err.message || "Erro interno no servidor." });
  }
}