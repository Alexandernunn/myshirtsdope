import { access, readdir, readFile, writeFile } from "fs/promises";
import path from "path";

const OUTPUT_DIR = path.resolve("dist/public");
const SITE_URL = (process.env.PUBLIC_SITE_URL || "https://myshirtsdope.com").replace(/\/+$/, "");

interface SitemapProduct {
  id: number;
  updatedAt: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatLastModified(updatedAt: string, productId: number): string {
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) {
    throw new Error(`Sitemap generation failed: product ${productId} has an invalid updated_at timestamp`);
  }

  return updated.toISOString();
}

async function verifyPrerenderedCatalog(productIds: number[]): Promise<void> {
  const productRoot = path.join(OUTPUT_DIR, "product");
  const entries = await readdir(productRoot, { withFileTypes: true });
  const prerenderedIds = new Set<number>();

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;

    const productPage = path.join(productRoot, entry.name, "index.html");
    await access(productPage);
    prerenderedIds.add(Number(entry.name));
  }

  const expectedIds = new Set(productIds);
  const missingPages = productIds.filter((id) => !prerenderedIds.has(id));
  const unexpectedPages = [...prerenderedIds].filter((id) => !expectedIds.has(id));

  if (
    prerenderedIds.size !== expectedIds.size ||
    missingPages.length > 0 ||
    unexpectedPages.length > 0
  ) {
    throw new Error(
      `Sitemap generation failed: sitemap has ${expectedIds.size} active products but prerendered catalog has ${prerenderedIds.size}. Missing pages: ${missingPages.join(", ") || "none"}. Unexpected pages: ${unexpectedPages.join(", ") || "none"}.`,
    );
  }
}

export async function generateSitemap(products: SitemapProduct[]): Promise<void> {
  const byId = new Map(products.map((product) => [product.id, product]));
  if (byId.size === 0) {
    throw new Error("Sitemap generation failed: no active products were available");
  }
  if (byId.size !== products.length) {
    throw new Error("Sitemap generation failed: duplicate active product IDs were received");
  }

  const activeProducts = [...byId.values()].sort((a, b) => a.id - b.id);
  const productIds = activeProducts.map((product) => product.id);
  await verifyPrerenderedCatalog(productIds);

  const urls = [
    `  <url><loc>${escapeXml(SITE_URL)}</loc></url>`,
    `  <url><loc>${escapeXml(`${SITE_URL}/shop`)}</loc></url>`,
    ...activeProducts.map((product) => (
      `  <url><loc>${escapeXml(`${SITE_URL}/product/${product.id}`)}</loc><lastmod>${formatLastModified(product.updatedAt, product.id)}</lastmod></url>`
    )),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  const sitemapPath = path.join(OUTPUT_DIR, "sitemap.xml");

  await writeFile(sitemapPath, sitemap, "utf8");

  const writtenSitemap = await readFile(sitemapPath, "utf8");
  const urlCount = (writtenSitemap.match(/<url>/g) ?? []).length;
  if (urlCount !== activeProducts.length + 2) {
    throw new Error(
      `Sitemap generation failed: wrote ${urlCount} URLs, expected ${activeProducts.length + 2}`,
    );
  }

  console.log(`[Sitemap] Generated ${urlCount} canonical URLs`);
}