// Minimal sign-out operation. Authentication only: clears the Supabase
// session so requireUser() fails closed afterward, then returns to home.

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  return NextResponse.redirect(new URL("/", request.url));
}
