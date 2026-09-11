---
name: Variant URL identity
description: Defines when customer-facing and merchant schema variant URLs may safely use readable option slugs.
---

Customer-facing and schema variant URLs use lowercase color and size slugs only when those supported options uniquely identify every Shopify variant. Otherwise variants keep the clean product URL. Shopify IDs remain internal to cart and checkout, while legacy ID links are accepted and normalized in place.

**Why:** Readable URLs improve shared links, but additional Shopify option dimensions or slug collisions can make color and size ambiguous. Ambiguous public URLs risk mismatching the SKU, price, image, or availability advertised to Merchant Center.

**How to apply:** Use one shared formatter for storefront and schema URLs, verify slug uniqueness per product, preserve sold-out selections, keep canonicals and sitemap entries clean, and retain unrelated attribution parameters during normalization.