"use server";

// Public-facing, client-callable Server Action boundary for deterministic
// Reflection creation (Phase 4E §16; hardened to close the untrusted
// period boundary). Accepts ONLY `type` — never a caller-supplied
// referenceInstant, period, or any other period-selection input. Whatever
// instant this Server Action runs at ("now") is always what determines
// the period; that instant is derived here, server-side, and handed to
// the trusted internal implementation
// (./createReflectionForPeriodCore.ts), which is not itself a Server
// Action and is therefore not reachable from client code at all.
//
// Why: Reflection rows are immutable and idempotent per
// (user, reflection_type, period_start, period_end). If a caller could
// choose the period directly, they could persist a Reflection for an
// incomplete current period or an empty future one — the unique
// constraint would then permanently return that same, now-stale row for
// the rest of that period, and later events landing inside it could never
// enter a Reflection for that exact period again. See
// createReflectionForPeriodCore.ts's header for the full rationale.
//
// This intentionally says nothing about WHEN a reflection should be
// generated or shown — weekly/monthly scheduling and presentation remain
// an explicit later-phase product decision. It only guarantees that
// whenever this Server Action runs, the period is always "now," never
// caller-chosen.

import {
  createReflectionForPeriodCore,
  type CreateReflectionResult,
} from "./createReflectionForPeriodCore";
import type { ReflectionType } from "@/lib/reflectionPeriod";

export type { CreateReflectionResult, ReflectionRecord } from "./createReflectionForPeriodCore";

export type CreateReflectionInput = {
  type: ReflectionType;
};

export async function createReflectionForPeriod(
  input: CreateReflectionInput
): Promise<CreateReflectionResult> {
  return createReflectionForPeriodCore({ type: input.type, referenceInstant: new Date() });
}
