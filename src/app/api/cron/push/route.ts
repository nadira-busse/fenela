import { NextRequest, NextResponse } from "next/server";
import { getKvClient } from "@/lib/kv";
import type { PushSubscription } from "web-push";

import {
  DEVICES_SET_KEY,
  getDueJobIdsForDevice,
  getJobForDevice,
  removeJobForDevice,
  storeJobForDevice,
  makeJob,
  type Job,
} from "@/lib/jobs";
import { sendPush } from "@/lib/pushSend";
import { REMINDER_TIME_ZONE, nextZonedOccurrenceMs } from "@/lib/timezone";
import { classifyPushError } from "@/lib/pushErrorClassification";
import { deletePushSubscriptionByDeviceId } from "@/server/devices/deletePushSubscriptionByDeviceId";
import { cleanupOperationalPushState } from "@/lib/pushOperationalCleanup";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";

export const runtime = "nodejs";

const SUB_KEY = (deviceId: string) => `push:sub:${deviceId}`;
const DAILY_START_POINTER_KEY = (deviceId: string) => `push:dailyStart:jobId:${deviceId}`;

function getErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;

  if (err instanceof Error) {
    return err.message;
  }

  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

async function rescheduleDailyStartJob(job: Job, deviceId: string, now: number) {
  const kv = getKvClient();
  const startTime = (job.meta?.startTime as string) || "08:00";
  // The timezone travels with the job (Phase 4D §8/§16): schedule-daily-start
  // stores the user's own canonical timezone (or REMINDER_TIME_ZONE for the
  // unauthenticated/legacy path) into job.meta at creation time, so
  // rescheduling here reuses it instead of re-deriving it — this route has
  // no per-request auth context to look up a canonical preference itself.
  // A job created before this field existed falls back to REMINDER_TIME_ZONE.
  const timeZone = (job.meta?.timeZone as string) || REMINDER_TIME_ZONE;
  const nextDueAt = nextZonedOccurrenceMs(startTime, now, timeZone);

  const nextJob = makeJob({
    dueAt: nextDueAt,
    kind: "DAILY_START",
    payload: job.payload,
    meta: {
      startTime,
      timeZone,
    },
  });

  await storeJobForDevice(deviceId, nextJob);
  await kv.set(DAILY_START_POINTER_KEY(deviceId), nextJob.id);

  console.log("dailyStart.rescheduled", {
    deviceId,
    previousJobId: job.id,
    nextJobId: nextJob.id,
    startTime,
    timeZone,
    nextDueAt,
    nextDueAtIso: new Date(nextDueAt).toISOString(),
  });
}

// Runs only for a TERMINAL_INVALID_SUBSCRIPTION push error (Phase 4D
// hardening §4) — the push service has confirmed this endpoint no longer
// exists, so both the operational KV state and the canonical PostgreSQL
// PushSubscription row are removed. The Device row itself is preserved
// (§6): the device still belongs to the user, it just currently has no
// working subscription — the next successful subscribe recreates one
// under the same Device via savePushSubscriptionForOwnDevice's upsert.
//
// Ordering/consistency trade-off (§10): KV cleanup runs first and always
// completes regardless of the DB outcome. Leaving KV state for an
// endpoint the push service has already confirmed dead guarantees a
// repeated failed delivery attempt on every future cron run — strictly
// worse than a transient DB/KV disagreement, which is both idempotent to
// retry (a second delete of an already-gone row is still success) and
// self-heals the next time the user re-subscribes. A DB cleanup failure
// is therefore logged clearly, not silently swallowed, rather than rolling
// back the KV cleanup or pretending the row is still consistent.
async function cleanupTerminalSubscription(
  deviceId: string,
  currentJobId: string
): Promise<{ cleanedJobs: number; dbCleanupOk: boolean; dbCleanupMessage?: string }> {
  const { cleanedJobs } = await cleanupOperationalPushState(deviceId, {
    additionalJobIds: [currentJobId],
  });

  const dbResult = await deletePushSubscriptionByDeviceId(deviceId);

  console.log("pushDevice.cleanedAfterTerminalFailure", {
    deviceId,
    cleanedJobs,
    dbCleanupOk: dbResult.ok,
    dbCleanupMessage: dbResult.ok ? undefined : dbResult.message,
  });

  return {
    cleanedJobs,
    dbCleanupOk: dbResult.ok,
    dbCleanupMessage: dbResult.ok ? undefined : dbResult.message,
  };
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ ok: false, error: "Missing CRON_SECRET" }, { status: 500 });
  }

  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const kv = getKvClient();
    const deviceIds = await kv.smembers<string[]>(DEVICES_SET_KEY);
    const now = Date.now();

    let processed = 0;
    const devicesCount = deviceIds?.length ?? 0;

    let dueIdCount = 0;
    let skippedNoSub = 0;
    let skippedNotDue = 0;

    let cleanedMissingJob = 0;
    let cleanedPointerMismatch = 0;
    let dailyRescheduled = 0;

    let terminalFailures = 0;
    let transientFailures = 0;
    let cleanedTerminalJob = 0;
    let cleanedTerminalDevice = 0;
    const pushErrors: string[] = [];
    const dbCleanupErrors: string[] = [];

    if (!deviceIds || deviceIds.length === 0) {
      const result = {
        ok: true,
        processed: 0,
        mode: "multi-device",
        devicesCount: 0,
        dueIdCount: 0,
        skippedNoSub,
        skippedNotDue,
        cleanedMissingJob,
        cleanedPointerMismatch,
        dailyRescheduled,
        terminalFailures,
        transientFailures,
        cleanedTerminalJob,
        cleanedTerminalDevice,
        pushErrors,
        dbCleanupErrors,
      };

      console.log("cron.push.result", result);

      return NextResponse.json(result);
    }

    for (const deviceId of deviceIds) {
      const subscription = await kv.get<PushSubscription>(SUB_KEY(deviceId));

      if (!subscription?.endpoint) {
        skippedNoSub++;
        continue;
      }

      const dueIds = await getDueJobIdsForDevice(deviceId, now, 25);
      dueIdCount += dueIds.length;

      if (dueIds.length === 0) {
        continue;
      }

      const pointerJobId = await kv.get<string>(DAILY_START_POINTER_KEY(deviceId));

      for (const id of dueIds) {
        const job = await getJobForDevice(deviceId, id);

        if (!job) {
          await removeJobForDevice(deviceId, id);
          cleanedMissingJob++;
          continue;
        }

        if (job.dueAt > now) {
          skippedNotDue++;
          continue;
        }

        if (job.kind === "DAILY_START" && pointerJobId && id !== pointerJobId) {
          await removeJobForDevice(deviceId, id);
          cleanedPointerMismatch++;
          continue;
        }

        try {
          await sendPush(subscription, job.payload);

          await removeJobForDevice(deviceId, id);
          processed++;

          if (job.kind === "DAILY_START") {
            await rescheduleDailyStartJob(job, deviceId, now);
            dailyRescheduled++;
          }
        } catch (pushErr) {
          const message = getErrorMessage(pushErr);
          pushErrors.push(message);

          if (classifyPushError(pushErr) === "TERMINAL_INVALID_SUBSCRIPTION") {
            terminalFailures++;

            const cleanup = await cleanupTerminalSubscription(deviceId, id);

            cleanedTerminalJob += cleanup.cleanedJobs;
            cleanedTerminalDevice++;

            if (!cleanup.dbCleanupOk && cleanup.dbCleanupMessage) {
              dbCleanupErrors.push(cleanup.dbCleanupMessage);
            }

            if (job.kind === "DAILY_START") {
              console.log("dailyStart.notRescheduledAfterTerminalFailure", {
                deviceId,
                jobId: job.id,
              });
            }

            continue;
          }

          // Non-terminal (network error, 429, 5xx, config/provider error,
          // or any other status): the subscription, Device and canonical
          // PushSubscription row are all preserved (Phase 4D hardening §4).
          transientFailures++;

          await removeJobForDevice(deviceId, id);

          if (job.kind === "DAILY_START") {
            // A transient delivery failure must not permanently disable
            // the user's recurring daily reminder (§5/§9) — the next
            // normal occurrence is scheduled exactly as it would be after
            // a successful delivery.
            await rescheduleDailyStartJob(job, deviceId, now);
            dailyRescheduled++;
          }
          // TASK_REMINDER: smallest existing best-effort behavior — a
          // missed one-shot, time-sensitive check-in nudge is simply
          // dropped rather than retried (§5). Unlike DAILY_START this is
          // not a recurring schedule, so there is no "next occurrence" to
          // preserve, and building bounded-retry machinery around
          // Job.attempts for an optional, already-best-effort nudge would
          // be a new retry subsystem this phase does not call for.

          continue;
        }
      }
    }

    const result = {
      ok: true,
      processed,
      mode: "multi-device",
      devicesCount,
      dueIdCount,
      skippedNoSub,
      skippedNotDue,
      cleanedMissingJob,
      cleanedPointerMismatch,
      dailyRescheduled,
      terminalFailures,
      transientFailures,
      cleanedTerminalJob,
      cleanedTerminalDevice,
      pushErrors: pushErrors.slice(0, 5),
      dbCleanupErrors: dbCleanupErrors.slice(0, 5),
    };

    console.log("cron.push.result", result);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = getErrorMessage(err);

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
