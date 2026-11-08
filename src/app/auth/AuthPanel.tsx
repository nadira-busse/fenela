"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { requestOtp, verifyOtpCode } from "./otpLoginOrchestration";
import { secondsUntilResendAllowed } from "./otpResendCooldown";

type Step = "email" | "code";
type SendStatus = "idle" | "sending" | "sent" | "rate_limited" | "error";
type VerifyStatus = "idle" | "verifying" | "invalid" | "rate_limited" | "error";

// Email OTP length is configured per Supabase project: `otp_length` under
// [auth.email] in supabase/config.toml locally, and the hosted project's
// Auth settings in production. Both use 8 digits. This is the input's upper
// bound rather than an exact length, so a code is never truncated; codes
// shorter than the configured length are rejected by Supabase on verify.
export const OTP_CODE_MAX_LENGTH = 8;

type Props = {
  // Already validated server-side (safeRedirectPath) by src/app/auth/page.tsx
  // before reaching this component.
  next?: string;
};

// Sign-in is completed by entering the emailed code. The redirect still
// points at the existing callback route so that any email containing a
// sign-in link (for example, from a hosted template that still renders
// {{ .ConfirmationURL }}, or an email already sent) completes sign-in
// instead of failing — see docs/technical/local-setup.md.
function callbackUrl(next: string) {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", next);
  return url.toString();
}

export function AuthPanel({ next = "/" }: Props) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sendStatus, setSendStatus] = useState<SendStatus>("idle");
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("idle");
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  // Ticks the resend countdown once a code has been sent. `now` itself is
  // seeded in sendCode() (alongside lastSentAt) rather than here, so this
  // effect only subscribes to the passage of time instead of calling
  // setState synchronously from the effect body.
  useEffect(() => {
    if (step !== "code") {
      return;
    }

    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [step]);

  async function sendCode(trimmedEmail: string) {
    setSendStatus("sending");

    const supabase = createSupabaseBrowserClient();
    const result = await requestOtp(trimmedEmail, {
      sendOtp: (email) =>
        supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: callbackUrl(next) },
        }),
    });

    if (result.status !== "sent") {
      setSendStatus(result.status);
      return;
    }

    const sentAt = Date.now();
    setLastSentAt(sentAt);
    setNow(sentAt);
    setSendStatus("sent");
    setVerifyStatus("idle");
    setStep("code");
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail || sendStatus === "sending") {
      return;
    }

    await sendCode(trimmedEmail);
  }

  async function handleResend() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || sendStatus === "sending") {
      return;
    }

    if (secondsUntilResendAllowed(lastSentAt, Date.now()) > 0) {
      return;
    }

    await sendCode(trimmedEmail);
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedCode = code.trim();
    if (!trimmedCode || verifyStatus === "verifying") {
      return;
    }

    setVerifyStatus("verifying");

    const supabase = createSupabaseBrowserClient();
    const result = await verifyOtpCode(email.trim(), trimmedCode, {
      verifyOtp: (verifyEmail, token) =>
        supabase.auth.verifyOtp({ email: verifyEmail, token, type: "email" }),
    });

    if (result.status === "verified") {
      // Full navigation (not router.push) so server components immediately
      // see the session the browser client just persisted, matching the
      // sign-out/delete-account flows' own navigation convention.
      window.location.href = next;
      return;
    }

    setVerifyStatus(result.status === "invalid_or_expired" ? "invalid" : result.status);
  }

  function handleUseDifferentEmail() {
    setStep("email");
    setCode("");
    setSendStatus("idle");
    setVerifyStatus("idle");
    setLastSentAt(null);
  }

  const resendCooldown =
    step === "code" && now !== null ? secondsUntilResendAllowed(lastSentAt, now) : 0;

  if (step === "code") {
    return (
      <div className="flex flex-col">
        <p className="text-sm leading-relaxed text-[var(--text-soft)]">
          We sent a sign-in code to <span className="font-semibold">{email.trim()}</span>. Enter it
          below to sign in.
        </p>

        <form onSubmit={handleCodeSubmit} className="mt-6 flex flex-col">
          <label htmlFor="auth-otp-code" className="sr-only">
            Sign-in code
          </label>

          <input
            id="auth-otp-code"
            name="otp"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={OTP_CODE_MAX_LENGTH}
            required
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            placeholder="123456"
            className="mt-2 rounded-2xl border border-[var(--text-main)]/15 bg-white px-4 py-4 text-center text-lg tracking-[0.3em] text-[var(--text-main)] outline-none transition focus:border-[var(--cta-primary)]"
          />

          <button
            type="submit"
            disabled={verifyStatus === "verifying"}
            className="mt-6 w-full rounded-2xl bg-[var(--cta-primary)] px-4 py-4 text-base font-bold text-[var(--cta-primary-text)] transition-transform active:scale-95 disabled:opacity-60"
          >
            {verifyStatus === "verifying" ? "Verifying…" : "Verify code"}
          </button>

          {verifyStatus === "invalid" ? (
            <p role="alert" className="mt-4 text-sm text-red-600">
              That code is invalid, already used, or has expired. Request a new one below.
            </p>
          ) : null}

          {verifyStatus === "rate_limited" ? (
            <p role="alert" className="mt-4 text-sm text-red-600">
              Too many attempts. Please wait a moment before trying again.
            </p>
          ) : null}

          {verifyStatus === "error" ? (
            <p role="alert" className="mt-4 text-sm text-red-600">
              The code could not be verified. Please try again.
            </p>
          ) : null}

          <div className="mt-6 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={handleUseDifferentEmail}
              className="font-medium text-[var(--text-soft)] underline underline-offset-2"
            >
              Use a different email
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={sendStatus === "sending" || resendCooldown > 0}
              className="font-medium text-[var(--cta-secondary-text)] underline underline-offset-2 disabled:opacity-60 disabled:no-underline"
            >
              {resendCooldown > 0
                ? `Resend code in ${resendCooldown}s`
                : sendStatus === "sending"
                  ? "Sending…"
                  : "Resend code"}
            </button>
          </div>

          {sendStatus === "rate_limited" ? (
            <p role="alert" className="mt-4 text-sm text-red-600">
              Too many codes requested. Please wait before requesting another one.
            </p>
          ) : null}

          {sendStatus === "error" ? (
            <p role="alert" className="mt-4 text-sm text-red-600">
              The code could not be resent. Please try again.
            </p>
          ) : null}
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <p className="text-sm leading-relaxed text-[var(--text-soft)]">
        Enter your email and we’ll send you a sign-in code.
      </p>

      <form onSubmit={handleEmailSubmit} className="mt-6 flex flex-col">
        <label htmlFor="auth-email" className="sr-only">
          Email
        </label>

        <input
          id="auth-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="mt-2 rounded-2xl border border-[var(--text-main)]/15 bg-white px-4 py-4 text-sm text-[var(--text-main)] outline-none transition focus:border-[var(--cta-primary)]"
        />

        <button
          type="submit"
          disabled={sendStatus === "sending"}
          className="mt-6 w-full rounded-2xl bg-[var(--cta-primary)] px-4 py-4 text-base font-bold text-[var(--cta-primary-text)] transition-transform active:scale-95 disabled:opacity-60"
        >
          {sendStatus === "sending" ? "Sending…" : "Send sign-in code"}
        </button>

        {sendStatus === "rate_limited" ? (
          <p role="alert" className="mt-4 text-sm text-red-600">
            Too many codes requested. Please wait before requesting another one.
          </p>
        ) : null}

        {sendStatus === "error" ? (
          <p role="alert" className="mt-4 text-sm text-red-600">
            The code could not be sent. Please try again.
          </p>
        ) : null}
      </form>
    </div>
  );
}
