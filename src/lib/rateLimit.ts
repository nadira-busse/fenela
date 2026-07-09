// src/lib/rateLimit.ts
//
// Small, shared rate-limit helper built on the existing KV store (no new
// dependency). Used to bound how often device-based, publicly callable
// routes (AI generation, push subscription, reminder scheduling) can be
// hit, so a single device or IP cannot drive unbounded OpenAI cost or
// unbounded KV storage growth.
//
// Fail-open by design: if KV isn't configured, or the check itself errors,
// the request is allowed through. A rate limiter should never become the
// reason a core flow breaks.
//
// Known limitation: keys based on deviceId are client-supplied and not
// cryptographically verified. This bounds repeated use from the same
// device, not deliberate abuse via a freshly generated deviceId per
// request. See the per-route comments for how each route layers IP-based
// limiting on top where that distinction matters.

import { getOptionalKvClient } from "@/lib/kv";

type RateLimitInput = {
  key: string;
  limit: number;
  windowSeconds: number;
};

export async function checkRateLimit({
  key,
  limit,
  windowSeconds,
}: RateLimitInput): Promise<boolean> {
  const kv = getOptionalKvClient();

  if (!kv) {
    return true;
  }

  try {
    const count = await kv.incr(key);

    if (count === 1) {
      await kv.expire(key, windowSeconds);
    }

    return count <= limit;
  } catch {
    return true;
  }
}

// Vercel populates x-forwarded-for reliably for deployed functions. Falls
// back to a shared "unknown" bucket (not an open bypass) if it's absent,
// e.g. in some local/dev contexts.
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim() || "unknown";
  }

  return "unknown";
}
