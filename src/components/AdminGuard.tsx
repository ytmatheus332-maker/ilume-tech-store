
import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

interface AdminGuardProps {
  children: ReactNode;
}

/**
 * AdminGuard - Protege rotas administrativas.
 * Somente usuários com a role 'owner' podem acessar o painel.
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const { user, loading: authLoading } = useAuth();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkAdminStatus() {
      if (authLoading) return;

      if (!user) {
        if (active) {
          setIsAdmin(false);
          setLoading(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from("ilume_user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error(
            "[AdminGuard] Erro na consulta de role:",
            error.message
          );

          if (active) setIsAdmin(false);
        } else if (data) {
          const hasPermission = data.role === "owner";

          if (active) setIsAdmin(hasPermission);
        } else {
          if (active) setIsAdmin(false);
        }
      } catch (err) {
        console.error("[AdminGuard] Erro inesperado:", err);

        if (active) setIsAdmin(false);
      } finally {
        if (active) setLoading(false);
      }
    }

    checkAdminStatus();

    return () => {
      active = false;
    };
  }, [user, authLoading]);

  if (authLoading || loading) {
    return (
      <main
        className="featured"
        style={{
          padding: "100px 20px",
          textAlign: "center",
        }}
      >
        <span style={{ letterSpacing: "2px", color: "#666" }}>
          ILUME CENTRAL
        </span>

        <h2 style={{ marginTop: "10px" }}>
          Verificando permissões...
        </h2>

        <p style={{ color: "#888", marginTop: "10px" }}>
          Aguarde enquanto validamos seu acesso administrativo.
        </p>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (isAdmin === false) {
    console.warn(
      "[AdminGuard] Acesso negado para o usuário:",
      user.email
    );

    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
