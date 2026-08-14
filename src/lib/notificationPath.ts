// Validates a same-origin path carried in a push notification's payload
// before it's used as a notificationclick navigation target
// (public/sw.js). Deliberately not a re-export of
// src/lib/auth/safeRedirect.ts's safeRedirectPath: that helper is scoped
// to the auth redirect flow, and public/sw.js is a classic (non-module)
// service worker script — see its registration in
// src/app/HomeClient.tsx's registerSWOnce (no `{ type: "module" }`) —
// which cannot import any TypeScript/ES module at all, so it needs its
// own small inline copy of this exact logic regardless of what this file
// exports. This file exists so that inline copy has a single, tested
// source of truth to stay in sync with, rather than an unverified
// duplicate.
//
// Mirrors safeRedirectPath's validation bar: a single, relative,
// same-origin path starting with exactly one "/", never "//" or "\"
// (which some browsers normalize to a protocol-relative URL), and never
// containing "://".

const SAFE_PATH_PATTERN = /^\/(?!\/|\\)\S*$/;

export function safeNotificationPath(candidate: unknown, fallback = "/"): string {
  if (typeof candidate !== "string" || candidate.length === 0) {
    return fallback;
  }

  if (!SAFE_PATH_PATTERN.test(candidate)) {
    return fallback;
  }

  if (candidate.includes("://")) {
    return fallback;
  }

  return candidate;
}
