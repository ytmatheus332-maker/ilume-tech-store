import { createClient } from "@supabase/supabase-js";

// Inicializa Supabase com as variáveis de ambiente do servidor
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: any, res: any) {
  // Garante cabeçalho JSON para evitar "Unexpected end of JSON"
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido." });
  }

  try {
    const { customer, items, gateway = "mercadopago" } = req.body;

    if (!customer || !items || items.length === 0) {
      return res.status(400).json({ error: "Dados do pedido incompletos." });
    }

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Erro de configuração no servidor: Credenciais do Supabase ausentes." });
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
        return res.status(400).json({ error: `Produto indisponível ou inválido: ${item.variantId}` });
      }

      totalCents += variant.price_cents * item.quantity;
      itemsParaGateway.push({
        title: `${(variant.products as any)?.name || "Produto"} - ${variant.color || "Padrão"} (${variant.storage_gb || 128}GB)`,
        quantity: item.quantity,
        unit_price: variant.price_cents / 100
      });
    }

    // 2. Criar Pedido no Supabase (Tratando telefone opcional para evitar erro)
    const { data: order, error: oError } = await supabase
      .from("orders")
      .insert([{
        customer_name: customer.name || "Cliente ILUME",
        customer_email: customer.email,
        customer_phone: customer.phone || "",
        total_amount_cents: totalCents,
        status: "pending",
        gateway
      }])
      .select()
      .single();

    if (oError || !order) {
      console.error("Erro detalhado do Supabase ao criar pedido:", oError);
      return res.status(500).json({ 
        error: `Erro ao registrar pedido no banco: ${oError?.message || "Erro desconhecido"}` 
      });
    }

    // 3. Gerar Link no Mercado Pago
    const mpToken = process.env.MP_ACCESS_TOKEN;

    if (!mpToken) {
      return res.status(500).json({ 
        error: "Configuração do Mercado Pago ausente. Adicione o MP_ACCESS_TOKEN nas variáveis de ambiente da Vercel." 
      });
    }

    const storeUrl = process.env.STORE_URL || "https://ilume-tech-store.vercel.app";

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
          success: `${storeUrl}/checkout/sucesso`,
          failure: `${storeUrl}/checkout/falha`,
        },
        auto_return: "approved"
      })
    });

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error("Erro retornado pela API do Mercado Pago:", mpData);
      throw new Error(mpData.message || "Erro ao gerar preferência no Mercado Pago.");
    }

    // Atualiza pedido com o ID da preferência do gateway
    await supabase.from("orders").update({ preference_id: mpData.id }).eq("id", order.id);

    return res.status(200).json({ 
      success: true, 
      paymentUrl: mpData.init_point 
    });

  } catch (err: any) {
    console.error("Erro crítico na API de Checkout:", err);
    return res.status(500).json({ error: err.message || "Erro interno no servidor." });
  }
}