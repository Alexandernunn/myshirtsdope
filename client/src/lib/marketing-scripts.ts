const GA_MEASUREMENT_ID = "G-EV5P2LKEHE";
const META_PIXEL_ID = "1085522715399637";
const MAX_SCRIPT_ATTEMPTS = 2;
const MAX_QUEUED_COMMANDS = 100;
const SCRIPT_LOAD_TIMEOUT_MS = 8_000;
const RETRY_LISTENER_DELAY_MS = 250;

type GtagFunction = (...args: any[]) => void;
type ScriptStatus = "idle" | "loading" | "loaded" | "failed" | "disabled";

interface FbqFunction {
  (...args: any[]): void;
  callMethod?: (...args: any[]) => void;
  push: FbqFunction;
  loaded: boolean;
  version: string;
  queue: any[][];
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFunction;
    fbq?: FbqFunction;
    _fbq?: FbqFunction;
  }
}

interface MarketingScriptState {
  id: string;
  src: string;
  status: ScriptStatus;
  attempts: number;
}

const googleScript: MarketingScriptState = {
  id: "google-marketing-script",
  src: `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`,
  status: "idle",
  attempts: 0,
};

const metaScript: MarketingScriptState = {
  id: "meta-marketing-script",
  src: "https://connect.facebook.net/en_US/fbevents.js",
  status: "idle",
  attempts: 0,
};

const interactionEvents = ["pointerdown", "touchstart", "mousedown", "keydown", "click"] as const;

let googleQueuePrepared = false;
let metaQueuePrepared = false;
let interactionListenersAttached = false;
let activeDeferrals = 0;
let retryListenerTimer: number | undefined;

function prepareGoogleQueue() {
  if (typeof window === "undefined" || googleQueuePrepared) return;

  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function (..._args: any[]) {
      if (googleScript.status === "disabled") return;
      window.dataLayer?.push(arguments);
      if (
        googleScript.status !== "loaded" &&
        window.dataLayer &&
        window.dataLayer.length > MAX_QUEUED_COMMANDS + 1
      ) {
        window.dataLayer.splice(1, window.dataLayer.length - (MAX_QUEUED_COMMANDS + 1));
      }
    };
  }

  window.gtag("js", new Date());
  googleQueuePrepared = true;
}

function prepareMetaQueue() {
  if (typeof window === "undefined" || metaQueuePrepared) return;

  if (!window.fbq) {
    const fbq = function (...args: any[]) {
      if (metaScript.status === "disabled") return;
      if (fbq.callMethod) {
        fbq.callMethod(...args);
      } else {
        fbq.queue.push(args);
        if (fbq.queue.length > MAX_QUEUED_COMMANDS + 1) {
          fbq.queue.splice(1, fbq.queue.length - (MAX_QUEUED_COMMANDS + 1));
        }
      }
    } as FbqFunction;

    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
  }

  window.fbq("init", META_PIXEL_ID);
  metaQueuePrepared = true;
}

function prepareMarketingQueues() {
  prepareGoogleQueue();
  prepareMetaQueue();
}

function isTerminal(status: ScriptStatus) {
  return status === "loaded" || status === "disabled";
}

function allScriptsTerminal() {
  return isTerminal(googleScript.status) && isTerminal(metaScript.status);
}

function disableBrowserQueue(state: MarketingScriptState) {
  if (state === googleScript) {
    window.dataLayer?.splice(0);
  } else if (window.fbq) {
    window.fbq.queue.length = 0;
  }
}

function removeInteractionListeners() {
  if (!interactionListenersAttached) return;

  for (const eventName of interactionEvents) {
    document.removeEventListener(eventName, handleInteraction, true);
  }
  interactionListenersAttached = false;
}

function addInteractionListeners() {
  if (
    interactionListenersAttached ||
    activeDeferrals === 0 ||
    allScriptsTerminal()
  ) {
    return;
  }

  for (const eventName of interactionEvents) {
    document.addEventListener(eventName, handleInteraction, {
      capture: true,
      passive: true,
    });
  }
  interactionListenersAttached = true;
}

function scheduleRetryListeners() {
  if (activeDeferrals === 0 || allScriptsTerminal() || retryListenerTimer !== undefined) {
    return;
  }

  retryListenerTimer = window.setTimeout(() => {
    retryListenerTimer = undefined;
    addInteractionListeners();
  }, RETRY_LISTENER_DELAY_MS);
}

function appendMarketingScript(state: MarketingScriptState) {
  if (
    state.status === "loading" ||
    state.status === "loaded" ||
    state.status === "disabled"
  ) {
    return;
  }

  if (state.attempts >= MAX_SCRIPT_ATTEMPTS) {
    state.status = "disabled";
    disableBrowserQueue(state);
    return;
  }

  document.getElementById(state.id)?.remove();

  const script = document.createElement("script");
  script.id = state.id;
  script.async = true;
  script.src = state.src;
  state.attempts += 1;
  state.status = "loading";

  let settled = false;
  const timeout = window.setTimeout(() => settle(false), SCRIPT_LOAD_TIMEOUT_MS);

  const settle = (loaded: boolean) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);

    if (loaded) {
      state.status = "loaded";
    } else {
      script.remove();
      state.status = state.attempts >= MAX_SCRIPT_ATTEMPTS ? "disabled" : "failed";
      if (state.status === "disabled") {
        disableBrowserQueue(state);
      }
    }

    if (allScriptsTerminal()) {
      removeInteractionListeners();
    } else if (!loaded) {
      scheduleRetryListeners();
    }
  };

  script.addEventListener("load", () => settle(true), { once: true });
  script.addEventListener("error", () => settle(false), { once: true });
  document.head.appendChild(script);
}

function loadMarketingScripts() {
  if (typeof document === "undefined") return;

  prepareMarketingQueues();
  appendMarketingScript(googleScript);
  appendMarketingScript(metaScript);
}

function handleInteraction() {
  removeInteractionListeners();
  loadMarketingScripts();
}

export function deferMarketingScriptsUntilInteraction() {
  if (typeof document === "undefined") return () => {};

  prepareMarketingQueues();
  activeDeferrals += 1;
  addInteractionListeners();

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    activeDeferrals = Math.max(0, activeDeferrals - 1);
    if (activeDeferrals === 0) {
      removeInteractionListeners();
      if (retryListenerTimer !== undefined) {
        window.clearTimeout(retryListenerTimer);
        retryListenerTimer = undefined;
      }
    }
  };
}

export function queueGooglePageView(path: string) {
  prepareGoogleQueue();
  window.gtag?.("config", GA_MEASUREMENT_ID, {
    page_path: path,
  });
}

export function queueMetaPixelEvent(
  eventName: string,
  params: Record<string, any>,
  eventId: string,
) {
  prepareMetaQueue();
  window.fbq?.("track", eventName, params, { eventID: eventId });
}