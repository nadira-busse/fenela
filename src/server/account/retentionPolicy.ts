// Fenéla's 12-month inactivity retention policy (Phase 4H, hardened).
// This is a Fenéla product/data-retention policy — a chosen
// storage-limitation boundary, not a period the GDPR/AVG itself
// prescribes for this product. See docs/product/privacy-data-lifecycle.md
// for the user-facing explanation.
//
// Deliberately a named, server-only constant rather than an inline literal
// scattered across the enumeration/batch code, and deliberately not an
// environment variable — this is product policy, not deployment-specific
// secret/config, so there is no real deployment reason to make it
// overridable per environment.
export const ACCOUNT_INACTIVITY_RETENTION_MONTHS = 12;

// Subtracts `months` from `instant` using explicit UTC calendar-month
// arithmetic with day clamping — never the host/browser timezone, and
// never JS Date's own month-overflow normalization. When the resulting
// month has fewer days than `instant`'s day-of-month (the one real edge
// case here: subtracting 12 months from a leap-year February 29th lands
// on a non-leap February, which has no 29th), the result is clamped to
// the last valid day of that month:
//   2028-02-29T12:34:56Z minus 12 months -> 2027-02-28T12:34:56Z
// NOT rolled forward into March. This matches how calendar-month
// subtraction is commonly understood ("the same date last year, or the
// last day of that month if it doesn't exist") and needs no added date
// library — Date.UTC is still the only date primitive used, just without
// relying on its overflow behavior.
function subtractUtcMonths(instant: Date, months: number): Date {
  const year = instant.getUTCFullYear();
  const month = instant.getUTCMonth();
  const day = instant.getUTCDate();

  const totalMonths = year * 12 + month - months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;

  // Day 0 of the month after targetMonth is the last day of targetMonth.
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, daysInTargetMonth);

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      clampedDay,
      instant.getUTCHours(),
      instant.getUTCMinutes(),
      instant.getUTCSeconds(),
      instant.getUTCMilliseconds()
    )
  );
}

function parseValidDate(iso: string | null | undefined): Date | null {
  if (!iso) {
    return null;
  }

  const parsed = new Date(iso);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Resolves the more recent of the two available activity signals. Either
// input may legitimately be absent/malformed without invalidating the
// other: a user with no user_preferences row yet has no last_active_at at
// all (not an error), and this must not suppress a perfectly valid
// last_sign_in_at. Returns null only when NEITHER source yields a valid
// instant — the caller must treat that as "no positive activity signal,"
// never as "definitely inactive."
function resolveEffectiveLastActivity(
  lastSignInAtIso: string | null | undefined,
  lastActiveAtIso: string | null | undefined
): Date | null {
  const lastSignInAt = parseValidDate(lastSignInAtIso);
  const lastActiveAt = parseValidDate(lastActiveAtIso);

  if (lastSignInAt && lastActiveAt) {
    return lastSignInAt.getTime() >= lastActiveAt.getTime() ? lastSignInAt : lastActiveAt;
  }

  return lastSignInAt ?? lastActiveAt;
}

// Pure and deterministic by design: no `new Date()` inside this function —
// every caller (production and tests alike) must supply `referenceInstant`
// explicitly, so retention eligibility is always reproducible from its
// inputs alone.
//
// Two independent activity sources feed this decision (Phase 4H
// hardening):
//   - `lastSignInAtIso`: Supabase Auth's own `User.last_sign_in_at` — a
//     safe baseline that only advances on a new sign-in event;
//   - `lastActiveAtIso`: `user_preferences.last_active_at` — a
//     server-written timestamp touched on every normal authenticated root
//     load (src/app/root/touchOwnActivity.ts), which keeps a still-valid
//     session that never re-signs-in from looking falsely inactive.
// The effective signal is whichever of the two is more recent — a device
// timestamp (`devices.last_seen_at`) never participates, because it is
// only touched by the push/device-subscription path, not by normal
// authenticated use (Phase 4H hardening).
//
// Missing/malformed input on EITHER source alone never suppresses the
// other (see resolveEffectiveLastActivity). Only when neither source
// yields a valid instant is the result treated as NOT expired: destructive
// account deletion must never be triggered by the *absence* of a positive
// "this account is inactive" signal. This is a deliberate fail-closed
// default, not an oversight.
//
// Threshold semantics: "at least 12 months before the reference instant"
// is inclusive — an effective activity instant that lands exactly on
// referenceInstant minus 12 calendar months (to the UTC millisecond)
// counts as expired, not one moment later.
export function isInactiveAccountExpired(
  lastSignInAtIso: string | null | undefined,
  lastActiveAtIso: string | null | undefined,
  referenceInstant: Date
): boolean {
  const effectiveLastActivity = resolveEffectiveLastActivity(lastSignInAtIso, lastActiveAtIso);

  if (!effectiveLastActivity) {
    return false;
  }

  const threshold = subtractUtcMonths(referenceInstant, ACCOUNT_INACTIVITY_RETENTION_MONTHS);

  return effectiveLastActivity.getTime() <= threshold.getTime();
}
