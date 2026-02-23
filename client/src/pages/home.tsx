import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import Starfield from "@/components/starfield";
import CultureDeck from "@/components/culture-deck";
import { useEffect, useState } from "react";
import { usePageTitle } from "@/hooks/use-page-title";

const marqueeItems = [
  "HIP HOP", "R&B", "SOUL", "POP", "CULTURE", "LOVE", "OLD SCHOOL", "NEW VIBES",
  "HIP HOP", "R&B", "SOUL", "POP", "CULTURE", "LOVE", "OLD SCHOOL", "NEW VIBES",
];

export default function Home() {
  usePageTitle("Culture You Can Wear");
  const [showContent, setShowContent] = useState(false);
  const [typedText, setTypedText] = useState("");
  const tagline = "Shirts, hoodies, onesies, and accessories for all ages inspired by music, culture and love.";

  useEffect(() => {
    const seen = sessionStorage.getItem("msd_intro_seen");
    if (seen) {
      setShowContent(true);
      setTypedText(tagline);
      return;
    }
    const timer = setTimeout(() => {
      setShowContent(true);
      sessionStorage.setItem("msd_intro_seen", "1");
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showContent) return;
    if (typedText.length >= tagline.length) return;
    const timer = setTimeout(() => {
      setTypedText(tagline.slice(0, typedText.length + 1));
    }, 18);
    return () => clearTimeout(timer);
  }, [showContent, typedText]);

  if (!showContent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background pixel-grid-bg relative overflow-hidden">
        <Starfield />
        <div className="relative z-10 text-center animate-pixel-fade-in">
          <p className="font-pixel text-xs sm:text-sm text-neon-green neon-text-green mb-6">PLAYER 1</p>
          <h1 className="font-pixel text-lg sm:text-2xl text-neon-yellow neon-text-yellow animate-neon-pulse">
            SELECT
          </h1>
          <div className="mt-8">
            <span className="font-pixel text-[10px] text-muted-foreground animate-blink">LOADING CULTURE...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <section className="relative min-h-[70vh] flex flex-col items-center justify-center overflow-hidden pixel-grid-bg">
        <Starfield />
        <div className="scanline-overlay" />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <div className="animate-pixel-fade-in">
            <p className="font-pixel text-[9px] sm:text-[10px] text-neon-green neon-text-green mb-4 tracking-widest">
              WELCOME TO
            </p>

            <h1 className="font-pixel text-2xl sm:text-4xl md:text-5xl text-neon-blue neon-text-blue mb-6 leading-relaxed animate-float">
              MyShirtsDope
            </h1>

            <div className="max-w-2xl mx-auto mb-10">
              <p className="font-display text-lg sm:text-xl text-foreground/90 leading-relaxed min-h-[56px]">
                {typedText}
                <span className="animate-blink text-neon-yellow">|</span>
              </p>
            </div>

            <Link href="/shop" data-testid="link-enter-store">
              <Button className="font-pixel text-[10px] sm:text-xs bg-neon-blue border-neon-blue text-white px-8 py-6 gap-3 no-default-hover-elevate no-default-active-elevate transition-all duration-200 hover:shadow-[0_0_20px_hsl(200_100%_55%/0.6)] active:scale-[0.97]">
                ENTER THE STORE
                <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          <CultureDeck />
        </div>
      </section>

      <div className="border-y border-border bg-card/50 overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap py-3">
          {marqueeItems.map((item, i) => (
            <span key={i} className="font-display text-sm mx-6 text-muted-foreground">
              {item}
              <span className="text-neon-blue mx-4">&middot;</span>
            </span>
          ))}
        </div>
      </div>

      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-pixel text-sm sm:text-base text-center text-neon-yellow neon-text-yellow mb-12">
            WHAT WE REP
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { title: "HIP HOP", desc: "Old school beats, fresh threads. Rep the culture that started it all.", color: "text-neon-blue", glow: "neon-text-blue" },
              { title: "R&B / SOUL", desc: "Smooth vibes, timeless style. Wear the feeling of every classic track.", color: "text-neon-yellow", glow: "neon-text-yellow" },
              { title: "LOVE", desc: "Spread love through wearable art. Because culture starts with heart.", color: "text-neon-green", glow: "neon-text-green" },
              { title: "CULTURE", desc: "Represent a time, feeling, event, place, song, or artist you love.", color: "text-neon-orange", glow: "neon-text-orange" },
            ].map((item) => (
              <div key={item.title} className="bg-card border border-card-border rounded-md p-6 text-center">
                <h3 className={`font-pixel text-[10px] ${item.color} ${item.glow} mb-3`}>{item.title}</h3>
                <p className="font-display text-base text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="retro-divider" />

      <section className="py-20 px-4 text-center">
        <h2 className="font-pixel text-sm sm:text-base text-neon-green neon-text-green mb-4">
          READY TO PLAY?
        </h2>
        <p className="font-display text-lg text-muted-foreground mb-8 max-w-md mx-auto">
          Browse our collection of unique merch inspired by the music and moments that shaped culture.
        </p>
        <Link href="/shop" data-testid="link-browse-collection">
          <Button className="font-pixel text-[10px] bg-neon-yellow border-neon-yellow text-black px-8 py-5 no-default-hover-elevate no-default-active-elevate hover:shadow-[0_0_20px_hsl(52_100%_50%/0.5)] transition-all active:scale-[0.97]">
            BROWSE COLLECTION
          </Button>
        </Link>
      </section>
    </div>
  );
}
