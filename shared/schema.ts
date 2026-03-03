import { z } from "zod";

export interface ShopifyVariantMapping {
  variantId: string;
  size: string;
  color: string;
  price: string;
}

export interface Product {
  id: number;
  shopifyProductId: string | null;
  name: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string;
  badge: string | null;
  isNewDrop: boolean | null;
  sizes: string[];
  colors: string[];
  colorImages: Record<string, string> | null;
  tags: string[] | null;
  shopifyVariants: ShopifyVariantMapping[] | null;
}

export interface CartItem {
  id: string;
  sessionId: string;
  productId: number;
  quantity: number;
  size: string;
  color: string;
}

export interface CartItemWithProduct extends CartItem {
  product: Product;
}

export const insertCartItemSchema = z.object({
  sessionId: z.string().min(1),
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().default(1),
  size: z.string().min(1),
  color: z.string().min(1),
});

export type InsertCartItem = z.infer<typeof insertCartItemSchema>;

export const contactMessageSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  subject: z.string().min(1),
  message: z.string().min(10),
});

export type ContactMessage = z.infer<typeof contactMessageSchema>;

export const insertContactMessageSchema = contactMessageSchema;
