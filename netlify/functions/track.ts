import type { Handler } from "@netlify/functions";

const PIXEL_ID = "1085522715399637";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: "no token" }) };
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

  const payload: Record<string, any> = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_source_url: eventData?.url ?? "",
    action_source: "website",
    user_data: {
      ...(ip ? { client_ip_address: ip } : {}),
      ...(ua ? { client_user_agent: ua } : {}),
    },
  };

  if (eventName === "AddToCart" && eventData) {
    payload.custom_data = {
      content_name: eventData.content_name,
      content_ids: eventData.content_ids,
      content_type: "product",
      value: eventData.value,
      currency: eventData.currency ?? "USD",
    };
  }

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
    return { statusCode: 200, body: JSON.stringify({ ok: true, events_received: json.events_received }) };
  } catch (err: any) {
    console.error("Meta CAPI error:", err);
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
