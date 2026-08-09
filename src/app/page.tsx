import HomeClient from "./HomeClient";
import { getOptionalUser } from "@/server/auth/requireUser";
import { getOwnUserPreference } from "@/server/preferences/getOwnUserPreference";
import { mapDbRowToScreeningFields } from "@/lib/userPreferenceMapping";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getOptionalUser();
  const preferenceRow = user ? await getOwnUserPreference() : null;
  const dbPreference = preferenceRow ? mapDbRowToScreeningFields(preferenceRow) : null;

  return <HomeClient userId={user?.id ?? null} dbPreference={dbPreference} />;
}
