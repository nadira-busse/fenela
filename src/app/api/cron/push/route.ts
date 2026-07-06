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
import { REMINDER_TIME_ZONE, nextAmsterdamOccurrenceMs } from "@/lib/timezone";

export const runtime = "nodejs";

const SUB_KEY = (deviceId: string) => `push:sub:${deviceId}`;
const DAILY_START_POINTER_KEY = (deviceId: string) => `push:dailyStart:jobId:${deviceId}`;
const DEVICE_JOBS_ZSET_KEY = (deviceId: string) => `push:jobs:${deviceId}:zset`;

function isAuthorizedCronRequest(req: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET?.trim();

  if (!expectedSecret) {
    return false;
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const receivedToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  return receivedToken === expectedSecret;
}

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
  const nextDueAt = nextAmsterdamOccurrenceMs(startTime, now);

  const nextJob = makeJob({
    dueAt: nextDueAt,
    kind: "DAILY_START",
    payload: job.payload,
    meta: {
      startTime,
      timeZone: REMINDER_TIME_ZONE,
    },
  });

  await storeJobForDevice(deviceId, nextJob);
  await kv.set(DAILY_START_POINTER_KEY(deviceId), nextJob.id);

  console.log("dailyStart.rescheduled", {
    deviceId,
    previousJobId: job.id,
    nextJobId: nextJob.id,
    startTime,
    timeZone: REMINDER_TIME_ZONE,
    nextDueAt,
    nextDueAtIso: new Date(nextDueAt).toISOString(),
  });
}

async function cleanupDeviceAfterFailedPush(
  deviceId: string,
  currentJobId: string
): Promise<number> {
  const kv = getKvClient();
  const jobIds = (await kv
    .zrange(DEVICE_JOBS_ZSET_KEY(deviceId), 0, -1)
    .catch(() => [])) as string[];

  const uniqueJobIds = Array.from(new Set([currentJobId, ...(jobIds ?? [])]));

  let cleanedJobs = 0;

  for (const jobId of uniqueJobIds) {
    await removeJobForDevice(deviceId, jobId).catch(() => {});
    cleanedJobs++;
  }

  await kv.del(SUB_KEY(deviceId));
  await kv.srem(DEVICES_SET_KEY, deviceId);
  await kv.del(DAILY_START_POINTER_KEY(deviceId));

  console.log("pushDevice.cleanedAfterFailedPush", {
    deviceId,
    cleanedJobs,
  });

  return cleanedJobs;
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

    let failedPush = 0;
    let cleanedFailedPushJob = 0;
    let cleanedFailedPushDevice = 0;
    const pushErrors: string[] = [];

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
        failedPush,
        cleanedFailedPushJob,
        cleanedFailedPushDevice,
        pushErrors,
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
          failedPush++;

          const message = getErrorMessage(pushErr);
          pushErrors.push(message);

          const cleanedJobs = await cleanupDeviceAfterFailedPush(deviceId, id);

          cleanedFailedPushJob += cleanedJobs;
          cleanedFailedPushDevice++;

          if (job.kind === "DAILY_START") {
            console.log("dailyStart.notRescheduledAfterFailedPush", {
              deviceId,
              jobId: job.id,
            });
          }

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
      failedPush,
      cleanedFailedPushJob,
      cleanedFailedPushDevice,
      pushErrors: pushErrors.slice(0, 5),
    };

    console.log("cron.push.result", result);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = getErrorMessage(err);

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
