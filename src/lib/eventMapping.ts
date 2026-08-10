// Validation for the ActionEvent/FrictionEvent write boundary (Phase 4C).
// Mirrors src/lib/goalMapping.ts's server-boundary validation pattern:
// runs regardless of what the caller's TypeScript types claim, since the
// Server Actions calling this are reachable as plain POST endpoints. The
// DB (CHECK constraints, the client_event_id UNIQUE constraint, and RLS)
// validates again independently — this is the app-level check that
// produces a fast, controlled failure before ever calling Supabase.

export const ACTION_EVENT_TYPES = ["STARTED", "COMPLETED", "POSTPONED", "PARKED_TODAY"] as const;
export type ActionEventType = (typeof ACTION_EVENT_TYPES)[number];

const MAX_FRICTION_REASON_LENGTH = 500;

// anchor_id is a Postgres uuid column; client_event_id is plain text at
// the DB level (supabase/migrations/20260809120000_mvp2_persistence_foundation.sql),
// but this app-level check requires UUID shape for both, per the product
// decision to always generate client_event_id as a UUID at the client
// interaction boundary rather than accepting arbitrary text.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ValidationResult = { ok: true } | { ok: false; message: string };

export function isActionEventType(value: unknown): value is ActionEventType {
  return typeof value === "string" && (ACTION_EVENT_TYPES as readonly string[]).includes(value);
}

// Exported so src/lib/storage.ts can reuse the exact same "is this a
// persisted database id, not a legacy/synthetic local one" check (Phase 4C
// hardening, Defect A) instead of a second, parallel UUID validator.
export function isUuidShaped(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export type CreateActionEventInput = {
  anchorId: string;
  eventType: ActionEventType;
  clientEventId: string;
};

export function validateCreateActionEventInput(input: CreateActionEventInput): ValidationResult {
  if (!isUuidShaped(input.anchorId)) {
    return { ok: false, message: "Invalid anchor reference." };
  }

  if (!isActionEventType(input.eventType)) {
    return { ok: false, message: "Invalid action type." };
  }

  if (!isUuidShaped(input.clientEventId)) {
    return { ok: false, message: "Invalid event identifier." };
  }

  return { ok: true };
}

export type CreateFrictionEventInput = {
  anchorId: string;
  clientEventId: string;
  reason: string;
};

export function validateCreateFrictionEventInput(
  input: CreateFrictionEventInput
): ValidationResult {
  if (!isUuidShaped(input.anchorId)) {
    return { ok: false, message: "Invalid anchor reference." };
  }

  if (!isUuidShaped(input.clientEventId)) {
    return { ok: false, message: "Invalid event identifier." };
  }

  // Whitespace-only input must not create a FrictionEvent (ADR-005) — the
  // trimmed emptiness check is the deliberate gate, not a stricter content
  // filter.
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";

  if (!reason || reason.length > MAX_FRICTION_REASON_LENGTH) {
    return { ok: false, message: "Please share a short, honest sentence." };
  }

  return { ok: true };
}
