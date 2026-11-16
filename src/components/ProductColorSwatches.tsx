import { getColorSwatch } from "../utils/productPresentation";
import type { CatalogVariant } from "../types/catalog";

type ProductColorSwatchesProps = {
  variants: Pick<CatalogVariant, "color">[];
};

export default function ProductColorSwatches({ variants }: ProductColorSwatchesProps) {
  const colors = [...new Map(
    variants
      .map((variant) => variant.color?.trim())
      .filter((color): color is string => Boolean(color))
      .map((color) => [color.toLocaleLowerCase("pt-BR"), color] as const)
  ).values()];

  if (colors.length === 0) return null;

  return (
    <div className="product-card-colors" role="group" aria-label={`Cores disponíveis: ${colors.join(", ")}`}>
      {colors.map((color) => {
        const swatch = getColorSwatch(color);
        return (
          <span
            className={`product-card-color${swatch ? "" : " is-unknown"}`}
            key={color.toLocaleLowerCase("pt-BR")}
            style={swatch ? { backgroundColor: swatch } : undefined}
            role="img"
            aria-label={color}
            title={color}
          />
        );
      })}
    </div>
  );
}
