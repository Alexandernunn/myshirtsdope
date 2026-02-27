import type { ShopifyVariantMapping } from "@shared/schema";

function getStorefrontConfig() {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_STOREFRONT_TOKEN;
  if (!domain || !token) {
    throw new Error("Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_STOREFRONT_TOKEN");
  }
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return { domain: cleanDomain, token };
}

async function storefrontQuery(query: string, variables?: Record<string, unknown>): Promise<any> {
  const { domain, token } = getStorefrontConfig();
  const url = `https://${domain}/api/2024-01/graphql.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": token,
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

const PRODUCTS_QUERY = `
  query GetProducts($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          description
          productType
          tags
          images(first: 10) {
            edges {
              node {
                url
                altText
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                price {
                  amount
                  currencyCode
                }
                selectedOptions {
                  name
                  value
                }
                image {
                  url
                  altText
                }
                availableForSale
              }
            }
          }
        }
      }
    }
  }
`;

interface ShopifyStorefrontProduct {
  id: string;
  title: string;
  description: string;
  productType: string;
  tags: string[];
  images: { edges: { node: { url: string; altText: string | null } }[] };
  variants: {
    edges: {
      node: {
        id: string;
        title: string;
        price: { amount: string; currencyCode: string };
        selectedOptions: { name: string; value: string }[];
        image: { url: string; altText: string | null } | null;
        availableForSale: boolean;
      };
    }[];
  };
}

export async function fetchAllStorefrontProducts(): Promise<ShopifyStorefrontProduct[]> {
  const allProducts: ShopifyStorefrontProduct[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await storefrontQuery(PRODUCTS_QUERY, { cursor });
    const products = data.products;

    for (const edge of products.edges) {
      allProducts.push(edge.node);
    }

    hasNextPage = products.pageInfo.hasNextPage;
    cursor = products.pageInfo.endCursor;
  }

  console.log(`[Shopify Storefront] Fetched ${allProducts.length} products`);
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

export function mapStorefrontProduct(product: ShopifyStorefrontProduct) {
  const variants = product.variants.edges.map((e) => e.node).filter((v) => v.availableForSale);

  const sizes = new Set<string>();
  const colors = new Set<string>();
  const colorImages: Record<string, string> = {};
  const shopifyVariants: ShopifyVariantMapping[] = [];

  for (const variant of variants) {
    let size = "One Size";
    let color = "Default";

    for (const opt of variant.selectedOptions) {
      const optName = opt.name.toLowerCase();
      if (optName === "size") size = opt.value;
      else if (optName === "color" || optName === "colour") color = opt.value;
    }

    sizes.add(size);
    colors.add(color);

    if (variant.image?.url && color !== "Default") {
      colorImages[color] = variant.image.url;
    }

    shopifyVariants.push({
      variantId: variant.id,
      size,
      color,
      price: variant.price.amount,
    });
  }

  const mainImage = product.images.edges[0]?.node.url || "";
  const lowestPrice = variants.length > 0
    ? Math.min(...variants.map((v) => parseFloat(v.price.amount)))
    : 0;

  return {
    shopifyProductId: product.id,
    name: product.title,
    description: product.description || `${product.title} from MyShirtsDope`,
    price: lowestPrice,
    category: categorizeProduct(product.productType, product.title),
    imageUrl: mainImage,
    sizes: Array.from(sizes),
    colors: Array.from(colors),
    colorImages,
    tags: product.tags.map((t) => t.toLowerCase()),
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
        lines(first: 50) {
          edges {
            node {
              id
              quantity
              merchandise {
                ... on ProductVariant {
                  id
                  title
                }
              }
            }
          }
        }
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
