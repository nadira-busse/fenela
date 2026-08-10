import HomeClient from "./HomeClient";
import { getOptionalUser } from "@/server/auth/requireUser";
import { getOwnUserPreference } from "@/server/preferences/getOwnUserPreference";
import { mapDbRowToScreeningFields } from "@/lib/userPreferenceMapping";
import { getActiveGoal } from "@/server/goals/getActiveGoal";
import { getOwnReminderPreference } from "@/server/reminders/getOwnReminderPreference";
import { mapDbStartTimeToAppFormat } from "@/lib/reminderPreferenceMapping";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getOptionalUser();
  const preferenceRow = user ? await getOwnUserPreference() : null;
  const dbPreference = preferenceRow ? mapDbRowToScreeningFields(preferenceRow) : null;
  const activeGoal = user ? await getActiveGoal() : null;
  const reminderPreferenceRow = user ? await getOwnReminderPreference() : null;
  const reminderPreference = reminderPreferenceRow
    ? {
        enabled: reminderPreferenceRow.enabled,
        startTime: mapDbStartTimeToAppFormat(reminderPreferenceRow.start_time),
      }
    : null;

  return (
    <HomeClient
      userId={user?.id ?? null}
      dbPreference={dbPreference}
      activeGoal={activeGoal}
      reminderPreference={reminderPreference}
    />
  );
}
