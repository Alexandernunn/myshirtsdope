---
name: Static-first storefront activation
description: How generated catalog pages stay branded while their interactive React routes load.
---

Build-time storefront HTML is the initial customer experience, not an SEO-only fallback. It should carry the same visible route data and branded layout that the first client render needs, while keeping only first-view catalog data embedded.

**Why:** Clearing a sparse prerendered root before lazy route code can commit produces a conspicuous blank or default-content flash on cold mobile loads.

**How to apply:** When changing a visible home, shop, or product route, update both its build-time output and the client’s synchronous embedded-data path. Keep React’s first commit atomic and never erase a prerendered root as an intermediate state.