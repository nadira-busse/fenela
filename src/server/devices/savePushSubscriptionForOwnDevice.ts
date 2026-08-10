// Persists a Web Push subscription under the authenticated caller's own
// Device (Phase 4D §12/§13). Not a Server Action — called from
// src/app/api/push/subscribe/route.ts.
//
// push_subscriptions.device_id and .endpoint each carry a DB UNIQUE
// constraint (supabase/migrations/20260809120000_mvp2_persistence_foundation.sql).
// Upserting on device_id is the deliberate conflict target: a changed Web
// Push subscription for the same already-owned Device replaces that
// Device's row rather than creating a duplicate (§13). If the endpoint is
// already used by a *different* device, the endpoint's own unique
// constraint fails the write and this surfaces as a generic DATABASE_ERROR
// — this never reassigns/steals another device's subscription.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrCreateOwnDevice } from "./getOrCreateOwnDevice";

export type SavePushSubscriptionInput = {
  candidateDeviceId: string | null;
  endpoint: string;
  p256dh: string;
  authKey: string;
};

export type SavePushSubscriptionResult =
  | { ok: true; deviceId: string }
  | { ok: false; message: string };

export async function savePushSubscriptionForOwnDevice(
  input: SavePushSubscriptionInput
): Promise<SavePushSubscriptionResult> {
  const device = await getOrCreateOwnDevice(input.candidateDeviceId);
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      device_id: device.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth_key: input.authKey,
    },
    { onConflict: "device_id" }
  );

  if (error) {
    return {
      ok: false,
      message: "Could not save your push subscription right now.",
    };
  }

  return { ok: true, deviceId: device.id };
}
