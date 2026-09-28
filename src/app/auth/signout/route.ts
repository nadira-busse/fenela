// Final step of the sign-out lifecycle:
// clears the Supabase session so requireUser() fails closed afterward.
// Device/push detachment and personal local-state cleanup happen before
// this is called — see src/app/auth/SignOutButton.tsx, which is the only
// intended caller of the default (local) scope. Redirects to /auth (not /)
// so a signed-out visitor is never routed back into the root page, whose
// authenticated Goal/Anchor state (now already cleared client-side) is
// otherwise the only reason `/` would render anything meaningful for them.
//
// Scope defaults to Supabase's "local" — the current browser/device session
// only. Supabase's own signOut() default is "global" (every device the
// account is signed in on), which is *not* what an ordinary "Sign out"
// button means: signing out on one device must never invalidate another
// device's already-active session for the same account. The one caller
// that legitimately wants every device's session gone — DeleteAccountButton,
// after the account itself is already irreversibly deleted server-side —
// passes scope "global" explicitly; see src/app/auth/DeleteAccountButton.tsx.
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SignOutScope } from "@supabase/supabase-js";

export const runtime = "nodejs";

function parseScope(value: unknown): SignOutScope {
  return value === "global" || value === "others" ? value : "local";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const scope = parseScope(
    body && typeof body === "object" ? (body as { scope?: unknown }).scope : undefined
  );

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut({ scope });

  return NextResponse.redirect(new URL("/auth", request.url));
}
