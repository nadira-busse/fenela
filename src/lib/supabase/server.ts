// Request-aware server Supabase client boundary.
//
// Contains no domain business logic. Used from Server Components, Route
// Handlers and Server Functions. Uses the current Next.js async cookies()
// API (see src/proxy.ts for the session-refresh boundary that keeps these
// cookies current).

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies() is read-only.
          // Safe to ignore: src/proxy.ts refreshes the session cookies on
          // every request, so a Server Component never needs to write them.
        }
      },
    },
  });
}
