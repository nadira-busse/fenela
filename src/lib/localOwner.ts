// Ties MVP1 local compatibility state to the authenticated user it belongs
// to, so a different authenticated user in the same browser profile can
// never inherit it, and old ownerless/pre-auth local state is never
// silently adopted by the first authenticated user (Phase 4A hardening,
// Defect A). Temporary compatibility infrastructure only — `user_preferences`
// remains the canonical source for authenticated screening state (ADR-003).
//
// Deliberately does not touch:
// - the DB-derived screening cache logic itself (src/app/HomeClient.tsx
//   still owns writing that, after calling ensureLocalOwnership here);
// - device/reminder-local state (fenela_device_id,
//   fenela:dailyReminder:*) — that is device/infrastructure state, not
//   personal narrative content, and reminder ownership is an explicitly
//   separate, later phase (ADR-004).

import { loadFromStorage, saveToStorage, removeFromStorage } from "@/lib/storage";

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
