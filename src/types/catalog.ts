
export type ProductStatus =
  | "draft"
  | "published"
  | "inactive"
  | "archived";

export type AvailabilityStatus =
  | "available"
  | "unavailable"
  | "preorder";

export interface CatalogCategory {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
}

export interface CatalogProduct {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  brand: string | null;
  model: string | null;
  short_description: string | null;
  description: string | null;
  published_at: string | null;
  variants: CatalogVariant[];
  images: CatalogImage[];
}

export interface CatalogVariant {
  id: string;
  product_id: string;
  color: string | null;
  storage_gb: number | null;
  specifications: Record<string, unknown> | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  availability_status: AvailabilityStatus;
}

export interface CatalogImage {
  id: string;
  product_id: string;
  variant_id: string | null;
  storage_path: string;
  alt_text: string | null;
  position: number;
  is_primary: boolean;
  created_at: string;
}

export interface CatalogProductWithVariants
  extends CatalogProduct {
  variants: CatalogVariant[];
}
