import { useCallback, useEffect, useRef, useState } from "react";
import { createSearchPromptCycle } from "../../../shared/search-prompts";

const ROTATION_MS = 3000;
const DELETE_DURATION_MS = 300;
const TYPE_DURATION_MS = 450;
// Include the typewriter transition in the three seconds, rather than adding it
// after a three-second hold. Longer names still rotate at the same cadence.
const HOLD_DURATION_MS = ROTATION_MS - DELETE_DURATION_MS - TYPE_DURATION_MS;

export function useTypingPlaceholder() {
  const cycle = useRef<string[] | null>(null);
  if (cycle.current === null) cycle.current = createSearchPromptCycle();

  const wordIndex = useRef(0);
  const charIndex = useRef(cycle.current[0].length);
  const isDeleting = useRef(false);
  const isHolding = useRef(true);
  const isFocused = useRef(false);
  const hasInput = useRef(false);
  const [isPaused, setIsPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [placeholder, setPlaceholder] = useState(
    `Search ${cycle.current[0]}...`
  );
  const timer = useRef<number | null>(null);
  const deadline = useRef(0);
  const nextDelay = useRef(HOLD_DURATION_MS);

  const currentPlaceholder = useCallback((complete = false) => {
    const currentWord = cycle.current![wordIndex.current];
    const visibleWord = complete
      ? currentWord
      : currentWord.substring(0, charIndex.current);
    return `Search ${visibleWord}...`;
  }, []);

  const setFocused = useCallback((focused: boolean) => {
    isFocused.current = focused;
    const paused = focused || hasInput.current;
    setIsPaused(paused);
    if (focused) {
      setPlaceholder("Search...");
    } else if (!paused) {
      setPlaceholder(currentPlaceholder(reducedMotion));
    }
  }, [currentPlaceholder, reducedMotion]);

  const setHasInput = useCallback((has: boolean) => {
    hasInput.current = has;
    const paused = isFocused.current || has;
    setIsPaused(paused);
    if (!paused) setPlaceholder(currentPlaceholder(reducedMotion));
  }, [currentPlaceholder, reducedMotion]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      setReducedMotion(media.matches);
      if (media.matches) {
        setPlaceholder(isFocused.current ? "Search..." : currentPlaceholder(true));
      } else if (!isFocused.current && !hasInput.current) {
        setPlaceholder(currentPlaceholder());
      }
    };
    updatePreference();
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, [currentPlaceholder]);

  useEffect(() => {
    if (reducedMotion || isPaused) return;

    let advance: () => void;
    const schedule = (delay: number) => {
      nextDelay.current = delay;
      deadline.current = Date.now() + delay;
      timer.current = window.setTimeout(advance, delay);
    };

    advance = () => {
      timer.current = null;
      nextDelay.current = 0;
      if (isFocused.current || hasInput.current) return;

      const currentWord = cycle.current![wordIndex.current];
      if (isHolding.current) {
        isHolding.current = false;
        isDeleting.current = true;
        schedule(DELETE_DURATION_MS / currentWord.length);
        return;
      }

      if (isDeleting.current) {
        charIndex.current = Math.max(0, charIndex.current - 1);
        setPlaceholder(currentPlaceholder());
        if (charIndex.current === 0) {
          isDeleting.current = false;
          if (wordIndex.current === cycle.current!.length - 1) {
            cycle.current = createSearchPromptCycle(Math.random, currentWord);
            wordIndex.current = 0;
          } else {
            wordIndex.current += 1;
          }
          schedule(TYPE_DURATION_MS / cycle.current![wordIndex.current].length);
        } else {
          schedule(DELETE_DURATION_MS / currentWord.length);
        }
        return;
      }

      charIndex.current = Math.min(charIndex.current + 1, currentWord.length);
      setPlaceholder(currentPlaceholder());
      if (charIndex.current === currentWord.length) {
        isHolding.current = true;
        schedule(HOLD_DURATION_MS);
      } else {
        schedule(TYPE_DURATION_MS / currentWord.length);
      }
    };

    timer.current = window.setTimeout(advance, nextDelay.current);
    deadline.current = Date.now() + nextDelay.current;

    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        nextDelay.current = Math.max(0, deadline.current - Date.now());
        timer.current = null;
      }
    };
  }, [currentPlaceholder, isPaused, reducedMotion]);

  return { placeholder, setFocused, setHasInput };
}
