---
name: Prerender hydration geometry
description: Rules for preventing layout shift when a static PDP is replaced by the React storefront.
---

**Rule:** Treat prerendered PDP markup as a visual first render, not only an SEO fallback. It must reserve the same above-the-fold shell, hero, controls, and responsive geometry as the interactive app, with critical CSS available before the deferred stylesheet activates.

**Why:** The client deliberately keeps prerendered content visible while route code loads, then replaces the root. A simplified static article produces a large visible shift when the app chrome and purchase controls appear.

**How to apply:** When changing the PDP shell or its top controls, update the prerender generator and critical geometry together, keep hydration data sufficient to identify the direct product fit, and validate generated HTML alongside the interactive route.