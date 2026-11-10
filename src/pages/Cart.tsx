import { useCart } from "../context/CartContext";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, ArrowLeft, ShoppingBag } from "lucide-react";
import "./Cart.css";

export default function Cart() {
  let cartData;
  try {
    cartData = useCart();
  } catch (err) {
    return (
      <main style={{ padding: "6rem 2rem", textAlign: "center", fontFamily: "'Inter', sans-serif" }}>
        <h2>Erro ao carregar o carrinho.</h2>
        <Link to="/" style={{ color: "#000", fontWeight: "600", textDecoration: "underline" }}>Voltar para a Loja</Link>
      </main>
    );
  }

  const { cart = [], removeFromCart = () => {}, total = 0 } = cartData;
  const navigate = useNavigate();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
  };

  if (cart.length === 0) {
    return (
      <main className="cart-page empty" style={{ padding: "8rem 2rem", textAlign: "center", fontFamily: "'Inter', sans-serif" }}>
        <div style={{ maxWidth: "400px", margin: "0 auto" }}>
          <ShoppingBag size={40} strokeWidth={1.2} style={{ marginBottom: "1.5rem", color: "#888" }} />
          <h2 style={{ fontSize: "1.8rem", fontWeight: "600", marginBottom: "0.5rem", letterSpacing: "-0.5px" }}>Sua sacola está vazia.</h2>
          <p style={{ color: "#666", fontSize: "0.95rem", marginBottom: "2rem" }}>Explore nossa curadoria de tecnologia e encontre o essencial.</p>
          <Link to="/" style={{ display: "inline-block", padding: "0.9rem 2rem", background: "#171717", color: "#fff", borderRadius: "4px", textDecoration: "none", fontSize: "0.9rem", fontWeight: "500", transition: "background 0.2s" }}>
            Explorar Produtos
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: "4rem 2rem", maxWidth: "800px", margin: "0 auto", fontFamily: "'Inter', sans-serif", color: "#171717" }}>
      <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none", color: "#666", fontSize: "0.85rem", fontWeight: "500", marginBottom: "3rem" }}>
        <ArrowLeft size={14} /> Continuar comprando
      </Link>

      <div style={{ borderBottom: "1px solid #eaeaea", paddingBottom: "1.5rem", marginBottom: "2rem" }}>
        <span style={{ fontSize: "0.75rem", letterSpacing: "1.5px", color: "#888", textTransform: "uppercase" }}>Sua Seleção</span>
        <h1 style={{ fontSize: "2.2rem", fontWeight: "700", letterSpacing: "-1px", marginTop: "0.2rem" }}>Sacola de Compras</h1>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginBottom: "3rem" }}>
        {cart.map((item) => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1.5rem", background: "#fafafa", borderRadius: "8px", border: "1px solid #f0f0f0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
              {/* Miniatura da Imagem */}
              <div style={{ width: "70px", height: "70px", background: "#fff", borderRadius: "6px", border: "1px solid #e5e5e5", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                <img 
                  src={item.image || "/images/product-placeholder.png"} 
                  alt={item.name} 
                  style={{ width: "100%", height: "100%", objectFit: "contain", padding: "4px" }}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "/images/product-placeholder.png";
                  }}
                />
              </div>
              <div>
                <h3 style={{ fontSize: "1rem", fontWeight: "600", marginBottom: "4px", letterSpacing: "-0.3px" }}>{item.name}</h3>
                <p style={{ fontSize: "0.8rem", color: "#666" }}>Versão: {item.color || "Padrão"} • {item.storage || 128}GB</p>
                <span style={{ fontSize: "0.8rem", color: "#888", display: "inline-block", marginTop: "4px" }}>Qtd: {item.quantity}</span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
              <strong style={{ fontSize: "1rem", fontWeight: "600" }}>{formatCurrency(item.price * item.quantity)}</strong>
              <button 
                onClick={() => removeFromCart(item.id)} 
                style={{ background: "none", border: "none", color: "#999", cursor: "pointer", padding: "6px", transition: "color 0.2s" }}
                title="Remover item"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* RODAPÉ DO CARRINHO / CHECKOUT */}
      <div style={{ background: "#171717", color: "#fff", padding: "2rem", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span style={{ fontSize: "0.75rem", letterSpacing: "1px", color: "#999", textTransform: "uppercase" }}>Total do Pedido</span>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", letterSpacing: "-0.5px", marginTop: "0.2rem" }}>{formatCurrency(total)}</div>
        </div>
        <button 
          onClick={() => navigate("/checkout")}
          style={{ padding: "1rem 2.5rem", background: "#fff", color: "#171717", border: "none", borderRadius: "4px", fontWeight: "600", fontSize: "0.9rem", cursor: "pointer", transition: "opacity 0.2s" }}
        >
          Avançar para o Checkout
        </button>
      </div>
    </main>
  );
}