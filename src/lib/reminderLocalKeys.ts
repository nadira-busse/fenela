// Local storage keys for the Coaching Reminder Settings compatibility
// cache (src/app/components/CoachingScreen.tsx). Extracted so
// src/lib/localOwner.ts's explicit sign-out cleanup (Phase 4D final
// hardening §10/§11) can remove them without duplicating the literal key
// strings or creating a reverse dependency from lib code onto a UI
// component.
export const DAILY_REMINDER_TIME_KEY = "fenela:dailyReminder:startTime";
export const DAILY_REMINDERS_ENABLED_KEY = "fenela:dailyReminder:enabled";
