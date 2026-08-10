// Privileged, server-only Supabase client (Phase 4D hardening §6/§7).
//
// Uses SUPABASE_SECRET_KEY, which bypasses Row Level Security entirely —
// this must NEVER be imported from client/browser code or a "use client"
// component. It carries no `NEXT_PUBLIC_` prefix, so even in the worst
// case of an accidental client-side import, Next.js does not inline its
// value into the browser bundle (only NEXT_PUBLIC_* vars are); the import
// would simply fail at runtime with "Missing required environment
// variable" rather than leak the secret. Reserve actual use for the one
// narrow, trusted cleanup responsibility that needs it
// (src/server/devices/deletePushSubscriptionByDeviceId.ts), not as a
// general-purpose privileged client.
//
// Deliberately not the cookie-aware SSR client in src/lib/supabase/server.ts:
// this has no request/session context at all (its only caller today is the
// cron route, which has no authenticated user), so session
// persistence/refresh is disabled rather than left to depend on cookies
// that don't exist here.

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
