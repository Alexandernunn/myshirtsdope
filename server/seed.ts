import { db } from "./storage";
import { products } from "@shared/schema";
import { syncPrintfulProducts } from "./printful";

export async function seedDatabase() {
  const existing = await db.select().from(products);

  if (process.env.PRINTFUL_API_KEY) {
    console.log("[Seed] Printful API key found - starting background product sync...");
    syncPrintfulProducts().then(result => {
      if (result.synced > 0) {
        console.log(`[Seed] Background sync complete: ${result.synced} products from Printful`);
        if (result.errors.length > 0) {
          console.warn(`[Seed] ${result.errors.length} sync warnings`);
        }
      } else {
        console.log("[Seed] No products synced from Printful");
      }
    }).catch(err => {
      console.error("[Seed] Background sync error:", err);
    });

    if (existing.length > 0) {
      console.log(`[Seed] ${existing.length} existing products available while sync runs`);
      return;
    }
  } else {
    console.error("[Seed] PRINTFUL_API_KEY not found. Cannot seed products without Printful integration.");
  }
}

