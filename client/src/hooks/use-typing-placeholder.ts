import { useCallback, useEffect, useRef, useState } from "react";

const PLACEHOLDER_WORDS = [
  "Compton",
  "Outkast",
  "East Coast",
  "Detroit",
  "Wu-Tang",
  "Atlanta",
  "Neo Soul",
  "Biggie",
  "West Coast",
  "Aaliyah",
  "New York",
  "Hoodies",
  "Houston",
  "Hip Hop",
  "Miami",
  "R&B",
];

export function useTypingPlaceholder() {
  const [placeholder, setPlaceholder] = useState("Search...");
  const [reducedMotion, setReducedMotion] = useState(false);
  const wordIndex = useRef(0);
  const charIndex = useRef(0);
  const isDeleting = useRef(false);
  const isPaused = useRef(false);
  const isFocused = useRef(false);
  const hasInput = useRef(false);
  const pauseTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tick = useCallback(() => {
    if (isFocused.current || hasInput.current || isPaused.current) return;

    const currentWord = PLACEHOLDER_WORDS[wordIndex.current];
    if (!isDeleting.current) {
      charIndex.current = Math.min(charIndex.current + 1, currentWord.length);
      setPlaceholder(`Search ${currentWord.substring(0, charIndex.current)}...`);

      if (charIndex.current === currentWord.length) {
        isPaused.current = true;
        pauseTimeout.current = setTimeout(() => {
          isPaused.current = false;
          isDeleting.current = true;
          pauseTimeout.current = null;
        }, 1800);
      }
    } else {
      charIndex.current = Math.max(charIndex.current - 1, 0);
      setPlaceholder(`Search ${currentWord.substring(0, charIndex.current)}...`);

      if (charIndex.current === 0) {
        isDeleting.current = false;
        wordIndex.current = (wordIndex.current + 1) % PLACEHOLDER_WORDS.length;
      }
    }
  }, []);

  const setFocused = useCallback((focused: boolean) => {
    isFocused.current = focused;
    if (focused) setPlaceholder("Search...");
  }, []);

  const setHasInput = useCallback((has: boolean) => {
    hasInput.current = has;
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setPlaceholder("Search...");
      return;
    }

    const interval = window.setInterval(tick, 80);
    return () => {
      window.clearInterval(interval);
      if (pauseTimeout.current) {
        window.clearTimeout(pauseTimeout.current);
        pauseTimeout.current = null;
      }
      isPaused.current = false;
    };
  }, [reducedMotion, tick]);

  return { placeholder, setFocused, setHasInput };
}
