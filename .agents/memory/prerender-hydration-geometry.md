---
name: Prerender hydration geometry
description: Rules for preventing layout shift when static prerendered pages (PDP, homepage) are replaced by the React storefront.
---

**Rule:** Treat prerendered markup (PDP and homepage shell) as a visual first render, not only an SEO fallback. It must reserve the same above-the-fold shell, hero, controls, and responsive geometry as the interactive app, with critical CSS available before the deferred stylesheet activates. Dynamic hero content must reserve its final geometry in React too (invisible full-text sizer under typed text; fixed-size stages that render even with zero data).

**Why:** The client deliberately keeps prerendered content visible while route code loads, then replaces the root. A simplified static article produces a large visible shift when the app chrome and purchase controls appear.

**How to apply:** When changing the PDP shell or its top controls, update the prerender generator and critical geometry together, keep hydration data sufficient to identify the direct product fit, and validate generated HTML alongside the interactive route. The catalog verifier enforces shell/source copy parity for the homepage — keep those assertions in sync when editing homepage copy.

**Critical-CSS specificity trap:** A scoped reset like `[shell] p { margin: 0 }` (two selectors) out-specifies single-attribute rules like `[data-x] { margin-bottom: 1rem }` and silently strips margins. Prefix every descendant rule in shell critical CSS with the shell scope so specificity stays uniform.

**Tailwind line-height gotcha:** Responsive font-size utilities (`sm:text-4xl`, `md:text-5xl`) override `leading-*` because media-query rules come later in the stylesheet — mirror the utility's own line-height (e.g. `text-5xl` → `line-height: 1`) in shell CSS, not the leading class.

**Measuring CLS parity:** Cross-context comparisons (JS-off shell vs JS-on hydrated) are unreliable — `font-display: optional` webfonts apply inconsistently between fresh browser contexts, producing phantom wrap/height deltas. The trustworthy method: temporarily inject an inline probe into built index.html that records shell rects at DOMContentLoaded+rAF, hydrated rects after root replacement, and a buffered `layout-shift` PerformanceObserver score — all in one real page load. Note hydration can beat DOMContentLoaded when modulepreloads are warm, so the observer score is the ground truth.

**Why:** The client deliberately keeps prerendered content visible while route code loads, then replaces the root. A simplified static article produces a large visible shift when the app chrome and purchase controls appear.

**How to apply:** When changing the PDP shell or its top controls, update the prerender generator and critical geometry together, keep hydration data sufficient to identify the direct product fit, and validate generated HTML alongside the interactive route.