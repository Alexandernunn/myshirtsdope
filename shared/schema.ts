import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, doublePrecision, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const products = pgTable("products", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  printfulId: integer("printful_id"),
  shopifyProductId: text("shopify_product_id"),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: doublePrecision("price").notNull(),
  category: text("category").notNull(),
  imageUrl: text("image_url").notNull(),
  badge: text("badge"),
  isNewDrop: boolean("is_new_drop").default(false),
  sizes: text("sizes").array().notNull(),
  colors: text("colors").array().notNull(),
  colorImages: jsonb("color_images").$type<Record<string, string>>(),
  tags: text("tags").array(),
  shopifyVariants: jsonb("shopify_variants").$type<ShopifyVariantMapping[]>(),
});

export interface ShopifyVariantMapping {
  variantId: string;
  size: string;
  color: string;
  price: string;
}

export const cartItems = pgTable("cart_items", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  sessionId: text("session_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  size: text("size").notNull(),
  color: text("color").notNull(),
});

export const contactMessages = pgTable("contact_messages", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true });
export const insertCartItemSchema = createInsertSchema(cartItems).omit({ id: true });
export const insertContactMessageSchema = createInsertSchema(contactMessages).omit({ id: true, createdAt: true });

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type CartItem = typeof cartItems.$inferSelect;
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = z.infer<typeof insertContactMessageSchema>;

export type CartItemWithProduct = CartItem & { product: Product };
