export interface ProductUrlSource {
  id: number | string;
  handle?: string | null;
}

export function productPath(product: ProductUrlSource): string {
  const identifier = product.handle?.trim() || String(product.id);
  return `/product/${encodeURIComponent(identifier)}`;
}