
import { supabase } from "../lib/supabase";
import type {
  CatalogProduct,
  CatalogVariant,
  CatalogImage,
  ProductCampaignType,
} from "../types/catalog";

interface ProductRow {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  brand: string | null;
  model: string | null;
  short_description: string | null;
  description: string | null;
  published_at: string | null;
  is_featured: boolean;
  campaign_type: ProductCampaignType;
  badge_label: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}

interface VariantRow {
  id: string;
  product_id: string;
  color: string | null;
  storage_gb: number | null;
  specifications: Record<string, unknown> | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  availability_status: CatalogVariant["availability_status"];
}

interface ImageRow {
  id: string;
  product_id: string;
  variant_id: string | null;
  storage_path: string;
  alt_text: string | null;
  position: number;
  is_primary: boolean;
  created_at: string;
}

const PRODUCT_COLUMNS = `
  id,
  category_id,
  name,
  slug,
  brand,
  model,
  short_description,
  description,
  published_at,
  is_featured,
  campaign_type,
  badge_label
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

  const productRows = (products ?? []) as unknown as ProductRow[];

  if (productRows.length === 0) {
    return [];
  }

  const productIds = productRows.map((product) => product.id);

  const [
    { data: variants, error: variantsError },
    { data: images, error: imagesError },
    { data: categories, error: categoriesError },
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
    supabase
      .from("categories")
      .select("id, name, slug, parent_id"),
  ]);

  if (variantsError) {
    throw new Error(`Erro ao buscar variantes: ${variantsError.message}`);
  }

  if (imagesError) {
    throw new Error(`Erro ao buscar imagens: ${imagesError.message}`);
  }

  const variantRows = (variants ?? []) as unknown as VariantRow[];
  const imageRows = (images ?? []) as unknown as ImageRow[];
  const categoryRows = categoriesError
    ? []
    : ((categories ?? []) as unknown as CategoryRow[]);
  const categoriesById = new Map(
    categoryRows.map((category) => [category.id, category])
  );

  function getCategorySlugs(categoryId: string | null): string[] {
    const slugs: string[] = [];
    const visited = new Set<string>();
    let currentId = categoryId;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const category = categoriesById.get(currentId);
      if (!category) break;
      slugs.push(category.slug || category.name);
      currentId = category.parent_id;
    }

    return slugs;
  }

  return productRows.map((product) => {
    const productVariants: CatalogVariant[] = variantRows
      .filter((variant) => variant.product_id === product.id)
      .map((variant) => ({ ...variant }));

    const productImages: CatalogImage[] = imageRows.filter(
      (image) => image.product_id === product.id
    );

    return {
      ...product,
      category_slugs: getCategorySlugs(product.category_id),
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
