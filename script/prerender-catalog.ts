import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";
import type { Product } from "../shared/schema";

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
  const image = product.imageUrl
    ? `<img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.name)}" itemprop="image" style="max-width: 100%; height: auto;" />`
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
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: "USD",
      price: product.price.toFixed(2),
    },
  };
}

function renderShopPage(template: string, products: Product[]): string {
  const canonicalUrl = `${SITE_URL}/shop`;
  const html = applyPageMetadata(template, {
    title: "Shop | MyShirtsDope",
    description: "Browse MyShirtsDope shirts, hoodies, onesies, and accessories inspired by music, culture, and love.",
    canonicalUrl,
    ogType: "website",
    imageUrl: `${SITE_URL}/favicon.png`,
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
  });
  return injectPrerenderedRoot(html, renderProductContent(product));
}

export async function prerenderCatalog(products: Product[]): Promise<void> {
  if (products.length === 0) {
    throw new Error("Cannot prerender an empty product catalog");
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
    renderShopPage(template, uniqueProducts),
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