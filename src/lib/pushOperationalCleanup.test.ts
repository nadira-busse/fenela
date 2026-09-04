import { describe, expect, it, vi, beforeEach } from "vitest";

const { getKvClient } = vi.hoisted(() => ({ getKvClient: vi.fn() }));
vi.mock("@/lib/kv", () => ({ getKvClient }));

const { removeJobForDevice } = vi.hoisted(() => ({ removeJobForDevice: vi.fn() }));
vi.mock("@/lib/jobs", () => ({
  DEVICES_SET_KEY: "push:devices:set",
  removeJobForDevice,
}));

const { cleanupOperationalPushState } = await import("./pushOperationalCleanup");

describe("cleanupOperationalPushState", () => {
  let kvDel: ReturnType<typeof vi.fn>;
  let kvSrem: ReturnType<typeof vi.fn>;
  let kvZrange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    removeJobForDevice.mockReset().mockResolvedValue(undefined);

    kvDel = vi.fn().mockResolvedValue(undefined);
    kvSrem = vi.fn().mockResolvedValue(undefined);
    kvZrange = vi.fn().mockResolvedValue([]);

    getKvClient.mockReturnValue({ del: kvDel, srem: kvSrem, zrange: kvZrange });
  });

  it("removes every job found in the device's job set, the subscription, the pointer, and device-set membership", async () => {
    kvZrange.mockResolvedValue(["job-1", "job-2"]);

    const result = await cleanupOperationalPushState("device-a");

    expect(result).toEqual({ cleanedJobs: 2, jobCleanupComplete: true });
    expect(removeJobForDevice).toHaveBeenCalledWith("device-a", "job-1");
    expect(removeJobForDevice).toHaveBeenCalledWith("device-a", "job-2");
    expect(kvDel).toHaveBeenCalledWith("push:sub:device-a");
    expect(kvDel).toHaveBeenCalledWith("push:dailyStart:jobId:device-a");
    expect(kvSrem).toHaveBeenCalledWith("push:devices:set", "device-a");
  });

  it("unions additionalJobIds with whatever the zset lookup returns, without duplicating", async () => {
    kvZrange.mockResolvedValue(["job-1"]);

    const result = await cleanupOperationalPushState("device-a", {
      additionalJobIds: ["job-1", "job-2"],
    });

    expect(result).toEqual({ cleanedJobs: 2, jobCleanupComplete: true });
    expect(removeJobForDevice).toHaveBeenCalledTimes(2);
  });

  it("is idempotent — a second call with nothing left to clean still succeeds", async () => {
    kvZrange.mockResolvedValue([]);

    const first = await cleanupOperationalPushState("device-a");
    const second = await cleanupOperationalPushState("device-a");

    expect(first).toEqual({ cleanedJobs: 0, jobCleanupComplete: true });
    expect(second).toEqual({ cleanedJobs: 0, jobCleanupComplete: true });
    expect(kvDel).toHaveBeenCalledWith("push:sub:device-a");
  });

  it("tolerates a failed zrange lookup rather than throwing, and reports jobCleanupComplete: false", async () => {
    kvZrange.mockRejectedValue(new Error("kv unavailable"));

    await expect(cleanupOperationalPushState("device-a")).resolves.toEqual({
      cleanedJobs: 0,
      jobCleanupComplete: false,
    });
  });

  describe("device-set removal gated on confirmed job cleanup", () => {
    it("does NOT remove the device from the discovery index when the zset lookup itself failed — every cleanup path (cron's own drain, both maintenance scripts) enumerates devices exclusively through this set, so removing it here would permanently strand any leftover job state", async () => {
      kvZrange.mockRejectedValue(new Error("kv unavailable"));

      const result = await cleanupOperationalPushState("device-a");

      expect(result.jobCleanupComplete).toBe(false);
      expect(kvSrem).not.toHaveBeenCalled();
      // The subscription and pointer are still deleted unconditionally —
      // deleting a single key creates no discoverability gap the way
      // removing a device from an enumeration index does.
      expect(kvDel).toHaveBeenCalledWith("push:sub:device-a");
      expect(kvDel).toHaveBeenCalledWith("push:dailyStart:jobId:device-a");
    });

    it("does NOT remove the device from the discovery index when an individual job removal failed", async () => {
      kvZrange.mockResolvedValue(["job-1", "job-2"]);
      removeJobForDevice.mockImplementation(async (_deviceId: string, jobId: string) => {
        if (jobId === "job-2") {
          throw new Error("job removal failed");
        }
      });

      const result = await cleanupOperationalPushState("device-a");

      // job-1 still counted as genuinely cleaned; job-2 was not, so the
      // pass as a whole is not complete.
      expect(result).toEqual({ cleanedJobs: 1, jobCleanupComplete: false });
      expect(kvSrem).not.toHaveBeenCalled();
    });

    it("DOES remove the device from the discovery index once every job removal is confirmed to have succeeded", async () => {
      kvZrange.mockResolvedValue(["job-1", "job-2"]);

      const result = await cleanupOperationalPushState("device-a");

      expect(result).toEqual({ cleanedJobs: 2, jobCleanupComplete: true });
      expect(kvSrem).toHaveBeenCalledWith("push:devices:set", "device-a");
    });

    it("retry: a later call with KV recovered can still find and clean the device, since it was correctly left in the index", async () => {
      kvZrange.mockRejectedValueOnce(new Error("kv unavailable"));

      const first = await cleanupOperationalPushState("device-a");
      expect(first.jobCleanupComplete).toBe(false);
      expect(kvSrem).not.toHaveBeenCalled();

      kvZrange.mockResolvedValue(["job-1"]);

      const retry = await cleanupOperationalPushState("device-a");
      expect(retry).toEqual({ cleanedJobs: 1, jobCleanupComplete: true });
      expect(kvSrem).toHaveBeenCalledWith("push:devices:set", "device-a");
    });
  });

  describe("strict mode", () => {
    it("propagates a failed zrange lookup instead of swallowing it", async () => {
      kvZrange.mockRejectedValue(new Error("kv unavailable"));

      await expect(cleanupOperationalPushState("device-a", { strict: true })).rejects.toThrow(
        "kv unavailable"
      );
    });

    it("propagates a failed per-job removal instead of swallowing it", async () => {
      kvZrange.mockResolvedValue(["job-1"]);
      removeJobForDevice.mockRejectedValue(new Error("job removal failed"));

      await expect(cleanupOperationalPushState("device-a", { strict: true })).rejects.toThrow(
        "job removal failed"
      );
    });

    it("still succeeds in strict mode when every step succeeds", async () => {
      kvZrange.mockResolvedValue(["job-1", "job-2"]);

      const result = await cleanupOperationalPushState("device-a", { strict: true });

      expect(result).toEqual({ cleanedJobs: 2, jobCleanupComplete: true });
    });

    it("does not change default (non-strict) behavior", async () => {
      kvZrange.mockRejectedValue(new Error("kv unavailable"));

      await expect(cleanupOperationalPushState("device-a")).resolves.toEqual({
        cleanedJobs: 0,
        jobCleanupComplete: false,
      });
    });
  });
});
