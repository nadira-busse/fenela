// src/lib/timezone.ts

export const REMINDER_TIME_ZONE = "Europe/Amsterdam";

export function parseHHMM(hhmm: string): { h: number; m: number } | null {
  if (!hhmm || typeof hhmm !== "string") return null;

  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);

  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;

  return { h, m };
}

// General IANA-timezone-aware wall-clock <-> UTC helpers (Phase 4D §8):
// getAmsterdamParts/amsterdamWallTimeToUtcMs/nextAmsterdamOccurrenceMs below
// are unchanged, Amsterdam-specific wrappers around these — kept for the
// existing unauthenticated/legacy call sites, so generalizing this module
// for authenticated per-user scheduling (which must use the user's own
// canonical user_preferences.time_zone, not a hardcoded zone) does not
// change their behavior. Still DST-safe: the offset is derived by asking
// the runtime's own IANA database what wall-clock time a UTC guess
// produces in the target zone, not a hardcoded UTC offset.
export function getZonedParts(timestampMs: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date(timestampMs));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

export function zonedWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): number {
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const actualParts = getZonedParts(guessUtcMs, timeZone);

  const actualAsIfUtcMs = Date.UTC(
    actualParts.year,
    actualParts.month - 1,
    actualParts.day,
    actualParts.hour,
    actualParts.minute,
    actualParts.second,
    0
  );

  const desiredAsIfUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offsetMs = actualAsIfUtcMs - guessUtcMs;

  return desiredAsIfUtcMs - offsetMs;
}

export function nextZonedOccurrenceMs(
  startTimeHHMM: string,
  nowMs: number,
  timeZone: string
): number {
  const parsed = parseHHMM(startTimeHHMM);

  if (!parsed) {
    return nowMs + 24 * 60 * 60 * 1000;
  }

  const nowZoned = getZonedParts(nowMs, timeZone);

  let dueAt = zonedWallTimeToUtcMs(
    nowZoned.year,
    nowZoned.month,
    nowZoned.day,
    parsed.h,
    parsed.m,
    timeZone
  );

  if (dueAt <= nowMs) {
    const tomorrowFromNoon =
      zonedWallTimeToUtcMs(nowZoned.year, nowZoned.month, nowZoned.day, 12, 0, timeZone) +
      24 * 60 * 60 * 1000;

    const tomorrowZoned = getZonedParts(tomorrowFromNoon, timeZone);

    dueAt = zonedWallTimeToUtcMs(
      tomorrowZoned.year,
      tomorrowZoned.month,
      tomorrowZoned.day,
      parsed.h,
      parsed.m,
      timeZone
    );
  }

  return dueAt;
}

export function getAmsterdamParts(timestampMs: number) {
  return getZonedParts(timestampMs, REMINDER_TIME_ZONE);
}

export function amsterdamWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): number {
  return zonedWallTimeToUtcMs(year, month, day, hour, minute, REMINDER_TIME_ZONE);
}

export function nextAmsterdamOccurrenceMs(startTimeHHMM: string, nowMs: number): number {
  return nextZonedOccurrenceMs(startTimeHHMM, nowMs, REMINDER_TIME_ZONE);
}
