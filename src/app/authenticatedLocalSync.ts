// Orchestrates the sequence HomeClient must run, in order, on every
// authenticated load, before any owned local key is read for rendering
// (Phase 4A hardening, Defect A; extended in Phase 4B for Goal/Anchors and
// Phase 4D for ReminderPreference):
//
//   1. local owner check — discard foreign/unowned compatibility state
//   2. DB user_preferences → refreshed local screening compatibility cache
//   3. DB active Goal + Anchors → refreshed local intake/careAnchors cache
//
// Extracted from src/app/HomeClient.tsx's effect body so this ordering
// (reset, THEN repopulate — never the other way around, or a later step's
// write would immediately be wiped by an earlier reset) is independently
// testable without rendering the component.

import { saveToStorage, removeFromStorage, CARE_ANCHORS_KEY } from "@/lib/storage";
import { ensureLocalOwnership } from "@/lib/localOwner";
import { saveScreening, type ScreeningInput } from "@/lib/screeningStorage";
import { mapActiveGoalToCompatibilityState, type ActiveGoalWithAnchors } from "@/lib/goalMapping";

export const LS_SCREENING_DONE_KEY = "fenela:screeningDone";
export const LS_INTAKE_KEY = "fenela:intake";

export type PersistedPreferenceFields = Omit<ScreeningInput, "dailyReminder" | "startTime">;

export type PersistedReminderPreference = { enabled: boolean; startTime: string };

export function syncAuthenticatedLocalState(
  userId: string,
  dbPreference: PersistedPreferenceFields | null,
  activeGoal: ActiveGoalWithAnchors | null,
  reminderPreference: PersistedReminderPreference | null = null
): void {
  ensureLocalOwnership(userId);

  if (dbPreference) {
    // ReminderPreference (reminder_preferences) is now the sole canonical
    // source for dailyReminder/startTime (Phase 4D, ADR-004) — no longer
    // preserved from whatever the local screening cache happened to hold,
    // since that was the exact "two independent sources" duplication this
    // phase removes. No row yet means the product default (not enabled),
    // never an inferred value from an old anonymous cache (Phase 4D §25).
    saveScreening({
      ...dbPreference,
      dailyReminder: reminderPreference?.enabled ? "YES" : "NOT_NOW",
      startTime: reminderPreference?.startTime ?? "08:00",
    });

    saveToStorage(LS_SCREENING_DONE_KEY, true);
  }

  if (activeGoal) {
    const compatibility = mapActiveGoalToCompatibilityState(activeGoal, dbPreference?.name ?? "");

    saveToStorage(LS_INTAKE_KEY, compatibility.intake);

    // Written directly rather than through saveCareAnchors(): these anchors
    // are already-persisted, RLS-owned DB rows, not fresh unvalidated
    // input, so re-running the free-text safety filter here would only
    // risk a future filter change retroactively breaking a returning
    // user's restore for content that was already accepted once.
    saveToStorage(CARE_ANCHORS_KEY, compatibility.careAnchors);
  } else {
    // No ACTIVE goal in the DB must always win over local state, not just
    // when the owner marker also changed — e.g. the goal could have been
    // archived from a different device/session for this same user, and
    // this browser must not keep showing Coaching for a goal that is no
    // longer active (Phase 4B §10).
    removeFromStorage(LS_INTAKE_KEY);
    removeFromStorage(CARE_ANCHORS_KEY);
  }
}
