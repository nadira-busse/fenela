"use server";

// Account-screen mutation boundary for the `anchor_choice_mode` field alone
// (Phase 4I — AI assistance state consistency). `user_preferences` has no
// per-field update path: saveUserPreferenceAction() upserts the whole row
// (AGENTS.md-style least-surprise contract already established there), so
// changing just the AI-assistance choice must first read the user's current
// row and write it back with only anchorChoiceMode replaced — never resets
// display_name/resistance_pattern/main_challenge/action_trigger/anti_help to
// their column defaults, which a naive partial-looking call would otherwise
// silently do.

import { requireUser, UnauthenticatedError } from "@/server/auth/requireUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { mapDbRowToScreeningFields } from "@/lib/userPreferenceMapping";
import {
  saveUserPreferenceAction,
  type SaveUserPreferenceResult,
} from "./saveUserPreferenceAction";
import type { AnchorChoiceHelp } from "@/lib/screeningStorage";

export async function updateAiAssistanceAction(
  anchorChoiceMode: AnchorChoiceHelp
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

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      error: "DATABASE_ERROR",
      message: "Could not load your current preferences. Please try again.",
    };
  }

  if (!data) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: "Complete screening before changing AI assistance.",
    };
  }

  const existing = mapDbRowToScreeningFields(data);

  return saveUserPreferenceAction({
    displayName: existing.name,
    anchorChoiceMode,
    resistancePattern: existing.resistancePattern,
    mainChallenge: existing.mainChallenge,
    actionTrigger: existing.actionTrigger,
    antiHelp: existing.antiHelp,
    timeZone: data.time_zone,
  });
}
