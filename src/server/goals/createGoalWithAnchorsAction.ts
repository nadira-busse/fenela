"use server";

// Public-facing mutation boundary for creating a Goal + its Anchors
// (Phase 4B). Treated like any public endpoint: authenticates and
// validates on the server, does not trust a caller-supplied user_id.
//
// Atomicity: delegates to the create_active_goal_with_anchors PostgreSQL
// function (supabase/migrations/20260809130000_goal_anchor_atomic_creation.sql),
// which inserts the Goal and all Anchors inside one function body — if any
// insert fails (including the one-active-goal-per-user unique index, or an
// Anchor CHECK constraint), the whole call rolls back and no partial Goal
// is left behind. This Server Action does not attempt any client-side
// compensating delete; the DB transaction is the actual consistency
// mechanism.

import { requireUser, UnauthenticatedError } from "@/server/auth/requireUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateCreateGoalInput, type CreateGoalInput } from "@/lib/goalMapping";

export type CreatedAnchor = {
  id: string;
  text: string;
  source: string;
  position: number;
};

export type CreateGoalWithAnchorsResult =
  | { ok: true; goalId: string; anchors: CreatedAnchor[] }
  | {
      ok: false;
      error: "UNAUTHENTICATED" | "INVALID_INPUT" | "DATABASE_ERROR";
      message: string;
    };

export async function createGoalWithAnchorsAction(
  input: CreateGoalInput
): Promise<CreateGoalWithAnchorsResult> {
  try {
    await requireUser();
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

  const validation = validateCreateGoalInput(input);

  if (!validation.ok) {
    return { ok: false, error: "INVALID_INPUT", message: validation.message };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("create_active_goal_with_anchors", {
    p_title: input.title.trim(),
    p_why: input.why.trim(),
    p_initial_struggle: input.initialStruggle.trim(),
    p_personal_anchor_interpretation: input.personalAnchorInterpretation,
    // The generated Args type doesn't reflect that this `text` column is
    // nullable at the SQL level (Postgres function params carry no
    // not-null modifier by default) — null is a valid, intended value here.
    p_interpretation_source: input.interpretationSource as unknown as string,
    p_anchors: input.anchors.map((anchor) => ({
      text: anchor.text.trim(),
      source: anchor.source,
      position: anchor.position,
    })),
  });

  if (error || !data || data.length === 0) {
    // user_id is never accepted from the caller, so this can't be an
    // ownership/ambient-authority error — it's either a genuine DB/RPC
    // failure or (a defensive case that should be unreachable given the
    // validation above) the RPC's own defense-in-depth checks. Either way,
    // no raw Postgres error reaches the browser.
    return {
      ok: false,
      error: "DATABASE_ERROR",
      message: "Could not save your goal right now. Please try again.",
    };
  }

  return {
    ok: true,
    goalId: data[0].goal_id,
    anchors: data.map((row) => ({
      id: row.anchor_id,
      text: row.anchor_text,
      source: row.anchor_source,
      position: row.anchor_position,
    })),
  };
}
