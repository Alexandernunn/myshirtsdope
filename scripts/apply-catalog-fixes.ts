import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

type FixRow = {
  handle: string;
  new_title: string;
  new_price: string;
  new_product_type: string;
};

type ProductSnapshot = {
  id: string;
  handle: string;
  title: string;
  productType: string;
  variants: {
    nodes: Array<{ id: string; title: string; price: string }>;
    pageInfo: { hasNextPage: boolean };
  };
};

const FIX_FILE = "audit/catalog-fixes.csv";
const RESULT_FILE = "audit/catalog-fix-apply-results.json";
const CONFIRMATION_PHRASE = "APPLY CATALOG FIXES";
const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || "2026-07";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      if (field.length > 0) {
        throw new Error(`Malformed CSV: quote inside an unquoted field in ${FIX_FILE}`);
      }
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (quoted) throw new Error(`Malformed CSV: unterminated quote in ${FIX_FILE}`);
  return rows.filter((candidate) => candidate.some((value) => value.trim()));
}

async function loadFixes(): Promise<FixRow[]> {
  const rows = parseCsv(await readFile(FIX_FILE, "utf8"));
  const header = rows.shift();
  const expected = ["handle", "new_title", "new_price", "new_product_type"];

  if (!header || header.join(",") !== expected.join(",")) {
    throw new Error(`${FIX_FILE} must have exactly these columns: ${expected.join(", ")}`);
  }

  const fixes = rows.map((values) => {
    if (values.length !== expected.length) {
      throw new Error(
        `${FIX_FILE} rows must contain exactly ${expected.length} fields; found ${values.length}.`,
      );
    }
    const row = Object.fromEntries(expected.map((key, index) => [key, values[index] ?? ""])) as FixRow;
    row.handle = row.handle.trim();
    row.new_title = row.new_title.trim();
    row.new_price = row.new_price.trim();
    row.new_product_type = row.new_product_type.trim();
    return row;
  });

  const seen = new Set<string>();
  for (const fix of fixes) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(fix.handle)) {
      throw new Error(`Invalid or unsafe handle in ${FIX_FILE}: ${fix.handle || "(blank)"}`);
    }
    if (seen.has(fix.handle)) throw new Error(`Duplicate handle in ${FIX_FILE}: ${fix.handle}`);
    seen.add(fix.handle);

    if (fix.new_price) {
      const price = Number(fix.new_price);
      if (!Number.isFinite(price) || price <= 0 || !/^\d+(?:\.\d{1,2})?$/.test(fix.new_price)) {
        throw new Error(`Invalid new_price for ${fix.handle}: ${fix.new_price}`);
      }
      fix.new_price = price.toFixed(2);
    }
  }

  return fixes.filter((fix) => fix.new_title || fix.new_price || fix.new_product_type);
}

function getAdminConfig(): { domain: string; token: string } {
  const domain = (process.env.SHOPIFY_STORE_DOMAIN || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const token = process.env.SHOPIFY_ACCESS_TOKEN || "";

  if (!domain || !token) {
    throw new Error("SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN are required.");
  }

  return { domain, token };
}

async function graphql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const { domain, token } = getAdminConfig();
  const response = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json() as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new Error(
      `Shopify Admin API error (${response.status}): ${JSON.stringify(payload.errors ?? payload)}`,
    );
  }

  return payload.data;
}

async function fetchProduct(handle: string): Promise<ProductSnapshot> {
  const data = await graphql<{
    products: { nodes: ProductSnapshot[] };
  }>(
    `query ProductForCatalogFix($query: String!) {
      products(first: 2, query: $query) {
        nodes {
          id
          handle
          title
          productType
          variants(first: 250) {
            nodes {
              id
              title
              price
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      }
    }`,
    { query: `handle:${handle}` },
  );

  const product = data.products.nodes.find((candidate) => candidate.handle === handle);
  if (!product) throw new Error(`No Shopify product found for handle: ${handle}`);
  if (product.variants.pageInfo.hasNextPage) {
    throw new Error(`${handle} has more than 250 variants; refusing a partial price update.`);
  }
  return product;
}

async function verifyMutationSchema(): Promise<void> {
  const data = await graphql<{
    mutationType: {
      fields: Array<{ name: string }>;
    } | null;
    productUpdateInput: {
      inputFields: Array<{ name: string }>;
    } | null;
    productVariantsBulkInput: {
      inputFields: Array<{ name: string }>;
    } | null;
  }>(
    `query CatalogFixMutationPreflight {
      mutationType: __type(name: "Mutation") {
        fields {
          name
        }
      }
      productUpdateInput: __type(name: "ProductUpdateInput") {
        inputFields {
          name
        }
      }
      productVariantsBulkInput: __type(name: "ProductVariantsBulkInput") {
        inputFields {
          name
        }
      }
    }`,
    {},
  );

  const mutationNames = new Set(data.mutationType?.fields.map((field) => field.name) ?? []);
  const productFields = new Set(
    data.productUpdateInput?.inputFields.map((field) => field.name) ?? [],
  );
  const variantFields = new Set(
    data.productVariantsBulkInput?.inputFields.map((field) => field.name) ?? [],
  );

  const valid =
    mutationNames.has("productUpdate") &&
    mutationNames.has("productVariantsBulkUpdate") &&
    ["id", "title", "productType"].every((field) => productFields.has(field)) &&
    ["id", "price"].every((field) => variantFields.has(field));

  if (!valid) {
    throw new Error(
      `Shopify Admin API ${API_VERSION} does not expose the mutation inputs required by this script.`,
    );
  }
}

function buildDiff(fix: FixRow, product: ProductSnapshot) {
  const currentPrices = Array.from(new Set(product.variants.nodes.map((variant) => variant.price)));
  return {
    handle: product.handle,
    title: fix.new_title && fix.new_title !== product.title
      ? { before: product.title, after: fix.new_title }
      : undefined,
    price: fix.new_price && currentPrices.some((price) => Number(price) !== Number(fix.new_price))
      ? { before: currentPrices.join(" | "), after: fix.new_price }
      : undefined,
    productType: fix.new_product_type && fix.new_product_type !== product.productType
      ? { before: product.productType || "(blank)", after: fix.new_product_type }
      : undefined,
  };
}

async function updateProductFields(
  product: ProductSnapshot,
  values: { title?: string; productType?: string },
): Promise<void> {
  if (values.title === undefined && values.productType === undefined) return;

  const productInput: Record<string, string> = { id: product.id };
  if (values.title !== undefined) productInput.title = values.title;
  if (values.productType !== undefined) productInput.productType = values.productType;

  const data = await graphql<{
    productUpdate: {
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
    `mutation ApplyCatalogProductFields($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
        product {
          id
          handle
          title
          productType
        }
        userErrors {
          field
          message
        }
      }
    }`,
    { product: productInput },
  );

  if (data.productUpdate.userErrors.length) {
    throw new Error(
      `Product update failed for ${product.handle}: ${JSON.stringify(data.productUpdate.userErrors)}`,
    );
  }
}

async function updateVariantPrices(
  product: ProductSnapshot,
  prices: Map<string, string>,
): Promise<void> {
  if (prices.size === 0) return;

  const data = await graphql<{
    productVariantsBulkUpdate: {
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
    `mutation ApplyCatalogVariantPrices(
      $productId: ID!
      $variants: [ProductVariantsBulkInput!]!
    ) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          price
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      productId: product.id,
      variants: product.variants.nodes.map((variant) => {
        const price = prices.get(variant.id);
        if (price === undefined) {
          throw new Error(`Missing target price for variant ${variant.id} on ${product.handle}`);
        }
        return { id: variant.id, price };
      }),
    },
  );

  if (data.productVariantsBulkUpdate.userErrors.length) {
    throw new Error(
      `Variant price update failed for ${product.handle}: ${
        JSON.stringify(data.productVariantsBulkUpdate.userErrors)
      }`,
    );
  }
}

function desiredProductFields(diff: ReturnType<typeof buildDiff>) {
  return {
    ...(diff.title ? { title: diff.title.after } : {}),
    ...(diff.productType ? { productType: diff.productType.after } : {}),
  };
}

function originalProductFields(
  product: ProductSnapshot,
  diff: ReturnType<typeof buildDiff>,
) {
  return {
    ...(diff.title ? { title: product.title } : {}),
    ...(diff.productType ? { productType: product.productType } : {}),
  };
}

function desiredPrices(
  product: ProductSnapshot,
  diff: ReturnType<typeof buildDiff>,
): Map<string, string> {
  return new Map(
    diff.price
      ? product.variants.nodes.map((variant) => [variant.id, diff.price!.after])
      : [],
  );
}

function originalPrices(
  product: ProductSnapshot,
  diff: ReturnType<typeof buildDiff>,
): Map<string, string> {
  return new Map(
    diff.price
      ? product.variants.nodes.map((variant) => [variant.id, variant.price])
      : [],
  );
}

function snapshotMatches(
  snapshot: ProductSnapshot,
  original: ProductSnapshot,
  fields: { title?: string; productType?: string },
  prices: Map<string, string>,
): boolean {
  if (snapshot.id !== original.id || snapshot.handle !== original.handle) return false;
  if (fields.title !== undefined && snapshot.title !== fields.title) return false;
  if (
    fields.productType !== undefined &&
    snapshot.productType !== fields.productType
  ) return false;
  if (
    prices.size > 0 &&
    (
      snapshot.variants.nodes.length !== prices.size ||
      snapshot.variants.nodes.some((variant) => prices.get(variant.id) !== variant.price)
    )
  ) return false;
  return true;
}

async function rollbackProduct(
  product: ProductSnapshot,
  diff: ReturnType<typeof buildDiff>,
): Promise<void> {
  const failures: string[] = [];

  try {
    await updateProductFields(product, originalProductFields(product, diff));
  } catch (error) {
    failures.push(
      `product fields: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    await updateVariantPrices(product, originalPrices(product, diff));
  } catch (error) {
    failures.push(
      `variant prices: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const restored = await fetchProduct(product.handle);
    if (
      !snapshotMatches(
        restored,
        product,
        originalProductFields(product, diff),
        originalPrices(product, diff),
      )
    ) {
      failures.push("post-rollback values do not match the captured snapshot");
    }
  } catch (error) {
    failures.push(
      `verification: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (failures.length > 0) {
    throw new Error(`Rollback incomplete for ${product.handle}: ${failures.join("; ")}`);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const apply = process.argv.includes("--apply");

  if (dryRun === apply) {
    throw new Error("Choose exactly one mode: --dry-run or --apply");
  }

  const fixes = await loadFixes();
  if (!fixes.length) {
    console.log(`No populated fixes found in ${FIX_FILE}.`);
    return;
  }

  const prepared = [];
  await verifyMutationSchema();
  for (const fix of fixes) {
    const product = await fetchProduct(fix.handle);
    const diff = buildDiff(fix, product);
    if (diff.title || diff.price || diff.productType) {
      prepared.push({ product, diff });
    }
  }

  if (!prepared.length) {
    console.log("All populated fixes already match Shopify; nothing to change.");
    return;
  }

  console.log(JSON.stringify(prepared.map(({ diff }) => diff), null, 2));

  if (dryRun) {
    console.log(`\nDry run complete. ${prepared.length} product(s) would change; Shopify was not modified.`);
    return;
  }

  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("--apply requires an interactive terminal for typed confirmation.");
  }

  const prompt = createInterface({ input: stdin, output: stdout });
  const answer = await prompt.question(
    `\nType ${CONFIRMATION_PHRASE} to update ${prepared.length} product(s): `,
  );
  prompt.close();

  if (answer !== CONFIRMATION_PHRASE) {
    throw new Error("Confirmation did not match. No Shopify updates were made.");
  }

  const results: Array<{
    handle: string;
    status: "updated" | "rolled_back" | "rollback_failed";
    error?: string;
  }> = [];

  for (const { product, diff } of prepared) {
    let mutationStarted = false;
    try {
      const current = await fetchProduct(product.handle);
      if (
        !snapshotMatches(
          current,
          product,
          originalProductFields(product, diff),
          originalPrices(product, diff),
        )
      ) {
        throw new Error(
          `${product.handle} changed after the review diff was prepared; aborting before any write.`,
        );
      }

      mutationStarted = true;
      // Handles are intentionally omitted from both mutation inputs.
      await updateVariantPrices(current, desiredPrices(current, diff));
      await updateProductFields(current, desiredProductFields(diff));

      const updated = await fetchProduct(current.handle);
      if (
        !snapshotMatches(
          updated,
          current,
          desiredProductFields(diff),
          desiredPrices(current, diff),
        )
      ) {
        throw new Error(`Post-update verification failed for ${current.handle}`);
      }

      results.push({ handle: current.handle, status: "updated" });
      await writeFile(RESULT_FILE, `${JSON.stringify(results, null, 2)}\n`);
      console.log(`Updated and verified ${current.handle}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!mutationStarted) throw error;

      try {
        // Restore every intended field because a network error can make mutation
        // success uncertain even when no successful response was received.
        await rollbackProduct(product, diff);
        results.push({ handle: product.handle, status: "rolled_back", error: message });
        await writeFile(RESULT_FILE, `${JSON.stringify(results, null, 2)}\n`);
        throw new Error(
          `${message}. ${product.handle} was restored to its captured pre-run values; stopping.`,
        );
      } catch (rollbackError) {
        if (
          rollbackError instanceof Error &&
          rollbackError.message.endsWith("was restored to its captured pre-run values; stopping.")
        ) {
          throw rollbackError;
        }
        const rollbackMessage = rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError);
        results.push({
          handle: product.handle,
          status: "rollback_failed",
          error: `${message}; rollback: ${rollbackMessage}`,
        });
        await writeFile(RESULT_FILE, `${JSON.stringify(results, null, 2)}\n`);
        throw new Error(
          `${message}. Rollback also failed for ${product.handle}: ${rollbackMessage}. Stop and inspect Shopify before rerunning.`,
        );
      }
    }
  }

  console.log(`Applied catalog fixes to ${prepared.length} product(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});