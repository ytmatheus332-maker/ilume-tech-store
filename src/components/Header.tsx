
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ShoppingBag,
  User,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";

import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";

import "./Header.css";

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  const { cart } = useCart();
  const { user } = useAuth();

  const cartCount =
    cart?.reduce(
      (acc, item) => acc + (item.quantity || 1),
      0
    ) || 0;

  const isAuthenticated = !!user;

  const closeMenu = () => {
    setMenuOpen(false);
  };

  return (
    <header className="site-header">
      <div className="header-container">

        {/* LOGO */}
        <Link
          to="/"
          className="header-logo"
          onClick={closeMenu}
        >
          <span className="logo-main">ILUME</span>
          <span className="logo-subtitle">TECH STORE</span>
        </Link>

        {/* NAVEGAÇÃO DESKTOP */}
        <nav className="desktop-nav">
          <Link to="/iphones">iPhones</Link>
          <Link to="/acessorios">Acessórios</Link>
          <Link to="/radar-tech">Radar Tech</Link>
        </nav>

        {/* AÇÕES */}
        <div className="header-actions">

          <Link
            to={isAuthenticated ? "/minha-conta" : "/login"}
            className="account-link"
            aria-label={isAuthenticated ? "Minha Conta" : "Entrar"}
          >
            <User size={19} strokeWidth={1.7} />
            <span>
              {isAuthenticated ? "Minha Conta" : "Entrar"}
            </span>
          </Link>

          <Link
            to="/carrinho"
            className="cart-link"
            aria-label={`Carrinho com ${cartCount} itens`}
          >
            <ShoppingBag size={21} strokeWidth={1.7} />

            {cartCount > 0 && (
              <span className="cart-count">
                {cartCount}
              </span>
            )}
          </Link>

          {/* BOTÃO MENU MOBILE */}
          <button
            type="button"
            className="mobile-menu-button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? (
              <X size={23} strokeWidth={1.7} />
            ) : (
              <Menu size={23} strokeWidth={1.7} />
            )}
          </button>

        </div>
      </div>

      {/* MENU MOBILE */}
      <div
        className={`mobile-menu ${menuOpen ? "mobile-menu-open" : ""}`}
      >
        <nav className="mobile-nav">

          <Link to="/iphones" onClick={closeMenu}>
            <span>iPhones</span>
            <ChevronRight size={18} />
          </Link>

          <Link to="/acessorios" onClick={closeMenu}>
            <span>Acessórios</span>
            <ChevronRight size={18} />
          </Link>

          <Link to="/radar-tech" onClick={closeMenu}>
            <span>Radar Tech</span>
            <ChevronRight size={18} />
          </Link>

          <div className="mobile-menu-divider" />

          <Link
            to={isAuthenticated ? "/minha-conta" : "/login"}
            onClick={closeMenu}
          >
            <span className="mobile-account">
              <User size={18} />
              {isAuthenticated ? "Minha Conta" : "Entrar"}
            </span>
            <ChevronRight size={18} />
          </Link>

        </nav>
      </div>
    </header>
  );
}
