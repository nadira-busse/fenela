// Central server-side authenticated-user helper.
//
// The only place application server code should ask "who is the current
// user?". Never trust a caller-supplied user_id/email/device_id as identity
// proof — this helper derives identity from the verified Supabase session
// only.
//
// Uses supabase.auth.getUser(), not getUser's cookie-only cousin
// getSession(): getUser() revalidates the JWT against the Auth server, so a
// tampered or stale session cookie cannot be trusted as authentication.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAuthSessionMissingError } from "@supabase/supabase-js";

export type AuthenticatedUser = {
  id: string;
  email?: string;
};

export class UnauthenticatedError extends Error {
  constructor(message = "No authenticated user.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

// Thrown when supabase.auth.getUser() cannot establish identity for a
// reason other than "there genuinely is no session" — an expired, invalid
// or tampered token, or the Auth service itself failing (network error,
// 5xx) (Phase 4D hardening §3). This is deliberately a *different* type
// from UnauthenticatedError: getOptionalUser() treats UnauthenticatedError
// as a safe signal that the caller may fall back to unauthenticated/legacy
// behavior, and that substitution must never happen for a real
// verification failure — collapsing the two here would let a broken Auth
// service silently downgrade every authenticated caller to anonymous.
export class AuthVerificationError extends Error {
  constructor(message = "Could not verify authentication.", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AuthVerificationError";
  }
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    // The typed/code-based distinction Supabase Auth itself provides for
    // "there is no session to check" — not a string-matched guess.
    if (isAuthSessionMissingError(error)) {
      throw new UnauthenticatedError();
    }

    throw new AuthVerificationError(error.message, { cause: error });
  }

  if (!data.user) {
    throw new UnauthenticatedError();
  }

  return {
    id: data.user.id,
    email: data.user.email ?? undefined,
  };
}

/**
 * Non-throwing counterpart for call sites that need to branch on
 * authentication state (e.g. deciding what to render, or whether an
 * anonymous/legacy code path is allowed to run) rather than fail closed.
 * A genuine infrastructure/verification error (AuthVerificationError, not
 * "no session") still throws — the caller must not treat "Auth is broken"
 * the same as "this visitor is anonymous."
 */
export async function getOptionalUser(): Promise<AuthenticatedUser | null> {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      return null;
    }

    throw error;
  }
}
