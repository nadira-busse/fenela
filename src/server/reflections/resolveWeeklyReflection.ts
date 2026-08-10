"use server";

// Public-facing, client-callable Server Action boundary for the Phase 4F
// weekly reflection product flow. Takes no input at all — there is nothing
// for a caller to supply: the eligible period is always "the previous
// completed week as of right now," derived server-side from `new Date()`
// and handed to the trusted internal implementation
// (./resolveWeeklyReflectionCore.ts), which is not itself a Server Action
// and is therefore not reachable from client code at all. Same reasoning as
// createReflectionForPeriod.ts's header: Reflection rows are immutable and
// idempotent per (user, reflection_type, period_start, period_end), so the
// period must never be caller-chosen.

import {
  resolveWeeklyReflectionCore,
  type ResolveWeeklyReflectionResult,
} from "./resolveWeeklyReflectionCore";

export type { ResolveWeeklyReflectionResult } from "./resolveWeeklyReflectionCore";

export async function resolveWeeklyReflection(): Promise<ResolveWeeklyReflectionResult> {
  return resolveWeeklyReflectionCore({ referenceInstant: new Date() });
}
