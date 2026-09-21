import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { ARCHIVED_PRODUCT_MERGES } from "../shared/product-merges";

const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || "2026-07";
const CONFIRMATION = "ARCHIVE APPROVED DUPLICATES";

type Product = {
  id: string;
  handle: string;
  title: string;
  status: string;
  variants: { nodes: Array<{ id: string; selectedOptions: Array<{ name: string; value: string }> }> };
};

function config() {
  const domain = (process.env.SHOPIFY_STORE_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const token = process.env.SHOPIFY_ACCESS_TOKEN || "";
  if (!domain || !token) throw new Error("SHOPIFY_STORE_DOMAIN and SHOPIFY_ACCESS_TOKEN are required.");
  return { domain, token };
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const { domain, token } = config();
  const response = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json() as { data?: T; errors?: Array<{ message: string }> };
  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new Error(`Shopify Admin API error (${response.status}): ${JSON.stringify(payload.errors ?? payload)}`);
  }
  return payload.data;
}

async function fetchProduct(handle: string): Promise<Product> {
  const data = await graphql<{ products: { nodes: Product[] } }>(
    `query ArchiveCandidate($query: String!) {
      products(first: 2, query: $query) {
        nodes {
          id handle title status
          variants(first: 250) { nodes { id selectedOptions { name value } } }
        }
      }
    }`,
    { query: `handle:${handle}` },
  );
  const product = data.products.nodes.find((candidate) => candidate.handle === handle);
  if (!product) throw new Error(`Product not found: ${handle}`);
  return product;
}

function option(variant: Product["variants"]["nodes"][number], name: string) {
  return variant.selectedOptions.find((candidate) => candidate.name.toLowerCase() === name)?.value || "";
}

async function setStatus(product: Product, status: "ACTIVE" | "ARCHIVED") {
  const data = await graphql<{ productUpdate: { userErrors: Array<{ message: string }> } }>(
    `mutation SetDuplicateStatus($product: ProductUpdateInput!) {
      productUpdate(product: $product) { userErrors { message } }
    }`,
    { product: { id: product.id, status } },
  );
  if (data.productUpdate.userErrors.length) throw new Error(JSON.stringify(data.productUpdate.userErrors));
}

async function verifyUnavailableOnStorefront(handle: string): Promise<void> {
  const { domain } = config();
  const url = `https://${domain}/products/${encodeURIComponent(handle)}.js`;
  let lastStatus = 0;

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const response = await fetch(`${url}?archive_check=${Date.now()}`, {
      redirect: "follow",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
      },
    });
    lastStatus = response.status;
    if (response.status === 404 || response.status === 410) return;
    if (attempt < 10) await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error(
    `Storefront still returned HTTP ${lastStatus} for ${handle} after 10 checks.`,
  );
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const apply = process.argv.includes("--apply");
  if (dryRun === apply) throw new Error("Choose exactly one mode: --dry-run or --apply");

  const prepared = [];
  for (const { keeper, archive } of ARCHIVED_PRODUCT_MERGES) {
    const [keeperProduct, archiveProduct] = await Promise.all([
      fetchProduct(keeper.handle),
      fetchProduct(archive.handle),
    ]);
    if (keeperProduct.id.split("/").pop() !== keeper.id || archiveProduct.id.split("/").pop() !== archive.id) {
      throw new Error(`Manifest ID mismatch for ${archive.handle}`);
    }
    const keeperPairs = new Set(keeperProduct.variants.nodes.map((variant) =>
      `${option(variant, "color")}\u0000${option(variant, "size")}`
    ));
    const archivePairs = archiveProduct.variants.nodes.map((variant) =>
      `${option(variant, "color")}\u0000${option(variant, "size")}`
    );
    if (archivePairs.some((pair) => !keeperPairs.has(pair))) {
      throw new Error(`Variant mismatch between ${archive.handle} and ${keeper.handle}`);
    }
    prepared.push({
      handle: archive.handle,
      keeper: keeper.handle,
      status: archiveProduct.status,
      archiveProduct,
    });
  }

  console.log(JSON.stringify(prepared.map(({ archiveProduct: _, ...diff }) => ({
    ...diff,
    after: {
      status: "ARCHIVED",
      storefrontProduct: null,
    },
  })), null, 2));
  if (dryRun) {
    console.log(`\nDry run complete. ${prepared.length} products would be archived and checked on the public storefront; Shopify was not modified.`);
    return;
  }
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("--apply requires an interactive terminal.");
  const prompt = createInterface({ input: stdin, output: stdout });
  const answer = await prompt.question(`Type ${CONFIRMATION} to continue: `);
  prompt.close();
  if (answer !== CONFIRMATION) throw new Error("Confirmation did not match. No Shopify updates were made.");

  for (const { archiveProduct } of prepared) {
    const current = await fetchProduct(archiveProduct.handle);
    if (current.status !== archiveProduct.status) {
      throw new Error(`${archiveProduct.handle} changed after dry-run preparation; stopping before write.`);
    }
    try {
      await setStatus(current, "ARCHIVED");
      const verified = await fetchProduct(current.handle);
      if (verified.status !== "ARCHIVED") {
        throw new Error(`Post-write verification failed for ${current.handle}`);
      }
      await verifyUnavailableOnStorefront(current.handle);
      console.log(`Archived ${current.handle}`);
    } catch (error) {
      const failures: string[] = [];
      try {
        await setStatus(
          current,
          current.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE",
        );
      } catch (rollback) {
        failures.push(String(rollback));
      }
      throw new Error(`${String(error)}${failures.length ? `; rollback failures: ${failures.join("; ")}` : "; original state restored"}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});