// Trusted batch runner for the 12-month inactivity retention policy
// (Phase 4H). This module owns exactly one responsibility: "who is
// eligible right now, and did deleting each of them succeed?" It contains
// no device enumeration, no KV cleanup and no Auth Admin deletion logic of
// its own — every expired candidate is handed to the existing canonical
// deletion core, deleteAccountForUser() (src/server/account/
// deleteAccountForUser.ts), the same function Phase 4G's user-initiated
// deletion boundary calls. That destructive sequence is implemented
// exactly once in this repository.
//
// Batch isolation (Phase 4H §6): one candidate's deletion failure must
// never make unrelated candidates undeletable. Each candidate is awaited
// sequentially (bounded concurrency is unnecessary at MVP2 scale, and
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

import { listInactiveAccountCandidates } from "./listInactiveAccountCandidates";
import { deleteAccountForUser, type DeleteAccountFailureStage } from "./deleteAccountForUser";

export type AccountRetentionBatchFailure = {
  userId: string;
  stage: DeleteAccountFailureStage;
  message: string;
};

export type AccountRetentionBatchResult = {
  scanned: number;
  expired: number;
  deleted: number;
  failed: number;
  truncated: boolean;
  failures: AccountRetentionBatchFailure[];
};

export async function runAccountRetentionBatch(
  referenceInstant: Date
): Promise<AccountRetentionBatchResult> {
  const { candidateUserIds, scanned, truncated } =
    await listInactiveAccountCandidates(referenceInstant);

  let deleted = 0;
  const failures: AccountRetentionBatchFailure[] = [];

  for (const userId of candidateUserIds) {
    const result = await deleteAccountForUser(userId);

    if (result.ok) {
      deleted++;
    } else {
      failures.push({ userId, stage: result.stage, message: result.message });
    }
  }

  return {
    scanned,
    expired: candidateUserIds.length,
    deleted,
    failed: failures.length,
    truncated,
    failures,
  };
}
