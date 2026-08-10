// Server-side read path for the authenticated user's own ACTIVE goal and
// its ACTIVE anchors, ordered by position. Server Component/server-boundary
// use only — not a Server Action, so it is not reachable as a
// client-callable endpoint. Mirrors src/server/preferences/getOwnUserPreference.ts.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth/requireUser";
import { mapDbAnchorSource, type ActiveGoalWithAnchors } from "@/lib/goalMapping";
import type { PersonalAnchorInterpretation } from "@/types/intake";

export async function getActiveGoal(): Promise<ActiveGoalWithAnchors | null> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (goalError) {
    throw new Error(`Failed to load active goal: ${goalError.message}`);
  }

  if (!goal) {
    return null;
  }

  const { data: anchors, error: anchorsError } = await supabase
    .from("anchors")
    .select("*")
    .eq("goal_id", goal.id)
    .eq("status", "ACTIVE")
    .order("position", { ascending: true });

  if (anchorsError) {
    throw new Error(`Failed to load active anchors: ${anchorsError.message}`);
  }

  return {
    id: goal.id,
    title: goal.title,
    why: goal.why,
    initialStruggle: goal.initial_struggle,
    personalAnchorInterpretation:
      (goal.personal_anchor_interpretation as PersonalAnchorInterpretation | null) ?? null,
    anchors: (anchors ?? []).map((anchor) => ({
      id: anchor.id,
      text: anchor.text,
      source: mapDbAnchorSource(anchor.source),
      position: anchor.position,
    })),
  };
}
