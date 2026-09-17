import type { Handler } from "@netlify/functions";

const PIXEL_ID = process.env.META_PIXEL_ID || "1085522715399637";

export function buildFbcFromUrl(url: string | undefined, timestampMs = Date.now()): string | undefined {
  if (!url) return undefined;
  try {
    const fbclid = new URL(url).searchParams.get("fbclid")?.trim();
    if (!fbclid) return undefined;
    return `fb.1.${Math.floor(timestampMs)}.${fbclid}`;
  } catch {
    return undefined;
  }
}

function buildCustomData(eventName: string, d: Record<string, any>): Record<string, any> | undefined {
  const base: Record<string, any> = {};

  if (d.content_ids) base.content_ids = d.content_ids;
  if (d.content_name) base.content_name = d.content_name;
  if (d.content_type) base.content_type = d.content_type;
  if (d.value !== undefined) base.value = d.value;
  if (d.currency) base.currency = d.currency;
  if (d.num_items !== undefined) base.num_items = d.num_items;

  if (["Purchase", "AddToCart", "ViewContent", "InitiateCheckout"].includes(eventName) && !base.content_type) {
    base.content_type = "product";
  }

  return Object.keys(base).length > 0 ? base : undefined;
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    return { statusCode: 503, body: JSON.stringify({ ok: false, reason: "no token" }) };
  }

  let eventName: string;
  let eventData: Record<string, any>;

  try {
    ({ eventName, eventData } = JSON.parse(event.body || "{}"));
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  if (!eventName) {
    return { statusCode: 400, body: "Missing eventName" };
  }

  const ip = event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? "";
  const ua = event.headers["user-agent"] ?? "";

  const userData: Record<string, any> = {};
  if (ip) userData.client_ip_address = ip;
  if (ua) userData.client_user_agent = ua;
  if (eventData?.fbp) userData.fbp = eventData.fbp;
  const fbc = eventData?.fbc || buildFbcFromUrl(eventData?.url);
  if (fbc) userData.fbc = fbc;

  const payload: Record<string, any> = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_source_url: eventData?.url ?? "",
    action_source: "website",
    user_data: userData,
  };

  if (eventData?.event_id) {
    payload.event_id = eventData.event_id;
  }

  const customData = buildCustomData(eventName, eventData ?? {});
  if (customData) payload.custom_data = customData;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [payload] }),
      }
    );
    const json = await res.json() as any;
    if (!res.ok || Number(json.events_received) < 1) {
      console.error("Meta CAPI rejected event:", res.status, json);
      return {
        statusCode: 502,
        body: JSON.stringify({ ok: false, status: res.status, error: json.error?.message || "event not accepted" }),
      };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, events_received: json.events_received }) };
  } catch (err: any) {
    console.error("Meta CAPI error:", err);
    return { statusCode: 502, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
