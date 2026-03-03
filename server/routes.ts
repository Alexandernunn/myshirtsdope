import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { insertCartItemSchema, contactMessageSchema } from "@shared/schema";
import {
  loadProducts,
  getProduct,
  getCartItems,
  addCartItem,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
} from "./storage";
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const productLimiter = rateLimit(60, 60_000);
  const cartLimiter = rateLimit(30, 60_000);
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

  app.get("/api/cart/:sessionId", cartLimiter, async (req, res) => {
    try {
      const items = getCartItems(req.params.sessionId);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cart" });
    }
  });

  app.post("/api/cart", cartLimiter, async (req, res) => {
    try {
      const parsed = insertCartItemSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });

      await loadProducts();
      const product = getProduct(parsed.data.productId);
      if (!product) return res.status(404).json({ error: "Product not found" });

      const item = addCartItem(parsed.data);
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to add to cart" });
    }
  });

  app.patch("/api/cart/:id", cartLimiter, async (req, res) => {
    try {
      const itemId = req.params.id;
      const { quantity, sessionId } = req.body;
      if (typeof quantity !== "number" || quantity < 1) {
        return res.status(400).json({ error: "Invalid quantity" });
      }
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }
      const item = updateCartItemQuantity(sessionId, itemId, quantity);
      if (!item) return res.status(404).json({ error: "Cart item not found" });
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to update cart item" });
    }
  });

  app.delete("/api/cart/:id", cartLimiter, async (req, res) => {
    try {
      const itemId = req.params.id;
      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }
      removeCartItem(sessionId, itemId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove cart item" });
    }
  });

  app.delete("/api/cart/session/:sessionId", cartLimiter, async (req, res) => {
    try {
      clearCart(req.params.sessionId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear cart" });
    }
  });

  app.post("/api/checkout", checkoutLimiter, async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID is required" });
      }

      const cartItems = getCartItems(sessionId);
      if (cartItems.length === 0) {
        return res.status(400).json({ error: "Cart is empty" });
      }

      const lineItems: { variantId: string; quantity: number }[] = [];
      const unmappedItems: string[] = [];

      for (const item of cartItems) {
        const product = item.product;
        if (!product.shopifyVariants || product.shopifyVariants.length === 0) {
          unmappedItems.push(product.name);
          continue;
        }

        const variant = product.shopifyVariants.find(
          (v) => v.size === item.size && v.color === item.color
        );

        if (!variant) {
          const fallback =
            product.shopifyVariants.find((v) => v.size === item.size) ||
            product.shopifyVariants[0];
          if (fallback) {
            lineItems.push({ variantId: fallback.variantId, quantity: item.quantity });
          } else {
            unmappedItems.push(`${product.name} (${item.size}/${item.color})`);
          }
        } else {
          lineItems.push({ variantId: variant.variantId, quantity: item.quantity });
        }
      }

      if (lineItems.length === 0) {
        return res.status(400).json({
          error: "No items in cart have Shopify variants.",
          unmappedItems,
        });
      }

      const { checkoutUrl, cartId } = await createShopifyCheckout(lineItems);

      res.json({
        checkoutUrl,
        cartId,
        itemCount: lineItems.length,
        ...(unmappedItems.length > 0 ? { unmappedItems } : {}),
      });
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

  return httpServer;
}
