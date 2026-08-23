/**
 * Shopify CDN image URL transforms.
 *
 * Shopify's CDN resizes and re-encodes images on the fly via query
 * parameters (`width`, `format`). We request WebP renditions sized for the
 * surface an image renders on, instead of shipping multi-hundred-KB
 * originals. Non-Shopify URLs pass through untouched.
 *
 * Used by both the client components and the prerender build script so the
 * `<link rel="preload">` injected at build time matches the URL the client
 * renders byte-for-byte.
 */

const SHOPIFY_CDN_PATTERN = /^https:\/\/cdn\.shopify\.com\//i;

export function isShopifyCdnUrl(url: string): boolean {
  return SHOPIFY_CDN_PATTERN.test(url);
}

/** Append width + WebP format parameters to a Shopify CDN URL. */
export function shopifyImageUrl(url: string, width: number): string {
  if (!isShopifyCdnUrl(url)) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}width=${width}&format=webp`;
}

export interface ShopifyImagePreset {
  /** Rendition widths emitted into `srcset`. */
  widths: number[];
  /** `sizes` attribute describing the rendered slot width. */
  sizes: string;
  /** Width used for the plain `src` fallback. */
  fallbackWidth: number;
}

/**
 * Per-surface presets. Keep these in sync with the CSS that lays out each
 * surface (grid columns, fixed card widths, thumbnail boxes).
 */
export const IMAGE_PRESETS = {
  /** Shop grid card: exact responsive slot widths for the product grid. */
  gridCard: {
    widths: [160, 320, 480, 640],
    fallbackWidth: 480,
    sizes: "(max-width: 639px) calc((100vw - 3.75rem) / 2), (max-width: 767px) calc((100vw - 6rem) / 3), (max-width: 1279px) calc((100vw - 7rem) / 4), 254px",
  },
  /** Product detail main image: full width on mobile, capped at 320px on md+. */
  productDetail: {
    widths: [320, 480, 640, 960],
    fallbackWidth: 640,
    sizes: "(max-width: 767px) calc(100vw - 3rem), 320px",
  },
  /** Related products strip: fixed 180px cards. */
  relatedCard: {
    widths: [180, 360, 540],
    fallbackWidth: 360,
    sizes: "180px",
  },
  /** Culture deck rotating cards: fixed 140px wide. */
  cultureCard: {
    widths: [140, 280, 420],
    fallbackWidth: 280,
    sizes: "140px",
  },
  /** Cart line-item thumbnail: 64-80px square. */
  cartThumb: {
    widths: [80, 160, 240],
    fallbackWidth: 160,
    sizes: "80px",
  },
} as const satisfies Record<string, ShopifyImagePreset>;

export function shopifyImageSrcSet(url: string, widths: readonly number[]): string | undefined {
  if (!isShopifyCdnUrl(url)) return undefined;
  return widths.map((width) => `${shopifyImageUrl(url, width)} ${width}w`).join(", ");
}

export interface ResponsiveImageProps {
  src: string;
  srcSet?: string;
  sizes?: string;
}

/**
 * Build `src`/`srcSet`/`sizes` for an image tag (or the matching
 * `href`/`imagesrcset`/`imagesizes` for a preload link).
 */
export function shopifyImageProps(url: string, preset: ShopifyImagePreset): ResponsiveImageProps {
  if (!isShopifyCdnUrl(url)) return { src: url };
  return {
    src: shopifyImageUrl(url, preset.fallbackWidth),
    srcSet: shopifyImageSrcSet(url, preset.widths),
    sizes: preset.sizes,
  };
}
