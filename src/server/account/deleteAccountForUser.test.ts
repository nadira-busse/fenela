import { describe, expect, it, vi, beforeEach } from "vitest";

const { listDeviceIdsForUser } = vi.hoisted(() => ({ listDeviceIdsForUser: vi.fn() }));
vi.mock("@/server/devices/listDeviceIdsForUser", () => ({ listDeviceIdsForUser }));

const { cleanupOperationalPushState } = vi.hoisted(() => ({
  cleanupOperationalPushState: vi.fn(),
}));
vi.mock("@/lib/pushOperationalCleanup", () => ({ cleanupOperationalPushState }));

const { deleteAuthUserById } = vi.hoisted(() => ({ deleteAuthUserById: vi.fn() }));
vi.mock("@/server/auth/deleteAuthUserById", () => ({ deleteAuthUserById }));

const { deleteAccountForUser } = await import("./deleteAccountForUser");

describe("deleteAccountForUser", () => {
  beforeEach(() => {
    listDeviceIdsForUser.mockReset();
    cleanupOperationalPushState.mockReset();
    deleteAuthUserById.mockReset();

    cleanupOperationalPushState.mockResolvedValue({ cleanedJobs: 0 });
    deleteAuthUserById.mockResolvedValue({ ok: true });
  });

  it("cleans up every owned device's operational KV state, in strict mode, before deleting the auth user", async () => {
    listDeviceIdsForUser.mockResolvedValue(["device-a", "device-b"]);

    const order: string[] = [];
    cleanupOperationalPushState.mockImplementation(async (deviceId: string) => {
      order.push(`cleanup:${deviceId}`);
      return { cleanedJobs: 0 };
    });
    deleteAuthUserById.mockImplementation(async () => {
      order.push("auth-delete");
      return { ok: true };
    });

    const result = await deleteAccountForUser("user-1");

    expect(result).toEqual({ ok: true });
    expect(cleanupOperationalPushState).toHaveBeenCalledWith("device-a", { strict: true });
    expect(cleanupOperationalPushState).toHaveBeenCalledWith("device-b", { strict: true });
    expect(order).toEqual(["cleanup:device-a", "cleanup:device-b", "auth-delete"]);
    expect(deleteAuthUserById).toHaveBeenCalledWith("user-1");
    expect(deleteAuthUserById).toHaveBeenCalledTimes(1);
  });

  it("succeeds for a user with zero owned devices", async () => {
    listDeviceIdsForUser.mockResolvedValue([]);

    const result = await deleteAccountForUser("user-1");

    expect(result).toEqual({ ok: true });
    expect(cleanupOperationalPushState).not.toHaveBeenCalled();
    expect(deleteAuthUserById).toHaveBeenCalledWith("user-1");
  });

  it("fails closed when device enumeration itself fails, and never attempts cleanup or auth deletion", async () => {
    listDeviceIdsForUser.mockRejectedValue(new Error("db unreachable"));

    const result = await deleteAccountForUser("user-1");

    expect(result).toEqual({
      ok: false,
      stage: "device_enumeration",
      message: "db unreachable",
    });
    expect(cleanupOperationalPushState).not.toHaveBeenCalled();
    expect(deleteAuthUserById).not.toHaveBeenCalled();
  });

  it("fails closed when one device's operational cleanup fails, and never deletes the auth user", async () => {
    listDeviceIdsForUser.mockResolvedValue(["device-a", "device-b"]);
    cleanupOperationalPushState.mockImplementation(async (deviceId: string) => {
      if (deviceId === "device-a") {
        throw new Error("kv unavailable");
      }
      return { cleanedJobs: 0 };
    });

    const result = await deleteAccountForUser("user-1");

    expect(result).toEqual({
      ok: false,
      stage: "operational_cleanup",
      message: "kv unavailable",
    });
    // Stops at the first failing device — never reaches device-b or auth deletion.
    expect(cleanupOperationalPushState).toHaveBeenCalledTimes(1);
    expect(deleteAuthUserById).not.toHaveBeenCalled();
  });

  it("proves a successful earlier device's cleanup is not undone by a later device's failure — retry stays valid because cleanup is idempotent", async () => {
    listDeviceIdsForUser.mockResolvedValue(["device-a", "device-b"]);
    cleanupOperationalPushState.mockImplementation(async (deviceId: string) => {
      if (deviceId === "device-b") {
        throw new Error("kv unavailable");
      }
      return { cleanedJobs: 0 };
    });

    const result = await deleteAccountForUser("user-1");

    expect(result).toEqual({
      ok: false,
      stage: "operational_cleanup",
      message: "kv unavailable",
    });
    // device-a's cleanup already ran and completed before device-b failed —
    // this function does not (and must not) attempt to undo it.
    expect(cleanupOperationalPushState).toHaveBeenNthCalledWith(1, "device-a", { strict: true });
    expect(cleanupOperationalPushState).toHaveBeenNthCalledWith(2, "device-b", { strict: true });
    expect(deleteAuthUserById).not.toHaveBeenCalled();

    // A retry re-runs cleanup for every device, including the
    // already-cleaned device-a — safe because cleanupOperationalPushState
    // is idempotent, and this time it succeeds for both.
    cleanupOperationalPushState.mockReset();
    cleanupOperationalPushState.mockResolvedValue({ cleanedJobs: 0 });

    const retry = await deleteAccountForUser("user-1");

    expect(retry).toEqual({ ok: true });
    expect(cleanupOperationalPushState).toHaveBeenCalledWith("device-a", { strict: true });
    expect(cleanupOperationalPushState).toHaveBeenCalledWith("device-b", { strict: true });
    expect(deleteAuthUserById).toHaveBeenCalledTimes(1);
  });

  it("returns a controlled failure when auth deletion fails after all KV cleanup succeeded, without reconstructing anything", async () => {
    listDeviceIdsForUser.mockResolvedValue(["device-a"]);
    deleteAuthUserById.mockResolvedValue({ ok: false, message: "auth service unavailable" });

    const result = await deleteAccountForUser("user-1");

    expect(result).toEqual({
      ok: false,
      stage: "auth_deletion",
      message: "auth service unavailable",
    });
    expect(cleanupOperationalPushState).toHaveBeenCalledTimes(1);
    expect(deleteAuthUserById).toHaveBeenCalledTimes(1);
  });

  it("deletes the auth user exactly once on full success", async () => {
    listDeviceIdsForUser.mockResolvedValue(["device-a", "device-b", "device-c"]);

    const result = await deleteAccountForUser("user-1");

    expect(result).toEqual({ ok: true });
    expect(cleanupOperationalPushState).toHaveBeenCalledTimes(3);
    expect(deleteAuthUserById).toHaveBeenCalledTimes(1);
  });
});
