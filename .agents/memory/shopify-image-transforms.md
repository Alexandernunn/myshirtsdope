---
name: Shopify CDN image transforms & LCP preload parity
description: How product images are resized/format-shifted via Shopify CDN params, and the traps around preload parity and the variant-pick hash.
---

## Shopify CDN URL transforms
- Append `&width=N&format=webp` to `cdn.shopify.com` product image URLs (they already carry `?v=...`, so use `&`). The shared helper in `shared/shopify-image.ts` does this plus srcset/sizes presets per surface.
- **`format=webp` is Accept-negotiated**: the CDN returns `image/webp` only when the request's `Accept` header includes webp (all real browsers). A plain `curl`/node fetch without that header gets jpeg back — this is expected, not a bug.
- AVIF is not available via URL params; webp is the ceiling.
- Keep OG/Twitter/JSON-LD/microdata image URLs as full-quality originals; only visible `<img>`/preload tags use transforms.

## LCP preload parity (prerender vs client)
- Prerendered Shop/Product heads inject `<link rel="preload" as="image" ... imagesrcset/imagesizes fetchpriority="high">` that must match the client's first rendered image byte-for-byte, or the preload wastes bandwidth.
- **Trap:** the deterministic variant-pick hash (`pickVariantIndex`) can return a *negative* index for large Shopify product IDs (`Math.imul` yields signed 32-bit). The client silently falls back to `product.imageUrl` via `?? `. Any build-time replica must reproduce that exact fallback — do not "fix" the hash, it would change which images display site-wide.

## Local Lighthouse harness
- No bundled Chrome; use a nix-store ungoogled-chromium binary via `CHROME_PATH` with `--headless=new --no-sandbox`, serving `dist/public` with `npx serve`. Background servers die between shell invocations — start serve and lighthouse in the same command.
- Local simulated scores are much harsher than production PSI; compare baseline-vs-change locally rather than chasing absolute PSI numbers. Shop LCP is dominated by JS bootstrap/hydration (h1 paints after hydration), not images.
