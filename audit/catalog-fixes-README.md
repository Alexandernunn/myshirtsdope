# Catalog Fix Input

`catalog-fixes.csv` is the only input read by `scripts/apply-catalog-fixes.ts`.

## Columns

- `handle` identifies the existing Shopify product. It is lookup-only and is never sent in an update mutation.
- `new_title` replaces the product title when populated.
- `new_price` replaces the price of every variant on that product when populated. Use a positive number with at most two decimal places.
- `new_product_type` replaces the Shopify product type when populated.

Blank change fields mean “leave unchanged.” This file cannot clear an existing title or product type.

## Safe usage

Preview populated rows without writing:

```sh
npx tsx scripts/apply-catalog-fixes.ts --dry-run
```

Live mode requires an interactive terminal and the exact typed phrase `APPLY CATALOG FIXES`:

```sh
npx tsx scripts/apply-catalog-fixes.ts --apply
```

The script validates Shopify’s mutation schema, shows the same before/after diff as dry-run, and asks for confirmation before writing. It verifies each updated product and attempts to restore its captured original values if any step fails. Live outcomes are recorded locally in `audit/catalog-fix-apply-results.json`.