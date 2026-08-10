// Device-local "has this weekly reflection already been shown" marker
// (Phase 4F "when to show" mechanism). Reflection rows are immutable and
// idempotent per period, so re-resolving the eligible week is cheap and
// always returns the same row for the rest of that week — without some
// local memory of "already shown", the same weekly card would reappear on
// every return visit until the next Monday. A dedicated DB table/column
// for this would be one more privileged write path for a single per-device
// UI flag; this instead follows the same device-local-flag pattern this
// repo already uses for equivalent concerns (e.g. LS_SCREENING_DONE_KEY,
// the daily-reminder-enabled local flag in CoachingScreen.tsx). Trade-off:
// it is device-scoped, not account-scoped — a second device may show the
// same weekly card once more, which mirrors how reminder-enabled state
// already behaves per-device in this app.

import { loadFromStorage, saveToStorage } from "@/lib/storage";

export const LS_LAST_SEEN_WEEKLY_REFLECTION_ID_KEY = "fenela:reflection:weekly:lastSeenId";

export function getLastSeenWeeklyReflectionId(): string | null {
  return loadFromStorage<string | null>(LS_LAST_SEEN_WEEKLY_REFLECTION_ID_KEY, null);
}

export function saveLastSeenWeeklyReflectionId(id: string): void {
  saveToStorage(LS_LAST_SEEN_WEEKLY_REFLECTION_ID_KEY, id);
}
