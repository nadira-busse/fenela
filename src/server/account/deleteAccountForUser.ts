// Trusted account-deletion core. Callers must already have resolved and trust
// `userId`; this function performs no authorization of its own. User-initiated
// deletion derives the id from the authenticated session, while retention uses
// its own trusted candidate source. Both paths share this destructive sequence.
//
// Deletion is fail-closed. Every owned device's required operational KV cleanup
// must complete before the Auth identity is deleted. Cleanup for earlier devices
// may already have succeeded when a later device fails; that operational work is
// not rolled back. A retry runs the same idempotent cleanup path for every owned
// device again. Canonical Auth/PostgreSQL state remains intact until the final
// Auth deletion step, after which FK cascades remove account-owned rows.

import { listDeviceIdsForUser } from "@/server/devices/listDeviceIdsForUser";
import { cleanupOperationalPushState } from "@/lib/pushOperationalCleanup";
import { deleteAuthUserById } from "@/server/auth/deleteAuthUserById";

export type DeleteAccountFailureStage =
  | "device_enumeration"
  | "operational_cleanup"
  | "pre_deletion_guard"
  | "auth_deletion";

export type DeleteAccountOptions = {
  // Optional final guard evaluated after operational cleanup and immediately
  // before Auth deletion. Retention uses this to re-check eligibility at the
  // latest possible point; explicit user-initiated deletion does not supply it.
  // A false result cancels deletion without touching canonical Auth/PostgreSQL
  // state, although operational cleanup performed earlier in the attempt remains.
  preAuthDeletionGuard?: () => Promise<boolean>;
};

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; stage: DeleteAccountFailureStage; message: string }
  // Distinct from a failure: the guard explicitly determined deletion must
  // not proceed (e.g. the account is no longer retention-expired). Nothing
  // went wrong — the correct decision was made not to delete. The Auth
  // identity, and therefore every cascaded Postgres row, is left fully
  // intact; only this run's operational KV cleanup (if any devices were
  // owned) has already happened — see preAuthDeletionGuard's own comment
  // for why this partial operational cleanup is an accepted trade-off.
  | { ok: false; cancelled: true; reason: string };

export async function deleteAccountForUser(
  userId: string,
  options: DeleteAccountOptions = {}
): Promise<DeleteAccountResult> {
  let deviceIds: string[];

  try {
    deviceIds = await listDeviceIdsForUser(userId);
  } catch (error) {
    return {
      ok: false,
      stage: "device_enumeration",
      message: error instanceof Error ? error.message : "Failed to enumerate owned devices.",
    };
  }

  // Sequential, not Promise.all: a mid-way failure must stop before any
  // further irreversible step, and the ordering itself (all Device cleanup
  // complete before auth deletion) is the invariant this function exists
  // to guarantee.
  for (const deviceId of deviceIds) {
    try {
      await cleanupOperationalPushState(deviceId, { strict: true });
    } catch (error) {
      return {
        ok: false,
        stage: "operational_cleanup",
        message: error instanceof Error ? error.message : "Operational cleanup failed.",
      };
    }
  }

  if (options.preAuthDeletionGuard) {
    let stillEligible: boolean;

    try {
      stillEligible = await options.preAuthDeletionGuard();
    } catch (error) {
      return {
        ok: false,
        stage: "pre_deletion_guard",
        message: error instanceof Error ? error.message : "Pre-deletion guard check failed.",
      };
    }

    if (!stillEligible) {
      return {
        ok: false,
        cancelled: true,
        reason: "The pre-deletion guard determined this account should no longer be deleted.",
      };
    }
  }

  const authResult = await deleteAuthUserById(userId);

  if (!authResult.ok) {
    // KV cleanup already succeeded and cannot be un-done, but the
    // canonical account still exists — deliberately not reconstructed
    // here. The user can simply retry deletion.
    return { ok: false, stage: "auth_deletion", message: authResult.message };
  }

  return { ok: true };
}
