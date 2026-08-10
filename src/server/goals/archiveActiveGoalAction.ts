"use server";

// Public-facing mutation boundary for archiving the caller's current ACTIVE
// goal ("New Goal", Phase 4B §15). A single UPDATE statement is already
// atomic in PostgreSQL — no RPC needed here, unlike goal+anchor creation.
// Ownership comes from requireUser() + the existing goals_update_own RLS
// policy (user_id = auth.uid()); no caller-supplied user_id is ever
// accepted. Archives only — never deletes, and never creates a replacement
// goal. Child anchors are left as-is: the parent goal's ARCHIVED status is
// sufficient to make them historical (the smaller consistent model).

import { requireUser, UnauthenticatedError } from "@/server/auth/requireUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ArchiveActiveGoalResult =
  | { ok: true; archivedGoalId: string }
  | { ok: true; archivedGoalId: null } // no ACTIVE goal existed — controlled no-op
  | {
      ok: false;
      error: "UNAUTHENTICATED" | "DATABASE_ERROR";
      message: string;
    };

export async function archiveActiveGoalAction(): Promise<ArchiveActiveGoalResult> {
  let user;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return {
        ok: false,
        error: "UNAUTHENTICATED",
        message: "Your session expired. Please sign in again to continue.",
      };
    }

    throw error;
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("goals")
    .update({ status: "ARCHIVED", archived_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .select("id");

  if (error) {
    return {
      ok: false,
      error: "DATABASE_ERROR",
      message: "Could not start a new goal right now. Please try again.",
    };
  }

  if (!data || data.length === 0) {
    return { ok: true, archivedGoalId: null };
  }

  return { ok: true, archivedGoalId: data[0].id };
}
