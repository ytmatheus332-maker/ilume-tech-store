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
import {
  formatStorageCapacity,
  getColorSwatch,
  getVariantDetailsWithoutStorage,
  isIPhoneProduct,
} from "../utils/productPresentation";
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

function getVariantAdditionalDetails(variant: CatalogVariant): string {
  const details = getVariantDetailsWithoutStorage(variant);
  const color = variant.color?.trim();
  if (!color) return details;
  const colorPrefix = `${color} · `;
  return details.startsWith(colorPrefix) ? details.slice(colorPrefix.length) : "";
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

interface ProductGalleryImage {
  id: string;
  src: string;
  alt: string;
}

function resolveGalleryImages(
  product: CatalogProduct,
  variantId: string | null
): ProductGalleryImage[] {
  const sorted: CatalogImage[] = product.images
    .filter((image) => image.variant_id === null || image.variant_id === variantId)
    .sort(
    (a, b) =>
      Number(b.is_primary) - Number(a.is_primary) || a.position - b.position
  );

  const seenPaths = new Set<string>();
  const gallery = sorted.reduce<ProductGalleryImage[]>((images, image) => {
    const path = image.storage_path.trim();
    if (!path || seenPaths.has(path)) return images;
    seenPaths.add(path);

    images.push({
      id: image.id,
      src: /^https?:\/\//i.test(path)
        ? path
        : (editorialImages[product.slug] ?? PLACEHOLDER_IMAGE),
      alt: image.alt_text || product.name,
    });

    return images;
  }, []);

  if (gallery.length > 0) return gallery;

  return [{
    id: "product-fallback-image",
    src: editorialImages[product.slug] ?? PLACEHOLDER_IMAGE,
    alt: product.name,
  }];
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
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
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
  const iphone = product
    ? isIPhoneProduct(product.category_slugs, product.brand)
    : false;
  const colorOptions = useMemo(() => {
    const seen = new Set<string>();
    return variants.flatMap((variant) => {
      const color = variant.color?.trim();
      if (!color) return [];
      const key = color.toLocaleLowerCase("pt-BR");
      if (seen.has(key)) return [];
      seen.add(key);
      return [color];
    });
  }, [variants]);
  const storageOptions = useMemo(() => {
    if (!iphone) return [];
    return [...new Set(variants
      .map((variant) => variant.storage_gb)
      .filter((capacity): capacity is number => typeof capacity === "number" && Number.isFinite(capacity) && capacity > 0))]
      .sort((a, b) => a - b);
  }, [iphone, variants]);
  const additionalVariantOptions = useMemo(() => {
    if (!product || iphone) return [];
    const seen = new Set<string>();
    return variants.flatMap((variant) => {
      const label = getVariantAdditionalDetails(variant);
      if (!label) return [];
      const key = label.toLocaleLowerCase("pt-BR");
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ label, variant }];
    });
  }, [iphone, product, variants]);

  const preferredVariant =
    variants.find((variant) => variant.id === selectedVariantId) ??
    variants[0] ??
    null;
  const selectedVariant = preferredVariant;
  const selectColor = (color: string) => {
    const matching = variants.filter((variant) =>
      variant.color?.trim().toLocaleLowerCase("pt-BR") === color.toLocaleLowerCase("pt-BR")
    );
    const matchingDetails = !iphone && selectedVariant
      ? matching.find((variant) => getVariantAdditionalDetails(variant) === getVariantAdditionalDetails(selectedVariant))
      : undefined;
    const matchingStorage = matching.find((variant) => variant.storage_gb === selectedVariant?.storage_gb);
    setSelectedVariantId((matchingDetails ?? matchingStorage ?? matching[0])?.id ?? null);
  };
  const selectStorage = (storageGb: number) => {
    const matching = variants.filter((variant) => variant.storage_gb === storageGb);
    const matchingColor = matching.find((variant) =>
      (variant.color?.trim() ?? "").toLocaleLowerCase("pt-BR") ===
      (selectedVariant?.color?.trim() ?? "").toLocaleLowerCase("pt-BR")
    );
    setSelectedVariantId((matchingColor ?? matching[0])?.id ?? null);
  };
  const selectAdditionalVariant = (label: string) => {
    const matching = variants.filter((variant) =>
      getVariantAdditionalDetails(variant).toLocaleLowerCase("pt-BR") === label.toLocaleLowerCase("pt-BR")
    );
    const matchingColor = matching.find((variant) =>
      (variant.color?.trim() ?? "").toLocaleLowerCase("pt-BR") ===
      (selectedVariant?.color?.trim() ?? "").toLocaleLowerCase("pt-BR")
    );
    setSelectedVariantId((matchingColor ?? matching[0])?.id ?? null);
  };
  const galleryImages = useMemo(
    () => product ? resolveGalleryImages(product, selectedVariant?.id ?? null) : [],
    [product, selectedVariant?.id]
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

  const priceReais = selectedVariant ? selectedVariant.price_cents / 100 : 0;
  const compareReais =
    selectedVariant &&
    selectedVariant.compare_at_price_cents !== null &&
    selectedVariant.compare_at_price_cents > selectedVariant.price_cents
      ? selectedVariant.compare_at_price_cents / 100
      : null;

  const image =
    galleryImages.find((galleryImage) => galleryImage.id === selectedImageId) ??
    galleryImages[0];
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
        <div className="product-details-gallery">
          <div className="product-details-image">
            <span>ILUME AUTHENTIC</span>
            <img src={image.src} alt={image.alt} />
          </div>

          {galleryImages.length > 1 && (
            <div className="product-image-thumbnails" role="group" aria-label="Imagens do produto">
              {galleryImages.map((galleryImage, index) => {
                const selected = galleryImage.id === image.id;

                return (
                  <button
                    key={galleryImage.id}
                    type="button"
                    className={`product-image-thumbnail${selected ? " is-selected" : ""}`}
                    aria-label={`Visualizar imagem ${index + 1} de ${galleryImages.length}`}
                    aria-pressed={selected}
                    onClick={() => setSelectedImageId(galleryImage.id)}
                  >
                    <img src={galleryImage.src} alt="" loading="lazy" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="product-details-info">
          {badge && (
            <span
              className={`product-campaign-badge${product.campaign_type === "black_friday" ? " product-campaign-badge--black_friday" : ""}`}
            >
              {badge}
            </span>
          )}

          <span className="product-details-label">CURADORIA ILUME</span>

          <h1>{product.name}</h1>

          <div className="product-details-price-block">
            {selectedVariant ? (
              <div className="product-details-price">
                {compareReais !== null && (
                  <span className="product-details-compare-price">
                    {currencyFormatter.format(compareReais)}
                  </span>
                )}
                <strong className="product-details-current-price">
                  {currencyFormatter.format(priceReais)}
                </strong>
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

          <p className="product-details-description">{summary}</p>

          {colorOptions.length > 0 && (
            <div className="product-choice-group">
              <div className="product-choice-heading">
                <span className="product-variants-label">Cor</span>
                <strong>{selectedVariant?.color || "Indisponível"}</strong>
              </div>
              <div className="product-color-options" role="radiogroup" aria-label="Cor do produto">
                {colorOptions.map((color) => {
                  const selected = selectedVariant?.color?.trim().toLocaleLowerCase("pt-BR") === color.toLocaleLowerCase("pt-BR");
                  const swatch = getColorSwatch(color);
                  return (
                    <button
                      key={color}
                      type="button"
                      role="radio"
                      aria-label={color}
                      aria-checked={selected}
                      title={color}
                      className={`product-color-option${selected ? " is-selected" : ""}${swatch ? "" : " has-unknown-swatch"}`}
                      style={swatch ? { backgroundColor: swatch } : undefined}
                      onClick={() => selectColor(color)}
                    >
                      <span />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {iphone && storageOptions.length > 0 && (
            <div className="product-choice-group">
              <div className="product-choice-heading">
                <span className="product-variants-label">Armazenamento</span>
                <strong>{selectedVariant?.storage_gb ? formatStorageCapacity(selectedVariant.storage_gb) : "Indisponível"}</strong>
              </div>
              <div className="product-variants-options" role="radiogroup" aria-label="Capacidade de armazenamento">
                {storageOptions.map((storageGb) => {
                  const selected = selectedVariant?.storage_gb === storageGb;
                  return (
                    <button
                      key={storageGb}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`product-variant-option${selected ? " is-selected" : ""}`}
                      onClick={() => selectStorage(storageGb)}
                    >
                      {formatStorageCapacity(storageGb)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!iphone && additionalVariantOptions.length > 1 && (
            <div className="product-choice-group">
              <div className="product-choice-heading">
                <span className="product-variants-label">Versão</span>
                <strong>{getVariantAdditionalDetails(selectedVariant ?? additionalVariantOptions[0].variant)}</strong>
              </div>
              <div className="product-variants-options" role="radiogroup" aria-label="Versão do produto">
                {additionalVariantOptions.map(({ label }) => {
                  const selected = getVariantAdditionalDetails(selectedVariant ?? additionalVariantOptions[0].variant) === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`product-variant-option${selected ? " is-selected" : ""}`}
                      onClick={() => selectAdditionalVariant(label)}
                    >
                      {label}
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
