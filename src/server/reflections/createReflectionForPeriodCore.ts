// Trusted internal implementation for deterministic Reflection creation
// (Phase 4E §16, ADR-005; Phase 4E hardening — closes the untrusted
// period boundary). NOT a Server Action (no "use server" directive) and
// therefore NOT reachable from client code — the only public,
// client-callable entry point is
// src/server/reflections/createReflectionForPeriod.ts, which always
// supplies `referenceInstant` itself (`new Date()`), never anything
// caller-derived.
//
// Why this split exists: Reflection rows are immutable and idempotent
// per (user, reflection_type, period_start, period_end). If an untrusted
// caller could choose `referenceInstant` directly, they could persist a
// Reflection for an incomplete current period or an empty future period;
// the unique constraint would then permanently return that same
// (now-stale) row for the rest of that period, and later events landing
// inside it could never enter a Reflection for that exact period again.
// Keeping `referenceInstant` as a normal, required parameter *here* (not
// defaulted, not optional) is what keeps deterministic period unit/
// integration testing possible — it is the public wrapper's job to
// enforce "always now," not this function's.
//
// Write boundary (§17): supabase/migrations/20260809120000_mvp2_persistence_foundation.sql
// grants `authenticated` SELECT-only on `reflections` — its own comment
// documents that writes are expected "through trusted server-side
// application code using the service_role key," anticipating exactly this
// boundary. This reuses the existing privileged admin client
// (src/lib/supabase/adminClient.ts, introduced in Phase 4D for an
// unrelated narrow cleanup job) rather than adding a new SECURITY DEFINER
// RPC, per that already-documented, already-accepted plan. The admin
// client is used for exactly one statement (the INSERT); event history is
// read through the normal RLS-scoped client (getOwnHistoryForPeriod), and
// a post-conflict re-read uses the normal RLS-scoped client too (the
// `reflections_select_own` grant already permits it) — minimizing the
// privileged client's actual surface to the one operation `authenticated`
// truly cannot perform itself.
//
// Idempotency (§18): reflections_period_unique (user_id, reflection_type,
// period_start, period_end) is the actual invariant. A retried request for
// the same period hits that constraint (Postgres 23505) rather than
// inserting a duplicate; this boundary treats that as success and returns
// the existing row — it never UPDATEs an existing Reflection.

import { requireUser, UnauthenticatedError } from "@/server/auth/requireUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getOwnUserPreference } from "@/server/preferences/getOwnUserPreference";
import { getOwnHistoryForPeriod } from "./getOwnHistoryForPeriod";
import { getReflectionPeriod, type ReflectionType } from "@/lib/reflectionPeriod";
import { aggregateReflectionFacts, type ReflectionFacts } from "@/lib/reflectionAggregation";
import { renderDeterministicReflectionText } from "@/lib/reflectionRenderer";
import type { Tables } from "@/types/database.types";

const REFLECTION_TYPES: readonly ReflectionType[] = ["WEEKLY", "MONTHLY"];

export type CreateReflectionForPeriodCoreInput = {
  type: ReflectionType;
  referenceInstant: Date;
};

export type ReflectionRecord = {
  id: string;
  reflectionType: ReflectionType;
  periodStart: string;
  periodEnd: string;
  timeZone: string;
  factsSnapshot: ReflectionFacts;
  generatedText: string;
  generationMode: string;
  model: string | null;
  createdAt: string;
};

export type CreateReflectionResult =
  | { ok: true; created: boolean; reflection: ReflectionRecord }
  | {
      ok: false;
      error: "UNAUTHENTICATED" | "INVALID_INPUT" | "NO_TIME_ZONE" | "DATABASE_ERROR";
      message: string;
    };

const UNAUTHENTICATED_MESSAGE = "Your session expired. Please sign in again to continue.";
const DATABASE_ERROR_MESSAGE = "Could not create your reflection right now. Please try again.";

function mapRow(row: Tables<"reflections">): ReflectionRecord {
  return {
    id: row.id,
    reflectionType: row.reflection_type as ReflectionType,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    timeZone: row.time_zone,
    factsSnapshot: row.facts_snapshot as unknown as ReflectionFacts,
    generatedText: row.generated_text,
    generationMode: row.generation_mode,
    model: row.model,
    createdAt: row.created_at,
  };
}

export async function createReflectionForPeriodCore(
  input: CreateReflectionForPeriodCoreInput
): Promise<CreateReflectionResult> {
  let user;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, error: "UNAUTHENTICATED", message: UNAUTHENTICATED_MESSAGE };
    }

    throw error;
  }

  if (!REFLECTION_TYPES.includes(input.type)) {
    return { ok: false, error: "INVALID_INPUT", message: "Invalid reflection type." };
  }

  if (Number.isNaN(input.referenceInstant.getTime())) {
    return { ok: false, error: "INVALID_INPUT", message: "Invalid reference date." };
  }

  const preference = await getOwnUserPreference();

  // Defensive: every authenticated user who has completed screening has a
  // user_preferences row (see src/app/components/ScreeningScreen.tsx) —
  // this should be unreachable in practice, but a missing canonical
  // timezone must fail closed rather than guess one (§6).
  if (!preference) {
    return {
      ok: false,
      error: "NO_TIME_ZONE",
      message: "Could not determine your timezone. Please try again.",
    };
  }

  const period = getReflectionPeriod({
    type: input.type,
    referenceInstant: input.referenceInstant,
    timeZone: preference.time_zone,
  });

  const history = await getOwnHistoryForPeriod({ start: period.start, end: period.end });

  const facts = aggregateReflectionFacts({
    period,
    actionEvents: history.actionEvents,
    frictionEvents: history.frictionEvents,
  });

  const generatedText = renderDeterministicReflectionText(facts);

  const admin = createSupabaseAdminClient();

  const { data: inserted, error: insertError } = await admin
    .from("reflections")
    .insert({
      user_id: user.id,
      reflection_type: period.type,
      period_start: period.start,
      period_end: period.end,
      time_zone: period.timeZone,
      facts_snapshot: facts as unknown as Tables<"reflections">["facts_snapshot"],
      generated_text: generatedText,
      generation_mode: "DETERMINISTIC",
      model: null,
    })
    .select("*")
    .single();

  if (!insertError && inserted) {
    return { ok: true, created: true, reflection: mapRow(inserted) };
  }

  if (insertError?.code === "23505") {
    // Same logical period requested again: return the existing stable
    // historical record rather than creating a duplicate or overwriting
    // it (§18). Re-read through the normal RLS-scoped client — reflections
    // already grants authenticated SELECT-own.
    const supabase = await createSupabaseServerClient();

    const { data: existing, error: fetchError } = await supabase
      .from("reflections")
      .select("*")
      .eq("user_id", user.id)
      .eq("reflection_type", period.type)
      .eq("period_start", period.start)
      .eq("period_end", period.end)
      .maybeSingle();

    if (fetchError || !existing) {
      return { ok: false, error: "DATABASE_ERROR", message: DATABASE_ERROR_MESSAGE };
    }

    return { ok: true, created: false, reflection: mapRow(existing) };
  }

  return { ok: false, error: "DATABASE_ERROR", message: DATABASE_ERROR_MESSAGE };
}
