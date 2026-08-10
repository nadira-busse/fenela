// Ties MVP1 local compatibility state to the authenticated user it belongs
// to, so a different authenticated user in the same browser profile can
// never inherit it, and old ownerless/pre-auth local state is never
// silently adopted by the first authenticated user (Phase 4A hardening,
// Defect A). Temporary compatibility infrastructure only — `user_preferences`
// remains the canonical source for authenticated screening state (ADR-003).
//
// ensureLocalOwnership() deliberately does not touch:
// - the DB-derived screening cache logic itself (src/app/HomeClient.tsx
//   still owns writing that, after calling ensureLocalOwnership here);
// - device/reminder-local state (fenela_device_id,
//   fenela:dailyReminder:*) — this runs on every authenticated load, and
//   changing that would alter existing cross-account load behavior, not
//   just add logout cleanup.
//
// clearLocalStateForSignOut() below is a separate, explicitly-triggered
// function for actual sign-out (Phase 4D final hardening §10/§11) — it
// intentionally clears more than ensureLocalOwnership does, including the
// owner marker and the device/reminder-local cache, since a signed-out
// browser should not carry forward the previous account's device identity
// or Goal/Anchor state at all.

import { loadFromStorage, saveToStorage, removeFromStorage } from "@/lib/storage";
import { DEVICE_ID_KEY } from "@/lib/device";
import { DAILY_REMINDER_TIME_KEY, DAILY_REMINDERS_ENABLED_KEY } from "@/lib/reminderLocalKeys";

export const OWNER_MARKER_KEY = "fenela:localOwnerUserId";

// Personal, post-screening MVP1 product state that must not leak between
// authenticated users sharing a browser profile.
export const OWNED_STORAGE_KEYS = [
  "fenela:screening:v1",
  "fenela:screeningDone",
  "fenela:intake",
  "dayStateV3",
  "careAnchors",
  "fenela:dayLogs",
  "anchor:dayState",
  // Phase 4F: which weekly Reflection this device has already shown — see
  // src/app/reflections/weeklyReflectionLocalState.ts.
  "fenela:reflection:weekly:lastSeenId",
] as const;

// Device/reminder-local cache removed on explicit sign-out only, never by
// ensureLocalOwnership() (see file header). Kept as a separate list rather
// than merged into OWNED_STORAGE_KEYS so the two responsibilities stay
// explicit and independently testable.
const SIGN_OUT_ONLY_KEYS = [
  DEVICE_ID_KEY,
  DAILY_REMINDER_TIME_KEY,
  DAILY_REMINDERS_ENABLED_KEY,
] as const;

function clearOwnedState(): void {
  for (const key of OWNED_STORAGE_KEYS) {
    removeFromStorage(key);
  }
}

/**
 * Call once per authenticated load, before reading any of
 * OWNED_STORAGE_KEYS. Resets that state and reassigns the marker whenever
 * the browser's local state does not already belong to `userId` —
 * including when no marker exists yet (old anonymous/pre-auth state, or a
 * different previous authenticated user). A no-op when the marker already
 * matches, so it is safe to call on every load.
 */
export function ensureLocalOwnership(userId: string): void {
  const currentOwner = loadFromStorage<string | null>(OWNER_MARKER_KEY, null);

  if (currentOwner === userId) {
    return;
  }

  clearOwnedState();
  saveToStorage(OWNER_MARKER_KEY, userId);
}

/**
 * Explicit authenticated sign-out cleanup (Phase 4D final hardening) —
 * distinct from ensureLocalOwnership's cross-account load protection.
 * Removes every owned personal-compatibility key, the owner marker
 * itself, and this browser's device/reminder-local cache, so:
 *   - a signed-out visitor never sees the previous account's
 *     Goal/Anchor/day state (no ensureLocalOwnership call runs before the
 *     next authenticated load establishes a new marker, since there is no
 *     session at all right after sign-out);
 *   - a different account signing in later on this same browser starts
 *     with no device identity, rather than inheriting (and being unable
 *     to use, per Device ownership verification) the previous account's
 *     device id.
 * Never uses localStorage.clear() — only the exact keys listed above.
 */
export function clearLocalStateForSignOut(): void {
  clearOwnedState();
  removeFromStorage(OWNER_MARKER_KEY);

  for (const key of SIGN_OUT_ONLY_KEYS) {
    removeFromStorage(key);
  }
}
