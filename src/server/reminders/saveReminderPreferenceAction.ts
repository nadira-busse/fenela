"use server";

// Public-facing mutation boundary for `reminder_preferences` (Phase 4D,
// ADR-004). Treated like any public endpoint: authenticates and validates
// on the server, does not trust a caller-supplied user_id. One row per
// authenticated user — upsert on the user_id primary key so a first save
// creates it and a later save (from onboarding or from Coaching's
// Reminder Settings) updates the same canonical row rather than
// duplicating it. Mirrors src/server/preferences/saveUserPreferenceAction.ts.

import { requireUser, UnauthenticatedError } from "@/server/auth/requireUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  validateSaveReminderPreferenceInput,
  type SaveReminderPreferenceInput,
} from "@/lib/reminderPreferenceMapping";

export type SaveReminderPreferenceResult =
  | { ok: true }
  | { ok: false; error: "UNAUTHENTICATED" | "INVALID_INPUT" | "DATABASE_ERROR"; message: string };

export async function saveReminderPreferenceAction(
  input: SaveReminderPreferenceInput
): Promise<SaveReminderPreferenceResult> {
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

  const validation = validateSaveReminderPreferenceInput(input);

  if (!validation.ok) {
    return { ok: false, error: "INVALID_INPUT", message: validation.message };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("reminder_preferences").upsert(
    {
      user_id: user.id,
      enabled: input.enabled,
      start_time: input.startTime,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return {
      ok: false,
      error: "DATABASE_ERROR",
      message: "Could not save your reminder settings right now. Please try again.",
    };
  }

  return { ok: true };
}
