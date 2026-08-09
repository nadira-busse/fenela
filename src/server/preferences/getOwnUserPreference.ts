// Server-side read path for the authenticated user's own `user_preferences`
// row. Server Component/server-boundary use only — not a Server Action, so
// it is not reachable as a client-callable endpoint.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth/requireUser";
import type { Tables } from "@/types/database.types";

export type UserPreferenceRow = Tables<"user_preferences">;

export async function getOwnUserPreference(): Promise<UserPreferenceRow | null> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load user_preferences: ${error.message}`);
  }

  return data;
}
