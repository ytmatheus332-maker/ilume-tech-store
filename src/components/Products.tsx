
import { useLocation } from "react-router-dom";
import "./Products.css";

interface Product {
  id: number;
  slug: string;
  name: string;
  description: string;
  price: string;
  label: string;
  image: string;
  rating: number;
  review: string;
  qualityLabel: string;
}

const products: Product[] = [
  {
    id: 1,
    slug: "iphone-15",
    name: "iPhone 15",
    description: "Design sofisticado. Desempenho avançado.",
    price: "R$ 4.499,00",
    label: "DESTAQUE",
    image: "/images/iphone-15.jpeg",
    rating: 5,
    review: "Excelente proposta de design e tecnologia.",
    qualityLabel: "Qualidade em destaque",
  },
  {
    id: 2,
    slug: "iphone-16",
    name: "iPhone 16",
    description: "Uma nova experiência em tecnologia.",
    price: "R$ 5.499,00",
    label: "POPULAR",
    image: "/images/iphone-16.jpeg",
    rating: 5,
    review: "Uma experiência moderna e recursos interessantes.",
    qualityLabel: "Qualidade em destaque",
  },
  {
    id: 3,
    slug: "iphone-16-pro",
    name: "iPhone 16 Pro",
    description: "Potência e precisão em cada detalhe.",
    price: "R$ 7.499,00",
    label: "PREMIUM",
    image: "/images/iphone-16-pro.jpg",
    rating: 5,
    review: "Desempenho e acabamento premium.",
    qualityLabel: "Qualidade em destaque",
  },
];

export default function Products() {
  const location = useLocation();
  const isIPhonesPage = location.pathname === "/iphones";

  return (
    <section className="products" id="produtos">
      <div className="products-heading">
        <div>
          <span>
            {isIPhonesPage ? "ILUME COLLECTION" : "SELEÇÃO ILUME"}
          </span>

          <h2>
            {isIPhonesPage
              ? "Conheça nossa linha de iPhones."
              : "Produtos em destaque."}
          </h2>

          <p>
            {isIPhonesPage
              ? "Explore os modelos selecionados pela ILUME TECH STORE."
              : "Conheça nossa seleção de tecnologia."}
          </p>
        </div>

        <div className="products-anniversary">
          <span className="anniversary-number">10</span>

          <div>
            <strong>ANOS</strong>
            <span>DE MERCADO</span>
          </div>
        </div>
      </div>

      <div className="products-grid">
        {products.map((product) => (
          <article className="product-card" key={product.id}>
            <div className="product-image">
              <span className="product-condition">
                {product.label}
              </span>

              <img
                src={product.image}
                alt={product.name}
              />
            </div>

            <div className="product-info">
              <h3>{product.name}</h3>

              <p>{product.description}</p>

              <div
                className="product-rating"
                aria-label={`${product.rating} de 5 estrelas`}
              >
                <span className="product-stars" aria-hidden="true">
                  {"★".repeat(product.rating)}
                </span>

                <span className="product-rating-value">
                  {product.rating.toFixed(1).replace(".", ",")}
                </span>
              </div>

              <div className="product-review">
                <p>"{product.review}"</p>
              </div>

              <div className="product-quality">
                <span className="quality-check" aria-hidden="true">
                  ✓
                </span>
                {product.qualityLabel}
              </div>

              <strong>{product.price}</strong>

              <a
                className="product-button"
                href={`/produto/${product.slug}`}
              >
                Conhecer produto
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
