import { Link } from "react-router-dom";
import { ShoppingBag, User } from "lucide-react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import "./Header.css";

export default function Header() {
  let cartCount = 0;
  try {
    const cartContext = useCart();
    cartCount = cartContext?.cart?.reduce((acc, item) => acc + (item.quantity || 1), 0) || 0;
  } catch (err) {
    cartCount = 0;
  }

  // Verifica se o usuário está logado
  let isAuthenticated = false;
  try {
    const auth = useAuth();
    isAuthenticated = !!auth?.user;
  } catch (err) {
    isAuthenticated = false;
  }

  return (
    <header style={{ borderBottom: "1px solid #eaeaea", background: "#fff", position: "sticky", top: 0, zIndex: 100, fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1.2rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        
        {/* LOGO */}
        <Link to="/" style={{ textDecoration: "none", color: "#171717", display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontWeight: "800", fontSize: "1.1rem", letterSpacing: "-0.5px" }}>ILUME</span>
          <span style={{ fontWeight: "400", fontSize: "1.1rem", color: "#666", letterSpacing: "-0.5px" }}>TECH STORE</span>
        </Link>

        {/* NAVEGAÇÃO CENTRAL */}
        <nav style={{ display: "flex", gap: "2.5rem", alignItems: "center" }}>
          <Link to="/iphones" style={{ textDecoration: "none", color: "#444", fontSize: "0.9rem", fontWeight: "500" }}>iPhones</Link>
          <Link to="/acessorios" style={{ textDecoration: "none", color: "#444", fontSize: "0.9rem", fontWeight: "500" }}>Acessórios</Link>
          <Link to="/radar-tech" style={{ textDecoration: "none", color: "#444", fontSize: "0.9rem", fontWeight: "500" }}>Radar Tech</Link>
        </nav>

        {/* AÇÕES (CONTA E CARRINHO) */}
        <div style={{ display: "flex", alignItems: "center", gap: "1.2rem" }}>
          {/* Botão de Login / Minha Conta */}
          <Link 
            to={isAuthenticated ? "/minha-conta" : "/login"} 
            style={{ textDecoration: "none", color: "#171717", display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", fontWeight: "500", padding: "6px 10px", borderRadius: "4px", background: "#f8f9fa", border: "1px solid #eee" }}
          >
            <User size={16} />
            <span>{isAuthenticated ? "Minha Conta" : "Entrar"}</span>
          </Link>

          {/* Botão de Carrinho */}
          <Link to="/carrinho" style={{ textDecoration: "none", color: "#171717", position: "relative", display: "flex", alignItems: "center", padding: "8px" }} aria-label="Carrinho">
            <ShoppingBag size={20} strokeWidth={1.7} />
            {cartCount > 0 && (
              <span style={{ position: "absolute", top: "0", right: "0", background: "#171717", color: "#fff", fontSize: "0.65rem", fontWeight: "700", width: "16px", height: "16px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {cartCount}
              </span>
            )}
          </Link>
        </div>

      </div>
    </header>
  );
}