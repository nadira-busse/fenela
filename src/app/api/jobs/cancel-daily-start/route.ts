import { NextResponse } from "next/server";
import { getOptionalKvClient } from "@/lib/kv";
import { removeJobForDevice } from "@/lib/jobs";
import { getOptionalUser } from "@/server/auth/requireUser";
import { verifyOwnDevice } from "@/server/devices/verifyOwnDevice";

export const runtime = "nodejs";

const DAILY_START_POINTER_KEY = (deviceId: string) => `push:dailyStart:jobId:${deviceId}`;

export async function POST(req: Request) {
  try {
    const kv = getOptionalKvClient();

    if (!kv) {
      return NextResponse.json(
        {
          ok: false,
          error: "KV storage is not configured. Daily reminder could not be disabled.",
        },
        { status: 500 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as { deviceId?: string };
    const deviceId =
      typeof body.deviceId === "string" && body.deviceId.length > 0 ? body.deviceId : null;

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
          {
            ok: false,
            error: "This device is not linked to your account.",
          },
          { status: 403 }
        );
      }
    }

    const pointerKey = DAILY_START_POINTER_KEY(deviceId);
    const jobId = await kv.get<string>(pointerKey);

    if (jobId) {
      await removeJobForDevice(deviceId, jobId).catch(() => {});
    }

    await kv.del(pointerKey);

    return NextResponse.json({
      ok: true,
      disabled: true,
      deviceId,
      cancelledJobId: jobId ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
