import { mkdir, readFile, rm, writeFile } from "fs/promises";
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

  console.log(`[Prerender] Generated shop page and ${uniqueProducts.length} product pages`);
  console.log(`[Prerender] Canonical site URL: ${SITE_URL}`);
}