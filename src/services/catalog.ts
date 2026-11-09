
import { supabase } from "../supabase";
import type {
  CatalogProduct,
  CatalogVariant,
  CatalogImage,
} from "../types/catalog";

const PRODUCT_COLUMNS = `
  id,
  category_id,
  name,
  slug,
  brand,
  model,
  short_description,
  description,
  published_at
`;

const VARIANT_COLUMNS = `
  id,
  product_id,
  color,
  storage_gb,
  specifications,
  price_cents,
  compare_at_price_cents,
  availability_status
`;

const IMAGE_COLUMNS = `
  id,
  product_id,
  variant_id,
  storage_path,
  alt_text,
  position,
  is_primary,
  created_at
`;

export async function getPublishedProducts(): Promise<CatalogProduct[]> {
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (productsError) {
    throw new Error(`Erro ao buscar produtos: ${productsError.message}`);
  }

  if (!products || products.length === 0) {
    return [];
  }

  const productIds = products.map((product) => product.id);

  const [
    { data: variants, error: variantsError },
    { data: images, error: imagesError },
  ] = await Promise.all([
    supabase
      .from("product_variants")
      .select(VARIANT_COLUMNS)
      .in("product_id", productIds),

    supabase
      .from("product_images")
      .select(IMAGE_COLUMNS)
      .in("product_id", productIds)
      .order("position", { ascending: true }),
  ]);

  if (variantsError) {
    throw new Error(`Erro ao buscar variantes: ${variantsError.message}`);
  }

  if (imagesError) {
    throw new Error(`Erro ao buscar imagens: ${imagesError.message}`);
  }

  return products.map((product) => {
    const productVariants: CatalogVariant[] = (variants ?? [])
      .filter((variant) => variant.product_id === product.id)
      .map((variant) => ({
        ...variant,
        specifications: variant.specifications as
          | Record<string, unknown>
          | null,
      }));

    const productImages: CatalogImage[] = (images ?? []).filter(
      (image) => image.product_id === product.id
    );

    return {
      ...product,
      variants: productVariants,
      images: productImages,
    };
  });
}

export async function getPublishedProductBySlug(
  slug: string
): Promise<CatalogProduct | null> {
  const products = await getPublishedProducts();

  return products.find((product) => product.slug === slug) ?? null;
}
