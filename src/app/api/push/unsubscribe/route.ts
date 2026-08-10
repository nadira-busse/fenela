// Authenticated push-detach boundary for sign-out (Phase 4D final
// hardening §4). Called only while a session still exists — logout order
// matters here (see src/app/auth/SignOutButton.tsx): this must run BEFORE
// Supabase signout, or Device ownership can no longer be verified.
//
// Never accepts a caller-supplied user_id; deviceId is only a record
// identifier, verified against the authenticated user's own ownership
// before anything is touched. Preserves the Device row itself — this
// detaches delivery state from a device the user still owns, it does not
// revoke or delete the device.

import { NextResponse } from "next/server";
import { requireUser, UnauthenticatedError } from "@/server/auth/requireUser";
import { verifyOwnDevice } from "@/server/devices/verifyOwnDevice";
import { deleteOwnPushSubscription } from "@/server/devices/deleteOwnPushSubscription";
import { cleanupOperationalPushState } from "@/lib/pushOperationalCleanup";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    try {
      await requireUser();
    } catch (error) {
      if (error instanceof UnauthenticatedError) {
        return NextResponse.json(
          { ok: false, error: "Your session expired. Please sign in again." },
          { status: 401 }
        );
      }

      throw error;
    }

    const body = (await req.json().catch(() => ({}))) as { deviceId?: string };
    const deviceId =
      typeof body.deviceId === "string" && body.deviceId.length > 0 ? body.deviceId : null;

    if (!deviceId) {
      return NextResponse.json({ ok: false, error: "Missing deviceId" }, { status: 400 });
    }

    // A caller-supplied deviceId is never authorization proof (Phase 4D
    // §9) — an unknown id and a foreign-owned id are deliberately
    // indistinguishable here (both a controlled 403), matching how
    // verifyOwnDevice is already used by the schedule/cancel routes.
    const ownsDevice = await verifyOwnDevice(deviceId);

    if (!ownsDevice) {
      return NextResponse.json(
        { ok: false, error: "This device is not linked to your account." },
        { status: 403 }
      );
    }

    await cleanupOperationalPushState(deviceId);

    const dbResult = await deleteOwnPushSubscription(deviceId);

    if (!dbResult.ok) {
      // Logged for debugging (Phase 4D final hardening §9) — the calling
      // client (SignOutButton) treats any non-success response as
      // best-effort and completes sign-out regardless.
      console.warn("push/unsubscribe: DB cleanup failed", {
        deviceId,
        message: dbResult.message,
      });

      return NextResponse.json({ ok: false, error: dbResult.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
