// Next.js 16 request/session-refresh boundary (the current convention that
// replaces middleware.ts). Infrastructure only: refreshes and propagates
// Supabase auth cookies so server components/route handlers see a current
// session. No product redirects, no domain logic, no database writes.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { url, publishableKey } = getSupabasePublicEnv();

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }

        response = NextResponse.next({ request });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Revalidates the session with the Auth server (not just reading the
  // cookie) and refreshes it if needed, so downstream server code sees a
  // current, verified session. Do not skip this call or drop `response`.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Skip static assets, the PWA manifest and the service worker — none
    // of these need a refreshed auth session.
    "/((?!_next/static|_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
