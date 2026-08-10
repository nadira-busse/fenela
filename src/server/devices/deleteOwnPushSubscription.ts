// Authenticated deletion of the caller's own push_subscriptions row
// (Phase 4D final hardening §6), used by the sign-out cleanup route.
// Uses the normal request-scoped, RLS-enforced Supabase client — a real
// user session exists for this path, so the `push_subscriptions_delete_own`
// policy (supabase/migrations/20260809120000_mvp2_persistence_foundation.sql,
// device -> goal... device -> user via devices.user_id = auth.uid()) is
// sufficient. This deliberately does not use the privileged admin client
// (src/lib/supabase/adminClient.ts) — that is reserved for
// src/app/api/cron/push/route.ts, which has no user session to scope a
// normal client to.
//
// Not a Server Action — called only from
// src/app/api/push/unsubscribe/route.ts, which has already verified the
// caller owns the target Device (verifyOwnDevice) before this runs.

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DeleteOwnPushSubscriptionResult = { ok: true } | { ok: false; message: string };

export async function deleteOwnPushSubscription(
  deviceId: string
): Promise<DeleteOwnPushSubscriptionResult> {
  const supabase = await createSupabaseServerClient();

  // A missing row (already gone, or never had one) is a successful,
  // idempotent outcome, not an error.
  const { error } = await supabase.from("push_subscriptions").delete().eq("device_id", deviceId);

  if (error) {
    return { ok: false, message: "Could not remove your push subscription right now." };
  }

  return { ok: true };
}
