import type { Product, ProductSummary } from "../shared/schema";
import { productPath } from "../shared/product-url";
import { getVariantImage, getVariantPath } from "../shared/product-variant";
import type { ShopifyVariantMapping } from "../shared/schema";

type JsonLdNode = Record<string, unknown>;

const STORE_NAME = "MyShirtsDope";
const STORE_DESCRIPTION =
  "Shirts, hoodies, onesies, and accessories for all ages inspired by music, culture, and love.";
const PRODUCT_BRAND: JsonLdNode = {
  "@type": "Brand",
  name: STORE_NAME,
};

function parsePositivePrice(value: string | number): number | undefined {
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value)) return undefined;
  const price = typeof value === "number" ? value : Number(value);
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

export function hasValidMerchantPrice(product: Product): boolean {
  return (product.shopifyVariants ?? []).some(
    (variant) => parsePositivePrice(variant.price) !== undefined,
  ) || parsePositivePrice(product.price) !== undefined;
}

function validGtin(value: string | null): string | undefined {
  if (!value || !/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return undefined;
  const digits = [...value].map(Number);
  const checkDigit = digits.pop();
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === checkDigit ? value : undefined;
}

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
    email: "info@myshirtsdope.com",
    logo: {
      "@type": "ImageObject",
      "@id": entityIds.logo,
      url: `${siteUrl}/favicon.png`,
      contentUrl: `${siteUrl}/favicon.png`,
      width: 1024,
      height: 1024,
    },
    image: reference(entityIds.logo),
    hasMerchantReturnPolicy: reference(`${siteUrl}/returns-refunds#policy`),
  };
}

function merchantReturnPolicyNode(siteUrl: string): JsonLdNode {
  return {
    "@type": "MerchantReturnPolicy",
    "@id": `${siteUrl}/returns-refunds#policy`,
    applicableCountry: "US",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: 30,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
    merchantReturnLink: `${siteUrl}/returns-refunds`,
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

function productOffer(siteUrl: string, product: Product, canonicalUrl: string): JsonLdNode | undefined {
  const variants = product.shopifyVariants ?? [];
  const availableVariants = variants.filter((variant) => variant.availableForSale);
  const availablePrices = availableVariants
    .map((variant) => parsePositivePrice(variant.price))
    .filter((price): price is number => price !== undefined);
  const allVariantPrices = variants
    .map((variant) => parsePositivePrice(variant.price))
    .filter((price): price is number => price !== undefined);
  const offerPrice = availablePrices.length > 0
    ? Math.min(...availablePrices)
    : allVariantPrices.length > 0
      ? Math.min(...allVariantPrices)
    : parsePositivePrice(product.price);
  if (offerPrice === undefined) return undefined;

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
    hasMerchantReturnPolicy: reference(`${siteUrl}/returns-refunds#policy`),
  };
}

function variantOffer(
  siteUrl: string,
  product: Product,
  canonicalUrl: string,
  variant: ShopifyVariantMapping,
): JsonLdNode {
  const variantUrl = `${siteUrl}${getVariantPath(product, variant)}`;
  return {
    "@type": "Offer",
    "@id": `${canonicalUrl}#offer-${variant.variantId.split("/").pop()}`,
    url: variantUrl,
    priceCurrency: "USD",
    price: Number.parseFloat(variant.price).toFixed(2),
    availability: variant.availableForSale
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    itemCondition: "https://schema.org/NewCondition",
    seller: reference(ids(siteUrl).organization),
    hasMerchantReturnPolicy: reference(`${siteUrl}/returns-refunds#policy`),
  };
}

function aggregateVariantOffer(
  siteUrl: string,
  canonicalUrl: string,
  variants: ShopifyVariantMapping[],
): JsonLdNode | undefined {
  const prices = variants
    .map((variant) => parsePositivePrice(variant.price))
    .filter((price): price is number => price !== undefined);
  if (prices.length === 0) return undefined;

  return {
    "@type": "AggregateOffer",
    "@id": `${canonicalUrl}#aggregate-offer`,
    url: canonicalUrl,
    priceCurrency: "USD",
    lowPrice: Math.min(...prices).toFixed(2),
    highPrice: Math.max(...prices).toFixed(2),
    offerCount: prices.length,
    availability: variants.some((variant) => variant.availableForSale)
      ? "https://schema.org/InStock"
      : "https://schema.org/OutOfStock",
    seller: reference(ids(siteUrl).organization),
    hasMerchantReturnPolicy: reference(`${siteUrl}/returns-refunds#policy`),
  };
}

function productNode(siteUrl: string, product: Product, canonicalUrl: string): JsonLdNode | undefined {
  const usableVariants = (product.shopifyVariants ?? []).filter((variant) =>
    parsePositivePrice(variant.price) !== undefined,
  );
  const uniqueSelections = new Set(
    usableVariants.map((variant) => `${variant.color}\u0000${variant.size}`),
  );
  const barcodes = new Set(
    (product.shopifyVariants ?? [])
      .map((variant) => validGtin(variant.barcode))
      .filter((barcode): barcode is string => Boolean(barcode)),
  );
  const gtin = barcodes.size === 1 ? [...barcodes][0] : undefined;
  const audience = audienceFor(product);
  if (usableVariants.length > 1 && uniqueSelections.size === usableVariants.length) {
    const colors = new Set(usableVariants.map((variant) => variant.color).filter(Boolean));
    const sizes = new Set(usableVariants.map((variant) => variant.size).filter(Boolean));
    const variesBy = [
      ...(colors.size > 1 ? ["https://schema.org/color"] : []),
      ...(sizes.size > 1 ? ["https://schema.org/size"] : []),
    ];
    return {
      "@type": "ProductGroup",
      "@id": `${canonicalUrl}#product`,
      url: canonicalUrl,
      mainEntityOfPage: reference(`${canonicalUrl}#webpage`),
      name: product.name,
      description: product.description,
      productGroupID: product.shopifyProductId?.split("/").pop() || String(product.id),
      ...(variesBy.length > 0 ? { variesBy } : {}),
      image: product.imageUrls.length > 0 ? product.imageUrls : [product.imageUrl].filter(Boolean),
      category: product.category,
      brand: PRODUCT_BRAND,
      ...(audience ? { audience } : {}),
      offers: aggregateVariantOffer(siteUrl, canonicalUrl, usableVariants),
      hasVariant: usableVariants.map((variant) => {
        const variantId = variant.variantId.split("/").pop();
        const variantImage = getVariantImage(product, variant);
        return {
          "@type": "Product",
          "@id": `${canonicalUrl}#variant-${variantId}`,
          name: `${product.name} – ${variant.color} / ${variant.size}`,
          url: `${siteUrl}${getVariantPath(product, variant)}`,
          ...(variant.sku ? { sku: variant.sku } : {}),
          ...(validGtin(variant.barcode) ? { gtin: validGtin(variant.barcode) } : {}),
          color: variant.color,
          size: variant.size,
          brand: PRODUCT_BRAND,
          ...(variantImage ? { image: [variantImage] } : {}),
          isVariantOf: reference(`${canonicalUrl}#product`),
          offers: variantOffer(siteUrl, product, canonicalUrl, variant),
        };
      }),
    };
  }
  const onlyVariant = usableVariants[0];
  const offer = productOffer(siteUrl, product, canonicalUrl);
  if (!offer) return undefined;

  return {
    "@type": "Product",
    "@id": `${canonicalUrl}#product`,
    url: canonicalUrl,
    mainEntityOfPage: reference(`${canonicalUrl}#webpage`),
    name: product.name,
    description: product.description,
    image: product.imageUrls.length > 0 ? product.imageUrls : [product.imageUrl].filter(Boolean),
    sku: onlyVariant?.sku || String(product.id),
    ...(gtin ? { gtin } : {}),
    category: product.category,
    brand: PRODUCT_BRAND,
    ...(audience ? { audience } : {}),
    ...(onlyVariant?.color ? { color: onlyVariant.color } : {}),
    ...(onlyVariant?.size ? { size: onlyVariant.size } : {}),
    offers: offer,
  };
}

export function homePageSchema(siteUrl: string): JsonLdNode {
  const canonicalUrl = `${siteUrl}/`;
  return graph([
    organizationNode(siteUrl),
    merchantReturnPolicyNode(siteUrl),
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
    merchantReturnPolicyNode(siteUrl),
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
  const productEntity = productNode(siteUrl, product, canonicalUrl);
  return graph([
    organizationNode(siteUrl),
    merchantReturnPolicyNode(siteUrl),
    websiteNode(siteUrl),
    pageNode(
      siteUrl,
      canonicalUrl,
      "WebPage",
      `${product.name} | ${STORE_NAME}`,
      product.description,
      productEntity ? { mainEntity: reference(`${canonicalUrl}#product`) } : undefined,
    ),
    breadcrumbNode(canonicalUrl, [
      { name: "Home", url: `${siteUrl}/` },
      { name: "Shop", url: `${siteUrl}/shop` },
      { name: product.name, url: canonicalUrl },
    ]),
    productEntity,
  ].filter((node): node is JsonLdNode => Boolean(node)));
}

export function trustPageSchema(
  siteUrl: string,
  path: string,
  type: "AboutPage" | "ContactPage" | "WebPage",
  name: string,
  description: string,
): JsonLdNode {
  const canonicalUrl = `${siteUrl}${path}`;
  return graph([
    organizationNode(siteUrl),
    merchantReturnPolicyNode(siteUrl),
    websiteNode(siteUrl),
    pageNode(siteUrl, canonicalUrl, type, name, description),
    breadcrumbNode(canonicalUrl, [
      { name: "Home", url: `${siteUrl}/` },
      { name, url: canonicalUrl },
    ]),
  ]);
}