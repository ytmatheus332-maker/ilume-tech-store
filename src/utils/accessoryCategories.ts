export type AccessoryGroup = "headphones" | "antennas" | "other";

const headphoneCategorySlugs = new Set(["fones", "fone-de-ouvido", "fones-de-ouvido", "headphones"]);
const starlinkCategorySlugs = new Set(["starlink", "antena-starlink", "antenas-starlink", "starlink-antennas"]);
const accessoriesRootSlugs = new Set([
  "acessorio", "acessorios", "outro-acessorio", "outros-acessorios", "accessory", "accessories",
]);

function normalizeCategorySlug(slug: string): string {
  return slug.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Category slugs are supplied from the persisted category and its parent chain. */
export function getAccessoryGroup(categorySlugs: string[]): AccessoryGroup | null {
  const ancestors = new Set(categorySlugs.map(normalizeCategorySlug));
  if ([...headphoneCategorySlugs].some((slug) => ancestors.has(slug))) return "headphones";
  if ([...starlinkCategorySlugs].some((slug) => ancestors.has(slug))) return "antennas";
  if ([...accessoriesRootSlugs].some((slug) => ancestors.has(slug))) return "other";
  return null;
}
