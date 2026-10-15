import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Product } from "../shared/schema";
import { groupProducts } from "../client/src/lib/product-grouping";
import {
  isKidsProduct,
  recommendationCategory,
  sameDesign,
  type CollectionRecommendations,
} from "../shared/collection-recommendations";
import { findRequestedVariant, getDefaultVariant } from "../shared/product-variant";

async function verify() {
  const products: Product[] = JSON.parse(await readFile("dist/public/data/products.json", "utf8"));
  const byId = new Map(products.map((product) => [product.id, product]));
  const handles = new Set(products.map((product) => product.handle));
  const sampleHandles = new Set([
    "stakes-is-high-hoodie",
    "its-all-about-the-benjamins-hoodie",
    "stakes-is-high-mug",
    "stakes-is-high-youth-shirt",
    "stakes-is-high-baby-onesie",
  ]);
  let totalBytes = 0;
  const samples = [];
  for (const current of products) {
    const raw = await readFile(`dist/public/data/recommendations/${current.handle}.json`, "utf8");
    totalBytes += Buffer.byteLength(raw);
    const row: CollectionRecommendations = JSON.parse(raw);
    assert.equal(row.cards.length, 4, `${current.handle}: must have 4 cards`);
    assert.equal(row.category, recommendationCategory(current));
    assert(row.fitProducts.length >= 1 && row.fitProducts.length <= 3);
    const colors = new Set<string>();
    for (const [index, card] of row.cards.entries()) {
      const product = byId.get(card.id)!;
      assert(product, `Unknown recommendation ${card.id}`);
      assert(product.imageUrl && product.tags?.length);
      assert(product.shopifyVariants?.some((variant) => variant.availableForSale));
      assert(!(/-\d+$/.test(card.handle) && handles.has(card.handle.replace(/-\d+$/, ""))));
      assert(!/^(?:short-sleeve-unisex-t-shirt|toddler-short-sleeve-tee|youth-heavy-blend-hoodie)(?:-\d+)?$/.test(card.handle));
      assert(!row.cards.slice(0, index).some((other) => sameDesign(other.name, card.name)), `${current.handle}: duplicate design`);
      if (sameDesign(current.name, card.name)) assert.equal(index, 1, `${current.handle}: matching design must be in slot two`);
      if (card.category === row.category) assert(!sameDesign(current.name, card.name), `${current.handle}: current design in same category`);
      if (isKidsProduct(current)) assert(isKidsProduct(product), `${current.handle}: adult on kids page`);
      const colorParam = new URL(card.href, "https://example.test").searchParams.get("color");
      if (card.color) {
        const color = card.color.toLowerCase().trim();
        assert(!colors.has(color), `${current.handle}: repeated color ${color}`);
        colors.add(color);
        const selected = findRequestedVariant(product, null, colorParam, null) ?? getDefaultVariant(product);
        assert.equal(selected?.color, card.color, `${current.handle}: color link does not select ${card.color}`);
        assert(product.shopifyVariants?.some((variant) =>
          variant.availableForSale && variant.color === card.color && variant.imageUrl === card.imageUrl,
        ), `${current.handle}: image is not a real available variant image`);
      } else {
        assert(product.shopifyVariants?.every((variant) => /^(default|default title)$/i.test(variant.color.trim())));
        assert.equal(colorParam, null);
        assert.equal(card.imageUrl, product.imageUrl);
      }
    }
    if (sampleHandles.has(current.handle)) samples.push({
      page: current.name, handle: current.handle, category: row.category,
      cards: row.cards.map((card) => ({ name: card.name, color: card.color })),
      bytes: Buffer.byteLength(raw),
    });
  }
  assert.equal(samples.length, sampleHandles.size, "Missing a requested sample page");
  console.log(JSON.stringify({
    productPagesVerified: products.length,
    averageRecommendationBytes: Math.round(totalBytes / products.length),
    totalShopProducts: products.length,
    totalShopCards: groupProducts(products).length,
    samples,
  }, null, 2));
}

verify().catch((error) => {
  console.error(error);
  process.exit(1);
});
