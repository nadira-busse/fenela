// Direct, deterministic unit tests for storeJobForDevice/removeJobForDevice
// ordering. Route-level tests mock the whole "@/lib/jobs" module and cannot
// expose partial-write ordering inside these functions. These
// tests mock only the underlying KV client, so the real call order (and
// what state a mid-sequence failure leaves behind) is actually exercised.

import { describe, expect, it, vi, beforeEach } from "vitest";

const { getKvClient } = vi.hoisted(() => ({ getKvClient: vi.fn() }));
vi.mock("@/lib/kv", () => ({ getKvClient }));

const { storeJobForDevice, removeJobForDevice, claimJobForDevice, makeJob } =
  await import("./jobs");

describe("storeJobForDevice", () => {
  let kvSet: ReturnType<typeof vi.fn>;
  let kvZadd: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    kvSet = vi.fn().mockResolvedValue(undefined);
    kvZadd = vi.fn().mockResolvedValue(undefined);
    getKvClient.mockReturnValue({ set: kvSet, zadd: kvZadd });
  });

  const job = makeJob({
    dueAt: 1000,
    kind: "DAILY_START",
    payload: { title: "t", body: "b", url: "/" },
  });

  it("indexes the job (zadd) before writing its object (set)", async () => {
    const order: string[] = [];
    kvZadd.mockImplementation(async () => {
      order.push("zadd");
    });
    kvSet.mockImplementation(async () => {
      order.push("set");
    });

    await storeJobForDevice("device-1", job);

    expect(order).toEqual(["zadd", "set"]);
    expect(kvZadd).toHaveBeenCalledWith("push:jobs:device-1:zset", {
      score: job.dueAt,
      member: job.id,
    });
    expect(kvSet).toHaveBeenCalledWith(`push:job:device-1:${job.id}`, job);
  });

  it("if zadd fails, set is never attempted — nothing is written at all", async () => {
    kvZadd.mockRejectedValue(new Error("kv unavailable"));

    await expect(storeJobForDevice("device-1", job)).rejects.toThrow("kv unavailable");
    expect(kvSet).not.toHaveBeenCalled();
  });

  it("if set fails after zadd already succeeded, the result is a zset member with no backing job object — never an unindexed job key", async () => {
    kvZadd.mockResolvedValue(undefined);
    kvSet.mockRejectedValue(new Error("kv unavailable"));

    await expect(storeJobForDevice("device-1", job)).rejects.toThrow("kv unavailable");
    // The dangerous shape this ordering exists to avoid — a job key that
    // exists but is not indexed — cannot occur: zadd already ran, so the
    // only possible partial state is "indexed, no object yet," which every
    // discovery path in this codebase already treats as a normal, harmless
    // missing-job case that remains discoverable for cleanup
    // (see getJobForDevice / cron's "job === null" branch).
    expect(kvZadd).toHaveBeenCalledTimes(1);
  });
});

describe("removeJobForDevice", () => {
  let kvDel: ReturnType<typeof vi.fn>;
  let kvZrem: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    kvDel = vi.fn().mockResolvedValue(undefined);
    kvZrem = vi.fn().mockResolvedValue(undefined);
    getKvClient.mockReturnValue({ del: kvDel, zrem: kvZrem });
  });

  it("deletes the job object (del) before removing its index entry (zrem)", async () => {
    const order: string[] = [];
    kvDel.mockImplementation(async () => {
      order.push("del");
    });
    kvZrem.mockImplementation(async () => {
      order.push("zrem");
    });

    await removeJobForDevice("device-1", "job-1");

    expect(order).toEqual(["del", "zrem"]);
    expect(kvDel).toHaveBeenCalledWith("push:job:device-1:job-1");
    expect(kvZrem).toHaveBeenCalledWith("push:jobs:device-1:zset", "job-1");
  });

  it("if del fails, zrem is never attempted — nothing changes, the job stays fully intact and fully indexed", async () => {
    kvDel.mockRejectedValue(new Error("kv unavailable"));

    await expect(removeJobForDevice("device-1", "job-1")).rejects.toThrow("kv unavailable");
    expect(kvZrem).not.toHaveBeenCalled();
  });

  it("if zrem fails after del already succeeded, the result is a zset member with no backing job object — never an orphaned job key with its payload still intact", async () => {
    kvDel.mockResolvedValue(undefined);
    kvZrem.mockRejectedValue(new Error("kv unavailable"));

    await expect(removeJobForDevice("device-1", "job-1")).rejects.toThrow("kv unavailable");
    // The dangerous shape this ordering exists to avoid — a job key that
    // still exists, fully intact, but is no longer indexed and therefore
    // invisible to every zset-based discovery path in this codebase —
    // cannot occur: del already ran, so the job object is already gone.
    expect(kvDel).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — removing an already-gone job (both del and zrem no-ops) does not throw", async () => {
    await expect(removeJobForDevice("device-1", "already-gone")).resolves.toBeUndefined();
  });
});

describe("claimJobForDevice exclusive claim primitive", () => {
  let kvDel: ReturnType<typeof vi.fn>;
  let kvZrem: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    kvDel = vi.fn().mockResolvedValue(1);
    kvZrem = vi.fn().mockResolvedValue(undefined);
    getKvClient.mockReturnValue({ del: kvDel, zrem: kvZrem });
  });

  it("winner: del returns a nonzero count — reports claimed: true and clears the index entry", async () => {
    const result = await claimJobForDevice("device-1", "job-1");

    expect(result).toEqual({ claimed: true, indexCleanupError: null });
    expect(kvDel).toHaveBeenCalledWith("push:job:device-1:job-1");
    expect(kvZrem).toHaveBeenCalledWith("push:jobs:device-1:zset", "job-1");
  });

  it("loser: del returns 0 (nothing actually removed) — reports claimed: false and never attempts zrem", async () => {
    kvDel.mockResolvedValue(0);

    const result = await claimJobForDevice("device-1", "job-1");

    expect(result).toEqual({ claimed: false });
    expect(kvZrem).not.toHaveBeenCalled();
  });

  it("claim infrastructure error: del itself rejects — propagates rather than reporting claimed: false, so the caller can distinguish 'lost the race' from 'KV is broken'", async () => {
    kvDel.mockRejectedValue(new Error("kv unavailable"));

    await expect(claimJobForDevice("device-1", "job-1")).rejects.toThrow("kv unavailable");
    expect(kvZrem).not.toHaveBeenCalled();
  });

  it("partial claim cleanup: del succeeds (ownership real) but zrem fails — still reports claimed: true, surfacing the failure via indexCleanupError instead of losing ownership or throwing", async () => {
    kvZrem.mockRejectedValue(new Error("kv unavailable"));

    const result = await claimJobForDevice("device-1", "job-1");

    expect(result).toEqual({ claimed: true, indexCleanupError: "kv unavailable" });
  });

  it("del is called exactly once per claim attempt, regardless of outcome — no retry loop that could itself race a concurrent caller", async () => {
    await claimJobForDevice("device-1", "job-1");
    expect(kvDel).toHaveBeenCalledTimes(1);

    kvDel.mockResolvedValue(0);
    await claimJobForDevice("device-1", "job-2");
    expect(kvDel).toHaveBeenCalledTimes(2);
  });
});
