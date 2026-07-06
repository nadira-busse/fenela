import { NextResponse } from "next/server";

import { removeJobForDevice } from "@/lib/jobs";

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

    if (!jobId) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    await removeJobForDevice(deviceId, jobId);

    return NextResponse.json({ ok: true, cancelled: true, jobId, deviceId });
  } catch (error: unknown) {
    return NextResponse.json({ ok: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
