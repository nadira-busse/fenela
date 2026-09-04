import { NextRequest, NextResponse } from "next/server";
import { getKvClient } from "@/lib/kv";
import { WebPushError } from "web-push";
import type { PushSubscription } from "web-push";

import {
  DEVICES_SET_KEY,
  getDueJobIdsForDevice,
  getJobForDevice,
  removeJobForDevice,
  storeJobForDevice,
  claimJobForDevice,
  makeJob,
  type Job,
} from "@/lib/jobs";
import { sendPush } from "@/lib/pushSend";
import { REMINDER_TIME_ZONE, nextZonedOccurrenceMs } from "@/lib/timezone";
import { classifyPushError } from "@/lib/pushErrorClassification";
import { deletePushSubscriptionByDeviceId } from "@/server/devices/deletePushSubscriptionByDeviceId";
import { cleanupOperationalPushState } from "@/lib/pushOperationalCleanup";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { getReminderEnabledForDevice } from "@/server/reminders/getReminderEnabledForDevice";

export const runtime = "nodejs";

const SUB_KEY = (deviceId: string) => `push:sub:${deviceId}`;
const DAILY_START_POINTER_KEY = (deviceId: string) => `push:dailyStart:jobId:${deviceId}`;

// Provider diagnostics: web-push's WebPushError already carries
// the real HTTP statusCode from the push service — classifyPushError uses
// it. Surface the status here so non-terminal failures are distinguishable
// from the outside beyond the
// generic "Received unexpected response code" message. Prefixing it here
// costs nothing and makes pushErrors actually diagnostic (was this a 429?
// a 500? a 401 that suggests a VAPID config problem?) without changing
// classification behavior at all.
function getErrorMessage(err: unknown): string {
  if (err instanceof WebPushError) {
    return `HTTP ${err.statusCode}: ${err.message}`;
  }

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
  // The timezone travels with the job: schedule-daily-start
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

type RescheduleOutcome = "rescheduled" | "skippedDisabled" | "skippedVerificationFailed";

// Authorizes and performs (or skips) the NEXT DAILY_START occurrence —
// deliberately a SEPARATE decision from the one that already authorized
// sending the CURRENT notification, closing the race created by a cached
// per-device check. Always
// performs its own fresh, uncached getReminderEnabledForDevice() call —
// never reuses the caller's earlier send-time lookup — because meaningful
// wall-clock time (an external push-provider network call, sendPush)
// elapses between the two decisions, during which the user can disable
// reminders. Creating new future work must be authorized by canonical
// intent as of right now, not as of whenever the send was authorized.
// When reschedule is skipped, `job` (the just-
// removed current occurrence) may still be the pointer's target — it was,
// by construction, the one job the singleton-resolution pass authorized
// this run. Left alone, the pointer would dangle, referencing a job that
// no longer exists. Low practical impact on its own (the next legitimate
// schedule-daily-start call would silently absorb it — a no-op removal of
// an already-gone id, then a normal overwrite), but a real, cheaply
// closable discoverability/consistency gap: a dangling pointer is
// confusing derived state with no purpose. Best-effort and non-blocking —
// this is bookkeeping, not a correctness-critical step, so a failure here
// must never affect the (already-decided) reschedule outcome. Guarded on
// the pointer still matching `job.id` so this can never clobber a pointer
// a concurrent request legitimately advanced in the meantime.
async function clearDanglingPointerIfMatches(deviceId: string, jobId: string): Promise<void> {
  try {
    const kv = getKvClient();
    const currentPointer = await kv.get<string>(DAILY_START_POINTER_KEY(deviceId));

    if (currentPointer === jobId) {
      await kv.del(DAILY_START_POINTER_KEY(deviceId));
    }
  } catch (error) {
    console.warn("dailyStart.danglingPointerClearFailed", {
      deviceId,
      jobId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function rescheduleIfStillEnabled(
  job: Job,
  deviceId: string,
  now: number
): Promise<RescheduleOutcome> {
  const lookup = await getReminderEnabledForDevice(deviceId);

  if (!lookup.ok) {
    // Fail closed for this future occurrence only: do not create a new
    // job or pointer. The already-completed send (if any) that got us here
    // is never retroactively affected — only whether a NEXT occurrence
    // gets created is in question.
    console.warn("dailyStart.rescheduleVerificationFailed", {
      deviceId,
      jobId: job.id,
      message: lookup.message,
    });
    await clearDanglingPointerIfMatches(deviceId, job.id);
    return "skippedVerificationFailed";
  }

  if (!lookup.enabled) {
    // The user disabled reminders in the window between send-authorization
    // and this exact moment. Not an error — simply respecting the user's
    // current preference: no new job, no new/updated pointer.
    console.log("dailyStart.rescheduleSkippedDisabled", { deviceId, jobId: job.id });
    await clearDanglingPointerIfMatches(deviceId, job.id);
    return "skippedDisabled";
  }

  await rescheduleDailyStartJob(job, deviceId, now);
  return "rescheduled";
}

// Runs only for a TERMINAL_INVALID_SUBSCRIPTION push error: the push
// service has confirmed this endpoint no longer
// exists, so both the operational KV state and the canonical PostgreSQL
// PushSubscription row are removed. The Device row itself is preserved
// The device still belongs to the user; it just currently has no
// working subscription — the next successful subscribe recreates one
// under the same Device via savePushSubscriptionForOwnDevice's upsert.
//
// Ordering/consistency trade-off: KV cleanup runs first and always
// completes regardless of the DB outcome. Leaving KV state for an
// endpoint the push service has already confirmed dead guarantees a
// repeated failed delivery attempt on every future cron run — strictly
// worse than a transient DB/KV disagreement, which is both idempotent to
// retry (a second delete of an already-gone row is still success) and
// is reconciled the next time the user re-subscribes. A DB cleanup failure
// is therefore logged clearly, not silently swallowed, rather than rolling
// back the KV cleanup or pretending the row is still consistent.
async function cleanupTerminalSubscription(
  deviceId: string,
  currentJobId: string
): Promise<{ cleanedJobs: number; dbCleanupOk: boolean; dbCleanupMessage?: string }> {
  const { cleanedJobs, jobCleanupComplete } = await cleanupOperationalPushState(deviceId, {
    additionalJobIds: [currentJobId],
  });

  const dbResult = await deletePushSubscriptionByDeviceId(deviceId);

  console.log("pushDevice.cleanedAfterTerminalFailure", {
    deviceId,
    cleanedJobs,
    // When false, the device was deliberately
    // left in the discovery index (see cleanupOperationalPushState's own
    // comment) rather than removed, so a future pass can retry — worth
    // surfacing here for anyone reading cron logs to notice a device that
    // keeps needing repeated cleanup attempts.
    jobCleanupComplete,
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
    // Exclusive TASK_REMINDER claim observability: how many TASK_REMINDER
    // jobs could not be claimed (KV
    // failure before any send was attempted — not a push failure, so
    // pushErrors/transientFailures stay untouched, and the job remains due
    // for a normal retry next run); and how many claim attempts genuinely
    // lost the exclusivity race to another (very likely overlapping)
    // invocation — not an error of any kind, the exclusivity guarantee
    // working as designed, tracked purely for observability. There is no
    // counter for a re-created TASK_REMINDER retry after a won claim —
    // that path no longer exists (see the TASK_REMINDER branch below):
    // once a claim is won, Fenéla makes exactly one send attempt and never
    // re-creates the job afterward, regardless of outcome.
    let taskReminderClaimFailures = 0;
    let taskReminderClaimsLost = 0;
    // How many DAILY_START jobs were discarded because
    // canonical reminder_preferences.enabled was found to be false (stale
    // operational state that survived an incomplete cancellation, or any
    // other divergence), and how many DAILY_START jobs could not be
    // verified this run (Supabase read failure) and were therefore left
    // untouched — neither sent nor rescheduled nor deleted — rather than
    // guessed either way.
    let cleanedDisabledDailyStart = 0;
    let dailyStartVerificationFailures = 0;
    // The reschedule decision is authorized separately and freshly from
    // the send decision above; these count
    // occurrences where a current push was sent (or a transient failure
    // occurred) but the immediately-following, freshly-rechecked reschedule
    // was skipped, either because the user disabled reminders in the
    // window since send-authorization, or because that fresh check itself
    // could not be verified.
    let dailyStartRescheduleSkippedDisabled = 0;
    let dailyStartRescheduleVerificationFailures = 0;
    // Singleton resolution: the pointer is
    // the canonical identity of "the" current DAILY_START job for a device
    // (repository evidence: a singular KV key, schedule-time
    // replace-the-previous-job behavior, and singular "the active
    // reminder" language throughout ADR-002/ADR-004 — never a set or list
    // of concurrent daily reminders). These count the two distinct ways a
    // pointer-less due DAILY_START state gets resolved: exactly one
    // unambiguous candidate has its pointer repaired rather
    // than being discarded over an unrelated KV bookkeeping gap, or (rarer)
    // more than one candidate exists with no reliable signal to pick a
    // "correct" one, so all are discarded rather than guessed at or all
    // executed (which would duplicate delivery).
    let dailyStartPointerRepairFailures = 0;
    let cleanedAmbiguousDailyStart = 0;
    // The delivery versus post-delivery cleanup boundary counts KV failures
    // that happen strictly after a
    // successful sendPush — removing the just-delivered job, or (for
    // DAILY_START) writing the rescheduled next occurrence. Deliberately
    // separate from pushErrors/transientFailures/terminalFailures, which
    // describe only the push-provider delivery boundary — a KV hiccup
    // here is never a delivery failure and must never be classified,
    // counted, or retried as one.
    let postDeliveryCleanupFailures = 0;
    const pushErrors: string[] = [];
    const cleanupErrors: string[] = [];
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
        taskReminderClaimFailures,
        taskReminderClaimsLost,
        cleanedDisabledDailyStart,
        dailyStartVerificationFailures,
        dailyStartRescheduleSkippedDisabled,
        dailyStartRescheduleVerificationFailures,
        dailyStartPointerRepairFailures,
        cleanedAmbiguousDailyStart,
        postDeliveryCleanupFailures,
        pushErrors,
        cleanupErrors,
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

      // First pass: resolve every due id to its job body up front, handling
      // missing/not-yet-due exactly as before. Collected rather than acted
      // on immediately so the singleton-resolution pass can see every
      // due DAILY_START candidate for this device at once — the old
      // per-job-interleaved loop decided each DAILY_START job's fate in
      // isolation, which is exactly what let more than one execute/
      // reschedule in the same run when the pointer was absent.
      const resolvedJobs: { id: string; job: Job }[] = [];

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

        resolvedJobs.push({ id, job });
      }

      // Second pass: DAILY_START singleton resolution. Re-reads the pointer
      // fresh at this exact point (never before the first pass and never cached
      // across this device's jobs) and resolves singleton status for every
      // due DAILY_START candidate in one decision, before any of them can
      // send or reschedule. This is what makes a mid-run pointer change
      // from an earlier reschedule irrelevant: at most one DAILY_START job
      // is ever allowed past this point per device per run, so there is no
      // "later job" left that could observe a stale pointer snapshot.
      const pointerJobId = await kv.get<string>(DAILY_START_POINTER_KEY(deviceId));
      const dailyStartCandidates = resolvedJobs.filter(({ job }) => job.kind === "DAILY_START");

      let authorizedDailyStartId: string | null = null;

      if (pointerJobId) {
        // The pointer is the canonical identity of the current DAILY_START
        // job (see the counters' own header comment above for the
        // repository evidence). Every due candidate that does not match it
        // — including when the pointer itself references a job that isn't
        // among today's due candidates at all — is stale and discarded.
        for (const { id } of dailyStartCandidates) {
          if (id === pointerJobId) {
            authorizedDailyStartId = id;
          } else {
            await removeJobForDevice(deviceId, id);
            cleanedPointerMismatch++;
          }
        }
      } else if (dailyStartCandidates.length === 1) {
        // No pointer, but exactly one due candidate: unambiguous. Repair
        // the pointer to it rather than discarding a still
        // legitimate, still-enabled recurring reminder purely because of an
        // unrelated KV bookkeeping gap (e.g. a partial-failure cleanup that
        // cleared the pointer without also removing this job).
        const soleCandidateId = dailyStartCandidates[0].id;

        try {
          await kv.set(DAILY_START_POINTER_KEY(deviceId), soleCandidateId);
          authorizedDailyStartId = soleCandidateId;
        } catch (error) {
          // Could not confirm/repair singleton state — fail closed for
          // this job specifically rather than sending without it. Left
          // due (never removed), so a later run retries.
          console.warn("dailyStart.pointerRepairFailed", {
            deviceId,
            jobId: soleCandidateId,
            message: error instanceof Error ? error.message : String(error),
          });
          dailyStartPointerRepairFailures++;
        }
      } else if (dailyStartCandidates.length > 1) {
        // No pointer AND more than one due candidate: genuinely ambiguous.
        // Neither job id nor dueAt reliably identifies which one is
        // actually current — executing any of them risks duplicate
        // delivery, and guessing risks silently keeping the wrong one.
        // Discard all: canonical Postgres reminder intent is untouched,
        // and the next explicit reminder-settings interaction
        // (schedule-daily-start) recreates one unambiguous job/pointer
        // pair.
        for (const { id } of dailyStartCandidates) {
          await removeJobForDevice(deviceId, id);
          cleanedAmbiguousDailyStart++;
        }
      }

      // Final pass: process the now singleton-safe surviving jobs — the one
      // authorized DAILY_START job, if any, plus every TASK_REMINDER/
      // other-kind job — through the existing per-job canonical-intent/
      // send/reschedule logic, unchanged.
      for (const { id, job } of resolvedJobs) {
        if (job.kind === "DAILY_START" && id !== authorizedDailyStartId) {
          // Already resolved in the singleton-resolution pass above (discarded as a mismatch/
          // ambiguous duplicate, or left due after a pointer-repair
          // failure) — nothing further to do for it this run.
          continue;
        }

        if (job.kind === "DAILY_START") {
          // A fresh, per-EXECUTION canonical-intent lookup — deliberately
          // never cached across jobs. By this point, singleton resolution
          // has already guaranteed at most one DAILY_START job
          // reaches here per device per run, so this is only ever called
          // once per device — but the fresh-call discipline is kept
          // regardless, since sendPush below is an external network call
          // and canonical intent can still change while it's in flight
          // (see rescheduleIfStillEnabled's own header for the matching
          // reasoning on the reschedule side).
          const lookup = await getReminderEnabledForDevice(deviceId);

          if (!lookup.ok) {
            // Cannot verify canonical intent right now — fail closed for
            // this job specifically: do not send, do not reschedule, and
            // do not delete it either (a transient Supabase hiccup must
            // never silently drop a legitimately-enabled reminder). Left
            // due, so a later run re-verifies once Supabase recovers.
            // Isolated to this one job/device — every other device and
            // job in this run continues normally.
            console.warn("dailyStart.verificationFailed", {
              deviceId,
              jobId: id,
              message: lookup.message,
            });
            dailyStartVerificationFailures++;
            continue;
          }

          if (!lookup.enabled) {
            // Canonical intent is disabled. This job is stale operational
            // state (e.g. left behind by an incomplete cancellation) and
            // must never be sent or rescheduled regardless of what KV
            // alone says.
            await removeJobForDevice(deviceId, id);
            cleanedDisabledDailyStart++;
            continue;
          }
        }

        if (job.kind === "TASK_REMINDER") {
          // Exclusive claim, not send-then-remove. This duplicate-delivery
          // path
          // closes: sendPush() succeeds, the user receives the
          // notification, and only THEN does removal run — if that
          // removal's first step (deleting the job object) fails, both
          // the job object and its due-time index entry can remain fully
          // intact, so a later cron run rediscovers and re-sends the
          // exact same one-shot reminder. TASK_REMINDER has no
          // singleton/pointer mechanism like DAILY_START (see that
          // branch's own comments below, which deliberately keep the
          // send-then-remove order — DAILY_START's pointer already
          // absorbs a stray un-removed current job safely on a later
          // run, so it does not need this).
          //
          // Claiming before send also closes a second, distinct problem a
          // plain "remove before send" would NOT close on its own: this
          // repository's own retention code already documents that the
          // external scheduler (cron-job.org) is not trusted to prevent
          // overlapping/duplicate invocations. Two overlapping cron
          // requests can both discover the same due job before either has
          // removed it. claimJobForDevice() (src/lib/jobs.ts) uses DEL's
          // own atomic return value — the count of keys it actually
          // removed — as the exclusivity signal: Redis serializes commands
          // against the same key, so of any number of concurrent claims
          // against this exact job, EXACTLY ONE sees `claimed: true` and
          // every other caller sees `claimed: false`. A losing caller
          // never calls sendPush at all.
          //
          // This does not, and cannot, achieve exactly-once DELIVERY —
          // push delivery (an external provider call) and KV state (a
          // separate store) share no transaction, so no ordering of these
          // two systems' operations can make both "definitely happened"
          // atomic together: sendPush can throw even after the push
          // service already accepted the notification, and Fenéla has no
          // way to distinguish that case from a genuine delivery failure.
          // What this DOES achieve is explicit and defensible:
          // TASK_REMINDER has best-effort, at-most-once APPLICATION
          // send-attempt semantics. One exclusive claim, at most one
          // sendPush call by the winning claimant, and — regardless of
          // that call's outcome, including an ambiguous/transient one —
          // no automatic resend. The claimed job is never re-created for
          // another application-level send attempt once a send has been
          // attempted, so Fenéla itself never initiates a duplicate
          // reminder, whether through a sequential retry or an
          // overlapping invocation racing it. A reminder can still
          // occasionally be LOST instead — at the claim step itself (see
          // taskReminderClaimFailures/taskReminderClaimsLost above), or
          // whenever a won claim's send attempt fails for any reason,
          // terminal or not. That loss is deliberate, not accidental: a
          // duplicated, repeated "did you do it?" check-in directly
          // contradicts this product's own documented design intent (the
          // antiHelp "REPETITION"/"PRESSURE" screening options, and the AI
          // prompt's explicit "do not repeat" rules), while an occasional
          // silent miss is already consistent with the existing, accepted
          // "reminder delivery is best effort, not guaranteed" framing
          // (ADR-002). A lost low-stakes reminder is judged the smaller
          // cost of the two — and note a won claim (DEL removing the job)
          // is what makes this at-most-once in the first place: a claim
          // that is lost or fails outright leaves the job's fate to the
          // claim-failure/claim-lost paths above, not this one.
          let claim;

          try {
            claim = await claimJobForDevice(deviceId, id);
          } catch (claimErr) {
            // Claim infrastructure error (the DEL call itself rejected,
            // not merely returned a zero count) — fail closed: do not
            // send. claimJobForDevice's own DEL call is not wrapped in a
            // try/catch (see its header), so a rejection here means it
            // never got far enough to attempt ZREM either — no partial
            // claim state is possible in this specific branch, unlike the
            // indexCleanupError branch below. A later cron run retries
            // this exact claim-then-send sequence from scratch, no
            // differently from any other transient KV hiccup elsewhere in
            // this route. Not a push failure (nothing was attempted), so
            // pushErrors/transientFailures stay untouched.
            taskReminderClaimFailures++;
            const message = claimErr instanceof Error ? claimErr.message : String(claimErr);
            cleanupErrors.push(message);
            console.warn("taskReminder.claimFailed", { deviceId, jobId: id, message });
            continue;
          }

          if (!claim.claimed) {
            // Lost the claim: another (very likely overlapping) invocation
            // already won it. This is not an error of any kind — it is
            // the exclusivity guarantee working exactly as designed. Must
            // not send, and must not touch any push-failure or cleanup
            // counter; simply move on to the rest of this run's work.
            taskReminderClaimsLost++;
            continue;
          }

          if (claim.indexCleanupError) {
            // Won the claim (the job object was genuinely deleted by THIS
            // caller) but clearing its due-time index entry failed
            // separately. Ownership is not in question — del's own return
            // value already proved it — so this proceeds to send
            // regardless. The leftover zset member is a stale index entry with
            // no backing job object, a state already handled by the existing
            // missing-job cleanup paths (see claimJobForDevice's own header) —
            // surfaced here the same way any other post-delivery KV
            // bookkeeping failure already is.
            postDeliveryCleanupFailures++;
            cleanupErrors.push(claim.indexCleanupError);
            console.warn("taskReminder.claimIndexCleanupFailed", {
              deviceId,
              jobId: id,
              message: claim.indexCleanupError,
            });
          }

          try {
            await sendPush(subscription, job.payload);
            processed++;
            // Already claimed above — no further removal needed for
            // execution safety.
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
            } else {
              // Non-terminal/transient/ambiguous push failure on a WON
              // claim: the job was already claimed (deleted) above, and
              // that claim is never re-created. Fenéla cannot tell whether
              // the push service already accepted the notification before
              // this error surfaced, so re-sending risks a duplicate;
              // dropping it risks a miss. This design deliberately picks
              // the miss (see the claim-before-send comment above) — the
              // reminder is consumed/lost, counted here, and processing
              // continues with the rest of this run's work.
              transientFailures++;
            }
          }

          continue;
        }

        // Delivery boundary versus post-delivery cleanup boundary. Reached
        // only by DAILY_START (and any
        // other non-TASK_REMINDER job kind) — TASK_REMINDER is claimed and
        // sent entirely in its own branch above and never reaches here.
        // This try/catch covers ONLY the actual push-provider send.
        // Everything that happens after a successful send — removing the
        // just-delivered job, and for DAILY_START, the reschedule decision
        // — has its own, separate error handling below, so a KV failure in
        // post-delivery cleanup (unrelated to the push provider) can never
        // be misclassified as a delivery failure: `processed` is never
        // left uncounted for a notification that was, in fact, already
        // delivered, and `transientFailures`/`pushErrors` never record a
        // KV error as if the push itself had failed.
        try {
          await sendPush(subscription, job.payload);
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
          // PushSubscription row are all preserved.
          transientFailures++;

          if (job.kind === "DAILY_START") {
            // A transient delivery failure must not permanently disable
            // the user's recurring daily reminder; the next
            // normal occurrence is scheduled exactly as it would be after
            // a successful delivery. Same freshly-checked, separate
            // reschedule authorization as the success path; the user could
            // have disabled reminders during
            // this failed send attempt just as easily as during a
            // successful one.
            await removeJobForDevice(deviceId, id);

            const outcome = await rescheduleIfStillEnabled(job, deviceId, now);

            if (outcome === "rescheduled") {
              dailyRescheduled++;
            } else if (outcome === "skippedDisabled") {
              dailyStartRescheduleSkippedDisabled++;
            } else {
              dailyStartRescheduleVerificationFailures++;
            }
          } else {
            // TASK_REMINDER is handled entirely in its own claim-before-
            // send branch above and never reaches here — this remains
            // only as the generic fallback for any other job kind reaching
            // this point: smallest existing best-effort behavior, drop it
            // rather than retry indefinitely.
            await removeJobForDevice(deviceId, id);
          }

          continue;
        }

        // Reaching here means sendPush resolved successfully — the
        // notification is delivered, unconditionally and permanently,
        // regardless of anything that happens below. This is the one and
        // only place `processed` is incremented, and it happens before any
        // further step can fail, precisely so a post-delivery failure can
        // never cause an already-delivered notification to go uncounted.
        processed++;

        try {
          await removeJobForDevice(deviceId, id);
        } catch (cleanupErr) {
          // Post-delivery cleanup failure — not a push-provider failure.
          // Deliberately NOT fed into pushErrors/transientFailures/
          // terminalFailures (those describe the delivery boundary only),
          // and — critically for TASK_REMINDER — deliberately NOT routed
          // into the delivery-retry logic above: the push already
          // succeeded, so there is nothing to retry. Surfaced narrowly and
          // separately instead.
          //
          // Leftover state after this failure: removeJobForDevice deletes
          // the job object before removing it from the device's due-time
          // index (src/lib/jobs.ts). If the index removal is what failed,
          // the result is a due-time index entry with no backing job
          // object — a stale index entry with no backing job object that the
          // existing discovery and missing-job cleanup paths already handle
          // (getJobForDevice returns null for it, and the existing
          // `if (!job)` branch above cleans it up automatically next run,
          // with no re-send). If the job-object deletion itself is what
          // failed instead, the job can remain fully intact and due, and
          // could in principle be picked up and sent again on a later run
          // — a narrow residual risk inherent to any single KV delete that
          // can fail, not something a delivery-status marker would
          // meaningfully close without introducing new persistent state
          // this task does not call for. For DAILY_START specifically,
          // proceeding to the reschedule step below regardless (rather
          // than skipping it) is what neutralizes that same risk using
          // the singleton pointer mechanism that already exists: once a
          // next occurrence is authorized and its pointer written, any
          // stray un-removed current job no longer matches the pointer
          // and is safely discarded by the existing pointer-mismatch
          // check on the very next run, never re-sent.
          postDeliveryCleanupFailures++;
          const message = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
          cleanupErrors.push(message);
          console.warn("push.postDeliveryCleanupFailed", {
            deviceId,
            jobId: id,
            kind: job.kind,
            stage: "removeCurrentJob",
            message,
          });
        }

        if (job.kind === "DAILY_START") {
          // A freshly-checked, separate authorization from the
          // send-authorization above — see rescheduleIfStillEnabled's own
          // header. Attempted regardless of whether the cleanup step just
          // above succeeded (see that step's own comment for why this
          // matters). Wrapped in its own try/catch — a KV write failure
          // inside rescheduleDailyStartJob's own internals is the same
          // post-delivery-cleanup failure domain as above, not a push
          // failure, and must not be allowed to propagate and abort
          // processing for other devices/jobs in this run.
          try {
            const outcome = await rescheduleIfStillEnabled(job, deviceId, now);

            if (outcome === "rescheduled") {
              dailyRescheduled++;
            } else if (outcome === "skippedDisabled") {
              dailyStartRescheduleSkippedDisabled++;
            } else {
              dailyStartRescheduleVerificationFailures++;
            }
          } catch (rescheduleErr) {
            postDeliveryCleanupFailures++;
            const message =
              rescheduleErr instanceof Error ? rescheduleErr.message : String(rescheduleErr);
            cleanupErrors.push(message);
            console.warn("push.postDeliveryCleanupFailed", {
              deviceId,
              jobId: id,
              kind: job.kind,
              stage: "reschedule",
              message,
            });
          }
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
      taskReminderClaimFailures,
      taskReminderClaimsLost,
      cleanedDisabledDailyStart,
      dailyStartVerificationFailures,
      dailyStartRescheduleSkippedDisabled,
      dailyStartRescheduleVerificationFailures,
      dailyStartPointerRepairFailures,
      cleanedAmbiguousDailyStart,
      postDeliveryCleanupFailures,
      pushErrors: pushErrors.slice(0, 5),
      cleanupErrors: cleanupErrors.slice(0, 5),
      dbCleanupErrors: dbCleanupErrors.slice(0, 5),
    };

    console.log("cron.push.result", result);

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = getErrorMessage(err);

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
