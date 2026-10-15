---
name: Collection recommendation priorities
description: User-approved priorities when real variant imagery conflicts with recommendation ranking.
---

Keep every clothing recommendation card a different color. Preserve the chosen products when possible by adjusting earlier color choices first; substitute a recommendation only when necessary to avoid a repeated color.

**Why:** The user explicitly chose color uniqueness over strict product and color ordering after being told some matching products have only one photographed color.

**How to apply:** Use genuine variant images and links that select the displayed color. Do not invent images or treat a colored garment as colorless to hide a conflict. Default mugs use their featured images without consuming a clothing color.

Product recommendations must work with the existing catalog, categories, and adult/youth grouping; do not require new Shopify collections, tags, or metafields. Kids product pages recommend only kids items.

**Why:** These are explicit user constraints for product-page discovery.

**How to apply:** Preserve these constraints when changing recommendations or their data source, including fallback recommendations.

Load recommendations as soon as the product is known, without waiting for browser idle time or customer interaction.

**Why:** The user reported that suggestions sometimes appeared only after clicking a size and asked for them to appear faster.

**How to apply:** Keep the recommendation request independent from deferred optional image enrichment. Do not reintroduce an idle or interaction gate for the row.
