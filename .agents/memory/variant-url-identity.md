---
name: Variant URL identity
description: Explains why merchant schema variant URLs use Shopify variant IDs in addition to readable option parameters.
---

Schema variant URLs must include the unique Shopify variant ID. Color and size parameters may remain for readability, but they are not sufficient identity.

**Why:** Shopify products can have additional or unrecognized option dimensions, producing multiple SKUs with the same color and size. Publishing those variants at one URL makes the landing page ambiguous and can mismatch the advertised SKU, price, image, or availability.

**How to apply:** Resolve the variant ID before descriptive option parameters. Emit ProductGroup variants only when the storefront can represent each variant uniquely; otherwise publish a truthful single Product fallback.