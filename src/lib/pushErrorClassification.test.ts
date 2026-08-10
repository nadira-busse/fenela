import { describe, expect, it } from "vitest";
import { WebPushError } from "web-push";
import { classifyPushError } from "./pushErrorClassification";

function makeWebPushError(statusCode: number) {
  return new WebPushError(
    "push failed",
    statusCode,
    {} as never,
    "body",
    "https://push.example.com/x"
  );
}

describe("classifyPushError", () => {
  it("treats HTTP 404 as a terminal invalid subscription", () => {
    expect(classifyPushError(makeWebPushError(404))).toBe("TERMINAL_INVALID_SUBSCRIPTION");
  });

  it("treats HTTP 410 as a terminal invalid subscription", () => {
    expect(classifyPushError(makeWebPushError(410))).toBe("TERMINAL_INVALID_SUBSCRIPTION");
  });

  it("treats HTTP 429 (rate limited) as non-terminal", () => {
    expect(classifyPushError(makeWebPushError(429))).toBe("NON_TERMINAL");
  });

  it("treats HTTP 500 as non-terminal", () => {
    expect(classifyPushError(makeWebPushError(500))).toBe("NON_TERMINAL");
  });

  it("treats other 4xx statuses (e.g. 401 VAPID misconfiguration) as non-terminal, not terminal by default", () => {
    expect(classifyPushError(makeWebPushError(400))).toBe("NON_TERMINAL");
    expect(classifyPushError(makeWebPushError(401))).toBe("NON_TERMINAL");
    expect(classifyPushError(makeWebPushError(403))).toBe("NON_TERMINAL");
    expect(classifyPushError(makeWebPushError(413))).toBe("NON_TERMINAL");
  });

  it("treats a network/unknown error (not a WebPushError at all) as non-terminal", () => {
    expect(classifyPushError(new Error("fetch failed"))).toBe("NON_TERMINAL");
    expect(classifyPushError("some string")).toBe("NON_TERMINAL");
    expect(classifyPushError(undefined)).toBe("NON_TERMINAL");
  });
});
