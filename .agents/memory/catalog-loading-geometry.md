---
name: Catalog loading geometry
description: CLS-sensitive rules for the shop catalog’s loading state and footer containment.
---

Keep the `/shop` loading skeleton’s normal-flow geometry aligned with its populated state: reserve the count row before the grid and pagination row after it, rather than using a fixed minimum height on the catalog section.

**Why:** A section-wide desktop minimum height increased reported CLS, while omitted count and pagination rows allowed the visible grid and footer to move when catalog data arrived.

**How to apply:** When changing initial catalog controls, mirror their live height and margins in the loading branch. Keep the catalog section in natural document flow.

Do not add `content-visibility: auto` to the global storefront footer when optimizing CLS; retain layout containment without culling.

**Why:** Footer culling produced misleading zero-rectangle early-paint shift sources and destabilized first-paint diagnostics.

**How to apply:** Preserve `contain: layout` on the footer, reserve only its actual content geometry, and verify that footer links remain visible after scrolling.