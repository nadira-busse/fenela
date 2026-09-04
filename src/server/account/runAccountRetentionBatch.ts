// Trusted batch runner for the 12-month inactivity retention policy. This
// module owns exactly one responsibility: "who is
// eligible right now, and did deleting each of them succeed?" It contains
// no device enumeration, no KV cleanup and no Auth Admin deletion logic of
// its own — every expired candidate is handed to the existing canonical
// deletion core, deleteAccountForUser() (src/server/account/
// deleteAccountForUser.ts), the same function the user-initiated
// deletion boundary calls. That destructive sequence is implemented
// exactly once in this repository.
//
// Batch isolation: one candidate's deletion failure must
// never make unrelated candidates undeletable. Each candidate is awaited
// sequentially (bounded concurrency is unnecessary at the expected scale, and
// sequential execution keeps failure isolation trivially easy to reason
// about) and its outcome recorded independently — a failure is pushed onto
// `failures` and the loop continues to the next candidate, it never
// aborts the batch. Only a failure BEFORE candidate enumeration even
// starts (listInactiveAccountCandidates() throwing — e.g. the Auth Admin
// API itself is unreachable) is allowed to fail the whole run, by
// propagating rather than being caught here: there is no partial
// candidate list to isolate failures within in that case.
//
// Privacy in failure output: `failures` carries only `userId` (a UUID) and
// the controlled failure message deleteAccountForUser() already returns
// (never a raw exception, never email or free-text data — see that
// function's own DeleteAccountResult type). Nothing here ever logs an
// email address, display name, goal text or friction text.

import {
  listInactiveAccountCandidates,
  isAccountStillExpired,
} from "./listInactiveAccountCandidates";
import { deleteAccountForUser, type DeleteAccountFailureStage } from "./deleteAccountForUser";

export type AccountRetentionBatchFailure = {
  userId: string;
  stage: DeleteAccountFailureStage | "eligibility_recheck";
  message: string;
};

export type AccountRetentionBatchResult = {
  scanned: number;
  expired: number;
  deleted: number;
  failed: number;
  // Candidates whose final eligibility recheck (immediately before the
  // delete call) found them no longer expired — e.g. they signed in or made
  // an authenticated request after the scan above selected them. Not a
  // failure: the correct outcome for a candidate that stopped being
  // retention-expired is simply "not deleted," never an error entry.
  skipped: number;
  truncated: boolean;
  failures: AccountRetentionBatchFailure[];
};

export async function runAccountRetentionBatch(
  referenceInstant: Date
): Promise<AccountRetentionBatchResult> {
  const { candidateUserIds, scanned, truncated } =
    await listInactiveAccountCandidates(referenceInstant);

  let deleted = 0;
  let skipped = 0;
  const failures: AccountRetentionBatchFailure[] = [];

  for (const userId of candidateUserIds) {
    // Final revalidation, as close as practical to the irreversible delete
    // call — closes the TOCTOU window between the scan above and this exact
    // moment. Re-reads current Auth + activity state
    // for this one user; never reuses the scan-time snapshot to authorize
    // deletion. The external scheduler (cron-job.org) is not trusted to
    // prevent overlapping/duplicate invocations — this recheck is what
    // makes the deletion decision correct regardless of that, not any
    // assumption about the caller.
    let stillExpired: boolean;

    try {
      stillExpired = await isAccountStillExpired(userId, referenceInstant);
    } catch (error) {
      // Fail closed: cannot confirm eligibility, so this candidate is not
      // deleted this run. Recorded like any other per-candidate failure —
      // isolated, does not abort the batch, safe to retry on the next run.
      failures.push({
        userId,
        stage: "eligibility_recheck",
        message:
          error instanceof Error ? error.message : "Failed to revalidate retention eligibility.",
      });
      continue;
    }

    if (!stillExpired) {
      skipped++;
      continue;
    }

    // A second, tighter check is composed directly into the deletion core
    // itself rather than repeated here: the recheck
    // above only closes the window between the full candidate scan and
    // this exact loop iteration — device enumeration and operational KV
    // cleanup inside deleteAccountForUser can still take real time after
    // that, during which this same candidate could still become active
    // again. preAuthDeletionGuard runs as the very last step before the
    // irreversible Auth deletion, using the same isAccountStillExpired()
    // eligibility check evaluated fresh at that later moment. Keeping both
    // checks is deliberate, not redundant: this outer one avoids running
    // enumeration/cleanup at all for the common case of a candidate that
    // reactivated well before this batch run even reached them; the inner
    // one is what actually guarantees correctness at the true irreversible
    // boundary.
    const result = await deleteAccountForUser(userId, {
      preAuthDeletionGuard: () => isAccountStillExpired(userId, referenceInstant),
    });

    if (result.ok) {
      deleted++;
    } else if ("cancelled" in result) {
      skipped++;
    } else {
      failures.push({ userId, stage: result.stage, message: result.message });
    }
  }

  return {
    scanned,
    expired: candidateUserIds.length,
    deleted,
    failed: failures.length,
    skipped,
    truncated,
    failures,
  };
}
