import { useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { Product, ProductSummary } from "@shared/schema";

const CARD_COUNT = 8;
const RADIUS = 320;
const IDLE_DEG_PER_SEC = 360 / 45;
const DRAG_SENSITIVITY = 0.6;
const FRICTION = 0.95;
const MIN_VELOCITY = 0.05;
const CARD_W = 140;
const CARD_H = 190;
const TAP_MAX_DIST = 8;
const TAP_MAX_TIME = 300;
const DRAG_DEAD_ZONE = 5;

export default function CultureDeck() {
  const { data: products = [] } = useQuery<(Product | ProductSummary)[]>({
    queryKey: ["/api/products/deck"],
    queryFn: async () => {
      try {
        const staticRes = await fetch("/data/products-slim-1.json");
        if (staticRes.ok) {
          const data = await staticRes.json();
          if (Array.isArray(data) && data.length > 0) return data;
        }
      } catch {}
      const res = await fetch("/api/products/slim", {
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          "X-App-Token": import.meta.env.VITE_APP_TOKEN || "msd-storefront-v1",
        },
      });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
  });
  const [, navigate] = useLocation();

  const deckRef = useRef<HTMLDivElement>(null);
  const cardWrappersRef = useRef<(HTMLDivElement | null)[]>([]);
  const cardInnersRef = useRef<(HTMLDivElement | null)[]>([]);
  const rotationRef = useRef(0);
  const velocityRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const prevTimestampRef = useRef<number>(0);

  const isPointerDownRef = useRef(false);
  const isDraggingRef = useRef(false);
  const isMomentumRef = useRef(false);
  const lastXRef = useRef(0);
  const lastTimeRef = useRef(0);

  const pointerStartXRef = useRef(0);
  const pointerStartTimeRef = useRef(0);
  const totalDragDistRef = useRef(0);
  const isTapRef = useRef(true);

  const shuffledProducts = useMemo(() => {
    if (products.length === 0) return [];
    const copy = [...products];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, CARD_COUNT);
  }, [products]);

  const cardCount = shuffledProducts.length;
  const angleStep = cardCount > 0 ? 360 / cardCount : 0;

  const updateDeck = useCallback(() => {
    if (!deckRef.current) return;
    deckRef.current.style.transform = `rotateY(${rotationRef.current}deg)`;

    for (let i = 0; i < cardWrappersRef.current.length; i++) {
      const wrapper = cardWrappersRef.current[i];
      const inner = cardInnersRef.current[i];
      if (!inner || !wrapper) continue;

      const cardWorldAngle = ((i * angleStep + rotationRef.current) % 360 + 360) % 360;
      const depthCos = Math.cos((cardWorldAngle * Math.PI) / 180);
      const depthNorm = (depthCos + 1) / 2;

      const isBehind = cardWorldAngle > 90 && cardWorldAngle < 270;

      if (isBehind) {
        wrapper.style.zIndex = "0";
        inner.style.visibility = "hidden";
        continue;
      }

      const brightness = 0.3 + 0.7 * depthNorm;
      const scale = 0.75 + 0.25 * depthNorm;
      const zIndex = Math.round(depthNorm * 100);

      const counterRotation = -(i * angleStep + rotationRef.current);

      wrapper.style.zIndex = String(zIndex);
      inner.style.transform = `rotateY(${counterRotation}deg) scale(${scale})`;
      inner.style.filter = `brightness(${brightness})`;
      inner.style.visibility = "visible";
    }
  }, [angleStep]);

  const animate = useCallback((timestamp: number) => {
    if (prevTimestampRef.current === 0) prevTimestampRef.current = timestamp;
    const dt = (timestamp - prevTimestampRef.current) / 1000;
    prevTimestampRef.current = timestamp;

    if (!isDraggingRef.current) {
      if (isMomentumRef.current) {
        rotationRef.current += velocityRef.current;
        velocityRef.current *= FRICTION;
        if (Math.abs(velocityRef.current) < MIN_VELOCITY) {
          isMomentumRef.current = false;
          velocityRef.current = 0;
        }
      } else {
        rotationRef.current += IDLE_DEG_PER_SEC * dt;
      }
    }

    updateDeck();
    animFrameRef.current = requestAnimationFrame(animate);
  }, [updateDeck]);

  useEffect(() => {
    prevTimestampRef.current = 0;
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [animate]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isPointerDownRef.current = true;
    isDraggingRef.current = false;
    isTapRef.current = true;
    totalDragDistRef.current = 0;

    pointerStartXRef.current = e.clientX;
    pointerStartTimeRef.current = Date.now();
    lastXRef.current = e.clientX;
    lastTimeRef.current = Date.now();
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPointerDownRef.current) return;

    const deltaX = e.clientX - lastXRef.current;
    totalDragDistRef.current += Math.abs(deltaX);

    if (!isDraggingRef.current && totalDragDistRef.current > DRAG_DEAD_ZONE) {
      isDraggingRef.current = true;
      isTapRef.current = false;
      isMomentumRef.current = false;
      velocityRef.current = 0;
    }

    if (!isDraggingRef.current) return;

    const now = Date.now();
    const dt = now - lastTimeRef.current;
    if (dt > 0) {
      velocityRef.current = (deltaX * DRAG_SENSITIVITY) / Math.max(dt / 16, 1);
    }
    rotationRef.current += deltaX * DRAG_SENSITIVITY;
    lastXRef.current = e.clientX;
    lastTimeRef.current = now;
    updateDeck();
  }, [updateDeck]);

  const handlePointerUp = useCallback(() => {
    if (isDraggingRef.current && Math.abs(velocityRef.current) > MIN_VELOCITY) {
      isMomentumRef.current = true;
    }
    isDraggingRef.current = false;
    isPointerDownRef.current = false;
  }, []);

  const handleCardTap = useCallback((productId: number) => {
    const elapsed = Date.now() - pointerStartTimeRef.current;
    if (!isTapRef.current || elapsed > TAP_MAX_TIME || totalDragDistRef.current > TAP_MAX_DIST) {
      return;
    }
    navigate(`/product/${productId}`);
  }, [navigate]);

  if (shuffledProducts.length === 0) return null;

  return (
    <div className="flex flex-col items-center mt-12 mb-12">
      <p className="font-pixel text-[9px] sm:text-[10px] text-neon-yellow neon-text-yellow mb-6 tracking-widest">
        &#9654; LATEST DROPS
      </p>

      <div
        className="relative cursor-grab active:cursor-grabbing select-none w-[340px] h-[260px] sm:w-[700px] sm:h-[300px]"
        style={{ perspective: "900px" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        data-testid="culture-deck-container"
      >
        <div
          ref={deckRef}
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transformStyle: "preserve-3d",
            transform: "rotateY(0deg)",
          }}
        >
          {shuffledProducts.map((product, i) => {
            const angle = i * angleStep;
            return (
              <div
                key={product.id}
                ref={(el) => { cardWrappersRef.current[i] = el; }}
                className="absolute"
                style={{
                  transformStyle: "preserve-3d",
                  transform: `rotateY(${angle}deg) translateZ(${RADIUS}px)`,
                }}
              >
                <div
                  ref={(el) => { cardInnersRef.current[i] = el; }}
                  className="absolute"
                  style={{
                    width: `${CARD_W}px`,
                    height: `${CARD_H}px`,
                    left: `${-CARD_W / 2}px`,
                    top: `${-CARD_H / 2}px`,
                    transformStyle: "preserve-3d",
                    transform: "rotateY(0deg) scale(1)",
                  }}
                >
                  <div
                    onClick={() => handleCardTap(product.id)}
                    className="w-full h-full rounded-md overflow-hidden bg-[#0a0a0a] border border-white/15 shadow-[0_4px_24px_rgba(0,0,0,0.7)] cursor-pointer relative"
                    style={{ backfaceVisibility: "hidden" }}
                    data-testid={`culture-card-${product.id}`}
                  >
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover pointer-events-none"
                      loading="lazy"
                      draggable={false}
                      style={{ backfaceVisibility: "hidden" }}
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = "none";
                        const fallback = target.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                    <div className="w-full h-full items-center justify-center hidden absolute inset-0 bg-[#0a0a0a]">
                      <span className="font-pixel text-[8px] text-neon-blue/40">MSD</span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/60 to-transparent p-2 pt-8">
                      <p className="font-display text-[10px] text-white/90 line-clamp-2 leading-tight">
                        {product.name}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-white/30 text-[10px] mt-3 font-body">
        Tap a card to view &bull; Drag to spin
      </p>
    </div>
  );
}
