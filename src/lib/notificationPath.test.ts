import { describe, expect, it } from "vitest";
import { safeNotificationPath } from "./notificationPath";

describe("safeNotificationPath", () => {
  it("preserves a valid relative same-origin path", () => {
    expect(safeNotificationPath("/reflections")).toBe("/reflections");
  });

  it("preserves the root path", () => {
    expect(safeNotificationPath("/")).toBe("/");
  });

  it("falls back to / when the value is missing", () => {
    expect(safeNotificationPath(undefined)).toBe("/");
    expect(safeNotificationPath(null)).toBe("/");
    expect(safeNotificationPath("")).toBe("/");
  });

  it("falls back to / for an absolute external URL", () => {
    expect(safeNotificationPath("https://evil.example/phish")).toBe("/");
  });

  it("falls back to / for a protocol-relative URL (//host/path)", () => {
    expect(safeNotificationPath("//evil.example/phish")).toBe("/");
  });

  it("falls back to / for a backslash trick some browsers normalize to protocol-relative", () => {
    expect(safeNotificationPath("/\\evil.example")).toBe("/");
  });

  it("falls back to / for a non-string value", () => {
    expect(safeNotificationPath(123)).toBe("/");
    expect(safeNotificationPath({})).toBe("/");
  });

  it("falls back to / for a path missing the leading slash", () => {
    expect(safeNotificationPath("reflections")).toBe("/");
  });
});
