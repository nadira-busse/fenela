import { NextResponse } from "next/server";
import { getOptionalKvClient } from "@/lib/kv";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";

type PushSubscriptionJSON = {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

type SubscribeBody =
  | PushSubscriptionJSON
  | {
      subscription: PushSubscriptionJSON;
      deviceId?: string;
    };

const DEVICES_SET_KEY = "push:devices:set";

function subKeyForDevice(deviceId: string) {
  return `push:sub:${deviceId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPushSubscriptionJSON(value: unknown): value is PushSubscriptionJSON {
  return isRecord(value) && typeof value.endpoint === "string" && value.endpoint.length > 0;
}

function resolveSubscription(body: SubscribeBody): PushSubscriptionJSON | null {
  if (isPushSubscriptionJSON(body)) {
    return body;
  }

  if (isRecord(body) && isPushSubscriptionJSON(body.subscription)) {
    return body.subscription;
  }

  return null;
}

function resolveDeviceId(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const deviceId = value.deviceId;

  if (typeof deviceId === "string" && deviceId.length > 0) {
    return deviceId;
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const kv = getOptionalKvClient();

    if (!kv) {
      return NextResponse.json({
        ok: false,
        remindersEnabled: false,
        error: "KV storage is not configured. Push subscription was skipped.",
      });
    }

    const body = (await req.json()) as SubscribeBody;
    const sub = resolveSubscription(body);
    const deviceId = resolveDeviceId(body);

    if (!sub) {
      return NextResponse.json({ ok: false, error: "Missing endpoint" }, { status: 400 });
    }

    if (deviceId) {
      // Per-device limit catches accidental repeat calls from the same
      // real device. Per-IP limit matters more here: deviceId is
      // client-supplied, so the natural way to bulk-register junk
      // subscriptions is a fresh deviceId per request, which a per-device
      // limit alone would never catch.
      const deviceAllowed = await checkRateLimit({
        key: `rate:push-subscribe:device:${deviceId}`,
        limit: 10,
        windowSeconds: 60 * 60,
      });

      const ipAllowed = await checkRateLimit({
        key: `rate:push-subscribe:ip:${getClientIp(req)}`,
        limit: 20,
        windowSeconds: 60 * 60,
      });

      if (!deviceAllowed || !ipAllowed) {
        return NextResponse.json(
          { ok: false, remindersEnabled: false, error: "Too many subscription attempts." },
          { status: 429 }
        );
      }

      await kv.set(subKeyForDevice(deviceId), sub);
      await kv.sadd(DEVICES_SET_KEY, deviceId);
      return NextResponse.json({ ok: true, deviceId });
    }

    return NextResponse.json({ ok: false, error: "Missing deviceId" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    return NextResponse.json({
      ok: false,
      remindersEnabled: false,
      error: message,
    });
  }
}
