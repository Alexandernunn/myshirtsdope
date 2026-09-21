import manifest from "../data/product-merges.json";

export interface ProductMergeVariant {
  color: string;
  size: string;
  archiveVariantId: string;
  keeperVariantId: string;
}

export interface ProductMergeArchive {
  id: string;
  handle: string;
  title: string;
  variantMappings: ProductMergeVariant[];
}

export interface ProductMergeRule {
  keeper: { id: string; handle: string; title: string };
  archives: ProductMergeArchive[];
}

export const PRODUCT_MERGES = manifest.merges as ProductMergeRule[];

export const ARCHIVED_PRODUCT_MERGES = PRODUCT_MERGES.flatMap((rule) =>
  rule.archives.map((archive) => ({ keeper: rule.keeper, archive }))
);

export function findArchivedProductMerge(
  id: number | string,
  handle?: string,
) {
  return ARCHIVED_PRODUCT_MERGES.find(({ archive }) =>
    archive.id === String(id) || archive.handle === handle
  );
}