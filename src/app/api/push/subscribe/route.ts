import { NextResponse } from "next/server";
import { getOptionalKvClient } from "@/lib/kv";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { requireUser, UnauthenticatedError } from "@/server/auth/requireUser";
import { savePushSubscriptionForOwnDevice } from "@/server/devices/savePushSubscriptionForOwnDevice";

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

async function writeKvSubscription(
  kv: NonNullable<ReturnType<typeof getOptionalKvClient>>,
  deviceId: string,
  sub: PushSubscriptionJSON
) {
  await kv.set(subKeyForDevice(deviceId), sub);
  await kv.sadd(DEVICES_SET_KEY, deviceId);
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
    const rawDeviceId = resolveDeviceId(body);

    if (!sub) {
      return NextResponse.json({ ok: false, error: "Missing endpoint" }, { status: 400 });
    }

    try {
      await requireUser();
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return NextResponse.json(
          {
            ok: false,
            remindersEnabled: false,
            error: "Your session expired. Please sign in again.",
          },
          { status: 401 }
        );
      }

      throw error;
    }

    // Canonical PostgreSQL ownership must succeed before any operational KV
    // state is written — no fallback to the raw client-supplied deviceId on
    // failure. This is what keeps the invariant "KV push state never exists
    // without a successfully persisted canonical DB ownership record" true,
    // rather than aspirational.
    const dbResult = await savePushSubscriptionForOwnDevice({
      candidateDeviceId: rawDeviceId,
      endpoint: sub.endpoint,
      p256dh: sub.keys?.p256dh ?? "",
      authKey: sub.keys?.auth ?? "",
    });

    if (!dbResult.ok) {
      return NextResponse.json(
        { ok: false, remindersEnabled: false, error: dbResult.message },
        { status: 409 }
      );
    }

    const deviceId = dbResult.deviceId;

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

    await writeKvSubscription(kv, deviceId, sub);

    return NextResponse.json({ ok: true, deviceId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    return NextResponse.json({
      ok: false,
      remindersEnabled: false,
      error: message,
    });
  }
}
