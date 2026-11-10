import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";

interface AdminGuardProps {
  children: ReactNode;
}

/**
 * AdminGuard - Protege rotas administrativas.
 * Verifica se o usuário está autenticado e se possui a role 'owner' ou 'admin'
 * na tabela public.ilume_user_roles.
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function checkAdminStatus() {
      // Se ainda estiver carregando a autenticação básica, aguarda.
      if (authLoading) return;

      // Se não houver usuário logado, nega acesso imediatamente.
      if (!user) {
        if (active) {
          setIsAdmin(false);
          setLoading(false);
        }
        return;
      }

      try {
        // Consulta a role do usuário na tabela de permissões.
        const { data, error } = await supabase
          .from("ilume_user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("[AdminGuard] Erro na consulta de role:", error.message);
          if (active) setIsAdmin(false);
        } else if (data) {
          // Valida se a role é permitida (owner ou admin).
          const hasPermission = data.role === "owner" || data.role === "admin";
          if (active) setIsAdmin(hasPermission);
        } else {
          // Usuário logado mas sem registro na tabela de roles.
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

    // Cleanup para evitar atualização de estado em componente desmontado.
    return () => {
      active = false;
    };
  }, [user, authLoading]);

  // 1. Estado de Carregamento (Auth ou Verificação de Role)
  if (authLoading || loading) {
    return (
      <main className="featured" style={{ padding: "100px 20px", textAlign: "center" }}>
        <span style={{ letterSpacing: "2px", color: "#666" }}>ILUME CENTRAL</span>
        <h2 style={{ marginTop: "10px" }}>Verificando permissões...</h2>
        <p style={{ color: "#888", marginTop: "10px" }}>Aguarde enquanto validamos seu acesso administrativo.</p>
      </main>
    );
  }

  // 2. Se não estiver logado, manda para o Login.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 3. Se estiver logado mas NÃO for admin/owner, manda para a Home.
  if (isAdmin === false) {
    console.warn("[AdminGuard] Acesso negado para o usuário:", user.email);
    return <Navigate to="/" replace />;
  }

  // 4. Acesso autorizado.
  return <>{children}</>;
}