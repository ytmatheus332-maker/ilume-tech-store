import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, Headphones, Radio, Sparkles } from "lucide-react";

import { getPublishedProducts } from "../services/catalog";
import ProductColorSwatches from "../components/ProductColorSwatches";
import { getAccessoryGroup } from "../utils/accessoryCategories";
import type { CatalogProduct, CatalogVariant } from "../types/catalog";
import "../components/Products.css";
import "./Accessories.css";

type AccessoryTab = {
  slug: string;
  label: string;
  title: string;
  description: string;
};

const tabs: AccessoryTab[] = [
  { slug: "todos", label: "Todos", title: "Acessórios com propósito.", description: "Uma seleção de tecnologia e complementos para acompanhar seu dia." },
  { slug: "fones-de-ouvido", label: "Fones de ouvido", title: "Áudio em outro nível.", description: "Fones e equipamentos de áudio presentes nas categorias cadastradas da ILUME." },
  { slug: "antenas-starlink", label: "Antenas Starlink", title: "Conectividade sem limites.", description: "Antenas e equipamentos Starlink classificados no catálogo da ILUME." },
  { slug: "outros-acessorios", label: "Outros acessórios", title: "Detalhes que completam.", description: "Outros produtos classificados como acessórios no catálogo." },
];

function getBestVariant(product: CatalogProduct): CatalogVariant | null {
  const available = product.variants.filter((variant) =>
    (variant.availability_status === "available" || variant.availability_status === "preorder") &&
    variant.price_cents > 0
  );
  return available.reduce<CatalogVariant | null>((best, variant) =>
    !best || variant.price_cents < best.price_cents ? variant : best, null);
}

function getProductImage(product: CatalogProduct): string {
  const image = product.images.find((item) => item.is_primary) ?? product.images[0];
  return image?.storage_path && /^https?:\/\//i.test(image.storage_path)
    ? image.storage_path
    : "/images/product-placeholder.png";
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function getBadge(product: CatalogProduct): string | null {
  if (product.badge_label?.trim()) return product.badge_label.trim();
  if (product.campaign_type === "black_friday") return "BLACK FRIDAY";
  if (product.campaign_type === "promotion") return "OFERTA ESPECIAL";
  return product.is_featured ? "DESTAQUE" : null;
}

export default function Accessories() {
  const { category = "todos" } = useParams<{ category?: string }>();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeTab = tabs.find((tab) => tab.slug === category) ?? tabs[0];

  useEffect(() => {
    let active = true;
    getPublishedProducts()
      .then((result) => { if (active) setProducts(result); })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar os acessórios.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const accessories = useMemo(() => products.filter((product) =>
    getAccessoryGroup(product.category_slugs) !== null
  ), [products]);

  const visibleProducts = useMemo(() => {
    if (activeTab.slug === "fones-de-ouvido") {
      return accessories.filter((product) => getAccessoryGroup(product.category_slugs) === "headphones");
    }
    if (activeTab.slug === "antenas-starlink") {
      return accessories.filter((product) => getAccessoryGroup(product.category_slugs) === "antennas");
    }
    if (activeTab.slug === "outros-acessorios") {
      return accessories.filter((product) => getAccessoryGroup(product.category_slugs) === "other");
    }
    return accessories;
  }, [accessories, activeTab.slug]);

  return (
    <main className="accessories-page">
      <header className="accessories-hero">
        <div className="accessories-hero-copy">
          <span className="accessories-eyebrow"><Sparkles size={14} /> ILUME COLLECTION</span>
          <h1>{activeTab.title}</h1>
          <p>{activeTab.description}</p>
        </div>
        <div className="accessories-hero-mark" aria-hidden="true">
          {activeTab.slug === "fones-de-ouvido" ? <Headphones size={38} /> : activeTab.slug === "antenas-starlink" ? <Radio size={38} /> : <span>I.</span>}
          <small>TECNOLOGIA<br />SELECIONADA</small>
        </div>
      </header>

      <nav className="accessories-tabs" aria-label="Categorias de acessórios">
        {tabs.map((tab) => (
          <Link
            key={tab.slug}
            to={tab.slug === "todos" ? "/acessorios" : `/acessorios/${tab.slug}`}
            className={`accessories-tab${activeTab.slug === tab.slug ? " is-active" : ""}`}
            aria-current={activeTab.slug === tab.slug ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <section className="accessories-catalog" aria-labelledby="accessories-results-heading">
        <div className="accessories-section-heading">
          <div>
            <span className="accessories-eyebrow">CATÁLOGO ILUME</span>
            <h2 id="accessories-results-heading">{activeTab.label}</h2>
          </div>
          {!loading && !error && <span className="accessories-result-count">{visibleProducts.length} {visibleProducts.length === 1 ? "produto" : "produtos"}</span>}
        </div>

        {loading && <div className="accessories-state" role="status">Carregando acessórios...</div>}
        {!loading && error && <div className="accessories-state" role="alert"><strong>Não foi possível carregar o catálogo.</strong><p>{error}</p></div>}
        {!loading && !error && visibleProducts.length === 0 && (
          <div className="accessories-empty">
            <span>{activeTab.slug === "fones-de-ouvido" ? <Headphones size={24} /> : activeTab.slug === "antenas-starlink" ? <Radio size={24} /> : <Sparkles size={24} />}</span>
            <strong>Nenhum produto nesta seleção</strong>
            <p>Os produtos publicados e atribuídos a esta categoria aparecerão aqui.</p>
          </div>
        )}

        {!loading && !error && visibleProducts.length > 0 && (
          <div className="products-grid accessories-products-grid">
            {visibleProducts.map((product) => {
              const variant = getBestVariant(product);
              const badge = getBadge(product);
              const hasDiscount = variant?.compare_at_price_cents !== null &&
                variant?.compare_at_price_cents !== undefined && variant.compare_at_price_cents > variant.price_cents;
              return (
                <article className="product-card" key={product.id}>
                  <div className="product-image">
                    {badge && <div className="product-badges"><span className={`product-badge${product.campaign_type ? ` product-badge--${product.campaign_type}` : ""}`}>{badge}</span></div>}
                    <img src={getProductImage(product)} alt={product.name} loading="lazy" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = "/images/product-placeholder.png"; }} />
                  </div>
                  <div className="product-info">
                    <h3>{product.name}</h3>
                    <p className="product-description">{product.short_description?.trim() || product.description?.trim() || "Tecnologia selecionada pela ILUME."}</p>
                    <ProductColorSwatches
                      variants={product.variants.filter((item) =>
                        item.availability_status === "available" || item.availability_status === "preorder"
                      )}
                    />
                    <span className={`accessory-availability${variant?.availability_status === "preorder" ? " is-preorder" : variant ? " is-available" : " is-unavailable"}`}>
                      {variant?.availability_status === "preorder" ? "Pré-venda" : variant ? "Disponível" : "Indisponível"}
                    </span>
                    {variant ? (
                      <div className="product-price">
                        {hasDiscount && <span className="product-price-original">{formatPrice(variant.compare_at_price_cents!)}</span>}
                        <strong>{formatPrice(variant.price_cents)}</strong>
                        {hasDiscount && <span className="product-price-label">Oferta especial</span>}
                      </div>
                    ) : <strong className="product-unavailable">Indisponível</strong>}
                    <Link className="product-button" to={`/produto/${product.slug}`}>Ver produto <ArrowRight size={15} /></Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
