"use server";

// Public-facing mutation boundary for appending an immutable ActionEvent
// (Phase 4C). Treated like any public endpoint: authenticates and
// validates on the server, does not trust a caller-supplied user_id or
// anchor ownership claim.
//
// Ownership: uses the request-scoped, RLS-enforced Supabase client (not a
// service-role client), so the `action_events_insert_own` policy in
// supabase/migrations/20260809120000_mvp2_persistence_foundation.sql
// (anchor -> goal -> auth.uid()) is the actual authorization check — this
// action does not duplicate that check with its own ownership query.
//
// Idempotency: client_event_id has a DB-level UNIQUE constraint. A retry
// with the same client_event_id hits that constraint (Postgres error code
// 23505) rather than inserting a duplicate row; this action treats that
// specific failure as success, since the logical event is already
// recorded.
//
// Time: occurred_at/local_date/time_zone are derived server-side from the
// authenticated user's own canonical user_preferences.time_zone (Phase 4C
// §6) — never from a caller-supplied timezone.

import { requireUser, UnauthenticatedError } from "@/server/auth/requireUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOwnUserPreference } from "@/server/preferences/getOwnUserPreference";
import { deriveEventTimeMetadata } from "@/lib/eventTime";
import { validateCreateActionEventInput, type CreateActionEventInput } from "@/lib/eventMapping";

const UNAUTHENTICATED_MESSAGE = "Your session expired. Please sign in again to continue.";
const DATABASE_ERROR_MESSAGE = "Could not record this action right now. Please try again.";

export type CreateActionEventResult =
  | { ok: true }
  | {
      ok: false;
      error: "UNAUTHENTICATED" | "INVALID_INPUT" | "DATABASE_ERROR";
      message: string;
    };

export async function createActionEventAction(
  input: CreateActionEventInput
): Promise<CreateActionEventResult> {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return { ok: false, error: "UNAUTHENTICATED", message: UNAUTHENTICATED_MESSAGE };
    }

    throw error;
  }

  const validation = validateCreateActionEventInput(input);

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

  const { error } = await supabase.from("action_events").insert({
    anchor_id: input.anchorId,
    client_event_id: input.clientEventId,
    event_type: input.eventType,
    occurred_at: occurredAt,
    local_date: localDate,
    time_zone: timeZone,
  });

  if (error) {
    if (error.code === "23505") {
      // Same logical event retried: already recorded, not a new failure.
      return { ok: true };
    }

    // Never surface the raw Postgres/PostgREST error (which would also
    // reveal RLS-rejection detail for an anchor the caller doesn't own).
    return { ok: false, error: "DATABASE_ERROR", message: DATABASE_ERROR_MESSAGE };
  }

  return { ok: true };
}
