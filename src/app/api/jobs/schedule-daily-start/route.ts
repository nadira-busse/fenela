import { NextResponse } from "next/server";
import { getOptionalKvClient } from "@/lib/kv";
import type { PushSubscription } from "web-push";

import { DEVICES_SET_KEY, makeJob, storeJobForDevice, removeJobForDevice } from "@/lib/jobs";
import { nextZonedOccurrenceMs } from "@/lib/timezone";
import { checkRateLimit } from "@/lib/rateLimit";
import { requireUser, UnauthenticatedError } from "@/server/auth/requireUser";
import { verifyOwnDevice } from "@/server/devices/verifyOwnDevice";
import { getOwnReminderPreference } from "@/server/reminders/getOwnReminderPreference";
import { getOwnUserPreference } from "@/server/preferences/getOwnUserPreference";
import { mapDbStartTimeToAppFormat } from "@/lib/reminderPreferenceMapping";

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
    };

    const deviceId = body.deviceId;

    if (!deviceId) {
      return NextResponse.json({ ok: false, error: "Missing deviceId" }, { status: 400 });
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

    // Scheduling derives start_time/timezone from the canonical DB reminder
    // preference and the user's own canonical timezone — never from a
    // client-supplied value. The caller-supplied deviceId is only a
    // candidate: it must be verified to belong to the authenticated user
    // before it is used for anything.
    const ownsDevice = await verifyOwnDevice(deviceId);

    if (!ownsDevice) {
      return NextResponse.json(
        {
          ok: false,
          remindersEnabled: false,
          error: "This device is not linked to your account. Please turn reminders on again.",
        },
        { status: 403 }
      );
    }

    const reminderPreference = await getOwnReminderPreference();

    if (!reminderPreference || !reminderPreference.enabled) {
      return NextResponse.json(
        {
          ok: false,
          remindersEnabled: false,
          error: "Daily reminders are not enabled for your account yet.",
        },
        { status: 409 }
      );
    }

    const userPreference = await getOwnUserPreference();

    if (!userPreference) {
      return NextResponse.json(
        {
          ok: false,
          remindersEnabled: false,
          error: "Could not determine your timezone. Please try again.",
        },
        { status: 409 }
      );
    }

    const startTime = mapDbStartTimeToAppFormat(reminderPreference.start_time);
    const timeZone = userPreference.time_zone;

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
    const dueAt = nextZonedOccurrenceMs(startTime, now, timeZone);

    const job = makeJob({
      dueAt,
      kind: "DAILY_START",
      payload: {
        title: "Fenéla",
        body: "Start with one small anchor.",
        url: "/",
      },
      meta: { startTime, timeZone },
    });

    await storeJobForDevice(deviceId, job);
    await kv.set(DAILY_START_POINTER_KEY(deviceId), job.id);

    console.log("dailyStart.scheduled", {
      deviceId,
      jobId: job.id,
      startTime,
      timeZone,
      dueAt,
      dueAtIso: new Date(dueAt).toISOString(),
    });

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      dueAt,
      dueAtIso: new Date(dueAt).toISOString(),
      startTime,
      timeZone,
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
