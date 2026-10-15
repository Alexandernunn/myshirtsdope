import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { groupProducts } from "../client/src/lib/product-grouping";
import type { Product } from "./schema";
import { createSearchPromptCycle, SEARCH_PROMPT_GROUPS, SEARCH_PROMPTS } from "./search-prompts";

test("search ideas are extensive, unique, and cover people, places, and references only", () => {
  assert(SEARCH_PROMPTS.length >= 200);
  assert.equal(new Set(SEARCH_PROMPTS.map((term) => term.toLowerCase())).size, SEARCH_PROMPTS.length);
  assert.equal(Object.keys(SEARCH_PROMPT_GROUPS).length, 4);
  for (const group of Object.values(SEARCH_PROMPT_GROUPS)) assert(group.length >= 10);
  for (const term of SEARCH_PROMPTS) assert(term === term.trim() && term.length > 0);
});

test("a rotation contains every idea exactly once before repeating", () => {
  for (const random of [() => 0, () => 0.5, () => 0.999]) {
    const cycle = createSearchPromptCycle(random);
    assert.equal(cycle.length, SEARCH_PROMPTS.length);
    assert.deepEqual([...cycle].sort(), [...SEARCH_PROMPTS].sort());
  }
});

test("early rotation mixes artists, design references, places and crews, and screen culture", () => {
  const cycle = createSearchPromptCycle(() => 0.5);
  const themes = cycle.slice(0, 4).map((term) =>
    Object.keys(SEARCH_PROMPT_GROUPS).find((key) =>
      (SEARCH_PROMPT_GROUPS[key as keyof typeof SEARCH_PROMPT_GROUPS] as readonly string[]).includes(term),
    ),
  );
  assert.equal(new Set(themes).size, 4);
});

test("new rotation orders vary and do not immediately repeat the previous idea", () => {
  const cycle = createSearchPromptCycle(() => 0);
  assert.notDeepEqual(cycle, createSearchPromptCycle(() => 0.999));
  const next = createSearchPromptCycle(() => 0, cycle[0]);
  assert.notEqual(next[0], cycle[0]);
  assert.deepEqual([...next].sort(), [...SEARCH_PROMPTS].sort());
});

test("every idea returns a real shop result with an available fit in the built catalog", () => {
  const products: Product[] = JSON.parse(readFileSync("dist/public/data/products.json", "utf8"));
  const groups = groupProducts(products);
  const excludedTerms = new Set([
    ...products.flatMap((product) => product.colors.map((color) => color.toLowerCase())),
    "hoodie", "hoodies", "shirt", "shirts", "mug", "mugs",
    "onesie", "onesies", "youth", "toddler", "baby", "accessories",
  ]);
  for (const term of SEARCH_PROMPTS) {
    const query = term.toLowerCase();
    assert(!excludedTerms.has(query), `Search rotation must not suggest colors or product types: ${term}`);
    // Match the shop's actual literal search, not hypothetical tokenized search.
    const matches = groups.filter((group) =>
      group.adult.name.toLowerCase().includes(query) ||
      group.youth?.name.toLowerCase().includes(query) ||
      group.adult.tags?.some((tag) => tag.toLowerCase().includes(query)) ||
      group.adult.colors.some((color) => color.toLowerCase().includes(query)),
    );
    assert(matches.length > 0, `Search idea has no shop result: ${term}`);
    assert(matches.some((group) => [group.adult, group.youth, group.toddler].some((product) =>
      product && "shopifyVariants" in product && product.shopifyVariants?.some((variant) => variant.availableForSale),
    )), `Search idea has no available fit: ${term}`);
  }
  console.log(`Verified ${SEARCH_PROMPTS.length} search ideas against ${groups.length} shop cards`);
});
