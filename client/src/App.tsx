import { useEffect, useRef, useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/lib/cart-context";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import Home from "@/pages/home";
import Shop from "@/pages/shop";
import ProductDetail from "@/pages/product-detail";
import CartPage from "@/pages/cart";
import About from "@/pages/about";
import Contact from "@/pages/contact";
import NotFound from "@/pages/not-found";
import { Volume2, VolumeX } from "lucide-react";

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
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

  useEffect(() => {
    const gtag = window.gtag;
    if (!gtag) return;
    gtag("config", "G-EV5P2LKEHE", {
      page_path: location.pathname,
    });
  }, [location]);
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/shop" component={Shop} />
      <Route path="/product/:id" component={ProductDetail} />
      <Route path="/cart" component={CartPage} />
      <Route path="/about" component={About} />
      <Route path="/contact" component={Contact} />
      <Route component={NotFound} />
    </Switch>
  );
}

function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [muted, setMuted] = useState(false);
  const startedRef = useRef(false);

  const tryPlay = () => {
    const audio = audioRef.current;
    if (!audio || startedRef.current) return;
    audio.play().then(() => {
      startedRef.current = true;
    }).catch(() => {});
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    tryPlay();

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
      <audio ref={audioRef} src="/bg-music.m4a" loop preload="auto" />
      <button
        onClick={toggleMute}
        data-testid="button-music-toggle"
        title={muted ? "Unmute music" : "Mute music"}
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
