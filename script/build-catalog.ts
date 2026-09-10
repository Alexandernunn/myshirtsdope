import { fetchAllStorefrontProducts, mapStorefrontProduct } from "../server/shopify-storefront";
import type { Product, ProductSummary } from "../shared/schema";
import { getColorImageVariants } from "../shared/image-variants";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prerenderCatalog } from "./prerender-catalog";
import { generateSitemap } from "./generate-sitemap";
import { FEATURED_SHOP_PRODUCT_IDS } from "../client/src/lib/product-grouping";

if (!process.env.SHOPIFY_ACCESS_TOKEN || !process.env.SHOPIFY_STORE_DOMAIN) {
  console.error("[Catalog] Build failed: missing Shopify catalog configuration");
  process.exit(1);
}

async function buildCatalog() {
  console.log("[Catalog] Fetching products from Shopify...");
  const rawProducts = await fetchAllStorefrontProducts();
  const products: Product[] = rawProducts.map((shopifyProduct) => {
    const data = mapStorefrontProduct(shopifyProduct);
    return {
      id: shopifyProduct.id,
      handle: data.handle,
      shopifyProductId: data.shopifyProductId,
      updatedAt: data.updatedAt,
      name: data.name,
      description: data.description,
      price: data.price,
      category: data.category,
      imageUrl: data.imageUrl,
      imageUrls: data.imageUrls,
      badge: null,
      isNewDrop: data.isNewDrop,
      sizes: data.sizes,
      colors: data.colors,
      colorImages: data.colorImages,
      tags: data.tags,
      shopifyVariants: data.shopifyVariants,
    };
  });

  const invalidHandles = products.filter(
    (product) =>
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.handle) ||
      /^\d+$/.test(product.handle),
  );
  if (invalidHandles.length > 0) {
    throw new Error(
      `Active Shopify products have missing or invalid handles: ${invalidHandles
        .slice(0, 10)
        .map((product) => product.id)
        .join(", ")}`,
    );
  }
  if (new Set(products.map((product) => product.handle)).size !== products.length) {
    throw new Error("Active Shopify products have duplicate handles");
  }

  const slim: ProductSummary[] = products.map((product) => {
    const variants = getColorImageVariants(product.colorImages ?? null);
    return {
      id: product.id,
      handle: product.handle,
      name: product.name,
      price: product.price,
      category: product.category,
      imageUrl: product.imageUrl,
      badge: product.badge,
      isNewDrop: product.isNewDrop,
      tags: product.tags,
      sizes: product.sizes,
      colors: product.colors,
      ...(variants.length > 0 ? { colorImageVariants: variants } : {}),
    };
  });

  const primaryHeroName = "A Milli youth shirt";
  const featuredProducts = FEATURED_SHOP_PRODUCT_IDS
    .map((id) => slim.find((product) => product.id === id))
    .filter((product): product is ProductSummary => Boolean(product));
  const featuredIds = new Set(featuredProducts.map((product) => product.id));
  const remainingProducts = slim.filter((product) => !featuredIds.has(product.id));
  const slimInitial = [
    ...featuredProducts,
    ...remainingProducts.slice(0, Math.max(0, 50 - featuredProducts.length)),
  ];
  const initialIds = new Set(slimInitial.map((product) => product.id));
  const slimRest = slim.filter((product) => !initialIds.has(product.id));
  const primaryDeckProduct = slim.find((product) => product.name === primaryHeroName);
  const deckCandidates = slim.filter((product) => product.name !== primaryHeroName);
  const deckSlots = Math.max(0, 8 - (primaryDeckProduct ? 1 : 0));
  const deckProducts = [
    ...(primaryDeckProduct ? [primaryDeckProduct] : []),
    ...Array.from({ length: Math.min(deckSlots, deckCandidates.length) }, (_, index) => {
      const candidateIndex = Math.floor((index * deckCandidates.length) / deckSlots);
      return deckCandidates[candidateIndex];
    }),
  ];

  const outDir = path.resolve("dist/public/data");
  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outDir, "products.json"), JSON.stringify(products)),
    writeFile(path.join(outDir, "products-slim.json"), JSON.stringify(slim)),
    writeFile(path.join(outDir, "products-slim-1.json"), JSON.stringify(slimInitial)),
    writeFile(path.join(outDir, "products-slim-rest.json"), JSON.stringify(slimRest)),
    writeFile(path.join(outDir, "products-deck.json"), JSON.stringify(deckProducts)),
  ]);
  await prerenderCatalog(products, slimInitial, deckProducts);
  await generateSitemap(products);

  console.log(`[Catalog] Cached and prerendered ${products.length} products`);
}

buildCatalog().catch((error) => {
  console.error("[Catalog] Build failed:", error.message || error);
  process.exit(1);
});