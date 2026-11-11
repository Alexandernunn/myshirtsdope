import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Product, ProductSummary } from "../../../shared/schema";
import {
  BEST_SELLER_PRODUCT_HANDLES,
  groupProducts,
  interleaveGroups,
  orderShopAllGroups,
  prioritizeFeaturedGroups,
  selectBestSellerProducts,
} from "./product-grouping";

const products: Product[] = JSON.parse(readFileSync("dist/public/data/products.json", "utf8"));
const groups = groupProducts(products);

test("All starts with the four requested designs, followed by their mixed product types", () => {
  const ordered = orderShopAllGroups(groups);
  assert.deepEqual(ordered.slice(0, 4).map((group) => group.adult.handle), [
    "dilla-detroit-la-hoodie", "stakes-is-high-hoodie",
    "phife-check-hoodie", "i-miss-the-old-kanye-mug",
  ]);
  assert.deepEqual(ordered.slice(0, BEST_SELLER_PRODUCT_HANDLES.length).map((group) => group.adult.handle),
    BEST_SELLER_PRODUCT_HANDLES);
  for (const product of selectBestSellerProducts(products)) {
    assert(product.shopifyVariants?.some((variant) => variant.availableForSale), `${product.handle} is unavailable`);
  }
});

test("the remaining designs retain their existing order with no duplicates or missing cards", () => {
  const baseline = prioritizeFeaturedGroups(interleaveGroups(groups));
  const ordered = orderShopAllGroups(groups);
  const promoted = new Set<string>(BEST_SELLER_PRODUCT_HANDLES);
  assert.deepEqual(
    ordered.filter((group) => !promoted.has(group.adult.handle!)).map((group) => group.adult.id),
    baseline.filter((group) => !promoted.has(group.adult.handle!)).map((group) => group.adult.id),
  );
  assert.equal(ordered.length, groups.length);
  assert.equal(new Set(ordered.map((group) => group.adult.id)).size, groups.length);
});

test("filtered results never acquire unrelated best sellers", () => {
  const filtered = groups.filter((group) => /phife/i.test(group.adult.name));
  const ordered = orderShopAllGroups(filtered);
  assert.equal(ordered.length, filtered.length);
  assert(ordered.every((group) => /phife/i.test(group.adult.name)));
  assert.deepEqual(orderShopAllGroups([]), []);
  assert.deepEqual(selectBestSellerProducts([]), []);
});

test("carousel contains exactly the chosen eight products, without random miscellaneous designs", () => {
  const deck = selectBestSellerProducts(products, 8);
  const builtDeck: ProductSummary[] = JSON.parse(readFileSync("dist/public/data/products-deck.json", "utf8"));
  assert.deepEqual(deck.map((product) => product.handle), BEST_SELLER_PRODUCT_HANDLES.slice(0, 8));
  assert.deepEqual(builtDeck.map((product) => product.handle), deck.map((product) => product.handle));
  assert.equal(new Set(deck.map((product) => product.id)).size, 8);
  assert.equal(selectBestSellerProducts(products.slice().reverse(), 8)[0].handle, deck[0].handle);
});

test("best sellers are in the first chunk and retain their positions when the rest loads", () => {
  const initial: ProductSummary[] = JSON.parse(readFileSync("dist/public/data/products-slim-1.json", "utf8"));
  const rest: ProductSummary[] = JSON.parse(readFileSync("dist/public/data/products-slim-rest.json", "utf8"));
  const initialOrder = orderShopAllGroups(groupProducts(initial));
  const completeOrder = orderShopAllGroups(groupProducts([...initial, ...rest]));
  assert(initial.length <= 50);
  assert.deepEqual(initialOrder.slice(0, 12).map((group) => group.adult.handle), BEST_SELLER_PRODUCT_HANDLES);
  assert.deepEqual(completeOrder.slice(0, 12).map((group) => group.adult.handle), BEST_SELLER_PRODUCT_HANDLES);
  assert.equal(new Set([...initial, ...rest].map((product) => product.id)).size, products.length);
  assert.equal(initial.length + rest.length, products.length);
});
