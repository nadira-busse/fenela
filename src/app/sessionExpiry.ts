// Pure predicate for HomeClient's session-expiry redirect, extracted so it
// is unit-testable without rendering a component (this repo has no
// RTL/jsdom dependency) or instantiating a real Supabase client.
//
// HomeClient's `userId`/`activeGoal`/etc. props are captured once, at the
// server-rendered request that produced the page — they never update
// themselves if the session backing them is invalidated afterward (another
// device's sign-out, a revoked refresh token, natural expiry). Left alone,
// the authenticated Goal/Anchor UI stays on screen indefinitely while every
// session-bound action against it fails server-side. Supabase's browser
// client already detects this — a background token refresh against a
// revoked/expired session fires a "SIGNED_OUT" auth event — so HomeClient
// only needs to react to that event by leaving for /auth, the same
// destination SignOutButton and DeleteAccountButton already use.
import type { AuthChangeEvent } from "@supabase/supabase-js";

export function isSessionExpiredEvent(event: AuthChangeEvent): boolean {
  return event === "SIGNED_OUT";
}
