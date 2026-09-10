import type { Product, ProductSummary } from "../shared/schema";
import { productPath } from "../shared/product-url";

type JsonLdNode = Record<string, unknown>;

const STORE_NAME = "MyShirtsDope";
const STORE_DESCRIPTION =
  "Shirts, hoodies, onesies, and accessories for all ages inspired by music, culture, and love.";

function ids(siteUrl: string) {
  return {
    organization: `${siteUrl}/#organization`,
    website: `${siteUrl}/#website`,
    logo: `${siteUrl}/#logo`,
  };
}

function reference(id: string): JsonLdNode {
  return { "@id": id };
}

function organizationNode(siteUrl: string): JsonLdNode {
  const entityIds = ids(siteUrl);
  return {
    "@type": "OnlineStore",
    "@id": entityIds.organization,
    name: STORE_NAME,
    alternateName: "My Shirts Dope",
    url: `${siteUrl}/`,
    description: STORE_DESCRIPTION,
    logo: {
      "@type": "ImageObject",
      "@id": entityIds.logo,
      url: `${siteUrl}/favicon.png`,
      contentUrl: `${siteUrl}/favicon.png`,
      width: 1024,
      height: 1024,
    },
    image: reference(entityIds.logo),
  };
}

function websiteNode(siteUrl: string): JsonLdNode {
  const entityIds = ids(siteUrl);
  return {
    "@type": "WebSite",
    "@id": entityIds.website,
    url: `${siteUrl}/`,
    name: STORE_NAME,
    description: STORE_DESCRIPTION,
    publisher: reference(entityIds.organization),
    inLanguage: "en-US",
  };
}

function breadcrumbNode(
  canonicalUrl: string,
  crumbs: Array<{ name: string; url: string }>,
): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    "@id": `${canonicalUrl}#breadcrumb`,
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

function pageNode(
  siteUrl: string,
  canonicalUrl: string,
  type: "WebPage" | "CollectionPage" | "AboutPage" | "ContactPage",
  name: string,
  description: string,
  extras: JsonLdNode = {},
): JsonLdNode {
  const entityIds = ids(siteUrl);
  return {
    "@type": type,
    "@id": `${canonicalUrl}#webpage`,
    url: canonicalUrl,
    name,
    description,
    isPartOf: reference(entityIds.website),
    about: reference(entityIds.organization),
    breadcrumb: reference(`${canonicalUrl}#breadcrumb`),
    inLanguage: "en-US",
    ...extras,
  };
}

function graph(nodes: JsonLdNode[]): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@graph": nodes,
  };
}

function audienceFor(product: Product): JsonLdNode | undefined {
  const text = `${product.name} ${product.category}`.toLowerCase();
  if (/\b(onesie|baby|infant)\b/.test(text)) {
    return {
      "@type": "PeopleAudience",
      suggestedMinAge: 0,
      suggestedMaxAge: 1,
    };
  }
  if (/\btoddler\b/.test(text)) {
    return {
      "@type": "PeopleAudience",
      suggestedMinAge: 1,
      suggestedMaxAge: 5,
    };
  }
  if (/\b(youth|kids|kid)\b/.test(text)) {
    return {
      "@type": "PeopleAudience",
      suggestedMinAge: 5,
      suggestedMaxAge: 13,
    };
  }
  return undefined;
}

function productOffer(siteUrl: string, product: Product, canonicalUrl: string): JsonLdNode {
  const variants = product.shopifyVariants ?? [];
  const availableVariants = variants.filter((variant) => variant.availableForSale);
  const pricedVariants = (availableVariants.length > 0 ? availableVariants : variants)
    .map((variant) => Number.parseFloat(variant.price))
    .filter(Number.isFinite);
  const offerPrice = pricedVariants.length > 0 ? Math.min(...pricedVariants) : product.price;

  return {
    "@type": "Offer",
    "@id": `${canonicalUrl}#offer`,
    url: canonicalUrl,
    priceCurrency: "USD",
    price: offerPrice.toFixed(2),
    availability: availableVariants.length > 0
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition",
    seller: reference(ids(siteUrl).organization),
  };
}

function productNode(siteUrl: string, product: Product, canonicalUrl: string): JsonLdNode {
  const barcodes = new Set(
    (product.shopifyVariants ?? [])
      .map((variant) => variant.barcode)
      .filter((barcode): barcode is string => Boolean(barcode)),
  );
  const gtin = barcodes.size === 1 ? [...barcodes][0] : undefined;
  const audience = audienceFor(product);

  return {
    "@type": "Product",
    "@id": `${canonicalUrl}#product`,
    url: canonicalUrl,
    mainEntityOfPage: reference(`${canonicalUrl}#webpage`),
    name: product.name,
    description: product.description,
    image: product.imageUrls.length > 0 ? product.imageUrls : [product.imageUrl].filter(Boolean),
    sku: String(product.id),
    ...(gtin ? { gtin } : {}),
    category: product.category,
    brand: reference(ids(siteUrl).organization),
    ...(audience ? { audience } : {}),
    ...(product.colors.length > 0 ? { color: product.colors } : {}),
    ...(product.sizes.length > 0 ? { size: product.sizes } : {}),
    offers: productOffer(siteUrl, product, canonicalUrl),
  };
}

export function homePageSchema(siteUrl: string): JsonLdNode {
  const canonicalUrl = `${siteUrl}/`;
  return graph([
    organizationNode(siteUrl),
    websiteNode(siteUrl),
    pageNode(
      siteUrl,
      canonicalUrl,
      "WebPage",
      `${STORE_NAME} | Culture You Can Wear`,
      STORE_DESCRIPTION,
    ),
    breadcrumbNode(canonicalUrl, [{ name: "Home", url: canonicalUrl }]),
  ]);
}

export function shopPageSchema(siteUrl: string, products: ProductSummary[]): JsonLdNode {
  const canonicalUrl = `${siteUrl}/shop`;
  const itemListId = `${canonicalUrl}#products`;
  return graph([
    organizationNode(siteUrl),
    websiteNode(siteUrl),
    pageNode(
      siteUrl,
      canonicalUrl,
      "CollectionPage",
      `Shop | ${STORE_NAME}`,
      "Browse MyShirtsDope shirts, hoodies, onesies, and accessories inspired by music, culture, and love.",
      { mainEntity: reference(itemListId) },
    ),
    breadcrumbNode(canonicalUrl, [
      { name: "Home", url: `${siteUrl}/` },
      { name: "Shop", url: canonicalUrl },
    ]),
    {
      "@type": "ItemList",
      "@id": itemListId,
      name: "MyShirtsDope products",
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${siteUrl}${productPath(product)}`,
        name: product.name,
        image: product.imageUrl,
      })),
    },
  ]);
}

export function productPageSchema(siteUrl: string, product: Product): JsonLdNode {
  const canonicalUrl = `${siteUrl}${productPath(product)}`;
  return graph([
    organizationNode(siteUrl),
    websiteNode(siteUrl),
    pageNode(
      siteUrl,
      canonicalUrl,
      "WebPage",
      `${product.name} | ${STORE_NAME}`,
      product.description,
      { mainEntity: reference(`${canonicalUrl}#product`) },
    ),
    breadcrumbNode(canonicalUrl, [
      { name: "Home", url: `${siteUrl}/` },
      { name: "Shop", url: `${siteUrl}/shop` },
      { name: product.name, url: canonicalUrl },
    ]),
    productNode(siteUrl, product, canonicalUrl),
  ]);
}