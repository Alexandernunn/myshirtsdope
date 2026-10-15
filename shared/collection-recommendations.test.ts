import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Product } from "./schema";
import { buildCollectionRecommendations, designName, sameDesign, type BestSellerOrder } from "./collection-recommendations";
import { findRequestedVariant } from "./product-variant";

let nextId = 1;
function product(name: string, category = "Hoodies", overrides: Partial<Product> = {}): Product {
  const id = nextId++;
  return {
    id, handle: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name, category,
    price: 30, shopifyProductId: `gid://shopify/Product/${id}`, updatedAt: "",
    description: "", imageUrl: `${id}.jpg`, imageUrls: [], badge: null, isNewDrop: false,
    sizes: ["M"], colors: ["Black", "Red", "Navy", "Irish Green"], tags: ["rap", "specific artist"],
    colorImages: null,
    shopifyVariants: ["Black", "Red", "Navy", "Irish Green"].map((color, i) => ({
      variantId: `gid://shopify/ProductVariant/${id * 10 + i}`, size: "M", color,
      price: "30.00", availableForSale: true, imageUrl: `${id}-${color}.jpg`, sku: null, barcode: null,
    })),
    ...overrides,
  };
}
function order(hoodies: Product[], shirts: Product[] = [], accessories: Product[] = [], onesies: Product[] = []): BestSellerOrder {
  const map = (products: Product[]) => products.map(({ id, name }) => ({ id, name }));
  return { Hoodies: map(hoodies), Shirts: map(shirts), Accessories: map(accessories), Onesies: map(onesies) };
}

test("loose design matching removes longest suffix, normalizes terms, and matches whole-word prefixes", () => {
  assert.equal(designName("It's 4 U n Me youth toddler shirt"), "its for you and me");
  assert(sameDesign("Woo Hah hoodie", "Woo Hah Got You All In Check mug"));
  assert(sameDesign("Road 2 Love baby onesie", "Road to Love shirt"));
  assert(!sameDesign("Love hoodie", "Lovely shirt"));
});

test("slots use best seller, same-design mug in slot two, next best seller, then meaningful-tag similarity", () => {
  const current = product("Current hoodie");
  const first = product("Zed hoodie", "Hoodies", { tags: ["hip hop"] });
  const second = product("Bee hoodie", "Hoodies", { tags: ["rap"] });
  const tagMatch = product("Match hoodie");
  const alphabetic = product("Aaa hoodie", "Hoodies", { tags: ["culture"] });
  const mug = product("Current mug", "Accessories");
  const products = [alphabetic, second, current, mug, tagMatch, first];
  const row = buildCollectionRecommendations(current, products, order([first, second, alphabetic, tagMatch], [], [mug]));
  assert.deepEqual(row.cards.map((card) => card.id), [first.id, mug.id, second.id, tagMatch.id]);
  assert.deepEqual(row.cards.map((card) => card.color), ["Black", "Red", "Navy", "Irish Green"]);
  for (const card of row.cards) {
    const target = products.find((entry) => entry.id === card.id)!;
    const color = new URL(card.href, "https://example.test").searchParams.get("color");
    assert.equal(findRequestedVariant(target, null, color, null)?.color, card.color);
  }
  assert(row.cards[3].href.endsWith("?color=irish-green"));
});

test("no-image, untagged, sold-out, generic blanks, suffix leftovers, own-design fits, and loose duplicate designs are excluded", () => {
  const current = product("Current hoodie");
  const valid = ["Alpha", "Beta", "Gamma", "Delta"].map((name) => product(`${name} hoodie`));
  const bad = [
    product("Current youth hoodie"),
    product("No Image hoodie", "Hoodies", { imageUrl: "" }),
    product("No Tags hoodie", "Hoodies", { tags: [] }),
    product("Sold Out hoodie", "Hoodies", { shopifyVariants: [] }),
    product("Blank hoodie", "Hoodies", { handle: "youth-heavy-blend-hoodie" }),
    product("Leftover hoodie", "Hoodies", { handle: `${valid[0].handle}-1` }),
    product("Alpha Got More hoodie"),
  ];
  const row = buildCollectionRecommendations(current, [current, ...valid, ...bad], order([...valid, ...bad]));
  assert.deepEqual(row.cards.map((card) => card.id), valid.map((entry) => entry.id));
});

test("kids pages only recommend kids, using adult best-seller design rankings where applicable", () => {
  const current = product("Current youth shirt", "Shirts");
  const adults = ["First", "Second", "Third", "Fourth"].map((name) => product(`${name} shirt`, "Shirts"));
  const kids = adults.map((entry) => product(entry.name.replace(" shirt", " youth shirt"), "Shirts"));
  const mug = product("Current mug", "Accessories");
  const row = buildCollectionRecommendations(current, [current, ...adults, ...kids, mug], order([], adults, [mug]));
  assert.deepEqual(row.cards.map((card) => card.id), kids.map((entry) => entry.id));
  const onesie = product("Current onesie", "Shirts");
  const babies = ["One", "Two", "Three", "Four"].map((name) => product(`${name} onesie`, "Shirts"));
  const babyRow = buildCollectionRecommendations(onesie, [onesie, ...adults, ...babies], order([], adults, [], babies));
  assert.equal(babyRow.category, "Onesies");
  assert.equal(babyRow.cards.length, 4);
  assert(babyRow.cards.every((card) => card.name.includes("onesie")));
});

test("default mugs use featured image without consuming a color; cross-category selection prefers mugs", () => {
  const current = product("Current hoodie");
  const first = product("First hoodie");
  const second = product("Second hoodie");
  const fourth = product("Fourth hoodie");
  const mug = product("Current mug", "Accessories", {
    colors: ["Default"],
    shopifyVariants: [{ variantId: "gid://shopify/ProductVariant/999", size: "One Size", color: "Default", price: "20", availableForSale: true, imageUrl: null, sku: null, barcode: null }],
  });
  const shirt = product("Current shirt", "Shirts");
  const row = buildCollectionRecommendations(current, [current, first, second, fourth, shirt, mug], order([first, second, fourth], [shirt], [mug]));
  assert.equal(row.cards[1].id, mug.id);
  assert.equal(row.cards[1].color, null);
  assert.equal(row.cards[1].imageUrl, mug.imageUrl);
  assert(!row.cards[1].href.includes("?"));
  assert.equal(row.cards[3].color, "Navy");
});

test("missing cross-category match falls back to the best-selling mug, and fit siblings remain available", () => {
  const current = product("Current hoodie");
  const youth = product("Current youth hoodie");
  const others = ["Alpha", "Beta", "Gamma"].map((name) => product(`${name} hoodie`));
  const mug = product("Popular mug", "Accessories");
  const row = buildCollectionRecommendations(current, [current, youth, ...others, mug], order(others, [], [mug]));
  assert.equal(row.cards[1].id, mug.id);
  assert.deepEqual(row.fitProducts.map((entry) => entry.id), [current.id, youth.id]);
});

test("reassigns an earlier color before replacing a red-only same-design recommendation", () => {
  const current = product("Current hoodie");
  const first = product("First hoodie");
  const second = product("Second hoodie");
  const fourth = product("Fourth hoodie");
  const shirt = product("Current shirt", "Shirts");
  shirt.shopifyVariants = shirt.shopifyVariants!.filter((variant) => variant.color === "Red");
  const row = buildCollectionRecommendations(current, [current, first, second, fourth, shirt], order([first, second, fourth], [shirt]));
  assert.deepEqual(row.cards.map((card) => card.id), [first.id, shirt.id, second.id, fourth.id]);
  assert.deepEqual(row.cards.map((card) => card.color), ["Black", "Red", "Navy", "Irish Green"]);
});

test("substitutes a recommendation only when the original products cannot have distinct colors", () => {
  const current = product("Current hoodie");
  const first = product("First hoodie");
  const second = product("Second hoodie");
  for (const entry of [first, second]) entry.shopifyVariants = entry.shopifyVariants!.filter((variant) => variant.color === "Black");
  const remaining = ["Third", "Fourth", "Fifth"].map((name) => product(`${name} hoodie`));
  const row = buildCollectionRecommendations(current, [current, first, second, ...remaining], order([first, second, ...remaining]));
  assert.equal(row.cards.length, 4);
  assert.equal(row.cards[0].id, first.id);
  assert(!row.cards.some((card) => card.id === second.id));
  assert.equal(new Set(row.cards.map((card) => card.color)).size, 4);
});
