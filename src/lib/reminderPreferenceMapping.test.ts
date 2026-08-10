import { describe, expect, it } from "vitest";
import {
  isValidStartTime,
  validateSaveReminderPreferenceInput,
  mapDbStartTimeToAppFormat,
} from "./reminderPreferenceMapping";

describe("isValidStartTime", () => {
  it("accepts a well-formed HH:MM value", () => {
    expect(isValidStartTime("08:00")).toBe(true);
    expect(isValidStartTime("23:59")).toBe(true);
    expect(isValidStartTime("00:00")).toBe(true);
  });

  it("rejects malformed or out-of-range values", () => {
    expect(isValidStartTime("24:00")).toBe(false);
    expect(isValidStartTime("8:00")).toBe(false);
    expect(isValidStartTime("08:60")).toBe(false);
    expect(isValidStartTime("not-a-time")).toBe(false);
    expect(isValidStartTime(123)).toBe(false);
  });
});

describe("validateSaveReminderPreferenceInput", () => {
  it("accepts a well-formed input", () => {
    expect(validateSaveReminderPreferenceInput({ enabled: true, startTime: "08:00" })).toEqual({
      ok: true,
    });
  });

  it("rejects a non-boolean enabled value", () => {
    const result = validateSaveReminderPreferenceInput({
      // @ts-expect-error deliberately invalid for the test
      enabled: "true",
      startTime: "08:00",
    });

    expect(result.ok).toBe(false);
  });

  it("rejects an invalid start time", () => {
    const result = validateSaveReminderPreferenceInput({ enabled: true, startTime: "8am" });

    expect(result.ok).toBe(false);
  });
});

describe("mapDbStartTimeToAppFormat", () => {
  it("truncates a Postgres time value (HH:MM:SS) to the app's HH:MM format", () => {
    expect(mapDbStartTimeToAppFormat("08:00:00")).toBe("08:00");
    expect(mapDbStartTimeToAppFormat("23:59:59")).toBe("23:59");
  });

  it("falls back to the schema default for a malformed value", () => {
    expect(mapDbStartTimeToAppFormat("not-a-time")).toBe("08:00");
  });
});
