import type { Product } from "./schema";
import { productPath } from "./product-url";
import { variantValueSlug } from "./product-variant";
import { groupProducts } from "../client/src/lib/product-grouping";
import { chooseDistinctColorProducts } from "./recommendation-colors";

export const CATEGORY_COLLECTIONS = {
  Hoodies: "adult-hoodies",
  Shirts: "adult-t-shirts",
  Onesies: "baby-onesies",
  Accessories: "mugs-1",
} as const;
export type RecommendationCategory = keyof typeof CATEGORY_COLLECTIONS;
export interface BestSeller {
  id: number;
  name: string;
}
export type BestSellerOrder = Record<RecommendationCategory, BestSeller[]>;
export interface CollectionCard {
  id: number;
  handle: string;
  name: string;
  price: number;
  category: string;
  imageUrl: string;
  href: string;
  color: string | null;
}
export interface CollectionRecommendations {
  category: RecommendationCategory;
  cards: CollectionCard[];
  fitProducts: Product[];
}

const ITEM_SUFFIX = /\s+(?:youth toddler shirt|youth t-shirt|youth hoodie|youth shirt|toddler shirt|baby onesie|t-shirt|hoodie|shirt|onesie|oneise|mug)$/i;
const GENERIC_TAGS = new Set("hip hop,music,rap,culture,black,shirt,hoodie,mug,onesie,youth,toddler,baby,old school".split(","));
const BLANK_HANDLES = /^(?:short-sleeve-unisex-t-shirt|toddler-short-sleeve-tee|youth-heavy-blend-hoodie)(?:-\d+)?$/i;

export function designName(title: string): string {
  return title.trim().replace(ITEM_SUFFIX, "").normalize("NFKD").toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(4|2|u|n)\b/g, (word) => ({ "4": "for", "2": "to", u: "you", n: "and" })[word]!)
    .replace(/\s+/g, " ").trim();
}

export function sameDesign(a: string, b: string): boolean {
  const left = designName(a);
  const right = designName(b);
  return Boolean(left && right) && (
    left === right || left.startsWith(`${right} `) || right.startsWith(`${left} `)
  );
}

// Mirrors the shop's display-category precedence, while using the existing
// mapped category for ordinary products. Onesies are mapped as Shirts upstream.
export function recommendationCategory(product: Pick<Product, "name" | "category">): RecommendationCategory {
  if (/\b(onesie|onesies|oneise)\b/i.test(product.name)) return "Onesies";
  if (/\b(shirt|tee|t-shirt|tshirt)\b/i.test(product.name)) return "Shirts";
  if (product.category === "Hoodies" || /\b(hoodie|sweatshirt|crewneck)\b/i.test(product.name)) return "Hoodies";
  if (["Accessories", "Hats"].includes(product.category) || /\b(mug|mugs|cup|candle|candles|tumbler|bottle)\b/i.test(product.name)) return "Accessories";
  return "Shirts";
}

export function isKidsProduct(product: Pick<Product, "name">): boolean {
  return /\b(youth|kids?|toddler|baby|infant|onesie|onesies|oneise)\b/i.test(product.name);
}

interface CatalogContext {
  order: BestSellerOrder;
  adults: Product[];
  kids: Product[];
  rank: (product: Product) => number;
  fits: Map<number, Product[]>;
}
const catalogContexts = new WeakMap<Product[], CatalogContext>();

function catalogContext(products: Product[], bestSellers: BestSellerOrder): CatalogContext {
  const existing = catalogContexts.get(products);
  if (existing?.order === bestSellers) return existing;
  const handles = new Set(products.map((product) => product.handle));
  const eligible = products.filter((product) =>
    Boolean(product.imageUrl && product.tags?.length) &&
    product.shopifyVariants?.some((variant) => variant.availableForSale) &&
    !BLANK_HANDLES.test(product.handle) &&
    !(/-\d+$/.test(product.handle) && handles.has(product.handle.replace(/-\d+$/, ""))),
  );
  const ranks = new Map<number, number>();
  const rank = (product: Product): number => {
    const cached = ranks.get(product.id);
    if (cached !== undefined) return cached;
    const list = bestSellers[recommendationCategory(product)];
    const exactIndex = list.findIndex((entry) => entry.id === product.id);
    const index = exactIndex >= 0 ? exactIndex : list.findIndex((entry) => sameDesign(entry.name, product.name));
    const value = index < 0 ? Number.MAX_SAFE_INTEGER : index * 2 + (exactIndex >= 0 ? 0 : 1);
    ranks.set(product.id, value);
    return value;
  };
  const rankedGroups = (pool: Product[]) => groupProducts(pool)
    .map((group) => group.adult as Product)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const fits = new Map<number, Product[]>();
  for (const group of groupProducts(products)) {
    const members = Array.from(new Map([group.adult, group.youth, group.toddler]
      .filter((entry): entry is Product => Boolean(entry)).map((entry) => [entry.id, entry])).values());
    for (const member of members) fits.set(member.id, members);
  }
  const context = { order: bestSellers, adults: rankedGroups(eligible), kids: rankedGroups(eligible.filter(isKidsProduct)), rank, fits };
  catalogContexts.set(products, context);
  return context;
}

export function buildCollectionRecommendations(
  current: Product,
  products: Product[],
  bestSellers: BestSellerOrder,
): CollectionRecommendations {
  const category = recommendationCategory(current);
  const kidsOnly = isKidsProduct(current);
  const context = catalogContext(products, bestSellers);
  const { rank } = context;
  // Reuse the shop's fit grouping first, then loose-match spelling/name variants.
  const ranked = kidsOnly ? context.kids : context.adults;
  const sameCategory = ranked.filter((product) => recommendationCategory(product) === category && !sameDesign(product.name, current.name));
  const chosen: Product[] = [];
  const add = (product: Product | undefined) => {
    if (product && !chosen.some((entry) => entry.id === product.id || sameDesign(entry.name, product.name))) chosen.push(product);
  };
  add(sameCategory[0]);
  const otherCategories = (["Accessories", "Shirts", "Hoodies", "Onesies"] as const).filter((entry) => entry !== category);
  const matchingDesigns = otherCategories.flatMap((other) => ranked.filter((product) =>
    recommendationCategory(product) === other && sameDesign(product.name, current.name),
  ));
  const accessoryFallbacks = ranked.filter((product) =>
    recommendationCategory(product) === "Accessories" &&
    !sameDesign(product.name, current.name),
  );
  add(matchingDesigns[0] ?? accessoryFallbacks.find((product) =>
    !chosen.some((entry) => sameDesign(entry.name, product.name)),
  ));
  for (const product of sameCategory) {
    if (chosen.length >= 3) break;
    add(product);
  }

  const meaningfulTags = (product: Product) => new Set((product.tags ?? [])
    .map((tag) => tag.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim())
    .filter((tag) => !GENERIC_TAGS.has(tag)));
  const currentTags = meaningfulTags(current);
  const similarity = (product: Product) => Array.from(meaningfulTags(product)).filter((tag) => currentTags.has(tag)).length;
  const tagMatches = sameCategory.filter((product) => similarity(product) > 0)
    .sort((a, b) => similarity(b) - similarity(a) || rank(a) - rank(b));
  add(tagMatches.find((product) => !chosen.some((entry) => sameDesign(entry.name, product.name))));
  for (const product of sameCategory) {
    if (chosen.length >= 4) break;
    add(product);
  }

  const distinct = chooseDistinctColorProducts(chosen.slice(0, 4), [
    sameCategory,
    [...matchingDesigns, ...accessoryFallbacks, ...sameCategory],
    sameCategory,
    [...tagMatches, ...sameCategory],
  ], sameDesign);
  const cards = distinct.products.map((product, index): CollectionCard => {
    const variant = distinct.variants[index];
    const color = variant?.color ?? null;
    const query = color ? `?${new URLSearchParams({ color: variantValueSlug(color) })}` : "";
    return {
      id: product.id, handle: product.handle, name: product.name, price: product.price,
      category: recommendationCategory(product), color,
      imageUrl: variant?.imageUrl ?? product.imageUrl,
      href: `${productPath(product)}${query}`,
    };
  });
  const fitProducts = context.fits.get(current.id) ?? [current];
  return { category, cards, fitProducts };
}
