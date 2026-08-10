// Shared KV-only operational cleanup for a Device's push delivery state.
// Extracted from src/app/api/cron/push/route.ts's terminal-subscription
// cleanup (Phase 4D hardening §4) so the same logic is reusable by the
// authenticated sign-out cleanup path (Phase 4D final hardening §5)
// without duplicating it. Touches KV only — canonical PostgreSQL
// PushSubscription deletion is a separate, caller-owned step (the cron
// route uses the privileged admin client; the authenticated sign-out route
// uses the normal RLS-scoped client — see
// src/server/devices/deletePushSubscriptionByDeviceId.ts and
// src/server/devices/deleteOwnPushSubscription.ts).
//
// Idempotent: removing already-absent KV keys/set-members/zset-members is
// a no-op in a Redis-compatible store, so calling this twice for the same
// device is safe.

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
};

export async function cleanupOperationalPushState(
  deviceId: string,
  options: CleanupOperationalPushStateOptions = {}
): Promise<{ cleanedJobs: number }> {
  const kv = getKvClient();

  const zsetJobIds = (await kv
    .zrange(DEVICE_JOBS_ZSET_KEY(deviceId), 0, -1)
    .catch(() => [])) as string[];

  const uniqueJobIds = Array.from(
    new Set([...(options.additionalJobIds ?? []), ...(zsetJobIds ?? [])])
  );

  let cleanedJobs = 0;

  for (const jobId of uniqueJobIds) {
    await removeJobForDevice(deviceId, jobId).catch(() => {});
    cleanedJobs++;
  }

  await kv.del(SUB_KEY(deviceId));
  await kv.srem(DEVICES_SET_KEY, deviceId);
  await kv.del(DAILY_START_POINTER_KEY(deviceId));

  return { cleanedJobs };
}
