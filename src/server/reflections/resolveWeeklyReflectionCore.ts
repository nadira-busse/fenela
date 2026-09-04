// Trusted internal implementation for the live weekly-reflection flow. It
// resolves the previous completed Monday-Sunday period for the authenticated
// caller, reuses an existing immutable reflection for that period, or creates
// one deterministically when recorded activity exists. Empty completed periods
// are not persisted or presented. Concurrent creation is reconciled through the
// database period-uniqueness constraint and a re-read of the existing row.
//
// This module is intentionally separate from the generic period primitive: the
// live product has previous-completed-week semantics and an empty-period gate.

import { requireUser, UnauthenticatedError } from "@/server/auth/requireUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";
import { getOwnUserPreference } from "@/server/preferences/getOwnUserPreference";
import { getOwnHistoryForPeriod } from "./getOwnHistoryForPeriod";
import { getPreviousCompletedWeeklyPeriod } from "@/lib/reflectionPeriod";
import { aggregateReflectionFacts } from "@/lib/reflectionAggregation";
import { renderDeterministicReflectionText } from "@/lib/reflectionRenderer";
import type { ReflectionRecord } from "./createReflectionForPeriodCore";
import type { ReflectionFacts } from "@/lib/reflectionAggregation";
import type { Tables } from "@/types/database.types";

export type ResolveWeeklyReflectionCoreInput = {
  referenceInstant: Date;
};

export type ResolveWeeklyReflectionResult =
  | { ok: true; reflection: ReflectionRecord | null }
  | {
      ok: false;
      error: "UNAUTHENTICATED" | "NO_TIME_ZONE" | "DATABASE_ERROR";
      message: string;
    };

const UNAUTHENTICATED_MESSAGE = "Your session expired. Please sign in again to continue.";
const DATABASE_ERROR_MESSAGE = "Could not load your reflection right now. Please try again.";

// A Reflection's facts are "empty" (zero ActionEvents AND zero
// FrictionEvents) exactly when activeDays is 0 — aggregateReflectionFacts
// (src/lib/reflectionAggregation.ts) folds every FrictionEvent's localDate
// into the same activeDates set as ActionEvents, so a friction-only period
// still has activeDays > 0. Shared by both the existing-row eligibility
// check and the newly-derived-history short-circuit below, so the two
// stay in sync by construction.
function isFactsEmpty(facts: ReflectionFacts): boolean {
  return facts.activity.activeDays === 0;
}

function mapRow(row: Tables<"reflections">): ReflectionRecord {
  return {
    id: row.id,
    reflectionType: row.reflection_type as ReflectionRecord["reflectionType"],
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

export async function resolveWeeklyReflectionCore(
  input: ResolveWeeklyReflectionCoreInput
): Promise<ResolveWeeklyReflectionResult> {
  let user;

  try {
    user = await requireUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return {
        ok: false,
        error: "UNAUTHENTICATED",
        message: UNAUTHENTICATED_MESSAGE,
      };
    }

    throw error;
  }

  const preference = await getOwnUserPreference();

  // Defensive: every authenticated user who has completed screening has a
  // user_preferences row — this should be unreachable in practice, but a
  // missing canonical timezone must fail closed rather than guess one.
  if (!preference) {
    return {
      ok: false,
      error: "NO_TIME_ZONE",
      message: "Could not determine your timezone. Please try again.",
    };
  }

  const period = getPreviousCompletedWeeklyPeriod({
    referenceInstant: input.referenceInstant,
    timeZone: preference.time_zone,
  });

  const supabase = await createSupabaseServerClient();

  const { data: existing, error: selectError } = await supabase
    .from("reflections")
    .select("*")
    .eq("user_id", user.id)
    .eq("reflection_type", period.type)
    .eq("period_start", period.start)
    .eq("period_end", period.end)
    .maybeSingle();

  if (selectError) {
    return {
      ok: false,
      error: "DATABASE_ERROR",
      message: DATABASE_ERROR_MESSAGE,
    };
  }

  if (existing) {
    const existingReflection = mapRow(existing);

    // Presentation eligibility guard (see file header) — an already-
    // persisted but empty row is suppressed, never mutated or deleted.
    if (isFactsEmpty(existingReflection.factsSnapshot)) {
      return { ok: true, reflection: null };
    }

    return { ok: true, reflection: existingReflection };
  }

  const history = await getOwnHistoryForPeriod({
    start: period.start,
    end: period.end,
  });

  const facts = aggregateReflectionFacts({
    period,
    actionEvents: history.actionEvents,
    frictionEvents: history.frictionEvents,
  });

  // A completed week with no recorded activity at all is not, by itself,
  // meaningful enough to interrupt the user with — and no Reflection row is
  // created for it.
  if (isFactsEmpty(facts)) {
    return { ok: true, reflection: null };
  }

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
    return { ok: true, reflection: mapRow(inserted) };
  }

  if (insertError?.code === "23505") {
    // Same logical period requested again (concurrent resolution): re-read
    // the existing stable historical record rather than duplicating.
    // Apply the same presentation-eligibility rule here as on the normal
    // existing-row path, so an empty persisted Reflection is never surfaced.
    const { data: reread, error: fetchError } = await supabase
      .from("reflections")
      .select("*")
      .eq("user_id", user.id)
      .eq("reflection_type", period.type)
      .eq("period_start", period.start)
      .eq("period_end", period.end)
      .maybeSingle();

    if (fetchError || !reread) {
      return {
        ok: false,
        error: "DATABASE_ERROR",
        message: DATABASE_ERROR_MESSAGE,
      };
    }

    const rereadReflection = mapRow(reread);

    if (isFactsEmpty(rereadReflection.factsSnapshot)) {
      return { ok: true, reflection: null };
    }

    return { ok: true, reflection: rereadReflection };
  }

  return {
    ok: false,
    error: "DATABASE_ERROR",
    message: DATABASE_ERROR_MESSAGE,
  };
}
