// Shared KV-only operational cleanup for a Device's push delivery state.
// Extracted from src/app/api/cron/push/route.ts's terminal-subscription
// cleanup so the authenticated sign-out path can reuse it without
// duplication. Touches KV only; canonical PostgreSQL
// PushSubscription deletion is a separate, caller-owned step (the cron
// route uses the privileged admin client; the authenticated sign-out route
// uses the normal RLS-scoped client — see
// src/server/devices/deletePushSubscriptionByDeviceId.ts and
// src/server/devices/deleteOwnPushSubscription.ts).
//
// Idempotent: removing already-absent KV keys/set-members/zset-members is
// a no-op in a Redis-compatible store, so calling this twice for the same
// device is safe.
//
// By default, the job-removal steps below are best effort: job zset lookup
// and each per-job removal swallow their own errors because cron cleanup and
// sign-out must never let a KV hiccup block their own unrelated job
// (draining due jobs, letting the user leave their session). Account
// deletion has the opposite requirement: it must not
// proceed to the irreversible auth.users delete while believing cleanup
// succeeded when it didn't. `strict: true` lets a Device's zset lookup or
// job removal failure propagate instead of being swallowed. Cron and
// sign-out retain the non-strict default.

import { getKvClient } from "@/lib/kv";
import { DEVICES_SET_KEY, removeJobForDevice } from "@/lib/jobs";

const SUB_KEY = (deviceId: string) => `push:sub:${deviceId}`;
const DAILY_START_POINTER_KEY = (deviceId: string) => `push:dailyStart:jobId:${deviceId}`;
const DEVICE_JOBS_ZSET_KEY = (deviceId: string) => `push:jobs:${deviceId}:zset`;

export type CleanupOperationalPushStateOptions = {
  // A job id known to be relevant even if it might not (yet) appear in the
  // device's job zset — e.g. the cron route's currently-failing job,
  // unioned defensively with whatever the zset lookup returns.
  additionalJobIds?: string[];

  // Fail-closed mode for callers (account deletion) that must distinguish
  // "cleanup actually succeeded" from "a step silently failed." Defaults to
  // false so existing cron/sign-out best-effort semantics are unchanged.
  strict?: boolean;
};

export async function cleanupOperationalPushState(
  deviceId: string,
  options: CleanupOperationalPushStateOptions = {}
): Promise<{ cleanedJobs: number; jobCleanupComplete: boolean }> {
  const kv = getKvClient();
  const strict = options.strict ?? false;

  let zsetJobIds: string[] = [];
  // Tracks whether job cleanup for this pass is
  // fully confirmed, not just attempted. In strict mode this is moot — any
  // failure throws immediately below, so the code that reads this flag is
  // never reached. In non-strict mode, this is what the final device-set
  // removal below is gated on (see that step's own comment for why).
  let jobCleanupComplete = true;

  try {
    zsetJobIds = (await kv.zrange(DEVICE_JOBS_ZSET_KEY(deviceId), 0, -1)) as string[];
  } catch (error) {
    if (strict) throw error;
    jobCleanupComplete = false;
  }

  const uniqueJobIds = Array.from(
    new Set([...(options.additionalJobIds ?? []), ...(zsetJobIds ?? [])])
  );

  let cleanedJobs = 0;

  for (const jobId of uniqueJobIds) {
    try {
      await removeJobForDevice(deviceId, jobId);
      cleanedJobs++;
    } catch (error) {
      if (strict) throw error;
      jobCleanupComplete = false;
    }
  }

  await kv.del(SUB_KEY(deviceId));
  await kv.del(DAILY_START_POINTER_KEY(deviceId));

  // Only drop the device from the discovery index once job cleanup for
  // this pass is confirmed complete. Every path that can ever rediscover and
  // clean up leftover job state — cron's own periodic drain, and both
  // scripts/cleanup-*.mjs maintenance scripts — enumerates devices
  // exclusively through this same DEVICES_SET_KEY set, never through a raw
  // key scan. Removing the device here despite an unconfirmed job-cleanup
  // failure would permanently strand any leftover job/zset state: nothing
  // in this codebase would ever enumerate that device again to retry. A
  // device left in the set costs nothing beyond being revisited (and
  // idempotently re-cleaned) by a future pass.
  if (jobCleanupComplete) {
    await kv.srem(DEVICES_SET_KEY, deviceId);
  }

  return { cleanedJobs, jobCleanupComplete };
}
