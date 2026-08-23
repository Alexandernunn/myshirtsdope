# Shopify catalog rebuild automation

This storefront generates product pages, Product schema, catalog JSON, and `sitemap.xml` during each Netlify build. A signed Shopify webhook function requests that build automatically whenever catalog or inventory data changes.

## Create the Netlify Build Hook

1. In Netlify, open the MyShirtsDope site.
2. Go to **Project configuration** → **Build & deploy** → **Build hooks**.
3. Create a hook named `Shopify catalog refresh` for the production branch.
4. Copy the generated URL. Treat it as a secret: anyone with this URL can request a new build.
5. Add the URL to the Netlify production environment as the secret `NETLIFY_BUILD_HOOK_URL`.

## Configure the signed webhook function

Add the Shopify webhook signing secret to the Netlify production environment as `SHOPIFY_WEBHOOK_SECRET`. This is the secret Shopify uses to produce the `X-Shopify-Hmac-Sha256` header for the webhook subscriptions.

Create JSON webhook subscriptions with this endpoint:

`https://myshirtsdope.com/webhooks/shopify/catalog`

## Add Shopify webhooks

In Shopify Admin, go to **Settings** → **Notifications** → **Webhooks** and create JSON webhooks that send to the endpoint above:

| Shopify event | Why it is needed |
| --- | --- |
| Product creation | Adds the new active product to static pages and the sitemap. |
| Product update | Refreshes title, description, price, image, schema, and update date. |
| Product deletion | Removes the product from generated pages and the sitemap. |
| Inventory level update | Refreshes `InStock`/`OutOfStock` schema when stock changes independently of product content. |

Use Shopify's current stable webhook API version and save each subscription.

## Verify the automation

1. Change a non-production product detail in Shopify.
2. Confirm the webhook delivery receives a `202` response and the Netlify Build Hook starts a production build.
3. Confirm the build log fetches the active Shopify catalog and reports generated product pages and sitemap URLs.
4. After deployment, check the corresponding `/product/<id>` HTML, `/sitemap.xml`, and `robots.txt`.

## Security and delivery behavior

The function verifies Shopify's HMAC against the raw request body before inspecting the event or contacting Netlify. Invalid signatures return `401`, missing deployment configuration returns `503`, and no build hook is contacted in either case.

Shopify retry IDs are remembered for 24 hours on a warm function instance, so repeated deliveries of the same event do not request another build. Each distinct product or inventory change requests a build. This intentionally favors catalog freshness: suppressing a later event while an earlier Netlify build is taking its Shopify snapshot could otherwise leave the static catalog stale.

## Availability update note

The inventory-level subscription keeps static availability schema current when stock changes without a product edit, subject to the Shopify webhook and Netlify deployment delay.