// Browser-safe Supabase client boundary.
//
// Contains no server-only secret and no application business logic — only
// public URL + publishable key, per src/lib/supabase/server.ts's
// server-only counterpart.

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabasePublicEnv();

  return createBrowserClient<Database>(url, publishableKey);
}
