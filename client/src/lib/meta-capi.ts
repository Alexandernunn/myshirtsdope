export function trackServerEvent(eventName: string, extraData: Record<string, any> = {}) {
  fetch("/.netlify/functions/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName,
      eventData: { url: window.location.href, ...extraData },
    }),
  }).catch(() => {});
}
