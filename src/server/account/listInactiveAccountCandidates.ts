// Privileged, server-only enumeration of retention-expired Auth users
// (Phase 4H, hardened). Finds *who* is eligible for the 12-month
// inactivity retention policy; it never deletes anything itself — see
// runAccountRetentionBatch.ts for the step that hands each candidate to
// the existing canonical deletion core.
//
// Two activity sources feed eligibility (see retentionPolicy.ts for the
// full rule):
//   - Supabase Auth's own `User.last_sign_in_at` (an Auth Admin API
//     field) — a safe baseline that only advances on a new sign-in;
//   - `user_activity.last_active_at` — a dedicated, server-owned table
//     touched on every normal authenticated root load
//     (touchOwnActivity.ts), which keeps a still-valid session that never
//     re-signs-in from looking falsely inactive, and — unlike a column on
//     user_preferences — exists for a user from their very first
//     authenticated request, before onboarding. `devices.last_seen_at`
//     was considered and rejected: it is only touched by the
//     push/device-subscription path, not by normal authenticated use.
// The more recent of the two wins (isInactiveAccountExpired).
//
// Never queries `auth.users` through a public-schema table/view — there is
// no such table, and this repository does not invent one merely because
// the underlying table exists internally. `supabase.auth.admin.listUsers()`
// is the actual supported Admin API for the Auth side (see
// node_modules/@supabase/auth-js's GoTrueAdminApi). `user_activity` IS a
// real public-schema table, and its last_active_at values for the current
// Auth page are batch-fetched with a single `.in("user_id", [...])` query
// per page rather than one query per user, using the privileged admin
// client — the only role with any access to this table at all (see
// supabase/migrations/20260812120000_user_activity.sql: `authenticated`
// gets no grant on it whatsoever, precisely so this destructive decision
// never depends on a client-writable timestamp).
//
// Bounded batch, not a queueing platform (Phase 4H §4/§7): Admin user
// listing is paginated, and this walks every page sequentially within one
// invocation, capped by RETENTION_SCAN_MAX_PAGES so a corrupted/looping
// pagination response — or an unexpectedly large user base — cannot make a
// single retention run take unbounded time. If the cap is hit before the
// last page is reached, the remaining pages are NOT silently skipped: the
// result reports `truncated: true` so the caller/report can surface that
// explicitly rather than assuming full coverage. For MVP2's expected scale
// this cap (50 pages x 200 users = 10,000 accounts scanned per run) is far
// beyond the real user count; if the product ever needs more, that is a
// deliberate, visible future change to these constants, not a silent
// limitation.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { isInactiveAccountExpired } from "./retentionPolicy";
import type { Database } from "@/types/database.types";

export const RETENTION_SCAN_USERS_PER_PAGE = 200;
export const RETENTION_SCAN_MAX_PAGES = 50;

export type InactiveAccountCandidates = {
  candidateUserIds: string[];
  scanned: number;
  truncated: boolean;
};

// One query per Auth page, not one per user (avoids N+1). A user id with
// no user_activity row simply has no entry in the returned map —
// retentionPolicy.ts's own fallback treats that the same as an explicit
// null (fall back to last_sign_in_at alone) — valid for a user created
// before this feature existed, or one who has not made an authenticated
// product request since.
async function fetchLastActiveAtByUserId(
  supabase: SupabaseClient<Database>,
  userIds: string[]
): Promise<Map<string, string | null>> {
  const lastActiveAtByUserId = new Map<string, string | null>();

  if (userIds.length === 0) {
    return lastActiveAtByUserId;
  }

  const { data, error } = await supabase
    .from("user_activity")
    .select("user_id, last_active_at")
    .in("user_id", userIds);

  if (error) {
    throw new Error(`Failed to load activity for Auth page: ${error.message}`);
  }

  for (const row of data ?? []) {
    lastActiveAtByUserId.set(row.user_id, row.last_active_at);
  }

  return lastActiveAtByUserId;
}

export async function listInactiveAccountCandidates(
  referenceInstant: Date
): Promise<InactiveAccountCandidates> {
  const supabase = createSupabaseAdminClient();

  const candidateUserIds: string[] = [];
  let scanned = 0;
  let page = 1;

  while (page <= RETENTION_SCAN_MAX_PAGES) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: RETENTION_SCAN_USERS_PER_PAGE,
    });

    if (error) {
      throw new Error(`Failed to list Auth users: ${error.message}`);
    }

    const lastActiveAtByUserId = await fetchLastActiveAtByUserId(
      supabase,
      data.users.map((user) => user.id)
    );

    for (const user of data.users) {
      scanned++;

      const lastActiveAt = lastActiveAtByUserId.get(user.id) ?? null;

      if (isInactiveAccountExpired(user.last_sign_in_at, lastActiveAt, referenceInstant)) {
        candidateUserIds.push(user.id);
      }
    }

    if (!data.nextPage) {
      return { candidateUserIds, scanned, truncated: false };
    }

    page++;
  }

  // Hit RETENTION_SCAN_MAX_PAGES with more pages still remaining.
  return { candidateUserIds, scanned, truncated: true };
}
