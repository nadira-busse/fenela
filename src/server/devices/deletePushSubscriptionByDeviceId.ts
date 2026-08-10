// Privileged, server-only cleanup for a terminal invalid PushSubscription
// (Phase 4D hardening §6). Called only from src/app/api/cron/push/route.ts,
// which has no authenticated user session and therefore no RLS-scoped
// client that could perform this delete on the user's behalf. Uses the
// admin client (SUPABASE_SECRET_KEY, bypasses RLS) instead, scoped to
// exactly this one responsibility — it must never grow into a general
// admin/repository API.
//
// Not a Server Action and never exposed through any route response —
// reachable only from trusted server code.

import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";

export type DeletePushSubscriptionResult = { ok: true } | { ok: false; message: string };

export async function deletePushSubscriptionByDeviceId(
  deviceId: string
): Promise<DeletePushSubscriptionResult> {
  const supabase = createSupabaseAdminClient();

  // Deleting zero rows (already gone, or never had one — e.g. the
  // unauthenticated/legacy KV-only path) is a successful, idempotent
  // outcome, not an error.
  const { error } = await supabase.from("push_subscriptions").delete().eq("device_id", deviceId);

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}
