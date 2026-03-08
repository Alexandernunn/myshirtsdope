import type { ShopifyVariantMapping } from "../shared/schema";

function getAdminConfig() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (!domain || !token) {
    throw new Error("Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN");
  }
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return { domain: cleanDomain, token };
}

async function adminRequest(path: string, options?: RequestInit): Promise<any> {
  const { domain, token } = getAdminConfig();
  const url = `https://${domain}/admin/api/2024-01${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
      ...(options?.headers || {}),
    },
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get("retry-after") || "2");
    console.log(`[Shopify Admin] Rate limited, waiting ${retryAfter}s...`);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return adminRequest(path, options);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify Admin API error (${res.status}): ${text}`);
  }

  return res.json();
}

let cachedStorefrontToken: string | null = null;

async function getStorefrontToken(): Promise<string> {
  if (cachedStorefrontToken) return cachedStorefrontToken;

  const data = await adminRequest("/storefront_access_tokens.json");
  const existing = data.storefront_access_tokens?.find(
    (t: any) => t.title === "MyShirtsDope Storefront"
  );

  if (existing) {
    cachedStorefrontToken = existing.access_token;
    return cachedStorefrontToken!;
  }

  const created = await adminRequest("/storefront_access_tokens.json", {
    method: "POST",
    body: JSON.stringify({
      storefront_access_token: { title: "MyShirtsDope Storefront" },
    }),
  });

  cachedStorefrontToken = created.storefront_access_token.access_token;
  console.log("[Shopify] Created new Storefront API access token");
  return cachedStorefrontToken!;
}

async function storefrontQuery(query: string, variables?: Record<string, unknown>): Promise<any> {
  const { domain } = getAdminConfig();
  const storefrontToken = await getStorefrontToken();
  const url = `https://${domain}/api/2024-01/graphql.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": storefrontToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify Storefront API error (${res.status}): ${text}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Shopify Storefront GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

interface AdminProduct {
  id: number;
  title: string;
  body_html: string;
  product_type: string;
  tags: string;
  images: { id: number; src: string; alt: string | null }[];
  variants: {
    id: number;
    title: string;
    price: string;
    option1: string | null;
    option2: string | null;
    option3: string | null;
    image_id: number | null;
    inventory_quantity: number;
  }[];
  options: { name: string; position: number; values: string[] }[];
}

export async function fetchAllStorefrontProducts(): Promise<AdminProduct[]> {
  const { domain, token } = getAdminConfig();
  const allProducts: AdminProduct[] = [];
  let nextUrl: string | null =
    `https://${domain}/admin/api/2024-01/products.json?limit=250&status=active`;

  console.log(`[Shopify Admin] Requesting: ${nextUrl}`);

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
      },
    });

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") || "2");
      console.log(`[Shopify Admin] Rate limited, waiting ${retryAfter}s...`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify Admin API error (${res.status}): ${text}`);
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      throw new Error(`Shopify returned non-JSON response (${contentType}): ${text.substring(0, 200)}`);
    }

    const data = await res.json();
    allProducts.push(...data.products);

    const linkHeader = res.headers.get("link");
    nextUrl = null;
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) nextUrl = nextMatch[1];
    }
  }

  console.log(`[Shopify Admin] Fetched ${allProducts.length} products`);
  return allProducts;
}

function categorizeProduct(productType: string, title: string): string {
  const type = productType.toLowerCase();
  const name = title.toLowerCase();

  if (type.includes("hoodie") || name.includes("hoodie")) return "Hoodies";
  if (type.includes("hat") || type.includes("cap") || name.includes("hat") || name.includes("cap")) return "Hats";
  if (type.includes("accessory") || type.includes("accessories")) return "Accessories";
  if (type.includes("pants") || type.includes("jogger") || name.includes("pants") || name.includes("jogger")) return "Pants";
  return "Shirts";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function mapStorefrontProduct(product: AdminProduct) {
  const imageMap = new Map<number, string>();
  for (const img of product.images) {
    imageMap.set(img.id, img.src);
  }

  const sizeOption = product.options.find((o) =>
    o.name.toLowerCase() === "size"
  );
  const colorOption = product.options.find((o) =>
    o.name.toLowerCase() === "color" || o.name.toLowerCase() === "colour"
  );

  const sizePos = sizeOption ? sizeOption.position : null;
  const colorPos = colorOption ? colorOption.position : null;

  const sizes = new Set<string>();
  const colors = new Set<string>();
  const colorImages: Record<string, string> = {};
  const shopifyVariants: ShopifyVariantMapping[] = [];

  for (const variant of product.variants) {
    const optVals = [variant.option1, variant.option2, variant.option3];

    let size = sizePos ? (optVals[sizePos - 1] ?? "One Size") : "One Size";
    let color = colorPos ? (optVals[colorPos - 1] ?? "Default") : "Default";

    sizes.add(size);
    colors.add(color);

    if (variant.image_id && imageMap.has(variant.image_id) && color !== "Default") {
      colorImages[color] = imageMap.get(variant.image_id)!;
    }

    const variantGid = `gid://shopify/ProductVariant/${variant.id}`;
    shopifyVariants.push({
      variantId: variantGid,
      size,
      color,
      price: variant.price,
    });
  }

  const mainImage = product.images[0]?.src || "";
  const prices = product.variants.map((v) => parseFloat(v.price)).filter((p) => !isNaN(p));
  const lowestPrice = prices.length > 0 ? Math.min(...prices) : 0;

  const tags = product.tags
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);

  return {
    shopifyProductId: `gid://shopify/Product/${product.id}`,
    name: product.title,
    description: stripHtml(product.body_html) || `${product.title} from MyShirtsDope`,
    price: lowestPrice,
    category: categorizeProduct(product.product_type, product.title),
    imageUrl: mainImage,
    sizes: Array.from(sizes),
    colors: Array.from(colors),
    colorImages,
    tags,
    shopifyVariants,
    isNewDrop: false,
  };
}

const CART_CREATE_MUTATION = `
  mutation CartCreate($lines: [CartLineInput!]!) {
    cartCreate(input: { lines: $lines }) {
      cart {
        id
        checkoutUrl
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function createShopifyCheckout(
  lineItems: { variantId: string; quantity: number }[]
): Promise<{ checkoutUrl: string; cartId: string }> {
  const lines = lineItems.map((item) => ({
    merchandiseId: item.variantId,
    quantity: item.quantity,
  }));

  const data = await storefrontQuery(CART_CREATE_MUTATION, { lines });
  const result = data.cartCreate;

  if (result.userErrors && result.userErrors.length > 0) {
    throw new Error(`Shopify cart errors: ${JSON.stringify(result.userErrors)}`);
  }

  if (!result.cart?.checkoutUrl) {
    throw new Error("Failed to create Shopify checkout - no checkout URL returned");
  }

  return {
    checkoutUrl: result.cart.checkoutUrl,
    cartId: result.cart.id,
  };
}
