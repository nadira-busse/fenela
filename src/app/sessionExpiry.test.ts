import { describe, expect, it } from "vitest";
import { isSessionExpiredEvent } from "./sessionExpiry";
import type { AuthChangeEvent } from "@supabase/supabase-js";

describe("isSessionExpiredEvent", () => {
  it("treats SIGNED_OUT as a session expiry — fired when a refresh against a revoked/expired session fails", () => {
    expect(isSessionExpiredEvent("SIGNED_OUT")).toBe(true);
  });

  const stillAuthenticatedEvents: AuthChangeEvent[] = [
    "INITIAL_SESSION",
    "SIGNED_IN",
    "TOKEN_REFRESHED",
    "USER_UPDATED",
    "PASSWORD_RECOVERY",
    "MFA_CHALLENGE_VERIFIED",
  ];

  it.each(stillAuthenticatedEvents)("does not treat %s as a session expiry", (event) => {
    expect(isSessionExpiredEvent(event)).toBe(false);
  });
});
