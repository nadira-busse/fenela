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

export async function requireUser(): Promise<AuthenticatedUser> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new UnauthenticatedError();
  }

  return {
    id: data.user.id,
    email: data.user.email ?? undefined,
  };
}
