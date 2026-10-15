import { createSearchPromptCycle } from "../../../shared/search-prompts";

export const SEARCH_ROTATION_MS = 3000;
const DELETE_MS = 300;
const TYPE_MS = 450;
const HOLD_MS = SEARCH_ROTATION_MS - DELETE_MS - TYPE_MS;

export interface SearchRotationClock {
  now: () => number;
  schedule: (callback: () => void, delay: number) => () => void;
}

const defaultClock: SearchRotationClock = {
  now: () => performance.now(),
  schedule(callback, delay) {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  },
};

interface RotationOptions {
  initialIdeas: readonly string[];
  onChange: (placeholder: string) => void;
  reducedMotion?: boolean;
  clock?: SearchRotationClock;
  nextCycle?: (previous: string) => string[];
}

/** One elapsed-time clock drives both animated and reduced-motion rotation. */
export function createSearchRotation({
  initialIdeas,
  onChange,
  reducedMotion = false,
  clock = defaultClock,
  nextCycle = (previous) => createSearchPromptCycle(Math.random, previous),
}: RotationOptions) {
  let ideas = [...initialIdeas];
  if (!ideas.length || ideas.some((idea) => !idea.trim())) {
    throw new Error("Search rotation requires nonempty ideas");
  }
  let followingCycle: string[] | null = null;
  let index = 0;
  let focused = false;
  let hasInput = false;
  let started = false;
  let disposed = false;
  let offset = 0;
  let epoch = clock.now();
  let cancel: (() => void) | null = null;

  const paused = () => focused || hasInput;
  const elapsed = () => offset + (started && !paused() ? clock.now() - epoch : 0);
  const stopTimer = () => {
    cancel?.();
    cancel = null;
  };
  const nextIdea = () => {
    if (index + 1 < ideas.length) return ideas[index + 1];
    followingCycle ??= nextCycle(ideas[index]);
    if (!followingCycle.length || followingCycle.some((idea) => !idea.trim())) {
      throw new Error("Search rotation requires a nonempty next cycle");
    }
    return followingCycle[0];
  };
  const advance = () => {
    nextIdea();
    if (index + 1 === ideas.length) {
      ideas = followingCycle!;
      followingCycle = null;
      index = 0;
    } else {
      index += 1;
    }
  };

  const tick = () => {
    if (disposed) return;
    stopTimer();
    let position = elapsed();
    while (position >= SEARCH_ROTATION_MS) {
      advance();
      position -= SEARCH_ROTATION_MS;
      offset = position;
      epoch = clock.now();
    }

    let text = ideas[index];
    if (!reducedMotion && position >= HOLD_MS) {
      text = position < HOLD_MS + DELETE_MS
        ? text.slice(0, Math.ceil(text.length * (1 - (position - HOLD_MS) / DELETE_MS)))
        : nextIdea().slice(0, Math.floor(nextIdea().length * (position - HOLD_MS - DELETE_MS) / TYPE_MS));
    }
    onChange(focused ? "Search..." : `Search ${text}...`);
    if (!started || paused()) return;

    // Reduced motion removes the typewriter, not the discovery ideas.
    const boundary = reducedMotion ? SEARCH_ROTATION_MS
      : position < HOLD_MS ? HOLD_MS
        : position < HOLD_MS + DELETE_MS ? HOLD_MS + DELETE_MS : SEARCH_ROTATION_MS;
    const delay = reducedMotion || position < HOLD_MS
      ? boundary - position
      : Math.min(16, boundary - position);
    cancel = clock.schedule(tick, delay);
  };

  const updatePause = (update: () => void) => {
    if (disposed) return;
    const position = elapsed();
    update();
    offset = position;
    epoch = clock.now();
    tick();
  };

  return {
    start() {
      if (started || disposed) return;
      started = true;
      epoch = clock.now();
      tick();
    },
    setFocused(value: boolean) {
      if (focused !== value) updatePause(() => { focused = value; });
    },
    setHasInput(value: boolean) {
      if (hasInput !== value) updatePause(() => { hasInput = value; });
    },
    setReducedMotion(value: boolean) {
      if (disposed || reducedMotion === value) return;
      reducedMotion = value;
      tick();
    },
    dispose() {
      disposed = true;
      started = false;
      stopTimer();
    },
  };
}
