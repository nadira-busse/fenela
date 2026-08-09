"use server";

// Public-facing mutation boundary for `user_preferences` (Phase 4A). Treated
// like any public endpoint: authenticates and validates on the server, does
// not trust a caller-supplied user_id. One row per authenticated user —
// upsert on the user_id primary key so a first save creates it and a later
// save updates the same row rather than duplicating it.

import { requireUser, UnauthenticatedError } from "@/server/auth/requireUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  mapAnchorChoiceModeToDb,
  validateUserPreferenceInput,
  type UserPreferenceWriteInput,
} from "@/lib/userPreferenceMapping";

export type SaveUserPreferenceResult =
  | { ok: true }
  | { ok: false; error: "UNAUTHENTICATED" | "INVALID_INPUT" | "DATABASE_ERROR"; message: string };

export async function saveUserPreferenceAction(
  input: UserPreferenceWriteInput
): Promise<SaveUserPreferenceResult> {
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

  const validation = validateUserPreferenceInput(input);

  if (!validation.ok) {
    return { ok: false, error: "INVALID_INPUT", message: validation.message };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      display_name: input.displayName.trim(),
      anchor_choice_mode: mapAnchorChoiceModeToDb(input.anchorChoiceMode),
      resistance_pattern: input.resistancePattern,
      main_challenge: input.mainChallenge,
      action_trigger: input.actionTrigger,
      anti_help: input.antiHelp,
      time_zone: input.timeZone.trim(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    // Never surface the raw Postgres/Supabase error to the browser.
    return {
      ok: false,
      error: "DATABASE_ERROR",
      message: "Could not save your preferences right now. Please try again.",
    };
  }

  return { ok: true };
}
