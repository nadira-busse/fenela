// Resolves the reminder preference HomeClient should treat as current.
//
// Mirrors the existing screeningDoneOverride/intakeOverride/goalIdOverride
// pattern in HomeClient.tsx: the server-provided `reminderPreference` prop
// is only as fresh as the last full server render of `/`, but screening ->
// intake -> Coaching all happen client-side, in one session, with no server
// round-trip in between. Without an override, a user who just answered
// "Yes" to reminders during screening sees Home report "Reminders — Off",
// because Coaching still reads the server prop captured before screening
// ever persisted anything (the reported defect). `undefined` means "no
// override set yet, defer to the server prop"; an explicit value (including
// explicit null) always wins, exactly like the other overrides.

import type { PersistedReminderPreference } from "./authenticatedLocalSync";

export function resolveReminderPreference(
  override: PersistedReminderPreference | null | undefined,
  serverValue: PersistedReminderPreference | null
): PersistedReminderPreference | null {
  return override !== undefined ? override : serverValue;
}
