
import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ShoppingBag,
  ArrowLeft,
  ShieldCheck,
  Truck,
  Check,
} from "lucide-react";
import { useCart } from "../context/CartContext";
import "./ProductDetails.css";

interface Product {
  id: number;
  slug: string;
  name: string;
  description: string;
  price: number;
  image: string;
  label: string;
}

const products: Product[] = [
  {
    id: 1,
    slug: "iphone-15",
    name: "iPhone 15",
    description: "Design sofisticado. Desempenho avançado.",
    price: 4499,
    image: "/images/iphone-15.jpeg",
    label: "DESTAQUE",
  },
  {
    id: 2,
    slug: "iphone-16",
    name: "iPhone 16",
    description: "Uma nova experiência em tecnologia.",
    price: 5499,
    image: "/images/iphone-16.jpeg",
    label: "POPULAR",
  },
  {
    id: 3,
    slug: "iphone-16-pro",
    name: "iPhone 16 Pro",
    description: "Potência e precisão em cada detalhe.",
    price: 7499,
    image: "/images/iphone-16-pro.jpg",
    label: "PREMIUM",
  },
];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default function ProductDetails() {
  const { slug } = useParams();
  const { addToCart } = useCart();

  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const product = products.find((item) => item.slug === slug);

  if (!product) {
    return (
      <main className="product-not-found">
        <span>ILUME TECH STORE</span>
        <h1>Produto não encontrado.</h1>
        <Link to="/" className="product-back-link">
          Voltar para a loja
        </Link>
      </main>
    );
  }

  function handleAddToCart() {
    addToCart(
      {
        id: product.id,
        slug: product.slug,
        name: product.name,
        price: product.price,
        image: product.image,
      },
      quantity
    );

    setAdded(true);
  }

  return (
    <main className="product-details">
      <Link to="/" className="product-back-link">
        <ArrowLeft size={16} />
        Voltar para a loja
      </Link>

      <section className="product-details-layout">
        <div className="product-details-image">
          <span>{product.label}</span>
          <img src={product.image} alt={product.name} />
        </div>

        <div className="product-details-info">
          <span className="product-details-label">
            ILUME SELECTION
          </span>

          <h1>{product.name}</h1>

          <p className="product-details-description">
            {product.description}
          </p>

          <strong className="product-details-price">
            {currencyFormatter.format(product.price)}
          </strong>

          <p className="product-details-installment">
            Consulte as condições de pagamento disponíveis.
          </p>

          <div className="product-quantity">
            <span>Quantidade</span>

            <div>
              <button
                type="button"
                onClick={() =>
                  setQuantity((current) => Math.max(1, current - 1))
                }
                aria-label="Diminuir quantidade"
              >
                −
              </button>

              <strong>{quantity}</strong>

              <button
                type="button"
                onClick={() =>
                  setQuantity((current) => current + 1)
                }
                aria-label="Aumentar quantidade"
              >
                +
              </button>
            </div>
          </div>

          <button
            type="button"
            className="product-add-cart"
            onClick={handleAddToCart}
          >
            {added ? <Check size={18} /> : <ShoppingBag size={18} />}
            {added ? "Adicionado ao carrinho" : "Adicionar ao carrinho"}
          </button>

          <div className="product-benefits">
            <div>
              <ShieldCheck size={19} />
              <span>Compra segura</span>
            </div>

            <div>
              <Truck size={19} />
              <span>Informações de entrega</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
