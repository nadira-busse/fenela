// The email-OTP login steps, extracted from AuthPanel so the
// request/verify sequence and error classification are unit-testable
// without rendering a component (this repo has no RTL/jsdom dependency),
// following the same pattern as signOutOrchestration.ts and
// deleteAccountOrchestration.ts.
//
// signInWithOtp and verifyOtp are the same Supabase Auth calls previously
// used for Magic Link — only what the user does with the emailed token
// changes (type it in here instead of following a link). Error codes are
// taken from @supabase/auth-js's AuthApiError: `otp_expired` covers an
// invalid, already-used or genuinely expired code (Supabase does not
// distinguish those cases), and the `over_*_rate_limit` codes cover the
// provider's own send/verify throttling.

export type OtpAuthError = { code?: string | null; status?: number | null };

export type RequestOtpResult =
  | { status: "sent" }
  | { status: "rate_limited" }
  | { status: "error" };

export type VerifyOtpResult =
  | { status: "verified" }
  | { status: "invalid_or_expired" }
  | { status: "rate_limited" }
  | { status: "error" };

export type RequestOtpDeps = {
  sendOtp: (email: string) => Promise<{ error: OtpAuthError | null }>;
};

export type VerifyOtpDeps = {
  verifyOtp: (email: string, token: string) => Promise<{ error: OtpAuthError | null }>;
};

const RATE_LIMIT_CODES = new Set([
  "over_email_send_rate_limit",
  "over_request_rate_limit",
  "over_sms_send_rate_limit",
]);

function isRateLimited(error: OtpAuthError): boolean {
  return (error.code != null && RATE_LIMIT_CODES.has(error.code)) || error.status === 429;
}

export async function requestOtp(email: string, deps: RequestOtpDeps): Promise<RequestOtpResult> {
  const { error } = await deps.sendOtp(email);

  if (!error) {
    return { status: "sent" };
  }

  return { status: isRateLimited(error) ? "rate_limited" : "error" };
}

export async function verifyOtpCode(
  email: string,
  token: string,
  deps: VerifyOtpDeps
): Promise<VerifyOtpResult> {
  const { error } = await deps.verifyOtp(email, token);

  if (!error) {
    return { status: "verified" };
  }

  if (error.code === "otp_expired") {
    return { status: "invalid_or_expired" };
  }

  return { status: isRateLimited(error) ? "rate_limited" : "error" };
}
