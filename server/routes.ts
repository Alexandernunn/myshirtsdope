import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { contactMessageSchema } from "../shared/schema";
import { loadProducts, getProduct, forceRefreshProducts } from "./storage";
import { createShopifyCheckout } from "./shopify-storefront";

function getAllowedOrigins(): string[] {
  const origins: string[] = [];
  if (process.env.SITE_URL) {
    try {
      const u = new URL(process.env.SITE_URL);
      origins.push(u.origin);
    } catch {}
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    origins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  }
  return origins;
}

function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin || "";

  if (process.env.NODE_ENV === "development") {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  } else {
    const allowed = getAllowedOrigins();
    if (origin && allowed.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Requested-With, X-App-Token");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
}

function verifyAppToken(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === "development") {
    return next();
  }

  const xRequestedWith = req.headers["x-requested-with"];
  const xAppToken = req.headers["x-app-token"];
  const expectedToken = process.env.API_APP_TOKEN || "msd-storefront-v1";

  if (xRequestedWith !== "XMLHttpRequest" || xAppToken !== expectedToken) {
    return res.status(403).json({ error: "Forbidden" });
  }

  next();
}

const requestCounts = new Map<string, { count: number; resetAt: number }>();

function rateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    let entry = requestCounts.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      requestCounts.set(key, entry);
    }

    entry.count++;

    if (entry.count > maxRequests) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }

    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of requestCounts) {
    if (now >= entry.resetAt) {
      requestCounts.delete(key);
    }
  }
}, 60_000);

export function registerRoutes(httpServer: Server, app: Express): void {
  app.use("/api", corsMiddleware, verifyAppToken);
  const productLimiter = rateLimit(60, 60_000);
  const contactLimiter = rateLimit(5, 60_000);
  const checkoutLimiter = rateLimit(10, 60_000);

  app.get("/api/products", productLimiter, async (req, res) => {
    try {
      const products = await loadProducts();

      const page = parseInt(req.query.page as string) || 0;
      const limit = Math.min(parseInt(req.query.limit as string) || 0, 100);

      if (page > 0 && limit > 0) {
        const total = products.length;
        const totalPages = Math.ceil(total / limit);
        const start = (page - 1) * limit;
        const chunk = products.slice(start, start + limit);

        return res
          .set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60")
          .json({ products: chunk, total, page, totalPages });
      }

      res
        .set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60")
        .json(products);
    } catch (error) {
      console.error("Failed to fetch products:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.get("/api/products/slim", productLimiter, async (_req, res) => {
    try {
      const products = await loadProducts();
      const slim = products.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        category: p.category,
        imageUrl: p.imageUrl,
        badge: p.badge,
        isNewDrop: p.isNewDrop,
        tags: p.tags,
        sizes: p.sizes,
        colors: p.colors,
      }));
      res
        .set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60")
        .json(slim);
    } catch (error) {
      console.error("Failed to fetch slim products:", error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.post("/api/products/refresh", productLimiter, async (req, res) => {
    const refreshSecret = process.env.REFRESH_SECRET;
    if (refreshSecret) {
      const provided = req.headers["x-refresh-secret"];
      if (provided !== refreshSecret) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }
    try {
      const products = await forceRefreshProducts();
      res.json({ success: true, count: products.length });
    } catch (error) {
      console.error("Failed to refresh products:", error);
      res.status(500).json({ error: "Failed to refresh products" });
    }
  });

  app.get("/api/products/:id", productLimiter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid product ID" });

      await loadProducts();
      const product = getProduct(id);
      if (!product) return res.status(404).json({ error: "Product not found" });
      res.json(product);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });

  app.get("/api/products/:id/color-images", productLimiter, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid product ID" });

      await loadProducts();
      const product = getProduct(id);
      if (!product) return res.status(404).json({ error: "Product not found" });

      res.json({ colorImages: product.colorImages || {}, cached: true });
    } catch (error) {
      console.error("Failed to fetch color images:", error);
      res.json({ colorImages: {}, cached: false });
    }
  });

  app.post("/api/checkout", checkoutLimiter, async (req, res) => {
    try {
      const { lineItems } = req.body;

      if (!Array.isArray(lineItems) || lineItems.length === 0) {
        return res.status(400).json({ error: "No items provided for checkout" });
      }

      const validated: { variantId: string; quantity: number }[] = [];
      for (const item of lineItems) {
        if (typeof item.variantId !== "string" || typeof item.quantity !== "number") {
          return res.status(400).json({ error: "Invalid line item format" });
        }
        validated.push({ variantId: item.variantId, quantity: item.quantity });
      }

      const { checkoutUrl, cartId } = await createShopifyCheckout(validated);

      res.json({ checkoutUrl, cartId, itemCount: validated.length });
    } catch (error) {
      console.error("Checkout error:", error);
      res.status(500).json({ error: "Failed to create checkout" });
    }
  });

  app.post("/api/contact", contactLimiter, async (req, res) => {
    try {
      const parsed = contactMessageSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      console.log("[Contact] Message received:", {
        name: parsed.data.name,
        email: parsed.data.email,
        subject: parsed.data.subject,
      });
      res.json({ success: true, message: "Message received" });
    } catch (error) {
      res.status(500).json({ error: "Failed to send message" });
    }
  });
}
