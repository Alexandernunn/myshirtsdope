import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  CatalogRebuildCoalescer,
  createShopifyCatalogWebhookApp,
  verifyShopifyWebhookSignature,
} from "../server/shopify-catalog-webhook";

const OUTPUT_DIR = path.resolve("dist/public");

async function verifyPublishedCatalog(): Promise<void> {
  const sitemap = await readFile(path.join(OUTPUT_DIR, "sitemap.xml"), "utf8");
  const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(new Set(sitemapLocs).size, sitemapLocs.length, "sitemap has duplicate URLs");
  assert(sitemapLocs.includes("https://myshirtsdope.com"));
  assert(sitemapLocs.includes("https://myshirtsdope.com/shop"));

  const productEntries = (await readdir(path.join(OUTPUT_DIR, "product"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name));
  const productUrls = sitemapLocs.filter((url) => /^https:\/\/myshirtsdope\.com\/product\/\d+$/.test(url));
  assert.equal(productUrls.length, productEntries.length, "sitemap/prerender product count mismatch");
  assert.equal(sitemapLocs.length, productEntries.length + 2, "unexpected sitemap URL count");
  assert.equal(
    (sitemap.match(/<lastmod>[^<]+<\/lastmod>/g) ?? []).length,
    productEntries.length,
    "product lastmod count mismatch",
  );

  for (const entry of productEntries) {
    const productId = entry.name;
    const productHtml = await readFile(
      path.join(OUTPUT_DIR, "product", productId, "index.html"),
      "utf8",
    );
    assert(
      productHtml.includes(`<link rel="canonical" href="https://myshirtsdope.com/product/${productId}" />`),
      `product ${productId} canonical URL mismatch`,
    );
    const jsonLd = productHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    assert(jsonLd, `product ${productId} is missing Product JSON-LD`);
    const productSchema = JSON.parse(jsonLd);
    const offer = productSchema.offers;
    assert.equal(offer.priceCurrency, "USD", `product ${productId} must use USD`);
    assert(
      ["http://schema.org/InStock", "http://schema.org/OutOfStock"].includes(offer.availability),
      `product ${productId} has invalid schema availability`,
    );
  }

  const shopHtml = await readFile(path.join(OUTPUT_DIR, "shop/index.html"), "utf8");
  const preload = shopHtml.match(/<link rel="preload" as="image"[^>]*>/)?.[0];
  const primaryImage = shopHtml.match(/<img [^>]*loading="eager"[^>]*fetchpriority="high"[^>]*>/)?.[0];
  assert(preload, "Shop LCP preload is missing");
  assert(primaryImage, "Shop LCP image is missing");
  assert(preload.includes('fetchpriority="high"'));
  assert(primaryImage.includes('loading="eager"'));
  assert(primaryImage.includes("srcset=") && primaryImage.includes("sizes="));
}

async function verifyWebhookSecurityAndCoalescing(): Promise<void> {
  const body = Buffer.from(JSON.stringify({ id: 42, updated_at: "2026-08-23T00:00:00Z" }));
  const secret = "test-shopify-secret";
  const signature = createHmac("sha256", secret).update(body).digest("base64");
  assert(verifyShopifyWebhookSignature(body, signature, secret));
  assert(!verifyShopifyWebhookSignature(body, "invalid", secret));
  assert(!verifyShopifyWebhookSignature(Buffer.from("{}"), signature, secret));

  const coalescer = new CatalogRebuildCoalescer(120_000, 86_400_000);
  let builds = 0;
  const trigger = async () => {
    builds++;
  };
  assert.deepEqual(await coalescer.request("delivery-1", trigger, 1_000), {
    triggered: true,
    reason: "triggered",
  });
  assert.deepEqual(await coalescer.request("delivery-1", trigger, 1_001), {
    triggered: false,
    reason: "duplicate",
  });
  assert.deepEqual(await coalescer.request("delivery-2", trigger, 1_002), {
    triggered: false,
    reason: "coalesced",
  });
  assert.equal(builds, 1);
  assert.deepEqual(await coalescer.request("delivery-3", trigger, 121_001), {
    triggered: true,
    reason: "triggered",
  });
  assert.equal(builds, 2);
}

async function verifyWebhookHttpContract(): Promise<void> {
  const previousSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
  const previousBuildHook = process.env.NETLIFY_BUILD_HOOK_URL;
  const originalFetch = globalThis.fetch;
  const secret = "http-test-secret";
  const body = JSON.stringify({ id: 42 });
  const signature = createHmac("sha256", secret).update(body).digest("base64");
  let buildRequests = 0;

  process.env.SHOPIFY_WEBHOOK_SECRET = secret;
  delete process.env.NETLIFY_BUILD_HOOK_URL;
  globalThis.fetch = async (input, init) => {
    if (String(input) === "https://hook.test/catalog") {
      buildRequests++;
      return new Response(null, { status: 200 });
    }
    return originalFetch(input, init);
  };

  const server = createServer(createShopifyCatalogWebhookApp());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string", "webhook test server did not open");
  const endpoint = `http://127.0.0.1:${address.port}/webhooks/shopify/catalog`;
  const send = (providedSignature: string, deliveryId: string) => fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": providedSignature,
      "x-shopify-topic": "products/update",
      "x-shopify-webhook-id": deliveryId,
    },
    body,
  });

  try {
    assert.equal((await send(signature, "missing-config")).status, 503);
    assert.equal(buildRequests, 0);

    process.env.NETLIFY_BUILD_HOOK_URL = "https://hook.test/catalog";
    assert.equal((await send("invalid", "invalid-signature")).status, 401);
    assert.equal(buildRequests, 0);
    assert.equal((await send(signature, "delivery-1")).status, 202);
    assert.equal((await send(signature, "delivery-1")).status, 200);
    assert.equal((await send(signature, "delivery-2")).status, 200);
    assert.equal(buildRequests, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    globalThis.fetch = originalFetch;
    if (previousSecret === undefined) delete process.env.SHOPIFY_WEBHOOK_SECRET;
    else process.env.SHOPIFY_WEBHOOK_SECRET = previousSecret;
    if (previousBuildHook === undefined) delete process.env.NETLIFY_BUILD_HOOK_URL;
    else process.env.NETLIFY_BUILD_HOOK_URL = previousBuildHook;
  }
}

await verifyPublishedCatalog();
await verifyWebhookSecurityAndCoalescing();
await verifyWebhookHttpContract();
console.log("[Verify] Catalog sitemap, prerender, schema, webhook security, and coalescing checks passed");