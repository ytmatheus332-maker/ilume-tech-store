import { useEffect, useState } from "react";
import { useCart } from "../context/CartContext";
import { Link, useNavigate } from "react-router-dom";
import { Trash2, ArrowLeft, ShoppingBag } from "lucide-react";
import { getPublishedProducts } from "../services/catalog";
import {
  formatStorageCapacity,
  getVariantDetailsWithoutStorage,
  isIPhoneProduct,
} from "../utils/productPresentation";
import "./Cart.css";

interface CartVariantPresentation {
  details: string;
  storageGb: number | null;
}

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
  const [variantPresentation, setVariantPresentation] = useState<
    Map<string, CartVariantPresentation>
  >(() => new Map());
  const hasCartItems = cart.length > 0;

  useEffect(() => {
    if (!hasCartItems) return undefined;

    let active = true;

    getPublishedProducts()
      .then((products) => {
        if (!active) return;

        const presentationByVariant = new Map<string, CartVariantPresentation>();

        products.forEach((product) => {
          const isIPhone = isIPhoneProduct(product.category_slugs, product.brand);

          product.variants.forEach((variant) => {
            presentationByVariant.set(variant.id, {
              details: getVariantDetailsWithoutStorage(variant),
              storageGb: isIPhone ? variant.storage_gb : null,
            });
          });
        });

        setVariantPresentation(presentationByVariant);
      })
      .catch((error) => {
        console.error("ILUME: Não foi possível identificar a categoria das variantes do carrinho.", error);
      });

    return () => {
      active = false;
    };
  }, [hasCartItems]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
  };

  if (cart.length === 0) {
    return (
      <main className="cart-page cart-page--empty">
        <div className="cart-empty">
          <span className="cart-empty-icon"><ShoppingBag size={32} strokeWidth={1.2} /></span>
          <h2>Sua sacola está vazia.</h2>
          <p>Explore nossa curadoria de tecnologia e encontre o essencial.</p>
          <Link to="/" className="cart-continue-button">
            Explorar Produtos
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="cart-page">
        <div className="cart-container">
          <Link to="/" className="cart-back-link">
            <ArrowLeft size={14} /> Continuar comprando
          </Link>

          <header className="cart-heading">
            <div>
              <span>Sua Seleção</span>
              <h1>Sacola de Compras</h1>
            </div>
          </header>

          <div className="cart-layout">
            <section className="cart-items">
              {cart.map((item) => {
                const presentation = variantPresentation.get(item.variantId || item.id);
                const variantDetails = presentation?.details || item.color || "Padrão";
                const capacity = presentation?.storageGb
                  ? ` • ${formatStorageCapacity(presentation.storageGb)}`
                  : "";

                return (
                <article className="cart-item" key={item.id}>
                  <div className="cart-item-image">
                    <img
                      src={item.image || "/images/product-placeholder.png"}
                      alt={item.name}
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = "/images/product-placeholder.png";
                      }}
                    />
                  </div>
                  <div className="cart-item-info">
                    <h2>{item.name}</h2>
                    <p>Versão: {variantDetails}{capacity}</p>
                    <span className="cart-item-quantity">Qtd: {item.quantity}</span>
                  </div>

                  <div className="cart-item-side">
                    <strong className="cart-item-total">{formatCurrency(item.price * item.quantity)}</strong>
                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="cart-remove-button"
                      title="Remover item"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
                );
              })}
            </section>

            <aside className="cart-summary">
              <h2>Resumo do pedido</h2>
              <div className="cart-summary-total">
                <span>Total do Pedido</span>
                <strong>{formatCurrency(total)}</strong>
              </div>
              <button
                onClick={() => navigate("/checkout")}
                className="cart-checkout-button"
              >
                Avançar para o Checkout
              </button>
            </aside>
          </div>
        </div>
    </main>
  );
}
