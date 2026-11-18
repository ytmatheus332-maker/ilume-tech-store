
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

type Gateway = "mercadopago" | "bravopay" | "revantpay";

export default async function handler(req: any, res: any) {
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido.",
    });
  }

  if (!supabaseUrl || !serviceRoleKey || !publicKey) {
    console.error("Configurações do Supabase ausentes.");

    return res.status(500).json({
      error: "Configuração do servidor incompleta.",
    });
  }

  try {
    const authorization = req.headers.authorization;

    if (
      typeof authorization !== "string" ||
      !authorization.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        error: "Autenticação necessária.",
      });
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        error: "Token inválido.",
      });
    }

    const authClient = createClient(supabaseUrl, publicKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

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

    // 1. Validar o token diretamente no Supabase.
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        error: "Sessão inválida ou expirada.",
      });
    }

    // 2. Verificar a função do usuário no banco.
    const { data: role, error: roleError } = await adminClient
      .from("ilume_user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "owner")
      .maybeSingle();

    if (roleError) {
      console.error("Erro ao verificar autorização:", roleError);

      return res.status(500).json({
        error: "Não foi possível verificar as permissões.",
      });
    }

    if (!role) {
      return res.status(403).json({
        error: "Acesso restrito ao proprietário da ILUME.",
      });
    }

    // 3. Consultar a configuração atual.
    if (req.method === "GET") {
      const { data, error } = await adminClient
        .from("payment_settings")
        .select("id, active_gateway, updated_at, updated_by")
        .eq("id", 1)
        .single();

      if (error || !data) {
        console.error("Erro ao consultar gateway:", error);

        return res.status(500).json({
          error: "Não foi possível consultar o gateway ativo.",
        });
      }

      return res.status(200).json({
        success: true,
        settings: data,
      });
    }

    // 4. Validar a alteração solicitada.
    const gateway = req.body?.active_gateway as Gateway;

    if (
      gateway !== "mercadopago" &&
      gateway !== "bravopay" &&
      gateway !== "revantpay"
    ) {
      return res.status(400).json({
        error: "Gateway inválido.",
      });
    }

    if (gateway === "revantpay" && !process.env.REVANTPAY_API_KEY?.trim()) {
      return res.status(503).json({
        error: "A Revant Pay precisa ter a chave configurada no servidor antes da ativação.",
      });
    }

    // 5. Atualizar somente a configuração dos novos pedidos.
    const { data, error } = await adminClient
      .from("payment_settings")
      .update({
        active_gateway: gateway,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", 1)
      .select("id, active_gateway, updated_at, updated_by")
      .single();

    if (error || !data) {
      console.error("Erro ao atualizar gateway:", error);

      return res.status(500).json({
        error: "Não foi possível atualizar o gateway.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Gateway atualizado com sucesso.",
      settings: data,
    });
  } catch (error) {
    console.error("Erro na API de configuração:", error);

    return res.status(500).json({
      error: "Erro interno ao processar a configuração.",
    });
  }
}
