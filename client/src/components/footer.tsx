import { Link } from "wouter";

export default function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="retro-divider" />
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div>
            <h3 className="font-pixel text-[10px] text-neon-blue neon-text-blue mb-4">MyShirtsDope</h3>
            <p className="font-display text-base text-muted-foreground leading-relaxed">
              Shirts, hoodies, onesies, and accessories for all ages inspired by music, culture and love.
            </p>
          </div>

          <div>
            <h4 className="font-pixel text-[9px] text-neon-yellow mb-4">NAVIGATE</h4>
            <div className="flex flex-col gap-2">
              <Link href="/shop" data-testid="link-footer-shop">
                <span className="font-display text-base text-muted-foreground">Shop</span>
              </Link>
              <Link href="/about" data-testid="link-footer-about">
                <span className="font-display text-base text-muted-foreground">Our Story</span>
              </Link>
              <Link href="/contact" data-testid="link-footer-contact">
                <span className="font-display text-base text-muted-foreground">Contact</span>
              </Link>
            </div>
          </div>

          <div>
            <h4 className="font-pixel text-[9px] text-neon-green mb-4">CATEGORIES</h4>
            <div className="flex flex-col gap-2">
              <Link href="/shop?category=Shirts" data-testid="link-footer-shirts">
                <span className="font-display text-base text-muted-foreground">Shirts</span>
              </Link>
              <Link href="/shop?category=Hoodies" data-testid="link-footer-hoodies">
                <span className="font-display text-base text-muted-foreground">Hoodies</span>
              </Link>
              <Link href="/shop?category=Onesies" data-testid="link-footer-onesies">
                <span className="font-display text-base text-muted-foreground">Onesies</span>
              </Link>
              <Link href="/shop?category=Accessories" data-testid="link-footer-accessories">
                <span className="font-display text-base text-muted-foreground">Accessories</span>
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border/50 text-center">
          <p className="font-pixel text-[8px] text-muted-foreground animate-neon-pulse">
            MyShirtsDope.com &mdash; CULTURE NEVER DIES
          </p>
        </div>
      </div>
    </footer>
  );
}
