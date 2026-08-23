import { mkdir, readdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import type { Product, ProductSummary } from "../shared/schema";
import { groupProducts, interleaveGroups, type FitType } from "../client/src/lib/product-grouping";
import { pickVariantIndex } from "../shared/image-variants";
import {
  IMAGE_PRESETS,
  shopifyImageProps,
  type ShopifyImagePreset,
} from "../shared/shopify-image";

const OUTPUT_DIR = path.resolve("dist/public");
const SITE_URL = (process.env.PUBLIC_SITE_URL || "https://myshirtsdope.com").replace(/\/+$/, "");
const PRODUCT_BATCH_SIZE = 50;

interface ShopLcpImage {
  url: string;
  productId: number;
  productName: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function metaDescription(value: string): string {
  const normalized = normalizeText(value);
  return normalized.length <= 160 ? normalized : `${normalized.slice(0, 157).trimEnd()}...`;
}

function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function replaceHeadTag(html: string, matcher: RegExp, replacement: string): string {
  if (matcher.test(html)) return html.replace(matcher, replacement);
  return html.replace(/<\/head>/i, `    ${replacement}\n  </head>`);
}

/**
 * Build a high-priority LCP image preload tag. When the target image tag uses
 * srcset/sizes, the preload carries matching imagesrcset/imagesizes so the
 * browser preloads exactly the rendition it will render.
 */
function imagePreloadTag(url: string, preset: ShopifyImagePreset, attributes = ""): string {
  const props = shopifyImageProps(url, preset);
  let tag = `<link rel="preload" as="image" href="${escapeHtml(props.src)}"`;
  if (props.srcSet && props.sizes) {
    tag += ` imagesrcset="${escapeHtml(props.srcSet)}" imagesizes="${escapeHtml(props.sizes)}"`;
  }
  if (attributes) tag += ` ${attributes}`;
  tag += ` fetchpriority="high" />`;
  return tag;
}

/**
 * Reproduce the exact image URL the client renders in the first shop grid
 * card: group + interleave the initial slim chunk (the client's initial data
 * source), then apply the same deterministic variant pick for card index 0.
 */
export function computeShopLcpImageUrl(slimInitial: ProductSummary[]): string | null {
  return computeShopLcpImage(slimInitial)?.url ?? null;
}

function computeShopLcpImage(slimInitial: ProductSummary[]): ShopLcpImage | null {
  const groups = interleaveGroups(groupProducts(slimInitial));
  const first = groups[0];
  if (!first) return null;
  const product = first.adult;
  const variants =
    "colorImageVariants" in product &&
    Array.isArray(product.colorImageVariants) &&
    product.colorImageVariants.length > 0
      ? product.colorImageVariants
      : null;
  // Mirrors the client exactly, including its fallback when the hash lands on
  // a negative/out-of-range index (variants[i] === undefined -> imageUrl).
  const pickedVariant = variants
    ? variants[pickVariantIndex(product.id, 0, variants.length)]
    : null;
  const url = pickedVariant ?? product.imageUrl;
  return url
    ? { url, productId: product.id, productName: product.name }
    : null;
}

function applyPageMetadata(
  template: string,
  metadata: {
    title: string;
    description: string;
    canonicalUrl: string;
    ogType: "website" | "product";
    imageUrl?: string;
    price?: number;
    jsonLd?: unknown;
    preloadImage?: { url: string; preset: ShopifyImagePreset; attributes?: string };
  },
): string {
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metaDescription(metadata.description));
  const canonicalUrl = escapeHtml(metadata.canonicalUrl);

  let html = replaceHeadTag(template, /<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  html = replaceHeadTag(
    html,
    /<meta\s+name=["']description["'][^>]*>/i,
    `<meta name="description" content="${description}" />`,
  );
  html = replaceHeadTag(
    html,
    /<meta\s+property=["']og:title["'][^>]*>/i,
    `<meta property="og:title" content="${title}" />`,
  );
  html = replaceHeadTag(
    html,
    /<meta\s+property=["']og:description["'][^>]*>/i,
    `<meta property="og:description" content="${description}" />`,
  );

  const headTags = [
    {
      matcher: /<link\s+rel=["']canonical["'][^>]*>/i,
      replacement: `<link rel="canonical" href="${canonicalUrl}" />`,
    },
    {
      matcher: /<meta\s+property=["']og:site_name["'][^>]*>/i,
      replacement: `<meta property="og:site_name" content="MyShirtsDope" />`,
    },
    {
      matcher: /<meta\s+property=["']og:type["'][^>]*>/i,
      replacement: `<meta property="og:type" content="${metadata.ogType}" />`,
    },
    {
      matcher: /<meta\s+property=["']og:url["'][^>]*>/i,
      replacement: `<meta property="og:url" content="${canonicalUrl}" />`,
    },
    {
      matcher: /<meta\s+name=["']twitter:card["'][^>]*>/i,
      replacement: `<meta name="twitter:card" content="${metadata.imageUrl ? "summary_large_image" : "summary"}" />`,
    },
    {
      matcher: /<meta\s+name=["']twitter:title["'][^>]*>/i,
      replacement: `<meta name="twitter:title" content="${title}" />`,
    },
    {
      matcher: /<meta\s+name=["']twitter:description["'][^>]*>/i,
      replacement: `<meta name="twitter:description" content="${description}" />`,
    },
  ];

  if (metadata.imageUrl) {
    const imageUrl = escapeHtml(metadata.imageUrl);
    headTags.push(
      {
        matcher: /<meta\s+property=["']og:image["'][^>]*>/i,
        replacement: `<meta property="og:image" content="${imageUrl}" />`,
      },
      {
        matcher: /<meta\s+name=["']twitter:image["'][^>]*>/i,
        replacement: `<meta name="twitter:image" content="${imageUrl}" />`,
      },
    );
  }

  if (metadata.price !== undefined) {
    headTags.push(
      {
        matcher: /<meta\s+property=["']product:price:amount["'][^>]*>/i,
        replacement: `<meta property="product:price:amount" content="${metadata.price.toFixed(2)}" />`,
      },
      {
        matcher: /<meta\s+property=["']product:price:currency["'][^>]*>/i,
        replacement: `<meta property="product:price:currency" content="USD" />`,
      },
    );
  }

  for (const { matcher, replacement } of headTags) {
    html = replaceHeadTag(html, matcher, replacement);
  }

  if (metadata.preloadImage) {
    html = html.replace(
      /<\/head>/i,
      `    ${imagePreloadTag(
        metadata.preloadImage.url,
        metadata.preloadImage.preset,
        metadata.preloadImage.attributes,
      )}\n  </head>`,
    );
  }

  if (metadata.jsonLd) {
    html = html.replace(
      /<\/head>/i,
      `    <script type="application/ld+json">${safeJsonLd(metadata.jsonLd)}</script>\n  </head>`,
    );
  }

  return html;
}

function injectPrerenderedRoot(template: string, content: string): string {
  const rootPattern = /<div\s+id=["']root["']\s*><\/div>/i;
  if (!rootPattern.test(template)) {
    throw new Error("Built client shell is missing the empty #root element");
  }

  return template.replace(
    rootPattern,
    `<div id="root" data-prerendered="true">${content}</div>`,
  );
}

function renderShopContent(products: Product[], lcpImage: ShopLcpImage): string {
  const imageProps = shopifyImageProps(lcpImage.url, IMAGE_PRESETS.gridCard);
  const responsiveAttrs = imageProps.srcSet && imageProps.sizes
    ? ` srcset="${escapeHtml(imageProps.srcSet)}" sizes="${escapeHtml(imageProps.sizes)}"`
    : "";
  const productLinks = products
    .map(
      (product) => `
          <li>
            <a href="/product/${product.id}">
              <strong>${escapeHtml(product.name)}</strong>
              <span> — $${product.price.toFixed(2)}</span>
            </a>
          </li>`,
    )
    .join("");

  return `
      <main data-prerendered-page="shop" style="max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem;">
        <header>
          <h1>Shop MyShirtsDope</h1>
          <p>Browse shirts, hoodies, onesies, and accessories inspired by music, culture, and love.</p>
        </header>
        <section aria-label="Featured product">
          <a href="/product/${lcpImage.productId}" style="display: block; width: min(46vw, 254px); aspect-ratio: 1; margin: 1.5rem 0; overflow: hidden;">
            <img src="${escapeHtml(imageProps.src)}"${responsiveAttrs} alt="${escapeHtml(lcpImage.productName)}" width="400" height="400" loading="eager" fetchpriority="high" style="display: block; width: 100%; height: 100%; object-fit: cover;" />
          </a>
        </section>
        <section aria-labelledby="catalog-heading">
          <h2 id="catalog-heading">Product catalog</h2>
          <ul>${productLinks}
          </ul>
        </section>
      </main>`;
}

const PDP_PRERENDER_CRITICAL_CSS = `
    [data-prerendered-pdp-shell] { min-height: 100vh; display: flex; flex-direction: column; background: hsl(240 10% 5%); color: hsl(50 10% 92%); }
    [data-prerendered-pdp-navbar] { position: sticky; top: 0; z-index: 50; min-height: 64px; border-bottom: 1px solid hsl(240 8% 16%); background: hsl(240 10% 5% / .9); }
    [data-prerendered-pdp-navbar] > div { max-width: 1280px; min-height: 64px; margin: 0 auto; padding: 0 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    [data-prerendered-pdp-nav-links] { display: none; }
    [data-prerendered-pdp-main] { flex: 1; }
    [data-prerendered-pdp-content] { width: 100%; max-width: 1400px; margin: 0 auto; padding: 2.5rem 1.5rem; }
    [data-prerendered-pdp-shell] .retro-divider { height: 4px; }
    [data-prerendered-pdp-back] { display: inline-flex; align-items: center; gap: .5rem; min-height: 32px; margin-bottom: 1.5rem; padding: 0 .75rem; border: 1px solid transparent; border-radius: .375rem; font-size: .875rem; line-height: 1.25rem; }
    [data-prerendered-pdp-layout] { display: flex; flex-direction: column; align-items: flex-start; gap: 1.5rem; }
    [data-prerendered-pdp-hero-wrap] { width: 100%; flex-shrink: 0; }
    [data-prerendered-pdp-hero] { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; border: 1px solid hsl(240 8% 14%); border-radius: .375rem; background: hsl(240 10% 8%); }
    [data-prerendered-pdp-hero] img { display: block; width: 100%; height: 100%; object-fit: contain; }
    [data-prerendered-pdp-info] { width: 100%; display: flex; flex: 1; flex-direction: column; gap: 1.25rem; }
    [data-prerendered-pdp-title] { margin: 0 0 .375rem; font-size: 1.5rem; line-height: 2rem; }
    [data-prerendered-pdp-price] { display: flex; align-items: center; min-height: 44px; }
    [data-prerendered-pdp-description] { display: none; margin: 0; font-size: .875rem; line-height: 1.625; }
    [data-prerendered-pdp-fit-slot] { min-height: 68px; }
    [data-prerendered-pdp-label] { display: block; margin-bottom: .5rem; font-size: 8px; line-height: 1rem; }
    [data-prerendered-pdp-control-row] { display: flex; flex-wrap: wrap; gap: .375rem; min-height: 44px; }
    [data-prerendered-pdp-fit-slot] [data-prerendered-pdp-control-row] { gap: .5rem; }
    [data-prerendered-pdp-option] { display: inline-flex; align-items: center; min-height: 44px; padding: .375rem .75rem; border: 1px solid hsl(240 8% 16%); border-radius: .375rem; font-size: .75rem; line-height: 1rem; }
    [data-prerendered-pdp-details] { display: block; min-height: 44px; overflow: hidden; border: 1px solid hsl(240 8% 14%); border-radius: .375rem; }
    [data-prerendered-pdp-details] summary { min-height: 44px; padding: .75rem 1rem; }
    [data-prerendered-pdp-divider] { height: 4px; margin: .25rem 0; }
    [data-prerendered-pdp-add] { display: inline-flex; width: 100%; min-height: 44px; align-items: center; justify-content: center; gap: .75rem; padding: 1.25rem 1rem; border: 1px solid hsl(200 100% 55%); border-radius: .375rem; }
    @media (min-width: 640px) { [data-prerendered-pdp-content] { padding-left: 2rem; padding-right: 2rem; } }
    @media (min-width: 768px) {
      [data-prerendered-pdp-nav-links] { display: flex; gap: 1.5rem; }
      [data-prerendered-pdp-layout] { flex-direction: row; gap: 2.5rem; }
      [data-prerendered-pdp-hero-wrap] { max-width: 320px; }
      [data-prerendered-pdp-description] { display: block; }
      [data-prerendered-pdp-details] { display: none; }
    }
    @media (min-width: 640px) { [data-prerendered-pdp-title] { font-size: 1.875rem; line-height: 2.25rem; } }
`;

/**
 * Critical geometry for the prerendered homepage shell. Mirrors the hydrated
 * App/Home layout (navbar, hero, reserved tagline + culture-deck stage,
 * marquee, category grid, CTA, footer) so first paint and the hydrated tree
 * occupy identical space at every breakpoint — before and after the deferred
 * stylesheet activates.
 */
const HOME_PRERENDER_CRITICAL_CSS = `
    [data-non-home-route] [data-prerendered-home-shell] { display: none; }
    [data-prerendered-home-shell] { min-height: 100vh; display: flex; flex-direction: column; line-height: 1.5; background: hsl(240 10% 5%); color: hsl(50 10% 92%); }
    [data-prerendered-home-shell] h1, [data-prerendered-home-shell] h2, [data-prerendered-home-shell] h3, [data-prerendered-home-shell] h4, [data-prerendered-home-shell] p { margin: 0; }
    [data-prerendered-home-shell] a { color: inherit; text-decoration: inherit; }
    [data-prerendered-home-shell] nav { position: sticky; top: 0; z-index: 50; min-height: 64px; border-bottom: 1px solid hsl(240 8% 16%); background: hsl(240 10% 5% / .9); }
    [data-prerendered-home-shell] nav > div { max-width: 1280px; min-height: 64px; margin: 0 auto; padding: 0 1rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    [data-prerendered-home-shell] [data-prerendered-pdp-nav-links] { display: none; }
    [data-prerendered-home-shell] [data-prerendered-home-main] { flex: 1 1 0%; }
    [data-prerendered-home-shell] [data-prerendered-home-page] { min-height: 100vh; }
    [data-prerendered-home-shell] [data-prerendered-home-hero] { position: relative; min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; }
    [data-prerendered-home-shell] [data-prerendered-home-hero-content] { position: relative; z-index: 10; max-width: 56rem; margin: 0 auto; padding: 0 1rem; text-align: center; }
    [data-prerendered-home-shell] [data-prerendered-home-kicker] { margin-bottom: 1rem; font-size: 9px; letter-spacing: .1em; color: #39ff14; }
    [data-prerendered-home-shell] [data-prerendered-home-title] { margin-bottom: 1.5rem; font-size: 1.5rem; line-height: 1.625; color: #00b4ff; }
    [data-prerendered-home-shell] [data-prerendered-home-tagline] { position: relative; max-width: 42rem; margin: 0 auto 2.5rem; }
    [data-prerendered-home-shell] [data-prerendered-home-tagline-sizer] { visibility: hidden; font-size: 1.125rem; line-height: 1.625; min-height: 56px; }
    [data-prerendered-home-shell] [data-prerendered-home-tagline-live] { position: absolute; inset: 0; font-size: 1.125rem; line-height: 1.625; color: hsl(50 10% 92% / .9); }
    [data-prerendered-home-shell] [data-prerendered-home-cta] { display: inline-flex; align-items: center; justify-content: center; gap: .75rem; padding: 1.5rem 2rem; border: 1px solid #00b4ff; border-radius: .375rem; background: #00b4ff; color: #fff; font-size: 10px; white-space: nowrap; }
    [data-prerendered-home-shell] [data-prerendered-home-cta] svg { width: 1rem; height: 1rem; }
    [data-prerendered-home-shell] [data-prerendered-home-deck] { display: flex; flex-direction: column; align-items: center; margin-top: 3rem; margin-bottom: 3rem; }
    [data-prerendered-home-shell] [data-prerendered-home-deck-label] { margin-bottom: 1.5rem; font-size: 9px; letter-spacing: .1em; color: #ffd700; }
    [data-prerendered-home-shell] [data-prerendered-home-deck-stage] { position: relative; width: 340px; height: 260px; }
    [data-prerendered-home-shell] [data-prerendered-home-deck-hint] { margin-top: .75rem; font-size: 10px; color: hsl(0 0% 100% / .3); }
    [data-prerendered-home-shell] [data-prerendered-home-marquee] { overflow: hidden; border-top: 1px solid hsl(240 8% 16%); border-bottom: 1px solid hsl(240 8% 16%); background: hsl(240 10% 8% / .5); }
    [data-prerendered-home-shell] [data-prerendered-home-marquee] > div { display: flex; white-space: nowrap; padding: .75rem 0; }
    [data-prerendered-home-shell] [data-prerendered-home-marquee] span { font-size: .875rem; line-height: 1.25rem; }
    [data-prerendered-home-shell] [data-prerendered-home-marquee] > div > span { margin: 0 1.5rem; color: hsl(240 5% 55%); }
    [data-prerendered-home-shell] [data-prerendered-home-marquee] > div > span > span { margin: 0 1rem; color: #00b4ff; }
    [data-prerendered-home-shell] [data-prerendered-home-section] { padding: 5rem 1rem; }
    [data-prerendered-home-shell] [data-prerendered-home-section-inner] { max-width: 72rem; margin: 0 auto; }
    [data-prerendered-home-shell] [data-prerendered-home-rep-heading] { margin-bottom: 3rem; text-align: center; font-size: .875rem; line-height: 1.25rem; color: #ffd700; }
    [data-prerendered-home-shell] [data-prerendered-home-grid] { display: grid; grid-template-columns: 1fr; gap: 1.5rem; }
    [data-prerendered-home-shell] [data-prerendered-home-card] { padding: 1.5rem; text-align: center; background: hsl(240 10% 8%); border: 1px solid hsl(240 8% 14%); border-radius: .375rem; }
    [data-prerendered-home-shell] [data-prerendered-home-card] h3 { margin-bottom: .75rem; font-size: 10px; }
    [data-prerendered-home-shell] [data-prerendered-home-card] p { font-size: 1rem; line-height: 1.625; color: hsl(240 5% 55%); }
    [data-prerendered-home-shell] .retro-divider { height: 4px; }
    [data-prerendered-home-shell] [data-prerendered-home-cta-section] { padding: 5rem 1rem; text-align: center; }
    [data-prerendered-home-shell] [data-prerendered-home-cta-heading] { margin-bottom: 1rem; font-size: .875rem; line-height: 1.25rem; color: #39ff14; }
    [data-prerendered-home-shell] [data-prerendered-home-cta-copy] { margin: 0 auto 2rem; max-width: 28rem; font-size: 1.125rem; line-height: 1.625; color: hsl(240 5% 55%); }
    [data-prerendered-home-shell] [data-prerendered-home-browse] { display: inline-flex; align-items: center; justify-content: center; padding: 1.25rem 2rem; border: 1px solid #ffd700; border-radius: .375rem; background: #ffd700; color: #000; font-size: 10px; white-space: nowrap; }
    [data-prerendered-home-shell] [data-prerendered-home-footer] { min-height: 300px; border-top: 1px solid hsl(240 8% 16%); background: hsl(240 10% 5%); }
    [data-prerendered-home-shell] [data-prerendered-home-footer-inner] { max-width: 1280px; margin: 0 auto; padding: 2.5rem 1rem; }
    [data-prerendered-home-shell] [data-prerendered-home-footer-grid] { display: grid; grid-template-columns: 1fr; gap: 2rem; }
    [data-prerendered-home-shell] [data-prerendered-home-footer-grid] h3 { margin-bottom: 1rem; font-size: 10px; color: #00b4ff; }
    [data-prerendered-home-shell] [data-prerendered-home-footer-grid] h4 { margin-bottom: 1rem; font-size: 9px; }
    [data-prerendered-home-shell] [data-prerendered-home-footer-col-links] { display: flex; flex-direction: column; gap: .5rem; }
    [data-prerendered-home-shell] [data-prerendered-home-footer-grid] p, [data-prerendered-home-shell] [data-prerendered-home-footer-grid] span { font-size: 1rem; line-height: 1.625; color: hsl(240 5% 55%); }
    [data-prerendered-home-shell] [data-prerendered-home-footer-bottom] { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid hsl(240 8% 16% / .5); text-align: center; }
    [data-prerendered-home-shell] [data-prerendered-home-footer-bottom] p { font-size: 8px; color: hsl(240 5% 55%); }
    @media (max-width: 640px) {
      [data-prerendered-home-shell] [data-prerendered-home-hero-content] { line-height: 1.35; min-height: 560px; }
    }
    @media (max-width: 639px) {
      [data-prerendered-home-shell] [data-prerendered-home-footer] { min-height: 640px; }
    }
    @media (min-width: 640px) {
      [data-prerendered-home-shell] [data-prerendered-home-kicker], [data-prerendered-home-shell] [data-prerendered-home-deck-label] { font-size: 10px; }
      [data-prerendered-home-shell] [data-prerendered-home-title] { font-size: 2.25rem; line-height: 2.5rem; }
      [data-prerendered-home-shell] [data-prerendered-home-tagline-sizer], [data-prerendered-home-shell] [data-prerendered-home-tagline-live] { font-size: 1.25rem; }
      [data-prerendered-home-shell] [data-prerendered-home-cta] { font-size: .75rem; line-height: 1rem; }
      [data-prerendered-home-shell] [data-prerendered-home-deck-stage] { width: 700px; height: 300px; }
      [data-prerendered-home-shell] [data-prerendered-home-rep-heading], [data-prerendered-home-shell] [data-prerendered-home-cta-heading] { font-size: 1rem; line-height: 1.5rem; }
      [data-prerendered-home-shell] [data-prerendered-home-grid] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      [data-prerendered-home-shell] [data-prerendered-home-footer] { min-height: 336px; }
      [data-prerendered-home-shell] [data-prerendered-home-footer-grid] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (min-width: 768px) {
      [data-prerendered-home-shell] [data-prerendered-pdp-nav-links] { display: flex; gap: 1.5rem; }
      [data-prerendered-home-shell] [data-prerendered-home-title] { font-size: 3rem; line-height: 1; }
    }
    @media (min-width: 1024px) {
      [data-prerendered-home-shell] [data-prerendered-home-grid] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    }
`;

const HOME_MARQUEE_ITEMS = [
  "HIP HOP", "R&B", "SOUL", "POP", "CULTURE", "LOVE", "OLD SCHOOL", "NEW VIBES",
  "HIP HOP", "R&B", "SOUL", "POP", "CULTURE", "LOVE", "OLD SCHOOL", "NEW VIBES",
];

const HOME_REP_CARDS = [
  { title: "HIP HOP", desc: "Old school beats, fresh threads. Rep the culture that started it all.", color: "text-neon-blue", glow: "neon-text-blue" },
  { title: "R&B / SOUL", desc: "Smooth vibes, timeless style. Wear the feeling of every classic track.", color: "text-neon-yellow", glow: "neon-text-yellow" },
  { title: "LOVE", desc: "Spread love through wearable art. Because culture starts with heart.", color: "text-neon-green", glow: "neon-text-green" },
  { title: "CULTURE", desc: "Represent a time, feeling, event, place, song, or artist you love.", color: "text-neon-orange", glow: "neon-text-orange" },
];

function renderHomeContent(): string {
  const marquee = HOME_MARQUEE_ITEMS
    .map((item) => `<span class="font-display text-sm mx-6 text-muted-foreground">${escapeHtml(item)}<span class="text-neon-blue mx-4">&middot;</span></span>`)
    .join("");
  const repCards = HOME_REP_CARDS
    .map((card) => `<div data-prerendered-home-card class="bg-card border border-card-border rounded-md p-6 text-center"><h3 class="font-pixel text-[10px] ${card.color} ${card.glow} mb-3">${escapeHtml(card.title)}</h3><p class="font-display text-base text-muted-foreground leading-relaxed">${escapeHtml(card.desc)}</p></div>`)
    .join("");
  const chevron = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>`;

  return `
      <div data-prerendered-home-shell class="min-h-screen flex flex-col bg-background pixel-grid-bg">
        ${renderPrerenderedNavbar()}
        <main data-prerendered-home-main class="flex-1">
          <div data-prerendered-home-page class="min-h-screen">
            <section data-prerendered-home-hero class="relative min-h-[70vh] flex flex-col items-center justify-center overflow-hidden pixel-grid-bg">
              <div data-prerendered-home-hero-content class="homepage-hero-content relative z-10 text-center px-4 max-w-4xl mx-auto">
                <div>
                  <p data-prerendered-home-kicker class="font-pixel text-[9px] sm:text-[10px] text-neon-green neon-text-green mb-4 tracking-widest">WELCOME TO</p>
                  <h1 data-prerendered-home-title class="font-pixel text-2xl sm:text-4xl md:text-5xl text-neon-blue neon-text-blue mb-6 leading-relaxed">MyShirtsDope</h1>
                  <div data-prerendered-home-tagline class="relative max-w-2xl mx-auto mb-10">
                    <p aria-hidden="true" data-prerendered-home-tagline-sizer class="invisible font-display text-lg sm:text-xl leading-relaxed min-h-[56px]">Shirts, hoodies, onesies, and accessories for all ages inspired by music, culture and love.<span>|</span></p>
                    <p data-prerendered-home-tagline-live class="absolute inset-0 font-display text-lg sm:text-xl text-foreground/90 leading-relaxed"><span>|</span></p>
                  </div>
                  <a data-prerendered-home-cta href="/shop" class="inline-flex items-center justify-center gap-3 font-pixel text-[10px] sm:text-xs bg-neon-blue border border-neon-blue text-white px-8 py-6 rounded-md whitespace-nowrap">ENTER THE STORE${chevron}</a>
                </div>
                <div data-prerendered-home-deck class="flex flex-col items-center mt-12 mb-12">
                  <p data-prerendered-home-deck-label class="font-pixel text-[9px] sm:text-[10px] text-neon-yellow neon-text-yellow mb-6 tracking-widest">&#9654; LATEST DROPS</p>
                  <div data-prerendered-home-deck-stage class="relative w-[340px] h-[260px] sm:w-[700px] sm:h-[300px]"></div>
                  <p data-prerendered-home-deck-hint class="text-white/30 text-[10px] mt-3 font-body">Tap a card to view &bull; Drag to spin</p>
                </div>
              </div>
            </section>
            <div data-prerendered-home-marquee class="border-y border-border bg-card/50 overflow-hidden">
              <div class="flex whitespace-nowrap py-3">${marquee}</div>
            </div>
            <section data-prerendered-home-section class="py-20 px-4">
              <div data-prerendered-home-section-inner class="max-w-6xl mx-auto">
                <h2 data-prerendered-home-rep-heading class="font-pixel text-sm sm:text-base text-center text-neon-yellow neon-text-yellow mb-12">WHAT WE REP</h2>
                <div data-prerendered-home-grid class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">${repCards}</div>
              </div>
            </section>
            <div data-prerendered-home-divider class="retro-divider"></div>
            <section data-prerendered-home-cta-section class="py-20 px-4 text-center">
              <h2 data-prerendered-home-cta-heading class="font-pixel text-sm sm:text-base text-neon-green neon-text-green mb-4">READY TO PLAY?</h2>
              <p data-prerendered-home-cta-copy class="font-display text-lg text-muted-foreground mb-8 max-w-md mx-auto">Browse our collection of unique merch inspired by the music and moments that shaped culture.</p>
              <a data-prerendered-home-browse href="/shop" class="inline-flex items-center justify-center font-pixel text-[10px] bg-neon-yellow border border-neon-yellow text-black px-8 py-5 rounded-md whitespace-nowrap">BROWSE COLLECTION</a>
            </section>
          </div>
        </main>
        <footer data-prerendered-home-footer class="storefront-footer border-t border-border bg-background min-h-[300px]">
          <div class="retro-divider"></div>
          <div data-prerendered-home-footer-inner class="max-w-7xl mx-auto px-4 py-10">
            <div data-prerendered-home-footer-grid class="grid grid-cols-1 sm:grid-cols-3 gap-8">
              <div>
                <h3 class="font-pixel text-[10px] text-neon-blue neon-text-blue mb-4">MyShirtsDope</h3>
                <p class="font-display text-base text-muted-foreground leading-relaxed">Shirts, hoodies, onesies, and accessories for all ages inspired by music, culture and love.</p>
              </div>
              <div>
                <h4 class="font-pixel text-[9px] text-neon-yellow mb-4">NAVIGATE</h4>
                <div data-prerendered-home-footer-col-links class="flex flex-col gap-2">
                  <a href="/shop"><span class="font-display text-base text-muted-foreground">Shop</span></a>
                  <a href="/about"><span class="font-display text-base text-muted-foreground">Our Story</span></a>
                  <a href="/contact"><span class="font-display text-base text-muted-foreground">Contact</span></a>
                </div>
              </div>
              <div>
                <h4 class="font-pixel text-[9px] text-neon-green mb-4">CATEGORIES</h4>
                <div data-prerendered-home-footer-col-links class="flex flex-col gap-2">
                  <a href="/shop?category=Shirts"><span class="font-display text-base text-muted-foreground">Shirts</span></a>
                  <a href="/shop?category=Hoodies"><span class="font-display text-base text-muted-foreground">Hoodies</span></a>
                  <a href="/shop?category=Onesies"><span class="font-display text-base text-muted-foreground">Onesies</span></a>
                  <a href="/shop?category=Accessories"><span class="font-display text-base text-muted-foreground">Accessories</span></a>
                </div>
              </div>
            </div>
            <div data-prerendered-home-footer-bottom class="mt-10 pt-6 border-t border-border/50 text-center">
              <p class="font-pixel text-[8px] text-muted-foreground">MyShirtsDope.com &mdash; CULTURE NEVER DIES</p>
            </div>
          </div>
        </footer>
      </div>`;
}

/**
 * Discover the built home route chunk and its transitive static imports so
 * the homepage can preload them all in parallel instead of walking the
 * index -> home -> starfield/query -> data discovery chain at runtime.
 */
async function collectHomeModulePreloads(template: string): Promise<string[]> {
  const assetsDir = path.join(OUTPUT_DIR, "assets");
  const assetFiles = await readdir(assetsDir);
  const homeEntry = assetFiles.find((file) => /^home-[\w-]+\.js$/.test(file));
  if (!homeEntry) {
    throw new Error("Could not find the built home route chunk for modulepreload");
  }
  const entryChunk = template.match(/src="\/assets\/(index-[\w-]+\.js)"/)?.[1];
  const ordered: string[] = [];
  const seen = new Set<string>();
  const queue = [homeEntry];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file) || file === entryChunk) continue;
    seen.add(file);
    ordered.push(file);
    const source = await readFile(path.join(assetsDir, file), "utf-8");
    for (const match of source.matchAll(/["']\.\/([\w.-]+\.js)["']/g)) {
      queue.push(match[1]);
    }
  }
  return ordered.map((file) => `/assets/${file}`);
}

function renderHomePage(template: string, modulePreloadHrefs: string[]): string {
  const gateScript = `<script data-home-shell-gate="true">(function(){var p=window.location.pathname.replace(/\\/+$/,"")||"/";if(p!=="/"){document.documentElement.setAttribute("data-non-home-route","");}})();</script>`;
  const preloadScript = `<script data-home-modulepreload="true">(function(){var p=window.location.pathname.replace(/\\/+$/,"")||"/";if(p!=="/"&&p!=="/start")return;${JSON.stringify(modulePreloadHrefs)}.forEach(function(h){var l=document.createElement("link");l.rel="modulepreload";l.href=h;document.head.appendChild(l);});})();</script>`;
  const html = template.replace(
    /<\/head>/i,
    () => `    ${gateScript}\n    <style data-prerendered-home-critical="true">${HOME_PRERENDER_CRITICAL_CSS}</style>\n    ${preloadScript}\n  </head>`,
  );
  return injectPrerenderedRoot(html, renderHomeContent());
}

function getFitLabel(fit: FitType): string {
  if (fit === "youth") return "YOUTH / KIDS";
  if (fit === "toddler") return "TODDLER / BABY";
  return "ADULT";
}

function renderPrerenderedNavbar(): string {
  return `
      <nav data-prerendered-pdp-navbar class="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
        <div class="max-w-7xl mx-auto px-4 flex items-center justify-between gap-4 h-16">
          <a href="/" class="font-pixel text-xs sm:text-sm text-neon-blue neon-text-blue tracking-wider">MyShirtsDope</a>
          <div data-prerendered-pdp-nav-links class="hidden md:flex items-center gap-6">
            <a href="/" class="font-display text-sm tracking-wide text-muted-foreground">HOME</a>
            <a href="/shop" class="font-display text-sm tracking-wide text-neon-yellow neon-text-yellow">SHOP</a>
            <a href="/about" class="font-display text-sm tracking-wide text-muted-foreground">STORY</a>
            <a href="/contact" class="font-display text-sm tracking-wide text-muted-foreground">CONTACT</a>
          </div>
          <div class="flex items-center gap-2">
            <a href="/cart" aria-label="Shopping cart, 0 items" class="inline-flex h-9 w-9 items-center justify-center border border-transparent rounded-md" aria-hidden="true"></a>
            <button type="button" class="inline-flex h-9 w-9 items-center justify-center border border-transparent rounded-md md:hidden" aria-label="Open navigation menu" aria-hidden="true"></button>
          </div>
        </div>
      </nav>`;
}

function renderProductContent(product: Product, availableFits: FitType[], selectedFit: FitType): string {
  const imageProps = product.imageUrl
    ? shopifyImageProps(product.imageUrl, IMAGE_PRESETS.productDetail)
    : null;
  const responsiveAttrs = imageProps?.srcSet && imageProps.sizes
    ? ` srcset="${escapeHtml(imageProps.srcSet)}" sizes="${escapeHtml(imageProps.sizes)}"`
    : "";
  const image = product.imageUrl && imageProps
    ? `<link itemprop="image" href="${escapeHtml(product.imageUrl)}" />
          <div data-prerendered-pdp-hero-wrap class="w-full md:max-w-[320px] flex-shrink-0">
            <div data-prerendered-pdp-hero class="relative aspect-square bg-card border border-card-border rounded-md overflow-hidden">
              <img src="${escapeHtml(imageProps.src)}"${responsiveAttrs} alt="${escapeHtml(product.name)}" loading="eager" fetchpriority="high" width="320" height="320" />
              <div class="scanline-overlay opacity-30"></div>
            </div>
          </div>`
    : "";
  const fitControls = availableFits.length > 1
    ? `<div data-prerendered-pdp-fit-slot class="min-h-[68px]">
          <label data-prerendered-pdp-label class="font-pixel text-[8px] text-muted-foreground block mb-2">SELECT FIT</label>
          <div data-prerendered-pdp-control-row class="flex flex-wrap gap-2">
            ${availableFits.map((fit) => `<span data-prerendered-pdp-option class="inline-flex items-center font-display text-xs px-3 py-1.5 min-h-[44px] rounded-md border ${fit === selectedFit ? "bg-neon-green/20 border-neon-green text-neon-green" : "border-border text-muted-foreground"}">${getFitLabel(fit)}</span>`).join("")}
          </div>
        </div>`
    : "";
  const sizes = product.sizes.length > 0
    ? `<div>
          <label data-prerendered-pdp-label class="font-pixel text-[8px] text-muted-foreground block mb-2">SELECT SIZE</label>
          <div data-prerendered-pdp-control-row class="min-h-[44px] flex flex-wrap gap-1.5">
            ${product.sizes.map((size) => `<span data-prerendered-pdp-option class="inline-flex items-center font-display text-xs px-3 py-1.5 min-h-[44px] rounded-md border border-border text-muted-foreground">${escapeHtml(size)}</span>`).join("")}
          </div>
        </div>`
    : "";
  const colors = product.colors.length > 0
    ? `<div class="mt-4">
          <label data-prerendered-pdp-label class="font-pixel text-[8px] text-muted-foreground block mb-2">SELECT COLOR</label>
          <div data-prerendered-pdp-control-row class="min-h-[44px] flex flex-wrap gap-1.5">
            ${product.colors.map((color) => `<span data-prerendered-pdp-option class="inline-flex items-center gap-1.5 font-display text-xs px-3 py-1.5 min-h-[44px] rounded-md border border-border text-muted-foreground"><span class="inline-block w-3 h-3 rounded-full border border-white/20"></span>${escapeHtml(color)}</span>`).join("")}
          </div>
        </div>`
    : "";

  return `
      <div data-prerendered-pdp-shell class="min-h-screen flex flex-col bg-background pixel-grid-bg">
        ${renderPrerenderedNavbar()}
        <main data-prerendered-pdp-main class="flex-1">
          <div class="min-h-screen">
            <div class="retro-divider"></div>
            <div data-prerendered-pdp-content class="max-w-[1400px] mx-auto px-6 sm:px-8 py-10">
              <a data-prerendered-pdp-back href="/shop" class="inline-flex items-center gap-2 mb-6 min-h-8 rounded-md px-3 border border-transparent font-display text-sm">← Back to Shop</a>
              <article data-prerendered-pdp-layout class="flex flex-col md:flex-row items-start gap-6 md:gap-10" itemscope itemtype="https://schema.org/Product">
                ${image}
                <div data-prerendered-pdp-info class="flex-1 flex flex-col gap-5">
                  <div>
                    <h1 data-prerendered-pdp-title itemprop="name" class="font-display text-2xl sm:text-3xl text-foreground mb-1.5">${escapeHtml(product.name)}</h1>
                    <div data-prerendered-pdp-price class="min-h-[44px] flex items-center">
                      <span itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="priceCurrency" content="USD" /><data itemprop="price" class="font-pixel text-sm text-neon-yellow neon-text-yellow" value="${product.price.toFixed(2)}">$${product.price.toFixed(2)}</data></span>
                    </div>
                  </div>
                  <p data-prerendered-pdp-description class="hidden md:block text-sm text-muted-foreground leading-relaxed" itemprop="description">${escapeHtml(product.description)}</p>
                  ${fitControls}
                  <div>
                    ${sizes}
                    ${colors}
                  </div>
                  <details data-prerendered-pdp-details class="md:hidden border border-card-border rounded-md overflow-hidden">
                    <summary class="font-pixel text-[9px] text-neon-blue px-4 py-3 cursor-pointer select-none">DETAILS</summary>
                    <p class="text-sm text-muted-foreground leading-relaxed px-4 pb-4">${escapeHtml(product.description)}</p>
                  </details>
                  <div data-prerendered-pdp-divider class="retro-divider my-1"></div>
                  <button data-prerendered-pdp-add type="button" class="inline-flex items-center justify-center gap-3 min-h-[44px] py-5 rounded-md border bg-neon-blue border-neon-blue text-white font-pixel text-[10px]">ADD TO CART</button>
                </div>
              </article>
            </div>
          </div>
        </main>
      </div>`;
}

function productJsonLd(product: Product, canonicalUrl: string) {
  const variants = product.shopifyVariants ?? [];
  const prices = variants
    .map((variant) => Number.parseFloat(variant.price))
    .filter((price) => Number.isFinite(price));
  const normalizedPrices = prices.length > 0 ? prices : [product.price];
  const lowPrice = Math.min(...normalizedPrices);
  const highPrice = Math.max(...normalizedPrices);
  const availability = variants.some((variant) => variant.availableForSale)
    ? "http://schema.org/InStock"
    : "http://schema.org/OutOfStock";
  const uniquePrices = new Set(normalizedPrices.map((price) => price.toFixed(2)));
  const offers = uniquePrices.size === 1
    ? {
        "@type": "Offer",
        url: canonicalUrl,
        priceCurrency: "USD",
        price: lowPrice.toFixed(2),
        availability,
      }
    : {
        "@type": "AggregateOffer",
        url: canonicalUrl,
        lowPrice: lowPrice.toFixed(2),
        highPrice: highPrice.toFixed(2),
        priceCurrency: "USD",
        offerCount: variants.length,
        availability,
      };

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    image: product.imageUrl ? [product.imageUrl] : undefined,
    sku: String(product.id),
    category: product.category,
    brand: {
      "@type": "Brand",
      name: "MyShirtsDope",
    },
    offers,
  };
}

function renderShopPage(
  template: string,
  products: Product[],
  lcpImage: ShopLcpImage,
): string {
  const canonicalUrl = `${SITE_URL}/shop`;
  const html = applyPageMetadata(template, {
    title: "Shop | MyShirtsDope",
    description: "Browse MyShirtsDope shirts, hoodies, onesies, and accessories inspired by music, culture, and love.",
    canonicalUrl,
    ogType: "website",
    imageUrl: `${SITE_URL}/favicon.png`,
    preloadImage: { url: lcpImage.url, preset: IMAGE_PRESETS.gridCard },
  });
  return injectPrerenderedRoot(html, renderShopContent(products, lcpImage));
}

function renderProductPage(
  template: string,
  product: Product,
  availableFits: FitType[],
  selectedFit: FitType,
): string {
  const canonicalUrl = `${SITE_URL}/product/${product.id}`;
  const html = applyPageMetadata(template, {
    title: `${product.name} | MyShirtsDope`,
    description: product.description || `${product.name} from MyShirtsDope`,
    canonicalUrl,
    ogType: "product",
    imageUrl: product.imageUrl || `${SITE_URL}/favicon.png`,
    price: product.price,
    jsonLd: productJsonLd(product, canonicalUrl),
    preloadImage: product.imageUrl
      ? {
          url: product.imageUrl,
          preset: IMAGE_PRESETS.productDetail,
          attributes: 'data-pdp-hero-preload="true"',
        }
      : undefined,
  });
  const htmlWithProductData = html.replace(
    /<\/head>/i,
    `    <style data-prerendered-pdp-critical="true">${PDP_PRERENDER_CRITICAL_CSS}</style>\n    <script type="application/json" data-prerendered-product="true">${safeJsonLd({ ...product, availableFits, selectedFit })}</script>\n  </head>`,
  );
  return injectPrerenderedRoot(htmlWithProductData, renderProductContent(product, availableFits, selectedFit));
}

export async function prerenderCatalog(
  products: Product[],
  slimInitial: ProductSummary[],
): Promise<void> {
  if (products.length === 0) {
    throw new Error("Cannot prerender an empty product catalog");
  }

  const shopLcpImage = computeShopLcpImage(slimInitial);
  if (!shopLcpImage) {
    throw new Error("Could not determine the shop page LCP image for preloading");
  }

  const template = await readFile(path.join(OUTPUT_DIR, "index.html"), "utf-8");
  if (template.includes("data-home-shell-gate") || template.includes('data-prerendered="true"')) {
    throw new Error(
      "dist/public/index.html already contains prerendered output; it can only be used as a template once. " +
        "Re-run 'vite build' to regenerate the pristine template ('npm run build:netlify' does this automatically).",
    );
  }
  const productOutputDir = path.join(OUTPUT_DIR, "product");
  const shopOutputDir = path.join(OUTPUT_DIR, "shop");
  const uniqueProducts = Array.from(new Map(products.map((product) => [product.id, product])).values());
  const availableFitsByProductId = new Map<number, FitType[]>();
  const selectedFitByProductId = new Map<number, FitType>();
  for (const group of groupProducts(uniqueProducts)) {
    for (const [fit, product] of [
      ["adult", group.adult],
      ["youth", group.youth],
      ["toddler", group.toddler],
    ] as const) {
      if (product) {
        availableFitsByProductId.set(product.id, group.fits);
        selectedFitByProductId.set(product.id, fit);
      }
    }
  }

  await Promise.all([
    rm(productOutputDir, { recursive: true, force: true }),
    rm(shopOutputDir, { recursive: true, force: true }),
  ]);

  await mkdir(shopOutputDir, { recursive: true });
  await writeFile(
    path.join(shopOutputDir, "index.html"),
    renderShopPage(template, uniqueProducts, shopLcpImage),
  );

  for (let index = 0; index < uniqueProducts.length; index += PRODUCT_BATCH_SIZE) {
    const batch = uniqueProducts.slice(index, index + PRODUCT_BATCH_SIZE);
    await Promise.all(
      batch.map(async (product) => {
        const outputDir = path.join(productOutputDir, String(product.id));
        await mkdir(outputDir, { recursive: true });
        await writeFile(
          path.join(outputDir, "index.html"),
          renderProductPage(
            template,
            product,
            availableFitsByProductId.get(product.id) ?? ["adult"],
            selectedFitByProductId.get(product.id) ?? "adult",
          ),
        );
      }),
    );
  }

  // The homepage shell overwrites index.html, so it must be generated from
  // the pristine template and written after every page that consumes it.
  const modulePreloadHrefs = await collectHomeModulePreloads(template);
  await writeFile(path.join(OUTPUT_DIR, "index.html"), renderHomePage(template, modulePreloadHrefs));

  console.log(`[Prerender] Generated home shell (${modulePreloadHrefs.length} preloaded home modules), shop page, and ${uniqueProducts.length} product pages`);
  console.log(`[Prerender] Canonical site URL: ${SITE_URL}`);
}