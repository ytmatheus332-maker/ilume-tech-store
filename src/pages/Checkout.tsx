import { useState } from "react";
import { useCart } from "../context/CartContext";
import { Link } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import "./Checkout.css";

export default function Checkout() {
  const cartContext = useCart();
  const cart = cartContext?.cart || [];
  const clearCart = cartContext?.clearCart || (() => {});

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFinishCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) return alert("Seu carrinho está vazio.");
    if (!name || !email) return alert("Preencha nome e e-mail.");

    try {
      setLoading(true);
      setError(null);
      const itemsPayload = cart.map((item: any) => ({
        variantId: item.variantId || item.id,
        quantity: item.quantity || 1,
      }));

      const response = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name, email },
          items: itemsPayload,
          gateway: "mercadopago",
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao iniciar pagamento.");

      if (data.paymentUrl) {
        clearCart();
        window.location.href = data.paymentUrl;
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  if (cart.length === 0) {
    return (
      <main style={{ padding: "8rem 2rem", textAlign: "center", fontFamily: "'Inter', sans-serif" }}>
        <h2>Sua sacola está vazia.</h2>
        <Link to="/" style={{ padding: "0.8rem 1.5rem", background: "#000", color: "#fff", textDecoration: "none", borderRadius: "6px" }}>Voltar para a Loja</Link>
      </main>
    );
  }

  return (
    <main style={{ padding: "4rem 2rem", maxWidth: "1000px", margin: "0 auto", fontFamily: "'Inter', sans-serif", color: "#171717" }}>
      <Link to="/carrinho" style={{ display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none", color: "#666", fontSize: "0.85rem", marginBottom: "3rem" }}>
        <ArrowLeft size={14} /> Voltar para a sacola
      </Link>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "4rem" }}>
        <div style={{ background: "#fff", padding: "2.5rem", borderRadius: "12px", border: "1px solid #eaeaea" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#166534", marginBottom: "0.5rem" }}><Lock size={14} /> <span style={{ fontSize: "0.75rem", fontWeight: "700" }}>CHECKOUT SEGURO</span></div>
          <h1 style={{ fontSize: "2rem", marginBottom: "1.5rem" }}>Finalizar Pedido</h1>
          {error && <div style={{ background: "#fee2e2", color: "#991b1b", padding: "1rem", borderRadius: "6px", marginBottom: "1rem" }}>{error}</div>}
          <form onSubmit={handleFinishCheckout} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <input type="text" placeholder="Nome Completo" value={name} onChange={e => setName(e.target.value)} style={{ padding: "0.9rem", border: "1px solid #ddd", borderRadius: "6px" }} required />
            <input type="email" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} style={{ padding: "0.9rem", border: "1px solid #ddd", borderRadius: "6px" }} required />
            <button type="submit" disabled={loading} style={{ padding: "1rem", background: "#000", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "700", cursor: "pointer" }}>
              {loading ? "Processando..." : "Ir para o Pagamento"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}