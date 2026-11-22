import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getShopifyVariantTrackingData, trackEvent } from "@/lib/meta-capi";

// Shared by the cart page and the product-page confirmation.
export function useCartCheckout() {
  const { items } = useCart();
  const { toast } = useToast();
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const handleCheckout = async () => {
    if (isCheckingOut) return;
    setIsCheckingOut(true);
    try {
      const lineItems: {
        variantId: string;
        quantity: number;
        tracking: ReturnType<typeof getShopifyVariantTrackingData>;
      }[] = [];
      const unmapped: string[] = [];

      for (const item of items) {
        const variants = item.product.shopifyVariants;
        if (!variants || variants.length === 0) {
          unmapped.push(item.product.name);
          continue;
        }
        const variant = variants.find((v) => v.size === item.size && v.color === item.color);
        if (variant) {
          lineItems.push({
            variantId: variant.variantId,
            quantity: item.quantity,
            tracking: getShopifyVariantTrackingData(variant.variantId, variant.price),
          });
        } else {
          unmapped.push(`${item.product.name} (${item.size}/${item.color})`);
        }
      }

      if (lineItems.length === 0) {
        toast({ title: "Error", description: "No items could be matched for checkout.", variant: "destructive" });
        return;
      }
      if (unmapped.length > 0) {
        toast({
          title: "Cart needs review",
          description: `Remove and re-add: ${unmapped.join(", ")}`,
          variant: "destructive",
        });
        return;
      }

      const allTrackingDataValid = lineItems.every((item) => item.tracking !== null);
      const cartValue = lineItems.reduce(
        (sum, item) => sum + (item.tracking?.value ?? 0) * item.quantity,
        0,
      );
      const cartIds = lineItems.flatMap((item) =>
        item.tracking ? [item.tracking.contentId] : [],
      );
      if (allTrackingDataValid) {
        trackEvent("InitiateCheckout", {
          content_ids: cartIds,
          content_type: "product",
          value: cartValue,
          currency: "USD",
          num_items: items.reduce((s, i) => s + i.quantity, 0),
        });
      }

      const res = await apiRequest("POST", "/api/checkout", {
        lineItems: lineItems.map(({ variantId, quantity }) => ({ variantId, quantity })),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        const returnUrl = `${window.location.origin}/order-confirmation?value=${cartValue.toFixed(2)}&currency=USD&items=${cartIds.length}`;
        const checkoutWithReturn = `${data.checkoutUrl}${data.checkoutUrl.includes("?") ? "&" : "?"}return_url=${encodeURIComponent(returnUrl)}`;
        window.location.href = checkoutWithReturn;
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

  return { handleCheckout, isCheckingOut };
}
