import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { CartProvider } from "@/lib/cart-context";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import Home, { Start } from "@/pages/home";
import { Volume2, VolumeX } from "lucide-react";
import { queueGooglePageView } from "@/lib/marketing-scripts";
import { trackEvent } from "@/lib/meta-capi";

let preloadedShop: ComponentType | null = null;
let preloadedProductDetail: ComponentType | null = null;

const loadShop = () => import("@/pages/shop").then((module) => {
  preloadedShop = module.default;
  return module;
});
const loadProductDetail = () => import("@/pages/product-detail").then((module) => {
  preloadedProductDetail = module.default;
  return module;
});
const loadCart = () => import("@/pages/cart");
const loadAbout = () => import("@/pages/about");
const loadContact = () => import("@/pages/contact");
const loadOrderConfirmation = () => import("@/pages/order-confirmation");
const loadNotFound = () => import("@/pages/not-found");

const Shop = lazy(loadShop);
const ProductDetail = lazy(loadProductDetail);
const CartPage = lazy(loadCart);
const About = lazy(loadAbout);
const Contact = lazy(loadContact);
const OrderConfirmation = lazy(loadOrderConfirmation);
const NotFound = lazy(loadNotFound);
const DeferredToaster = lazy(() =>
  import("@/components/ui/toaster").then(({ Toaster }) => ({ default: Toaster })),
);

let initialPageViewPath: string | null = null;

function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export function trackInitialPageView(pathname: string): void {
  if (initialPageViewPath !== null) return;

  initialPageViewPath = normalizePathname(pathname);
  queueGooglePageView(pathname);
  trackEvent("PageView");
}

export async function preloadCurrentRoute(pathname: string): Promise<void> {
  const normalizedPath = normalizePathname(pathname);

  if (normalizedPath === "/shop") {
    await loadShop();
  } else if (normalizedPath.startsWith("/product/")) {
    await loadProductDetail();
  } else if (normalizedPath === "/cart") {
    await loadCart();
  } else if (normalizedPath === "/about") {
    await loadAbout();
  } else if (normalizedPath === "/contact") {
    await loadContact();
  } else if (normalizedPath === "/order-confirmation") {
    await loadOrderConfirmation();
  } else if (normalizedPath !== "/") {
    await loadNotFound();
  }
}

function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return null;
}

function usePageTracking() {
  const [location] = useLocation();

  useLayoutEffect(() => {
    if (initialPageViewPath === normalizePathname(location)) {
      initialPageViewPath = null;
      return;
    }

    queueGooglePageView(location);
    trackEvent("PageView");
  }, [location]);
}

function ResolvedProductDetailRoute() {
  const ProductDetailComponent = preloadedProductDetail;
  return ProductDetailComponent ? <ProductDetailComponent /> : <ProductDetail />;
}

function Router() {
  const [location] = useLocation();
  const normalizedPath = normalizePathname(location);

  if (normalizedPath === "/shop" && preloadedShop) {
    const PreloadedShop = preloadedShop;
    return <PreloadedShop />;
  }

  return (
    <Suspense
      fallback={
        <div className="route-loading" role="status" aria-live="polite">
          <span className="route-loading__label">LOADING...</span>
        </div>
      }
    >
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/start" component={Start} />
        <Route path="/shop" component={Shop} />
        <Route path="/product/:id" component={ResolvedProductDetailRoute} />
        <Route path="/cart" component={CartPage} />
        <Route path="/about" component={About} />
        <Route path="/contact" component={Contact} />
        <Route path="/order-confirmation" component={OrderConfirmation} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

const BACKGROUND_MUSIC_SRC = "/bg-music.m4a";

function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [muted, setMuted] = useState(true);

  // The audio file is NOT downloaded on page load: the <audio> element starts
  // with no src and preload="none". Its src is attached only when the visitor
  // explicitly uses the music button, preventing it from competing with LCP.
  const startPlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.getAttribute("src")) {
      audio.setAttribute("src", BACKGROUND_MUSIC_SRC);
      audio.load();
    }
    audio.muted = false;
    audio.play().catch(() => {});
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (muted || !audio.getAttribute("src")) {
      audio.muted = false;
      setMuted(false);
      startPlayback();
    } else {
      audio.muted = true;
      setMuted(true);
    }
  };

  return (
    <>
      <audio ref={audioRef} loop preload="none" />
      <button
        onClick={toggleMute}
        data-testid="button-music-toggle"
        aria-label={muted ? "Play background music" : "Mute background music"}
        title={muted ? "Play background music" : "Mute background music"}
        className="fixed bottom-5 right-5 z-50 w-10 h-10 rounded-full bg-background/80 border border-neon-blue/40 backdrop-blur-sm flex items-center justify-center text-neon-blue hover:bg-neon-blue/10 transition-colors shadow-lg"
      >
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>
    </>
  );
}

function AppToaster() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    const enable = () => {
      if (!active) return;
      active = false;
      interactionEvents.forEach((eventName) => {
        document.removeEventListener(eventName, enable, true);
      });
      setEnabled(true);
    };
    const interactionEvents = ["pointerdown", "touchstart", "keydown", "click"] as const;

    interactionEvents.forEach((eventName) => {
      document.addEventListener(eventName, enable, { capture: true, once: true, passive: true });
    });

    return () => {
      active = false;
      interactionEvents.forEach((eventName) => {
        document.removeEventListener(eventName, enable, true);
      });
    };
  }, []);

  if (!enabled) return null;

  return (
    <Suspense fallback={null}>
      <DeferredToaster />
    </Suspense>
  );
}

function App() {
  usePageTracking();

  return (
    <QueryClientProvider client={queryClient}>
      <CartProvider>
        <div className="min-h-screen flex flex-col bg-background pixel-grid-bg">
          <ScrollToTop />
          <Navbar />
          <main className="flex-1">
            <Router />
          </main>
          <Footer />
        </div>
        <BackgroundMusic />
        <AppToaster />
      </CartProvider>
    </QueryClientProvider>
  );
}

export default App;
