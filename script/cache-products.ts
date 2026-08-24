import { fetchAllStorefrontProducts, mapStorefrontProduct } from "../server/shopify-storefront";
import type { Product, ProductSummary } from "../shared/schema";
import { getColorImageVariants } from "../shared/image-variants";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prerenderCatalog } from "./prerender-catalog";
import { generateSitemap } from "./generate-sitemap";

if (!process.env.SHOPIFY_ACCESS_TOKEN || !process.env.SHOPIFY_STORE_DOMAIN) {
  console.error("[Cache] Build failed: missing SHOPIFY_ACCESS_TOKEN or SHOPIFY_STORE_DOMAIN");
  console.error("[Cache] Product data and prerendered catalog pages are required build artifacts");
  process.exit(1);
}

async function cacheProducts() {
  console.log("[Cache] Fetching products from Shopify...");
  const rawProducts = await fetchAllStorefrontProducts();

  const products: Product[] = rawProducts.map((sp) => {
    const data = mapStorefrontProduct(sp);
    return {
      id: sp.id,
      shopifyProductId: data.shopifyProductId,
      updatedAt: data.updatedAt,
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

  const slim: ProductSummary[] = products.map((p) => {
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

  const PRIMARY_HERO_PRODUCT_NAME = "A Milli youth shirt";
  const CULTURE_DECK_SIZE = 8;
  const INITIAL_CHUNK_SIZE = 50;
  const slimInitial = slim.slice(0, INITIAL_CHUNK_SIZE);
  const slimRest = slim.slice(INITIAL_CHUNK_SIZE);
  const primaryDeckProduct = slim.find((product) => product.name === PRIMARY_HERO_PRODUCT_NAME);
  const deckCandidates = slim.filter((product) => product.name !== PRIMARY_HERO_PRODUCT_NAME);
  const deckSlots = Math.max(0, CULTURE_DECK_SIZE - (primaryDeckProduct ? 1 : 0));
  const deckProducts = [
    ...(primaryDeckProduct ? [primaryDeckProduct] : []),
    ...Array.from({ length: Math.min(deckSlots, deckCandidates.length) }, (_, index) => {
      const candidateIndex = Math.floor((index * deckCandidates.length) / deckSlots);
      return deckCandidates[candidateIndex];
    }),
  ];

  const outDir = path.resolve("dist/public/data");
  await mkdir(outDir, { recursive: true });

  await writeFile(path.join(outDir, "products.json"), JSON.stringify(products));
  await writeFile(path.join(outDir, "products-slim.json"), JSON.stringify(slim));
  await writeFile(path.join(outDir, "products-slim-1.json"), JSON.stringify(slimInitial));
  await writeFile(path.join(outDir, "products-slim-rest.json"), JSON.stringify(slimRest));
  await writeFile(path.join(outDir, "products-deck.json"), JSON.stringify(deckProducts));
  await prerenderCatalog(products, slimInitial, deckProducts);
  await generateSitemap(products);

  const fullSize = Buffer.byteLength(JSON.stringify(products)) / 1024;
  const slimSize = Buffer.byteLength(JSON.stringify(slim)) / 1024;
  const initialSize = Buffer.byteLength(JSON.stringify(slimInitial)) / 1024;
  const restSize = Buffer.byteLength(JSON.stringify(slimRest)) / 1024;
  const deckSize = Buffer.byteLength(JSON.stringify(deckProducts)) / 1024;

  console.log(`[Cache] Cached ${products.length} products`);
  console.log(`[Cache] Full: ${fullSize.toFixed(1)}KB, Slim: ${slimSize.toFixed(1)}KB`);
  console.log(`[Cache] Chunked: Initial ${slimInitial.length} products (${initialSize.toFixed(1)}KB), Rest ${slimRest.length} products (${restSize.toFixed(1)}KB), Deck ${deckProducts.length} products (${deckSize.toFixed(1)}KB)`);
  console.log(`[Cache] Written to ${outDir}`);
}

cacheProducts().catch((err) => {
  console.error("[Cache] Build failed while generating product data or prerendered pages:", err.message || err);
  process.exit(1);
});
