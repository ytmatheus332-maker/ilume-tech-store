
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { useCart } from "../context/CartContext";
import "./Cart.css";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default function Cart() {
  const navigate = useNavigate();

  const {
    items,
    totalItems,
    subtotal,
    updateQuantity,
    removeFromCart,
    clearCart,
  } = useCart();

  if (items.length === 0) {
    return (
      <main className="cart-page">
        <div className="cart-empty">
          <div className="cart-empty-icon">
            <ShoppingBag size={30} />
          </div>

          <span>ILUME TECH STORE</span>
          <h1>Seu carrinho está vazio.</h1>

          <p>
            Explore nossa seleção e encontre tecnologia
            que combina com você.
          </p>

          <Link to="/" className="cart-continue-button">
            Explorar produtos
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="cart-page">
      <div className="cart-container">
        <Link to="/" className="cart-back-link">
          <ArrowLeft size={16} />
          Continuar comprando
        </Link>

        <div className="cart-heading">
          <div>
            <span>ILUME TECH STORE</span>
            <h1>Seu carrinho.</h1>
            <p>
              {totalItems}{" "}
              {totalItems === 1
                ? "item selecionado"
                : "itens selecionados"}
            </p>
          </div>

          <button
            type="button"
            className="cart-clear-button"
            onClick={clearCart}
          >
            <Trash2 size={15} />
            Limpar carrinho
          </button>
        </div>

        <div className="cart-layout">
          <section className="cart-items">
            {items.map((item) => (
              <article className="cart-item" key={item.id}>
                <Link
                  to={`/produto/${item.slug}`}
                  className="cart-item-image"
                >
                  <img src={item.image} alt={item.name} />
                </Link>

                <div className="cart-item-info">
                  <span>ILUME SELECTION</span>

                  <Link to={`/produto/${item.slug}`}>
                    <h2>{item.name}</h2>
                  </Link>

                  <strong>
                    {currencyFormatter.format(item.price)}
                  </strong>

                  <div className="cart-item-actions">
                    <div className="cart-quantity">
                      <button
                        type="button"
                        aria-label={`Diminuir quantidade de ${item.name}`}
                        onClick={() =>
                          updateQuantity(item.id, item.quantity - 1)
                        }
                      >
                        <Minus size={14} />
                      </button>

                      <span>{item.quantity}</span>

                      <button
                        type="button"
                        aria-label={`Aumentar quantidade de ${item.name}`}
                        onClick={() =>
                          updateQuantity(item.id, item.quantity + 1)
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <button
                      type="button"
                      className="cart-remove-button"
                      onClick={() => removeFromCart(item.id)}
                    >
                      <Trash2 size={15} />
                      Remover
                    </button>
                  </div>
                </div>

                <strong className="cart-item-total">
                  {currencyFormatter.format(
                    item.price * item.quantity
                  )}
                </strong>
              </article>
            ))}
          </section>

          <aside className="cart-summary">
            <span>RESUMO DO PEDIDO</span>
            <h2>Resumo da compra.</h2>

            <div className="cart-summary-row">
              <span>Produtos ({totalItems})</span>
              <strong>{currencyFormatter.format(subtotal)}</strong>
            </div>

            <div className="cart-summary-row">
              <span>Entrega</span>
              <span>A calcular</span>
            </div>

            <div className="cart-summary-total">
              <span>Subtotal</span>
              <strong>{currencyFormatter.format(subtotal)}</strong>
            </div>

            <button
              type="button"
              className="cart-checkout-button"
              onClick={() => navigate("/checkout")}
            >
              Finalizar compra
            </button>

            <p>
              As opções de entrega e pagamento serão apresentadas
              na próxima etapa da loja.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
