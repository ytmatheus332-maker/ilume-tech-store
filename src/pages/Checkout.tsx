import { useState } from "react";
import { useCart } from "../context/CartContext";
import { Link } from "react-router-dom";
import { ShieldCheck, Truck, ArrowLeft, Lock } from "lucide-react";
import "./Checkout.css";

export default function Checkout() {
  const cartContext = useCart();
  const cart = cartContext?.cart || [];
  const clearCart = cartContext?.clearCart || (() => {});
  const total = cartContext?.total || 0;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value || 0);
  };

  async function handleFinishCheckout(e: React.FormEvent) {
    e.preventDefault();

    if (cart.length === 0) {
      alert("Seu carrinho está vazio.");
      return;
    }

    if (!name || !email) {
      alert("Por favor, preencha seu nome e e-mail.");
      return;
    }

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
          customer: { name, email, phone },
          items: itemsPayload,
          gateway: "mercadopago",
        }),
      });

      const responseText = await response.text();
      let data;
      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error("Erro na comunicação com o servidor.");
      }

      if (!response.ok) {
        throw new Error(data.error || "Falha ao iniciar o pagamento.");
      }

      if (data.paymentUrl) {
        clearCart();
        window.location.href = data.paymentUrl;
      } else {
        throw new Error("Link de pagamento não gerado.");
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
        <p style={{ margin: "1rem 0", color: "#666" }}>Adicione produtos para continuar.</p>
        <Link to="/" style={{ padding: "0.8rem 1.5rem", background: "#000", color: "#fff", textDecoration: "none", borderRadius: "6px" }}>Voltar para a Loja</Link>
      </main>
    );
  }

  return (
    <main style={{ padding: "4rem 2rem", maxWidth: "1000px", margin: "0 auto", fontFamily: "'Inter', sans-serif", color: "#171717" }}>
      <Link to="/carrinho" style={{ display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none", color: "#666", fontSize: "0.85rem", fontWeight: "500", marginBottom: "3rem" }}>
        <ArrowLeft size={14} /> Voltar para a sacola
      </Link>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "4rem", alignItems: "start" }}>
        <div style={{ background: "#fff", padding: "2.5rem", borderRadius: "12px", border: "1px solid #eaeaea" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#166534", marginBottom: "0.5rem" }}>
            <Lock size={14} /> <span style={{ fontSize: "0.75rem", letterSpacing: "1px", fontWeight: "700" }}>CHECKOUT SEGURO</span>
          </div>
          <h1 style={{ fontSize: "2rem", fontWeight: "700", marginBottom: "1.5rem" }}>Finalizar Pedido</h1>
          {error && <div style={{ background: "#fee2e2", color: "#991b1b", padding: "1rem", borderRadius: "6px", marginBottom: "1.5rem" }}>{error}</div>}
          
          <form onSubmit={handleFinishCheckout} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ fontSize: "0.8rem", fontWeight: "600" }}>Nome</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} style={{ width: "100%", padding: "0.8rem", borderRadius: "6px", border: "1px solid #ddd" }} required />
            </div>
            <div>
              <label style={{ fontSize: "0.8rem", fontWeight: "600" }}>E-mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: "100%", padding: "0.8rem", borderRadius: "6px", border: "1px solid #ddd" }} required />
            </div>
            <button type="submit" disabled={loading} style={{ padding: "1rem", background: "#000", color: "#fff", border: "none", borderRadius: "6px", fontWeight: "700", cursor: "pointer" }}>
              {loading ? "Processando..." : "Ir para o Pagamento"}
            </button>
          </form>
        </div>

        <div style={{ background: "#f8f9fa", padding: "2rem", borderRadius: "12px", border: "1px solid #eaeaea" }}>
          <h3>Resumo</h3>
          <div style={{ margin: "1.5rem 0", display: "flex", flexDirection: "column", gap: "1rem" }}>
            {cart.map((item: any, idx: number) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #eee", paddingBottom: "0.5rem" }}>
                <span>{item.name} x {item.quantity}</span>
                <strong>{formatCurrency(item.price * item.quantity)}</strong>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.2rem", fontWeight: "700", borderTop: "2px solid #ddd", paddingTop: "1rem" }}>
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>
      </div>
    </main>
  );
}