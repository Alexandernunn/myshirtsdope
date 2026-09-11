import type { Product } from "./schema";

export interface CatalogAlias {
  sourceId: number;
  sourceHandle: string;
  targetHandle: string;
}

export interface CatalogConsolidationGroup {
  normalizedTitle: string;
  targetHandle: string;
  backingProductId: number;
  members: Array<{
    id: number;
    handle: string;
    availableVariants: number;
    totalVariants: number;
  }>;
}

export interface ConsolidatedCatalog {
  products: Product[];
  aliases: CatalogAlias[];
  groups: CatalogConsolidationGroup[];
}

export function normalizeCatalogTitle(title: string): string {
  return title.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function availableVariantCount(product: Product): number {
  return (product.shopifyVariants ?? []).filter((variant) => variant.availableForSale).length;
}

function choosePublicHandle(products: Product[]): string {
  return [...products]
    .sort((a, b) => {
      const aNumbered = /-\d+$/.test(a.handle) ? 1 : 0;
      const bNumbered = /-\d+$/.test(b.handle) ? 1 : 0;
      return aNumbered - bNumbered || a.handle.length - b.handle.length || a.id - b.id;
    })[0].handle;
}

function chooseBackingProduct(products: Product[]): Product {
  return [...products].sort((a, b) =>
    availableVariantCount(b) - availableVariantCount(a) ||
    (b.shopifyVariants?.length ?? 0) - (a.shopifyVariants?.length ?? 0) ||
    b.colors.length - a.colors.length ||
    b.sizes.length - a.sizes.length ||
    b.imageUrls.length - a.imageUrls.length ||
    b.description.length - a.description.length ||
    a.id - b.id
  )[0];
}

function mergeSafeMetadata(backing: Product, members: Product[], targetHandle: string): Product {
  const description = [...members]
    .map((product) => product.description.trim())
    .sort((a, b) => b.length - a.length)[0] || backing.description;
  const tags = Array.from(new Set(members.flatMap((product) => product.tags ?? [])));
  const latestUpdatedAt = [...members]
    .map((product) => product.updatedAt)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || backing.updatedAt;

  return {
    ...backing,
    handle: targetHandle,
    description,
    tags: tags.length > 0 ? tags : null,
    badge: backing.badge ?? members.find((product) => product.badge)?.badge ?? null,
    isNewDrop: members.some((product) => product.isNewDrop === true),
    updatedAt: latestUpdatedAt,
  };
}

export function consolidateCatalog(products: Product[]): ConsolidatedCatalog {
  const grouped = new Map<string, Product[]>();
  for (const product of products) {
    const key = normalizeCatalogTitle(product.name);
    grouped.set(key, [...(grouped.get(key) ?? []), product]);
  }

  const consolidated: Product[] = [];
  const aliases: CatalogAlias[] = [];
  const groups: CatalogConsolidationGroup[] = [];

  grouped.forEach((members: Product[], normalizedTitle: string) => {
    if (members.length === 1) {
      consolidated.push(members[0]);
      return;
    }

    const targetHandle = choosePublicHandle(members);
    const backing = chooseBackingProduct(members);
    consolidated.push(mergeSafeMetadata(backing, members, targetHandle));
    aliases.push(...members.map((member) => ({
      sourceId: member.id,
      sourceHandle: member.handle,
      targetHandle,
    })));
    groups.push({
      normalizedTitle,
      targetHandle,
      backingProductId: backing.id,
      members: members.map((member) => ({
        id: member.id,
        handle: member.handle,
        availableVariants: availableVariantCount(member),
        totalVariants: member.shopifyVariants?.length ?? 0,
      })),
    });
  });

  return { products: consolidated, aliases, groups };
}