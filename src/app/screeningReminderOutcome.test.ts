import { describe, expect, it } from "vitest";
import { resolveScreeningReminderOutcome } from "./screeningReminderOutcome";

describe("resolveScreeningReminderOutcome", () => {
  it("screening Yes with a successful save reports enabled: true (the reported defect's happy path)", () => {
    expect(
      resolveScreeningReminderOutcome({
        reminderPreferenceSaved: true,
        dailyReminder: "YES",
        startTime: "07:30",
      })
    ).toEqual({ enabled: true, startTime: "07:30" });
  });

  it("screening No with a successful save reports enabled: false", () => {
    expect(
      resolveScreeningReminderOutcome({
        reminderPreferenceSaved: true,
        dailyReminder: "NOT_NOW",
        startTime: "08:00",
      })
    ).toEqual({ enabled: false, startTime: "08:00" });
  });

  it("never reports enabled: true when the underlying save itself failed, even if the user chose Yes", () => {
    expect(
      resolveScreeningReminderOutcome({
        reminderPreferenceSaved: false,
        dailyReminder: "YES",
        startTime: "07:30",
      })
    ).toEqual({ enabled: false, startTime: "07:30" });
  });

  it("a failed save with No is still just disabled", () => {
    expect(
      resolveScreeningReminderOutcome({
        reminderPreferenceSaved: false,
        dailyReminder: "NOT_NOW",
        startTime: "08:00",
      })
    ).toEqual({ enabled: false, startTime: "08:00" });
  });
});
