import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";

import { useCart } from "../context/CartContext";
import { getPublishedProducts } from "../services/catalog";
import { getProductSpecs, groupSpecs } from "../data/productSpecs";
import type {
  CatalogImage,
  CatalogProduct,
  CatalogVariant,
} from "../types/catalog";
import "./ProductDetails.css";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const MAX_QUANTITY = 10;
const PLACEHOLDER_IMAGE = "/images/product-placeholder.png";

const editorialImages: Record<string, string> = {
  "iphone-15": "/images/iphone-15.jpeg",
  "iphone-16": "/images/iphone-16.jpeg",
  "iphone-16-pro": "/images/iphone-16-pro.jpg",
};

function formatStorage(storageGb: number): string {
  return storageGb >= 1024 ? `${storageGb / 1024} TB` : `${storageGb} GB`;
}

function getVariantLabel(variant: CatalogVariant, index: number): string {
  const parts: string[] = [];

  if (variant.color) parts.push(variant.color);
  if (variant.storage_gb) parts.push(formatStorage(variant.storage_gb));

  return parts.length > 0 ? parts.join(" · ") : `Opção ${index + 1}`;
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

function getPurchasableVariants(product: CatalogProduct): CatalogVariant[] {
  return product.variants
    .filter(
      (variant) =>
        variant.availability_status === "available" ||
        variant.availability_status === "preorder"
    )
    .sort(
      (a, b) =>
        (a.storage_gb ?? 0) - (b.storage_gb ?? 0) ||
        a.price_cents - b.price_cents
    );
}

function resolveImage(
  product: CatalogProduct,
  variantId: string | null
): { src: string; alt: string } {
  const sorted: CatalogImage[] = [...product.images].sort(
    (a, b) =>
      Number(b.is_primary) - Number(a.is_primary) || a.position - b.position
  );

  const chosen =
    (variantId
      ? sorted.find((image) => image.variant_id === variantId)
      : undefined) ??
    sorted.find((image) => image.variant_id === null) ??
    sorted[0];

  const path = chosen?.storage_path;
  const src =
    path && /^https?:\/\//i.test(path)
      ? path
      : (editorialImages[product.slug] ?? PLACEHOLDER_IMAGE);

  return { src, alt: chosen?.alt_text || product.name };
}

export default function ProductDetails() {
  const { slug } = useParams<{ slug: string }>();
  const { addToCart } = useCart();

  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null
  );
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadProduct() {
      setLoading(true);
      setLoadError(false);

      try {
        const products = await getPublishedProducts();

        if (!active) return;

        const found = products.find((item) => item.slug === slug) ?? null;
        const firstVariant = found ? getPurchasableVariants(found)[0] : undefined;

        setProduct(found);
        setSelectedVariantId(firstVariant ? firstVariant.id : null);
        setQuantity(1);
      } catch (err) {
        if (!active) return;

        console.error("Erro ao carregar detalhes:", err);
        setProduct(null);
        setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProduct();

    return () => {
      active = false;
    };
  }, [slug, reloadKey]);

  useEffect(() => {
    if (!added) return undefined;

    const timer = window.setTimeout(() => setAdded(false), 2500);

    return () => window.clearTimeout(timer);
  }, [added]);

  const variants = useMemo(
    () => (product ? getPurchasableVariants(product) : []),
    [product]
  );

  if (loading) {
    return (
      <main className="product-not-found">
        <span>ILUME TECH STORE</span>
        <h1>Carregando produto...</h1>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="product-not-found">
        <span>ILUME TECH STORE</span>
        <h1>Não foi possível carregar o produto.</h1>
        <button
          type="button"
          className="product-add-cart product-retry"
          onClick={() => setReloadKey((current) => current + 1)}
        >
          Tentar novamente
        </button>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="product-not-found">
        <span>ILUME TECH STORE</span>
        <h1>Produto não encontrado.</h1>
        <Link to="/" className="product-back-link">
          <ArrowLeft size={14} /> Voltar para a loja
        </Link>
      </main>
    );
  }

  const selectedVariant =
    variants.find((variant) => variant.id === selectedVariantId) ??
    variants[0] ??
    null;

  const priceReais = selectedVariant ? selectedVariant.price_cents / 100 : 0;
  const compareReais =
    selectedVariant &&
    selectedVariant.compare_at_price_cents !== null &&
    selectedVariant.compare_at_price_cents > selectedVariant.price_cents
      ? selectedVariant.compare_at_price_cents / 100
      : null;

  const image = resolveImage(product, selectedVariant ? selectedVariant.id : null);
  const badge = getProductBadge(product);
  const specs = getProductSpecs(product.slug);

  const summary =
    product.short_description?.trim() ||
    product.description?.trim() ||
    "Tecnologia refinada, sem excessos.";
  const overview = product.description?.trim() || "";

  const handleAddToCart = () => {
    if (!selectedVariant) return;

    addToCart({
      id: product.id,
      variantId: selectedVariant.id,
      name: product.name,
      price: priceReais,
      quantity,
      image: image.src,
      color: selectedVariant.color ?? undefined,
      storage: selectedVariant.storage_gb ?? undefined,
    });

    setAdded(true);
  };

  return (
    <main className="product-details">
      <Link to="/" className="product-back-link">
        <ArrowLeft size={14} /> Voltar para a loja
      </Link>

      <div className="product-details-layout">
        <div className="product-details-image">
          <span>ILUME AUTHENTIC</span>
          <img src={image.src} alt={image.alt} />
        </div>

        <div className="product-details-info">
          {badge && <span className="product-campaign-badge">{badge}</span>}

          <span className="product-details-label">CURADORIA ILUME</span>

          <h1>{product.name}</h1>

          <p className="product-details-description">{summary}</p>

          <div className="product-details-price-block">
            {selectedVariant ? (
              <div className="product-details-price">
                {compareReais !== null && (
                  <span className="product-details-compare-price">
                    {currencyFormatter.format(compareReais)}
                  </span>
                )}
                {currencyFormatter.format(priceReais)}
              </div>
            ) : (
              <div className="product-details-price product-details-unavailable">
                Indisponível no momento
              </div>
            )}

            {selectedVariant?.availability_status === "preorder" && (
              <p className="product-details-note">Produto em pré-venda.</p>
            )}
          </div>

          {variants.length > 1 && (
            <div
              className="product-variants"
              role="radiogroup"
              aria-label="Versão do produto"
            >
              <span className="product-variants-label">Versão</span>

              <div className="product-variants-options">
                {variants.map((variant, index) => {
                  const selected = variant.id === selectedVariant?.id;

                  return (
                    <button
                      key={variant.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`product-variant-option${
                        selected ? " is-selected" : ""
                      }`}
                      onClick={() => setSelectedVariantId(variant.id)}
                    >
                      {getVariantLabel(variant, index)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="product-quantity">
            <span>Quantidade</span>

            <div>
              <button
                type="button"
                aria-label="Diminuir quantidade"
                disabled={quantity <= 1}
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
              >
                −
              </button>

              <strong>{quantity}</strong>

              <button
                type="button"
                aria-label="Aumentar quantidade"
                disabled={quantity >= MAX_QUANTITY}
                onClick={() =>
                  setQuantity((current) => Math.min(MAX_QUANTITY, current + 1))
                }
              >
                +
              </button>
            </div>
          </div>

          <button
            type="button"
            className={`product-add-cart${added ? " is-added" : ""}`}
            onClick={handleAddToCart}
            disabled={!selectedVariant}
          >
            {added ? <Check size={18} /> : <ShoppingBag size={18} />}
            {added ? "Adicionado à sacola" : "Adicionar à sacola"}
          </button>

          <div className="product-benefits">
            <div>
              <ShieldCheck size={16} /> Compra segura
            </div>
            <div>
              <Truck size={16} /> Envio garantido
            </div>
          </div>
        </div>
      </div>

      {overview && overview !== summary && (
        <section className="product-overview">
          <span className="product-section-label">SOBRE O PRODUTO</span>
          <h2>{product.name}</h2>
          <p>{overview}</p>
        </section>
      )}

      {specs && (
        <>
          <section className="product-highlights">
            <div className="product-section-heading">
              <span className="product-section-label">DIFERENCIAIS</span>
              <h2>Feito para ir além.</h2>
            </div>

            <div className="product-highlights-grid">
              {specs.highlights.map((highlight, index) => (
                <article className="product-highlight-card" key={highlight}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{highlight}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="product-specifications">
            <div className="product-section-heading">
              <span className="product-section-label">
                ESPECIFICAÇÕES TÉCNICAS
              </span>
              <h2>Ficha técnica.</h2>
            </div>

            <div className="product-specifications-list">
              {groupSpecs(specs.specs).map((group) => (
                <div className="product-specification-group" key={group.category}>
                  <h3>{group.category}</h3>

                  <div>
                    {group.items.map((item) => (
                      <div className="product-specification-row" key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}