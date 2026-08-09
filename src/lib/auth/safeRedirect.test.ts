import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safeRedirect";

describe("safeRedirectPath", () => {
  it("accepts a relative internal path", () => {
    expect(safeRedirectPath("/settings")).toBe("/settings");
    expect(safeRedirectPath("/settings?tab=reminders")).toBe("/settings?tab=reminders");
  });

  it("rejects an external absolute URL", () => {
    expect(safeRedirectPath("https://attacker.example")).toBe("/");
    expect(safeRedirectPath("http://attacker.example/path")).toBe("/");
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeRedirectPath("//attacker.example")).toBe("/");
  });

  it("rejects a backslash trick that browsers may normalize to protocol-relative", () => {
    expect(safeRedirectPath("/\\attacker.example")).toBe("/");
  });

  it("rejects a value containing a scheme separator", () => {
    expect(safeRedirectPath("/redirect?url=https://attacker.example")).toBe("/");
  });

  it("falls back safely for an invalid or missing value", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
    expect(safeRedirectPath("not-a-path")).toBe("/");
  });

  it("honors a custom fallback", () => {
    expect(safeRedirectPath("https://attacker.example", "/auth")).toBe("/auth");
  });
});
