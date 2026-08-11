// Shared system/cron request authorization (Phase 4H). Extracted from
// src/app/api/cron/push/route.ts's original private helper of the same
// name/behavior so the retention cron route (src/app/api/cron/retention/
// route.ts) can require the exact same Bearer-token boundary without a
// second, potentially-diverging copy of this check. Behavior is
// unchanged: still requires a non-empty CRON_SECRET server-side, still
// compares it against the request's `Authorization: Bearer <token>`
// header, still fails closed (false) whenever the secret is missing or the
// token does not match exactly.
//
// This is a server/system boundary, not a user-session boundary — it must
// never be satisfied by an authenticated user's session (requireUser()),
// only by possession of the shared CRON_SECRET configured for the
// scheduler that calls these routes.

export function isAuthorizedCronRequest(req: Request): boolean {
  const expectedSecret = process.env.CRON_SECRET?.trim();

  if (!expectedSecret) {
    return false;
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const receivedToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  return receivedToken === expectedSecret;
}
