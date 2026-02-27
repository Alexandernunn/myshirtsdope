# MyShirtsDope - Retro Arcade Merch Store

## Overview
MyShirtsDope is a vintage arcade / retro video game themed merch store web app. It sells shirts, hoodies, onesies, and accessories inspired by music, culture, and love.

## Tech Stack
- Frontend: React + Vite + Tailwind CSS + shadcn/ui
- Backend: Express.js
- Database: PostgreSQL with Drizzle ORM
- Routing: wouter
- State: React Context (cart), TanStack Query (data fetching)
- Fonts: Press Start 2P (pixel headings), Permanent Marker (display/subheadings - nostalgic hip hop vibe), Inter (body text)

## Project Structure
- `client/src/pages/` - Home, Shop, ProductDetail, Cart, About, Contact, NotFound
- `client/src/components/` - Navbar, Footer, Starfield (canvas animation)
- `client/src/lib/cart-context.tsx` - Cart state management with session-based persistence
- `server/routes.ts` - API endpoints for products, cart, contact, product sync
- `server/storage.ts` - Database storage layer using Drizzle ORM
- `server/printful.ts` - Printful API integration for syncing real products
- `server/seed.ts` - Database seeding (Printful sync or fallback seed data)
- `shared/schema.ts` - Data models: products (with printfulId), cartItems, contactMessages

## API Routes
- GET /api/products - List all products
- GET /api/products/:id - Get single product
- GET /api/cart/:sessionId - Get cart items for session
- POST /api/cart - Add item to cart
- PATCH /api/cart/:id - Update quantity
- DELETE /api/cart/:id - Remove item
- DELETE /api/cart/session/:sessionId - Clear cart
- POST /api/contact - Submit contact form
- POST /api/sync-products - Manually trigger Printful product sync

## Printful Integration
- Uses Printful Sync API (/sync/products) for Shopify-connected stores
- Products synced on server startup (background, non-blocking)
- Supports rate limiting with retry logic
- Maps Printful variants to sizes/colors, auto-categorizes products
- Products table has printfulId column for upsert tracking

## Design Theme
- Dark background with pixel grid overlay
- Neon accent colors: electric blue (#00b4ff), yellow (#ffd700), green (#39ff14), orange (#ff6b35)
- CRT scanline effects, starfield animation, neon glow text
- Press Start 2P for pixel headings, Permanent Marker (font-display) for subheadings/accent text, Inter for body
- Game-inspired UI patterns (inventory screen for cart, dialogue box for contact)

## Product Grouping & Display
- `client/src/lib/product-grouping.ts` - Groups adult/youth/toddler variants into single listings
- Round-robin interleaving on Shop page (All view) so product types are mixed across rows
- Product detail page shows fit selector (adult/youth/toddler) when multiple fits exist
- Color-specific images: selecting a color swaps the product image to that color's preview
- Products schema has `colorImages` jsonb column mapping color name → preview image URL

## Environment Variables / Secrets
- `SHOPIFY_STORE_DOMAIN` - Shopify store domain (env var, e.g. `tri-creative-store.myshopify.com`)
- `SHOPIFY_ACCESS_TOKEN` - Shopify Admin API access token (`shpat_...`) — stored as secret
- `SHOPIFY_STOREFRONT_TOKEN` - Auto-generated at runtime from Admin API; no need to set manually
- `PRINTFUL_API_KEY` - Optional; Printful product sync (currently not set — seeding skipped)
- `DATABASE_URL` - PostgreSQL connection string (managed by Replit)

## Shopify Integration
- **Product sync**: Admin REST API (`GET /admin/api/2024-01/products.json`) via `server/shopify-storefront.ts`
- **Checkout**: Storefront API GraphQL (`cartCreate` mutation) via auto-generated Storefront token
- **Auto token generation**: On first checkout, the server calls `POST /admin/api/2024-01/storefront_access_tokens.json` to create a Storefront API token (cached in memory, titled "MyShirtsDope Storefront")
- **Variant mapping**: Each product stores `shopifyVariants` (jsonb) with `{variantId, size, color, price}` — variantId is a GID (`gid://shopify/ProductVariant/...`)
- **Routes**: `POST /api/sync-shopify-products` (sync), `POST /api/checkout` (create checkout URL)
- **Schema additions**: `shopifyProductId` (text), `shopifyVariants` (jsonb) columns on products table

## Recent Changes
- Initial MVP build with all pages, retro arcade theming, cart system
- Replaced neon pink with electric blue (#00b4ff) for bolder masculine aesthetic
- Added Permanent Marker font for subheadings/display text to create nostalgic hip hop vibe
- Typography: Press Start 2P (pixel headings), Permanent Marker (subheadings/descriptions), Inter (body)
- Integrated Printful API to sync real products (2,746 items) from Shopify-connected Printful store
- Added printfulId column to products schema for tracking synced items
- Background sync on startup with rate limit handling and retry logic
- Added colorImages jsonb column to products for per-color variant preview images
- Product detail page swaps image when user selects a color
- Round-robin interleaving of product types on Shop "All" view
- Product grouping with adult/youth/toddler fit variants and fit selector on detail page
- Removed fallback seed data — all products now come exclusively from Printful API
- Enriched product tags with comprehensive artist/city/genre mapping
  - ARTIST_TAG_MAP in printful.ts maps ~150+ product names to artists, cities, genres, and themes
  - AREA_CODE_CITIES maps area code products (212, 305, 310, etc.) to city names
  - Tags include: artist names, city names, regions (east coast, west coast, south, midwest), genres (rap, r&b, soul, funk), record labels, and more
  - POST /api/regenerate-tags endpoint to re-generate tags for all existing products
  - Shop search matches against product names, tags array, and colors
- Added CultureDeck 3D interactive component on homepage (below hero CTA)
  - CSS 3D transforms: 14 random product cards arranged in a circular fan
  - Auto-rotates at 360°/18s, drag-to-spin with momentum physics
  - Depth cueing: cards behind are darker/smaller via brightness/scale
  - Responsive: 500×400 desktop, 320×280 mobile
  - Cards link to product detail pages, neon glow on hover
- Integrated Shopify Storefront API for full e-commerce selling
  - Product sync via Admin REST API (2,742 Shopify products synced)
  - Checkout via Shopify Storefront GraphQL (`cartCreate` mutation)
  - Storefront API token auto-generated from Admin API token at runtime
  - Schema extended with `shopifyProductId` and `shopifyVariants` columns
  - Cart page checkout button wired to `/api/checkout` → redirects to Shopify hosted checkout
  - Admin API token (`SHOPIFY_ACCESS_TOKEN`) stored as Replit secret
