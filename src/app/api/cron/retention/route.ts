// System-to-system entry point for the 12-month inactivity retention
// policy (Phase 4H). Consistent with the existing secured cron
// architecture (src/app/api/cron/push/route.ts): protected by the same
// CRON_SECRET Bearer-token boundary (src/lib/cronAuth.ts), not by an
// authenticated user session — this must never accept requireUser()-based
// authorization, since it is a system job that deletes OTHER users'
// accounts, not the caller's own.
//
// This route contains no retention/deletion logic of its own. It only
// authorizes the request and delegates to runAccountRetentionBatch(), the
// same batch runner that reuses Phase 4G's canonical deleteAccountForUser()
// for every expired account. See that module's header for batch failure
// isolation semantics.
//
// Not publicly callable (unauthorized -> 401, no enumeration, no
// deletion) and not reachable from any browser UI — there is no
// user-facing "run retention now" affordance anywhere in this repository.

import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import { runAccountRetentionBatch } from "@/server/account/runAccountRetentionBatch";

export const runtime = "nodejs";

function getErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;

  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json({ ok: false, error: "Missing CRON_SECRET" }, { status: 500 });
  }

  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAccountRetentionBatch(new Date());

    // Safe to log in full: runAccountRetentionBatch's result contains only
    // counts and, per failure, a user id + controlled stage/message — never
    // email addresses or any persisted free text (see that module's
    // header).
    console.log("cron.retention.result", result);

    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = getErrorMessage(err);

    console.error("cron.retention.failed", message);

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
