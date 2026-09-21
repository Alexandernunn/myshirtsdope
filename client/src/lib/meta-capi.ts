import { queueMetaPixelEvent } from "@/lib/marketing-scripts";

function getCookie(name: string): string {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : "";
}

function setMetaCookie(name: "_fbp" | "_fbc", value: string): string {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=7776000; SameSite=Lax${secure}`;
  return value;
}

function getOrCreateFbp(): string {
  const existing = getCookie("_fbp");
  if (existing) return existing;
  const random = Math.floor(Math.random() * 1_000_000_000_000);
  return setMetaCookie("_fbp", `fb.1.${Date.now()}.${random}`);
}

function getOrCreateFbc(): string {
  const existing = getCookie("_fbc");
  if (existing) return existing;
  const fbclid = new URLSearchParams(window.location.search).get("fbclid")?.trim();
  return fbclid ? setMetaCookie("_fbc", `fb.1.${Date.now()}.${fbclid}`) : "";
}

export function getShopifyVariantTrackingData(
  variantId: string,
  price: string,
): { contentId: string; value: number } | null {
  const contentId = variantId.split("/").pop() || "";
  const value = Number.parseFloat(price);
  return /^\d+$/.test(contentId) && Number.isFinite(value)
    ? { contentId, value }
    : null;
}

function genEventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface TrackOptions {
  content_ids?: string[];
  content_name?: string;
  content_type?: string;
  value?: number;
  currency?: string;
  num_items?: number;
}

export function trackEvent(eventName: string, options: TrackOptions = {}) {
  const eventId = genEventId();
  const fbpCookie = getOrCreateFbp();
  const fbcCookie = getOrCreateFbc();

  const pixelParams: Record<string, any> = { ...options };
  const capiData: Record<string, any> = {
    url: window.location.href,
    event_id: eventId,
    ...options,
  };

  capiData.fbp = fbpCookie;
  if (fbcCookie) capiData.fbc = fbcCookie;

  queueMetaPixelEvent(eventName, pixelParams, eventId);

  fetch("/.netlify/functions/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName, eventData: capiData }),
  }).catch(() => {});
}
