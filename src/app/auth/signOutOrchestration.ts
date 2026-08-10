// The actual sign-out step sequence (Phase 4D final hardening §7/§8/§9),
// extracted from src/app/auth/SignOutButton.tsx so the "cleanup failure
// must never trap a user inside an authenticated session" guarantee is
// unit-testable without rendering a component (this repo has no RTL/jsdom
// dependency) — every dependency is injected, and every step except the
// final signOut() call is deliberately best-effort: a thrown/rejected
// cleanup step is caught, logged, and never stops the sequence.
//
// Order matters (§8): server device cleanup must run while the session
// still exists, browser unsubscribe next, local cleanup next, and the
// actual Supabase signOut() last and unconditionally.

export type SignOutDeps = {
  getDeviceId: () => string | null;
  cleanupServerPushState: (deviceId: string) => Promise<void>;
  unsubscribeBrowserPush: () => Promise<void>;
  clearLocalState: () => void;
  signOut: () => Promise<void>;
};

function safeLog(label: string, error: unknown) {
  console.warn(label, error);
}

export async function performSignOut(deps: SignOutDeps): Promise<void> {
  const deviceId = deps.getDeviceId();

  if (deviceId) {
    try {
      await deps.cleanupServerPushState(deviceId);
    } catch (error) {
      safeLog("Server push cleanup failed during sign-out.", error);
    }
  }

  try {
    await deps.unsubscribeBrowserPush();
  } catch (error) {
    safeLog("Browser push unsubscribe failed during sign-out.", error);
  }

  // Synchronous and has no failure mode of its own (removeFromStorage
  // never throws), but still guarded: a signed-out session must never be
  // blocked by this step either.
  try {
    deps.clearLocalState();
  } catch (error) {
    safeLog("Local sign-out cleanup failed.", error);
  }

  // Unconditional and last — never wrapped in a way that could be skipped
  // by an earlier failure.
  await deps.signOut();
}
