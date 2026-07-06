import { NextResponse } from "next/server";
import { getOptionalKvClient } from "@/lib/kv";
import { DEVICES_SET_KEY, makeJob, storeJobForDevice } from "@/lib/jobs";

export const runtime = "nodejs";

type Body = {
  deviceId: string;
  dueInMs?: number;
  payload?: {
    title?: string;
    body?: string;
    url?: string;
  };
};

export async function POST(req: Request) {
  try {
    const kv = getOptionalKvClient();

    if (!kv) {
      return NextResponse.json({
        ok: false,
        remindersEnabled: false,
        error: "KV storage is not configured. Reminder scheduling was skipped.",
      });
    }

    const body = (await req.json().catch(() => ({}))) as Body;

    const deviceId =
      typeof body.deviceId === "string" && body.deviceId.length > 0 ? body.deviceId : null;

    if (!deviceId) {
      return NextResponse.json({ ok: false, error: "Missing deviceId" }, { status: 400 });
    }

    await kv.sadd(DEVICES_SET_KEY, deviceId);

    const dueInMs =
      typeof body.dueInMs === "number" && body.dueInMs > 0 ? body.dueInMs : 30 * 60 * 1000;

    const dueAt = Date.now() + dueInMs;

    const job = makeJob({
      dueAt,
      kind: "TASK_REMINDER",
      payload: {
        title: body.payload?.title ?? "Fenéla",
        body: body.payload?.body ?? "Quick check-in: did you do it?",
        url: body.payload?.url ?? "/",
      },
    });

    await storeJobForDevice(deviceId, job);

    return NextResponse.json({ ok: true, jobId: job.id, dueAt, deviceId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    return NextResponse.json({
      ok: false,
      remindersEnabled: false,
      error: message,
    });
  }
}
