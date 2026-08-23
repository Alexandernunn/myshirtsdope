import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ShoppingCart, Check } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { usePageTitle } from "@/hooks/use-page-title";
import { findGroupForProduct, groupProducts, getProductForFit, getFitLabel, type FitType } from "@/lib/product-grouping";
import { IMAGE_PRESETS, shopifyImageProps, shopifyImageUrl } from "@shared/shopify-image";
import { trackEvent } from "@/lib/meta-capi";
import type { Product } from "@shared/schema";

const COLOR_HEX_MAP: Record<string, string> = {
  "red": "#cc0000",
  "black": "#111111",
  "white": "#ffffff",
  "pink": "#ffb6c1",
  "yellow": "#ffd700",
  "kelly": "#4caf50",
  "kelly green": "#4caf50",
  "true royal": "#1a47a0",
  "royal": "#1a47a0",
  "athletic heather": "#b0b0b0",
  "heather": "#b0b0b0",
  "navy": "#001f3f",
  "gold": "#ffd700",
  "orange": "#ff6b35",
  "maroon": "#800000",
  "forest green": "#228b22",
  "charcoal": "#36454f",
  "light blue": "#add8e6",
  "baby blue": "#89cff0",
  "purple": "#800080",
  "dark heather": "#555555",
  "sport grey": "#999999",
  "ash": "#c0c0c0",
  "sand": "#c2b280",
  "natural": "#f5f5dc",
  "olive": "#808000",
  "military green": "#4b5320",
  "carolina blue": "#56a0d3",
  "sapphire": "#0f52ba",
  "berry": "#8e4585",
  "heliconia": "#f77fbe",
  "lime": "#32cd32",
  "irish green": "#009a44",
  "brown": "#654321",
  "chocolate": "#7b3f00",
  "indigo blue": "#3f51b5",
  "slate": "#708090",
  "cornsilk": "#fff8dc",
  "daisy": "#fff44f",
  "turf green": "#3b7a57",
  "ice grey": "#d1d5db",
  "stone blue": "#6f8faf",
  "sunset": "#faa460",
  "antique cherry red": "#cd5c5c",
  "light pink": "#ffb6c1",
  "dark chocolate": "#3c1414",
  "rusty bronze": "#a0522d",
  "midnight navy": "#003366",
  "silver": "#c0c0c0",
};

function getColorHex(colorName: string): string | null {
  const key = colorName.toLowerCase().trim();
  if (COLOR_HEX_MAP[key]) return COLOR_HEX_MAP[key];
  for (const [name, hex] of Object.entries(COLOR_HEX_MAP)) {
    if (key.includes(name) || name.includes(key)) return hex;
  }
  return null;
}

const PDP_HERO_PRELOAD_ATTRIBUTE = "data-pdp-hero-preload";
const PRERENDERED_PRODUCT_DATA_SELECTOR = 'script[data-prerendered-product="true"]';
type PrerenderedProduct = Product & {
  availableFits?: FitType[];
  selectedFit?: FitType;
};

function readPrerenderedProduct(root: ParentNode, expectedId: string | undefined): PrerenderedProduct | undefined {
  const serializedProduct = root.querySelector(PRERENDERED_PRODUCT_DATA_SELECTOR)?.textContent;
  if (!serializedProduct) return undefined;

  try {
    const product = JSON.parse(serializedProduct) as PrerenderedProduct;
    return String(product.id) === String(expectedId) ? product : undefined;
  } catch {
    return undefined;
  }
}

async function fetchPrerenderedProduct(id: string | undefined): Promise<PrerenderedProduct | undefined> {
  if (!id) return undefined;

  const response = await fetch(`/product/${id}`);
  if (!response.ok) return undefined;

  const documentFragment = new DOMParser().parseFromString(await response.text(), "text/html");
  return readPrerenderedProduct(documentFragment, id);
}

function upsertPdpHeroPreload(imageUrl: string | undefined): HTMLLinkElement | null {
  if (!imageUrl || typeof document === "undefined") return null;

  const imageProps = shopifyImageProps(imageUrl, IMAGE_PRESETS.productDetail);
  let preload = document.head.querySelector<HTMLLinkElement>(
    `link[${PDP_HERO_PRELOAD_ATTRIBUTE}="true"]`,
  );
  const isNewPreload = !preload;
  if (!preload) {
    preload = document.createElement("link");
  }

  preload.href = imageProps.src;
  preload.as = "image";
  preload.setAttribute("fetchpriority", "high");
  preload.setAttribute(PDP_HERO_PRELOAD_ATTRIBUTE, "true");

  if (imageProps.srcSet && imageProps.sizes) {
    preload.setAttribute("imagesrcset", imageProps.srcSet);
    preload.setAttribute("imagesizes", imageProps.sizes);
  } else {
    preload.removeAttribute("imagesrcset");
    preload.removeAttribute("imagesizes");
  }
  preload.rel = "preload";
  if (isNewPreload) document.head.appendChild(preload);

  return preload;
}

function usePdpHeroPreload(imageUrl: string | undefined): void {
  useEffect(() => {
    const preload = upsertPdpHeroPreload(imageUrl);
    return () => preload?.remove();
  }, [imageUrl]);
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const { addToCart, isAdding } = useCart();
  const { toast } = useToast();
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [displayImage, setDisplayImage] = useState<string>("");
  const [imageFading, setImageFading] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const [activeFit, setActiveFit] = useState<FitType | null>(null);
  const [fitProductId, setFitProductId] = useState<number | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [secondaryProductId, setSecondaryProductId] = useState<number | null>(null);
  const prerenderedProduct = typeof document === "undefined"
    ? undefined
    : readPrerenderedProduct(document, id);

  const { data: product, isLoading } = useQuery<PrerenderedProduct>({
    queryKey: ["/api/products", id],
    initialData: prerenderedProduct,
    queryFn: async () => {
      if (!import.meta.env.DEV) {
        const staticProduct = await fetchPrerenderedProduct(id);
        if (staticProduct) {
          upsertPdpHeroPreload(staticProduct.imageUrl);
          return staticProduct;
        }
      }
      const headers: Record<string, string> = {
        "X-Requested-With": "XMLHttpRequest",
        "X-App-Token": import.meta.env.VITE_APP_TOKEN || "msd-storefront-v1",
      };
      const res = await fetch(`/api/products/${id}`, { headers });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      const found = await res.json() as Product;
      upsertPdpHeroPreload(found.imageUrl);
      return found;
    },
  });

  useEffect(() => {
    setSecondaryProductId(null);
    if (!product?.id) return;

    const loadSecondaryContent = () => setSecondaryProductId(product.id);
    const browserWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (browserWindow.requestIdleCallback) {
      const idleHandle = browserWindow.requestIdleCallback(loadSecondaryContent, { timeout: 1000 });
      return () => browserWindow.cancelIdleCallback?.(idleHandle);
    }

    const timeoutHandle = window.setTimeout(loadSecondaryContent, 250);
    return () => window.clearTimeout(timeoutHandle);
  }, [product?.id]);

  const secondaryContentEnabled = secondaryProductId === product?.id;

  const { data: allProducts = [], isFetched: isCatalogFetched } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      if (!import.meta.env.DEV) {
        try {
          const staticRes = await fetch("/data/products.json");
          if (staticRes.ok) {
            const data = await staticRes.json();
            if (Array.isArray(data) && data.length > 0) return data;
          }
        } catch {}
      }
      const headers: Record<string, string> = {
        "X-Requested-With": "XMLHttpRequest",
        "X-App-Token": import.meta.env.VITE_APP_TOKEN || "msd-storefront-v1",
      };
      const res = await fetch("/api/products", { headers });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    enabled: secondaryContentEnabled,
  });

  const activeProductId = product?.id;

  const { data: colorImagesData } = useQuery<{ colorImages: Record<string, string>; cached: boolean }>({
    queryKey: ["/api/products", activeProductId, "color-images"],
    enabled: !!activeProductId && secondaryContentEnabled,
  });

  usePageTitle(product?.name || "Product");

  useEffect(() => {
    if (!product?.id) return;

    const canonicalHref = `https://myshirtsdope.com/product/${product.id}`;
    let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const previousHref = canonical?.getAttribute("href");
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalHref;

    return () => {
      if (!canonical) return;
      if (previousHref) canonical.href = previousHref;
      else canonical.remove();
    };
  }, [product?.id]);

  useEffect(() => {
    if (isLoading || product) return;

    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previousContent = robots?.getAttribute("content");
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    robots.content = "noindex, nofollow";

    return () => {
      if (!robots) return;
      if (previousContent) robots.content = previousContent;
      else robots.remove();
    };
  }, [isLoading, product]);

  const group = product && allProducts.length > 0 ? findGroupForProduct(allProducts, Number(id)) : null;
  const hasMutipleFits = group ? group.fits.length > 1 : false;
  const shouldReserveFitSpace = product?.availableFits
    ? product.availableFits.length > 1
    : !isCatalogFetched;

  const productFit: FitType | null = group && product
    ? group.youth?.id === product.id
      ? "youth"
      : group.toddler?.id === product.id
        ? "toddler"
        : "adult"
    : product?.selectedFit ?? null;
  const selectedFit = fitProductId === product?.id ? activeFit : null;
  const effectiveFit = selectedFit ?? productFit ?? "adult";
  const activeProduct = (group ? getProductForFit(group, effectiveFit) : product) as Product | undefined;

  const colorImages = colorImagesData?.colorImages || activeProduct?.colorImages || product?.colorImages || {};

  usePdpHeroPreload(activeProduct?.imageUrl);

  useEffect(() => {
    if (!activeProduct) return;
    trackEvent("ViewContent", {
      content_ids: [String(activeProduct.id)],
      content_name: activeProduct.name,
      content_type: "product",
      value: activeProduct.price,
      currency: "USD",
    });
  }, [activeProduct?.id]);

  useEffect(() => {
    setSelectedSize("");
    setSelectedColor("");
    setDisplayImage("");
  }, [activeFit, fitProductId]);

  useEffect(() => {
    setActiveFit(null);
    setFitProductId(null);
    setSelectedSize("");
    setSelectedColor("");
    setDisplayImage("");
  }, [id]);

  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    const colorImg = colorImages[color];
    if (colorImg && colorImg !== displayImage) {
      setImageFading(true);
      setTimeout(() => {
        setDisplayImage(colorImg);
        setImageFading(false);
      }, 150);
    } else if (!colorImg) {
      setImageFading(true);
      setTimeout(() => {
        setDisplayImage("");
        setImageFading(false);
      }, 150);
    }
  };

  const allGroups = groupProducts(allProducts);
  const related = allGroups
    .filter(
      (g) =>
        g.adult.id !== Number(id) &&
        g.youth?.id !== Number(id) &&
        g.toddler?.id !== Number(id) &&
        g.category === product?.category
    )
    .slice(0, 4);

  const handleFitChange = (newFit: FitType) => {
    if (newFit === effectiveFit) return;
    setTransitioning(true);
    setTimeout(() => {
      setActiveFit(newFit);
      setFitProductId(product?.id ?? null);
      setTransitioning(false);
    }, 150);
  };

  const handleAddToCart = () => {
    if (!activeProduct) return;
    if (!selectedSize || !selectedColor) {
      toast({
        title: "SELECT OPTIONS",
        description: "Please select a size and color before adding to cart.",
        variant: "destructive",
      });
      return;
    }
    addToCart(activeProduct, selectedSize, selectedColor);
    setJustAdded(true);
    toast({
      title: "ITEM ADDED",
      description: `${activeProduct.name} has been added to your cart.`,
    });
    setTimeout(() => setJustAdded(false), 2000);
    trackEvent("AddToCart", {
      content_name: activeProduct.name,
      content_ids: [String(activeProduct.id)],
      content_type: "product",
      value: activeProduct.price,
      currency: "USD",
    });
  };

  if (isLoading) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 py-10">
        <div className="flex flex-col md:flex-row items-start gap-6 md:gap-10">
          <Skeleton className="w-full md:max-w-[320px] aspect-square rounded-md" data-testid="product-hero-skeleton" />
          <div className="flex-1 space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-5 w-1/4" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!product || !activeProduct) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="font-pixel text-sm text-neon-blue mb-4">ITEM NOT FOUND</p>
          <Link href="/shop">
            <Button variant="outline" className="font-pixel text-[10px]">
              BACK TO SHOP
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="retro-divider" />
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 py-10">
        <Link href="/shop" data-testid="link-back-shop">
          <Button variant="ghost" size="sm" className="mb-6 font-display text-sm gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Shop
          </Button>
        </Link>

        <div className="flex flex-col md:flex-row items-start gap-6 md:gap-10">
          <div className="w-full md:max-w-[320px] flex-shrink-0">
            <div className="relative aspect-square bg-card border border-card-border rounded-md overflow-hidden" data-testid="product-hero-image-container">
              <img
                {...shopifyImageProps(displayImage || activeProduct.imageUrl, IMAGE_PRESETS.productDetail)}
                alt={activeProduct.name}
                className={`w-full h-full object-contain transition-opacity duration-150 ${imageFading ? "opacity-0" : "opacity-100"}`}
                loading="eager"
                {...({ fetchpriority: "high" } as Record<string, string>)}
              />
              {activeProduct.isNewDrop && (
                <div className="absolute top-3 left-3">
                  <Badge className="font-pixel text-[7px] bg-neon-green text-black border-transparent no-default-hover-elevate">
                    NEW DROP
                  </Badge>
                </div>
              )}
              <div className="scanline-overlay opacity-30" />
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-5">
            <div>
              {activeProduct.badge && (
                <span className="font-display text-xs text-neon-orange mb-1.5 block">{activeProduct.badge}</span>
              )}
              <h1 className="font-display text-2xl sm:text-3xl text-foreground mb-1.5" data-testid="text-product-name">
                {activeProduct.name}
              </h1>
              <div className="min-h-[44px] flex items-center" data-testid="product-price-container">
                <p className="font-pixel text-sm text-neon-yellow neon-text-yellow" data-testid="text-product-price">
                  ${activeProduct.price.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="hidden md:block">
              <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-product-description">
                {activeProduct.description}
              </p>
            </div>

            <div className={shouldReserveFitSpace ? "min-h-[68px]" : undefined}>
              {hasMutipleFits && group && (
                <div>
                  <label className="font-pixel text-[8px] text-muted-foreground block mb-2">SELECT FIT</label>
                  <div className="flex flex-wrap gap-2">
                    {group.fits.map((fit) => (
                      <button
                        key={fit}
                        onClick={() => handleFitChange(fit)}
                        data-testid={`button-fit-${fit}`}
                        className={`font-display text-xs px-3 py-1.5 min-h-[44px] rounded-md border transition-all ${
                          effectiveFit === fit
                            ? "bg-neon-green/20 border-neon-green text-neon-green"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {getFitLabel(fit)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={`transition-opacity duration-150 ${transitioning ? "opacity-0" : "opacity-100"}`}>
              <div>
                <label className="font-pixel text-[8px] text-muted-foreground block mb-2">SELECT SIZE</label>
                <div className="min-h-[44px] flex flex-wrap gap-1.5">
                  {activeProduct.sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      data-testid={`button-size-${size}`}
                      className={`font-display text-xs px-3 py-1.5 min-h-[44px] rounded-md border transition-all ${
                        selectedSize === size
                          ? "bg-neon-blue/20 border-neon-blue text-neon-blue"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <label className="font-pixel text-[8px] text-muted-foreground block mb-2">SELECT COLOR</label>
                <div className="min-h-[44px] flex flex-wrap gap-1.5">
                  {activeProduct.colors.map((color) => {
                    const hex = getColorHex(color);
                    const previewImg = colorImages[color];
                    return (
                      <button
                        key={color}
                        onClick={() => handleColorSelect(color)}
                        data-testid={`button-color-${color}`}
                        className={`font-display text-xs px-3 py-1.5 min-h-[44px] rounded-md border transition-all flex items-center gap-1.5 ${
                          selectedColor === color
                            ? "bg-neon-yellow/20 border-neon-yellow text-neon-yellow shadow-[0_0_8px_hsl(52_100%_50%/0.3)]"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {previewImg ? (
                          <span
                            className="inline-block w-4 h-4 rounded-full flex-shrink-0 border border-white/20 bg-cover bg-center"
                            style={{ backgroundImage: `url(${shopifyImageUrl(previewImg, 64)})` }}
                          />
                        ) : hex ? (
                          <span
                            className="inline-block w-3 h-3 rounded-full flex-shrink-0 border border-white/20"
                            style={{ backgroundColor: hex }}
                          />
                        ) : null}
                        {color}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <details className="md:hidden border border-card-border rounded-md overflow-hidden" data-testid="details-product-description">
              <summary className="font-pixel text-[9px] text-neon-blue px-4 py-3 cursor-pointer select-none">
                DETAILS
              </summary>
              <p className="text-sm text-muted-foreground leading-relaxed px-4 pb-4" data-testid="text-product-description-mobile">
                {activeProduct.description}
              </p>
            </details>

            <div className="retro-divider my-1" />

            <Button
              onClick={handleAddToCart}
              disabled={isAdding || justAdded}
              data-testid="button-add-to-cart"
              className={`font-pixel text-[10px] py-5 min-h-[44px] gap-3 no-default-hover-elevate no-default-active-elevate transition-all active:scale-[0.97] ${
                justAdded
                  ? "bg-neon-green border-neon-green text-black"
                  : "bg-neon-blue border-neon-blue text-white hover:shadow-[0_0_20px_hsl(200_100%_55%/0.6)]"
              }`}
            >
              {justAdded ? <Check className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
              {justAdded ? "ADDED!" : "ADD TO CART"}
            </Button>
          </div>
        </div>

        {related.length > 0 && (
          <div className="mt-14">
            <h2 className="font-pixel text-[10px] text-neon-green neon-text-green mb-6">
              MORE FROM THE COLLECTION
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin">
              {related.map((g) => (
                <Link key={g.adult.id} href={`/product/${g.adult.id}`} data-testid={`link-related-${g.adult.id}`}>
                  <div className="bg-card border border-card-border rounded-md overflow-hidden hover-elevate cursor-pointer flex-shrink-0" style={{ width: "180px" }}>
                    <div className="overflow-hidden" style={{ height: "180px" }}>
                      <img
                        {...shopifyImageProps(g.adult.imageUrl, IMAGE_PRESETS.relatedCard)}
                        alt={g.adult.name}
                        width={180}
                        height={180}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-2">
                      <p className="font-display text-xs text-card-foreground line-clamp-1">{g.adult.name}</p>
                      <p className="font-pixel text-[8px] text-neon-yellow mt-0.5">${g.adult.price.toFixed(2)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
