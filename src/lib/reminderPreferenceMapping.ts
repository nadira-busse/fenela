// Mapping and validation for the canonical `reminder_preferences` table
// (Phase 4D, ADR-004) — the single source of truth for an authenticated
// user's reminder enabled/start_time choice, replacing the two previously
// independent local sources (screening's onboarding value and Coaching's
// settings value). Framework-free and pure so it can be unit-tested
// without a Supabase boundary, matching src/lib/userPreferenceMapping.ts's
// precedent.

const START_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ValidationResult = { ok: true } | { ok: false; message: string };

export function isValidStartTime(value: unknown): value is string {
  return typeof value === "string" && START_TIME_PATTERN.test(value);
}

export type SaveReminderPreferenceInput = {
  enabled: boolean;
  startTime: string;
};

// Server-boundary validation (AGENTS.md §12): runs regardless of what the
// caller's TypeScript types claim, since the Server Action calling this is
// reachable as a plain POST endpoint.
export function validateSaveReminderPreferenceInput(
  input: SaveReminderPreferenceInput
): ValidationResult {
  if (typeof input.enabled !== "boolean") {
    return { ok: false, message: "Invalid reminder enabled value." };
  }

  if (!isValidStartTime(input.startTime)) {
    return { ok: false, message: "Invalid start time. Expected 'HH:MM' (e.g. '08:00')." };
  }

  return { ok: true };
}

// Postgres `time` columns round-trip through PostgREST as "HH:MM:SS"
// (reminder_preferences.start_time is `time` in
// supabase/migrations/20260809120000_mvp2_persistence_foundation.sql) —
// normalized back to the "HH:MM" shape the app uses everywhere else
// (the <input type="time"> control, screeningStorage.ts's
// ScreeningV1.startTime). Falls back to the schema's own default for a
// value that doesn't match, rather than propagating a malformed time.
export function mapDbStartTimeToAppFormat(value: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value);
  return match ? `${match[1]}:${match[2]}` : "08:00";
}
