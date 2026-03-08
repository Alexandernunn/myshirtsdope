import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { usePageTitle } from "@/hooks/use-page-title";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { groupProducts, interleaveGroups, getFitBadgeLabel, type ProductGroup } from "@/lib/product-grouping";
import type { Product, ProductSummary } from "@shared/schema";

const PRODUCTS_PER_PAGE = 15;

const PLACEHOLDER_WORDS = [
  "Compton",
  "Outkast",
  "East Coast",
  "Detroit",
  "Wu-Tang",
  "Atlanta",
  "Neo Soul",
  "Biggie",
  "West Coast",
  "Aaliyah",
  "New York",
  "Hoodies",
  "Houston",
  "Hip Hop",
  "Miami",
  "R&B",
];

function useTypingPlaceholder() {
  const [placeholder, setPlaceholder] = useState("Search...");
  const wordIndex = useRef(0);
  const charIndex = useRef(0);
  const isDeleting = useRef(false);
  const isPaused = useRef(false);
  const isFocused = useRef(false);
  const hasInput = useRef(false);

  const tick = useCallback(() => {
    if (isFocused.current || hasInput.current) return;

    const currentWord = PLACEHOLDER_WORDS[wordIndex.current];

    if (isPaused.current) return;

    if (!isDeleting.current) {
      charIndex.current++;
      setPlaceholder("Search " + currentWord.substring(0, charIndex.current) + "...");

      if (charIndex.current === currentWord.length) {
        isPaused.current = true;
        setTimeout(() => {
          isPaused.current = false;
          isDeleting.current = true;
        }, 1800);
      }
    } else {
      charIndex.current--;
      setPlaceholder("Search " + currentWord.substring(0, charIndex.current) + "...");

      if (charIndex.current === 0) {
        isDeleting.current = false;
        wordIndex.current = (wordIndex.current + 1) % PLACEHOLDER_WORDS.length;
      }
    }
  }, []);

  const setFocused = useCallback((focused: boolean) => {
    isFocused.current = focused;
    if (focused) {
      setPlaceholder("Search...");
    }
  }, []);

  const setHasInput = useCallback((has: boolean) => {
    hasInput.current = has;
  }, []);

  useEffect(() => {
    const id = setInterval(tick, 80);
    return () => clearInterval(id);
  }, [tick]);

  return { placeholder, setFocused, setHasInput };
}

const categories = ["All", "Shirts", "Hoodies", "Onesies", "Accessories"];

const categoryColors: Record<string, string> = {
  "All": "text-foreground",
  "Shirts": "text-neon-blue",
  "Hoodies": "text-neon-yellow",
  "Onesies": "text-neon-green",
  "Accessories": "text-neon-orange",
};

const badgeColors: Record<string, string> = {
  "Hip Hop": "bg-neon-blue/20 text-neon-blue",
  "R&B": "bg-neon-yellow/20 text-neon-yellow",
  "Soul": "bg-neon-cyan/20 text-neon-cyan",
  "Love": "bg-neon-green/20 text-neon-green",
  "Culture": "bg-neon-orange/20 text-neon-orange",
  "Pop": "bg-purple-500/20 text-purple-400",
};

function GroupedProductCard({ group }: { group: ProductGroup }) {
  const product = group.adult;
  return (
    <Link href={`/product/${product.id}`} data-testid={`link-product-${product.id}`}>
      <div className="group bg-card border border-card-border rounded-md overflow-visible hover-elevate active-elevate-2 transition-transform duration-200 cursor-pointer">
        <div className="relative overflow-hidden rounded-t-md bg-muted" style={{ aspectRatio: "1", maxHeight: "220px" }}>
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />

          {product.isNewDrop && (
            <div className="absolute top-1.5 left-1.5">
              <Badge className="font-pixel text-[6px] bg-neon-green text-black border-transparent no-default-hover-elevate px-1.5 py-0.5">
                NEW DROP
              </Badge>
            </div>
          )}

          {product.badge && (
            <div className="absolute top-1.5 right-1.5">
              <Badge className={`font-pixel text-[6px] border-transparent no-default-hover-elevate px-1.5 py-0.5 ${badgeColors[product.badge] || "bg-secondary text-secondary-foreground"}`}>
                {product.badge}
              </Badge>
            </div>
          )}

          {getFitBadgeLabel(group.fits) && (
            <div className="absolute bottom-1.5 left-1.5">
              <Badge className="font-pixel text-[5px] bg-neon-blue/30 text-neon-blue border-transparent no-default-hover-elevate px-1.5 py-0.5">
                {getFitBadgeLabel(group.fits)}
              </Badge>
            </div>
          )}

          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
            <span className="font-pixel text-[8px] text-neon-yellow neon-text-yellow">
              VIEW ITEM
            </span>
          </div>
        </div>

        <div className="p-2.5">
          <h3 className="font-display text-xs text-card-foreground mb-0.5 line-clamp-1">{product.name}</h3>
          <p className="font-pixel text-[9px] text-neon-yellow">${product.price.toFixed(2)}</p>
        </div>
      </div>
    </Link>
  );
}

function ProductSkeleton() {
  return (
    <div className="bg-card border border-card-border rounded-md overflow-hidden">
      <div style={{ aspectRatio: "1", maxHeight: "220px" }}>
        <Skeleton className="w-full h-full" />
      </div>
      <div className="p-2.5 space-y-1.5">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-2.5 w-1/4" />
      </div>
    </div>
  );
}

export default function Shop() {
  usePageTitle("Shop");
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const activeCategory = params.get("category") || "All";
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const { placeholder: typingPlaceholder, setFocused, setHasInput } = useTypingPlaceholder();

  const [initialSource, setInitialSource] = useState<"chunk" | "full">("chunk");

  const { data: initialProducts = [], isLoading } = useQuery<(Product | ProductSummary)[]>({
    queryKey: ["/api/products/listing-initial"],
    queryFn: async () => {
      try {
        const staticRes = await fetch("/data/products-slim-1.json");
        if (staticRes.ok) {
          const data = await staticRes.json();
          if (Array.isArray(data) && data.length > 0) {
            setInitialSource("chunk");
            return data;
          }
        }
      } catch {}
      setInitialSource("full");
      const res = await fetch("/api/products/slim", {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "X-App-Token": import.meta.env.VITE_APP_TOKEN || "msd-storefront-v1",
        },
      });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
  });

  const needsRest = initialSource === "chunk" && initialProducts.length > 0;

  const { data: restProducts = [], isLoading: loadingRest } = useQuery<(Product | ProductSummary)[]>({
    queryKey: ["/api/products/listing-rest"],
    enabled: needsRest,
    queryFn: async () => {
      try {
        const staticRes = await fetch("/data/products-slim-rest.json");
        if (staticRes.ok) {
          const data = await staticRes.json();
          if (Array.isArray(data) && data.length > 0) return data;
        }
      } catch {}
      const res = await fetch("/api/products/slim", {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "X-App-Token": import.meta.env.VITE_APP_TOKEN || "msd-storefront-v1",
        },
      });
      if (!res.ok) return [];
      const allData = await res.json();
      if (Array.isArray(allData)) return allData.slice(initialProducts.length);
      return [];
    },
  });

  const products = needsRest && restProducts.length > 0
    ? [...initialProducts, ...restProducts]
    : initialProducts;

  const allGroups = groupProducts(products);

  const filtered = allGroups.filter((g) => {
    const matchesCategory = activeCategory === "All" || g.category === activeCategory;
    if (searchQuery === "") return matchesCategory;
    const q = searchQuery.toLowerCase();
    const matchesName =
      g.adult.name.toLowerCase().includes(q) ||
      (g.youth?.name.toLowerCase().includes(q) ?? false);
    const matchesTags =
      g.adult.tags?.some(tag => tag.toLowerCase().includes(q)) ?? false;
    const matchesColors =
      g.adult.colors?.some(c => c.toLowerCase().includes(q)) ?? false;
    return matchesCategory && (matchesName || matchesTags || matchesColors);
  });

  const displayGroups = activeCategory === "All" ? interleaveGroups(filtered) : filtered;

  const totalPages = Math.max(1, Math.ceil(displayGroups.length / PRODUCTS_PER_PAGE));
  const paginatedGroups = displayGroups.slice(
    (currentPage - 1) * PRODUCTS_PER_PAGE,
    currentPage * PRODUCTS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeCategory, searchQuery]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goToPage = (page: number) => {
    setCurrentPage(page);
    scrollToTop();
  };

  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="min-h-screen">
      <div className="retro-divider" />

      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 py-10">
        <div className="text-center mb-8">
          <h1 className="font-pixel text-base sm:text-lg text-neon-blue neon-text-blue mb-2">
            THE SHOP
          </h1>
          <p className="font-display text-base text-muted-foreground">
            Culture you can wear. Browse our collection.
          </p>
        </div>

        <div className="relative max-w-sm mx-auto mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder={searchQuery ? "" : typingPlaceholder}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setHasInput(e.target.value.length > 0);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              setHasInput(searchQuery.length > 0);
            }}
            className="pl-10 bg-card border-card-border font-display text-sm"
            data-testid="input-search"
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
          {categories.map((cat) => (
            <Link
              key={cat}
              href={cat === "All" ? "/shop" : `/shop?category=${cat}`}
              data-testid={`button-filter-${cat.toLowerCase()}`}
            >
              <button className={`font-display text-xs px-3 py-1.5 rounded-md border transition-all ${
                activeCategory === cat
                  ? "bg-secondary border-border text-foreground"
                  : "border-transparent text-muted-foreground"
              } ${categoryColors[cat] || ""}`}>
                {cat.toUpperCase()}
              </button>
            </Link>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {Array.from({ length: PRODUCTS_PER_PAGE }).map((_, i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-pixel text-[10px] text-muted-foreground">NO ITEMS FOUND</p>
            <p className="font-display text-sm text-muted-foreground mt-2">Check back soon for new drops.</p>
          </div>
        ) : (
          <>
            <p className="font-display text-xs text-muted-foreground text-center mb-4" data-testid="text-product-count">
              Showing {(currentPage - 1) * PRODUCTS_PER_PAGE + 1}-{Math.min(currentPage * PRODUCTS_PER_PAGE, displayGroups.length)} of {loadingRest && needsRest ? `${displayGroups.length}+` : displayGroups.length} items
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {paginatedGroups.map((group) => (
                <GroupedProductCard key={group.adult.id} group={group} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-8" data-testid="pagination-controls">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  data-testid="button-page-prev"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                {getPageNumbers().map((page, idx) =>
                  page === "..." ? (
                    <span key={`ellipsis-${idx}`} className="font-display text-sm text-muted-foreground px-1">
                      ...
                    </span>
                  ) : (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => goToPage(page as number)}
                      data-testid={`button-page-${page}`}
                    >
                      <span className="font-display text-sm">{page}</span>
                    </Button>
                  )
                )}

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  data-testid="button-page-next"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
