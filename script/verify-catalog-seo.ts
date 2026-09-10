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
import type { Product, ProductSummary } from "../shared/schema";
import { POLICY_PAGES, PUBLIC_TRUST_PATHS, STORE_SUPPORT_EMAIL } from "../shared/store-pages";

const OUTPUT_DIR = path.resolve("dist/public");

type JsonLdNode = Record<string, any>;

function parseGraph(html: string, label: string): JsonLdNode[] {
  const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert(jsonLd, `${label} is missing JSON-LD`);
  const document = JSON.parse(jsonLd);
  assert.equal(document["@context"], "https://schema.org", `${label} has an invalid schema context`);
  assert(Array.isArray(document["@graph"]), `${label} must use a connected @graph`);
  const nodes = document["@graph"] as JsonLdNode[];
  const ids = new Set<string>();
  const references = new Set<string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as JsonLdNode;
    if (typeof node["@id"] === "string") {
      if (Object.keys(node).length === 1) references.add(node["@id"]);
      else {
        assert(!ids.has(node["@id"]), `${label} has duplicate @id ${node["@id"]}`);
        ids.add(node["@id"]);
      }
    }
    Object.values(node).forEach(visit);
  };
  nodes.forEach(visit);
  for (const reference of references) {
    assert(ids.has(reference), `${label} has an unresolved @id reference ${reference}`);
  }
  return nodes;
}

function nodeOfType(nodes: JsonLdNode[], type: string): JsonLdNode {
  const node = nodes.find((candidate) => candidate["@type"] === type);
  assert(node, `schema graph is missing ${type}`);
  return node;
}

async function verifyPublishedCatalog(): Promise<void> {
  const [sitemap, productsJson, redirects] = await Promise.all([
    readFile(path.join(OUTPUT_DIR, "sitemap.xml"), "utf8"),
    readFile(path.join(OUTPUT_DIR, "data/products.json"), "utf8"),
    readFile(path.join(OUTPUT_DIR, "_redirects"), "utf8"),
  ]);
  const products = JSON.parse(productsJson) as Product[];
  assert(products.length > 0, "cached product catalog is empty");
  assert(products.every((product) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.handle)));
  assert(products.every((product) => !/^\d+$/.test(product.handle)), "numeric-only handles are not readable URLs");
  assert.equal(new Set(products.map((product) => product.handle)).size, products.length, "product handles must be unique");
  const productsByHandle = new Map(products.map((product) => [product.handle, product]));
  const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(new Set(sitemapLocs).size, sitemapLocs.length, "sitemap has duplicate URLs");
  assert(sitemapLocs.includes("https://myshirtsdope.com"));
  assert(sitemapLocs.includes("https://myshirtsdope.com/shop"));

  const productEntries = (await readdir(path.join(OUTPUT_DIR, "product"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory());
  const productUrls = sitemapLocs.filter((url) => url.startsWith("https://myshirtsdope.com/product/"));
  assert.equal(productUrls.length, productEntries.length, "sitemap/prerender product count mismatch");
  assert.equal(productEntries.length, products.length, "catalog/prerender product count mismatch");
  assert.equal(
    sitemapLocs.length,
    productEntries.length + 2 + PUBLIC_TRUST_PATHS.length,
    "unexpected sitemap URL count",
  );
  assert(productUrls.every((url) => !/\/product\/\d+$/.test(url)), "numeric product URLs leaked into the sitemap");
  assert.equal(
    (sitemap.match(/<lastmod>[^<]+<\/lastmod>/g) ?? []).length,
    productEntries.length,
    "product lastmod count mismatch",
  );

  for (const entry of productEntries) {
    const productHandle = entry.name;
    const expectedProduct = productsByHandle.get(productHandle);
    assert(expectedProduct, `unexpected prerendered product handle ${productHandle}`);
    const productHtml = await readFile(
      path.join(OUTPUT_DIR, "product", productHandle, "index.html"),
      "utf8",
    );
    assert(
      productHtml.includes(`<link rel="canonical" href="https://myshirtsdope.com/product/${productHandle}" />`),
      `product ${productHandle} canonical URL mismatch`,
    );
    assert(
      !/https:\/\/myshirtsdope\.com\/product\/\d+(?=["'<\s])/.test(productHtml),
      `product ${productHandle} leaks a numeric canonical URL`,
    );
    const graph = parseGraph(productHtml, `product ${productHandle}`);
    const productSchema = nodeOfType(graph, "Product");
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
    assert(productPreload, `product ${productHandle} is missing its LCP image preload`);
    assert(productPreload.includes("width=640&amp;format=webp"), `product ${productHandle} preload is not the product-detail WebP rendition`);
    assert(productPreload.includes("imagesrcset=") && productPreload.includes("imagesizes="));
    assert(productHero, `product ${productHandle} is missing an eager high-priority hero image`);
    assert(productHero.includes("srcset=") && productHero.includes("sizes="));
    assert(productData, `product ${productHandle} is missing its hydration data`);
    const hydratedProduct = JSON.parse(productData) as Product;
    assert.equal(hydratedProduct.handle, productHandle, `product ${productHandle} hydration data mismatch`);
    assert(Array.isArray(hydratedProduct.imageUrls) && hydratedProduct.imageUrls.length > 0, `product ${productHandle} cached images are missing`);
    assert.equal(productSchema["@type"], "Product", `product ${productHandle} schema type mismatch`);
    assert(productSchema.name, `product ${productHandle} schema name is missing`);
    assert.equal(productSchema.sku, String(expectedProduct.id), `product ${productHandle} schema SKU mismatch`);
    assert.equal(offer.url, `https://myshirtsdope.com/product/${productHandle}`, `product ${productHandle} schema URL mismatch`);
    assert(Array.isArray(productSchema.image) && productSchema.image.length > 0, `product ${productHandle} schema image is missing`);
    assert.equal(offer.priceCurrency, "USD", `product ${productHandle} must use USD`);
    assert.equal(offer["@type"], "Offer", `product ${productHandle} must use a merchant Offer`);
    assert(offer.price, `product ${productHandle} schema price is missing`);
    assert.equal(offer.itemCondition, "https://schema.org/NewCondition");
    assert(offer.seller?.["@id"]?.endsWith("/#organization"));
    assert.equal(
      offer.hasMerchantReturnPolicy?.["@id"],
      "https://myshirtsdope.com/returns-refunds#policy",
    );
    assert(
      ["https://schema.org/InStock", "https://schema.org/OutOfStock"].includes(offer.availability),
      `product ${productHandle} has invalid schema availability`,
    );
    assert.equal(productSchema.mainEntityOfPage?.["@id"], `https://myshirtsdope.com/product/${productHandle}#webpage`);
    assert(Array.isArray(productSchema.color) || expectedProduct.colors.length === 0);
    assert(Array.isArray(productSchema.size) || expectedProduct.sizes.length === 0);
    nodeOfType(graph, "OnlineStore");
    nodeOfType(graph, "WebSite");
    nodeOfType(graph, "WebPage");
    nodeOfType(graph, "BreadcrumbList");
    const returnPolicy = nodeOfType(graph, "MerchantReturnPolicy");
    assert.equal(returnPolicy.applicableCountry, "US");
    assert.equal(returnPolicy.merchantReturnDays, 30);
    assert.equal(returnPolicy.returnMethod, "https://schema.org/ReturnByMail");
    assert.equal(returnPolicy.returnFees, "https://schema.org/ReturnShippingFees");
    assert.equal(returnPolicy.merchantReturnLink, "https://myshirtsdope.com/returns-refunds");
    assert(
      !graph.some((node) => node["@type"] === "OfferShippingDetails"),
      `product ${productHandle} must omit shipping schema until checkout rates can be represented accurately`,
    );
  }

  const redirectLines = redirects.trim().split(/\r?\n/);
  assert.equal(redirectLines.length, products.length, "numeric redirect count mismatch");
  const redirectsBySource = new Map<string, string>();
  for (const [index, line] of redirectLines.entries()) {
    const match = line.match(/^\/product\/(\d+)\s+\/product\/([a-z0-9]+(?:-[a-z0-9]+)*)\s+301!$/);
    assert(match, `invalid product redirect syntax at line ${index + 1}`);
    const [, productId, productHandle] = match;
    const source = `/product/${productId}`;
    const destination = `/product/${productHandle}`;
    assert(!redirectsBySource.has(source), `duplicate redirect source ${source}`);
    assert.notEqual(source, destination, `redirect loop for ${source}`);
    assert(!/\/product\/\d+$/.test(destination), `numeric redirect destination ${destination}`);
    redirectsBySource.set(source, destination);
  }
  for (const product of products) {
    const source = `/product/${product.id}`;
    const destination = `/product/${product.handle}`;
    assert(
      redirectsBySource.get(source) === destination,
      `missing permanent redirect for product ${product.id}`,
    );
    assert(!redirectsBySource.has(destination), `redirect chain begins at ${destination}`);
    const destinationHtml = await readFile(
      path.join(OUTPUT_DIR, "product", product.handle, "index.html"),
      "utf8",
    );
    assert(
      destinationHtml.includes(
        `<link rel="canonical" href="https://myshirtsdope.com${destination}" />`,
      ),
      `redirect destination ${destination} does not self-canonicalize`,
    );
  }

  const [homeHtml, shopHtml] = await Promise.all([
    readFile(path.join(OUTPUT_DIR, "index.html"), "utf8"),
    readFile(path.join(OUTPUT_DIR, "shop/index.html"), "utf8"),
  ]);
  const homeGraph = parseGraph(homeHtml, "home page");
  const homeStore = nodeOfType(homeGraph, "OnlineStore");
  assert.equal(homeStore.logo?.width, 1024);
  assert.equal(homeStore.logo?.height, 1024);
  assert.equal(homeStore.email, STORE_SUPPORT_EMAIL);
  assert.equal(
    homeStore.hasMerchantReturnPolicy?.["@id"],
    "https://myshirtsdope.com/returns-refunds#policy",
  );
  nodeOfType(homeGraph, "WebSite");
  nodeOfType(homeGraph, "WebPage");
  nodeOfType(homeGraph, "BreadcrumbList");

  const shopGraph = parseGraph(shopHtml, "shop page");
  nodeOfType(shopGraph, "OnlineStore");
  nodeOfType(shopGraph, "WebSite");
  nodeOfType(shopGraph, "CollectionPage");
  nodeOfType(shopGraph, "BreadcrumbList");
  const shopItems = nodeOfType(shopGraph, "ItemList");
  assert.equal(shopItems.numberOfItems, 15, "shop schema must match the initially visible catalog");
  assert.equal(shopItems.itemListElement.length, 15);
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

  for (const publicPath of PUBLIC_TRUST_PATHS) {
    const html = await readFile(
      path.join(OUTPUT_DIR, publicPath.slice(1), "index.html"),
      "utf8",
    );
    const canonicalUrl = `https://myshirtsdope.com${publicPath}`;
    assert(
      html.includes(`<link rel="canonical" href="${canonicalUrl}" />`),
      `${publicPath} canonical URL mismatch`,
    );
    assert(html.includes('data-prerendered-page="trust"'), `${publicPath} lacks visible static trust content`);
    assert(html.includes(STORE_SUPPORT_EMAIL), `${publicPath} must show or link the public support email`);
    for (const policyPage of POLICY_PAGES) {
      assert(
        html.includes(`href="${policyPage.path}"`),
        `${publicPath} footer is missing ${policyPage.path}`,
      );
    }
    const trustGraph = parseGraph(html, publicPath);
    nodeOfType(trustGraph, "OnlineStore");
    nodeOfType(trustGraph, "WebSite");
    nodeOfType(
      trustGraph,
      publicPath === "/about" ? "AboutPage" : publicPath === "/contact" ? "ContactPage" : "WebPage",
    );
    nodeOfType(trustGraph, "BreadcrumbList");
    const returnPolicy = nodeOfType(trustGraph, "MerchantReturnPolicy");
    assert.equal(returnPolicy.merchantReturnDays, 30);
    const normalized = html.toLowerCase();
    assert(!normalized.includes("[insert"), `${publicPath} contains an unfinished template placeholder`);
    assert(!normalized.includes("within a certain amount"), `${publicPath} contains unfinished refund timing`);
    assert(!normalized.includes("tricreativegroup.com"), `${publicPath} contains the old support identity`);
    assert(!normalized.includes("oberlo"), `${publicPath} contains an unconfirmed legacy provider`);
  }

  const shippingHtml = await readFile(path.join(OUTPUT_DIR, "shipping-policy/index.html"), "utf8");
  assert(shippingHtml.includes("printed and fulfilled by Printful"));
  assert(shippingHtml.includes("2–5 business days"));
  assert(shippingHtml.includes("1–8 business days"));
  assert(shippingHtml.includes("1–20 business days"));
  const returnsHtml = await readFile(path.join(OUTPUT_DIR, "returns-refunds/index.html"), "utf8");
  assert(returnsHtml.includes("within 30 days after delivery"));
  assert(returnsHtml.includes("within 30 business days"));
  assert(!returnsHtml.includes("within 15 days"));
  const privacyHtml = await readFile(path.join(OUTPUT_DIR, "privacy-policy/index.html"), "utf8");
  assert(privacyHtml.includes("sale or sharing of personal information"));
  assert(privacyHtml.includes("Do Not Sell or Share My Personal Information"));

  for (const policyPage of POLICY_PAGES) {
    assert(
      sitemapLocs.includes(`https://myshirtsdope.com${policyPage.path}`),
      `${policyPage.path} is missing from the sitemap`,
    );
  }
  assert(sitemapLocs.includes("https://myshirtsdope.com/about"));
  assert(sitemapLocs.includes("https://myshirtsdope.com/contact"));

  const [notFoundHtml, appShell, netlifyConfig] = await Promise.all([
    readFile(path.join(OUTPUT_DIR, "404.html"), "utf8"),
    readFile(path.join(OUTPUT_DIR, "app-shell.html"), "utf8"),
    readFile(path.resolve("netlify.toml"), "utf8"),
  ]);
  assert(notFoundHtml.includes('content="noindex, nofollow"'));
  assert(notFoundHtml.includes('data-prerendered-page="not-found"'));
  assert(notFoundHtml.includes("PAGE NOT FOUND"));
  assert(appShell.includes('content="noindex, nofollow"'));
  assert(netlifyConfig.includes('from = "/product/*"\n  to = "/404.html"\n  status = 404'));
  assert(netlifyConfig.includes('from = "/*"\n  to = "/404.html"\n  status = 404'));
  for (const applicationPath of ["/cart", "/order-confirmation", "/start"]) {
    assert(
      netlifyConfig.includes(`from = "${applicationPath}"\n  to = "/app-shell.html"\n  status = 200`),
      `${applicationPath} direct-load rewrite is missing`,
    );
  }
}

async function verifyPageSpeedContracts(): Promise<void> {
  const [template, styles, footer, app, main, home, shop, productDetail, prerenderCatalog, deckData] = await Promise.all([
    readFile(path.resolve("client/index.html"), "utf8"),
    readFile(path.resolve("client/src/index.css"), "utf8"),
    readFile(path.resolve("client/src/components/footer.tsx"), "utf8"),
    readFile(path.resolve("client/src/App.tsx"), "utf8"),
    readFile(path.resolve("client/src/main.tsx"), "utf8"),
    readFile(path.resolve("client/src/pages/home.tsx"), "utf8"),
    readFile(path.resolve("client/src/pages/shop.tsx"), "utf8"),
    readFile(path.resolve("client/src/pages/product-detail.tsx"), "utf8"),
    readFile(path.resolve("script/prerender-catalog.ts"), "utf8"),
    readFile(path.join(OUTPUT_DIR, "data/products-deck.json"), "utf8"),
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
  for (const policyPage of POLICY_PAGES) {
    assert(footer.includes(`href="${policyPage.path}"`), `interactive footer is missing ${policyPage.path}`);
  }
  assert(app.includes('<Route path="/shipping-policy" component={PolicyPage} />'));
  assert(app.includes('<Route path="/returns-refunds" component={PolicyPage} />'));
  assert(app.includes('<Route path="/privacy-policy" component={PolicyPage} />'));
  assert(app.includes('<Route path="/terms-of-service" component={PolicyPage} />'));
  assert(!main.includes("replaceChildren"), "prerendered content must not be cleared before React commits");
  assert(main.includes("flushSync"), "the interactive storefront must commit in one synchronous paint");
  assert(home.includes("isPrerenderedDocument() ? tagline : \"\""));
  assert(shop.includes("PRERENDERED_SHOP_DATA_SELECTOR"));
  assert(prerenderCatalog.includes('data-prerendered-deck="true"'));
  assert(prerenderCatalog.includes('data-prerendered-shop="true"'));
  assert(shop.includes('<section aria-labelledby="catalog-heading" className="catalog-section">'));
  assert(shop.includes('className="catalog-card group'));
  assert(shop.includes("shouldLoadRest && initialSource === \"chunk\""));
  assert(shop.includes('window.addEventListener("scroll", loadOnScroll'));
  assert(!shop.includes("requestIdleCallback(loadAfterFirstPaint"));
  const deckProducts = JSON.parse(deckData);
  assert(Array.isArray(deckProducts) && deckProducts.length === 8, "culture deck payload must contain eight products");
  assert(deckProducts.some((product: ProductSummary) => product.name === "A Milli youth shirt"), "culture deck payload must include the primary hero product");
  assert(productDetail.includes('data-testid="product-hero-image-container"'));
  assert(productDetail.includes("aspect-square"));
  assert(productDetail.includes('loading="eager"'));
  assert(productDetail.includes('fetchpriority: "high"'));
  assert(
    app.includes("function ResolvedProductDetailRoute()") &&
      app.includes("return ProductDetailComponent ? <ProductDetailComponent /> : <ProductDetail />;") &&
      app.includes('<Route path="/product/:handle" component={ResolvedProductDetailRoute} />'),
    "preloaded product pages must retain Wouter's matching route context",
  );
  assert(productDetail.includes("requestIdleCallback"));
  assert(productDetail.includes("enabled: secondaryContentEnabled"));
  assert(productDetail.includes('loading="lazy"'));
  assert(productDetail.includes("min-h-[44px]"));
  const primaryProductQuery = productDetail.slice(
    productDetail.indexOf('queryKey: ["/api/products", handle]'),
    productDetail.indexOf("useEffect(() => {", productDetail.indexOf('queryKey: ["/api/products", handle]')),
  );
  assert(primaryProductQuery.includes("initialData: prerenderedProduct"));
  assert(primaryProductQuery.includes("fetchPrerenderedProduct(handle)"));
  assert(!primaryProductQuery.includes("/data/products.json"), "the primary PDP query must not load the full catalog");

  const [homeHtml, shopHtml, firstProduct] = await Promise.all([
    readFile(path.join(OUTPUT_DIR, "index.html"), "utf8"),
    readFile(path.join(OUTPUT_DIR, "shop/index.html"), "utf8"),
    readFile(path.join(OUTPUT_DIR, "product", (await readdir(path.join(OUTPUT_DIR, "product")))[0], "index.html"), "utf8"),
  ]);
  for (const [name, html] of [["home", homeHtml], ["shop", shopHtml], ["product", firstProduct]] as const) {
    assert(html.includes('<div id="root" data-prerendered="true">'), `${name} must retain a static-first root`);
    assert(html.includes("MyShirtsDope"), `${name} must render branded storefront content before JavaScript`);
  }
  assert(homeHtml.includes('data-prerendered-deck="true"'));
  assert(homeHtml.includes("LATEST DROPS"));
  assert(shopHtml.includes('data-prerendered-shop="true"'));
  assert(shopHtml.includes("catalog-grid"));
  assert(firstProduct.includes('data-prerendered-product="true"'));
  assert(firstProduct.includes("ADD TO CART"));
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