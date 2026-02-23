import type { Product } from "@shared/schema";

const YOUTH_KEYWORDS = /\b(youth|kids|kid)\b/i;
const TODDLER_KEYWORDS = /\b(toddler|baby|infant)\b/i;

export type FitType = "adult" | "youth" | "toddler";

export interface ProductGroup {
  baseName: string;
  adult: Product;
  youth: Product | null;
  toddler: Product | null;
  fits: FitType[];
  category: string;
}

function getBaseName(name: string): string {
  return name
    .replace(YOUTH_KEYWORDS, "")
    .replace(TODDLER_KEYWORDS, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getFitType(name: string): FitType {
  if (TODDLER_KEYWORDS.test(name)) return "toddler";
  if (YOUTH_KEYWORDS.test(name)) return "youth";
  return "adult";
}

export function groupProducts(products: Product[]): ProductGroup[] {
  const groupMap = new Map<
    string,
    { adults: Product[]; youths: Product[]; toddlers: Product[] }
  >();

  for (const product of products) {
    const baseName = getBaseName(product.name);
    const key = `${baseName}__${product.category.toLowerCase()}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, { adults: [], youths: [], toddlers: [] });
    }

    const group = groupMap.get(key)!;
    const fit = getFitType(product.name);
    if (fit === "toddler") {
      group.toddlers.push(product);
    } else if (fit === "youth") {
      group.youths.push(product);
    } else {
      group.adults.push(product);
    }
  }

  const result: ProductGroup[] = [];

  for (const group of Array.from(groupMap.values())) {
    const adult = group.adults[0] || null;
    const youth = group.youths[0] || null;
    const toddler = group.toddlers[0] || null;

    const primary = adult || youth || toddler;
    if (!primary) continue;

    const fits: FitType[] = [];
    if (adult) fits.push("adult");
    if (youth) fits.push("youth");
    if (toddler) fits.push("toddler");

    result.push({
      baseName: primary.name,
      adult: primary,
      youth,
      toddler,
      fits,
      category: primary.category,
    });
  }

  return result;
}

export function findGroupForProduct(
  products: Product[],
  productId: number
): ProductGroup | null {
  const groups = groupProducts(products);
  for (const group of groups) {
    if (
      group.adult.id === productId ||
      group.youth?.id === productId ||
      group.toddler?.id === productId
    ) {
      return group;
    }
  }
  return null;
}

export function getProductForFit(
  group: ProductGroup,
  fit: FitType
): Product {
  if (fit === "youth" && group.youth) return group.youth;
  if (fit === "toddler" && group.toddler) return group.toddler;
  return group.adult;
}

export function getFitLabel(fit: FitType): string {
  switch (fit) {
    case "adult":
      return "ADULT";
    case "youth":
      return "YOUTH / KIDS";
    case "toddler":
      return "TODDLER / BABY";
  }
}

type DisplayBucket = "shirts" | "hoodies" | "mugs" | "onesies" | "other";

const BUCKET_PATTERNS: [DisplayBucket, RegExp][] = [
  ["shirts", /\b(shirt|tee|t-shirt)\b/i],
  ["hoodies", /\b(hoodie|sweatshirt|crewneck)\b/i],
  ["mugs", /\b(mug|cup|tumbler|bottle)\b/i],
  ["onesies", /\b(onesie|baby|toddler|infant)\b/i],
];

function getBucket(group: ProductGroup): DisplayBucket {
  const text = `${group.baseName} ${group.category}`;
  for (const [bucket, pattern] of BUCKET_PATTERNS) {
    if (pattern.test(text)) return bucket;
  }
  return "other";
}

export function interleaveGroups(groups: ProductGroup[]): ProductGroup[] {
  const buckets = new Map<DisplayBucket, ProductGroup[]>();
  for (const group of groups) {
    const bucket = getBucket(group);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket)!.push(group);
  }

  const activeBuckets = Array.from(buckets.values()).filter((b) => b.length > 0);
  if (activeBuckets.length <= 1) return groups;

  const result: ProductGroup[] = [];
  const indices = new Array(activeBuckets.length).fill(0);

  let remaining = groups.length;
  while (remaining > 0) {
    for (let i = 0; i < activeBuckets.length; i++) {
      if (indices[i] < activeBuckets[i].length) {
        result.push(activeBuckets[i][indices[i]]);
        indices[i]++;
        remaining--;
      }
    }
  }

  return result;
}

export function getFitBadgeLabel(fits: FitType[]): string | null {
  if (fits.length <= 1) return null;
  const labels = fits.map((f) => {
    if (f === "adult") return "ADULT";
    if (f === "youth") return "YOUTH";
    return "TODDLER";
  });
  return labels.join(" + ");
}
