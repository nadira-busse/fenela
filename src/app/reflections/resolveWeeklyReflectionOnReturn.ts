// Decides whether the Phase 4F weekly reflection card should be shown on
// this app load, and to what. Extracted from the WeeklyReflectionGate
// component so this decision is independently testable without rendering
// (this repo has no RTL/jsdom dependency) — same pattern as
// src/app/newGoalReset.ts / src/app/intakeCompletion.ts.
//
// Fails OPEN on any resolution failure (network error, thrown exception,
// `ok: false` from the server): the weekly reflection is an optional,
// degraded-gracefully feature, so any failure here simply means "don't
// show it this time," never a reason to block the core Fenéla flow the
// caller renders regardless of this function's result.

import type { ResolveWeeklyReflectionResult } from "@/server/reflections/resolveWeeklyReflectionCore";
import type { ReflectionRecord } from "@/server/reflections/createReflectionForPeriodCore";

export type WeeklyReflectionPresentation =
  | { show: true; reflection: ReflectionRecord }
  | { show: false };

export type ResolveWeeklyReflectionOnReturnInput = {
  // False for anonymous users and for authenticated users with no active
  // Goal yet — the resolver is never even called in that case.
  enabled: boolean;
  resolveWeeklyReflection: () => Promise<ResolveWeeklyReflectionResult>;
  getLastSeenId: () => string | null;
};

const NOT_SHOWN: WeeklyReflectionPresentation = { show: false };

export async function resolveWeeklyReflectionOnReturn(
  input: ResolveWeeklyReflectionOnReturnInput
): Promise<WeeklyReflectionPresentation> {
  if (!input.enabled) {
    return NOT_SHOWN;
  }

  let result: ResolveWeeklyReflectionResult;

  try {
    result = await input.resolveWeeklyReflection();
  } catch (error) {
    console.warn("Weekly reflection could not be resolved.", error);
    return NOT_SHOWN;
  }

  if (!result.ok || !result.reflection) {
    return NOT_SHOWN;
  }

  if (input.getLastSeenId() === result.reflection.id) {
    return NOT_SHOWN;
  }

  return { show: true, reflection: result.reflection };
}
