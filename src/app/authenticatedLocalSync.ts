// Orchestrates the two-step sequence HomeClient must run, in order, on
// every authenticated load, before any owned local key is read for
// rendering (Phase 4A hardening, Defect A):
//
//   1. local owner check — discard foreign/unowned compatibility state
//   2. DB user_preferences → refreshed local screening compatibility cache
//
// Extracted from src/app/HomeClient.tsx's effect body so this ordering
// (reset, THEN repopulate — never the other way around, or step 2's write
// would immediately be wiped by step 1) is independently testable without
// rendering the component.

import { saveToStorage } from "@/lib/storage";
import { ensureLocalOwnership } from "@/lib/localOwner";
import { loadScreening, saveScreening, type ScreeningInput } from "@/lib/screeningStorage";

export const LS_SCREENING_DONE_KEY = "fenela:screeningDone";

export type PersistedPreferenceFields = Omit<ScreeningInput, "dailyReminder" | "startTime">;

export function syncAuthenticatedLocalState(
  userId: string,
  dbPreference: PersistedPreferenceFields | null
): void {
  ensureLocalOwnership(userId);

  if (!dbPreference) {
    return;
  }

  const existingLocal = loadScreening();

  saveScreening({
    ...dbPreference,
    dailyReminder: existingLocal?.dailyReminder ?? "NOT_NOW",
    startTime: existingLocal?.startTime ?? "08:00",
  });

  saveToStorage(LS_SCREENING_DONE_KEY, true);
}
