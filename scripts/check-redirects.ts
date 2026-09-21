import { readFile } from "node:fs/promises";
import { ARCHIVED_PRODUCT_MERGES } from "../shared/product-merges";
import { variantValueSlug } from "../shared/product-variant";

const baseUrlArg = process.argv.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length);

function expectedCases() {
  return ARCHIVED_PRODUCT_MERGES.flatMap(({ keeper, archive }) => {
    if (!archive.variantMappings.length) throw new Error(`${archive.handle} has no variant mapping`);
    return ["/product", "/products"].flatMap((prefix) => [
      { path: `${prefix}/${archive.handle}`, target: `/product/${keeper.handle}` },
      ...archive.variantMappings.flatMap((variant) => {
        const color = variantValueSlug(variant.color);
        const size = variantValueSlug(variant.size);
        return [
          {
            path: `${prefix}/${archive.handle}?color=${color}&size=${size}`,
            target: `/product/${keeper.handle}`,
            params: { color, size },
            keeperVariantId: variant.keeperVariantId,
          },
          {
            path: `${prefix}/${archive.handle}?variant=${variant.archiveVariantId}`,
            target: `/product/${keeper.handle}`,
            params: { variant: variant.keeperVariantId },
            keeperVariantId: variant.keeperVariantId,
          },
        ];
      }),
    ]);
  });
}

async function checkProduction(baseUrl: string) {
  const origin = baseUrl.replace(/\/$/, "");
  const results = [];
  for (const test of expectedCases()) {
    const first = await fetch(`${origin}${test.path}`, { redirect: "manual" });
    const location = first.headers.get("location");
    if (first.status !== 301 || !location) throw new Error(`${test.path}: expected 301, got ${first.status}`);
    const redirected = new URL(location, origin);
    if (redirected.pathname !== test.target) throw new Error(`${test.path}: wrong target ${redirected.pathname}`);
    for (const [key, value] of Object.entries(test.params ?? {})) {
      if (redirected.searchParams.get(key) !== value) throw new Error(`${test.path}: lost ${key} intent`);
    }
    const final = await fetch(redirected, { redirect: "manual" });
    if (final.status !== 200) throw new Error(`${test.path}: target returned ${final.status}`);
    if (test.keeperVariantId) {
      const html = await final.text();
      const embedded = html.match(
        /<script type="application\/json" data-prerendered-product="true">([^<]+)<\/script>/,
      )?.[1];
      if (!embedded) throw new Error(`${test.path}: keeper page has no embedded product data`);
      const product = JSON.parse(embedded) as {
        shopifyVariants?: Array<{ variantId: string; color: string; size: string }>;
      };
      const selected = product.shopifyVariants?.find((variant) =>
        variant.variantId.endsWith(`/${test.keeperVariantId}`)
      );
      if (!selected) throw new Error(`${test.path}: keeper variant ${test.keeperVariantId} is missing`);
      if (test.params?.color && variantValueSlug(selected.color) !== test.params.color) {
        throw new Error(`${test.path}: keeper color selection mismatch`);
      }
      if (test.params?.size && variantValueSlug(selected.size) !== test.params.size) {
        throw new Error(`${test.path}: keeper size selection mismatch`);
      }
    }
    results.push({ source: test.path, status: "PASS", target: redirected.toString() });
  }
  console.table(results);
}

async function checkBuild() {
  const redirects = await readFile("dist/public/_redirects", "utf8");
  const { readdir } = await import("node:fs/promises");
  const productFiles = new Set(
    (await readdir("dist/public/product")).filter((entry) => entry.endsWith(".html")),
  );
  for (const { keeper, archive } of ARCHIVED_PRODUCT_MERGES) {
    if (!redirects.includes(`/product/${archive.handle}`) || !redirects.includes(`/products/${archive.handle}`)) {
      throw new Error(`Missing redirect rules for ${archive.handle}`);
    }
    for (const variant of archive.variantMappings) {
      if (!redirects.includes(
        `variant=${variant.archiveVariantId}  /product/${keeper.handle}?variant=${variant.keeperVariantId}`,
      )) {
        throw new Error(`Missing variant redirect for ${archive.handle}/${variant.archiveVariantId}`);
      }
    }
    if (!productFiles.has(`${keeper.handle}.html`)) throw new Error(`Missing keeper page ${keeper.handle}`);
    if (productFiles.has(`${archive.handle}.html`)) throw new Error(`Archived page still generated: ${archive.handle}`);
  }
  console.log(`PASS: ${expectedCases().length} redirect cases are represented in the build.`);
}

(baseUrlArg ? checkProduction(baseUrlArg) : checkBuild()).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});