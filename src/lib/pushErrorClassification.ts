// Classifies a rejected web-push sendNotification() error (Phase 4D
// hardening §4) into:
//
//   TERMINAL_INVALID_SUBSCRIPTION — the push service has confirmed the
//   endpoint no longer exists (HTTP 404/410, per web-push's own documented
//   semantics: https://github.com/web-push-libs/web-push#send-notification-1).
//   Only this case justifies deleting the user's subscription.
//
//   NON_TERMINAL — everything else: network errors, 429 rate limiting,
//   5xx, a malformed/expired VAPID configuration (401/403), or any other
//   status. These reflect a problem with this attempt or this app's
//   configuration, not evidence the subscription itself is invalid, so
//   they must never delete it.
//
// Uses the typed statusCode web-push's own WebPushError carries, not a
// string-matched guess.

import { WebPushError } from "web-push";

export type PushErrorClassification = "TERMINAL_INVALID_SUBSCRIPTION" | "NON_TERMINAL";

const TERMINAL_STATUS_CODES = new Set([404, 410]);

export function classifyPushError(error: unknown): PushErrorClassification {
  if (error instanceof WebPushError && TERMINAL_STATUS_CODES.has(error.statusCode)) {
    return "TERMINAL_INVALID_SUBSCRIPTION";
  }

  return "NON_TERMINAL";
}
