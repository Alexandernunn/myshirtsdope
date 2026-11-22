import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link } from "wouter";
import { Check, X } from "lucide-react";

type ProductAddedItem = {
  name: string;
  imageUrl: string;
  size: string;
  color: string;
  price: number;
};

type ProductAddedPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ProductAddedItem | null;
  totalItems: number;
  onCheckout: () => void;
  isCheckingOut: boolean;
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function ProductAddedPanel({
  open,
  onOpenChange,
  item,
  totalItems,
  onCheckout,
  isCheckingOut,
}: ProductAddedPanelProps) {
  const itemCount = Math.max(0, totalItems);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-[#07090b]/65 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out duration-200 motion-reduce:animate-none motion-reduce:transition-none" />
        <DialogPrimitive.Content
          aria-describedby="product-added-description"
          className="msd-added-panel fixed right-6 top-6 z-[91] max-h-[calc(100dvh-3rem)] overflow-y-auto w-[min(430px,calc(100vw-3rem))] rounded-md border border-[#2b393d] bg-[#111719] text-[#f1f4e8] shadow-[0_22px_80px_rgba(0,0,0,0.55)] outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out data-[state=open]:slide-in-from-right-4 data-[state=closed]:slide-out-to-right-4 duration-200"
        >
          <div className="h-[3px] bg-[linear-gradient(90deg,#42e7eb_0%,#42e7eb_48%,#f4df45_72%,#78ef68_100%)]" />
          <div className="px-6 pb-6 pt-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogPrimitive.Title className="flex items-center gap-2.5 font-pixel text-[10px] leading-relaxed tracking-[0.02em] text-[#eaf3e6]">
                  <span className="flex h-[19px] w-[19px] shrink-0 items-center justify-center border border-[#80ed75]/50 bg-[#80ed75]/10 text-[#80ed75]">
                    <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
                  </span>
                  Added to your cart
                </DialogPrimitive.Title>
                <p
                  id="product-added-description"
                  className="ml-[29px] mt-1 font-display text-[13px] text-[#a5b5b1]"
                >
                  {itemCount} {itemCount === 1 ? "piece" : "pieces"} in the mix
                </p>
              </div>
              <DialogPrimitive.Close
                aria-label="Close cart confirmation"
                className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#354448] text-[#b9c9c4] transition-colors hover:border-[#42e7eb] hover:text-[#42e7eb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#42e7eb]"
              >
                <X aria-hidden="true" className="h-[18px] w-[18px]" />
              </DialogPrimitive.Close>
            </div>

            {item ? (
              <div className="mt-5 grid grid-cols-[104px_1fr] gap-4 border-y border-[#293639] py-4">
                <div className="relative aspect-square overflow-hidden border border-[#293639] bg-[#191f21]">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-full w-full object-contain p-1"
                    loading="eager"
                    width={104}
                    height={104}
                  />
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-25 scanline-overlay" />
                </div>
                <div className="flex min-w-0 flex-col">
                  <h2 className="font-display text-[17px] leading-snug text-[#f4f3e8]">{item.name}</h2>
                  <p className="mt-1.5 font-sans text-[13px] text-[#a4b3ae]">{item.color}</p>
                  <p className="mt-1 font-sans text-[13px] text-[#a4b3ae]">Size {item.size}</p>
                  <p className="mt-auto pt-2 font-pixel text-[10px] text-[#f4df45]">
                    {usd.format(Number.isFinite(item.price) ? item.price : 0)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-5 border-y border-[#293639] py-5 font-display text-sm text-[#a4b3ae]">
                Your new favorite is in the cart.
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2.5">
              <Link
                href="/cart"
                onClick={() => onOpenChange(false)}
                className="flex min-h-12 items-center justify-center border border-[#42e7eb]/70 bg-[#42e7eb]/[0.07] px-4 font-pixel text-[9px] text-[#65edf0] transition-colors hover:border-[#42e7eb] hover:bg-[#42e7eb]/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#42e7eb]"
              >
                View Cart <span className="ml-2 text-[#a6c9c7]">({itemCount})</span>
              </Link>
              <button
                type="button"
                onClick={onCheckout}
                disabled={isCheckingOut}
                className="flex min-h-12 items-center justify-center border border-[#e4d53e] bg-[#e4d53e] px-4 font-pixel text-[9px] text-[#171b15] transition-colors hover:bg-[#f1e859] disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e4d53e] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111719]"
              >
                {isCheckingOut ? "Opening checkout…" : "Checkout"}
              </button>
            </div>

            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mx-auto mt-4 block min-h-8 px-3 font-display text-[13px] text-[#a4b3ae] underline decoration-[#526260] underline-offset-4 transition-colors hover:text-[#f1f4e8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#42e7eb]"
            >
              Continue shopping
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .msd-added-panel,
          .msd-added-panel + * {
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
        @media (max-width: 767px) {
          .msd-added-panel {
            right: 1rem;
            top: 1rem;
            width: calc(100vw - 2rem);
          }
        }
      `}</style>
    </DialogPrimitive.Root>
  );
}
