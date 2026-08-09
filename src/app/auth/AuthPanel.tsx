"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type MagicLinkStatus = "idle" | "sending" | "sent" | "error";
type GoogleStatus = "idle" | "redirecting" | "error";

type Props = {
  // Already validated server-side (safeRedirectPath) by src/app/auth/page.tsx
  // before reaching this component.
  next?: string;
};

export function AuthPanel({ next = "/" }: Props) {
  const [email, setEmail] = useState("");
  const [magicLinkStatus, setMagicLinkStatus] = useState<MagicLinkStatus>("idle");
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>("idle");

  function callbackUrl() {
    const url = new URL("/auth/callback", window.location.origin);
    url.searchParams.set("next", next);
    return url.toString();
  }

  async function handleGoogleSignIn() {
    setGoogleStatus("redirecting");

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl(),
      },
    });

    if (error) {
      setGoogleStatus("error");
    }
    // On success the browser navigates away to Google, so no further local
    // state update is needed.
  }

  async function handleMagicLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return;
    }

    setMagicLinkStatus("sending");

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: callbackUrl(),
      },
    });

    setMagicLinkStatus(error ? "error" : "sent");
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleStatus === "redirecting"}
        className="rounded-lg border border-[var(--text-main)]/20 px-4 py-3 text-sm font-medium text-[var(--text-main)] disabled:opacity-60"
      >
        {googleStatus === "redirecting" ? "Redirecting…" : "Continue with Google"}
      </button>
      {googleStatus === "error" ? (
        <p role="alert" className="text-sm text-red-600">
          Google sign-in could not be started. Please try again.
        </p>
      ) : null}

      <form onSubmit={handleMagicLinkSubmit} className="flex flex-col gap-3">
        <label htmlFor="auth-email" className="text-sm font-medium text-[var(--text-main)]">
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
          className="rounded-lg border border-[var(--text-main)]/20 px-4 py-3 text-sm"
        />
        <button
          type="submit"
          disabled={magicLinkStatus === "sending"}
          className="rounded-lg bg-[var(--text-main)] px-4 py-3 text-sm font-medium text-[var(--bg-app)] disabled:opacity-60"
        >
          {magicLinkStatus === "sending" ? "Sending…" : "Send magic link"}
        </button>
        {magicLinkStatus === "sent" ? (
          <p role="status" className="text-sm text-[var(--text-main)]">
            Check your email for a sign-in link.
          </p>
        ) : null}
        {magicLinkStatus === "error" ? (
          <p role="alert" className="text-sm text-red-600">
            The sign-in link could not be sent. Please try again.
          </p>
        ) : null}
      </form>
    </div>
  );
}
