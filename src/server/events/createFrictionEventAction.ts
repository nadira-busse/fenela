"use server";

// Public-facing mutation boundary for appending an immutable FrictionEvent
// (Phase 4C, ADR-005). Records only the user's own factual free-text
// answer to "What is making this step hard right now?" — no sentiment
// analysis, psychological classification, or AI interpretation.
//
// Ownership/idempotency/time semantics mirror
// src/server/events/createActionEventAction.ts exactly (RLS-enforced
// insert, client_event_id UNIQUE constraint treated as an idempotent
// retry, server-derived time metadata) — see that file for the detailed
// rationale.

import { requireUser, UnauthenticatedError } from "@/server/auth/requireUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOwnUserPreference } from "@/server/preferences/getOwnUserPreference";
import { deriveEventTimeMetadata } from "@/lib/eventTime";
import {
  validateCreateFrictionEventInput,
  type CreateFrictionEventInput,
} from "@/lib/eventMapping";

const UNAUTHENTICATED_MESSAGE = "Your session expired. Please sign in again to continue.";
const DATABASE_ERROR_MESSAGE = "Could not save this right now. Please try again.";

export type CreateFrictionEventResult =
  | { ok: true }
  | {
      ok: false;
      error: "UNAUTHENTICATED" | "INVALID_INPUT" | "DATABASE_ERROR";
      message: string;
    };

export async function createFrictionEventAction(
  input: CreateFrictionEventInput
): Promise<CreateFrictionEventResult> {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, error: "UNAUTHENTICATED", message: UNAUTHENTICATED_MESSAGE };
    }

    throw error;
  }

  const validation = validateCreateFrictionEventInput(input);

  if (!validation.ok) {
    return { ok: false, error: "INVALID_INPUT", message: validation.message };
  }

  let preference;

  try {
    preference = await getOwnUserPreference();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, error: "UNAUTHENTICATED", message: UNAUTHENTICATED_MESSAGE };
    }

    return { ok: false, error: "DATABASE_ERROR", message: DATABASE_ERROR_MESSAGE };
  }

  // Defensive: every authenticated user reaching Coaching has already
  // completed screening, which writes user_preferences first (see
  // src/app/components/ScreeningScreen.tsx) — this should be unreachable.
  if (!preference) {
    return { ok: false, error: "DATABASE_ERROR", message: DATABASE_ERROR_MESSAGE };
  }

  const { occurredAt, localDate, timeZone } = deriveEventTimeMetadata(
    new Date(),
    preference.time_zone
  );

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("friction_events").insert({
    anchor_id: input.anchorId,
    client_event_id: input.clientEventId,
    reason: input.reason.trim(),
    occurred_at: occurredAt,
    local_date: localDate,
    time_zone: timeZone,
  });

  if (error) {
    if (error.code === "23505") {
      // Same logical submission retried: already recorded, not a new failure.
      return { ok: true };
    }

    return { ok: false, error: "DATABASE_ERROR", message: DATABASE_ERROR_MESSAGE };
  }

  return { ok: true };
}
