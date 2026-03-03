import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { contactMessageSchema } from "../shared/schema";
import { loadProducts, getProduct } from "./storage";
import { createShopifyCheckout } from "./shopify-storefront";

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
  const productLimiter = rateLimit(60, 60_000);
  const contactLimiter = rateLimit(5, 60_000);
  const checkoutLimiter = rateLimit(10, 60_000);

  app.get("/api/products", productLimiter, async (_req, res) => {
    try {
      const products = await loadProducts();
      res.json(products);
    } catch (error) {
      console.error("Failed to fetch products:", error);
      res.status(500).json({ error: "Failed to fetch products" });
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
