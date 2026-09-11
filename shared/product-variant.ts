import type { Product, ShopifyVariantMapping } from "./schema";
import { productPath } from "./product-url";

export function getDefaultVariant(product: Product): ShopifyVariantMapping | undefined {
  const variants = product.shopifyVariants ?? [];
  return variants.find((variant) => variant.availableForSale) ?? variants[0];
}

export function getVariantImage(product: Product, variant: ShopifyVariantMapping | undefined): string {
  if (!variant) return product.imageUrl;
  return variant.imageUrl || product.colorImages?.[variant.color] || product.imageUrl;
}

export function getVariantPath(product: Product, variant: ShopifyVariantMapping): string {
  const params = new URLSearchParams();
  params.set("v", variant.variantId.split("/").pop() || variant.variantId);
  const query = params.toString();
  return `${productPath(product)}${query ? `?${query}` : ""}`;
}

export function findRequestedVariant(
  product: Product,
  variantId: string | null,
  color: string | null,
  size: string | null,
): ShopifyVariantMapping | undefined {
  if (variantId) {
    const byId = (product.shopifyVariants ?? []).find(
      (variant) => variant.variantId === variantId || variant.variantId.endsWith(`/${variantId}`),
    );
    if (byId) return byId;
  }
  if (!color && !size) return undefined;
  return (product.shopifyVariants ?? []).find(
    (variant) =>
      (!color || variant.color === color) &&
      (!size || variant.size === size),
  );
}