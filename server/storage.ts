import type { Product } from "../shared/schema";
import { fetchAllStorefrontProducts, mapStorefrontProduct } from "./shopify-storefront";
import { consolidateCatalog } from "../shared/catalog-consolidation";

let productCache: Product[] = [];
let productCacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;
let loadingPromise: Promise<Product[]> | null = null;
let productAliases = new Map<string, string>();

async function fetchAndCacheProducts(): Promise<Product[]> {
  console.log("[Storage] Fetching products from Shopify...");
  const rawProducts = await fetchAllStorefrontProducts();
  const mapped: Product[] = rawProducts.map((sp) => {
    const data = mapStorefrontProduct(sp);
    return {
      id: sp.id,
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

  const consolidated = consolidateCatalog(mapped);
  productCache = consolidated.products;
  productAliases = new Map(
    consolidated.aliases.flatMap((alias) => [
      [alias.sourceHandle, alias.targetHandle],
      [String(alias.sourceId), alias.targetHandle],
    ]),
  );
  productCacheTimestamp = Date.now();
  console.log(`[Storage] Cached ${productCache.length} public products from ${mapped.length} Shopify products`);
  return productCache;
}

export function startBackgroundLoad(): void {
  if (loadingPromise) return;
  loadingPromise = fetchAndCacheProducts()
    .catch((err) => {
      console.error("[Storage] Background fetch failed:", err);
      return productCache;
    })
    .finally(() => {
      loadingPromise = null;
    });
}

export async function loadProducts(): Promise<Product[]> {
  const now = Date.now();
  if (productCache.length > 0 && now - productCacheTimestamp < CACHE_TTL_MS) {
    return productCache;
  }

  if (productCache.length > 0) {
    startBackgroundLoad();
    return productCache;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  try {
    loadingPromise = fetchAndCacheProducts();
    const result = await loadingPromise;
    return result;
  } catch (error) {
    console.error("[Storage] Failed to fetch products from Shopify:", error);
    return [];
  } finally {
    loadingPromise = null;
  }
}

export async function forceRefreshProducts(): Promise<Product[]> {
  loadingPromise = null;
  productCacheTimestamp = 0;
  productCache = [];
  productAliases = new Map();
  return loadProducts();
}

export function getProduct(identifier: string | number): Product | undefined {
  const normalized = String(identifier).trim();
  const canonicalIdentifier = productAliases.get(normalized) ?? normalized;
  const numericId = /^\d+$/.test(canonicalIdentifier) ? Number(canonicalIdentifier) : null;
  return productCache.find((product) =>
    product.handle === canonicalIdentifier || (numericId !== null && product.id === numericId)
  );
}
