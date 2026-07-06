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

export function getAmsterdamParts(timestampMs: number) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: REMINDER_TIME_ZONE,
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

export function amsterdamWallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): number {
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const actualParts = getAmsterdamParts(guessUtcMs);

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

export function nextAmsterdamOccurrenceMs(startTimeHHMM: string, nowMs: number): number {
  const parsed = parseHHMM(startTimeHHMM);

  if (!parsed) {
    return nowMs + 24 * 60 * 60 * 1000;
  }

  const nowAmsterdam = getAmsterdamParts(nowMs);

  let dueAt = amsterdamWallTimeToUtcMs(
    nowAmsterdam.year,
    nowAmsterdam.month,
    nowAmsterdam.day,
    parsed.h,
    parsed.m
  );

  if (dueAt <= nowMs) {
    const tomorrowFromAmsterdamNoon =
      amsterdamWallTimeToUtcMs(nowAmsterdam.year, nowAmsterdam.month, nowAmsterdam.day, 12, 0) +
      24 * 60 * 60 * 1000;

    const tomorrowAmsterdam = getAmsterdamParts(tomorrowFromAmsterdamNoon);

    dueAt = amsterdamWallTimeToUtcMs(
      tomorrowAmsterdam.year,
      tomorrowAmsterdam.month,
      tomorrowAmsterdam.day,
      parsed.h,
      parsed.m
    );
  }

  return dueAt;
}
