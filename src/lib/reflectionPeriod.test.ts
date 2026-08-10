import { describe, expect, it } from "vitest";
import { getReflectionPeriod, getPreviousCompletedWeeklyPeriod } from "./reflectionPeriod";

const AMSTERDAM = "Europe/Amsterdam";

describe("getReflectionPeriod — WEEKLY", () => {
  it("a Monday reference resolves to that same Monday..Sunday", () => {
    // 2026-03-16 is a Monday.
    const result = getReflectionPeriod({
      type: "WEEKLY",
      referenceInstant: new Date("2026-03-16T10:00:00.000Z"),
      timeZone: AMSTERDAM,
    });

    expect(result).toEqual({
      type: "WEEKLY",
      start: "2026-03-16",
      end: "2026-03-22",
      timeZone: AMSTERDAM,
    });
  });

  it("a Sunday reference resolves back to the Monday that started that same week", () => {
    // 2026-03-22 is a Sunday, the last day of the week starting 2026-03-16.
    const result = getReflectionPeriod({
      type: "WEEKLY",
      referenceInstant: new Date("2026-03-22T10:00:00.000Z"),
      timeZone: AMSTERDAM,
    });

    expect(result).toEqual({
      type: "WEEKLY",
      start: "2026-03-16",
      end: "2026-03-22",
      timeZone: AMSTERDAM,
    });
  });

  it("a week crossing a month boundary spans both months correctly", () => {
    // 2026-03-30 is a Monday; the week ends 2026-04-05.
    const result = getReflectionPeriod({
      type: "WEEKLY",
      referenceInstant: new Date("2026-04-01T10:00:00.000Z"),
      timeZone: AMSTERDAM,
    });

    expect(result).toEqual({
      type: "WEEKLY",
      start: "2026-03-30",
      end: "2026-04-05",
      timeZone: AMSTERDAM,
    });
  });

  it("resolves the correct local week across the Europe/Amsterdam DST transition", () => {
    // 2026-03-29 is EU spring-forward day, inside the week 2026-03-23..03-29.
    // 23:30 UTC on 2026-03-29 is already 01:30 CEST on 2026-03-30 in
    // Amsterdam — a UTC-only calculation would misclassify this instant's
    // week.
    const result = getReflectionPeriod({
      type: "WEEKLY",
      referenceInstant: new Date("2026-03-29T23:30:00.000Z"),
      timeZone: AMSTERDAM,
    });

    expect(result).toEqual({
      type: "WEEKLY",
      start: "2026-03-30",
      end: "2026-04-05",
      timeZone: AMSTERDAM,
    });
  });

  it("resolves correctly in a non-Amsterdam IANA zone (America/Los_Angeles)", () => {
    // 2026-03-16T05:00:00Z is still 2026-03-15 21:00 in Los Angeles
    // (UTC-8 in March, before US DST starts) — a different local calendar
    // date than in Amsterdam for the same instant.
    const result = getReflectionPeriod({
      type: "WEEKLY",
      referenceInstant: new Date("2026-03-16T05:00:00.000Z"),
      timeZone: "America/Los_Angeles",
    });

    expect(result).toEqual({
      type: "WEEKLY",
      start: "2026-03-09",
      end: "2026-03-15",
      timeZone: "America/Los_Angeles",
    });
  });

  it("always resolves to a Monday start and Sunday end", () => {
    for (const iso of [
      "2026-01-01T12:00:00.000Z",
      "2026-06-15T12:00:00.000Z",
      "2026-12-31T12:00:00.000Z",
    ]) {
      const result = getReflectionPeriod({
        type: "WEEKLY",
        referenceInstant: new Date(iso),
        timeZone: AMSTERDAM,
      });

      const startWeekday = new Date(`${result.start}T00:00:00.000Z`).getUTCDay();
      const endWeekday = new Date(`${result.end}T00:00:00.000Z`).getUTCDay();

      expect(startWeekday).toBe(1); // Monday
      expect(endWeekday).toBe(0); // Sunday
    }
  });
});

describe("getReflectionPeriod — MONTHLY", () => {
  it("resolves a 28-day February correctly", () => {
    const result = getReflectionPeriod({
      type: "MONTHLY",
      referenceInstant: new Date("2026-02-14T12:00:00.000Z"),
      timeZone: AMSTERDAM,
    });

    expect(result).toEqual({
      type: "MONTHLY",
      start: "2026-02-01",
      end: "2026-02-28",
      timeZone: AMSTERDAM,
    });
  });

  it("resolves a leap-year 29-day February correctly", () => {
    const result = getReflectionPeriod({
      type: "MONTHLY",
      referenceInstant: new Date("2028-02-14T12:00:00.000Z"),
      timeZone: AMSTERDAM,
    });

    expect(result).toEqual({
      type: "MONTHLY",
      start: "2028-02-01",
      end: "2028-02-29",
      timeZone: AMSTERDAM,
    });
  });

  it("resolves a 30-day month correctly", () => {
    const result = getReflectionPeriod({
      type: "MONTHLY",
      referenceInstant: new Date("2026-04-14T12:00:00.000Z"),
      timeZone: AMSTERDAM,
    });

    expect(result).toEqual({
      type: "MONTHLY",
      start: "2026-04-01",
      end: "2026-04-30",
      timeZone: AMSTERDAM,
    });
  });

  it("resolves a 31-day month correctly", () => {
    const result = getReflectionPeriod({
      type: "MONTHLY",
      referenceInstant: new Date("2026-01-14T12:00:00.000Z"),
      timeZone: AMSTERDAM,
    });

    expect(result).toEqual({
      type: "MONTHLY",
      start: "2026-01-01",
      end: "2026-01-31",
      timeZone: AMSTERDAM,
    });
  });

  it("resolves the correct local month across a DST-transition month (Europe/Amsterdam, March)", () => {
    // Near midnight on the last day of March, in UTC, to prove the local
    // date (not the UTC date) determines month membership.
    const result = getReflectionPeriod({
      type: "MONTHLY",
      referenceInstant: new Date("2026-03-31T23:30:00.000Z"), // already 2026-04-01 CEST locally
      timeZone: AMSTERDAM,
    });

    expect(result).toEqual({
      type: "MONTHLY",
      start: "2026-04-01",
      end: "2026-04-30",
      timeZone: AMSTERDAM,
    });
  });

  it("resolves correctly in a non-Amsterdam IANA zone (America/Los_Angeles)", () => {
    // 2026-03-01T05:00:00Z is still 2026-02-28 21:00 in Los Angeles.
    const result = getReflectionPeriod({
      type: "MONTHLY",
      referenceInstant: new Date("2026-03-01T05:00:00.000Z"),
      timeZone: "America/Los_Angeles",
    });

    expect(result).toEqual({
      type: "MONTHLY",
      start: "2026-02-01",
      end: "2026-02-28",
      timeZone: "America/Los_Angeles",
    });
  });
});

describe("getPreviousCompletedWeeklyPeriod", () => {
  it("a Monday reference resolves to the immediately preceding Monday..Sunday week", () => {
    // 2026-08-24 is a Monday.
    const result = getPreviousCompletedWeeklyPeriod({
      referenceInstant: new Date("2026-08-24T10:00:00.000Z"),
      timeZone: AMSTERDAM,
    });

    expect(result).toEqual({
      type: "WEEKLY",
      start: "2026-08-17",
      end: "2026-08-23",
      timeZone: AMSTERDAM,
    });
  });

  it("a Wednesday reference resolves to the same preceding week as the Monday in that week", () => {
    // 2026-08-26 is a Wednesday, inside the week starting 2026-08-24.
    const result = getPreviousCompletedWeeklyPeriod({
      referenceInstant: new Date("2026-08-26T10:00:00.000Z"),
      timeZone: AMSTERDAM,
    });

    expect(result).toEqual({
      type: "WEEKLY",
      start: "2026-08-17",
      end: "2026-08-23",
      timeZone: AMSTERDAM,
    });
  });

  it("a Sunday reference resolves to the same preceding week as the rest of its own current week", () => {
    // 2026-08-30 is a Sunday, the last day of the week starting 2026-08-24.
    const result = getPreviousCompletedWeeklyPeriod({
      referenceInstant: new Date("2026-08-30T10:00:00.000Z"),
      timeZone: AMSTERDAM,
    });

    expect(result).toEqual({
      type: "WEEKLY",
      start: "2026-08-17",
      end: "2026-08-23",
      timeZone: AMSTERDAM,
    });
  });

  it("the following Monday advances the eligible period by exactly one week", () => {
    // 2026-08-31 is a Monday, the week after the previous three cases.
    const result = getPreviousCompletedWeeklyPeriod({
      referenceInstant: new Date("2026-08-31T10:00:00.000Z"),
      timeZone: AMSTERDAM,
    });

    expect(result).toEqual({
      type: "WEEKLY",
      start: "2026-08-24",
      end: "2026-08-30",
      timeZone: AMSTERDAM,
    });
  });

  it("never resolves to the reference instant's own current week, even at the end of that week", () => {
    // 2026-08-30 (Sunday) — the current week is 2026-08-24..2026-08-30. The
    // eligible period must be the one immediately before it, never that
    // still-in-progress-until-midnight current week.
    const result = getPreviousCompletedWeeklyPeriod({
      referenceInstant: new Date("2026-08-30T10:00:00.000Z"),
      timeZone: AMSTERDAM,
    });

    expect(result.start).not.toBe("2026-08-24");
    expect(result.end).not.toBe("2026-08-30");
  });

  it("a preceding week crossing a month boundary spans both months correctly", () => {
    // Current week starting 2026-04-06 (Monday); the preceding week is
    // 2026-03-30..2026-04-05, crossing the March/April boundary.
    const result = getPreviousCompletedWeeklyPeriod({
      referenceInstant: new Date("2026-04-08T10:00:00.000Z"),
      timeZone: AMSTERDAM,
    });

    expect(result).toEqual({
      type: "WEEKLY",
      start: "2026-03-30",
      end: "2026-04-05",
      timeZone: AMSTERDAM,
    });
  });

  it("a preceding week crossing a year boundary spans both years correctly", () => {
    // 2026-01-05 is a Monday; the preceding week is 2025-12-29..2026-01-04.
    const result = getPreviousCompletedWeeklyPeriod({
      referenceInstant: new Date("2026-01-05T10:00:00.000Z"),
      timeZone: AMSTERDAM,
    });

    expect(result).toEqual({
      type: "WEEKLY",
      start: "2025-12-29",
      end: "2026-01-04",
      timeZone: AMSTERDAM,
    });
  });

  it("resolves the correct preceding local week across the Europe/Amsterdam DST transition", () => {
    // Same instant as the getReflectionPeriod DST test: 23:30 UTC on
    // 2026-03-29 is already 01:30 CEST on 2026-03-30 locally, so the
    // current week is 2026-03-30..2026-04-05 and the preceding, eligible
    // week is 2026-03-23..2026-03-29 — the week DST spring-forward fell
    // inside.
    const result = getPreviousCompletedWeeklyPeriod({
      referenceInstant: new Date("2026-03-29T23:30:00.000Z"),
      timeZone: AMSTERDAM,
    });

    expect(result).toEqual({
      type: "WEEKLY",
      start: "2026-03-23",
      end: "2026-03-29",
      timeZone: AMSTERDAM,
    });
  });

  it("resolves correctly in a non-Amsterdam IANA zone (America/Los_Angeles)", () => {
    // 2026-03-16T05:00:00Z is still 2026-03-15 21:00 in Los Angeles (a
    // Sunday), so the current week there is 2026-03-09..2026-03-15 and the
    // preceding, eligible week is 2026-03-02..2026-03-08.
    const result = getPreviousCompletedWeeklyPeriod({
      referenceInstant: new Date("2026-03-16T05:00:00.000Z"),
      timeZone: "America/Los_Angeles",
    });

    expect(result).toEqual({
      type: "WEEKLY",
      start: "2026-03-02",
      end: "2026-03-08",
      timeZone: "America/Los_Angeles",
    });
  });

  it("always resolves to a Monday start and Sunday end", () => {
    for (const iso of [
      "2026-01-01T12:00:00.000Z",
      "2026-06-15T12:00:00.000Z",
      "2026-12-31T12:00:00.000Z",
    ]) {
      const result = getPreviousCompletedWeeklyPeriod({
        referenceInstant: new Date(iso),
        timeZone: AMSTERDAM,
      });

      const startWeekday = new Date(`${result.start}T00:00:00.000Z`).getUTCDay();
      const endWeekday = new Date(`${result.end}T00:00:00.000Z`).getUTCDay();

      expect(startWeekday).toBe(1); // Monday
      expect(endWeekday).toBe(0); // Sunday
    }
  });
});
