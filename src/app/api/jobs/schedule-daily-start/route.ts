import { NextResponse } from "next/server";
import { getOptionalKvClient } from "@/lib/kv";
import type { PushSubscription } from "web-push";

import { DEVICES_SET_KEY, makeJob, storeJobForDevice, removeJobForDevice } from "@/lib/jobs";
import { REMINDER_TIME_ZONE, parseHHMM, nextAmsterdamOccurrenceMs } from "@/lib/timezone";
import { checkRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const DAILY_START_POINTER_KEY = (deviceId: string) => `push:dailyStart:jobId:${deviceId}`;
const SUB_KEY = (deviceId: string) => `push:sub:${deviceId}`;

export async function POST(req: Request) {
  try {
    const kv = getOptionalKvClient();

    if (!kv) {
      return NextResponse.json({
        ok: false,
        remindersEnabled: false,
        error: "KV storage is not configured. Daily reminder scheduling was skipped.",
      });
    }

    const body = (await req.json().catch(() => ({}))) as {
      deviceId?: string;
      startTime?: string;
    };

    const deviceId = body.deviceId;
    const startTime = body.startTime ?? "08:00";

    if (!deviceId) {
      return NextResponse.json({ ok: false, error: "Missing deviceId" }, { status: 400 });
    }

    if (!parseHHMM(startTime)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid startTime. Expected 'HH:MM' (e.g. '08:00').",
        },
        { status: 400 }
      );
    }

    const subscription = await kv.get<PushSubscription>(SUB_KEY(deviceId));

    if (!subscription?.endpoint) {
      return NextResponse.json(
        {
          ok: false,
          remindersEnabled: false,
          error:
            "No push subscription found for this device. Subscribe before scheduling daily reminders.",
        },
        { status: 409 }
      );
    }

    // Requiring an existing subscription (above) already bounds most abuse
    // here, since push/subscribe has its own per-device + per-IP limit.
    // This adds a per-device limit on top for the same reason as the other
    // routes: consistency, and protection against a legitimate device
    // re-scheduling in a tight loop (e.g. a UI bug retrying repeatedly).
    const allowed = await checkRateLimit({
      key: `rate:schedule-daily-start:device:${deviceId}`,
      limit: 20,
      windowSeconds: 60 * 60,
    });

    if (!allowed) {
      return NextResponse.json(
        { ok: false, remindersEnabled: false, error: "Too many reminder requests." },
        { status: 429 }
      );
    }

    await kv.sadd(DEVICES_SET_KEY, deviceId);

    const prevJobId = await kv.get<string>(DAILY_START_POINTER_KEY(deviceId));

    if (prevJobId) {
      await removeJobForDevice(deviceId, prevJobId).catch(() => {});
    }

    const now = Date.now();
    const dueAt = nextAmsterdamOccurrenceMs(startTime, now);

    const job = makeJob({
      dueAt,
      kind: "DAILY_START",
      payload: {
        title: "Fenéla",
        body: "Start with one small anchor.",
        url: "/",
      },
      meta: { startTime, timeZone: REMINDER_TIME_ZONE },
    });

    await storeJobForDevice(deviceId, job);
    await kv.set(DAILY_START_POINTER_KEY(deviceId), job.id);

    console.log("dailyStart.scheduled", {
      deviceId,
      jobId: job.id,
      startTime,
      timeZone: REMINDER_TIME_ZONE,
      dueAt,
      dueAtIso: new Date(dueAt).toISOString(),
    });

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      dueAt,
      dueAtIso: new Date(dueAt).toISOString(),
      startTime,
      timeZone: REMINDER_TIME_ZONE,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json({
      ok: false,
      remindersEnabled: false,
      error: message,
    });
  }
}
