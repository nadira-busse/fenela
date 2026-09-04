import { describe, expect, it, vi, beforeEach } from "vitest";

const { listInactiveAccountCandidates, isAccountStillExpired } = vi.hoisted(() => ({
  listInactiveAccountCandidates: vi.fn(),
  isAccountStillExpired: vi.fn(),
}));
vi.mock("./listInactiveAccountCandidates", () => ({
  listInactiveAccountCandidates,
  isAccountStillExpired,
}));

const { deleteAccountForUser } = vi.hoisted(() => ({ deleteAccountForUser: vi.fn() }));
vi.mock("./deleteAccountForUser", () => ({ deleteAccountForUser }));

const { runAccountRetentionBatch } = await import("./runAccountRetentionBatch");

const referenceInstant = new Date("2026-08-11T00:00:00.000Z");

// This file tests runAccountRetentionBatch's own orchestration/composition
// — that it wires the guard into deleteAccountForUser correctly and routes
// each of that function's possible outcomes into the right bucket. It
// deliberately still mocks deleteAccountForUser as a unit (its own real
// internal step ordering — enumeration, cleanup, guard, auth-delete — is
// proven directly in deleteAccountForUser.test.ts, where mocking it here
// would only hide).
describe("runAccountRetentionBatch", () => {
  beforeEach(() => {
    listInactiveAccountCandidates.mockReset();
    isAccountStillExpired.mockReset();
    deleteAccountForUser.mockReset();

    // Default: the final recheck agrees with the scan (still expired) —
    // matches the surrounding tests' implicit assumption, so those tests
    // don't need to know the recheck exists unless they're specifically
    // testing it.
    isAccountStillExpired.mockResolvedValue(true);
  });

  it("invokes the canonical deletion core for every expired candidate, composing the pre-deletion guard, and leaves active accounts untouched", async () => {
    listInactiveAccountCandidates.mockResolvedValue({
      candidateUserIds: ["user-expired"],
      scanned: 2,
      truncated: false,
    });
    deleteAccountForUser.mockResolvedValue({ ok: true });

    const result = await runAccountRetentionBatch(referenceInstant);

    expect(deleteAccountForUser).toHaveBeenCalledTimes(1);
    const [calledUserId, calledOptions] = deleteAccountForUser.mock.calls[0];
    expect(calledUserId).toBe("user-expired");
    expect(typeof calledOptions.preAuthDeletionGuard).toBe("function");

    expect(result).toEqual({
      scanned: 2,
      expired: 1,
      deleted: 1,
      failed: 0,
      skipped: 0,
      truncated: false,
      failures: [],
    });
  });

  it("the composed guard itself calls isAccountStillExpired for the exact candidate and reference instant", async () => {
    listInactiveAccountCandidates.mockResolvedValue({
      candidateUserIds: ["user-expired"],
      scanned: 1,
      truncated: false,
    });
    deleteAccountForUser.mockResolvedValue({ ok: true });

    await runAccountRetentionBatch(referenceInstant);

    const [, options] = deleteAccountForUser.mock.calls[0];
    isAccountStillExpired.mockClear();

    await options.preAuthDeletionGuard();

    expect(isAccountStillExpired).toHaveBeenCalledWith("user-expired", referenceInstant);
    expect(isAccountStillExpired).toHaveBeenCalledTimes(1);
  });

  it("does not call the deletion core at all when there are no expired candidates", async () => {
    listInactiveAccountCandidates.mockResolvedValue({
      candidateUserIds: [],
      scanned: 5,
      truncated: false,
    });

    const result = await runAccountRetentionBatch(referenceInstant);

    expect(deleteAccountForUser).not.toHaveBeenCalled();
    expect(isAccountStillExpired).not.toHaveBeenCalled();
    expect(result).toEqual({
      scanned: 5,
      expired: 0,
      deleted: 0,
      failed: 0,
      skipped: 0,
      truncated: false,
      failures: [],
    });
  });

  it("isolates one candidate's deletion failure — later candidates still get deleted, and the batch does not abort", async () => {
    listInactiveAccountCandidates.mockResolvedValue({
      candidateUserIds: ["user-a", "user-b", "user-c"],
      scanned: 3,
      truncated: false,
    });
    deleteAccountForUser.mockImplementation(async (userId: string) => {
      if (userId === "user-b") {
        return { ok: false, stage: "operational_cleanup", message: "kv unavailable" };
      }
      return { ok: true };
    });

    const result = await runAccountRetentionBatch(referenceInstant);

    expect(deleteAccountForUser).toHaveBeenCalledTimes(3);
    expect(deleteAccountForUser.mock.calls.map((call) => call[0])).toEqual([
      "user-a",
      "user-b",
      "user-c",
    ]);
    expect(result).toEqual({
      scanned: 3,
      expired: 3,
      deleted: 2,
      failed: 1,
      skipped: 0,
      truncated: false,
      failures: [{ userId: "user-b", stage: "operational_cleanup", message: "kv unavailable" }],
    });
  });

  it("never includes email or other free-text data in a failure record — only userId, stage and the controlled message", async () => {
    listInactiveAccountCandidates.mockResolvedValue({
      candidateUserIds: ["user-a"],
      scanned: 1,
      truncated: false,
    });
    deleteAccountForUser.mockResolvedValue({
      ok: false,
      stage: "auth_deletion",
      message: "Auth service unavailable",
    });

    const result = await runAccountRetentionBatch(referenceInstant);

    expect(result.failures).toEqual([
      { userId: "user-a", stage: "auth_deletion", message: "Auth service unavailable" },
    ]);
    expect(Object.keys(result.failures[0])).toEqual(["userId", "stage", "message"]);
  });

  it("propagates a system-level enumeration failure rather than returning a partial/empty batch result", async () => {
    listInactiveAccountCandidates.mockRejectedValue(new Error("Failed to list Auth users: 503"));

    await expect(runAccountRetentionBatch(referenceInstant)).rejects.toThrow(
      "Failed to list Auth users: 503"
    );
    expect(deleteAccountForUser).not.toHaveBeenCalled();
  });

  it("surfaces truncated: true from enumeration so callers know coverage was incomplete", async () => {
    listInactiveAccountCandidates.mockResolvedValue({
      candidateUserIds: ["user-a"],
      scanned: 10000,
      truncated: true,
    });
    deleteAccountForUser.mockResolvedValue({ ok: true });

    const result = await runAccountRetentionBatch(referenceInstant);

    expect(result.truncated).toBe(true);
  });

  describe("outer eligibility recheck at the scan-to-loop-iteration boundary", () => {
    it("deletes exactly once when the candidate remains expired", async () => {
      listInactiveAccountCandidates.mockResolvedValue({
        candidateUserIds: ["user-still-expired"],
        scanned: 1,
        truncated: false,
      });
      isAccountStillExpired.mockResolvedValue(true);
      deleteAccountForUser.mockResolvedValue({ ok: true });

      const result = await runAccountRetentionBatch(referenceInstant);

      expect(isAccountStillExpired).toHaveBeenCalledWith("user-still-expired", referenceInstant);
      expect(deleteAccountForUser).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        scanned: 1,
        expired: 1,
        deleted: 1,
        failed: 0,
        skipped: 0,
        truncated: false,
        failures: [],
      });
    });

    it("skips without failure when the candidate became active after the scan", async () => {
      listInactiveAccountCandidates.mockResolvedValue({
        candidateUserIds: ["user-became-active"],
        scanned: 1,
        truncated: false,
      });
      isAccountStillExpired.mockResolvedValue(false);

      const result = await runAccountRetentionBatch(referenceInstant);

      expect(isAccountStillExpired).toHaveBeenCalledWith("user-became-active", referenceInstant);
      expect(deleteAccountForUser).not.toHaveBeenCalled();
      expect(result).toEqual({
        scanned: 1,
        expired: 1,
        deleted: 0,
        failed: 0,
        skipped: 1,
        truncated: false,
        failures: [],
      });
    });

    it("fails closed and continues the batch when the outer recheck fails", async () => {
      listInactiveAccountCandidates.mockResolvedValue({
        candidateUserIds: ["user-recheck-fails", "user-fine"],
        scanned: 2,
        truncated: false,
      });
      isAccountStillExpired.mockImplementation(async (userId: string) => {
        if (userId === "user-recheck-fails") {
          throw new Error("Failed to re-read Auth user for retention recheck: 503");
        }
        return true;
      });
      deleteAccountForUser.mockResolvedValue({ ok: true });

      const result = await runAccountRetentionBatch(referenceInstant);

      expect(deleteAccountForUser.mock.calls.map((call) => call[0])).toEqual(["user-fine"]);
      expect(result).toEqual({
        scanned: 2,
        expired: 2,
        deleted: 1,
        failed: 1,
        skipped: 0,
        truncated: false,
        failures: [
          {
            userId: "user-recheck-fails",
            stage: "eligibility_recheck",
            message: "Failed to re-read Auth user for retention recheck: 503",
          },
        ],
      });
    });

    it("produces a controlled failure message for a non-Error recheck failure", async () => {
      listInactiveAccountCandidates.mockResolvedValue({
        candidateUserIds: ["user-weird-throw"],
        scanned: 1,
        truncated: false,
      });
      isAccountStillExpired.mockRejectedValue("not an Error instance");

      const result = await runAccountRetentionBatch(referenceInstant);

      expect(deleteAccountForUser).not.toHaveBeenCalled();
      expect(result.failures).toEqual([
        {
          userId: "user-weird-throw",
          stage: "eligibility_recheck",
          message: "Failed to revalidate retention eligibility.",
        },
      ]);
    });
  });

  describe("inner pre-deletion guard outcome routing before irreversible Auth deletion", () => {
    it("routes a cancelled result (guard determined the candidate is no longer eligible) to skipped, never to failures", async () => {
      listInactiveAccountCandidates.mockResolvedValue({
        candidateUserIds: ["user-reactivated-late"],
        scanned: 1,
        truncated: false,
      });
      deleteAccountForUser.mockResolvedValue({
        ok: false,
        cancelled: true,
        reason: "The pre-deletion guard determined this account should no longer be deleted.",
      });

      const result = await runAccountRetentionBatch(referenceInstant);

      expect(result).toEqual({
        scanned: 1,
        expired: 1,
        deleted: 0,
        failed: 0,
        skipped: 1,
        truncated: false,
        failures: [],
      });
    });

    it("routes a pre_deletion_guard failure (the guard itself errored) to failures like any other deletion-core failure", async () => {
      listInactiveAccountCandidates.mockResolvedValue({
        candidateUserIds: ["user-guard-error"],
        scanned: 1,
        truncated: false,
      });
      deleteAccountForUser.mockResolvedValue({
        ok: false,
        stage: "pre_deletion_guard",
        message: "Failed to re-read Auth user for retention recheck: network error",
      });

      const result = await runAccountRetentionBatch(referenceInstant);

      expect(result).toEqual({
        scanned: 1,
        expired: 1,
        deleted: 0,
        failed: 1,
        skipped: 0,
        truncated: false,
        failures: [
          {
            userId: "user-guard-error",
            stage: "pre_deletion_guard",
            message: "Failed to re-read Auth user for retention recheck: network error",
          },
        ],
      });
    });

    it("reports deleted, skipped, and failed outcomes independently in a mixed batch", async () => {
      listInactiveAccountCandidates.mockResolvedValue({
        candidateUserIds: ["user-deleted", "user-cancelled", "user-guard-error"],
        scanned: 3,
        truncated: false,
      });
      deleteAccountForUser.mockImplementation(async (userId: string) => {
        if (userId === "user-cancelled") {
          return { ok: false, cancelled: true, reason: "no longer eligible" };
        }
        if (userId === "user-guard-error") {
          return { ok: false, stage: "pre_deletion_guard", message: "network error" };
        }
        return { ok: true };
      });

      const result = await runAccountRetentionBatch(referenceInstant);

      expect(deleteAccountForUser).toHaveBeenCalledTimes(3);
      expect(result).toEqual({
        scanned: 3,
        expired: 3,
        deleted: 1,
        failed: 1,
        skipped: 1,
        truncated: false,
        failures: [
          { userId: "user-guard-error", stage: "pre_deletion_guard", message: "network error" },
        ],
      });
    });

    it("re-evaluates from scratch when retrying after a pre_deletion_guard failure", async () => {
      listInactiveAccountCandidates.mockResolvedValue({
        candidateUserIds: ["user-a"],
        scanned: 1,
        truncated: false,
      });
      deleteAccountForUser.mockResolvedValueOnce({
        ok: false,
        stage: "pre_deletion_guard",
        message: "transient failure",
      });

      const first = await runAccountRetentionBatch(referenceInstant);
      expect(first.deleted).toBe(0);
      expect(first.failed).toBe(1);

      deleteAccountForUser.mockResolvedValue({ ok: true });

      const retry = await runAccountRetentionBatch(referenceInstant);
      expect(retry).toEqual({
        scanned: 1,
        expired: 1,
        deleted: 1,
        failed: 0,
        skipped: 0,
        truncated: false,
        failures: [],
      });
      expect(deleteAccountForUser).toHaveBeenCalledTimes(2);
    });
  });
});
