// Privileged, server-only Supabase client.
//
// Uses SUPABASE_SECRET_KEY. The service-role credential can bypass Row Level
// Security, so this client must NEVER be imported from client/browser code or
// a "use client" component. It carries no `NEXT_PUBLIC_` prefix and must remain
// server-only.
//
// This is not a general-purpose data-access client. Use it only inside narrow,
// trusted server-side operations that explicitly require privileged access;
// normal user-owned reads/writes should use the authenticated SSR client and
// RLS-scoped ownership instead.
//
// Deliberately not the cookie-aware SSR client in src/lib/supabase/server.ts:
// privileged operations do not derive authorization from a browser session, so
// session persistence/refresh is disabled.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { requireEnv } from "@/lib/env";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export function createSupabaseAdminClient() {
  const { url } = getSupabasePublicEnv();
  const secretKey = requireEnv("SUPABASE_SECRET_KEY");

  return createClient<Database>(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
