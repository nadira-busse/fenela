// Narrow, non-destructive authenticated-activity touch (Phase 4H,
// hardened). The retention policy (retentionPolicy.ts) needs a
// server-observed "this account is actually being used" signal that
// advances on more than just a new sign-in — Supabase Auth's own
// `last_sign_in_at` only moves on a fresh sign-in event, so a user who
// keeps returning on an already-valid session would otherwise look
// inactive. `devices.last_seen_at` was considered and rejected: it is
// only touched by getOrCreateOwnDevice() (the push/device-subscription
// path), not by a normal authenticated root-page return.
//
// Writes to `public.user_activity` — a dedicated table, not a column on
// user_preferences (see supabase/migrations/20260812120000_user_activity.sql
// for why: user_preferences only exists once a user completes onboarding,
// and `authenticated` already has an own-row UPDATE grant on it, which
// would make a client-writable timestamp feed a destructive retention
// decision). This uses the PRIVILEGED admin client deliberately — the
// migration grants `authenticated` no access to user_activity at all, so
// the normal RLS-scoped client could never perform this write even if it
// tried, and this is the only place in the codebase that is allowed to.
//
// Upserts on `user_id` so the first-ever authenticated request for a user
// creates the row and every later one updates it — this must work before
// any user_preferences row exists, since that is exactly the case the
// dedicated table exists to cover.
//
// The caller-supplied userId must always be the authenticated session's
// own id (src/app/page.tsx derives it from getOptionalUser(), never from
// client input) — this function performs no authorization of its own and
// must never be given a caller-supplied/cross-user id.
//
// Decision: non-critical bookkeeping, not a request-blocking dependency.
// A failed write is caught and logged, never thrown — an authenticated
// user's root page must never fail to render because an activity
// timestamp couldn't be written. This mirrors getOrCreateOwnDevice's
// existing best-effort last_seen_at touch. A missed touch does not make
// retention unsafe: retentionPolicy.ts's own fail-closed default (both
// last_sign_in_at and last_active_at missing/malformed -> NOT expired)
// means an occasionally-missing activity row is read as "no evidence
// either way," never as a false "definitely inactive" signal — it is
// never treated as if a stale/old timestamp had actually been observed.
//
// The entire body is wrapped in try/catch, not just the awaited result's
// `error` field: a rejected/thrown call (e.g. a missing SUPABASE_SECRET_KEY,
// or a network failure while constructing/issuing the request) would
// otherwise propagate out of this function uncaught and — since the root
// page (src/app/page.tsx) awaits this directly — break the entire page
// render, which contradicts this function's own "must never fail to
// render" contract. Every warning below logs PostgrestError's full
// `{ message, details, hint, code }` shape, not just `.message` — no
// secrets/tokens are ever part of a Postgres/PostgREST error, and `.hint`
// in particular commonly names the exact fix for a permission/grant
// problem (see @supabase/postgrest-js's own upsert() documentation).

import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";

export async function touchOwnActivity(userId: string): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();

    const { error } = await supabase
      .from("user_activity")
      .upsert(
        { user_id: userId, last_active_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    if (error) {
      console.warn("Failed to touch own activity timestamp:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    }
  } catch (error) {
    console.warn(
      "Failed to touch own activity timestamp (unexpected exception):",
      error instanceof Error ? error.message : error
    );
  }
}
