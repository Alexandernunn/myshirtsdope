function getCookie(name: string): string {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : "";
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
  const fbpCookie = getCookie("_fbp");
  const fbcCookie = getCookie("_fbc");

  const pixelParams: Record<string, any> = { ...options };
  const capiData: Record<string, any> = {
    url: window.location.href,
    event_id: eventId,
    ...options,
  };

  if (fbpCookie) capiData.fbp = fbpCookie;
  if (fbcCookie) capiData.fbc = fbcCookie;

  if (typeof window.fbq === "function") {
    window.fbq("track", eventName, pixelParams, { eventID: eventId });
  }

  fetch("/.netlify/functions/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName, eventData: capiData }),
  }).catch(() => {});
}
