// Read-only Device ownership check for an authenticated user (Phase 4D
// §9/§15), used by reminder scheduling/cancellation routes. Unlike
// getOrCreateOwnDevice, this never creates a Device: a caller-supplied
// deviceId that does not belong to the authenticated user must be
// rejected outright, not silently upgraded into a new device with no
// subscription — the correct recovery for that case is the user turning
// reminders on again (which re-runs getOrCreateOwnDevice), not a schedule
// call quietly operating on the wrong (or no) device.

import { requireUser } from "@/server/auth/requireUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function verifyOwnDevice(deviceId: string): Promise<boolean> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("devices")
    .select("id")
    .eq("id", deviceId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify device: ${error.message}`);
  }

  return data !== null;
}
