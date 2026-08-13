// What ScreeningScreen should report to HomeClient (via onDone) as the
// reminder preference that is now actually sitting in `reminder_preferences`.
//
// Extracted so this decision is unit-testable without rendering
// ScreeningScreen (this repo has no RTL/jsdom dependency) — same reasoning
// as src/app/auth/signOutOrchestration.ts.
//
// ScreeningScreen can reach its "continue" step (onDone) three different
// ways: the reminder_preferences write itself failed (nothing durable was
// persisted, so intent must not be reported as true); the write succeeded
// but a later step (push permission, subscription, scheduling) failed,
// leaving `enabled: true` genuinely persisted even though reminders are not
// yet active on this device; or everything succeeded. Only the write's own
// success/failure determines what to report — a later technical failure
// does not undo what was already durably saved.

import type { DailyReminderPreference } from "@/lib/screeningStorage";

export type ScreeningReminderOutcome = { enabled: boolean; startTime: string };

export function resolveScreeningReminderOutcome(input: {
  reminderPreferenceSaved: boolean;
  dailyReminder: DailyReminderPreference;
  startTime: string;
}): ScreeningReminderOutcome {
  if (!input.reminderPreferenceSaved) {
    return { enabled: false, startTime: input.startTime };
  }

  return { enabled: input.dailyReminder === "YES", startTime: input.startTime };
}
