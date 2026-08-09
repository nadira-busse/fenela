// Authentication only: exchanges a Supabase auth code for a session and
// redirects. Must not create goals, write preferences, create devices,
// schedule reminders, or perform any onboarding business logic — that is
// explicitly out of scope for this phase.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/auth/safeRedirect";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeRedirectPath(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/auth?error=missing_code", url.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/auth?error=exchange_failed", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
