// Mapping and validation between the Intake/CareAnchor application
// vocabulary and the persisted `goals`/`anchors` vocabulary
// (supabase/migrations/20260809120000_mvp2_persistence_foundation.sql,
// supabase/migrations/20260809130000_goal_anchor_atomic_creation.sql).
//
// Framework-free and pure so it can be unit-tested without a Supabase
// boundary, matching src/lib/userPreferenceMapping.ts's precedent.

import type { AnchorSource, CareAnchor } from "@/types/CareAnchor";
import type { PersonalAnchorInterpretation } from "@/types/intake";
import type { StoredCareAnchor } from "@/lib/storage";

export type InterpretationSource = "AI" | "FALLBACK";

const MAX_TEXT_LENGTH = 500;
const MAX_ANCHOR_TEXT_LENGTH = 200;
const MIN_ANCHORS = 1;
const MAX_ANCHORS = 5;
const ANCHOR_SOURCES: readonly AnchorSource[] = ["USER", "AI", "FALLBACK"];

// The /api/ai/anchors route's own response-level `source` field
// ("ai" | "fallback" | "deterministic") — distinct from the per-anchor
// provenance this maps to. "deterministic" only occurs when the server
// returns zero anchors (I_DECIDE mode), so it never actually reaches an
// anchor; mapped to FALLBACK here only so the function is total.
export function mapApiSourceToAnchorSource(apiSource: string): AnchorSource {
  return apiSource === "ai" ? "AI" : "FALLBACK";
}

export function mapApiSourceToInterpretationSource(apiSource: string): InterpretationSource {
  return apiSource === "ai" ? "AI" : "FALLBACK";
}

export type GoalAnchorInput = {
  text: string;
  source: AnchorSource;
  position: number;
};

export type CreateGoalInput = {
  title: string;
  why: string;
  initialStruggle: string;
  personalAnchorInterpretation: PersonalAnchorInterpretation | null;
  interpretationSource: InterpretationSource | null;
  anchors: GoalAnchorInput[];
};

export type ValidationResult = { ok: true } | { ok: false; message: string };

function isNonEmptyBounded(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function isPersonalAnchorInterpretationShape(
  value: unknown
): value is PersonalAnchorInterpretation {
  const data = value as Partial<PersonalAnchorInterpretation> | null;

  return (
    typeof data?.directionLine === "string" &&
    typeof data?.whyLine === "string" &&
    typeof data?.frictionLine === "string" &&
    typeof data?.returnLine === "string"
  );
}

// Server-boundary validation (AGENTS.md §12): runs regardless of what the
// caller's TypeScript types claim, since the Server Action calling this is
// reachable as a plain POST endpoint. The DB (CHECK constraints + the new
// create_active_goal_with_anchors RPC) validates again independently —
// this is the app-level check that produces a fast, controlled failure
// before ever calling Supabase.
export function validateCreateGoalInput(input: CreateGoalInput): ValidationResult {
  if (!isNonEmptyBounded(input.title, MAX_TEXT_LENGTH)) {
    return { ok: false, message: "Please describe your goal." };
  }

  if (!isNonEmptyBounded(input.why, MAX_TEXT_LENGTH)) {
    return { ok: false, message: "Please describe why this matters." };
  }

  if (!isNonEmptyBounded(input.initialStruggle, MAX_TEXT_LENGTH)) {
    return { ok: false, message: "Please describe what's making this hard." };
  }

  if (
    input.interpretationSource !== null &&
    input.interpretationSource !== "AI" &&
    input.interpretationSource !== "FALLBACK"
  ) {
    return { ok: false, message: "Invalid interpretation source." };
  }

  if (input.personalAnchorInterpretation !== null) {
    if (!isPersonalAnchorInterpretationShape(input.personalAnchorInterpretation)) {
      return { ok: false, message: "Invalid personal anchor interpretation." };
    }

    if (input.interpretationSource === null) {
      return {
        ok: false,
        message: "Interpretation source is required when an interpretation is provided.",
      };
    }
  }

  if (
    !Array.isArray(input.anchors) ||
    input.anchors.length < MIN_ANCHORS ||
    input.anchors.length > MAX_ANCHORS
  ) {
    return {
      ok: false,
      message: `Please choose between ${MIN_ANCHORS} and ${MAX_ANCHORS} anchors.`,
    };
  }

  const seenPositions = new Set<number>();

  for (const anchor of input.anchors) {
    if (!isNonEmptyBounded(anchor.text, MAX_ANCHOR_TEXT_LENGTH)) {
      return { ok: false, message: "Each anchor needs text." };
    }

    if (!ANCHOR_SOURCES.includes(anchor.source)) {
      return { ok: false, message: "Invalid anchor source." };
    }

    if (
      !Number.isInteger(anchor.position) ||
      anchor.position < 1 ||
      anchor.position > MAX_ANCHORS
    ) {
      return { ok: false, message: "Invalid anchor position." };
    }

    if (seenPositions.has(anchor.position)) {
      return { ok: false, message: "Anchor positions must be unique." };
    }

    seenPositions.add(anchor.position);
  }

  return { ok: true };
}

// --- DB → application compatibility shape (Phase 4B §10/§12) ---

export type ActiveGoalWithAnchors = {
  id: string;
  title: string;
  why: string;
  initialStruggle: string;
  personalAnchorInterpretation: PersonalAnchorInterpretation | null;
  anchors: { id: string; text: string; source: AnchorSource; position: number }[];
};

export type CompatibilityIntake = {
  name: string;
  goal: string;
  struggle: string;
  goalWhy: string;
  personalAnchorInterpretation?: PersonalAnchorInterpretation;
};

function isAnchorSource(value: string): value is AnchorSource {
  return (ANCHOR_SOURCES as readonly string[]).includes(value);
}

// Defensive: DB columns are typed as plain `string` in the generated types
// (CHECK constraints aren't reflected there).
export function mapDbAnchorSource(value: string): AnchorSource {
  return isAnchorSource(value) ? value : "USER";
}

// The DB Goal + its ACTIVE Anchors are canonical for an authenticated user
// (Phase 4B §10) — this reconstructs the temporary local shape existing
// MVP1 downstream code (IntakeScreen/CoachingScreen via loadScreening()-
// adjacent storage helpers) still requires, without making localStorage
// canonical again.
export function mapActiveGoalToCompatibilityState(
  goal: ActiveGoalWithAnchors,
  name: string
): { intake: CompatibilityIntake; careAnchors: StoredCareAnchor[] } {
  const orderedAnchors = [...goal.anchors].sort((a, b) => a.position - b.position);

  return {
    intake: {
      name,
      goal: goal.title,
      struggle: goal.initialStruggle,
      goalWhy: goal.why,
      personalAnchorInterpretation: goal.personalAnchorInterpretation ?? undefined,
    },
    careAnchors: orderedAnchors.map(
      (anchor): CareAnchor => ({
        id: anchor.id,
        text: anchor.text,
        source: anchor.source,
      })
    ),
  };
}
