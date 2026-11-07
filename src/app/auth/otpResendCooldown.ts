// Client-side resend cooldown for the email-OTP login step.
//
// This is a restraint on the UI only (it stops accidental double-taps and
// obvious spamming of the resend button) — it does not replace or assume
// the provider's own send-rate limiting, which is enforced server-side
// regardless of what this returns. Keep this at or above the hosted
// project's configured minimum email interval so the UI does not invite a
// request that the backend would reject anyway; it is intentionally
// restrained rather than tight, since otpLoginOrchestration.ts still
// surfaces a `rate_limited` result if the backend disagrees.

export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export function secondsUntilResendAllowed(
  lastSentAtMs: number | null,
  nowMs: number,
  cooldownSeconds: number = OTP_RESEND_COOLDOWN_SECONDS
): number {
  if (lastSentAtMs === null) {
    return 0;
  }

  const remaining = cooldownSeconds - (nowMs - lastSentAtMs) / 1000;

  return remaining > 0 ? Math.ceil(remaining) : 0;
}
