import type { CatalogVariant } from "../types/catalog";

function normalizeColor(value: string): string {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function getColorSwatch(color: string): string | null {
  const normalized = normalizeColor(color);
  const hasColor = (pattern: RegExp) => pattern.test(normalized);

  // Nomes de acabamento podem combinar mais de uma palavra (ex.: "Laranja Cósmico").
  // Cores cromáticas têm precedência sobre nomes neutros como "Titânio".
  if (hasColor(/(^|[^a-z])(laranja|orange)(?=$|[^a-z])/)) return "#e87532";
  if (hasColor(/(^|[^a-z])(vermelho|red)(?=$|[^a-z])/)) return "#b9504b";
  if (hasColor(/(^|[^a-z])(azul|blue)(?=$|[^a-z])/)) return "#526d91";
  if (hasColor(/(^|[^a-z])(verde|green)(?=$|[^a-z])/)) return "#657665";
  if (hasColor(/(^|[^a-z])(rosa|pink)(?=$|[^a-z])/)) return "#c99ca8";
  if (hasColor(/(^|[^a-z])(amarelo|yellow)(?=$|[^a-z])/)) return "#c8b86f";
  if (hasColor(/(^|[^a-z])(roxo|lilas|purple)(?=$|[^a-z])/)) return "#85769a";
  if (hasColor(/(^|[^a-z])(dourado|gold)(?=$|[^a-z])/)) return "#c6a56a";
  if (hasColor(/(^|[^a-z])(prata|silver)(?=$|[^a-z])/)) return "#d0d0ce";
  if (hasColor(/(^|[^a-z])(branco|branca|white)(?=$|[^a-z])/)) return "#eeece7";
  if (hasColor(/(^|[^a-z])(preto|preta|black|obsidian|graphite)(?=$|[^a-z])/)) return "#17181c";
  if (hasColor(/(^|[^a-z])(cinza|gray|grey|titanium|titanio)(?=$|[^a-z])/)) return "#92949a";

  return null;
}

function normalizeCategory(value: string): string {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasCategoryToken(categorySlugs: string[], pattern: RegExp): boolean {
  return categorySlugs.some((slug) => pattern.test(normalizeCategory(slug)));
}

export function isIPhoneProduct(
  categorySlugs: string[],
  brand: string | null
): boolean {
  if (hasCategoryToken(categorySlugs, /(^|[-_\s])iphones?([-_\s]|$)/)) {
    return true;
  }

  const isPhoneCategory = hasCategoryToken(
    categorySlugs,
    /(^|[-_\s])(celular(?:es)?|smartphones?|telefone(?:s)?|mobile-phones?)([-_\s]|$)/
  );

  return isPhoneCategory && normalizeCategory(brand || "") === "apple";
}

export function getVariantDetailsWithoutStorage(
  variant: Pick<CatalogVariant, "color" | "specifications">
): string {
  const details: string[] = [];
  if (variant.color?.trim()) details.push(variant.color.trim());

  Object.entries(variant.specifications ?? {}).forEach(([key, value]) => {
    const normalizedKey = normalizeCategory(key);
    if (/(storage|armazen|memory|memoria|ram|capacity|capacidade|\bgb\b|\btb\b)/.test(normalizedKey)) {
      return;
    }

    if (["string", "number", "boolean"].includes(typeof value)) {
      const textValue = String(value);
      if (/^\s*\d+(?:[.,]\d+)?\s*(?:gb|tb)\s*$/i.test(textValue)) {
        return;
      }
      details.push(textValue);
    }
  });

  return details.join(" · ");
}

export function formatStorageCapacity(storageGb: number): string {
  return storageGb >= 1024 ? `${storageGb / 1024} TB` : `${storageGb} GB`;
}
