---
name: Catalog prerendering
description: Architectural decision for making storefront catalog pages visible to crawlers.
---

Use build-time prerendering from the single Shopify catalog fetch for bot-visible shop and product HTML. Keep the React app client-rendered for interactive behavior; do not add runtime SSR or a third-party prerender service without a new requirement. During client takeover, retain the static root until the matching route code is available.

**Why:** The production target is a Netlify static deployment, and the existing build already has the complete active product dataset. Build-time output avoids per-request Shopify access, serverless cold starts, framework migration, and external service credentials. A slow or failed route chunk must not blank useful catalog content or suppress initial analytics.

**How to apply:** Generate SEO pages only after the Vite shell and catalog data are available, fail the deployment if required prerender artifacts cannot be created, and let generated static files take precedence over the SPA fallback. Arm deferred-marketing interaction listeners and queue the initial browser/CAPI PageView before waiting for normalized route preloads; clear static content only after the matching import succeeds.