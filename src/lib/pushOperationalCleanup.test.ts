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

    expect(result).toEqual({ cleanedJobs: 2 });
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

    expect(result).toEqual({ cleanedJobs: 2 });
    expect(removeJobForDevice).toHaveBeenCalledTimes(2);
  });

  it("is idempotent — a second call with nothing left to clean still succeeds", async () => {
    kvZrange.mockResolvedValue([]);

    const first = await cleanupOperationalPushState("device-a");
    const second = await cleanupOperationalPushState("device-a");

    expect(first).toEqual({ cleanedJobs: 0 });
    expect(second).toEqual({ cleanedJobs: 0 });
    expect(kvDel).toHaveBeenCalledWith("push:sub:device-a");
  });

  it("tolerates a failed zrange lookup rather than throwing", async () => {
    kvZrange.mockRejectedValue(new Error("kv unavailable"));

    await expect(cleanupOperationalPushState("device-a")).resolves.toEqual({ cleanedJobs: 0 });
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

      expect(result).toEqual({ cleanedJobs: 2 });
    });

    it("does not change default (non-strict) behavior", async () => {
      kvZrange.mockRejectedValue(new Error("kv unavailable"));

      await expect(cleanupOperationalPushState("device-a")).resolves.toEqual({ cleanedJobs: 0 });
    });
  });
});
