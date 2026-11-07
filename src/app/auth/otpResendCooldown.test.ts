import { describe, expect, it } from "vitest";
import { OTP_RESEND_COOLDOWN_SECONDS, secondsUntilResendAllowed } from "./otpResendCooldown";

describe("secondsUntilResendAllowed", () => {
  it("allows an immediate resend when no code has been sent yet", () => {
    expect(secondsUntilResendAllowed(null, 0)).toBe(0);
  });

  it("blocks a resend right after sending", () => {
    const remaining = secondsUntilResendAllowed(1_000, 1_000, 60);

    expect(remaining).toBe(60);
  });

  it("counts down as time passes", () => {
    const remaining = secondsUntilResendAllowed(1_000, 1_000 + 25_000, 60);

    expect(remaining).toBe(35);
  });

  it("allows a resend once the cooldown has fully elapsed", () => {
    expect(secondsUntilResendAllowed(1_000, 1_000 + 60_000, 60)).toBe(0);
  });

  it("allows a resend once the cooldown has passed", () => {
    expect(secondsUntilResendAllowed(1_000, 1_000 + 61_000, 60)).toBe(0);
  });

  it("defaults to OTP_RESEND_COOLDOWN_SECONDS when no override is given", () => {
    const remaining = secondsUntilResendAllowed(1_000, 1_000);

    expect(remaining).toBe(OTP_RESEND_COOLDOWN_SECONDS);
  });
});
