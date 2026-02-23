import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
  products, cartItems, contactMessages,
  type Product, type InsertProduct,
  type CartItem, type InsertCartItem, type CartItemWithProduct,
  type ContactMessage, type InsertContactMessage,
} from "@shared/schema";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);

export interface IStorage {
  getProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  upsertProductByPrintfulId(printfulId: number, product: InsertProduct): Promise<Product>;
  deleteProductsNotInPrintfulIds(printfulIds: number[]): Promise<void>;

  getCartItems(sessionId: string): Promise<CartItemWithProduct[]>;
  addCartItem(item: InsertCartItem): Promise<CartItem>;
  updateCartItemQuantity(id: number, quantity: number): Promise<CartItem | undefined>;
  removeCartItem(id: number): Promise<void>;
  clearCart(sessionId: string): Promise<void>;

  updateProductColorImages(id: number, colorImages: Record<string, string>): Promise<Product | undefined>;
  updateProductTags(id: number, tags: string[]): Promise<Product | undefined>;

  createContactMessage(message: InsertContactMessage): Promise<ContactMessage>;
}

export class DatabaseStorage implements IStorage {
  async getProducts(): Promise<Product[]> {
    return db.select().from(products);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [created] = await db.insert(products).values(product).returning();
    return created;
  }

  async upsertProductByPrintfulId(printfulId: number, product: InsertProduct): Promise<Product> {
    const existing = await db.select().from(products).where(eq(products.printfulId, printfulId));
    if (existing.length > 0) {
      const [updated] = await db.update(products)
        .set(product)
        .where(eq(products.printfulId, printfulId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(products).values({ ...product, printfulId }).returning();
    return created;
  }

  async deleteProductsNotInPrintfulIds(printfulIds: number[]): Promise<void> {
    if (printfulIds.length === 0) return;
    const allProducts = await db.select().from(products);
    for (const p of allProducts) {
      if (!p.printfulId || !printfulIds.includes(p.printfulId)) {
        await db.delete(products).where(eq(products.id, p.id));
      }
    }
  }

  async getCartItems(sessionId: string): Promise<CartItemWithProduct[]> {
    const items = await db.select().from(cartItems).where(eq(cartItems.sessionId, sessionId));
    const result: CartItemWithProduct[] = [];
    for (const item of items) {
      const product = await this.getProduct(item.productId);
      if (product) {
        result.push({ ...item, product });
      }
    }
    return result;
  }

  async addCartItem(item: InsertCartItem): Promise<CartItem> {
    const existing = await db.select().from(cartItems).where(
      and(
        eq(cartItems.sessionId, item.sessionId),
        eq(cartItems.productId, item.productId),
        eq(cartItems.size, item.size),
        eq(cartItems.color, item.color),
      )
    );
    if (existing.length > 0) {
      const [updated] = await db.update(cartItems)
        .set({ quantity: existing[0].quantity + (item.quantity || 1) })
        .where(eq(cartItems.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(cartItems).values(item).returning();
    return created;
  }

  async updateCartItemQuantity(id: number, quantity: number): Promise<CartItem | undefined> {
    const [updated] = await db.update(cartItems)
      .set({ quantity })
      .where(eq(cartItems.id, id))
      .returning();
    return updated;
  }

  async removeCartItem(id: number): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.id, id));
  }

  async clearCart(sessionId: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.sessionId, sessionId));
  }

  async updateProductColorImages(id: number, colorImages: Record<string, string>): Promise<Product | undefined> {
    const [updated] = await db.update(products)
      .set({ colorImages })
      .where(eq(products.id, id))
      .returning();
    return updated;
  }

  async updateProductTags(id: number, tags: string[]): Promise<Product | undefined> {
    const [updated] = await db.update(products)
      .set({ tags })
      .where(eq(products.id, id))
      .returning();
    return updated;
  }

  async createContactMessage(message: InsertContactMessage): Promise<ContactMessage> {
    const [created] = await db.insert(contactMessages).values(message).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
