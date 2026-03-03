import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2, ArrowLeft, ShoppingCart, Loader2 } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageTitle } from "@/hooks/use-page-title";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function Cart() {
  usePageTitle("Cart");
  const { items, isLoading, totalItems, totalPrice, removeFromCart, updateQuantity, clearCart } = useCart();
  const { toast } = useToast();
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const handleCheckout = async () => {
    setIsCheckingOut(true);
    try {
      const sessionId = localStorage.getItem("msd_session");
      if (!sessionId) {
        toast({ title: "Error", description: "No session found. Please try again.", variant: "destructive" });
        return;
      }
      const res = await apiRequest("POST", "/api/checkout", { sessionId });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({ title: "Error", description: "Could not create checkout. Please try again.", variant: "destructive" });
      }
    } catch (error: any) {
      const message = error?.message || "Checkout failed. Please try again.";
      toast({ title: "Checkout Error", description: message, variant: "destructive" });
    } finally {
      setIsCheckingOut(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Skeleton className="h-8 w-48 mb-8" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full mb-4" />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="retro-divider" />
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
          <h1 className="font-pixel text-lg text-neon-yellow neon-text-yellow">
            INVENTORY
          </h1>
          <span className="font-display text-base text-muted-foreground">
            {totalItems} {totalItems === 1 ? "Item" : "Items"}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-20 bg-card border border-card-border rounded-md">
            <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="font-pixel text-[10px] text-muted-foreground mb-2">YOUR INVENTORY IS EMPTY</p>
            <p className="font-display text-base text-muted-foreground mb-6">Add some gear to get started.</p>
            <Link href="/shop" data-testid="link-empty-shop">
              <Button className="font-pixel text-[10px] bg-neon-blue border-neon-blue text-white no-default-hover-elevate no-default-active-elevate hover:shadow-[0_0_20px_hsl(200_100%_55%/0.6)] transition-all active:scale-[0.97]">
                BROWSE SHOP
              </Button>
            </Link>
          </div>
        ) : (
          <div>
            <div className="space-y-4 mb-8">
              {items.map((item) => (
                <div
                  key={item.id}
                  data-testid={`cart-item-${item.id}`}
                  className="bg-card border border-card-border rounded-md p-4 flex items-center gap-4"
                >
                  <Link href={`/product/${item.productId}`}>
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-md overflow-hidden bg-muted flex-shrink-0 cursor-pointer">
                      <img
                        src={item.product.colorImages?.[item.color] || item.product.imageUrl}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </Link>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-display text-base text-card-foreground truncate">{item.product.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Size: {item.size} &middot; Color: {item.color}
                    </p>
                    <p className="font-pixel text-[10px] text-neon-yellow mt-1">
                      ${item.product.price.toFixed(2)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      data-testid={`button-decrease-${item.id}`}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="font-pixel text-[10px] w-6 text-center" data-testid={`text-quantity-${item.id}`}>
                      {item.quantity}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      data-testid={`button-increase-${item.id}`}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFromCart(item.id)}
                    data-testid={`button-remove-${item.id}`}
                    className="text-destructive flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="bg-card border border-card-border rounded-md p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="font-display text-base text-muted-foreground">Subtotal</span>
                <span className="font-pixel text-sm text-neon-yellow neon-text-yellow">
                  ${totalPrice.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4 mb-6">
                <span className="font-display text-base text-muted-foreground">Shipping</span>
                <span className="font-display text-base text-muted-foreground">Calculated at checkout</span>
              </div>

              <div className="border-t border-border pt-4 flex items-center justify-between gap-4 mb-6">
                <span className="font-pixel text-[10px] text-foreground">TOTAL</span>
                <span className="font-pixel text-base text-neon-blue neon-text-blue">
                  ${totalPrice.toFixed(2)}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  className="flex-1 font-pixel text-[10px] bg-neon-yellow border-neon-yellow text-black py-5 no-default-hover-elevate no-default-active-elevate hover:shadow-[0_0_20px_hsl(52_100%_50%/0.5)] transition-all active:scale-[0.97]"
                  data-testid="button-checkout"
                  onClick={handleCheckout}
                  disabled={isCheckingOut}
                >
                  {isCheckingOut ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      PROCESSING...
                    </>
                  ) : (
                    "CHECKOUT"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={clearCart}
                  className="font-display text-sm"
                  data-testid="button-clear-cart"
                >
                  Clear All
                </Button>
              </div>
            </div>

            <div className="mt-6">
              <Link href="/shop" data-testid="link-continue-shopping">
                <Button variant="ghost" className="font-display text-sm gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Continue Shopping
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
