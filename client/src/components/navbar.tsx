import { Link, useLocation } from "wouter";
import { ShoppingCart, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import { useState } from "react";

const navLinks = [
  { href: "/", label: "HOME" },
  { href: "/shop", label: "SHOP" },
  { href: "/about", label: "STORY" },
  { href: "/contact", label: "CONTACT" },
];

export default function Navbar() {
  const [location] = useLocation();
  const { totalItems } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between gap-4 h-16">
        <Link href="/" data-testid="link-home-logo">
          <span className="font-pixel text-xs sm:text-sm text-neon-blue neon-text-blue tracking-wider">
            MyShirtsDope
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} data-testid={`link-nav-${link.label.toLowerCase()}`}>
              <span className={`font-display text-sm tracking-wide transition-colors ${
                location === link.href
                  ? "text-neon-yellow neon-text-yellow"
                  : "text-muted-foreground"
              }`}>
                {link.label}
              </span>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link href="/cart" data-testid="link-cart">
            <Button variant="ghost" size="icon" className="relative">
              <ShoppingCart className="w-5 h-5" />
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 bg-neon-blue text-white text-[9px] font-pixel rounded-full w-5 h-5 flex items-center justify-center">
                  {totalItems}
                </span>
              )}
            </Button>
          </Link>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            data-testid="button-mobile-menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background px-4 pb-4">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)} data-testid={`link-mobile-${link.label.toLowerCase()}`}>
              <div className={`py-3 font-display text-sm tracking-wide border-b border-border/50 ${
                location === link.href ? "text-neon-yellow" : "text-muted-foreground"
              }`}>
                {link.label}
              </div>
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
