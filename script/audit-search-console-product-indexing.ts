import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Product } from "../shared/schema";

interface SearchConsoleRow {
  url: string;
  lastCrawled: string;
}

function parseSearchConsoleCsv(csv: string): SearchConsoleRow[] {
  const lines = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length === 0 || lines[0] !== "URL,Last crawled") {
    throw new Error('Expected a Search Console CSV with the header "URL,Last crawled"');
  }

  return lines.slice(1).map((line, index) => {
    const comma = line.lastIndexOf(",");
    if (comma < 0) throw new Error(`Invalid CSV row ${index + 2}`);
    return {
      url: line.slice(0, comma).replace(/^"|"$/g, "").trim(),
      lastCrawled: line.slice(comma + 1).replace(/^"|"$/g, "").trim(),
    };
  });
}

function parseRedirects(contents: string): Map<string, string> {
  const redirects = new Map<string, string>();
  for (const [index, line] of contents.trim().split(/\r?\n/).entries()) {
    const match = line.match(/^\/product\/(\d+)\s+\/product\/([a-z0-9]+(?:-[a-z0-9]+)*)\s+301!$/);
    if (!match) throw new Error(`Invalid product redirect at line ${index + 1}: ${line}`);
    redirects.set(match[1], match[2]);
  }
  return redirects;
}

async function audit(): Promise<void> {
  const csvPath = process.argv[2];
  if (!csvPath) {
    throw new Error(
      "Usage: npm run audit:search-console-indexing -- <search-console-export.csv>",
    );
  }

  const outputDir = path.resolve("dist/public");
  const [csv, productsJson, redirectFile] = await Promise.all([
    readFile(path.resolve(csvPath), "utf8"),
    readFile(path.join(outputDir, "data/products.json"), "utf8"),
    readFile(path.join(outputDir, "_redirects"), "utf8"),
  ]);
  const rows = parseSearchConsoleCsv(csv);
  const products = JSON.parse(productsJson) as Product[];
  const activeProducts = new Map(products.map((product) => [String(product.id), product.handle]));
  const redirects = parseRedirects(redirectFile);
  const uniqueUrls = new Set(rows.map((row) => row.url));
  const classifications = {
    activeWithCorrectRedirect: 0,
    activeWithMissingOrWrongRedirect: 0,
    retiredOrUnknown: 0,
    nonNumericProductUrl: 0,
    neverCrawled: 0,
  };
  const failures: string[] = [];

  for (const row of rows) {
    const parsed = new URL(row.url);
    const match = parsed.pathname.match(/^\/product\/(\d+)$/);
    if (!match) {
      classifications.nonNumericProductUrl++;
      continue;
    }
    if (row.lastCrawled === "1969-12-31") classifications.neverCrawled++;
    const productId = match[1];
    const expectedHandle = activeProducts.get(productId);
    if (!expectedHandle) {
      classifications.retiredOrUnknown++;
      continue;
    }
    if (redirects.get(productId) === expectedHandle) {
      classifications.activeWithCorrectRedirect++;
    } else {
      classifications.activeWithMissingOrWrongRedirect++;
      failures.push(row.url);
    }
  }

  console.log(`[Indexing Audit] Rows: ${rows.length}; unique URLs: ${uniqueUrls.size}`);
  console.log(`[Indexing Audit] Never crawled: ${classifications.neverCrawled}`);
  console.log(
    `[Indexing Audit] Active with correct 301: ${classifications.activeWithCorrectRedirect}`,
  );
  console.log(
    `[Indexing Audit] Active with missing/wrong redirect: ${classifications.activeWithMissingOrWrongRedirect}`,
  );
  console.log(`[Indexing Audit] Retired or unknown: ${classifications.retiredOrUnknown}`);
  console.log(
    `[Indexing Audit] Non-numeric product URLs: ${classifications.nonNumericProductUrl}`,
  );

  if (uniqueUrls.size !== rows.length) {
    throw new Error("Search Console export contains duplicate URLs");
  }
  if (failures.length > 0) {
    throw new Error(
      `Active products are missing exact legacy redirects: ${failures.slice(0, 10).join(", ")}`,
    );
  }
}

audit().catch((error) => {
  console.error("[Indexing Audit] Failed:", error.message || error);
  process.exit(1);
});