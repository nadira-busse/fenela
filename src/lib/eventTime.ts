// Derives trustworthy time metadata for ActionEvent/FrictionEvent rows
// (Phase 4C §6). Framework-free and pure so the timezone-boundary behavior
// is unit-testable without a Supabase boundary. Mirrors src/lib/storage.ts's
// getTodayKey() en-CA formatting approach, generalized to an arbitrary
// IANA zone and instant instead of the hardcoded Amsterdam/"now" pair,
// since callers here must use the authenticated user's own persisted
// user_preferences.time_zone (validated at write time via
// src/lib/userPreferenceMapping.ts's isValidIanaTimeZone), not a
// hardcoded or caller-supplied zone.

export type EventTimeMetadata = {
  // The actual instant the event occurred, as an ISO-8601 string.
  occurredAt: string;
  // The calendar date the event is attributed to, derived using timeZone
  // at this instant — so a later timezone change does not retroactively
  // reclassify history (see the action_events.local_date column comment).
  localDate: string;
  // The timezone used to derive localDate, preserved alongside it.
  timeZone: string;
};

export function deriveEventTimeMetadata(occurredAt: Date, timeZone: string): EventTimeMetadata {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(occurredAt);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Could not derive a local date for timezone "${timeZone}"`);
  }

  return {
    occurredAt: occurredAt.toISOString(),
    localDate: `${year}-${month}-${day}`,
    timeZone,
  };
}
