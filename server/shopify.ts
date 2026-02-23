import { storage } from "./storage";
import { generateTags } from "./printful";

interface ShopifyProduct {
  id: number;
  title: string;
  tags: string;
}

function getShopifyConfig() {
  const storeUrl = process.env.SHOPIFY_STORE_URL;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!storeUrl || !accessToken) {
    throw new Error("Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN");
  }
  const cleanUrl = storeUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return { cleanUrl, accessToken };
}

async function fetchAllShopifyProducts(): Promise<ShopifyProduct[]> {
  const { cleanUrl, accessToken } = getShopifyConfig();
  const allProducts: ShopifyProduct[] = [];
  let nextPageUrl: string | null =
    `https://${cleanUrl}/admin/api/2024-01/products.json?limit=250&fields=id,title,tags`;

  while (nextPageUrl) {
    const res = await fetch(nextPageUrl, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "2");
      console.log(`[Shopify] Rate limited, waiting ${retryAfter}s...`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify API error (${res.status}): ${text}`);
    }

    const data = await res.json();
    allProducts.push(...data.products);

    const linkHeader = res.headers.get("link");
    nextPageUrl = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        nextPageUrl = nextMatch[1];
      }
    }
  }

  return allProducts;
}

export async function syncShopifyTags(): Promise<{
  updated: number;
  matched: number;
  unmatched: string[];
  total: number;
}> {
  console.log("[Shopify] Fetching all Shopify products for tag sync...");
  const shopifyProducts = await fetchAllShopifyProducts();
  console.log(`[Shopify] Found ${shopifyProducts.length} products in Shopify`);

  const shopifyTagsByTitle = new Map<string, string[]>();
  for (const sp of shopifyProducts) {
    const tags = sp.tags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0);
    shopifyTagsByTitle.set(sp.title.toLowerCase(), tags);
  }

  const dbProducts = await storage.getProducts();
  let updated = 0;
  let matched = 0;
  const unmatched: string[] = [];

  for (const product of dbProducts) {
    const shopifyTags = shopifyTagsByTitle.get(product.name.toLowerCase());

    if (!shopifyTags || shopifyTags.length === 0) {
      unmatched.push(product.name);
      const generatedTags = generateTags(
        product.name,
        product.category,
        product.colors || []
      );
      await storage.updateProductTags(product.id, generatedTags);
      updated++;
      continue;
    }

    matched++;

    const generatedTags = generateTags(
      product.name,
      product.category,
      product.colors || []
    );

    const mergedTags = new Set<string>();
    for (const t of generatedTags) mergedTags.add(t.toLowerCase());
    for (const t of shopifyTags) mergedTags.add(t.toLowerCase());

    await storage.updateProductTags(product.id, Array.from(mergedTags));
    updated++;

    if (updated % 200 === 0) {
      console.log(`[Shopify] Tag sync progress: ${updated}/${dbProducts.length}`);
    }
  }

  console.log(
    `[Shopify] Tag sync complete: ${matched} matched, ${unmatched.length} unmatched, ${updated} total updated`
  );
  return {
    updated,
    matched,
    unmatched: unmatched.slice(0, 20),
    total: dbProducts.length,
  };
}
