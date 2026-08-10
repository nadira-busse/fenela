import { describe, expect, it } from "vitest";
import { getReflectionPeriod } from "./reflectionPeriod";

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
