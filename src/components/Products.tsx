
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getPublishedProducts } from "../services/catalog";
import type { CatalogProduct } from "../types/catalog";
import "./Products.css";

interface ProductEditorial {
  label: string;
  image: string;
}

const editorialContent: Record<string, ProductEditorial> = {
  "iphone-15": {
    label: "DESTAQUE",
    image: "/images/iphone-15.jpeg",
  },
  "iphone-16": {
    label: "POPULAR",
    image: "/images/iphone-16.jpeg",
  },
  "iphone-16-pro": {
    label: "PREMIUM",
    image: "/images/iphone-16-pro.jpg",
  },
};

function formatPrice(priceCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(priceCents / 100);
}

function getProductImage(product: CatalogProduct): string {
  const primaryImage = product.images.find(
    (image) => image.is_primary
  );

  const firstImage = primaryImage ?? product.images[0];

  if (firstImage?.storage_path) {
    const path = firstImage.storage_path;

    if (/^https?:\/\//i.test(path)) {
      return path;
    }
  }

  return (
    editorialContent[product.slug]?.image ??
    "/images/product-placeholder.png"
  );
}

function getProductPrice(product: CatalogProduct): number | null {
  const availableVariants = product.variants.filter(
    (variant) =>
      variant.availability_status === "available" ||
      variant.availability_status === "preorder"
  );

  if (availableVariants.length === 0) {
    return null;
  }

  return Math.min(
    ...availableVariants.map((variant) => variant.price_cents)
  );
}

export default function Products() {
  const location = useLocation();
  const isIPhonesPage = location.pathname === "/iphones";

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadProducts() {
      try {
        setLoading(true);
        setError(null);

        const data = await getPublishedProducts();

        if (active) {
          setProducts(data);
        }
      } catch (err) {
        console.error("Erro ao carregar catálogo:", err);

        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : String(err)
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadProducts();

    return () => {
      active = false;
    };
  }, []);

  const visibleProducts = products.filter((product) => {
    if (!isIPhonesPage) {
      return true;
    }

    const categoryText = [
      product.name,
      product.brand,
      product.model,
      product.slug,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return categoryText.includes("iphone");
  });

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

        {!isIPhonesPage && (
          <div className="products-signature">
            <span className="signature-mark">I</span>

            <div>
              <strong>ILUME AUTHENTIC</strong>
              <span>SELEÇÃO COM CRITÉRIO</span>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="products-message" role="status">
          Carregando produtos...
        </div>
      )}

      {!loading && error && (
        <div className="products-message" role="alert">
          <strong>Erro ao carregar o catálogo:</strong>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && visibleProducts.length === 0 && (
        <div className="products-message">
          Nenhum produto disponível no momento.
        </div>
      )}

      {!loading && !error && visibleProducts.length > 0 && (
        <div className="products-grid">
          {visibleProducts.map((product) => {
            const editorial = editorialContent[product.slug];
            const price = getProductPrice(product);

            return (
              <article className="product-card" key={product.id}>
                <div className="product-image">
                  {editorial && (
                    <span className="product-condition">
                      {editorial.label}
                    </span>
                  )}

                  <img
                    src={getProductImage(product)}
                    alt={product.name}
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src =
                        "/images/product-placeholder.png";
                    }}
                  />
                </div>

                <div className="product-info">
                  <h3>{product.name}</h3>

                  <p>
                    {product.short_description ||
                      product.description ||
                      "Conheça este produto da ILUME TECH STORE."}
                  </p>

                  {price !== null ? (
                    <strong>{formatPrice(price)}</strong>
                  ) : (
                    <strong>Indisponível</strong>
                  )}

                  {price !== null ? (
                    <Link
                      className="product-button"
                      to={`/produto/${product.slug}`}
                    >
                      Conhecer produto
                    </Link>
                  ) : (
                    <span className="product-button product-button-disabled">
                      Indisponível
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
