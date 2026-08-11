// Privileged, server-only Auth Admin deletion for one exact user id
// (Phase 4G). This is the actual irreversible identity deletion account
// deletion depends on — everything else in the deletion flow (operational
// KV cleanup, PostgreSQL cascades) is either reversible-in-principle or a
// downstream consequence of this call succeeding.
//
// auth.admin.deleteUser() is a Supabase Auth Admin operation, not a
// public-schema table write — it needs no PostgreSQL table GRANT, only the
// privileged client's service-role key (src/lib/supabase/adminClient.ts).
//
// Scoped to exactly this one operation and never exposed to client code —
// callers must already trust `userId` (see
// src/server/account/deleteAccountForUser.ts, which derives it from
// requireUser() before this is ever reached).

import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";

export type DeleteAuthUserResult = { ok: true } | { ok: false; message: string };

export async function deleteAuthUserById(userId: string): Promise<DeleteAuthUserResult> {
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}
