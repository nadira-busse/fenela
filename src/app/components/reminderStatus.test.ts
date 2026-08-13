import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Proves the intent (enabled) vs capability/permission distinction
// getInitialReminderStatus already encodes, now that HomeClient/Coaching
// actually feeds it a live `enabled` value instead of a stale one
// (Phase 4I). Only getNotificationPermission is mocked — the function under
// test is otherwise exercised directly.
const { getNotificationPermission } = vi.hoisted(() => ({
  getNotificationPermission: vi.fn(),
}));

vi.mock("@/lib/pushClient", () => ({
  getNotificationPermission,
  enablePushForCurrentDevice: vi.fn(),
}));

const { getInitialReminderStatus } = await import("./CoachingScreen");

describe("getInitialReminderStatus", () => {
  beforeEach(() => {
    getNotificationPermission.mockReset();
    // getInitialReminderStatus guards on `typeof window === "undefined"` for
    // SSR-safety; this repo's Vitest setup runs in plain Node (no jsdom), so
    // a minimal global stub is needed to exercise the branches below it —
    // same approach as src/app/authenticatedLocalSync.test.ts.
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports unsupported when the device/browser has no notification capability at all, regardless of intent", () => {
    getNotificationPermission.mockReturnValue("unsupported");

    expect(getInitialReminderStatus(true)).toBe("unsupported");
  });

  it("reports blocked when permission was denied, regardless of intent", () => {
    getNotificationPermission.mockReturnValue("denied");

    expect(getInitialReminderStatus(true)).toBe("blocked");
  });

  it("reports on only when intent is true AND permission is granted (the reported defect's fix point)", () => {
    getNotificationPermission.mockReturnValue("granted");

    expect(getInitialReminderStatus(true)).toBe("on");
  });

  it("reports off when permission is granted but intent is false", () => {
    getNotificationPermission.mockReturnValue("granted");

    expect(getInitialReminderStatus(false)).toBe("off");
  });

  it("reports off (not on) when intent is true but permission has not been granted yet (default state)", () => {
    getNotificationPermission.mockReturnValue("default");

    expect(getInitialReminderStatus(true)).toBe("off");
  });
});
