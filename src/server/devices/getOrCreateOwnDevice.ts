// Server-side Device resolution for an authenticated user (Phase 4D §9/§10).
// Not a Server Action — called from Route Handlers
// (src/app/api/push/subscribe/route.ts), which are already server-only.
//
// The `devices` table has no natural client-supplied unique key: the
// browser's local `fenela_device_id` (src/lib/device.ts) is not a column
// on this table, so it cannot be used to look up an existing row. The only
// reliable lookup is by the Device's own persisted `id`, and only once
// it's verified to belong to the authenticated user.
//
// A caller-supplied candidate id that does not resolve to an owned,
// non-revoked Device (unknown id, or an id owned by a different user — the
// same physical browser after an account switch, Phase 4D §11) results in
// a fresh Device being created, never a reassignment of the existing one.
// This is also how first-ever authenticated registration works: the
// client's pre-existing MVP1-style local id is passed in as a candidate,
// found not to exist in `devices`, and a new server-generated Device id is
// created and returned for the client to cache going forward.

import { requireUser } from "@/server/auth/requireUser";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OwnDevice = { id: string };

export async function getOrCreateOwnDevice(candidateDeviceId: string | null): Promise<OwnDevice> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  if (candidateDeviceId) {
    const { data: existing, error: lookupError } = await supabase
      .from("devices")
      .select("id")
      .eq("id", candidateDeviceId)
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .maybeSingle();

    if (lookupError) {
      throw new Error(`Failed to look up device: ${lookupError.message}`);
    }

    if (existing) {
      const { error: touchError } = await supabase
        .from("devices")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", existing.id);

      if (touchError) {
        // Non-critical bookkeeping — the device is still valid to use.
        console.warn("Failed to update device last_seen_at:", touchError.message);
      }

      return { id: existing.id };
    }
  }

  const { data: created, error: insertError } = await supabase
    .from("devices")
    .insert({ user_id: user.id })
    .select("id")
    .single();

  if (insertError || !created) {
    throw new Error(`Failed to create device: ${insertError?.message ?? "no row returned"}`);
  }

  return { id: created.id };
}
