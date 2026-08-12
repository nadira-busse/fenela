import { NextResponse } from "next/server";
import { getOptionalKvClient } from "@/lib/kv";
import { DEVICES_SET_KEY, makeJob, storeJobForDevice } from "@/lib/jobs";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { requireUser, UnauthenticatedError } from "@/server/auth/requireUser";
import { verifyOwnDevice } from "@/server/devices/verifyOwnDevice";

export const runtime = "nodejs";

// Rate limiting below bounds how many jobs a device or IP can create per
// hour, but not the size of any single job's payload. These limits close
// that gap so one allowed request cannot still store an unbounded record.
const DEFAULT_DUE_IN_MS = 30 * 60 * 1000;
const MAX_DUE_IN_MS = 24 * 60 * 60 * 1000;
const MAX_TITLE_LENGTH = 80;
const MAX_BODY_LENGTH = 240;

type Body = {
  deviceId: string;
  dueInMs?: number;
  payload?: {
    title?: string;
    body?: string;
    url?: string;
  };
};

export async function POST(req: Request) {
  try {
    const kv = getOptionalKvClient();

    if (!kv) {
      return NextResponse.json({
        ok: false,
        remindersEnabled: false,
        error: "KV storage is not configured. Reminder scheduling was skipped.",
      });
    }

    const body = (await req.json().catch(() => ({}))) as Body;

    const deviceId =
      typeof body.deviceId === "string" && body.deviceId.length > 0 ? body.deviceId : null;

    if (!deviceId) {
      return NextResponse.json({ ok: false, error: "Missing deviceId" }, { status: 400 });
    }

    try {
      await requireUser();
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return NextResponse.json(
          { ok: false, error: "Your session expired. Please sign in again." },
          { status: 401 }
        );
      }

      throw error;
    }

    // Caller-supplied deviceId is not authorization proof: a request must
    // operate only on a Device the authenticated caller owns.
    const ownsDevice = await verifyOwnDevice(deviceId);

    if (!ownsDevice) {
      return NextResponse.json(
        { ok: false, error: "This device is not linked to your account." },
        { status: 403 }
      );
    }

    // This route never checks for an existing push subscription (unlike
    // schedule-daily-start), so it's the most open write in the app. Same
    // per-device + per-IP layering as push/subscribe, for the same reason:
    // deviceId alone doesn't stop someone using a fresh one each request.
    const deviceAllowed = await checkRateLimit({
      key: `rate:schedule-reminder:device:${deviceId}`,
      limit: 20,
      windowSeconds: 60 * 60,
    });

    const ipAllowed = await checkRateLimit({
      key: `rate:schedule-reminder:ip:${getClientIp(req)}`,
      limit: 40,
      windowSeconds: 60 * 60,
    });

    if (!deviceAllowed || !ipAllowed) {
      return NextResponse.json(
        { ok: false, error: "Too many reminder requests." },
        { status: 429 }
      );
    }

    await kv.sadd(DEVICES_SET_KEY, deviceId);

    const dueInMs =
      typeof body.dueInMs === "number" &&
      Number.isFinite(body.dueInMs) &&
      body.dueInMs > 0 &&
      body.dueInMs <= MAX_DUE_IN_MS
        ? body.dueInMs
        : DEFAULT_DUE_IN_MS;

    const title =
      typeof body.payload?.title === "string"
        ? body.payload.title.trim().slice(0, MAX_TITLE_LENGTH)
        : "";

    const reminderBody =
      typeof body.payload?.body === "string"
        ? body.payload.body.trim().slice(0, MAX_BODY_LENGTH)
        : "";

    const url =
      typeof body.payload?.url === "string" && body.payload.url.startsWith("/")
        ? body.payload.url
        : "/";

    const dueAt = Date.now() + dueInMs;

    const job = makeJob({
      dueAt,
      kind: "TASK_REMINDER",
      payload: {
        title: title || "Fenéla",
        body: reminderBody || "Quick check-in: did you do it?",
        url,
      },
    });

    await storeJobForDevice(deviceId, job);

    return NextResponse.json({ ok: true, jobId: job.id, dueAt, deviceId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    return NextResponse.json({
      ok: false,
      remindersEnabled: false,
      error: message,
    });
  }
}
