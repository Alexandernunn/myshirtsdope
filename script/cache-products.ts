import { fetchAllStorefrontProducts, mapStorefrontProduct } from "../server/shopify-storefront";
import type { Product } from "../shared/schema";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

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

  const slim = products.map((p) => ({
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
  }));

  const outDir = path.resolve("dist/public/data");
  await mkdir(outDir, { recursive: true });

  await writeFile(path.join(outDir, "products.json"), JSON.stringify(products));
  await writeFile(path.join(outDir, "products-slim.json"), JSON.stringify(slim));

  const fullSize = Buffer.byteLength(JSON.stringify(products)) / 1024;
  const slimSize = Buffer.byteLength(JSON.stringify(slim)) / 1024;

  console.log(`[Cache] Cached ${products.length} products`);
  console.log(`[Cache] Full: ${fullSize.toFixed(1)}KB, Slim: ${slimSize.toFixed(1)}KB`);
  console.log(`[Cache] Written to ${outDir}`);
}

cacheProducts().catch((err) => {
  console.error("[Cache] Failed:", err);
  process.exit(1);
});
