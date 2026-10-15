import { useCallback, useEffect, useRef, useState } from "react";
import { createSearchPromptCycle } from "../../../shared/search-prompts";
import { createSearchRotation } from "../lib/search-rotation";

export function useTypingPlaceholder() {
  const [ideas] = useState(() => createSearchPromptCycle());
  const [placeholder, setPlaceholder] = useState(`Search ${ideas[0]}...`);
  const rotation = useRef<ReturnType<typeof createSearchRotation> | null>(null);
  const focused = useRef(false);
  const hasInput = useRef(false);

  const setFocused = useCallback((value: boolean) => {
    focused.current = value;
    rotation.current?.setFocused(value);
  }, []);

  const setHasInput = useCallback((value: boolean) => {
    hasInput.current = value;
    rotation.current?.setHasInput(value);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const controller = createSearchRotation({
      initialIdeas: ideas,
      onChange: setPlaceholder,
      reducedMotion: media.matches,
    });
    rotation.current = controller;
    controller.setFocused(focused.current);
    controller.setHasInput(hasInput.current);
    controller.start();

    const updatePreference = () => controller.setReducedMotion(media.matches);
    media.addEventListener("change", updatePreference);
    return () => {
      media.removeEventListener("change", updatePreference);
      controller.dispose();
      if (rotation.current === controller) rotation.current = null;
    };
  }, [ideas]);

  return { placeholder, setFocused, setHasInput };
}
