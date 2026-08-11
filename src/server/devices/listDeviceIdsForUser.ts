// Privileged, server-only enumeration of every Device owned by a given
// user id (Phase 4G). Used exclusively by the account deletion core
// (src/server/account/deleteAccountForUser.ts) to find every Device whose
// operational KV state must be cleaned up before the account's auth.users
// row — and, via cascade, its devices/push_subscriptions rows — is
// deleted.
//
// Deliberately uses the privileged admin client rather than the normal
// RLS-scoped client: a browser session's own Device list would only ever
// cover the current browser, and this deletion core is designed to also be
// reusable by a future inactivity-deletion path that has no browser
// session/cookies to scope a normal client to at all (Phase 4G scope — that
// path is not built yet, but this helper must not assume a session
// exists). Because the admin client bypasses Row Level Security, ownership
// is enforced explicitly here via `.eq("user_id", userId)`, not implicitly
// by policy.
//
// Not filtered by revoked_at — account deletion must clean up every Device
// this user has ever owned, not only currently-active ones.

import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";

export async function listDeviceIdsForUser(userId: string): Promise<string[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase.from("devices").select("id").eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to list devices for user: ${error.message}`);
  }

  return (data ?? []).map((row) => row.id);
}
