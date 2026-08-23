import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import serverless from "serverless-http";

const BUILD_COALESCE_WINDOW_MS = 2 * 60 * 1000;
const DELIVERY_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_REMEMBERED_DELIVERIES = 5000;

export type RebuildResult = {
  triggered: boolean;
  reason: "triggered" | "duplicate" | "coalesced";
};

/**
 * Keeps duplicate Shopify deliveries and short bursts from triggering a
 * build for every event. This state is intentionally bounded; Netlify
 * reuses warm function instances, while the webhook's delivery ID protects
 * against normal Shopify retries.
 */
export class CatalogRebuildCoalescer {
  private readonly recentDeliveries = new Map<string, number>();
  private buildWindowUntil = 0;

  constructor(
    private readonly coalesceWindowMs = BUILD_COALESCE_WINDOW_MS,
    private readonly deliveryWindowMs = DELIVERY_DEDUPE_WINDOW_MS,
  ) {}

  async request(
    deliveryId: string | undefined,
    trigger: () => Promise<void>,
    now = Date.now(),
  ): Promise<RebuildResult> {
    this.removeExpiredDeliveries(now);

    if (deliveryId && this.recentDeliveries.has(deliveryId)) {
      return { triggered: false, reason: "duplicate" };
    }

    if (this.buildWindowUntil > now) {
      this.rememberDelivery(deliveryId, now);
      return { triggered: false, reason: "coalesced" };
    }

    // Reserve the window before awaiting fetch(), so concurrent invocations
    // in the same warm instance cannot both trigger a build.
    this.buildWindowUntil = now + this.coalesceWindowMs;
    try {
      await trigger();
      this.rememberDelivery(deliveryId, now);
      return { triggered: true, reason: "triggered" };
    } catch (error) {
      this.buildWindowUntil = 0;
      throw error;
    }
  }

  private rememberDelivery(deliveryId: string | undefined, now: number): void {
    if (!deliveryId) return;
    this.recentDeliveries.set(deliveryId, now + this.deliveryWindowMs);
    while (this.recentDeliveries.size > MAX_REMEMBERED_DELIVERIES) {
      const oldest = this.recentDeliveries.keys().next().value;
      if (!oldest) break;
      this.recentDeliveries.delete(oldest);
    }
  }

  private removeExpiredDeliveries(now: number): void {
    this.recentDeliveries.forEach((expiresAt, deliveryId) => {
      if (expiresAt <= now) this.recentDeliveries.delete(deliveryId);
    });
  }
}

export function verifyShopifyWebhookSignature(
  rawBody: Buffer | string,
  providedSignature: string | undefined,
  secret: string,
): boolean {
  if (!providedSignature || !secret) return false;

  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(providedSignature.trim(), "base64");
  } catch {
    return false;
  }

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function getBuildHookUrl(): URL {
  const configured = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!configured) {
    throw new Error("NETLIFY_BUILD_HOOK_URL is not configured");
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("NETLIFY_BUILD_HOOK_URL is invalid");
  }
  if (url.protocol !== "https:") {
    throw new Error("NETLIFY_BUILD_HOOK_URL must use HTTPS");
  }
  return url;
}

async function triggerNetlifyBuild(): Promise<void> {
  const response = await fetch(getBuildHookUrl(), { method: "POST" });
  if (!response.ok) {
    throw new Error(`Netlify build hook rejected request (${response.status})`);
  }
}

const catalogTopics = new Set([
  "products/create",
  "products/update",
  "products/delete",
  "inventory_levels/update",
]);

export function createShopifyCatalogWebhookApp(
  coalescer = new CatalogRebuildCoalescer(),
): Express {
  const app = express();
  app.disable("x-powered-by");
  // Signature verification must receive Shopify's exact raw JSON bytes.
  app.use(express.raw({ type: "*/*", limit: "1mb" }));

  app.post(
    ["/", "/.netlify/functions/shopify-catalog-webhook", "/webhooks/shopify/catalog"],
    async (req: Request, res: Response) => {
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (!secret) {
      return res.status(503).json({ error: "Shopify webhook secret is not configured" });
    }
    if (!process.env.NETLIFY_BUILD_HOOK_URL) {
      return res.status(503).json({ error: "Catalog rebuild hook is not configured" });
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === "string" ? req.body : "");
    if (
      !verifyShopifyWebhookSignature(
        rawBody,
        req.get("x-shopify-hmac-sha256"),
        secret,
      )
    ) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    const topic = req.get("x-shopify-topic") || "";
    if (!catalogTopics.has(topic)) {
      return res.status(204).end();
    }

    try {
      const result = await coalescer.request(
        req.get("x-shopify-webhook-id") || undefined,
        triggerNetlifyBuild,
      );
      return res.status(result.triggered ? 202 : 200).json({
        received: true,
        rebuild: result.reason,
      });
    } catch (error) {
      console.error("[Shopify webhook] Catalog rebuild failed:", error);
      return res.status(502).json({ error: "Catalog rebuild could not be requested" });
    }
    },
  );

  return app;
}

export const handler = serverless(createShopifyCatalogWebhookApp());