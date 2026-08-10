// Server-side read path for the authenticated user's own
// `reminder_preferences` row. Server Component/server-boundary use only —
// not a Server Action, so it is not reachable as a client-callable
// endpoint. Mirrors src/server/preferences/getOwnUserPreference.ts.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth/requireUser";
import type { Tables } from "@/types/database.types";

export type ReminderPreferenceRow = Tables<"reminder_preferences">;

export async function getOwnReminderPreference(): Promise<ReminderPreferenceRow | null> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("reminder_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load reminder_preferences: ${error.message}`);
  }

  return data;
}
