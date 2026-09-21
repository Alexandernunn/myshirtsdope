import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import type { Product, ProductSummary } from "../shared/schema";
import {
  getFitBadgeLabel,
  groupProducts,
  interleaveGroups,
  prioritizeFeaturedGroups,
  type ProductGroup,
} from "../client/src/lib/product-grouping";
import { pickVariantIndex } from "../shared/image-variants";
import {
  IMAGE_PRESETS,
  shopifyImageProps,
  type ShopifyImagePreset,
} from "../shared/shopify-image";
import { getDefaultVariant, getVariantImage } from "../shared/product-variant";
import { productPath } from "../shared/product-url";
import {
  POLICY_PAGES,
  STORE_SUPPORT_EMAIL,
  type StorePageDefinition,
} from "../shared/store-pages";
import type { CatalogAlias } from "../shared/catalog-consolidation";
import {
  homePageSchema,
  productPageSchema,
  shopPageSchema,
  trustPageSchema,
} from "./storefront-schema";

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
  const groups = prioritizeFeaturedGroups(interleaveGroups(groupProducts(slimInitial)));
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

function injectPrerenderedData(template: string, attribute: string, data: unknown): string {
  return template.replace(
    /<\/head>/i,
    `    <script type="application/json" ${attribute}>${safeJsonLd(data)}</script>\n  </head>`,
  );
}

function listingVariants(product: Product | ProductSummary): string[] {
  return "colorImageVariants" in product && Array.isArray(product.colorImageVariants)
    ? product.colorImageVariants
    : [];
}

function responsiveImageAttributes(url: string, preset: ShopifyImagePreset): string {
  const props = shopifyImageProps(url, preset);
  const srcSet = props.srcSet && props.sizes
    ? ` srcset="${escapeHtml(props.srcSet)}" sizes="${escapeHtml(props.sizes)}"`
    : "";
  return `src="${escapeHtml(props.src)}"${srcSet}`;
}

function renderStorefrontNav(activePath: string): string {
  const links = [
    ["/", "HOME"],
    ["/shop", "SHOP"],
    ["/about", "STORY"],
    ["/contact", "CONTACT"],
  ] as const;
  const navigation = links
    .map(([href, label]) => `
          <a href="${href}">
            <span class="font-display text-sm tracking-wide transition-colors ${activePath === href ? "text-neon-yellow neon-text-yellow" : "text-muted-foreground"}">${label}</span>
          </a>`)
    .join("");

  return `
    <nav class="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      <div class="max-w-7xl mx-auto px-4 flex items-center justify-between gap-4 h-16">
        <a href="/"><span class="font-pixel text-xs sm:text-sm text-neon-blue neon-text-blue tracking-wider">MyShirtsDope</span></a>
        <div class="hidden md:flex items-center gap-6">${navigation}
        </div>
        <div class="flex items-center gap-2">
          <a href="/cart" aria-label="Shopping cart, 0 items" class="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground">
            <svg viewBox="0 0 24 24" aria-hidden="true" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="20" r="1"/><circle cx="20" cy="20" r="1"/><path d="m1 1 4 4 2.7 9.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L22 6H6"/></svg>
          </a>
          <span class="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground" aria-hidden="true">&#9776;</span>
        </div>
      </div>
    </nav>`;
}

function renderStorefrontFooter(): string {
  return `
    <footer class="storefront-footer border-t border-border bg-background min-h-[300px]" style="contain:layout style;content-visibility:auto">
      <div class="retro-divider"></div>
      <div class="max-w-7xl mx-auto px-4 py-10">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <h3 class="font-pixel text-[10px] text-neon-blue neon-text-blue mb-4">MyShirtsDope</h3>
            <p class="font-display text-base text-muted-foreground leading-relaxed">Shirts, hoodies, onesies, and accessories for all ages inspired by music, culture and love.</p>
          </div>
          <div>
            <h4 class="font-pixel text-[9px] text-neon-yellow mb-4">NAVIGATE</h4>
            <div class="flex flex-col gap-2"><a href="/shop" class="font-display text-base text-muted-foreground">Shop</a><a href="/about" class="font-display text-base text-muted-foreground">Our Story</a><a href="/contact" class="font-display text-base text-muted-foreground">Contact</a></div>
          </div>
          <div>
            <h4 class="font-pixel text-[9px] text-neon-green mb-4">CATEGORIES</h4>
            <div class="flex flex-col gap-2"><a href="/shop?category=Shirts" class="font-display text-base text-muted-foreground">Shirts</a><a href="/shop?category=Hoodies" class="font-display text-base text-muted-foreground">Hoodies</a><a href="/shop?category=Onesies" class="font-display text-base text-muted-foreground">Onesies</a><a href="/shop?category=Accessories" class="font-display text-base text-muted-foreground">Accessories</a></div>
          </div>
          <div>
            <h4 class="font-pixel text-[9px] text-neon-orange mb-4">POLICIES</h4>
            <div class="flex flex-col gap-2"><a href="/shipping-policy" class="font-display text-base text-muted-foreground">Shipping</a><a href="/returns-refunds" class="font-display text-base text-muted-foreground">Returns &amp; Refunds</a><a href="/privacy-policy" class="font-display text-base text-muted-foreground">Privacy</a><a href="/terms-of-service" class="font-display text-base text-muted-foreground">Terms</a></div>
          </div>
        </div>
        <div class="mt-10 pt-6 border-t border-border/50 text-center"><p class="font-pixel text-[8px] text-muted-foreground animate-neon-pulse">MyShirtsDope.com &mdash; CULTURE NEVER DIES</p></div>
      </div>
    </footer>`;
}

function renderStorefrontShell(content: string, activePath: string): string {
  return `
      <div class="min-h-screen flex flex-col bg-background pixel-grid-bg">
        ${renderStorefrontNav(activePath)}
        <main class="flex-1">${content}</main>
        ${renderStorefrontFooter()}
      </div>
      <button type="button" aria-label="Play background music" class="fixed bottom-5 right-5 z-50 w-10 h-10 rounded-full bg-background/80 border border-neon-blue/40 backdrop-blur-sm flex items-center justify-center text-neon-blue shadow-lg" aria-hidden="true">&#9835;</button>`;
}

function renderStaticCultureDeck(products: ProductSummary[]): string {
  const cards = products.slice(0, 8).map((product, index) => {
    const angle = index * 45;
    const isBehind = angle > 90 && angle < 270;
    const depth = (Math.cos((angle * Math.PI) / 180) + 1) / 2;
    const variants = listingVariants(product);
    const imageUrl = variants[index % variants.length] || product.imageUrl;
    const imageAttributes = responsiveImageAttributes(imageUrl, IMAGE_PRESETS.cultureCard);
    return `
            <div class="absolute" style="transform-style:preserve-3d;transform:rotateY(${angle}deg) translateZ(320px);z-index:${Math.round(depth * 100)}">
              <div class="absolute" style="width:140px;height:190px;left:-70px;top:-95px;transform-style:preserve-3d;transform:rotateY(${-angle}deg) scale(${(0.75 + 0.25 * depth).toFixed(3)});filter:brightness(${(0.3 + 0.7 * depth).toFixed(3)});visibility:${isBehind ? "hidden" : "visible"}">
                <a href="${productPath(product)}" class="block w-full h-full rounded-md overflow-hidden bg-[#0a0a0a] border border-white/15 shadow-[0_4px_24px_rgba(0,0,0,0.7)] cursor-pointer relative">
                  <img ${imageAttributes} alt="${escapeHtml(product.name)}" width="140" height="190" class="w-full h-full object-cover pointer-events-none" loading="${index === 0 ? "eager" : "lazy"}"${index === 0 ? ' fetchpriority="high"' : ""} />
                  <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/60 to-transparent p-2 pt-8"><p class="font-display text-[10px] text-white/90 line-clamp-2 leading-tight">${escapeHtml(product.name)}</p></div>
                </a>
              </div>
            </div>`;
  }).join("");

  return `
          <div class="flex flex-col items-center mt-12 mb-12">
            <p class="font-pixel text-[9px] sm:text-[10px] text-neon-yellow neon-text-yellow mb-6 tracking-widest">&#9654; LATEST DROPS</p>
            <div class="relative select-none w-[340px] h-[260px] sm:w-[700px] sm:h-[300px]" style="perspective:900px">
              <div class="absolute inset-0 flex items-center justify-center" style="transform-style:preserve-3d;transform:rotateY(0deg)">${cards}
              </div>
            </div>
            <p class="text-white/30 text-[10px] mt-3 font-body">Tap a card to view &bull; Drag to spin</p>
          </div>`;
}

function renderHomeContent(deckProducts: ProductSummary[]): string {
  return `
          <div class="min-h-screen" data-prerendered-page="home">
            <section class="relative min-h-[70vh] flex flex-col items-center justify-center overflow-hidden pixel-grid-bg">
              <div class="scanline-overlay"></div>
              <div class="homepage-hero-content relative z-10 text-center px-4 max-w-4xl mx-auto">
                <div class="animate-pixel-fade-in">
                  <p class="font-pixel text-[9px] sm:text-[10px] text-neon-green neon-text-green mb-4 tracking-widest">WELCOME TO</p>
                  <h1 class="font-pixel text-2xl sm:text-4xl md:text-5xl text-neon-blue neon-text-blue mb-6 leading-relaxed animate-float">MyShirtsDope</h1>
                  <div class="max-w-2xl mx-auto mb-10"><p class="font-display text-lg sm:text-xl text-foreground/90 leading-relaxed min-h-[56px]">Shirts, hoodies, onesies, and accessories for all ages inspired by music, culture and love.<span class="animate-blink text-neon-yellow">|</span></p></div>
                  <a href="/shop" class="inline-flex items-center justify-center gap-3 font-pixel text-[10px] sm:text-xs bg-neon-blue border-neon-blue text-white px-8 py-6 rounded-md">ENTER THE STORE <span aria-hidden="true">&#8250;</span></a>
                </div>
                ${renderStaticCultureDeck(deckProducts)}
              </div>
            </section>
            <div class="border-y border-border bg-card/50 overflow-hidden"><div class="flex animate-marquee whitespace-nowrap py-3"><span class="font-display text-sm mx-6 text-muted-foreground">HIP HOP <span class="text-neon-blue mx-4">&middot;</span> R&amp;B <span class="text-neon-blue mx-4">&middot;</span> SOUL <span class="text-neon-blue mx-4">&middot;</span> POP <span class="text-neon-blue mx-4">&middot;</span> CULTURE <span class="text-neon-blue mx-4">&middot;</span> LOVE</span></div></div>
            <section class="py-20 px-4">
              <div class="max-w-6xl mx-auto">
                <h2 class="font-pixel text-sm sm:text-base text-center text-neon-yellow neon-text-yellow mb-12">WHAT WE REP</h2>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div class="bg-card border border-card-border rounded-md p-6 text-center"><h3 class="font-pixel text-[10px] text-neon-blue neon-text-blue mb-3">HIP HOP</h3><p class="font-display text-base text-muted-foreground leading-relaxed">Old school beats, fresh threads. Rep the culture that started it all.</p></div>
                  <div class="bg-card border border-card-border rounded-md p-6 text-center"><h3 class="font-pixel text-[10px] text-neon-yellow neon-text-yellow mb-3">R&amp;B / SOUL</h3><p class="font-display text-base text-muted-foreground leading-relaxed">Smooth vibes, timeless style. Wear the feeling of every classic track.</p></div>
                  <div class="bg-card border border-card-border rounded-md p-6 text-center"><h3 class="font-pixel text-[10px] text-neon-green neon-text-green mb-3">LOVE</h3><p class="font-display text-base text-muted-foreground leading-relaxed">Spread love through wearable art. Because culture starts with heart.</p></div>
                  <div class="bg-card border border-card-border rounded-md p-6 text-center"><h3 class="font-pixel text-[10px] text-neon-orange neon-text-orange mb-3">CULTURE</h3><p class="font-display text-base text-muted-foreground leading-relaxed">Represent a time, feeling, event, place, song, or artist you love.</p></div>
                </div>
              </div>
            </section>
            <div class="retro-divider"></div>
            <section class="py-20 px-4 text-center"><h2 class="font-pixel text-sm sm:text-base text-neon-green neon-text-green mb-4">READY TO PLAY?</h2><p class="font-display text-lg text-muted-foreground mb-8 max-w-md mx-auto">Browse our collection of unique merch inspired by the music and moments that shaped culture.</p><a href="/shop" class="inline-flex items-center justify-center font-pixel text-[10px] bg-neon-yellow border-neon-yellow text-black px-8 py-5 rounded-md">BROWSE COLLECTION</a></section>
          </div>`;
}

function renderStaticProductCard(group: ProductGroup, index: number): string {
  const product = group.adult;
  const variants = listingVariants(product);
  const imageUrl = variants[pickVariantIndex(product.id, index, variants.length)] || product.imageUrl;
  const imageAttributes = responsiveImageAttributes(imageUrl, IMAGE_PRESETS.gridCard);
  const fitBadge = getFitBadgeLabel(group.fits);
  return `
              <a href="${productPath(product)}">
                <div class="catalog-card group bg-card border border-card-border rounded-md overflow-hidden transition-transform duration-200 cursor-pointer">
                  <div class="relative overflow-hidden rounded-t-md bg-muted" style="aspect-ratio:1;max-height:220px">
                    <img ${imageAttributes} alt="${escapeHtml(product.name)}" width="400" height="400" class="w-full h-full object-cover"${index === 0 ? ' loading="eager" fetchpriority="high"' : ' loading="lazy"'} />
                    ${product.isNewDrop ? '<div class="absolute top-1.5 left-1.5"><span class="font-pixel text-[6px] bg-neon-green text-black border-transparent px-1.5 py-0.5 rounded-md">NEW DROP</span></div>' : ""}
                    ${fitBadge ? `<div class="absolute bottom-1.5 left-1.5"><span class="font-pixel text-[5px] bg-neon-blue/30 text-neon-blue border-transparent px-1.5 py-0.5 rounded-md">${escapeHtml(fitBadge)}</span></div>` : ""}
                  </div>
                  <div class="p-2.5"><h3 class="font-display text-xs text-card-foreground mb-0.5 line-clamp-1">${escapeHtml(product.name)}</h3><p class="font-pixel text-[9px] text-neon-yellow">$${product.price.toFixed(2)}</p></div>
                </div>
              </a>`;
}

function renderShopContent(slimInitial: ProductSummary[]): string {
  const groups = prioritizeFeaturedGroups(interleaveGroups(groupProducts(slimInitial)));
  const visibleGroups = groups.slice(0, 15);
  const cards = visibleGroups.map((group, index) => renderStaticProductCard(group, index)).join("");
  const categoryLinks = ["All", "Shirts", "Hoodies", "Onesies", "Accessories"].map((category) => `
              <a href="${category === "All" ? "/shop" : `/shop?category=${category}`}"><span class="font-display text-xs px-3 py-1.5 rounded-md border ${category === "All" ? "bg-secondary border-border text-foreground" : "border-transparent text-muted-foreground"}">${category.toUpperCase()}</span></a>`).join("");

  return `
          <div class="min-h-screen" data-prerendered-page="shop">
            <div class="retro-divider"></div>
            <div class="max-w-[1400px] mx-auto px-6 sm:px-8 py-10">
              <div class="text-center mb-8"><h1 class="font-pixel text-base sm:text-lg text-neon-blue neon-text-blue mb-2">THE SHOP</h1><p class="font-display text-base text-muted-foreground">Culture you can wear. Browse our collection.</p></div>
              <div class="relative max-w-sm mx-auto mb-6"><span class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true">&#128269;</span><input type="text" placeholder="Search..." class="pl-10 bg-card border border-card-border font-display text-sm rounded-md w-full h-10" aria-label="Search the shop" /></div>
              <div class="flex flex-wrap items-center justify-center gap-2 mb-8">${categoryLinks}</div>
              <section aria-labelledby="catalog-heading" class="catalog-section"><h2 id="catalog-heading" class="sr-only">Product catalog</h2><p class="font-display text-xs text-muted-foreground text-center mb-4">Showing 1-${visibleGroups.length} of ${groups.length} items</p><div class="catalog-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">${cards}</div>
              ${groups.length > 15 ? '<div class="flex flex-wrap items-center justify-center gap-2 mt-8"><button type="button" disabled aria-label="Previous page" class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input opacity-50">&#8249;</button><button type="button" class="inline-flex h-9 min-w-9 items-center justify-center rounded-md bg-primary text-primary-foreground font-display text-sm">1</button><button type="button" class="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-input font-display text-sm">2</button><button type="button" aria-label="Next page" class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input">&#8250;</button></div>' : ""}
              </section>
            </div>
          </div>`;
}

function renderProductContent(product: Product): string {
  const defaultVariant = getDefaultVariant(product);
  const defaultImage = getVariantImage(product, defaultVariant);
  const defaultSize = defaultVariant?.size ?? product.sizes[0];
  const defaultColor = defaultVariant?.color ?? product.colors[0];
  const defaultPrice = Number.parseFloat(defaultVariant?.price ?? "") || product.price;
  const image = defaultImage
    ? `<img ${responsiveImageAttributes(defaultImage, IMAGE_PRESETS.productDetail)} alt="${escapeHtml(product.name)}" loading="eager" fetchpriority="high" width="640" height="640" class="w-full h-full object-contain" />`
    : "";
  const sizeOptions = product.sizes.map((size) => `
                <button type="button" class="min-w-10 h-10 px-3 rounded-md border font-display text-sm ${size === defaultSize ? "border-neon-blue bg-neon-blue/10 text-neon-blue" : "border-card-border text-muted-foreground"}">${escapeHtml(size)}</button>`).join("");
  const colorOptions = product.colors.map((color) => `
                <button type="button" class="h-10 px-3 rounded-md border font-display text-xs ${color === defaultColor ? "border-neon-blue bg-neon-blue/10 text-neon-blue" : "border-card-border text-muted-foreground"}">${escapeHtml(color)}</button>`).join("");

  return `
          <div class="min-h-screen" data-prerendered-page="product">
            <div class="retro-divider"></div>
            <div class="max-w-6xl mx-auto px-4 sm:px-6 py-8">
              <a href="/shop" class="inline-flex items-center gap-2 font-display text-sm text-muted-foreground hover:text-neon-blue mb-6">&#8592; Back to Shop</a>
              <article class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
                <div class="relative aspect-square max-w-xl mx-auto w-full rounded-md overflow-hidden bg-card border border-card-border">${image}</div>
                <div class="max-w-xl">
                  <p class="font-pixel text-[9px] text-neon-green mb-3 tracking-widest">${escapeHtml(product.category.toUpperCase())}</p>
                  <h1 class="font-pixel text-xl sm:text-2xl text-neon-blue neon-text-blue leading-relaxed mb-4">${escapeHtml(product.name)}</h1>
                  <div class="mb-6"><data value="${defaultPrice.toFixed(2)}" class="font-pixel text-base text-neon-yellow">$${defaultPrice.toFixed(2)}</data></div>
                  <p class="font-display text-base text-muted-foreground leading-relaxed mb-8">${escapeHtml(product.description)}</p>
                  ${sizeOptions ? `<section class="mb-6"><h2 class="font-pixel text-[9px] text-foreground mb-3">SELECT SIZE</h2><div class="flex flex-wrap gap-2">${sizeOptions}</div></section>` : ""}
                  ${colorOptions ? `<section class="mb-8"><h2 class="font-pixel text-[9px] text-foreground mb-3">SELECT COLOR</h2><div class="flex flex-wrap gap-2">${colorOptions}</div></section>` : ""}
                  <button type="button" class="w-full font-pixel text-[10px] bg-neon-blue border-neon-blue text-white py-6 rounded-md">ADD TO CART</button>
                  <p class="font-display text-xs text-muted-foreground text-center mt-4">Secure checkout powered by Shopify</p>
                </div>
              </article>
            </div>
          </div>`;
}

function renderShopPage(
  template: string,
  products: ProductSummary[],
  lcpImage: ShopLcpImage,
): string {
  const canonicalUrl = `${SITE_URL}/shop`;
  const visibleSchemaProducts = prioritizeFeaturedGroups(
    interleaveGroups(groupProducts(products)),
  )
    .slice(0, 15)
    .map((group) => group.adult);
  const html = applyPageMetadata(template, {
    title: "Shop | MyShirtsDope",
    description: "Browse MyShirtsDope shirts, hoodies, onesies, and accessories inspired by music, culture, and love.",
    canonicalUrl,
    ogType: "website",
    imageUrl: `${SITE_URL}/favicon.png`,
    jsonLd: shopPageSchema(SITE_URL, visibleSchemaProducts),
    preloadImage: { url: lcpImage.url, preset: IMAGE_PRESETS.gridCard },
  });
  const withListingData = injectPrerenderedData(html, 'data-prerendered-shop="true"', products);
  return injectPrerenderedRoot(
    withListingData,
    renderStorefrontShell(renderShopContent(products), "/shop"),
  );
}

function renderProductPage(template: string, product: Product): string {
  const canonicalUrl = `${SITE_URL}${productPath(product)}`;
  const defaultImage = getVariantImage(product, getDefaultVariant(product));
  const html = applyPageMetadata(template, {
    title: `${product.name} | MyShirtsDope`,
    description: product.description || `${product.name} from MyShirtsDope`,
    canonicalUrl,
    ogType: "product",
    imageUrl: defaultImage || `${SITE_URL}/favicon.png`,
    price: product.price,
    jsonLd: productPageSchema(SITE_URL, product),
    preloadImage: defaultImage
      ? {
          url: defaultImage,
          preset: IMAGE_PRESETS.productDetail,
          attributes: 'data-pdp-hero-preload="true"',
        }
      : undefined,
  });
  const htmlWithProductData = injectPrerenderedData(html, 'data-prerendered-product="true"', product);
  return injectPrerenderedRoot(
    htmlWithProductData,
    renderStorefrontShell(renderProductContent(product), ""),
  );
}

function renderHomePage(template: string, deckProducts: ProductSummary[]): string {
  const canonicalUrl = `${SITE_URL}/`;
  const html = applyPageMetadata(template, {
    title: "MyShirtsDope | Culture You Can Wear",
    description: "Shirts, hoodies, onesies, and accessories for all ages inspired by music, culture, and love.",
    canonicalUrl,
    ogType: "website",
    imageUrl: `${SITE_URL}/favicon.png`,
    jsonLd: homePageSchema(SITE_URL),
  });
  const withDeckData = injectPrerenderedData(html, 'data-prerendered-deck="true"', deckProducts);
  return injectPrerenderedRoot(
    withDeckData,
    renderStorefrontShell(renderHomeContent(deckProducts), "/"),
  );
}

function linkSupportEmail(value: string): string {
  return escapeHtml(value).replace(
    STORE_SUPPORT_EMAIL,
    `<a href="mailto:${STORE_SUPPORT_EMAIL}" class="text-neon-blue underline">${STORE_SUPPORT_EMAIL}</a>`,
  );
}

function renderPublicPageContent(page: StorePageDefinition): string {
  const sections = page.sections.map((section) => {
    const paragraphs = section.paragraphs
      ?.map((paragraph) => `<p class="text-muted-foreground leading-relaxed">${linkSupportEmail(paragraph)}</p>`)
      .join("") ?? "";
    const bullets = section.bullets
      ? `<ul class="list-disc pl-5 space-y-2 text-muted-foreground leading-relaxed">${section.bullets
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")}</ul>`
      : "";
    return `
              <section class="bg-card border border-card-border rounded-md p-6 sm:p-8">
                <h2 class="font-pixel text-[10px] text-neon-yellow mb-4">${escapeHtml(section.heading.toUpperCase())}</h2>
                <div class="space-y-4">${paragraphs}${bullets}</div>
              </section>`;
  }).join("");

  return `
          <div class="min-h-screen" data-prerendered-page="trust">
            <div class="retro-divider"></div>
            <article class="max-w-3xl mx-auto px-4 py-16">
              <header class="text-center mb-10">
                <p class="font-pixel text-[9px] text-neon-green mb-3 tracking-widest">STORE INFO</p>
                <h1 class="font-pixel text-lg sm:text-xl text-neon-blue leading-relaxed">${escapeHtml(page.title.toUpperCase())}</h1>
              </header>
              <div class="space-y-6">${sections}</div>
            </article>
          </div>`;
}

const ABOUT_PAGE: StorePageDefinition = {
  path: "/about",
  title: "Our Story",
  shortTitle: "About",
  description: "Learn who operates MyShirtsDope, what the store sells, and how orders and customer support are handled.",
  schemaType: "AboutPage",
  sections: [
    {
      heading: "Who we are",
      paragraphs: [
        "My Shirts Dope operates from Nashville, Tennessee, and serves customers through MyShirtsDope.com.",
        "We create wearable art inspired by music, culture, love, and the moments that shape us. The collection includes shirts, hoodies, onesies, and accessories for all ages.",
      ],
    },
    {
      heading: "How the store works",
      paragraphs: [
        `Our online storefront and secure checkout are powered by Shopify. Products are printed and fulfilled by Printful after purchase, then shipped to supported destinations worldwide. Customer questions are handled by the MyShirtsDope support team at ${STORE_SUPPORT_EMAIL}.`,
      ],
    },
  ],
};

const CONTACT_PAGE: StorePageDefinition = {
  path: "/contact",
  title: "Contact Us",
  shortTitle: "Contact",
  description: "Contact MyShirtsDope customer support about an order, product, return, or other store question.",
  schemaType: "ContactPage",
  sections: [
    {
      heading: "Customer support",
      paragraphs: [
        `Email ${STORE_SUPPORT_EMAIL} for help with an order, product, shipping issue, return request, custom order, or bulk-pricing question.`,
        "Include your order number when asking about an existing purchase. You can also use the contact form on this page after JavaScript loads.",
      ],
    },
  ],
};

const PUBLIC_PAGES = [ABOUT_PAGE, CONTACT_PAGE, ...POLICY_PAGES];

function renderPublicPage(template: string, page: StorePageDefinition): string {
  const canonicalUrl = `${SITE_URL}${page.path}`;
  const html = applyPageMetadata(template, {
    title: `${page.title} | MyShirtsDope`,
    description: page.description,
    canonicalUrl,
    ogType: "website",
    imageUrl: `${SITE_URL}/favicon.png`,
    jsonLd: trustPageSchema(SITE_URL, page.path, page.schemaType, page.title, page.description),
  });
  return injectPrerenderedRoot(
    html,
    renderStorefrontShell(renderPublicPageContent(page), page.path),
  );
}

function renderNoindexAppShell(template: string): string {
  return replaceHeadTag(
    template,
    /<meta\s+name=["']robots["'][^>]*>/i,
    '<meta name="robots" content="noindex, nofollow" />',
  );
}

function renderNotFoundPage(template: string): string {
  let html = applyPageMetadata(template, {
    title: "Page Not Found | MyShirtsDope",
    description: "The requested MyShirtsDope page could not be found.",
    canonicalUrl: `${SITE_URL}/404`,
    ogType: "website",
  });
  html = replaceHeadTag(
    html,
    /<meta\s+name=["']robots["'][^>]*>/i,
    '<meta name="robots" content="noindex, nofollow" />',
  );
  return injectPrerenderedRoot(
    html,
    renderStorefrontShell(`
          <div class="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center" data-prerendered-page="not-found">
            <p class="font-pixel text-4xl text-neon-blue mb-4">404</p>
            <h1 class="font-pixel text-[10px] text-neon-yellow mb-2">PAGE NOT FOUND</h1>
            <p class="font-display text-lg text-muted-foreground mb-8">This page does not exist. Return home or browse the shop.</p>
            <div class="flex gap-4"><a href="/" class="font-pixel text-[10px] bg-neon-blue text-white px-6 py-4 rounded-md">RETURN HOME</a><a href="/shop" class="font-pixel text-[10px] border border-neon-yellow text-neon-yellow px-6 py-4 rounded-md">SHOP</a></div>
          </div>`, ""),
  );
}

export async function prerenderCatalog(
  products: Product[],
  slimInitial: ProductSummary[],
  deckProducts: ProductSummary[],
  aliases: CatalogAlias[] = [],
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
  const publicOutputDirs = PUBLIC_PAGES.map((page) => path.join(OUTPUT_DIR, page.path.slice(1)));
  const uniqueProducts = Array.from(new Map(products.map((product) => [product.id, product])).values());

  await Promise.all([
    rm(productOutputDir, { recursive: true, force: true }),
    rm(shopOutputDir, { recursive: true, force: true }),
    ...publicOutputDirs.map((outputDir) => rm(outputDir, { recursive: true, force: true })),
  ]);

  await Promise.all([
    mkdir(productOutputDir, { recursive: true }),
    mkdir(shopOutputDir, { recursive: true }),
  ]);
  await writeFile(path.join(OUTPUT_DIR, "index.html"), renderHomePage(template, deckProducts));
  await writeFile(
    path.join(shopOutputDir, "index.html"),
    renderShopPage(template, slimInitial, shopLcpImage),
  );
  await Promise.all(PUBLIC_PAGES.map(async (page) => {
    const outputDir = path.join(OUTPUT_DIR, page.path.slice(1));
    await mkdir(outputDir, { recursive: true });
    await writeFile(path.join(outputDir, "index.html"), renderPublicPage(template, page));
  }));
  await Promise.all([
    writeFile(path.join(OUTPUT_DIR, "404.html"), renderNotFoundPage(template)),
    writeFile(path.join(OUTPUT_DIR, "app-shell.html"), renderNoindexAppShell(template)),
  ]);

  for (let index = 0; index < uniqueProducts.length; index += PRODUCT_BATCH_SIZE) {
    const batch = uniqueProducts.slice(index, index + PRODUCT_BATCH_SIZE);
    await Promise.all(
      batch.map(async (product) => {
        await writeFile(
          path.join(productOutputDir, `${product.handle}.html`),
          renderProductPage(template, product),
        );
      }),
    );
  }

  const redirectMap = new Map<string, string>();
  const variantRedirects: string[] = [];
  for (const product of uniqueProducts) {
    redirectMap.set(`/product/${product.id}`, productPath(product));
  }
  for (const alias of aliases) {
    redirectMap.set(`/product/${alias.sourceId}`, `/product/${alias.targetHandle}`);
    if (alias.sourceHandle !== alias.targetHandle) {
      redirectMap.set(`/product/${alias.sourceHandle}`, `/product/${alias.targetHandle}`);
      redirectMap.set(`/products/${alias.sourceHandle}`, `/product/${alias.targetHandle}`);
    }
  }
  const { PRODUCT_MERGES } = await import("../shared/product-merges");
  for (const rule of PRODUCT_MERGES) {
    for (const archive of rule.archives) {
      variantRedirects.push(
        `/product/${archive.handle} color=:color size=:size  /product/${rule.keeper.handle}?color=:color&size=:size  301!`,
        `/products/${archive.handle} color=:color size=:size  /product/${rule.keeper.handle}?color=:color&size=:size  301!`,
      );
      for (const variant of archive.variantMappings) {
        variantRedirects.push(
          `/product/${archive.handle} variant=${variant.archiveVariantId}  /product/${rule.keeper.handle}?variant=${variant.keeperVariantId}  301!`,
          `/products/${archive.handle} variant=${variant.archiveVariantId}  /product/${rule.keeper.handle}?variant=${variant.keeperVariantId}  301!`,
        );
      }
    }
  }
  const redirects = [
    ...variantRedirects,
    ...[...redirectMap].map(([source, target]) => `${source}  ${target}  301!`),
  ]
    .join("\n");
  await writeFile(path.join(OUTPUT_DIR, "_redirects"), `${redirects}\n`);

  console.log(`[Prerender] Generated branded home, shop, ${PUBLIC_PAGES.length} trust pages, and ${uniqueProducts.length} product pages`);
  console.log(`[Prerender] Generated ${redirectMap.size} permanent product redirects`);
  console.log(`[Prerender] Canonical site URL: ${SITE_URL}`);
}