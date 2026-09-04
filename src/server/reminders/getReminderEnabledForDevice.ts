// Privileged, server-only re-verification of canonical reminder intent for
// one Device, keyed only by deviceId. Used exclusively
// by the cron push execution boundary (src/app/api/cron/push/route.ts),
// which has no user session to scope a normal RLS-aware client to — it is
// reachable only via CRON_SECRET, not requireUser().
//
// KV operational scheduling state (a DAILY_START job) can, under a failed
// cancellation, diverge from the
// canonical reminder_preferences.enabled = false the user actually set.
// Relying only on cleanup at cancellation time is not sufficient — this
// function lets the execution boundary itself refuse to act on stale
// derived state that contradicts current canonical intent, immediately
// before the one irreversible-ish action (sending a push) or repeating
// action (rescheduling) that state controls.
//
// Two sequential reads (device -> user_id, then user_id -> enabled) rather
// than one query, since reminder_preferences has no direct relationship to
// devices — both go through auth.users independently. Called only for
// DAILY_START jobs. The cron route deliberately performs
// fresh checks at the decisions that require current canonical intent,
// including before delivery and again before rescheduling.

import { createSupabaseAdminClient } from "@/lib/supabase/adminClient";

export type ReminderEnabledLookupResult =
  | { ok: true; enabled: boolean }
  | { ok: false; message: string };

export async function getReminderEnabledForDevice(
  deviceId: string
): Promise<ReminderEnabledLookupResult> {
  // The entire body is wrapped, not just the awaited results' `error`
  // fields: a thrown/rejected call (e.g. a missing SUPABASE_SECRET_KEY, or
  // a network failure while constructing/issuing the request) would
  // otherwise propagate out of this function uncaught — and since the
  // caller (cron/push) awaits this per-device inside its own processing
  // loop, an uncaught throw here would abort the ENTIRE cron run instead
  // of staying isolated to the one device/job it concerns. Mirrors
  // touchOwnActivity.ts's own reasoning for the same shape of problem.
  try {
    const supabase = createSupabaseAdminClient();

    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("user_id")
      .eq("id", deviceId)
      .maybeSingle();

    if (deviceError) {
      return { ok: false, message: `Failed to look up device owner: ${deviceError.message}` };
    }

    if (!device) {
      // The Device row is gone (e.g. the account was deleted, which
      // cascades it) — there is no canonical reminder intent left to
      // honor, so any DAILY_START job still referencing this deviceId is
      // unconditionally stale. Not an error: a definite, safe "not
      // enabled" answer.
      return { ok: true, enabled: false };
    }

    const { data: preference, error: preferenceError } = await supabase
      .from("reminder_preferences")
      .select("enabled")
      .eq("user_id", device.user_id)
      .maybeSingle();

    if (preferenceError) {
      return {
        ok: false,
        message: `Failed to load reminder preference: ${preferenceError.message}`,
      };
    }

    // No row at all means the user never (or no longer) has a canonical
    // reminder preference — never treated as "enabled" by omission.
    return { ok: true, enabled: preference?.enabled ?? false };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Reminder preference lookup failed.",
    };
  }
}
