import { describe, expect, it } from "vitest";
import {
  nextZonedOccurrenceMs,
  nextAmsterdamOccurrenceMs,
  zonedWallTimeToUtcMs,
  amsterdamWallTimeToUtcMs,
  REMINDER_TIME_ZONE,
} from "./timezone";

describe("nextZonedOccurrenceMs (Phase 4D §8 generalization)", () => {
  it("matches the Amsterdam-specific wrapper exactly when passed Europe/Amsterdam", () => {
    const now = Date.parse("2026-06-15T05:00:00.000Z");

    expect(nextZonedOccurrenceMs("08:00", now, REMINDER_TIME_ZONE)).toBe(
      nextAmsterdamOccurrenceMs("08:00", now)
    );
  });

  it("schedules the next occurrence in a different IANA zone, not Amsterdam's", () => {
    const now = Date.parse("2026-06-15T05:00:00.000Z"); // 07:00 Amsterdam (CEST, +2), 05:00 UTC

    const losAngelesDue = nextZonedOccurrenceMs("08:00", now, "America/Los_Angeles");
    const amsterdamDue = nextZonedOccurrenceMs("08:00", now, "Europe/Amsterdam");

    // 08:00 in Los Angeles (UTC-7 in June) is a different absolute instant
    // than 08:00 in Amsterdam (UTC+2 in June) for the same calendar day.
    expect(losAngelesDue).not.toBe(amsterdamDue);
  });

  it("remains correct across a DST transition (not a hardcoded UTC offset)", () => {
    // 2026-03-29 is the EU spring-forward date; scheduling for 08:00 the
    // day before and the day after must reflect the offset change (CET
    // UTC+1 -> CEST UTC+2), not a fixed offset baked into the calculation.
    const beforeDst = Date.parse("2026-03-28T06:00:00.000Z"); // 07:00 CET
    const afterDst = Date.parse("2026-03-30T06:00:00.000Z"); // 08:00 CEST

    const dueBefore = nextZonedOccurrenceMs("08:00", beforeDst, "Europe/Amsterdam");
    const dueAfter = nextZonedOccurrenceMs("08:00", afterDst, "Europe/Amsterdam");

    // Before DST: 08:00 CET = 07:00 UTC. After DST: next 08:00 CEST = 06:00 UTC (next day).
    expect(new Date(dueBefore).toISOString()).toBe("2026-03-28T07:00:00.000Z");
    expect(new Date(dueAfter).toISOString()).toBe("2026-03-31T06:00:00.000Z");
  });
});

describe("zonedWallTimeToUtcMs", () => {
  it("matches the Amsterdam-specific wrapper exactly when passed Europe/Amsterdam", () => {
    expect(zonedWallTimeToUtcMs(2026, 6, 15, 8, 0, REMINDER_TIME_ZONE)).toBe(
      amsterdamWallTimeToUtcMs(2026, 6, 15, 8, 0)
    );
  });
});
