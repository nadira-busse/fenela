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
// claimJobForDevice is deliberately the REAL implementation, not a mock —
// its whole purpose is exclusivity derived from the KV client's actual DEL
// return value (see src/lib/jobs.ts's own header). Mocking it directly
// here would hide exactly the real semantics these tests exist to prove;
// instead, every TASK_REMINDER claim scenario below is driven through the
// already-mocked raw kvDel/kvZrem (see beforeEach), with the real claim
// logic running unmocked on top of them.
vi.mock("@/lib/jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/jobs")>();
  return {
    DEVICES_SET_KEY: "push:devices:set",
    getDueJobIdsForDevice,
    getJobForDevice,
    removeJobForDevice,
    storeJobForDevice,
    makeJob,
    claimJobForDevice: actual.claimJobForDevice,
  };
});

const { sendPush } = vi.hoisted(() => ({ sendPush: vi.fn() }));
vi.mock("@/lib/pushSend", () => ({ sendPush }));

const { deletePushSubscriptionByDeviceId } = vi.hoisted(() => ({
  deletePushSubscriptionByDeviceId: vi.fn(),
}));
vi.mock("@/server/devices/deletePushSubscriptionByDeviceId", () => ({
  deletePushSubscriptionByDeviceId,
}));

const { getReminderEnabledForDevice } = vi.hoisted(() => ({
  getReminderEnabledForDevice: vi.fn(),
}));
vi.mock("@/server/reminders/getReminderEnabledForDevice", () => ({
  getReminderEnabledForDevice,
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
  let kvZrem: ReturnType<typeof vi.fn>;
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
    // Default: canonical reminder intent is enabled — matches every
    // pre-existing test's implicit assumption (they exercise push-result
    // classification, not the canonical-intent guard itself), so those tests don't
    // need to know the guard exists unless they're specifically testing it.
    getReminderEnabledForDevice.mockReset().mockResolvedValue({ ok: true, enabled: true });

    kvGet = vi.fn((key: string) => Promise.resolve(key.startsWith("push:sub:") ? makeSub() : null));
    kvSet = vi.fn().mockResolvedValue(undefined);
    // Real Redis DEL returns the count of keys actually removed. `1` is the
    // correct default for the common single-invocation case every existing
    // test here implicitly assumes (claimJobForDevice — see @/lib/jobs —
    // now runs for real against this mock for TASK_REMINDER jobs); a test
    // that specifically needs a lost claim overrides this with `0`, and a
    // claim-infrastructure-error test overrides it with a rejection.
    kvDel = vi.fn().mockResolvedValue(1);
    kvZrem = vi.fn().mockResolvedValue(undefined);
    kvSrem = vi.fn().mockResolvedValue(undefined);
    kvSmembers = vi.fn().mockResolvedValue(["device-1"]);
    kvZrange = vi.fn().mockResolvedValue([]);

    getKvClient.mockReturnValue({
      get: kvGet,
      set: kvSet,
      del: kvDel,
      zrem: kvZrem,
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

  it("non-terminal failure (network/unknown error): claims and sends once, counts the failure, and never re-creates the job for a retry", async () => {
    getDueJobIdsForDevice.mockResolvedValue(["due-job-2"]);
    getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
    sendPush.mockRejectedValue(new Error("fetch failed"));

    const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
    const data = await response.json();

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(data.transientFailures).toBe(1);
    expect(data.pushErrors).toEqual(["fetch failed"]);
    expect(kvDel).not.toHaveBeenCalledWith("push:sub:device-1");
    expect(deletePushSubscriptionByDeviceId).not.toHaveBeenCalled();
    // Final TASK_REMINDER semantic: at most one application send attempt.
    // A non-terminal/ambiguous failure never re-creates the claimed job.
    expect(storeJobForDevice).not.toHaveBeenCalled();
    // TASK_REMINDER is claimed (via
    // claimJobForDevice's exclusive DEL) BEFORE sendPush is attempted, so
    // this job WAS claimed once, before the send that then failed.
    expect(kvDel).toHaveBeenCalledWith("push:job:device-1:due-job-2");
    expect(kvZrem).toHaveBeenCalledWith("push:jobs:device-1:zset", "due-job-2");
  });

  it("includes the provider's real HTTP status in pushErrors instead of only the generic message", async () => {
    getDueJobIdsForDevice.mockResolvedValue(["due-job-2"]);
    getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
    sendPush.mockRejectedValue(
      new WebPushError("Received unexpected response code", 500, {} as never, "", "https://x")
    );

    const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
    const data = await response.json();

    expect(data.pushErrors[0]).toContain("HTTP 500");
  });

  it("success: sends exactly once via the winning claim and never touches storeJobForDevice", async () => {
    getDueJobIdsForDevice.mockResolvedValue(["due-job-2"]);
    getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
    sendPush.mockResolvedValue(undefined);

    const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
    const data = await response.json();

    expect(sendPush).toHaveBeenCalledTimes(1);
    expect(data.processed).toBe(1);
    expect(kvDel).toHaveBeenCalledWith("push:job:device-1:due-job-2");
    expect(storeJobForDevice).not.toHaveBeenCalled();
  });

  describe("DAILY_START canonical-intent guard", () => {
    it("discards a stale DAILY_START job without sending or rescheduling when reminders are disabled", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: false });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(sendPush).not.toHaveBeenCalled();
      expect(storeJobForDevice).not.toHaveBeenCalled();
      expect(removeJobForDevice).toHaveBeenCalledWith("device-1", "due-job-1");
      expect(data.cleanedDisabledDailyStart).toBe(1);
      expect(data.dailyRescheduled).toBe(0);
      expect(data.processed).toBe(0);
    });

    it("catches a stale pointer-less DAILY_START job with the intent guard", async () => {
      // The pointer key is absent, as an incomplete cancellation can leave
      // it, so the
      // existing pointer-mismatch check (`pointerJobId && id !== pointerJobId`)
      // cannot fire because `pointerJobId` itself is falsy. The canonical
      // intent guard must still stop the stale job from reaching sendPush.
      kvGet.mockImplementation((key: string) => {
        if (key.startsWith("push:sub:")) return Promise.resolve(makeSub());
        if (key.startsWith("push:dailyStart:jobId:")) return Promise.resolve(null);
        return Promise.resolve(null);
      });
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: false });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(sendPush).not.toHaveBeenCalled();
      expect(data.cleanedPointerMismatch).toBe(0);
      expect(data.cleanedDisabledDailyStart).toBe(1);
      expect(removeJobForDevice).toHaveBeenCalledWith("device-1", "due-job-1");
    });

    it("sends and reschedules DAILY_START normally when reminders are enabled", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: true });
      sendPush.mockResolvedValue(undefined);

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(data.processed).toBe(1);
      expect(data.dailyRescheduled).toBe(1);
      expect(storeJobForDevice).toHaveBeenCalled();
      expect(data.cleanedDisabledDailyStart).toBe(0);
    });

    it("leaves the job untouched and continues the run when canonical preference cannot be read", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      getReminderEnabledForDevice.mockResolvedValue({ ok: false, message: "connection reset" });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(sendPush).not.toHaveBeenCalled();
      expect(storeJobForDevice).not.toHaveBeenCalled();
      // Left in place — neither sent, rescheduled, nor removed — so a
      // later run can re-verify once Supabase recovers.
      expect(removeJobForDevice).not.toHaveBeenCalled();
      expect(data.dailyStartVerificationFailures).toBe(1);
      expect(data.cleanedDisabledDailyStart).toBe(0);
    });

    it("isolates one device's verification failure from another device's DAILY_START job", async () => {
      kvSmembers.mockResolvedValue(["device-broken", "device-fine"]);
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      getReminderEnabledForDevice.mockImplementation(async (deviceId: string) => {
        if (deviceId === "device-broken") {
          return { ok: false, message: "connection reset" };
        }
        return { ok: true, enabled: true };
      });
      sendPush.mockResolvedValue(undefined);

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(data.dailyStartVerificationFailures).toBe(1);
      expect(data.processed).toBe(1);
      expect(sendPush).toHaveBeenCalledTimes(1);
    });

    it("with a pointer present, checks only the matching job against canonical intent and discards mismatches without a Supabase read", async () => {
      kvGet.mockImplementation((key: string) => {
        if (key.startsWith("push:sub:")) return Promise.resolve(makeSub());
        if (key.startsWith("push:dailyStart:jobId:")) return Promise.resolve("due-job-1");
        return Promise.resolve(null);
      });
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1", "due-job-1b"]);
      getJobForDevice.mockImplementation((deviceId: string, id: string) =>
        Promise.resolve({ ...DAILY_JOB, id })
      );
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: false });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      // Only the pointer-matching job ("due-job-1") is ever authorized
      // against canonical intent; "due-job-1b" is discarded as a pointer
      // mismatch before any Supabase read is attempted for it.
      expect(getReminderEnabledForDevice).toHaveBeenCalledTimes(1);
      expect(getReminderEnabledForDevice).toHaveBeenCalledWith("device-1");
      expect(data.cleanedPointerMismatch).toBe(1);
      expect(data.cleanedDisabledDailyStart).toBe(1);
    });

    it("leaves nothing to process after cleaning a disabled DAILY_START job", async () => {
      getDueJobIdsForDevice.mockResolvedValueOnce(["due-job-1"]).mockResolvedValueOnce([]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: false });

      const first = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const firstData = await first.json();
      expect(firstData.cleanedDisabledDailyStart).toBe(1);
      expect(removeJobForDevice).toHaveBeenCalledTimes(1);

      const second = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const secondData = await second.json();

      expect(secondData.cleanedDisabledDailyStart).toBe(0);
      expect(secondData.dueIdCount).toBe(0);
      expect(sendPush).not.toHaveBeenCalled();
      // Cleanup itself was not repeated a second time — nothing was left
      // to clean.
      expect(removeJobForDevice).toHaveBeenCalledTimes(1);
    });
  });

  describe("DAILY_START reschedule uses a fresh, separate canonical check", () => {
    it("creates the next job when both send and reschedule checks find reminders enabled", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: true });
      sendPush.mockResolvedValue(undefined);

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(getReminderEnabledForDevice).toHaveBeenCalledTimes(2);
      expect(getReminderEnabledForDevice).toHaveBeenNthCalledWith(1, "device-1");
      expect(getReminderEnabledForDevice).toHaveBeenNthCalledWith(2, "device-1");
      expect(data.processed).toBe(1);
      expect(data.dailyRescheduled).toBe(1);
      expect(storeJobForDevice).toHaveBeenCalled();
      expect(data.dailyStartRescheduleSkippedDisabled).toBe(0);
      expect(data.dailyStartRescheduleVerificationFailures).toBe(0);
    });

    it("counts the sent push but creates no new job when reminders are disabled before rescheduling", async () => {
      // An existing, already-matching pointer — this test is about the
      // reschedule-time fresh check specifically, not singleton
      // resolution, so the job is unambiguously authorized from the start.
      kvGet.mockImplementation((key: string) => {
        if (key.startsWith("push:sub:")) return Promise.resolve(makeSub());
        if (key.startsWith("push:dailyStart:jobId:")) return Promise.resolve("due-job-1");
        return Promise.resolve(null);
      });
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      sendPush.mockResolvedValue(undefined);
      // First call = the send-authorization check (true). Second call = the
      // fresh, separate reschedule check, made only after sendPush has
      // already resolved — simulating the user disabling reminders in that
      // exact window.
      getReminderEnabledForDevice
        .mockResolvedValueOnce({ ok: true, enabled: true })
        .mockResolvedValueOnce({ ok: true, enabled: false });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(sendPush).toHaveBeenCalledTimes(1);
      // The current notification was already, correctly, sent — disabling
      // reminders afterward must never retroactively un-count it.
      expect(data.processed).toBe(1);
      expect(data.dailyRescheduled).toBe(0);
      expect(data.dailyStartRescheduleSkippedDisabled).toBe(1);
      expect(storeJobForDevice).not.toHaveBeenCalled();
      expect(kvSet).not.toHaveBeenCalledWith("push:dailyStart:jobId:device-1", expect.anything());
    });

    it("counts the sent push and isolates a pre-reschedule lookup failure", async () => {
      kvSmembers.mockResolvedValue(["device-a", "device-b"]);
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice.mockImplementation(async (deviceId: string) => {
        if (deviceId === "device-a") {
          // First call (send check) succeeds; second call (reschedule
          // check) fails — modeled with a per-device call counter.
          const calls = getReminderEnabledForDevice.mock.calls.filter(
            (c: unknown[]) => c[0] === "device-a"
          ).length;
          return calls <= 1
            ? { ok: true, enabled: true }
            : { ok: false, message: "connection reset" };
        }
        return { ok: true, enabled: true };
      });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(data.processed).toBe(2);
      // device-a: sent, but reschedule verification failed.
      expect(data.dailyStartRescheduleVerificationFailures).toBe(1);
      // device-b: fully normal — unaffected by device-a's failure.
      expect(data.dailyRescheduled).toBe(1);
    });

    it("clears the dangling pointer when reschedule is skipped for being disabled", async () => {
      kvGet.mockImplementation((key: string) => {
        if (key.startsWith("push:sub:")) return Promise.resolve(makeSub());
        if (key.startsWith("push:dailyStart:jobId:")) return Promise.resolve("due-job-1");
        return Promise.resolve(null);
      });
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice
        .mockResolvedValueOnce({ ok: true, enabled: true }) // send check
        .mockResolvedValueOnce({ ok: true, enabled: false }); // reschedule check: disabled

      await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);

      // The pointer still referenced "due-job-1", which was just removed —
      // left alone it would dangle. It matched, so it gets cleared.
      expect(kvDel).toHaveBeenCalledWith("push:dailyStart:jobId:device-1");
    });

    it("clears the dangling pointer when reschedule is skipped for a failed verification", async () => {
      kvGet.mockImplementation((key: string) => {
        if (key.startsWith("push:sub:")) return Promise.resolve(makeSub());
        if (key.startsWith("push:dailyStart:jobId:")) return Promise.resolve("due-job-1");
        return Promise.resolve(null);
      });
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice
        .mockResolvedValueOnce({ ok: true, enabled: true }) // send check
        .mockResolvedValueOnce({ ok: false, message: "connection reset" }); // reschedule check fails

      await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);

      expect(kvDel).toHaveBeenCalledWith("push:dailyStart:jobId:device-1");
    });

    it("never clears the pointer when it no longer matches the just-removed job (guards against clobbering a pointer a concurrent request already advanced)", async () => {
      // Singleton resolution reads the pointer once and finds it
      // matching "due-job-1" (authorizing it). By the time the
      // reschedule-skip path re-reads the pointer, it has advanced to a
      // different job id — e.g. an overlapping cron/schedule request.
      let pointerReadCount = 0;
      kvGet.mockImplementation((key: string) => {
        if (key.startsWith("push:sub:")) return Promise.resolve(makeSub());
        if (key.startsWith("push:dailyStart:jobId:")) {
          pointerReadCount++;
          return Promise.resolve(pointerReadCount === 1 ? "due-job-1" : "a-different-job-id");
        }
        return Promise.resolve(null);
      });
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice
        .mockResolvedValueOnce({ ok: true, enabled: true }) // send check
        .mockResolvedValueOnce({ ok: true, enabled: false }); // reschedule check: disabled

      await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);

      expect(kvDel).not.toHaveBeenCalledWith("push:dailyStart:jobId:device-1");
    });

    it("uses a fresh reschedule check instead of the send-time result", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice
        .mockResolvedValueOnce({ ok: true, enabled: true }) // send check
        .mockResolvedValueOnce({ ok: true, enabled: false }); // reschedule check

      await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);

      // If the implementation wrongly reused the first (cached) `true`
      // result for the reschedule decision, this call count would be 1,
      // not 2, and storeJobForDevice would have been called despite the
      // second mocked response being `enabled: false`.
      expect(getReminderEnabledForDevice).toHaveBeenCalledTimes(2);
      expect(storeJobForDevice).not.toHaveBeenCalled();
    });

    it("does not invoke the canonical-intent check for TASK_REMINDER jobs", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-2"]);
      getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
      sendPush.mockRejectedValue(new Error("fetch failed"));

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(getReminderEnabledForDevice).not.toHaveBeenCalled();
      expect(data.transientFailures).toBe(1);
      expect(storeJobForDevice).not.toHaveBeenCalled();
      expect(data.dailyStartRescheduleSkippedDisabled).toBe(0);
      expect(data.dailyStartRescheduleVerificationFailures).toBe(0);
    });

    it("leaves nothing for a later run when rescheduling is skipped after reminders are disabled", async () => {
      getDueJobIdsForDevice.mockResolvedValueOnce(["due-job-1"]).mockResolvedValueOnce([]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice
        .mockResolvedValueOnce({ ok: true, enabled: true })
        .mockResolvedValueOnce({ ok: true, enabled: false });

      const first = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const firstData = await first.json();
      expect(firstData.dailyStartRescheduleSkippedDisabled).toBe(1);
      expect(storeJobForDevice).not.toHaveBeenCalled();

      // Nothing was created, so a later run genuinely has no due job for
      // this device — not "cleaned up," simply never existed.
      const second = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const secondData = await second.json();
      expect(secondData.dueIdCount).toBe(0);
      expect(sendPush).toHaveBeenCalledTimes(1);
    });

    it("reschedules normally in a later run when both canonical-intent checks pass", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: true });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(data.dailyRescheduled).toBe(1);
      expect(storeJobForDevice).toHaveBeenCalled();
    });
  });

  describe("per-execution canonical intent authorization for multiple due DAILY_START jobs on one device", () => {
    const JOB_A = {
      ...DAILY_JOB,
      id: "due-job-a",
      payload: { title: "Fenéla", body: "Start (A)", url: "/" },
    };
    const JOB_B = {
      ...DAILY_JOB,
      id: "due-job-b",
      payload: { title: "Fenéla", body: "Start (B)", url: "/" },
    };

    function mockJobsAAndB() {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-a", "due-job-b"]);
      getJobForDevice.mockImplementation((deviceId: string, id: string) =>
        Promise.resolve(id === "due-job-a" ? JOB_A : JOB_B)
      );
    }

    it("with a pointer matching job A, discards job B and sends and reschedules only job A", async () => {
      kvGet.mockImplementation((key: string) => {
        if (key.startsWith("push:sub:")) return Promise.resolve(makeSub());
        if (key.startsWith("push:dailyStart:jobId:")) return Promise.resolve("due-job-a");
        return Promise.resolve(null);
      });
      mockJobsAAndB();
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: true });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      // Job B never even reaches a canonical-intent check — it is
      // discarded purely on the pointer mismatch, at zero Supabase cost.
      // Job A: 1 send check + 1 reschedule check = 2 calls total.
      expect(getReminderEnabledForDevice).toHaveBeenCalledTimes(2);
      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(sendPush).toHaveBeenCalledWith(expect.anything(), JOB_A.payload);
      expect(data.processed).toBe(1);
      expect(data.dailyRescheduled).toBe(1);
      expect(data.cleanedPointerMismatch).toBe(1);
      expect(removeJobForDevice).toHaveBeenCalledWith("device-1", "due-job-b");
    });

    it("preserves send and disable behavior for one due DAILY_START job without a per-device cache", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: true });

      const enabledResponse = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const enabledData = await enabledResponse.json();
      expect(enabledData.processed).toBe(1);
      expect(enabledData.dailyRescheduled).toBe(1);

      sendPush.mockClear();
      getReminderEnabledForDevice.mockReset().mockResolvedValue({ ok: true, enabled: false });

      const disabledResponse = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const disabledData = await disabledResponse.json();
      expect(sendPush).not.toHaveBeenCalled();
      expect(disabledData.cleanedDisabledDailyStart).toBe(1);
    });

    it("does not check canonical intent for TASK_REMINDER alongside a DAILY_START job", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-a", "due-job-2"]);
      getJobForDevice.mockImplementation((deviceId: string, id: string) =>
        Promise.resolve(id === "due-job-a" ? JOB_A : TASK_REMINDER_JOB)
      );
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: true });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      // Only the DAILY_START job triggers lookups (1 send + 1 reschedule);
      // the TASK_REMINDER job contributes none.
      expect(getReminderEnabledForDevice).toHaveBeenCalledTimes(2);
      expect(data.processed).toBe(2);
    });
  });

  describe("DAILY_START pointer-absent singleton resolution", () => {
    const JOB_A = {
      ...DAILY_JOB,
      id: "due-job-a",
      payload: { title: "Fenéla", body: "Start (A)", url: "/" },
    };
    const JOB_B = {
      ...DAILY_JOB,
      id: "due-job-b",
      payload: { title: "Fenéla", body: "Start (B)", url: "/" },
    };

    it("repairs an absent pointer when exactly one due DAILY_START job exists", async () => {
      // Default kvGet already returns null for the pointer key.
      getDueJobIdsForDevice.mockResolvedValue(["due-job-a"]);
      getJobForDevice.mockResolvedValue(JOB_A);
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: true });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      // The pointer-repair write happens before send; the reschedule write
      // (a different, later job id from `makeJob`'s mock) happens after.
      expect(kvSet).toHaveBeenCalledWith("push:dailyStart:jobId:device-1", "due-job-a");
      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(data.processed).toBe(1);
      expect(data.dailyRescheduled).toBe(1);
      expect(data.dailyStartPointerRepairFailures).toBe(0);
      expect(data.cleanedAmbiguousDailyStart).toBe(0);
    });

    it("discards multiple due DAILY_START jobs as ambiguous when the pointer is absent", async () => {
      // Default kvGet already returns null for the pointer key.
      getDueJobIdsForDevice.mockResolvedValue(["due-job-a", "due-job-b"]);
      getJobForDevice.mockImplementation((deviceId: string, id: string) =>
        Promise.resolve(id === "due-job-a" ? JOB_A : JOB_B)
      );
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: true });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      // Neither job is ever sent — ambiguity is resolved before any
      // canonical-intent check or send is attempted, regardless of what
      // that check would have said.
      expect(sendPush).not.toHaveBeenCalled();
      expect(getReminderEnabledForDevice).not.toHaveBeenCalled();
      expect(storeJobForDevice).not.toHaveBeenCalled();
      expect(data.processed).toBe(0);
      expect(data.dailyRescheduled).toBe(0);
      expect(data.cleanedAmbiguousDailyStart).toBe(2);
      expect(removeJobForDevice).toHaveBeenCalledWith("device-1", "due-job-a");
      expect(removeJobForDevice).toHaveBeenCalledWith("device-1", "due-job-b");
      // No pointer is written — the ambiguity is left for the user's next
      // explicit reminder-settings interaction to resolve cleanly.
      expect(kvSet).not.toHaveBeenCalledWith("push:dailyStart:jobId:device-1", expect.anything());
    });

    it("pointer absent, multiple due DAILY_START jobs, canonical lookup would have failed too — still discarded via ambiguity, never reaching (and therefore never blocked by) the canonical-intent check", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-a", "due-job-b"]);
      getJobForDevice.mockImplementation((deviceId: string, id: string) =>
        Promise.resolve(id === "due-job-a" ? JOB_A : JOB_B)
      );
      getReminderEnabledForDevice.mockResolvedValue({ ok: false, message: "connection reset" });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(sendPush).not.toHaveBeenCalled();
      expect(getReminderEnabledForDevice).not.toHaveBeenCalled();
      expect(data.dailyStartVerificationFailures).toBe(0);
      expect(data.cleanedAmbiguousDailyStart).toBe(2);
    });

    it("prevents a later DAILY_START job from observing a rescheduled job's new pointer", async () => {
      // Three due DAILY_START-shaped ids, no pointer. Under the old
      // per-job-interleaved design this could reproduce duplicate delivery
      // (job A reschedules mid-loop, creating a new pointer a hypothetical
      // "job B" processed afterward would incorrectly ignore). Under the
      // new design there is no "later DAILY_START job" left to observe
      // anything — every candidate is resolved in one decision before any
      // of them can act.
      getDueJobIdsForDevice.mockResolvedValue(["due-job-a", "due-job-b", "due-job-c"]);
      getJobForDevice.mockImplementation((deviceId: string, id: string) =>
        Promise.resolve({ ...DAILY_JOB, id })
      );
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: true });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(sendPush).not.toHaveBeenCalled();
      expect(data.dailyRescheduled).toBe(0);
      expect(data.cleanedAmbiguousDailyStart).toBe(3);
    });

    it("retry: after a pointer-repair failure, a later run with KV recovered can repair the pointer and proceed normally", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-a"]);
      getJobForDevice.mockResolvedValue(JOB_A);
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: true });
      kvSet.mockRejectedValueOnce(new Error("kv unavailable"));

      const first = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const firstData = await first.json();
      expect(firstData.dailyStartPointerRepairFailures).toBe(1);
      expect(sendPush).not.toHaveBeenCalled();

      // kvSet recovers for the retry; the same due job is still there
      // (never removed on a repair failure) and can now have its pointer repaired.
      kvSet.mockResolvedValue(undefined);

      const retry = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const retryData = await retry.json();
      expect(retryData.dailyStartPointerRepairFailures).toBe(0);
      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(retryData.processed).toBe(1);
    });
  });

  describe("delivery boundary versus post-delivery cleanup boundary", () => {
    it("processes a successful TASK_REMINDER without retry or push error", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-2"]);
      getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
      sendPush.mockResolvedValue(undefined);

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(data.processed).toBe(1);
      expect(storeJobForDevice).not.toHaveBeenCalled();
      expect(data.transientFailures).toBe(0);
      expect(data.pushErrors).toEqual([]);
      expect(data.postDeliveryCleanupFailures).toBe(0);
      expect(kvDel).toHaveBeenCalledWith("push:job:device-1:due-job-2");
    });

    it("claims TASK_REMINDER with DEL before sending and never performs post-send removal", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-2"]);
      getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
      sendPush.mockResolvedValue(undefined);

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(data.processed).toBe(1);
      expect(data.postDeliveryCleanupFailures).toBe(0);
      // TASK_REMINDER never calls removeJobForDevice at all — claiming
      // (DEL) happened once, before send, not after.
      expect(removeJobForDevice).not.toHaveBeenCalled();
      expect(kvDel).toHaveBeenCalledTimes(1);
    });

    it("counts one TASK_REMINDER transient failure without recreating a retry", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-2"]);
      getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
      sendPush.mockRejectedValue(new Error("fetch failed"));

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(data.transientFailures).toBe(1);
      expect(data.pushErrors).toEqual(["fetch failed"]);
      expect(storeJobForDevice).not.toHaveBeenCalled();
      expect(data.processed).toBe(0);
      expect(data.postDeliveryCleanupFailures).toBe(0);
    });

    it("cleans an invalid subscription after a terminal TASK_REMINDER push failure", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-2"]);
      getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
      sendPush.mockRejectedValue(new WebPushError("gone", 410, {} as never, "", "https://x"));

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(data.terminalFailures).toBe(1);
      expect(deletePushSubscriptionByDeviceId).toHaveBeenCalledWith("device-1");
      expect(data.processed).toBe(0);
      expect(data.postDeliveryCleanupFailures).toBe(0);
    });

    it("counts a successful DAILY_START send and reschedules when post-delivery cleanup fails", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: true });
      removeJobForDevice.mockRejectedValue(new Error("kv unavailable"));

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(data.processed).toBe(1);
      expect(data.transientFailures).toBe(0);
      expect(data.terminalFailures).toBe(0);
      expect(data.pushErrors).toEqual([]);
      expect(data.postDeliveryCleanupFailures).toBe(1);
      expect(data.cleanupErrors).toEqual(["kv unavailable"]);
      // Reschedule still proceeds despite the cleanup failure — this is
      // what neutralizes a possibly-still-live old job via the existing
      // pointer-mismatch mechanism on a later run, without needing any new
      // "already delivered" marker.
      expect(data.dailyRescheduled).toBe(1);
      expect(storeJobForDevice).toHaveBeenCalled();
    });

    it("sends, cleans, rechecks, and reschedules DAILY_START in the normal flow", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: true });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(removeJobForDevice).toHaveBeenCalledWith("device-1", "due-job-1");
      expect(data.processed).toBe(1);
      expect(data.dailyRescheduled).toBe(1);
      expect(data.postDeliveryCleanupFailures).toBe(0);
      expect(storeJobForDevice).toHaveBeenCalled();
    });

    it("isolates a KV reschedule-write failure as post-delivery cleanup failure", async () => {
      kvSmembers.mockResolvedValue(["device-a", "device-b"]);
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: true });
      // storeJobForDevice is what rescheduleDailyStartJob calls internally
      // to write the next occurrence — fail it only for device-a.
      storeJobForDevice.mockImplementation(async (deviceId: string) => {
        if (deviceId === "device-a") {
          throw new Error("kv unavailable");
        }
      });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      // device-a: delivered and counted; reschedule write failed and is
      // reported as a cleanup failure, not a push failure.
      expect(data.processed).toBe(2);
      expect(data.transientFailures).toBe(0);
      expect(data.postDeliveryCleanupFailures).toBe(1);
      expect(data.cleanupErrors).toEqual(["kv unavailable"]);
      // device-b: entirely unaffected — proves failure isolation.
      expect(data.dailyRescheduled).toBe(1);
    });

    it("isolates one device's DAILY_START post-delivery cleanup failure", async () => {
      kvSmembers.mockResolvedValue(["device-a", "device-b"]);
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: true });
      removeJobForDevice.mockImplementation(async (deviceId: string) => {
        if (deviceId === "device-a") {
          throw new Error("kv unavailable");
        }
      });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      // Both devices' pushes were sent and counted as delivered.
      expect(sendPush).toHaveBeenCalledTimes(2);
      expect(data.processed).toBe(2);
      // Only device-a's cleanup failure is recorded; device-b's own
      // cleanup succeeded, and both still reschedule normally.
      expect(data.postDeliveryCleanupFailures).toBe(1);
      expect(data.dailyRescheduled).toBe(2);
    });
  });

  describe("at-most-once TASK_REMINDER claim with real DEL-count-based ownership", () => {
    it("winner: DEL reports 1 key removed — claims the job and sends exactly once", async () => {
      getDueJobIdsForDevice.mockResolvedValueOnce(["due-job-2"]).mockResolvedValueOnce([]);
      getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
      sendPush.mockResolvedValue(undefined);

      const first = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const firstData = await first.json();

      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(firstData.processed).toBe(1);
      // Claimed via claimJobForDevice's exclusive DEL before the send, not
      // via removeJobForDevice (never called for TASK_REMINDER).
      expect(kvDel).toHaveBeenCalledWith("push:job:device-1:due-job-2");
      expect(kvZrem).toHaveBeenCalledWith("push:jobs:device-1:zset", "due-job-2");
      expect(removeJobForDevice).not.toHaveBeenCalled();

      const second = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const secondData = await second.json();

      // Nothing left to discover — the job was already claimed on pass
      // one, so pass two's own due-time scan (mocked here as empty,
      // matching what a real zset lookup would now return) never even
      // presents this id for processing again.
      expect(secondData.dueIdCount).toBe(0);
      expect(sendPush).toHaveBeenCalledTimes(1);
    });

    it("loser: DEL reports 0 keys removed (already claimed by another caller) — reports not-owned and never sends", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-2"]);
      getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
      kvDel.mockResolvedValue(0);

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(sendPush).not.toHaveBeenCalled();
      expect(data.processed).toBe(0);
      expect(data.taskReminderClaimsLost).toBe(1);
      // Losing the race is not an error of any kind — must not be
      // misclassified as a claim-infrastructure failure or a push failure.
      expect(data.taskReminderClaimFailures).toBe(0);
      expect(data.transientFailures).toBe(0);
      expect(data.pushErrors).toEqual([]);
      // A losing claimant never races the winner for the index entry too —
      // see claimJobForDevice's own header for why that's safe.
      expect(kvZrem).not.toHaveBeenCalled();
    });

    it("overlapping cron invocations: two GET calls racing the same due job — total sendPush calls across both invocations is exactly 1", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-2"]);
      getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
      sendPush.mockResolvedValue(undefined);

      // Models two overlapping cron-job.org-triggered invocations that both
      // read the same due job before either has claimed it (both mocked
      // getDueJobIdsForDevice/getJobForDevice calls above resolve
      // identically for either invocation, exactly as a real shared KV
      // store would for two overlapping HTTP requests that both raced past
      // the due-time scan first). What actually decides exclusivity is a
      // single stateful kvDel mock standing in for Redis's real atomic,
      // serialized DEL against the same key: whichever invocation's DEL
      // runs first against this key sees the key actually removed (count
      // 1) and flips the shared state; every other DEL against the same
      // key — regardless of which invocation calls it — correctly sees it
      // already gone (count 0).
      let keyExists = true;
      kvDel.mockImplementation(async () => {
        if (keyExists) {
          keyExists = false;
          return 1;
        }
        return 0;
      });

      const [first, second] = await Promise.all([
        GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]),
        GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]),
      ]);
      const firstData = await first.json();
      const secondData = await second.json();

      // Exactly one of the two invocations won the claim and sent;
      // whichever lost genuinely never called sendPush at all.
      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(firstData.processed + secondData.processed).toBe(1);
      expect(firstData.taskReminderClaimsLost + secondData.taskReminderClaimsLost).toBe(1);
    });

    it("claim infrastructure error: DEL itself rejects (not merely returns 0) — fails closed, no send attempted, reported separately from push-provider failures", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-2"]);
      getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
      kvDel.mockRejectedValue(new Error("kv unavailable"));

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      // Never even attempted — not a push failure of any kind.
      expect(sendPush).not.toHaveBeenCalled();
      expect(data.transientFailures).toBe(0);
      expect(data.terminalFailures).toBe(0);
      expect(data.pushErrors).toEqual([]);
      expect(data.processed).toBe(0);
      expect(data.taskReminderClaimFailures).toBe(1);
      // Distinct from a genuinely lost claim race.
      expect(data.taskReminderClaimsLost).toBe(0);
      expect(data.cleanupErrors).toEqual(["kv unavailable"]);
    });

    it("partial claim cleanup: winning DEL succeeds but the index ZREM fails — still sends (ownership was already real), reports the failure separately, and leaves only a stale index entry with no backing job object", async () => {
      getDueJobIdsForDevice.mockResolvedValueOnce(["due-job-2"]).mockResolvedValueOnce([]);
      getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
      sendPush.mockResolvedValue(undefined);
      kvZrem.mockRejectedValue(new Error("kv unavailable"));

      const first = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const firstData = await first.json();

      // Ownership is proven by DEL's own return value alone — the ZREM
      // failure does not revoke the claim or block the send.
      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(firstData.processed).toBe(1);
      expect(firstData.postDeliveryCleanupFailures).toBe(1);
      expect(firstData.cleanupErrors).toEqual(["kv unavailable"]);
      expect(firstData.taskReminderClaimFailures).toBe(0);
      expect(firstData.taskReminderClaimsLost).toBe(0);

      // The leftover phantom zset member (job object gone, index entry
      // stranded) is the same shape every discovery path in this codebase
      // already treats as normal — modeled here as a later pass's due-time
      // scan finding nothing, matching what a real zrange lookup against
      // an already-deleted job object would return. It does not get
      // re-sent.
      const second = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const secondData = await second.json();
      expect(secondData.dueIdCount).toBe(0);
      expect(sendPush).toHaveBeenCalledTimes(1);
    });

    it("case: non-terminal/transient/ambiguous send failure after a winning claim — exactly one send attempt, the failure is counted and recorded, and the claimed job is never re-created for another application-level send attempt", async () => {
      getDueJobIdsForDevice.mockResolvedValueOnce(["due-job-2"]).mockResolvedValueOnce([]);
      getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
      sendPush.mockRejectedValue(new Error("fetch failed"));

      const first = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const firstData = await first.json();

      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(firstData.transientFailures).toBe(1);
      expect(firstData.pushErrors).toEqual(["fetch failed"]);
      expect(kvDel).toHaveBeenCalledWith("push:job:device-1:due-job-2");
      // Final TASK_REMINDER semantic: no application-level resend path
      // exists after a won claim, regardless of outcome.
      expect(storeJobForDevice).not.toHaveBeenCalled();
      expect(firstData.processed).toBe(0);

      // A second logical cron pass must not re-send the same original
      // reminder — the claim already consumed it, and nothing re-created
      // it. Modeled here as the next due-time scan finding nothing, the
      // same way a real zset lookup would after the job object was
      // deleted by the winning claim and never re-stored.
      const second = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const secondData = await second.json();
      expect(secondData.dueIdCount).toBe(0);
      expect(sendPush).toHaveBeenCalledTimes(1);
    });

    it("cleans an invalid subscription after terminal failure under claim-first delivery", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-2"]);
      getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
      sendPush.mockRejectedValue(new WebPushError("gone", 410, {} as never, "", "https://x"));

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(data.terminalFailures).toBe(1);
      expect(deletePushSubscriptionByDeviceId).toHaveBeenCalledWith("device-1");
      expect(data.processed).toBe(0);
      expect(data.taskReminderClaimFailures).toBe(0);
    });

    it("keeps DAILY_START send-then-remove ordering independent of TASK_REMINDER claims", async () => {
      getDueJobIdsForDevice.mockResolvedValue(["due-job-1"]);
      getJobForDevice.mockResolvedValue(DAILY_JOB);
      sendPush.mockResolvedValue(undefined);
      getReminderEnabledForDevice.mockResolvedValue({ ok: true, enabled: true });

      const order: string[] = [];
      sendPush.mockImplementation(async () => {
        order.push("send");
      });
      removeJobForDevice.mockImplementation(async () => {
        order.push("remove");
      });

      await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);

      // DAILY_START still sends BEFORE removing — the opposite order from
      // the new TASK_REMINDER-only claim-first behavior.
      expect(order).toEqual(["send", "remove"]);
    });

    it("isolates one device's TASK_REMINDER claim failure", async () => {
      kvSmembers.mockResolvedValue(["device-a", "device-b"]);
      getDueJobIdsForDevice.mockResolvedValue(["due-job-2"]);
      getJobForDevice.mockResolvedValue(TASK_REMINDER_JOB);
      sendPush.mockResolvedValue(undefined);
      kvDel.mockImplementation(async (key: string) => {
        if (key.includes("device-a")) {
          throw new Error("kv unavailable");
        }
        return 1;
      });

      const response = await GET(makeCronRequest() as unknown as Parameters<typeof GET>[0]);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      // device-a: claim failed, never sent.
      expect(data.taskReminderClaimFailures).toBe(1);
      // device-b: fully normal, unaffected.
      expect(sendPush).toHaveBeenCalledTimes(1);
      expect(data.processed).toBe(1);
    });
  });
});
