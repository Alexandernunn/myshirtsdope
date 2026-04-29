import { fetchAllStorefrontProducts, mapStorefrontProduct } from "../server/shopify-storefront";
import type { Product } from "../shared/schema";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const NEUTRAL_COLORS = new Set([
  "white", "off white", "off-white", "natural", "ash", "cornsilk", "ivory",
  "cream", "snow", "grey", "gray", "heather", "athletic heather", "sport grey",
  "ice grey", "silver", "slate", "dark heather", "charcoal", "light grey",
  "light gray", "sand", "oatmeal",
]);

function getColorImageVariants(colorImages: Record<string, string> | null): string[] {
  if (!colorImages) return [];
  const entries = Object.entries(colorImages);
  if (entries.length === 0) return [];
  const colorful = entries.filter(([color]) => !NEUTRAL_COLORS.has(color.toLowerCase().trim()));
  const source = colorful.length > 0 ? colorful : entries;
  return source.map(([, url]) => url);
}

if (!process.env.SHOPIFY_ACCESS_TOKEN || !process.env.SHOPIFY_STORE_DOMAIN) {
  console.warn("[Cache] Skipping product cache: missing SHOPIFY_ACCESS_TOKEN or SHOPIFY_STORE_DOMAIN");
  console.warn("[Cache] The site will load products from the API instead of static JSON");
  process.exit(0);
}

async function cacheProducts() {
  console.log("[Cache] Fetching products from Shopify...");
  const rawProducts = await fetchAllStorefrontProducts();

  const products: Product[] = rawProducts.map((sp) => {
    const data = mapStorefrontProduct(sp);
    return {
      id: sp.id,
      shopifyProductId: data.shopifyProductId,
      name: data.name,
      description: data.description,
      price: data.price,
      category: data.category,
      imageUrl: data.imageUrl,
      badge: null,
      isNewDrop: data.isNewDrop,
      sizes: data.sizes,
      colors: data.colors,
      colorImages: data.colorImages,
      tags: data.tags,
      shopifyVariants: data.shopifyVariants,
    };
  });

  const slim = products.map((p) => {
    const variants = getColorImageVariants(p.colorImages ?? null);
    return {
      id: p.id,
      name: p.name,
      price: p.price,
      category: p.category,
      imageUrl: p.imageUrl,
      badge: p.badge,
      isNewDrop: p.isNewDrop,
      tags: p.tags,
      sizes: p.sizes,
      colors: p.colors,
      ...(variants.length > 0 ? { colorImageVariants: variants } : {}),
    };
  });

  const INITIAL_CHUNK_SIZE = 200;
  const slimInitial = slim.slice(0, INITIAL_CHUNK_SIZE);
  const slimRest = slim.slice(INITIAL_CHUNK_SIZE);

  const outDir = path.resolve("dist/public/data");
  await mkdir(outDir, { recursive: true });

  await writeFile(path.join(outDir, "products.json"), JSON.stringify(products));
  await writeFile(path.join(outDir, "products-slim.json"), JSON.stringify(slim));
  await writeFile(path.join(outDir, "products-slim-1.json"), JSON.stringify(slimInitial));
  await writeFile(path.join(outDir, "products-slim-rest.json"), JSON.stringify(slimRest));

  const fullSize = Buffer.byteLength(JSON.stringify(products)) / 1024;
  const slimSize = Buffer.byteLength(JSON.stringify(slim)) / 1024;
  const initialSize = Buffer.byteLength(JSON.stringify(slimInitial)) / 1024;
  const restSize = Buffer.byteLength(JSON.stringify(slimRest)) / 1024;

  console.log(`[Cache] Cached ${products.length} products`);
  console.log(`[Cache] Full: ${fullSize.toFixed(1)}KB, Slim: ${slimSize.toFixed(1)}KB`);
  console.log(`[Cache] Chunked: Initial ${slimInitial.length} products (${initialSize.toFixed(1)}KB), Rest ${slimRest.length} products (${restSize.toFixed(1)}KB)`);
  console.log(`[Cache] Written to ${outDir}`);
}

cacheProducts().catch((err) => {
  console.warn("[Cache] Warning: Failed to generate product cache:", err.message || err);
  console.warn("[Cache] The site will load products from the API instead of static JSON");
  process.exit(0);
});
