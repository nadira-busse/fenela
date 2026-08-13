import { describe, expect, it } from "vitest";
import { resolveReminderPreference } from "./reminderPreferenceOverride";

describe("resolveReminderPreference", () => {
  it("defers to the server value when no override has been set", () => {
    const serverValue = { enabled: false, startTime: "08:00" };

    expect(resolveReminderPreference(undefined, serverValue)).toBe(serverValue);
  });

  it("defers to the server value (null) when no override has been set and no row exists yet", () => {
    expect(resolveReminderPreference(undefined, null)).toBeNull();
  });

  it("prefers a just-persisted override over a stale server value (the reported defect)", () => {
    const staleServerValue = { enabled: false, startTime: "08:00" };
    const justPersisted = { enabled: true, startTime: "07:30" };

    expect(resolveReminderPreference(justPersisted, staleServerValue)).toBe(justPersisted);
  });

  it("treats an explicit null override as authoritative, not as 'no override'", () => {
    const serverValue = { enabled: true, startTime: "08:00" };

    expect(resolveReminderPreference(null, serverValue)).toBeNull();
  });
});
