// Orchestrates Intake completion (Phase 4B hardening, Defect C): for an
// authenticated user, the DB Goal+Anchor transaction must succeed before
// any local compatibility state (fenela:intake, careAnchors, dayStateV3)
// is written — otherwise a failed persistence attempt could leave
// localStorage implying a goal exists that the database rejected.
// Extracted from src/app/HomeClient.tsx so this ordering is independently
// testable without rendering the component (this repo has no RTL/jsdom
// dependency), mirroring src/app/newGoalReset.ts's approach.
//
// The unauthenticated/local-only MVP1 path has no DB step to wait on, so
// it applies compatibility state immediately using the anchors as
// submitted — unchanged from the existing local-only behavior.

import type { IntakeCompletionData, IntakeCompletionResult } from "./components/IntakeScreen";
import type { PersonalAnchorInterpretation } from "@/types/intake";
import type { CareAnchor } from "@/types/CareAnchor";
import type { CreateGoalWithAnchorsResult } from "@/server/goals/createGoalWithAnchorsAction";
import { mapDbAnchorSource, type CreateGoalInput } from "@/lib/goalMapping";

export type Intake = {
  name: string;
  goal: string;
  struggle: string;
  goalWhy: string;
  personalAnchorInterpretation?: PersonalAnchorInterpretation;
};

export type CompletedIntakeState = {
  goalId: string | undefined;
  intake: Intake;
  careAnchors: CareAnchor[];
};

export type IntakeCompletionDeps = {
  createGoalWithAnchors: (input: CreateGoalInput) => Promise<CreateGoalWithAnchorsResult>;
  applyCompletedIntake: (state: CompletedIntakeState) => void;
};

// The DB-persisted Anchors (normalized id/source, position from the RPC)
// are canonical once a Goal is created (Phase 4B §10) — reused here
// instead of the client-submitted anchors so the compatibility cache
// matches exactly what was persisted, without re-reading localStorage or
// re-querying the database.
function toCompatibilityAnchors(
  result: Extract<CreateGoalWithAnchorsResult, { ok: true }>
): CareAnchor[] {
  return [...result.anchors]
    .sort((a, b) => a.position - b.position)
    .map((anchor) => ({
      id: anchor.id,
      text: anchor.text,
      source: mapDbAnchorSource(anchor.source),
    }));
}

export async function performIntakeCompletion(
  userId: string | null,
  data: IntakeCompletionData,
  deps: IntakeCompletionDeps
): Promise<IntakeCompletionResult> {
  let goalId: string | undefined;
  let careAnchors: CareAnchor[] = data.anchors;

  if (userId) {
    const result = await deps.createGoalWithAnchors({
      title: data.goal,
      why: data.goalWhy,
      initialStruggle: data.struggle,
      personalAnchorInterpretation: data.personalAnchorInterpretation ?? null,
      interpretationSource: data.interpretationSource,
      anchors: data.anchors.map((anchor, index) => ({
        text: anchor.text,
        source: anchor.source ?? "USER",
        position: index + 1,
      })),
    });

    if (!result.ok) {
      return { ok: false, message: result.message };
    }

    goalId = result.goalId;
    careAnchors = toCompatibilityAnchors(result);
  }

  // Only reached once persistence has succeeded (or there was no
  // authenticated user to persist for, i.e. the unauthenticated/local-only
  // MVP1 path) — compatibility state is never applied before that.
  deps.applyCompletedIntake({
    goalId,
    intake: {
      name: data.name,
      goal: data.goal,
      struggle: data.struggle,
      goalWhy: data.goalWhy,
      personalAnchorInterpretation: data.personalAnchorInterpretation,
    },
    careAnchors,
  });

  return { ok: true };
}
