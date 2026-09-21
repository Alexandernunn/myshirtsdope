# Catalog Cleanup Launch Checklist

No step should delete a Shopify product. Keep the catalog export and the pre-launch deployment available until verification is complete.

## 1. Deploy redirects first

1. Build and verify locally: `npm run build:netlify && npx tsx scripts/check-redirects.ts`.
2. Publish this build before archiving anything.
3. Confirm every archived handle redirects while its Shopify product is still active. This is safe because storefront traffic reaches the keeper; Shopify remains unchanged and can still fulfill any old checkout references.

**Rollback:** republish the previous deployment. All Shopify products remain active.

## 2. Apply approved catalog fixes

1. Review: `npx tsx scripts/apply-catalog-fixes.ts --dry-run`.
2. Apply interactively: `npx tsx scripts/apply-catalog-fixes.ts --apply`.

**Rollback:** use `audit/catalog-fix-apply-results.json` and the dry-run snapshot to restore prior titles, prices, and product types with a reviewed reverse CSV.

## 3. Archive approved duplicates

1. Review: `npx tsx scripts/archive-duplicates.ts --dry-run`.
2. Apply interactively: `npx tsx scripts/archive-duplicates.ts --apply`.

The script sets product status to `ARCHIVED` only, then requires Shopify's public storefront product endpoint to return no product for each archived handle.

**Rollback:** change affected products from Archived to Active. The script attempts this automatically if an individual archive operation or storefront verification fails.

## 4. Trigger a fresh catalog build

Run the Netlify production build so sitemap, prerendered pages, embedded product JSON, and forced redirect rules are regenerated from `data/product-merges.json`.

**Rollback:** restore the prior deployment. Do not remove the merge manifest unless archived products are also restored.

## 5. Verify production redirects

Run:

`npx tsx scripts/check-redirects.ts --base-url=https://myshirtsdope.com`

Every archived handle must pass `/product` and `/products` checks for direct, color/size, and legacy variant-ID URLs in one 301 hop to a 200 keeper page.

**Rollback:** restore archived products first if necessary, then republish the prior deployment.

## 6. Spot-check five retitled products

Check title, product type, price, selected color/size, add-to-cart, and checkout for:

- All For The Money youth shirt
- Mahogany Soul hoodie
- U.N.I.T.Y. youth hoodie
- Little Mike hoodie
- The Most Beautifulest Onesie

Also open a saved cart containing an archived product and confirm it maps to the keeper or is removed with a notice.

## 7. Final rollback decision

If redirects, saved carts, checkout, sitemap, or product pages fail, stop launch activity. Restore archived products to Active, reverse catalog fixes, and republish the previous deployment before investigating.