/**
 * Deterministic color-image variant selection, shared between the client
 * (shop grid) and the prerender build script so the build can predict the
 * exact image the first grid card renders (for the LCP preload).
 */

const NEUTRAL_COLORS = new Set([
  "white", "off white", "off-white", "natural", "ash", "cornsilk", "ivory",
  "cream", "snow", "grey", "gray", "heather", "athletic heather", "sport grey",
  "ice grey", "silver", "slate", "dark heather", "charcoal", "light grey",
  "light gray", "sand", "oatmeal",
]);

/** Extract the display-worthy color image URLs for a product (colorful first). */
export function getColorImageVariants(colorImages: Record<string, string> | null): string[] {
  if (!colorImages) return [];
  const entries = Object.entries(colorImages);
  if (entries.length === 0) return [];
  const colorful = entries.filter(([color]) => !NEUTRAL_COLORS.has(color.toLowerCase().trim()));
  const source = colorful.length > 0 ? colorful : entries;
  return source.map(([, url]) => url);
}

/**
 * Stable hash pick: the same product in the same grid slot always shows the
 * same variant. Must stay identical between client and prerender.
 */
export function pickVariantIndex(productId: number, cardIndex: number, count: number): number {
  let h = (productId * 2654435761 + cardIndex * 40503) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return h % count;
}
