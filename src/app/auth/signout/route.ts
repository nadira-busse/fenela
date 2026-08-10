// Final step of the sign-out lifecycle (Phase 4D final hardening §8):
// clears the Supabase session so requireUser() fails closed afterward.
// Device/push detachment and personal local-state cleanup happen before
// this is called — see src/app/auth/SignOutButton.tsx, which is the only
// intended caller. Redirects to /auth (not /) so a signed-out visitor is
// never routed back into the root page, whose authenticated Goal/Anchor
// state (now already cleared client-side) is otherwise the only reason
// `/` would render anything meaningful for them.
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/auth", request.url));
}
