
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "";

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const publicKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "";

type ShipmentStatus =
  | "awaiting_confirmation"
  | "preparing"
  | "shipped"
  | "in_transit"
  | "delivered"
  | "cancelled";

const allowedStatuses: ShipmentStatus[] = [
  "awaiting_confirmation",
  "preparing",
  "shipped",
  "in_transit",
  "delivered",
  "cancelled",
];

function isValidUUID(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function optionalText(
  value: unknown,
  maxLength: number
): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  if (normalized.length > maxLength) {
    return undefined;
  }

  return normalized || null;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({
      success: false,
      error: "Método não permitido.",
    });
  }

  if (!supabaseUrl || !serviceRoleKey || !publicKey) {
    console.error("[Shipments API] Configuração do Supabase ausente.");

    return res.status(500).json({
      success: false,
      error: "Configuração do servidor incompleta.",
    });
  }

  const authorization = req.headers.authorization || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);

  if (!tokenMatch) {
    return res.status(401).json({
      success: false,
      error: "Autenticação necessária.",
    });
  }

  const token = tokenMatch[1];

  try {
    const authClient = createClient(
      supabaseUrl,
      publicKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    // 1. Validar o usuário pelo token da sessão.
    const {
      data: authData,
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !authData.user) {
      return res.status(401).json({
        success: false,
        error: "Sessão inválida ou expirada.",
      });
    }

    const user = authData.user;

    // 2. Confirmar a autorização owner no banco.
    const {
      data: roleData,
      error: roleError,
    } = await adminClient
      .from("ilume_user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .maybeSingle();

    if (roleError) {
      console.error(
        "[Shipments API] Erro ao verificar permissão:",
        roleError.message
      );

      return res.status(500).json({
        success: false,
        error: "Não foi possível verificar as permissões.",
      });
    }

    if (!roleData) {
      return res.status(403).json({
        success: false,
        error: "Acesso restrito ao proprietário da loja.",
      });
    }

    // 3. Identificar o pedido.
    const orderId =
      req.method === "GET"
        ? req.query?.orderId
        : req.body?.order_id;

    if (!isValidUUID(orderId)) {
      return res.status(400).json({
        success: false,
        error: "ID do pedido inválido.",
      });
    }

    const {
      data: order,
      error: orderError,
    } = await adminClient
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      console.error(
        "[Shipments API] Erro ao consultar pedido:",
        orderError.message
      );

      return res.status(500).json({
        success: false,
        error: "Não foi possível consultar o pedido.",
      });
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Pedido não encontrado.",
      });
    }

    // 4. GET: consultar envio e histórico.
    if (req.method === "GET") {
      const {
        data: shipment,
        error: shipmentError,
      } = await adminClient
        .from("shipments")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle();

      if (shipmentError) {
        console.error(
          "[Shipments API] Erro ao consultar envio:",
          shipmentError.message
        );

        return res.status(500).json({
          success: false,
          error: "Não foi possível consultar os dados logísticos.",
        });
      }

      let events: any[] = [];

      if (shipment) {
        const {
          data: eventData,
          error: eventsError,
        } = await adminClient
          .from("shipment_events")
          .select(
            "id, shipment_id, status, description, created_by, created_at"
          )
          .eq("shipment_id", shipment.id)
          .order("created_at", { ascending: true });

        if (eventsError) {
          console.error(
            "[Shipments API] Erro ao consultar histórico:",
            eventsError.message
          );

          return res.status(500).json({
            success: false,
            error: "Não foi possível consultar o histórico do envio.",
          });
        }

        events = eventData || [];
      }

      return res.status(200).json({
        success: true,
        shipment: shipment || null,
        events,
      });
    }

    // 5. POST: atualizar o envio.
    const body = req.body || {};

    const status = body.status;

    if (
      typeof status !== "string" ||
      !allowedStatuses.includes(status as ShipmentStatus)
    ) {
      return res.status(400).json({
        success: false,
        error: "Status logístico inválido.",
      });
    }

    // Somente pedidos efetivamente pagos podem ser enviados.
    const paymentStatus = String(order.status || "").toLowerCase();

    if (!["approved", "paid"].includes(paymentStatus)) {
      return res.status(409).json({
        success: false,
        error: "Não é permitido atualizar o envio de um pedido não pago.",
      });
    }

    const carrier = optionalText(body.carrier, 120);
    const trackingCode = optionalText(body.tracking_code, 120);
    const trackingUrl = optionalText(body.tracking_url, 1000);
    const notes = optionalText(body.notes, 2000);
    const description = optionalText(body.description, 500);

    if (
      carrier === undefined ||
      trackingCode === undefined ||
      trackingUrl === undefined ||
      notes === undefined ||
      description === undefined
    ) {
      return res.status(400).json({
        success: false,
        error: "Um ou mais campos possuem formato ou tamanho inválido.",
      });
    }

    if (trackingUrl) {
      try {
        const parsedUrl = new URL(trackingUrl);

        if (
          parsedUrl.protocol !== "https:" &&
          parsedUrl.protocol !== "http:"
        ) {
          throw new Error("Protocolo inválido.");
        }
      } catch {
        return res.status(400).json({
          success: false,
          error: "O link de rastreamento é inválido.",
        });
      }
    }

    // 6. Executar a RPC protegida.
    // O usuário responsável vem da sessão validada,
    // nunca de um valor enviado pelo navegador.
    const {
      data: rpcData,
      error: rpcError,
    } = await adminClient.rpc("ilume_update_shipment_status", {
      p_order_id: orderId,
      p_status: status,
      p_description: description,
      p_carrier: carrier,
      p_tracking_code: trackingCode,
      p_tracking_url: trackingUrl,
      p_notes: notes,
      p_created_by: user.id,
    });

    if (rpcError) {
      console.error(
        "[Shipments API] Erro na RPC:",
        rpcError.message
      );

      return res.status(500).json({
        success: false,
        error: "Não foi possível atualizar o envio.",
      });
    }

    return res.status(200).json({
      success: true,
      result: rpcData,
    });
  } catch (error) {
    console.error("[Shipments API] Erro inesperado:", error);

    return res.status(500).json({
      success: false,
      error: "Erro interno ao processar a solicitação.",
    });
  }
}
