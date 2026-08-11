// Trusted account deletion core (Phase 4G). Narrow and reusable: callers
// must already have resolved and trust `userId` — this function performs
// no authorization of its own. The public user-initiated boundary
// (src/server/account/deleteOwnAccountAction.ts) derives userId from
// requireUser(); a future inactivity-deletion path would derive it from
// its own trusted source (not a browser session) and call this same
// function, so the destructive sequence itself is never duplicated.
//
// Fail-closed by design — the opposite contract from sign-out cleanup
// (src/app/auth/signOutOrchestration.ts), which is deliberately best-effort
// because a user must always be allowed to leave their session. Account
// deletion is irreversible, so every owned Device's operational KV state
// must be confirmed clean (cleanupOperationalPushState with `strict: true`)
// before auth.admin.deleteUser() ever runs. Any failure before that point
// means the *canonical* account (PostgreSQL + Auth) is guaranteed to remain
// fully intact — auth.admin.deleteUser() is never reached. That does NOT
// mean operational KV cleanup itself is all-or-nothing: with multiple
// Devices, an earlier Device's cleanup can already have completed before a
// later Device's cleanup fails and this function returns. That partial KV
// cleanup is safe to leave as-is — cleanupOperationalPushState is
// idempotent (see its own header), so retrying deletion simply re-runs
// cleanup for every Device again, including any already-cleaned ones, with
// no ill effect. No rollback/reconstruction of partially-cleaned KV state
// is attempted or needed.
//
// Once the auth.users row is gone, PostgreSQL's existing FK cascades
// (supabase/migrations/20260809120000_mvp2_persistence_foundation.sql)
// delete every canonical account-owned row: user_preferences,
// reminder_preferences, goals -> anchors -> action_events/friction_events,
// reflections, devices -> push_subscriptions. This function never issues
// its own DELETE against any of those tables — one canonical relational
// deletion root (auth.users) is enough, and a redundant manual delete
// would only be able to race or duplicate what the cascade already
// guarantees.

import { listDeviceIdsForUser } from "@/server/devices/listDeviceIdsForUser";
import { cleanupOperationalPushState } from "@/lib/pushOperationalCleanup";
import { deleteAuthUserById } from "@/server/auth/deleteAuthUserById";

export type DeleteAccountFailureStage =
  | "device_enumeration"
  | "operational_cleanup"
  | "auth_deletion";

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; stage: DeleteAccountFailureStage; message: string };

export async function deleteAccountForUser(userId: string): Promise<DeleteAccountResult> {
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

  const authResult = await deleteAuthUserById(userId);

  if (!authResult.ok) {
    // KV cleanup already succeeded and cannot be un-done, but the
    // canonical account still exists — deliberately not reconstructed
    // here. The user can simply retry deletion.
    return { ok: false, stage: "auth_deletion", message: authResult.message };
  }

  return { ok: true };
}
