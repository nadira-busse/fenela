import { NextResponse } from "next/server";

import { removeJobForDevice } from "@/lib/jobs";
import { getOptionalUser } from "@/server/auth/requireUser";
import { verifyOwnDevice } from "@/server/devices/verifyOwnDevice";

export const runtime = "nodejs";

type Body = {
  deviceId: string;
  jobId: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Body>;

    const deviceId =
      typeof body.deviceId === "string" && body.deviceId.length > 0 ? body.deviceId : null;

    const jobId = typeof body.jobId === "string" && body.jobId.length > 0 ? body.jobId : null;

    if (!deviceId) {
      return NextResponse.json({ ok: false, error: "Missing deviceId" }, { status: 400 });
    }

    // Caller-supplied deviceId is not authorization proof (Phase 4D §9):
    // an authenticated request must operate only on a Device it owns.
    // Unauthenticated/legacy requests are unaffected.
    const user = await getOptionalUser();

    if (user) {
      const ownsDevice = await verifyOwnDevice(deviceId);

      if (!ownsDevice) {
        return NextResponse.json(
          { ok: false, error: "This device is not linked to your account." },
          { status: 403 }
        );
      }
    }

    if (!jobId) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    await removeJobForDevice(deviceId, jobId);

    return NextResponse.json({ ok: true, cancelled: true, jobId, deviceId });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
