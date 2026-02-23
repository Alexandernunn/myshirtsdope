import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCartItemSchema, insertContactMessageSchema } from "@shared/schema";
import { syncPrintfulProducts, fetchColorImagesForProduct, generateTags } from "./printful";
import { syncShopifyTags } from "./shopify";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/products", async (_req, res) => {
    try {
      const products = await storage.getProducts();
      res.json(products);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid product ID" });
      const product = await storage.getProduct(id);
      if (!product) return res.status(404).json({ error: "Product not found" });
      res.json(product);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });

  app.get("/api/products/:id/color-images", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid product ID" });
      const product = await storage.getProduct(id);
      if (!product) return res.status(404).json({ error: "Product not found" });

      if (product.colorImages && Object.keys(product.colorImages).length > 0) {
        return res.json({ colorImages: product.colorImages, cached: true });
      }

      if (!product.printfulId) {
        return res.json({ colorImages: {}, cached: false });
      }

      const colorImages = await fetchColorImagesForProduct(product.printfulId);
      if (Object.keys(colorImages).length > 0) {
        await storage.updateProductColorImages(id, colorImages);
      }
      res.json({ colorImages, cached: false });
    } catch (error) {
      console.error("Failed to fetch color images:", error);
      res.json({ colorImages: {}, cached: false });
    }
  });

  app.get("/api/cart/:sessionId", async (req, res) => {
    try {
      const items = await storage.getCartItems(req.params.sessionId);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cart" });
    }
  });

  app.post("/api/cart", async (req, res) => {
    try {
      const parsed = insertCartItemSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const item = await storage.addCartItem(parsed.data);
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to add to cart" });
    }
  });

  app.patch("/api/cart/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const { quantity } = req.body;
      if (typeof quantity !== "number" || quantity < 1) {
        return res.status(400).json({ error: "Invalid quantity" });
      }
      const item = await storage.updateCartItemQuantity(id, quantity);
      if (!item) return res.status(404).json({ error: "Cart item not found" });
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: "Failed to update cart item" });
    }
  });

  app.delete("/api/cart/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      await storage.removeCartItem(id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove cart item" });
    }
  });

  app.delete("/api/cart/session/:sessionId", async (req, res) => {
    try {
      await storage.clearCart(req.params.sessionId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to clear cart" });
    }
  });

  app.post("/api/sync-products", async (_req, res) => {
    try {
      const result = await syncPrintfulProducts();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to sync products" });
    }
  });

  app.post("/api/regenerate-tags", async (_req, res) => {
    try {
      const allProducts = await storage.getProducts();
      let updated = 0;
      for (const product of allProducts) {
        const tags = generateTags(product.name, product.category, product.colors || []);
        await storage.updateProductTags(product.id, tags);
        updated++;
      }
      res.json({ updated });
    } catch (error) {
      res.status(500).json({ error: "Failed to regenerate tags" });
    }
  });

  app.post("/api/sync-shopify-tags", async (_req, res) => {
    try {
      const result = await syncShopifyTags();
      res.json(result);
    } catch (error) {
      console.error("Shopify tag sync error:", error);
      res.status(500).json({ error: "Failed to sync Shopify tags" });
    }
  });

  app.post("/api/contact", async (req, res) => {
    try {
      const parsed = insertContactMessageSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
      const message = await storage.createContactMessage(parsed.data);
      res.json(message);
    } catch (error) {
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  return httpServer;
}
