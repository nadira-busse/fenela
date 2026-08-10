import { describe, expect, it, vi, beforeEach } from "vitest";
import { WebPushError } from "web-push";

const { getKvClient } = vi.hoisted(() => ({ getKvClient: vi.fn() }));
vi.mock("@/lib/kv", () => ({ getKvClient }));

const { getDueJobIdsForDevice, getJobForDevice, removeJobForDevice, storeJobForDevice, makeJob } =
  vi.hoisted(() => ({
    getDueJobIdsForDevice: vi.fn(),
    getJobForDevice: vi.fn(),
    removeJobForDevice: vi.fn(),
    storeJobForDevice: vi.fn(),
    makeJob: vi.fn((input: Record<string, unknown>) => ({
      ...input,
      id: "next-job-id",
      attempts: 0,
    })),
  }));
vi.mock("@/lib/jobs", () => ({
  DEVICES_SET_KEY: "push:devices:set",
  getDueJobIdsForDevice,
  getJobForDevice,
  removeJobForDevice,
  storeJobForDevice,
  makeJob,
}));

const { sendPush } = vi.hoisted(() => ({ sendPush: vi.fn() }));
vi.mock("@/lib/pushSend", () => ({ sendPush }));

const { deletePushSubscriptionByDeviceId } = vi.hoisted(() => ({
  deletePushSubscriptionByDeviceId: vi.fn(),
}));
vi.mock("@/server/devices/deletePushSubscriptionByDeviceId", () => ({
  deletePushSubscriptionByDeviceId,
}));

process.env.CRON_SECRET = "test-cron-secret";

import { GET } from "./route";

function makeCronRequest() {
  return new Request("http://localhost/api/cron/push", {
    headers: { authorization: "Bearer test-cron-secret" },
  });
}

function makeSub() {
  return { endpoint: "https://push.example.com/x", keys: { p256dh: "a", auth: "b" } };
}

describe("GET /api/cron/push", () => {
  let kvGet: ReturnType<typeof vi.fn>;
  let kvSet: ReturnType<typeof vi.fn>;
  let kvDel: ReturnType<typeof vi.fn>;
  let kvSrem: ReturnType<typeof vi.fn>;
  let kvSmembers: ReturnType<typeof vi.fn>;
  let kvZrange: ReturnType<typeof vi.fn>;

  const DAILY_JOB = {
    id: "due-job-1",
    dueAt: 0,
    kind: "DAILY_START" as const,
    payload: { title: "Fenéla", body: "Start", url: "/" },
    attempts: 0,
    meta: { startTime: "08:00", timeZone: "America/Los_Angeles" },
  };

  const TASK_REMINDER_JOB = {
    id: "due-job-2",
    dueAt: 0,
    kind: "TASK_REMINDER" as const,
    payload: { title: "Fenéla", body: "Check in", url: "/" },
    attempts: 0,
  };

  beforeEach(() => {
    getDueJobIdsForDevice.mockReset();
    getJobForDevice.mockReset();
    removeJobForDevice.mockReset().mockResolvedValue(undefined);
    storeJobForDevice.mockReset().mockResolvedValue(undefined);
    makeJob.mockClear();
    sendPush.mockReset();
    deletePushSubscriptionByDeviceId.mockReset().mockResolvedValue({ ok: true });

    kvGet = vi.fn((key: string) => Promise.resolve(key.startsWith("push:sub:") ? makeSub() : null));
    kvSet = vi.fn().mockResolvedValue(undefined);
    kvDel = vi.fn().mockResolvedValue(undefined);
    kvSrem = vi.fn().mockResolvedValue(undefined);
    kvSmembers = vi.fn().mockResolvedValue(["device-1"]);
    kvZrange = vi.fn().mockResolvedValue([]);

    getKvClient.mockReturnValue({
      get: kvGet,
      set: kvSet,
      del: kvDel,
      srem: kvSrem,
      smembers: kvSmembers,
      zrange: kvZrange,
    });
  });

  it("terminal failure (410): removes KV subscription, device jobs/pointers, and invokes DB cleanup", async () => {
    getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
    getJobForDevice.mockResolvedValue(DAILY_JOB);
    sendPush.mockRejectedValue(new WebPushError("gone", 410, {} as never, "", "https://x"));

    const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
    const data = await response.json();

    expect(data.terminalFailures).toBe(1);
    expect(data.transientFailures).toBe(0);
    expect(kvDel).toHaveBeenCalledWith("push:sub:device-1");
    expect(kvSrem).toHaveBeenCalledWith("push:devices:set", "device-1");
    expect(deletePushSubscriptionByDeviceId).toHaveBeenCalledWith("device-1");
    // No rescheduling for a terminal failure — the subscription is dead.
    expect(storeJobForDevice).not.toHaveBeenCalled();
  });

  it("terminal failure (404): same terminal cleanup behavior as 410", async () => {
    getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
    getJobForDevice.mockResolvedValue(DAILY_JOB);
    sendPush.mockRejectedValue(new WebPushError("not found", 404, {} as never, "", "https://x"));

    const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
    const data = await response.json();

    expect(data.terminalFailures).toBe(1);
    expect(kvDel).toHaveBeenCalledWith("push:sub:device-1");
    expect(deletePushSubscriptionByDeviceId).toHaveBeenCalledWith("device-1");
  });

  it("surfaces a DB cleanup failure in the response instead of silently pretending cleanup fully succeeded", async () => {
    getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
    getJobForDevice.mockResolvedValue(DAILY_JOB);
    sendPush.mockRejectedValue(new WebPushError("gone", 410, {} as never, "", "https://x"));
    deletePushSubscriptionByDeviceId.mockResolvedValue({ ok: false, message: "db unavailable" });

    const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
    const data = await response.json();

    // KV cleanup still proceeds even though DB cleanup failed (documented trade-off).
    expect(kvDel).toHaveBeenCalledWith("push:sub:device-1");
    expect(data.dbCleanupErrors).toContain("db unavailable");
  });

  it("non-terminal failure (500): does not delete the KV subscription or invoke DB cleanup, and reschedules the next DAILY_START occurrence", async () => {
    getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
    getJobForDevice.mockResolvedValue(DAILY_JOB);
    sendPush.mockRejectedValue(new WebPushError("server error", 500, {} as never, "", "https://x"));

    const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
    const data = await response.json();

    expect(data.transientFailures).toBe(1);
    expect(data.terminalFailures).toBe(0);
    expect(kvDel).not.toHaveBeenCalledWith("push:sub:device-1");
    expect(deletePushSubscriptionByDeviceId).not.toHaveBeenCalled();
    // The recurring daily reminder must still be scheduled going forward.
    expect(storeJobForDevice).toHaveBeenCalled();
    expect(data.dailyRescheduled).toBe(1);
  });

  it("non-terminal failure (429): preserves the subscription", async () => {
    getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
    getJobForDevice.mockResolvedValue(DAILY_JOB);
    sendPush.mockRejectedValue(new WebPushError("rate limited", 429, {} as never, "", "https://x"));

    const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
    const data = await response.json();

    expect(data.transientFailures).toBe(1);
    expect(kvDel).not.toHaveBeenCalledWith("push:sub:device-1");
    expect(deletePushSubscriptionByDeviceId).not.toHaveBeenCalled();
  });

  it("non-terminal failure (network/unknown error): preserves the subscription and does not reschedule for a one-shot TASK_REMINDER", async () => {
    getDueJobIdsForDevice.mockResolvedValue(["due-job-2"]);
    getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
    sendPush.mockRejectedValue(new Error("fetch failed"));

    const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
    const data = await response.json();

    expect(data.transientFailures).toBe(1);
    expect(kvDel).not.toHaveBeenCalledWith("push:sub:device-1");
    expect(deletePushSubscriptionByDeviceId).not.toHaveBeenCalled();
    // TASK_REMINDER is one-shot best-effort — no reschedule/retry.
    expect(storeJobForDevice).not.toHaveBeenCalled();
    // The due job is still removed so it isn't retried indefinitely.
    expect(removeJobForDevice).toHaveBeenCalledWith("device-1", "due-job-2");
  });
});
