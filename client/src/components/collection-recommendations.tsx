import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import type { CollectionRecommendations } from "@shared/collection-recommendations";
import { IMAGE_PRESETS, shopifyImageProps } from "@shared/shopify-image";

export function CollectionRecommendationRow({
  data,
}: {
  data: CollectionRecommendations | undefined;
}) {
  if (!data || data.cards.length === 0) return null;

  const collectionHref = `/shop?${new URLSearchParams({ category: data.category }).toString()}`;

  return (
    <div className="mt-14" data-testid="collection-recommendations">
      <h2 className="font-pixel text-[10px] text-neon-green neon-text-green mb-6">
        <Link href={collectionHref} data-testid="link-collection-heading">
          MORE FROM THE COLLECTION
        </Link>
      </h2>
      <div className="grid grid-cols-2 gap-3 pb-4 sm:flex sm:gap-3 sm:overflow-x-auto sm:scrollbar-thin">
        {data.cards.map((card) => (
          <Link
            key={card.id}
            href={card.href}
            data-testid={`link-related-${card.id}`}
            className="min-w-0 sm:flex-shrink-0"
          >
            <div className="w-full min-w-0 bg-card border border-card-border rounded-md overflow-hidden hover-elevate cursor-pointer sm:w-[180px] sm:flex-shrink-0">
              <div className="aspect-square overflow-hidden sm:h-[180px] sm:aspect-auto">
                <img
                  {...shopifyImageProps(card.imageUrl, IMAGE_PRESETS.relatedCard)}
                  alt={card.color ? `${card.name} — ${card.color}` : card.name}
                  width={180}
                  height={180}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="p-2">
                <p className="font-display text-xs text-card-foreground line-clamp-1">{card.name}</p>
                <p className="font-pixel text-[8px] text-neon-yellow mt-0.5">${card.price.toFixed(2)}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <Button
        asChild
        variant="outline"
        className="mt-2 font-pixel text-[9px] text-neon-green border-neon-green"
      >
        <Link href={collectionHref} data-testid="link-shop-all-category">
          Shop all {data.category} →
        </Link>
      </Button>
    </div>
  );
}
