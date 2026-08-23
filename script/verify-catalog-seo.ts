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
    const productPreload = productHtml.match(
      /<link rel="preload" as="image"[^>]*data-pdp-hero-preload="true"[^>]*>/,
    )?.[0];
    const productHero = productHtml.match(
      /<img [^>]*loading="eager"[^>]*fetchpriority="high"[^>]*>/,
    )?.[0];
    const productData = productHtml.match(
      /<script type="application\/json" data-prerendered-product="true">([^<]+)<\/script>/,
    )?.[1];
    assert(productPreload, `product ${productId} is missing its LCP image preload`);
    assert(productPreload.includes("width=640&amp;format=webp"), `product ${productId} preload is not the product-detail WebP rendition`);
    assert(productPreload.includes("imagesrcset=") && productPreload.includes("imagesizes="));
    assert(productHero, `product ${productId} is missing an eager high-priority hero image`);
    assert(productHero.includes("srcset=") && productHero.includes("sizes="));
    assert(productData, `product ${productId} is missing its hydration data`);
    assert.equal(String(JSON.parse(productData).id), productId, `product ${productId} hydration data mismatch`);
    assert.equal(productSchema["@type"], "Product", `product ${productId} schema type mismatch`);
    assert(productSchema.name, `product ${productId} schema name is missing`);
    assert.equal(productSchema.sku, productId, `product ${productId} schema SKU mismatch`);
    assert(Array.isArray(productSchema.image) && productSchema.image.length > 0, `product ${productId} schema image is missing`);
    assert.equal(offer.priceCurrency, "USD", `product ${productId} must use USD`);
    assert(offer.price || offer.lowPrice, `product ${productId} schema price is missing`);
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
  assert(shopHtml.includes('<link rel="preconnect" href="https://cdn.shopify.com" crossorigin />'));
  assert(preload.includes("width=480&amp;format=webp"), "Mobile LCP preload must use the 480px WebP rendition");
  assert(preload.includes("imagesrcset=") && preload.includes("imagesizes="));
  assert(preload.includes("calc((100vw - 3.75rem) / 2)"), "LCP preload sizes must match the mobile grid slot");
  assert(preload.includes('fetchpriority="high"'));
  assert(primaryImage.includes('loading="eager"'));
  assert(primaryImage.includes("srcset=") && primaryImage.includes("sizes="));
}

async function verifyPageSpeedContracts(): Promise<void> {
  const [template, styles, footer, shop, productDetail] = await Promise.all([
    readFile(path.resolve("client/index.html"), "utf8"),
    readFile(path.resolve("client/src/index.css"), "utf8"),
    readFile(path.resolve("client/src/components/footer.tsx"), "utf8"),
    readFile(path.resolve("client/src/pages/shop.tsx"), "utf8"),
    readFile(path.resolve("client/src/pages/product-detail.tsx"), "utf8"),
  ]);

  assert(template.includes('<link rel="preconnect" href="https://cdn.shopify.com" crossorigin />'));
  const fontRules = [...template.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) => match[1]);
  for (const font of ["Inter", "Press Start 2P", "Permanent Marker"]) {
    const fontRule = fontRules.find((rule) => rule.includes(`font-family: "${font}";`));
    assert(fontRule, `${font} @font-face rule is missing`);
    assert(fontRule.includes("font-display: optional;"), `${font} must use font-display: optional`);
  }
  assert(template.includes('font-family: "Inter Fallback"'));
  assert(template.includes('font-family: "Press Start 2P Fallback"'));
  assert(template.includes('font-family: "Permanent Marker Fallback"'));
  assert(
    styles.includes(
      ".catalog-grid > a > div.group {\n    position: relative !important;\n    overflow: hidden !important;\n    contain: layout;\n  }",
    ),
    "product-card wrappers must be positioned and clipped",
  );
  assert(
    styles.includes(
      ".catalog-grid > a > div.group::after {\n    content: \"\" !important;\n    position: absolute !important;\n    inset: 0 !important;\n    width: 100% !important;\n    height: 100% !important;\n    pointer-events: none !important;\n    contain: strict !important;\n  }",
    ),
    "product-card hover overlays must be positioned and contained",
  );
  assert(
    styles.includes("contain-intrinsic-size: auto 274px;") &&
      styles.includes("min-height: 274px;") &&
      styles.includes("contain-intrinsic-size: auto 210px;") &&
      styles.includes("min-height: 210px;"),
    "catalog cards must reserve stable geometry",
  );
  assert(
    styles.includes(
      ".catalog-section {\n    contain: layout;\n    contain-intrinsic-size: auto 1200px;\n  }",
    ),
    "catalog section must reserve contained geometry",
  );
  assert(
    styles.includes(
      ".storefront-footer {\n    contain: layout style;\n    content-visibility: auto;\n    min-height: 300px;\n  }",
    ),
    "footer must reserve and contain its layout",
  );
  assert(
    styles.includes(
      "@media (max-width: 639px) {\n    .storefront-footer {\n      min-height: 640px;\n    }\n  }",
    ),
    "mobile footer reservation is missing",
  );
  assert(
    styles.includes(
      "@media (min-width: 640px) {\n    .storefront-footer {\n      min-height: 336px;\n    }\n  }",
    ),
    "desktop footer reservation is missing",
  );
  assert(footer.includes('className="storefront-footer border-t border-border bg-background min-h-[300px]"'));
  assert(footer.includes('style={{ contain: "layout style", contentVisibility: "auto" }}'));
  assert(shop.includes('<section aria-labelledby="catalog-heading" className="catalog-section">'));
  assert(shop.includes('className="catalog-card group'));
  assert(shop.includes("window.requestIdleCallback"));
  assert(shop.includes("shouldLoadRest && initialSource === \"chunk\""));
  assert(shop.includes('window.addEventListener("scroll", loadAfterFirstPaint'));
  assert(productDetail.includes('data-testid="product-hero-image-container"'));
  assert(productDetail.includes("aspect-square"));
  assert(productDetail.includes('loading="eager"'));
  assert(productDetail.includes('fetchpriority: "high"'));
  assert(productDetail.includes("requestIdleCallback"));
  assert(productDetail.includes("enabled: secondaryContentEnabled"));
  assert(productDetail.includes('loading="lazy"'));
  assert(productDetail.includes("min-h-[44px]"));
  const primaryProductQuery = productDetail.slice(
    productDetail.indexOf('queryKey: ["/api/products", id]'),
    productDetail.indexOf("useEffect(() => {", productDetail.indexOf('queryKey: ["/api/products", id]')),
  );
  assert(primaryProductQuery.includes("initialData: prerenderedProduct"));
  assert(primaryProductQuery.includes("fetchPrerenderedProduct(id)"));
  assert(!primaryProductQuery.includes("/data/products.json"), "the primary PDP query must not load the full catalog");
}

async function verifyWebhookSecurityAndDeliveryDedupe(): Promise<void> {
  const body = Buffer.from(JSON.stringify({ id: 42, updated_at: "2026-08-23T00:00:00Z" }));
  const secret = "test-shopify-secret";
  const signature = createHmac("sha256", secret).update(body).digest("base64");
  assert(verifyShopifyWebhookSignature(body, signature, secret));
  assert(!verifyShopifyWebhookSignature(body, "invalid", secret));
  assert(!verifyShopifyWebhookSignature(Buffer.from("{}"), signature, secret));

  const coalescer = new CatalogRebuildCoalescer(86_400_000);
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
    triggered: true,
    reason: "triggered",
  });
  assert.equal(builds, 2);
  assert.deepEqual(await coalescer.request("delivery-3", trigger, 1_003), {
    triggered: true,
    reason: "triggered",
  });
  assert.equal(builds, 3);

  const concurrentDelivery = new CatalogRebuildCoalescer(86_400_000);
  let concurrentBuilds = 0;
  let finishBuild: (() => void) | undefined;
  const deferredTrigger = () => new Promise<void>((resolve) => {
    concurrentBuilds++;
    finishBuild = resolve;
  });
  const firstRequest = concurrentDelivery.request("same-delivery", deferredTrigger, 2_000);
  const duplicateRequest = concurrentDelivery.request("same-delivery", deferredTrigger, 2_000);
  assert.equal(concurrentBuilds, 1, "concurrent retries must share one build request");
  assert(finishBuild, "deferred build did not start");
  finishBuild();
  assert.deepEqual(await firstRequest, { triggered: true, reason: "triggered" });
  assert.deepEqual(await duplicateRequest, { triggered: false, reason: "duplicate" });
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
    assert.equal((await send(signature, "delivery-2")).status, 202);
    assert.equal(buildRequests, 2);
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
await verifyPageSpeedContracts();
await verifyWebhookSecurityAndDeliveryDedupe();
await verifyWebhookHttpContract();
console.log("[Verify] Catalog sitemap, prerender, schema, webhook security, and delivery checks passed");