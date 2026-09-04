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

  describe("preAuthDeletionGuard at the final race-window boundary", () => {
    it("without a guard supplied, behaves exactly as before — this is what user-initiated deletion (deleteOwnAccountAction) relies on", async () => {
      listDeviceIdsForUser.mockResolvedValue(["device-a"]);

      const result = await deleteAccountForUser("user-1");

      expect(result).toEqual({ ok: true });
      expect(deleteAuthUserById).toHaveBeenCalledWith("user-1");
    });

    it("proves the real call ordering: device enumeration, then every device's cleanup, then the guard, then auth deletion — not a mocked sequence", async () => {
      listDeviceIdsForUser.mockResolvedValue(["device-a", "device-b"]);

      const order: string[] = [];
      listDeviceIdsForUser.mockImplementation(async () => {
        order.push("enumeration");
        return ["device-a", "device-b"];
      });
      cleanupOperationalPushState.mockImplementation(async (deviceId: string) => {
        order.push(`cleanup:${deviceId}`);
        return { cleanedJobs: 0 };
      });
      const guard = vi.fn(async () => {
        order.push("guard");
        return true;
      });
      deleteAuthUserById.mockImplementation(async () => {
        order.push("auth-delete");
        return { ok: true };
      });

      const result = await deleteAccountForUser("user-1", { preAuthDeletionGuard: guard });

      expect(result).toEqual({ ok: true });
      expect(order).toEqual([
        "enumeration",
        "cleanup:device-a",
        "cleanup:device-b",
        "guard",
        "auth-delete",
      ]);
      expect(guard).toHaveBeenCalledTimes(1);
    });

    it("cancels deletion when the guard returns false — auth deletion is never reached, and cleanup that already ran is not undone or retried", async () => {
      listDeviceIdsForUser.mockResolvedValue(["device-a"]);
      const guard = vi.fn().mockResolvedValue(false);

      const result = await deleteAccountForUser("user-1", { preAuthDeletionGuard: guard });

      expect(result).toEqual({
        ok: false,
        cancelled: true,
        reason: "The pre-deletion guard determined this account should no longer be deleted.",
      });
      // Cleanup for the one owned device already ran exactly once — this is
      // the accepted bounded degradation documented on
      // DeleteAccountOptions.preAuthDeletionGuard, not a bug: the point of
      // this test is to make that real, observable behavior explicit.
      expect(cleanupOperationalPushState).toHaveBeenCalledTimes(1);
      expect(deleteAuthUserById).not.toHaveBeenCalled();
    });

    it("cancels deletion for a user with zero owned devices before any cleanup would even be needed", async () => {
      listDeviceIdsForUser.mockResolvedValue([]);
      const guard = vi.fn().mockResolvedValue(false);

      const result = await deleteAccountForUser("user-1", { preAuthDeletionGuard: guard });

      expect(result).toEqual({
        ok: false,
        cancelled: true,
        reason: "The pre-deletion guard determined this account should no longer be deleted.",
      });
      expect(cleanupOperationalPushState).not.toHaveBeenCalled();
      expect(deleteAuthUserById).not.toHaveBeenCalled();
    });

    it("fails closed as stage 'pre_deletion_guard' when the guard itself throws — auth deletion is never reached", async () => {
      listDeviceIdsForUser.mockResolvedValue(["device-a"]);
      const guard = vi.fn().mockRejectedValue(new Error("could not re-verify eligibility"));

      const result = await deleteAccountForUser("user-1", { preAuthDeletionGuard: guard });

      expect(result).toEqual({
        ok: false,
        stage: "pre_deletion_guard",
        message: "could not re-verify eligibility",
      });
      expect(deleteAuthUserById).not.toHaveBeenCalled();
    });

    it("fails closed with a controlled message when the guard rejects with a non-Error value", async () => {
      listDeviceIdsForUser.mockResolvedValue([]);
      const guard = vi.fn().mockRejectedValue("not an Error instance");

      const result = await deleteAccountForUser("user-1", { preAuthDeletionGuard: guard });

      expect(result).toEqual({
        ok: false,
        stage: "pre_deletion_guard",
        message: "Pre-deletion guard check failed.",
      });
      expect(deleteAuthUserById).not.toHaveBeenCalled();
    });

    it("proceeds to auth deletion exactly once when the guard returns true", async () => {
      listDeviceIdsForUser.mockResolvedValue(["device-a"]);
      const guard = vi.fn().mockResolvedValue(true);

      const result = await deleteAccountForUser("user-1", { preAuthDeletionGuard: guard });

      expect(result).toEqual({ ok: true });
      expect(guard).toHaveBeenCalledTimes(1);
      expect(deleteAuthUserById).toHaveBeenCalledTimes(1);
      expect(deleteAuthUserById).toHaveBeenCalledWith("user-1");
    });

    it("still fails closed at operational_cleanup before the guard is ever reached, if cleanup itself fails first", async () => {
      listDeviceIdsForUser.mockResolvedValue(["device-a"]);
      cleanupOperationalPushState.mockRejectedValue(new Error("kv unavailable"));
      const guard = vi.fn().mockResolvedValue(true);

      const result = await deleteAccountForUser("user-1", { preAuthDeletionGuard: guard });

      expect(result).toEqual({
        ok: false,
        stage: "operational_cleanup",
        message: "kv unavailable",
      });
      expect(guard).not.toHaveBeenCalled();
      expect(deleteAuthUserById).not.toHaveBeenCalled();
    });

    it("retry after a guard cancellation is safe and idempotent — a second attempt where the guard now returns true completes deletion normally", async () => {
      listDeviceIdsForUser.mockResolvedValue(["device-a"]);
      const guard = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      const first = await deleteAccountForUser("user-1", { preAuthDeletionGuard: guard });
      expect(first).toEqual({
        ok: false,
        cancelled: true,
        reason: "The pre-deletion guard determined this account should no longer be deleted.",
      });

      const second = await deleteAccountForUser("user-1", { preAuthDeletionGuard: guard });
      expect(second).toEqual({ ok: true });
      // Re-running cleanup for the same device twice is safe/idempotent —
      // already covered by cleanupOperationalPushState's own tests; this
      // test's own concern is only that the retry reaches a normal
      // completion, not a stuck or corrupted state.
      expect(deleteAuthUserById).toHaveBeenCalledTimes(1);
    });
  });
});
