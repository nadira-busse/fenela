import { describe, expect, it } from "vitest";
import { ACCOUNT_INACTIVITY_RETENTION_MONTHS, isInactiveAccountExpired } from "./retentionPolicy";

describe("ACCOUNT_INACTIVITY_RETENTION_MONTHS", () => {
  it("is the agreed 12-month product policy", () => {
    expect(ACCOUNT_INACTIVITY_RETENTION_MONTHS).toBe(12);
  });
});

describe("isInactiveAccountExpired", () => {
  const referenceInstant = new Date("2026-08-11T00:00:00.000Z");
  // referenceInstant minus exactly 12 UTC calendar months.
  const threshold = "2025-08-11T00:00:00.000Z";
  const oldTimestamp = "2024-01-01T00:00:00.000Z";
  const recentTimestamp = "2026-08-01T00:00:00.000Z";

  it("is NOT expired at 11 months 30 days since login (one day short of the threshold)", () => {
    expect(isInactiveAccountExpired("2025-08-12T00:00:00.000Z", undefined, referenceInstant)).toBe(
      false
    );
  });

  it("is expired exactly at the 12-month threshold (inclusive boundary)", () => {
    expect(isInactiveAccountExpired(threshold, undefined, referenceInstant)).toBe(true);
  });

  it("is expired more than 12 months since login", () => {
    expect(isInactiveAccountExpired("2025-08-10T00:00:00.000Z", undefined, referenceInstant)).toBe(
      true
    );
  });

  it("is NOT expired for a recent login (the reference instant itself)", () => {
    expect(
      isInactiveAccountExpired(referenceInstant.toISOString(), undefined, referenceInstant)
    ).toBe(false);
  });

  describe("dual activity source (last_sign_in_at vs. user_preferences.last_active_at)", () => {
    it("old last_sign_in_at + recent last_active_at -> NOT expired (recent activity always protects)", () => {
      expect(isInactiveAccountExpired(oldTimestamp, recentTimestamp, referenceInstant)).toBe(false);
    });

    it("recent last_sign_in_at + no preference row -> NOT expired", () => {
      expect(isInactiveAccountExpired(recentTimestamp, undefined, referenceInstant)).toBe(false);
    });

    it("recent last_sign_in_at + old last_active_at -> NOT expired (the more recent signal wins)", () => {
      expect(isInactiveAccountExpired(recentTimestamp, oldTimestamp, referenceInstant)).toBe(false);
    });

    it("old last_sign_in_at + old last_active_at -> expired", () => {
      expect(isInactiveAccountExpired(oldTimestamp, oldTimestamp, referenceInstant)).toBe(true);
    });

    it("a user with no preference row (null) falls back to a valid last_sign_in_at", () => {
      expect(isInactiveAccountExpired(oldTimestamp, null, referenceInstant)).toBe(true);
      expect(isInactiveAccountExpired(recentTimestamp, null, referenceInstant)).toBe(false);
    });

    it("no device timestamp participates — only the two named sources are ever consulted", () => {
      // Documented by construction: isInactiveAccountExpired has no third
      // "device" parameter at all. This test exists to make that contract
      // explicit and regress loudly if a future change adds one.
      expect(isInactiveAccountExpired.length).toBe(3);
    });
  });

  describe("leap-year February 29th boundary (explicit day clamping, not month rollover)", () => {
    const leapReferenceInstant = new Date("2028-02-29T12:34:56.000Z");
    // Clamped to the last valid day of February 2027 (not a leap year),
    // NOT rolled forward into March.
    const leapThreshold = "2027-02-28T12:34:56.000Z";

    it("subtracts 12 months from a leap day by clamping to Feb 28, not rolling into March", () => {
      expect(isInactiveAccountExpired(leapThreshold, undefined, leapReferenceInstant)).toBe(true);
    });

    it("treats a login one moment before the clamped threshold as expired", () => {
      expect(
        isInactiveAccountExpired("2027-02-28T12:34:55.999Z", undefined, leapReferenceInstant)
      ).toBe(true);
    });

    it("treats a login one moment after the clamped threshold as NOT expired", () => {
      expect(
        isInactiveAccountExpired("2027-02-28T12:34:56.001Z", undefined, leapReferenceInstant)
      ).toBe(false);
    });

    it("never lands on March 1st for this case", () => {
      expect(
        isInactiveAccountExpired("2027-03-01T00:00:00.000Z", undefined, leapReferenceInstant)
      ).toBe(false);
    });
  });

  describe("missing/malformed timestamp semantics", () => {
    it("treats both sources missing as NOT expired — fail closed, never delete on ambiguity", () => {
      expect(isInactiveAccountExpired(undefined, undefined, referenceInstant)).toBe(false);
      expect(isInactiveAccountExpired(null, null, referenceInstant)).toBe(false);
    });

    it("treats an unparseable last_sign_in_at as NOT expired when last_active_at is also absent", () => {
      expect(isInactiveAccountExpired("not-a-date", undefined, referenceInstant)).toBe(false);
    });

    it("a malformed last_sign_in_at does not suppress a valid, old last_active_at", () => {
      expect(isInactiveAccountExpired("not-a-date", oldTimestamp, referenceInstant)).toBe(true);
    });

    it("a malformed last_active_at does not suppress a valid, old last_sign_in_at", () => {
      expect(isInactiveAccountExpired(oldTimestamp, "not-a-date", referenceInstant)).toBe(true);
    });

    it("treats empty strings the same as missing", () => {
      expect(isInactiveAccountExpired("", "", referenceInstant)).toBe(false);
    });
  });
});
