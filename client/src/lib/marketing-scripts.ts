const GA_MEASUREMENT_ID = "G-EV5P2LKEHE";
const META_PIXEL_ID = "1085522715399637";
const MAX_SCRIPT_ATTEMPTS = 2;
const MAX_QUEUED_COMMANDS = 100;
const SCRIPT_LOAD_TIMEOUT_MS = 8_000;
const SCRIPT_RETRY_DELAY_MS = 250;

type GtagFunction = (...args: any[]) => void;
type ScriptStatus = "idle" | "loading" | "loaded" | "failed";

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

let googleQueuePrepared = false;
let metaQueuePrepared = false;

function prepareGoogleQueue() {
  if (typeof window === "undefined" || googleQueuePrepared) return;

  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function (..._args: any[]) {
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
  window.gtag("config", GA_MEASUREMENT_ID, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  googleQueuePrepared = true;
}

function prepareMetaQueue() {
  if (typeof window === "undefined" || metaQueuePrepared) return;

  if (!window.fbq) {
    const fbq = function (...args: any[]) {
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

function appendMarketingScript(state: MarketingScriptState) {
  if (
    state.status === "loading" ||
    state.status === "loaded"
  ) {
    return;
  }

  if (state.attempts >= MAX_SCRIPT_ATTEMPTS) {
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
      state.status = "failed";
      if (state.attempts < MAX_SCRIPT_ATTEMPTS) {
        window.setTimeout(() => appendMarketingScript(state), SCRIPT_RETRY_DELAY_MS);
      }
    }
  };

  script.addEventListener("load", () => settle(true), { once: true });
  script.addEventListener("error", () => settle(false), { once: true });
  document.head.appendChild(script);
}

export function initializeMarketingScripts() {
  if (typeof document === "undefined") return;

  prepareMarketingQueues();
  appendMarketingScript(googleScript);
  appendMarketingScript(metaScript);
}

export function queueGooglePageView(path: string) {
  prepareGoogleQueue();
  window.gtag?.("event", "page_view", {
    page_location: new URL(path, window.location.href).href,
    page_title: document.title,
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