
import { useState } from "react";
import { NavLink, Link, useNavigate } from "react-router-dom";
import {
  Search,
  ShoppingBag,
  Menu,
  X,
  UserRound,
} from "lucide-react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import "./Header.css";

const navigationLinks = [
  { label: "Início", href: "/" },
  { label: "iPhones", href: "/iphones" },
  { label: "Acessórios", href: "/acessorios" },
  { label: "Radar Tech", href: "/radar-tech" },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  const { totalItems } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="header">
      <div className="header-container">
        <Link
          to="/"
          className="logo"
          onClick={closeMenu}
          aria-label="ILUME - Página inicial"
        >
          ILUME
        </Link>

        <nav
          className={`navigation ${menuOpen ? "navigation-open" : ""}`}
          id="main-navigation"
          aria-label="Navegação principal"
        >
          {navigationLinks.map((link) => (
            <NavLink
              key={link.href}
              to={link.href}
              end={link.href === "/"}
              onClick={closeMenu}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className="search-button"
            aria-label="Busca em desenvolvimento"
            title="Busca em desenvolvimento"
            disabled
          >
            <Search size={20} />
          </button>

          <button
            type="button"
            aria-label={user ? "Minha conta" : "Entrar na conta"}
            onClick={() =>
              navigate(user ? "/minha-conta" : "/login")
            }
          >
            <UserRound size={20} />
          </button>

          <button
            type="button"
            className="header-cart-button"
            aria-label={`Carrinho com ${totalItems} itens`}
            onClick={() => navigate("/carrinho")}
          >
            <ShoppingBag size={20} />

            {totalItems > 0 && (
              <span className="cart-count">
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </button>

          <button
            type="button"
            className="mobile-menu"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            aria-controls="main-navigation"
            onClick={() => setMenuOpen((current) => !current)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
    </header>
  );
}
