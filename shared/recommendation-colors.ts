import type { Product, ShopifyVariantMapping } from "./schema";

const COLOR_ORDER = ["black", "red", "navy", "irish green", "dark heather", "indigo blue", "sport grey"];
const colorKey = (color: string) => color.toLowerCase().trim();

function imageOptions(product: Product): (ShopifyVariantMapping | null)[] {
  const variants = product.shopifyVariants ?? [];
  const realColors = variants.filter((variant) => !/^(default|default title)$/i.test(variant.color.trim()));
  if (realColors.length === 0) return [null];
  const seen = new Set<string>();
  return realColors.filter((variant) => {
    const key = colorKey(variant.color);
    if (!variant.availableForSale || !variant.imageUrl || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => {
    const aRank = COLOR_ORDER.indexOf(colorKey(a.color));
    const bRank = COLOR_ORDER.indexOf(colorKey(b.color));
    return (aRank < 0 ? COLOR_ORDER.length : aRank) - (bRank < 0 ? COLOR_ORDER.length : bRank);
  });
}

/**
 * Keep every product if possible. Backtrack earlier color choices rather than
 * leave a later single-color product with a repeated color or an unlinked image.
 * A null entry represents a genuinely colorless product, such as a default mug.
 */
export function distinctImageVariants(products: Product[]): (ShopifyVariantMapping | null)[] | undefined {
  const options = products.map(imageOptions);
  if (options.some((variants) => variants.length === 0)) return undefined;
  const chosen: (ShopifyVariantMapping | null)[] = [];
  const used = new Set<string>();
  function pick(index: number): boolean {
    if (index === options.length) return true;
    for (const variant of options[index]) {
      const key = variant ? colorKey(variant.color) : null;
      if (key && used.has(key)) continue;
      chosen[index] = variant;
      if (key) used.add(key);
      // Fail early when a later card has no remaining photographed color.
      const possible = options.slice(index + 1).every((variants) =>
        variants.some((entry) => !entry || !used.has(colorKey(entry.color))),
      );
      if (possible && pick(index + 1)) return true;
      if (key) used.delete(key);
    }
    return false;
  }
  return pick(0) ? chosen : undefined;
}

/** Prefer the original row, then the fewest substitutions, retaining early slots. */
export function chooseDistinctColorProducts(
  originals: Product[],
  alternatives: Product[][],
  sameDesign: (a: string, b: string) => boolean,
): { products: Product[]; variants: (ShopifyVariantMapping | null)[] } {
  const originalVariants = distinctImageVariants(originals);
  if (originalVariants) return { products: originals, variants: originalVariants };
  for (let replacements = 1; replacements <= originals.length; replacements++) {
    const chosen: Product[] = [];
    let result: ReturnType<typeof chooseDistinctColorProducts> | undefined;
    const search = (index: number, changed: number): boolean => {
      if (index === originals.length) {
        const variants = distinctImageVariants(chosen);
        if (!variants) return false;
        result = { products: [...chosen], variants };
        return true;
      }
      const candidates = [originals[index], ...(changed < replacements ? alternatives[index] : [])];
      const visited = new Set<number>();
      for (const candidate of candidates) {
        if (visited.has(candidate.id)) continue;
        visited.add(candidate.id);
        const nextChanged = changed + (candidate.id === originals[index].id ? 0 : 1);
        if (nextChanged > replacements || chosen.some((entry) => sameDesign(entry.name, candidate.name))) continue;
        chosen.push(candidate);
        if (distinctImageVariants(chosen) && search(index + 1, nextChanged)) return true;
        chosen.pop();
      }
      return false;
    };
    if (search(0, 0)) return result!;
  }
  throw new Error("Not enough distinct photographed colors to create the recommendation row");
}
