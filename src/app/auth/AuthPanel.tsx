"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type MagicLinkStatus = "idle" | "sending" | "sent" | "error";

type Props = {
  // Already validated server-side (safeRedirectPath) by src/app/auth/page.tsx
  // before reaching this component.
  next?: string;
};

export function AuthPanel({ next = "/" }: Props) {
  const [email, setEmail] = useState("");
  const [magicLinkStatus, setMagicLinkStatus] = useState<MagicLinkStatus>("idle");

  function callbackUrl() {
    const url = new URL("/auth/callback", window.location.origin);
    url.searchParams.set("next", next);
    return url.toString();
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
    <div className="flex flex-col">
      <p className="text-sm leading-relaxed text-[var(--text-soft)]">
        Enter your email and we’ll send you a secure magic link.
      </p>

      <form onSubmit={handleMagicLinkSubmit} className="mt-6 flex flex-col">
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
          disabled={magicLinkStatus === "sending"}
          className="mt-6 w-full rounded-2xl bg-[var(--cta-primary)] px-4 py-4 text-base font-bold text-[var(--cta-primary-text)] transition-transform active:scale-95 disabled:opacity-60"
        >
          {magicLinkStatus === "sending" ? "Sending…" : "Send magic link"}
        </button>

        {magicLinkStatus === "sent" ? (
          <p role="status" className="mt-4 text-sm leading-relaxed text-[var(--text-soft)]">
            Check your email for a sign-in link.
          </p>
        ) : null}

        {magicLinkStatus === "error" ? (
          <p role="alert" className="mt-4 text-sm text-red-600">
            The sign-in link could not be sent. Please try again.
          </p>
        ) : null}
      </form>
    </div>
  );
}
