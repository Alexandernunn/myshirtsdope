---
name: Catalog prerendering
description: Architectural decision for making storefront catalog pages visible to crawlers.
---

Use one build-time Shopify catalog snapshot for cached product data, bot-visible shop/product HTML, Product schema, and the sitemap. Keep the React app client-rendered for interactive behavior; do not add runtime SSR or a third-party prerender service without a new requirement. During client takeover, retain the static root until the matching route code is available.

**Why:** The production target is a Netlify static deployment, and the build already has the complete active product dataset. Sharing one snapshot prevents sitemap, schema, cache, and generated-page drift. Build-time output also avoids per-request Shopify access, serverless cold starts, framework migration, and external service credentials. A slow or failed route chunk must not blank useful catalog content or suppress initial analytics.

For product pages, embed the ID-matched product payload in the prerendered document and use it to seed the primary client query. Do not load the full catalog before showing the PDP hero; reserve it for idle-time fit grouping and related products. For in-app PDP navigation, retrieve only the destination page payload before falling back to the API.

**How to apply:** Pass the same mapped product collection through cache writing, prerendering, schema, and sitemap generation. Fail the deployment if expected product-page directories and sitemap product IDs differ, and let generated static files take precedence over the SPA fallback. Arm deferred-marketing interaction listeners and queue the initial browser/CAPI PageView before waiting for normalized route preloads; clear static content only after the matching import succeeds. Keep product hydration data ID-bound and JSON-safe, and validate both its presence and the absence of full-catalog loading in the primary PDP path.