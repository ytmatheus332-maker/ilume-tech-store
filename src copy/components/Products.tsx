
import "./Products.css";

interface Product {
  id: number;
  slug: string;
  name: string;
  description: string;
  price: string;
  label: string;
  image: string;
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
  },
  {
    id: 2,
    slug: "iphone-16",
    name: "iPhone 16",
    description: "Uma nova experiência em tecnologia.",
    price: "R$ 5.499,00",
    label: "POPULAR",
    image: "/images/iphone-16.jpeg",
  },
  {
    id: 3,
    slug: "iphone-16-pro",
    name: "iPhone 16 Pro",
    description: "Potência e precisão em cada detalhe.",
    price: "R$ 7.499,00",
    label: "PREMIUM",
    image: "/images/iphone-16-pro.jpg",
  },
];

export default function Products() {
  return (
    <section className="products" id="produtos">
      <div className="products-heading">
        <div>
          <span>SELEÇÃO ILUME</span>
          <h2>Produtos em destaque.</h2>
          <p>Conheça nossa seleção de tecnologia.</p>
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
