// Shared system/cron request authorization used by both push and retention
// routes so they enforce one Bearer-token boundary. Requires a non-empty
// server-side CRON_SECRET, compares it with the request's
// `Authorization: Bearer <token>` header, and fails closed when the secret
// is missing or the token does not match exactly.
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
