import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return.status(405).json({ error: "Método não permitido." });
  }

  try {
    const body = req.body;

    // O Mercado Pago envia notificações de diferentes tipos (payment, plan, subscription, etc.)
    if (body.type === "payment" || body.action === "payment.created" || body.action === "payment.updated") {
      const paymentId = body.data?.id || body.id;

      if (!paymentId) {
        return.status(400).json({ error: "ID de pagamento não encontrado." });
      }

      const mpAccessToken = process.env.MP_ACCESS_TOKEN;

      // 1. Consulta os detalhes do pagamento diretamente na API do Mercado Pago por segurança
      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${mpAccessToken}`,
        },
      });

      if (!mpResponse.ok) {
        throw new Error("Falha ao consultar pagamento no Mercado Pago.");
      }

      const paymentData = await mpResponse.json();

      // O external_reference que definimos ao criar a preferência é o ID do nosso pedido no Supabase
      const orderId = paymentData.external_reference;
      const status = paymentData.status; // ex: 'approved', 'pending', 'rejected'

      if (orderId) {
        // 2. Mapeia o status do Mercado Pago para o padrão da ILUME
        let mappedStatus = "pending";
        if (status === "approved") mappedStatus = "approved";
        if (status === "rejected" || status === "cancelled") mappedStatus = "rejected";

        // 3. Atualiza o pedido no Supabase
        await supabase
          .from("orders")
          .update({
            status: mappedStatus,
            gateway_payment_id: String(paymentId),
          })
          .eq("id", orderId);
      }
    }

    // Sempre responda 200 OK rapidamente para o Mercado Pago não reenviar a notificação em looping
    return.status(200).json({ received: true });
  } catch (err: any) {
    console.error("Erro no Webhook do Mercado Pago:", err);
    // Retornamos 200 mesmo com erro interno para evitar bloqueio de fila no MP, mas logamos o erro
    return.status(200).json({ error: err.message });
  }
}