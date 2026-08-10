import { describe, expect, it } from "vitest";
import { deriveEventTimeMetadata } from "./eventTime";

describe("deriveEventTimeMetadata", () => {
  it("derives a UTC local date for a UTC instant", () => {
    const result = deriveEventTimeMetadata(new Date("2026-03-15T12:00:00.000Z"), "UTC");

    expect(result.localDate).toBe("2026-03-15");
    expect(result.timeZone).toBe("UTC");
    expect(result.occurredAt).toBe("2026-03-15T12:00:00.000Z");
  });

  it("derives a local date one calendar day earlier than UTC near a west-of-UTC boundary", () => {
    // 2026-01-01T03:00:00Z is already Jan 1st in UTC/Amsterdam, but still
    // Dec 31st in Los Angeles (UTC-8 in January) — this instant only
    // proves timezone handling if the two zones disagree on the date.
    const instant = new Date("2026-01-01T03:00:00.000Z");

    const utc = deriveEventTimeMetadata(instant, "UTC");
    const losAngeles = deriveEventTimeMetadata(instant, "America/Los_Angeles");

    expect(utc.localDate).toBe("2026-01-01");
    expect(losAngeles.localDate).toBe("2025-12-31");
    expect(losAngeles.timeZone).toBe("America/Los_Angeles");
    expect(losAngeles.occurredAt).toBe(instant.toISOString());
  });

  it("derives a local date one calendar day later than UTC near an east-of-UTC boundary", () => {
    // 2026-06-30T23:00:00Z is still June 30th in UTC, but already July 1st
    // in Amsterdam (UTC+2 in June, DST).
    const instant = new Date("2026-06-30T23:00:00.000Z");

    const utc = deriveEventTimeMetadata(instant, "UTC");
    const amsterdam = deriveEventTimeMetadata(instant, "Europe/Amsterdam");

    expect(utc.localDate).toBe("2026-06-30");
    expect(amsterdam.localDate).toBe("2026-07-01");
  });

  it("throws for an invalid IANA timezone instead of silently guessing", () => {
    expect(() => deriveEventTimeMetadata(new Date(), "Not/AZone")).toThrow();
  });
});
