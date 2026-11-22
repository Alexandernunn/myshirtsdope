import { useLayoutEffect, useRef } from "react";

/** Fit the hero above the original purchase row, without polling or scroll work. */
export function useMobileProductImageSize(productId: number | undefined) {
  const heroRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const introRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const hero = heroRef.current;
    const controls = controlsRef.current;
    const intro = introRef.current;
    if (!hero || !controls || !intro) return;

    const mobile = window.matchMedia("(max-width: 767px)");
    let frame = 0;
    const fit = () => {
      if (!mobile.matches) {
        hero.style.removeProperty("--mobile-product-image-size");
        return;
      }
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const heroTop = hero.getBoundingClientRect().top + window.scrollY;
      const imageTitleGap = Number.parseFloat(getComputedStyle(hero.parentElement!).rowGap) || 0;
      const pageBottomSpace = Number.parseFloat(getComputedStyle(controls.parentElement!).paddingBottom) || 0;
      const available = Math.max(0, Math.floor(
        viewportHeight - heroTop - intro.getBoundingClientRect().height - imageTitleGap - pageBottomSpace,
      ));
      hero.style.setProperty("--mobile-product-image-size", `${available}px`);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    fit();
    const observer = new ResizeObserver(schedule);
    observer.observe(controls);
    observer.observe(intro);
    window.visualViewport?.addEventListener("resize", schedule);
    window.addEventListener("resize", schedule);
    mobile.addEventListener("change", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", schedule);
      window.removeEventListener("resize", schedule);
      mobile.removeEventListener("change", schedule);
    };
  }, [productId]);

  return { heroRef, controlsRef, introRef };
}
