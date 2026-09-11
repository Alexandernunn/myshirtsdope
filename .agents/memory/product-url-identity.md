---
name: Product URL identity
description: Defines the durable boundary between public Shopify product handles and internal numeric identifiers.
---

Use Shopify’s unique handle as the public product slug. Keep numeric product and variant IDs for catalog grouping, tracking, cart, checkout, and API compatibility, and permanently redirect legacy numeric product paths.

**Why:** Title-derived slugs can collide, while exposing numeric IDs produces unreadable URLs. Shopify handles provide an intentional public identity without disrupting internal commerce operations.

**How to apply:** Any product link, canonical, social URL, structured-data URL, or sitemap entry should use the shared handle-based path. New data flows must carry both the handle and numeric ID. On Netlify, generate `product/handle.html` and explicitly rewrite `/product/:handle` to that file before the product 404 fallback; relying on Pretty URLs can produce a self-redirect. Directory-index output makes the trailing-slash URL canonical.