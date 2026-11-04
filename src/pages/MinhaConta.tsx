
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./MinhaConta.css";

export default function MinhaConta() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { replace: true });
    }
  }, [loading, user, navigate]);

  async function handleSignOut() {
    try {
      await signOut();
      navigate("/login");
    } catch (error) {
      console.error("Erro ao sair da conta:", error);
      alert("Não foi possível sair da conta. Tente novamente.");
    }
  }

  if (loading || !user) {
    return (
      <main className="account-page">
        <p>Carregando sua conta...</p>
      </main>
    );
  }

  const name =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    "Cliente ILUME";

  return (
    <main className="account-page">
      <section className="account-card">
        <span className="account-eyebrow">ILUME TECH STORE</span>

        <h1>Minha conta.</h1>

        <p className="account-description">
          Bem-vindo à sua área pessoal.
        </p>

        <div className="account-info">
          <div>
            <span>Nome</span>
            <strong>{name}</strong>
          </div>

          <div>
            <span>E-mail</span>
            <strong>{user.email}</strong>
          </div>
        </div>

        <button
          type="button"
          className="account-shop-button"
          onClick={() => navigate("/")}
        >
          Continuar comprando
        </button>

        <button
          type="button"
          className="account-logout-button"
          onClick={handleSignOut}
        >
          Sair da conta
        </button>
      </section>
    </main>
  );
}
