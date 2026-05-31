import { useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/use-page-title";
import { ShoppingBag, CheckCircle } from "lucide-react";

export default function OrderConfirmation() {
  usePageTitle("Order Confirmed");
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const value = parseFloat(params.get("value") || "0");
  const currency = params.get("currency") || "USD";
  const items = parseInt(params.get("items") || "0", 10);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    import("@/lib/meta-capi").then(({ trackEvent }) => {
      trackEvent("Purchase", {
        value: value || undefined,
        currency,
        content_type: "product",
        num_items: items || undefined,
      });
    });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full mx-auto px-6 text-center">
        <CheckCircle className="w-16 h-16 text-neon-green mx-auto mb-6" style={{ filter: "drop-shadow(0 0 8px #39ff14)" }} />

        <h1 className="font-pixel text-sm sm:text-base text-neon-green mb-3" style={{ textShadow: "0 0 12px #39ff14" }}>
          ORDER CONFIRMED!
        </h1>

        <p className="font-display text-base text-muted-foreground mb-2">
          Thanks for shopping with MyShirtsDope.
        </p>
        <p className="font-display text-sm text-muted-foreground mb-8">
          You'll receive a confirmation email from Shopify with your order details and tracking info.
        </p>

        {value > 0 && (
          <p className="font-pixel text-[10px] text-neon-yellow mb-8">
            ORDER TOTAL: ${value.toFixed(2)} {currency}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/shop">
            <Button className="font-pixel text-[10px] w-full sm:w-auto" data-testid="button-continue-shopping">
              <ShoppingBag className="w-3 h-3 mr-2" />
              KEEP SHOPPING
            </Button>
          </Link>
          <Link href="/">
            <Button variant="outline" className="font-pixel text-[10px] w-full sm:w-auto" data-testid="button-go-home">
              HOME
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
