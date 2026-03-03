import {
  type Product,
  type CartItem,
  type CartItemWithProduct,
  type InsertCartItem,
} from "@shared/schema";
import { fetchAllStorefrontProducts, mapStorefrontProduct } from "./shopify-storefront";

let productCache: Product[] = [];
let productCacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

const cartStore = new Map<string, CartItem[]>();
let cartIdCounter = 0;

function nextCartId(): string {
  cartIdCounter++;
  return `cart_${cartIdCounter}_${Date.now()}`;
}

export async function loadProducts(): Promise<Product[]> {
  const now = Date.now();
  if (productCache.length > 0 && now - productCacheTimestamp < CACHE_TTL_MS) {
    return productCache;
  }

  try {
    console.log("[Storage] Fetching products from Shopify...");
    const rawProducts = await fetchAllStorefrontProducts();
    const mapped: Product[] = rawProducts.map((sp, index) => {
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

    productCache = mapped;
    productCacheTimestamp = now;
    console.log(`[Storage] Cached ${mapped.length} products from Shopify`);
    return mapped;
  } catch (error) {
    console.error("[Storage] Failed to fetch products from Shopify:", error);
    if (productCache.length > 0) {
      console.log("[Storage] Returning stale cache");
      return productCache;
    }
    return [];
  }
}

export function getProduct(id: number): Product | undefined {
  return productCache.find((p) => p.id === id);
}

export function getCartItems(sessionId: string): CartItemWithProduct[] {
  const items = cartStore.get(sessionId) || [];
  const result: CartItemWithProduct[] = [];
  for (const item of items) {
    const product = getProduct(item.productId);
    if (product) {
      result.push({ ...item, product });
    }
  }
  return result;
}

export function addCartItem(data: InsertCartItem): CartItem {
  const items = cartStore.get(data.sessionId) || [];

  const existing = items.find(
    (i) =>
      i.productId === data.productId &&
      i.size === data.size &&
      i.color === data.color
  );

  if (existing) {
    existing.quantity += data.quantity || 1;
    return existing;
  }

  const newItem: CartItem = {
    id: nextCartId(),
    sessionId: data.sessionId,
    productId: data.productId,
    quantity: data.quantity || 1,
    size: data.size,
    color: data.color,
  };
  items.push(newItem);
  cartStore.set(data.sessionId, items);
  return newItem;
}

export function updateCartItemQuantity(
  sessionId: string,
  itemId: string,
  quantity: number
): CartItem | undefined {
  const items = cartStore.get(sessionId);
  if (!items) return undefined;
  const item = items.find((i) => i.id === itemId);
  if (!item) return undefined;
  item.quantity = quantity;
  return item;
}

export function removeCartItem(sessionId: string, itemId: string): boolean {
  const items = cartStore.get(sessionId);
  if (!items) return false;
  const idx = items.findIndex((i) => i.id === itemId);
  if (idx === -1) return false;
  items.splice(idx, 1);
  if (items.length === 0) {
    cartStore.delete(sessionId);
  }
  return true;
}

export function clearCart(sessionId: string): void {
  cartStore.delete(sessionId);
}
