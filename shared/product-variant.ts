import type { Product, ShopifyVariantMapping } from "./schema";
import { productPath } from "./product-url";

export type VariantAxis = "color" | "size";

const VARIANT_QUERY_KEYS = ["color", "size", "v", "variant"] as const;

export function variantValueSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function hasUniqueSlugs(values: string[]): boolean {
  const slugs = values.map(variantValueSlug);
  return slugs.every(Boolean) && new Set(slugs).size === slugs.length;
}

export function getReadableVariantAxes(product: Product): VariantAxis[] {
  const variants = product.shopifyVariants ?? [];
  if (variants.length <= 1) return [];

  const colors = uniqueValues(variants.map((variant) => variant.color));
  const sizes = uniqueValues(variants.map((variant) => variant.size));
  if (!hasUniqueSlugs(colors) || !hasUniqueSlugs(sizes)) return [];

  const axes: VariantAxis[] = [];
  if (colors.length > 1) axes.push("color");
  if (sizes.length > 1) axes.push("size");
  if (axes.length === 0) return [];

  const selections = variants.map((variant) =>
    axes.map((axis) => variantValueSlug(variant[axis])).join("\u0000"),
  );
  return new Set(selections).size === selections.length ? axes : [];
}

export function updateVariantSearchParams(
  product: Product,
  variant: ShopifyVariantMapping | undefined,
  source: URLSearchParams = new URLSearchParams(),
  requestedAxes?: VariantAxis[],
): URLSearchParams {
  const params = new URLSearchParams(source);
  for (const key of VARIANT_QUERY_KEYS) params.delete(key);

  if (!variant) return params;
  const supportedAxes = getReadableVariantAxes(product);
  const axes = requestedAxes
    ? supportedAxes.filter((axis) => requestedAxes.includes(axis))
    : supportedAxes;
  for (const axis of axes) params.append(axis, variantValueSlug(variant[axis]));
  return params;
}

export function getDefaultVariant(product: Product): ShopifyVariantMapping | undefined {
  const variants = product.shopifyVariants ?? [];
  return variants.find((variant) => variant.availableForSale) ?? variants[0];
}

export function getVariantImage(product: Product, variant: ShopifyVariantMapping | undefined): string {
  if (!variant) return product.imageUrl;
  return variant.imageUrl || product.colorImages?.[variant.color] || product.imageUrl;
}

export function getVariantPath(product: Product, variant: ShopifyVariantMapping): string {
  const params = updateVariantSearchParams(product, variant);
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
    return undefined;
  }
  if (!color && !size) return undefined;
  const axes = getReadableVariantAxes(product);
  if ((color && !axes.includes("color")) || (size && !axes.includes("size"))) return undefined;

  const matches = (product.shopifyVariants ?? []).filter((variant) =>
    (!color || variantValueSlug(variant.color) === color.toLowerCase()) &&
    (!size || variantValueSlug(variant.size) === size.toLowerCase()),
  );
  if (matches.length === 0) return undefined;
  if (color && size) return matches.length === 1 ? matches[0] : undefined;
  return matches.find((variant) => variant.availableForSale) ?? matches[0];
}