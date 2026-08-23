import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import type { Product, ProductSummary } from "../shared/schema";
import { groupProducts, interleaveGroups } from "../client/src/lib/product-grouping";
import { pickVariantIndex } from "../shared/image-variants";
import {
  IMAGE_PRESETS,
  shopifyImageProps,
  type ShopifyImagePreset,
} from "../shared/shopify-image";

const OUTPUT_DIR = path.resolve("dist/public");
const SITE_URL = (process.env.PUBLIC_SITE_URL || "https://myshirtsdope.com").replace(/\/+$/, "");
const PRODUCT_BATCH_SIZE = 50;

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
function imagePreloadTag(url: string, preset: ShopifyImagePreset): string {
  const props = shopifyImageProps(url, preset);
  let tag = `<link rel="preload" as="image" href="${escapeHtml(props.src)}"`;
  if (props.srcSet && props.sizes) {
    tag += ` imagesrcset="${escapeHtml(props.srcSet)}" imagesizes="${escapeHtml(props.sizes)}"`;
  }
  tag += ` fetchpriority="high" />`;
  return tag;
}

/**
 * Reproduce the exact image URL the client renders in the first shop grid
 * card: group + interleave the initial slim chunk (the client's initial data
 * source), then apply the same deterministic variant pick for card index 0.
 */
export function computeShopLcpImageUrl(slimInitial: ProductSummary[]): string | null {
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
  return pickedVariant ?? product.imageUrl;
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
    preloadImage?: { url: string; preset: ShopifyImagePreset };
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
      `    ${imagePreloadTag(metadata.preloadImage.url, metadata.preloadImage.preset)}\n  </head>`,
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

function renderShopContent(products: Product[]): string {
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
        <section aria-labelledby="catalog-heading">
          <h2 id="catalog-heading">Product catalog</h2>
          <ul>${productLinks}
          </ul>
        </section>
      </main>`;
}

function renderProductContent(product: Product): string {
  const imageProps = product.imageUrl
    ? shopifyImageProps(product.imageUrl, IMAGE_PRESETS.productDetail)
    : null;
  const responsiveAttrs = imageProps?.srcSet && imageProps.sizes
    ? ` srcset="${escapeHtml(imageProps.srcSet)}" sizes="${escapeHtml(imageProps.sizes)}"`
    : "";
  // Keep the schema.org microdata image pointing at the full-quality original
  // via <link itemprop>, while the visible tag uses the transformed rendition
  // inside a box with reserved dimensions (no layout shift when it paints).
  const image = product.imageUrl && imageProps
    ? `<link itemprop="image" href="${escapeHtml(product.imageUrl)}" />
          <div style="width: 100%; max-width: 320px; height: 320px;">
            <img src="${escapeHtml(imageProps.src)}"${responsiveAttrs} alt="${escapeHtml(product.name)}" fetchpriority="high" width="320" height="320" style="width: 100%; height: 100%; object-fit: contain;" />
          </div>`
    : "";
  const sizes = product.sizes.length > 0
    ? `<p><strong>Available sizes:</strong> ${escapeHtml(product.sizes.join(", "))}</p>`
    : "";
  const colors = product.colors.length > 0
    ? `<p><strong>Available colors:</strong> ${escapeHtml(product.colors.join(", "))}</p>`
    : "";

  return `
      <main data-prerendered-page="product" style="max-width: 1000px; margin: 0 auto; padding: 2rem 1.5rem;">
        <nav aria-label="Breadcrumb"><a href="/shop">Back to shop</a></nav>
        <article itemscope itemtype="https://schema.org/Product">
          ${image}
          <h1 itemprop="name">${escapeHtml(product.name)}</h1>
          <p><strong>Price:</strong> <span itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="priceCurrency" content="USD" /><data itemprop="price" value="${product.price.toFixed(2)}">$${product.price.toFixed(2)}</data></span></p>
          <p itemprop="description">${escapeHtml(product.description)}</p>
          <p><strong>Category:</strong> ${escapeHtml(product.category)}</p>
          ${sizes}
          ${colors}
        </article>
      </main>`;
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
  lcpImageUrl: string | null,
): string {
  const canonicalUrl = `${SITE_URL}/shop`;
  const html = applyPageMetadata(template, {
    title: "Shop | MyShirtsDope",
    description: "Browse MyShirtsDope shirts, hoodies, onesies, and accessories inspired by music, culture, and love.",
    canonicalUrl,
    ogType: "website",
    imageUrl: `${SITE_URL}/favicon.png`,
    preloadImage: lcpImageUrl
      ? { url: lcpImageUrl, preset: IMAGE_PRESETS.gridCard }
      : undefined,
  });
  return injectPrerenderedRoot(html, renderShopContent(products));
}

function renderProductPage(template: string, product: Product): string {
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
      ? { url: product.imageUrl, preset: IMAGE_PRESETS.productDetail }
      : undefined,
  });
  return injectPrerenderedRoot(html, renderProductContent(product));
}

export async function prerenderCatalog(
  products: Product[],
  slimInitial: ProductSummary[],
): Promise<void> {
  if (products.length === 0) {
    throw new Error("Cannot prerender an empty product catalog");
  }

  const shopLcpImageUrl = computeShopLcpImageUrl(slimInitial);
  if (!shopLcpImageUrl) {
    throw new Error("Could not determine the shop page LCP image for preloading");
  }

  const template = await readFile(path.join(OUTPUT_DIR, "index.html"), "utf-8");
  const productOutputDir = path.join(OUTPUT_DIR, "product");
  const shopOutputDir = path.join(OUTPUT_DIR, "shop");
  const uniqueProducts = Array.from(new Map(products.map((product) => [product.id, product])).values());

  await Promise.all([
    rm(productOutputDir, { recursive: true, force: true }),
    rm(shopOutputDir, { recursive: true, force: true }),
  ]);

  await mkdir(shopOutputDir, { recursive: true });
  await writeFile(
    path.join(shopOutputDir, "index.html"),
    renderShopPage(template, uniqueProducts, shopLcpImageUrl),
  );

  for (let index = 0; index < uniqueProducts.length; index += PRODUCT_BATCH_SIZE) {
    const batch = uniqueProducts.slice(index, index + PRODUCT_BATCH_SIZE);
    await Promise.all(
      batch.map(async (product) => {
        const outputDir = path.join(productOutputDir, String(product.id));
        await mkdir(outputDir, { recursive: true });
        await writeFile(
          path.join(outputDir, "index.html"),
          renderProductPage(template, product),
        );
      }),
    );
  }

  console.log(`[Prerender] Generated shop page and ${uniqueProducts.length} product pages`);
  console.log(`[Prerender] Canonical site URL: ${SITE_URL}`);
}