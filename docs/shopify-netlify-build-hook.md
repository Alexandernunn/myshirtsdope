# Shopify catalog rebuild automation

This storefront generates product pages, Product schema, catalog JSON, and `sitemap.xml` during each Netlify build. Configure Shopify to call a Netlify Build Hook whenever catalog data changes.

## Create the Netlify Build Hook

1. In Netlify, open the MyShirtsDope site.
2. Go to **Project configuration** → **Build & deploy** → **Build hooks**.
3. Create a hook named `Shopify catalog refresh` for the production branch.
4. Copy the generated URL. Treat it as a secret: anyone with this URL can request a new build.

## Add Shopify webhooks

In Shopify Admin, go to **Settings** → **Notifications** → **Webhooks** and create JSON webhooks that send to the Netlify Build Hook URL:

| Shopify event | Why it is needed |
| --- | --- |
| Product creation | Adds the new active product to static pages and the sitemap. |
| Product update | Refreshes title, description, price, image, schema, and update date. |
| Product deletion | Removes the product from generated pages and the sitemap. |

Use Shopify's current stable webhook API version and save each subscription.

## Verify the automation

1. Change a non-production product detail in Shopify.
2. Confirm the Netlify Build Hook starts a production build.
3. Confirm the build log fetches the active Shopify catalog and reports generated product pages and sitemap URLs.
4. After deployment, check the corresponding `/product/<id>` HTML, `/sitemap.xml`, and `robots.txt`.

## Availability update note

The three product webhooks above keep product-content changes current. If inventory can change without a product update, add Shopify's inventory-level update webhook to the same Build Hook as well. That gives static availability schema the best possible freshness, subject to the webhook and Netlify deployment delay.