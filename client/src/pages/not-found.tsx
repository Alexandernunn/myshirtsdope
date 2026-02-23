import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <p className="font-pixel text-4xl text-neon-blue neon-text-blue mb-4">404</p>
      <p className="font-pixel text-[10px] text-neon-yellow mb-2">GAME OVER</p>
      <p className="font-display text-lg text-muted-foreground mb-8">This page doesn't exist. Let's get you back on track.</p>
      <Link href="/" data-testid="link-404-home">
        <Button className="font-pixel text-[10px] bg-neon-blue border-neon-blue text-white no-default-hover-elevate no-default-active-elevate hover:shadow-[0_0_20px_hsl(200_100%_55%/0.6)] transition-all active:scale-[0.97]">
          RETURN HOME
        </Button>
      </Link>
    </div>
  );
}
