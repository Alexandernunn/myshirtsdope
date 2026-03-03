# MyShirtsDope - Retro Arcade Merch Store

## Overview
MyShirtsDope is a vintage arcade / retro video game themed merch store web app. It sells shirts, hoodies, onesies, and accessories inspired by music, culture, and love. All product data comes directly from Shopify via API — no database.

## Tech Stack
- Frontend: React + Vite + Tailwind CSS + shadcn/ui
- Backend: Express.js (API proxy for Shopify, in-memory cart)
- Data Source: Shopify Admin REST API + Storefront GraphQL API
- Routing: wouter
- State: React Context (cart), TanStack Query (data fetching)
- Fonts: Press Start 2P (pixel headings), Permanent Marker (display/subheadings), Inter (body text)

## Architecture (No Database)
- Products are fetched from Shopify Admin API and cached in server memory (5-min TTL)
- Cart is stored in server memory per session (no database persistence)
- Checkout creates a Shopify cart via Storefront GraphQL API and redirects to Shopify checkout
- Contact form logs to server console (no database storage)
- Rate limiting is implemented per-IP on all API endpoints
- All API keys remain server-side only

## Project Structure
- `client/src/pages/` - Home, Shop, ProductDetail, Cart, About, Contact, NotFound
- `client/src/components/` - Navbar, Footer, Starfield (canvas animation), CultureDeck (3D carousel)
- `client/src/lib/cart-context.tsx` - Cart state management with session-based persistence
- `client/src/lib/product-grouping.ts` - Groups adult/youth/toddler variants into single listings
- `server/routes.ts` - API endpoints with rate limiting
- `server/storage.ts` - In-memory product cache and cart store (backed by Shopify API)
- `server/shopify-storefront.ts` - Shopify Admin REST API + Storefront GraphQL API integration

## API Routes
- GET /api/products - List all products (cached from Shopify)
- GET /api/products/:id - Get single product
- GET /api/products/:id/color-images - Get color-specific images for a product
- GET /api/cart/:sessionId - Get cart items for session
- POST /api/cart - Add item to cart
- PATCH /api/cart/:id - Update quantity (requires sessionId in body)
- DELETE /api/cart/:id - Remove item (requires sessionId query param)
- DELETE /api/cart/session/:sessionId - Clear cart
- POST /api/checkout - Create Shopify checkout and get redirect URL
- POST /api/contact - Submit contact form (logged server-side)

## Shopify Integration
- **Product data**: Admin REST API (`GET /admin/api/2024-01/products.json`) with pagination
- **Checkout**: Storefront API GraphQL (`cartCreate` mutation)
- **Auto token generation**: Storefront API token auto-generated from Admin API token at runtime
- **Rate limit handling**: Automatic retry on 429 responses from Shopify
- **Caching**: Products cached in memory for 5 minutes, background refresh when stale

## Rate Limiting
- Products: 60 requests/minute per IP
- Cart operations: 30 requests/minute per IP
- Contact form: 5 requests/minute per IP
- Checkout: 10 requests/minute per IP

## Environment Variables / Secrets
- `SHOPIFY_STORE_DOMAIN` - Shopify store domain (e.g., `store.myshopify.com`)
- `SHOPIFY_ACCESS_TOKEN` - Shopify Admin API access token (`shpat_...`)

## Design Theme
- Dark background with pixel grid overlay
- Neon accent colors: electric blue (#00b4ff), yellow (#ffd700), green (#39ff14), orange (#ff6b35)
- CRT scanline effects, starfield animation, neon glow text
- Press Start 2P for pixel headings, Permanent Marker for subheadings, Inter for body
- Game-inspired UI patterns (inventory screen for cart, dialogue box for contact)

## Product Grouping & Display
- `client/src/lib/product-grouping.ts` - Groups adult/youth/toddler variants into single listings
- Round-robin interleaving on Shop page (All view) so product types are mixed across rows
- Product detail page shows fit selector (adult/youth/toddler) when multiple fits exist
- Color-specific images: selecting a color swaps the product image to that color's preview
