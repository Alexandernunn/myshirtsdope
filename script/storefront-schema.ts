import type { Product, ProductSummary } from "../shared/schema";
import { productPath } from "../shared/product-url";
import { getVariantImage, getVariantPath } from "../shared/product-variant";
import type { ShopifyVariantMapping } from "../shared/schema";

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

function productNode(siteUrl: string, product: Product, canonicalUrl: string): JsonLdNode {
  const usableVariants = (product.shopifyVariants ?? []).filter((variant) =>
    Number.isFinite(Number.parseFloat(variant.price)),
  );
  const uniqueSelections = new Set(
    usableVariants.map((variant) => `${variant.color}\u0000${variant.size}`),
  );
  const barcodes = new Set(
    (product.shopifyVariants ?? [])
      .map((variant) => variant.barcode)
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
      brand: reference(ids(siteUrl).organization),
      ...(audience ? { audience } : {}),
      hasVariant: usableVariants.map((variant) => {
        const variantId = variant.variantId.split("/").pop();
        const variantImage = getVariantImage(product, variant);
        return {
          "@type": "Product",
          "@id": `${canonicalUrl}#variant-${variantId}`,
          name: `${product.name} – ${variant.color} / ${variant.size}`,
          url: `${siteUrl}${getVariantPath(product, variant)}`,
          ...(variant.sku ? { sku: variant.sku } : {}),
          ...(variant.barcode ? { gtin: variant.barcode } : {}),
          color: variant.color,
          size: variant.size,
          ...(variantImage ? { image: [variantImage] } : {}),
          isVariantOf: reference(`${canonicalUrl}#product`),
          offers: variantOffer(siteUrl, product, canonicalUrl, variant),
        };
      }),
    };
  }
  const onlyVariant = usableVariants[0];

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