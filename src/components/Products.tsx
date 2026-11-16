
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getPublishedProducts } from "../services/catalog";
import ProductColorSwatches from "./ProductColorSwatches";
import { isIPhoneProduct } from "../utils/productPresentation";
import type { CatalogProduct, CatalogVariant } from "../types/catalog";
import "./Products.css";

type ProductFilter = "all" | "featured";

function formatPrice(priceCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(priceCents / 100);
}

function getProductImage(product: CatalogProduct): string {
  const primaryImage = product.images.find((image) => image.is_primary);
  const firstImage = primaryImage ?? product.images[0];

  if (firstImage?.storage_path) {
    const path = firstImage.storage_path;

    if (/^https?:\/\//i.test(path)) {
      return path;
    }
  }

  return "/images/product-placeholder.png";
}

function getBestVariant(
  product: CatalogProduct
): CatalogVariant | null {
  const availableVariants = product.variants.filter(
    (variant) =>
      (variant.availability_status === "available" ||
        variant.availability_status === "preorder") &&
      variant.price_cents > 0
  );

  if (availableVariants.length === 0) {
    return null;
  }

  return availableVariants.reduce((lowest, current) =>
    current.price_cents < lowest.price_cents ? current : lowest
  );
}

function getProductBadge(product: CatalogProduct): string | null {
  if (product.badge_label?.trim()) {
    return product.badge_label.trim();
  }

  if (product.campaign_type === "black_friday") {
    return "BLACK FRIDAY";
  }

  if (product.campaign_type === "promotion") {
    return "OFERTA ESPECIAL";
  }

  if (product.is_featured) {
    return "DESTAQUE";
  }

  return null;
}

function getProductDescription(product: CatalogProduct): string {
  return (
    product.short_description?.trim() ||
    product.description?.trim() ||
    "Conheça este produto da ILUME TECH STORE."
  );
}

export default function Products() {
  const location = useLocation();
  const isIPhonesPage = location.pathname === "/iphones";

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ProductFilter>("all");

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
            err instanceof Error ? err.message : String(err)
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
    return isIPhoneProduct(product.category_slugs, product.brand);
  });

  const featuredProducts = visibleProducts.filter(
    (product) => product.is_featured
  );

  const displayedProducts =
    activeFilter === "featured"
      ? featuredProducts
      : visibleProducts;

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

      {!loading && !error && visibleProducts.length > 0 && (
        <nav className="products-tabs" aria-label="Filtros do catálogo">
          <button
            type="button"
            className={`products-tab ${
              activeFilter === "all" ? "active" : ""
            }`}
            onClick={() => setActiveFilter("all")}
            aria-pressed={activeFilter === "all"}
          >
            {isIPhonesPage ? "Todos os iPhones" : "Todos os produtos"}
          </button>

          <button
            type="button"
            className={`products-tab ${
              activeFilter === "featured" ? "active" : ""
            }`}
            onClick={() => setActiveFilter("featured")}
            aria-pressed={activeFilter === "featured"}
          >
            Destaques
          </button>
        </nav>
      )}

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

      {!loading && !error && displayedProducts.length === 0 && (
        <div className="products-message">
          {activeFilter === "featured"
            ? "Nenhum produto em destaque no momento."
            : "Nenhum produto disponível no momento."}
        </div>
      )}

      {!loading && !error && displayedProducts.length > 0 && (
        <div className="products-grid">
          {displayedProducts.map((product) => {
            const variant = getBestVariant(product);
            const badge = getProductBadge(product);
            const description = getProductDescription(product);

            const currentPrice = variant?.price_cents ?? null;
            const originalPrice =
              variant?.compare_at_price_cents ?? null;

            const hasDiscount =
              currentPrice !== null &&
              originalPrice !== null &&
              originalPrice > currentPrice;

            return (
              <article className="product-card" key={product.id}>
                <div className="product-image">
                  {badge && (
                    <div className="product-badges">
                      <span
                        className={`product-badge ${
                          product.campaign_type
                            ? `product-badge--${product.campaign_type}`
                            : ""
                        }`}
                      >
                        {badge}
                      </span>
                    </div>
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

                  <p className="product-description">
                    {description}
                  </p>

                  <ProductColorSwatches
                    variants={product.variants.filter((item) =>
                      item.availability_status === "available" || item.availability_status === "preorder"
                    )}
                  />

                  {currentPrice !== null ? (
                    <div className="product-price">
                      {hasDiscount && (
                        <span className="product-price-original">
                          {formatPrice(originalPrice)}
                        </span>
                      )}

                      <strong>
                        {formatPrice(currentPrice)}
                      </strong>

                      {hasDiscount && (
                        <span className="product-price-label">
                          Oferta especial
                        </span>
                      )}
                    </div>
                  ) : (
                    <strong className="product-unavailable">
                      Indisponível
                    </strong>
                  )}

                  {currentPrice !== null ? (
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
