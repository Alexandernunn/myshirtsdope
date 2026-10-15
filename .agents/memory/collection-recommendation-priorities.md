---
name: Collection recommendation priorities
description: User-approved priorities when real variant imagery conflicts with recommendation ranking.
---

Keep every clothing recommendation card a different color. Preserve the chosen products when possible by adjusting earlier color choices first; substitute a recommendation only when necessary to avoid a repeated color.

**Why:** The user explicitly chose color uniqueness over strict product and color ordering after being told some matching products have only one photographed color.

**How to apply:** Use genuine variant images and links that select the displayed color. Do not invent images or treat a colored garment as colorless to hide a conflict. Default mugs use their featured images without consuming a clothing color.

Put the same-design recommendation in slot two, ahead of the second same-category best seller.

**Why:** The user explicitly asked for the matching design to take slot two.

**How to apply:** Keep the matching item top-right in the mobile two-by-two grid, retaining cross-category preferences, kids-only restrictions, and distinct clothing colors.

Product recommendations must work with the existing catalog, categories, and adult/youth grouping; do not require new Shopify collections, tags, or metafields. Kids product pages recommend only kids items.

**Why:** These are explicit user constraints for product-page discovery.

**How to apply:** Preserve these constraints when changing recommendations or their data source, including fallback recommendations.

Load recommendations as soon as the product is known, without waiting for browser idle time or customer interaction.

**Why:** The user reported that suggestions sometimes appeared only after clicking a size and asked for them to appear faster.

**How to apply:** Keep the recommendation request independent from deferred optional image enrichment. Do not reintroduce an idle or interaction gate for the row.

Mobile recommendations should be a clean, symmetrical two-by-two grid with equal spacing and natural vertical browsing rather than a sideways carousel.

**Why:** The user explicitly asked for a two-by-two mobile layout where they can scroll down and everything is spaced properly.

**How to apply:** Preserve equal-width cards and square image areas on phones without changing the desktop row or recommendation choices.

Verify responsive styling in the generated CSS and at both phone and desktop sizes, not merely by checking class names in source.

**Why:** A component omitted from Tailwind's curated source scan can pass builds and source-level tests while silently losing its responsive overrides.

**How to apply:** Include newly extracted components in the style scan and confirm emitted breakpoint rules before accepting responsive-layout work.
