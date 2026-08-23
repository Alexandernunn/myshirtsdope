import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/lib/cart-context";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import Home from "@/pages/home";
import { Volume2, VolumeX } from "lucide-react";
import { queueGooglePageView } from "@/lib/marketing-scripts";
import { trackEvent } from "@/lib/meta-capi";

const loadShop = () => import("@/pages/shop");
const loadProductDetail = () => import("@/pages/product-detail");
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

function Router() {
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
        <Route path="/shop" component={Shop} />
        <Route path="/product/:id" component={ProductDetail} />
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
  const [muted, setMuted] = useState(false);
  const startedRef = useRef(false);

  // The audio file is NOT downloaded on page load: the <audio> element starts
  // with no src and preload="none". The src is attached on the user's first
  // interaction (the same moment playback could actually begin under browser
  // autoplay policies), mirroring the marketing-script deferral pattern.
  const tryPlay = () => {
    const audio = audioRef.current;
    if (!audio || startedRef.current) return;
    if (!audio.getAttribute("src")) {
      audio.setAttribute("src", BACKGROUND_MUSIC_SRC);
      audio.load();
    }
    audio.play().then(() => {
      startedRef.current = true;
    }).catch(() => {});
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onInteraction = () => {
      tryPlay();
    };

    document.addEventListener("click", onInteraction, { once: true });
    document.addEventListener("touchstart", onInteraction, { once: true });
    document.addEventListener("keydown", onInteraction, { once: true });

    return () => {
      document.removeEventListener("click", onInteraction);
      document.removeEventListener("touchstart", onInteraction);
      document.removeEventListener("keydown", onInteraction);
    };
  }, []);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (muted) {
      audio.muted = false;
      setMuted(false);
      tryPlay();
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
        aria-label={muted ? "Unmute background music" : "Mute background music"}
        title={muted ? "Unmute background music" : "Mute background music"}
        className="fixed bottom-5 right-5 z-50 w-10 h-10 rounded-full bg-background/80 border border-neon-blue/40 backdrop-blur-sm flex items-center justify-center text-neon-blue hover:bg-neon-blue/10 transition-colors shadow-lg"
      >
        {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
      </button>
    </>
  );
}

function App() {
  usePageTracking();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
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
        </CartProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
