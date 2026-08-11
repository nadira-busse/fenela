// The actual account-deletion step sequence (Phase 4G), analogous to
// src/app/auth/signOutOrchestration.ts but with the opposite failure
// contract. Sign-out cleanup is best-effort because a user must always be
// allowed to leave their session; account deletion is destructive and
// irreversible, so a failed server-side deletion must leave the browser
// exactly where it was — still on the confirmation surface, session
// untouched — so the user can see the error and retry, never silently
// proceeding to local cleanup or navigation on failure.
//
// The fail-closed guarantee itself (every owned Device's operational KV
// state cleaned up before the auth.users row is deleted) already happened
// server-side inside deleteAccountForUser before deps.deleteAccount()
// resolves here — see src/server/account/deleteAccountForUser.ts. This
// orchestration only covers what happens in the browser once the server
// confirms the account is actually gone: explicitly clearing the current
// Supabase auth session, a best-effort browser push unsubscribe, local
// Fenéla-owned state cleanup, and leaving to /auth.
//
// Clearing the Supabase session is not optional bookkeeping: deleting
// auth.users does not itself invalidate an already-issued access JWT — per
// Supabase's own docs, it can remain valid in the browser until it expires.
// Without this step, a deleted account's browser tab could keep acting as
// though it were still signed in. It still runs best-effort (a caught,
// logged failure never blocks the remaining steps) because it always runs
// AFTER the account is already permanently, irreversibly deleted — there is
// nothing left to protect by blocking on it.
//
// Every dependency is injected so this is unit-testable without rendering
// a component (this repo has no RTL/jsdom dependency).

export type DeleteAccountOutcome = { ok: true } | { ok: false; message: string };

export type DeleteAccountDeps = {
  deleteAccount: () => Promise<DeleteAccountOutcome>;
  clearSupabaseSession: () => Promise<void>;
  unsubscribeBrowserPush: () => Promise<void>;
  clearLocalState: () => void;
  leaveToAuth: () => void;
};

function safeLog(label: string, error: unknown) {
  console.warn(label, error);
}

export async function performAccountDeletion(
  deps: DeleteAccountDeps
): Promise<DeleteAccountOutcome> {
  const result = await deps.deleteAccount();

  if (!result.ok) {
    return result;
  }

  // Best-effort from here — the account is already permanently deleted
  // server-side, so none of these steps can un-delete it, and none may
  // block reaching /auth.
  try {
    await deps.clearSupabaseSession();
  } catch (error) {
    safeLog("Clearing the Supabase session failed after account deletion.", error);
  }

  try {
    await deps.unsubscribeBrowserPush();
  } catch (error) {
    safeLog("Browser push unsubscribe failed during account deletion.", error);
  }

  try {
    deps.clearLocalState();
  } catch (error) {
    safeLog("Local cleanup failed during account deletion.", error);
  }

  deps.leaveToAuth();

  return { ok: true };
}
