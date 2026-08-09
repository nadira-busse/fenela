// Browser IANA timezone detection for initial user_preferences.time_zone
// capture. Deliberately does not derive a timezone from locale — locale and
// timezone are different concepts and conflating them produces wrong data
// (e.g. "en-US" says nothing about which US timezone).

export function getBrowserTimeZone(): string | null {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timeZone === "string" && timeZone.trim().length > 0 ? timeZone : null;
  } catch {
    return null;
  }
}
