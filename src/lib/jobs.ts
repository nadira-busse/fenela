// src/lib/jobs.ts
import { randomUUID } from "crypto";
import { getKvClient } from "@/lib/kv";

export type JobKind = "TEST" | "TASK_REMINDER" | "DAILY_START";

export type Job = {
  id: string;
  dueAt: number; // epoch ms
  kind: JobKind;
  payload: { title: string; body: string; url: string };
  attempts: number;

  // optional metadata, for example the selected daily start time
  meta?: Record<string, unknown>;
};

export const DEVICES_SET_KEY = "push:devices:set";

const JOB_KEY = (deviceId: string, id: string) => `push:job:${deviceId}:${id}`;
const ZSET_KEY = (deviceId: string) => `push:jobs:${deviceId}:zset`;

export function makeJob(input: Omit<Job, "id" | "attempts">): Job {
  return { ...input, id: randomUUID(), attempts: 0 };
}

// Order matters: write the discoverability index before the job body. If set
// fails after zadd already succeeded, the result is a zset member with no
// backing job object — already a normal, harmless partial-write state that
// remains discoverable and is handled by the existing cleanup paths
// (getJobForDevice returns null for it, and the existing "job === null"
// branches in cron's drain loop and cleanupOperationalPushState already
// clean it up). The reverse order (set first) risks the opposite and far
// worse shape if zadd then fails: a job key that exists but is not indexed
// in the zset at all — invisible to every discovery mechanism in this
// codebase (cron's own due-time scan, cleanupOperationalPushState's
// full-range scan, and both scripts/cleanup-*.mjs maintenance scripts all
// enumerate jobs via this same zset, never via a raw key scan), so it would
// never be found or cleaned by anything short of a keyspace scan.
export async function storeJobForDevice(deviceId: string, job: Job) {
  const kv = getKvClient();

  await kv.zadd(ZSET_KEY(deviceId), { score: job.dueAt, member: job.id });
  await kv.set(JOB_KEY(deviceId, job.id), job);
}

export async function getDueJobIdsForDevice(
  deviceId: string,
  nowMs: number,
  limit = 25
): Promise<string[]> {
  const kv = getKvClient();

  return await kv.zrange<string[]>(ZSET_KEY(deviceId), 0, nowMs, {
    byScore: true,
    offset: 0,
    count: limit,
  });
}

export async function getJobForDevice(deviceId: string, id: string): Promise<Job | null> {
  const kv = getKvClient();

  return await kv.get<Job>(JOB_KEY(deviceId, id));
}

// Order matters, mirroring storeJobForDevice: delete the job body before
// its discoverability index entry. If zrem fails
// after del already succeeded, the result is a zset member with no backing
// job object — the same safe, discoverable partial state that
// storeJobForDevice's ordering also converges on (see its own header).
// The reverse order (zrem first) risks the opposite shape if del then
// fails: a job key that still exists, fully intact with its real payload,
// but is no longer indexed in the zset — invisible to every discovery
// mechanism in this codebase for the same reason described there. If del
// itself fails (the first operation), zrem is never attempted — nothing
// changes: the job object was never touched, so it remains exactly as safe
// and retry-friendly. (If del instead succeeds and
// zrem is what fails, the job is not "fully intact" — its object is
// already gone; see the phantom-member case immediately above.)
export async function removeJobForDevice(deviceId: string, id: string) {
  const kv = getKvClient();

  await kv.del(JOB_KEY(deviceId, id));
  await kv.zrem(ZSET_KEY(deviceId), id);
}

export type ClaimJobResult =
  | { claimed: true; indexCleanupError: string | null }
  | { claimed: false };

// Exclusive claim primitive:
// unlike removeJobForDevice above, a plain idempotent deletion helper with
// no way to tell whether IT was the caller that actually removed
// something, this reports true ownership. DEL is a single, atomic Redis
// command with a documented return value: the count of keys it actually
// removed (see @upstash/redis's own DelCommand typing, `Promise<number>`).
// Redis serializes commands against the same key, so of any number of
// concurrent DEL calls against the same job key — e.g. two overlapping
// cron-job.org-triggered invocations that both read the same due job
// before either has claimed it — EXACTLY ONE will see the key actually
// removed (count >= 1) and every other caller will see it already gone
// (count 0). Capturing and checking that return value, rather than
// discarding it the way removeJobForDevice does, is what gives an
// exclusive claim with no new KV key, no separate lock, and no Lua script:
// the primitive was already there, just unused.
//
// Same del-then-zrem ordering as removeJobForDevice for the winning path,
// for the same reason: if the zrem half fails after a successful del, the
// result is a zset member with no backing job object — a harmless stale
// index state that remains discoverable and is handled by the existing
// missing-job cleanup paths. That failure does not revoke the claim (del already
// succeeded — ownership is real) — it is reported back to the caller as
// `indexCleanupError` instead of thrown, so the caller can still safely
// proceed to use its claim while separately surfacing the KV bookkeeping
// failure through the existing post-delivery-cleanup-failure reporting
// path, exactly as an already-successful send's own post-send cleanup
// failures already are.
//
// A losing claimant never attempts zrem itself: it already knows, from its
// own del returning 0, that whichever caller's del actually returned
// nonzero owns clearing the index entry too. Racing to zrem the same
// member the winner might not have gotten to yet would add network cost
// without adding safety (zrem is itself idempotent regardless of who calls
// it or when).
export async function claimJobForDevice(deviceId: string, id: string): Promise<ClaimJobResult> {
  const kv = getKvClient();

  const deletedCount = await kv.del(JOB_KEY(deviceId, id));

  if (deletedCount === 0) {
    return { claimed: false };
  }

  try {
    await kv.zrem(ZSET_KEY(deviceId), id);
    return { claimed: true, indexCleanupError: null };
  } catch (error) {
    return {
      claimed: true,
      indexCleanupError: error instanceof Error ? error.message : String(error),
    };
  }
}
