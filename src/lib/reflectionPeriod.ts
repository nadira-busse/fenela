// Deterministic WEEKLY/MONTHLY reflection period calculation (Phase 4E
// §5/§7, ADR-005). Pure and framework-free so it is directly unit-testable
// without a Supabase boundary — the exact same pipeline serves both
// reflection types (§20), parameterized by `type`.
//
// The only timezone-sensitive step is establishing which local calendar
// date `referenceInstant` falls on, in the caller's canonical
// user_preferences.time_zone (never UTC, never a hardcoded zone — Phase
// 4E §6). Reuses src/lib/timezone.ts's getZonedParts for that one step.
// Everything after that is pure Gregorian calendar arithmetic on a
// UTC-anchored placeholder Date used only as a date-math scratchpad — not
// re-interpreted through any timezone again — so it is inherently immune
// to DST (a week/month boundary is a calendar concept, not an instant).

import { getZonedParts } from "@/lib/timezone";

export type ReflectionType = "WEEKLY" | "MONTHLY";

export type ReflectionPeriod = {
  type: ReflectionType;
  // Local calendar dates, "YYYY-MM-DD" — matches the `date` columns on
  // public.reflections (period_start/period_end).
  start: string;
  end: string;
  timeZone: string;
};

export type GetReflectionPeriodInput = {
  type: ReflectionType;
  referenceInstant: Date;
  timeZone: string;
};

function toCalendarAnchor(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function formatCalendarDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(anchor: Date): Date {
  // getUTCDay(): 0=Sunday .. 6=Saturday. Weeks start Monday (§5).
  const dayOfWeek = anchor.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;

  const start = new Date(anchor);
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

export function getReflectionPeriod(input: GetReflectionPeriodInput): ReflectionPeriod {
  const { year, month, day } = getZonedParts(input.referenceInstant.getTime(), input.timeZone);
  const localAnchor = toCalendarAnchor(year, month, day);

  if (input.type === "WEEKLY") {
    const start = startOfWeek(localAnchor);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);

    return {
      type: "WEEKLY",
      start: formatCalendarDate(start),
      end: formatCalendarDate(end),
      timeZone: input.timeZone,
    };
  }

  // MONTHLY: first calendar day through the last calendar day of the same
  // local month. `Date.UTC(year, month, 0)` is the last day of `month`
  // (1-indexed here) because day 0 rolls back one day from day 1 of the
  // following month — ordinary calendar-month semantics, not "last 30 days".
  const start = toCalendarAnchor(year, month, 1);
  const end = new Date(Date.UTC(year, month, 0));

  return {
    type: "MONTHLY",
    start: formatCalendarDate(start),
    end: formatCalendarDate(end),
    timeZone: input.timeZone,
  };
}
