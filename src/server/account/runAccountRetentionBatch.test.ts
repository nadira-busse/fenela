import { describe, expect, it, vi, beforeEach } from "vitest";

const { listInactiveAccountCandidates } = vi.hoisted(() => ({
  listInactiveAccountCandidates: vi.fn(),
}));
vi.mock("./listInactiveAccountCandidates", () => ({ listInactiveAccountCandidates }));

const { deleteAccountForUser } = vi.hoisted(() => ({ deleteAccountForUser: vi.fn() }));
vi.mock("./deleteAccountForUser", () => ({ deleteAccountForUser }));

const { runAccountRetentionBatch } = await import("./runAccountRetentionBatch");

const referenceInstant = new Date("2026-08-11T00:00:00.000Z");

describe("runAccountRetentionBatch", () => {
  beforeEach(() => {
    listInactiveAccountCandidates.mockReset();
    deleteAccountForUser.mockReset();
  });

  it("invokes the canonical deletion core for every expired candidate and leaves active accounts untouched", async () => {
    listInactiveAccountCandidates.mockResolvedValue({
      candidateUserIds: ["user-expired"],
      scanned: 2,
      truncated: false,
    });
    deleteAccountForUser.mockResolvedValue({ ok: true });

    const result = await runAccountRetentionBatch(referenceInstant);

    expect(deleteAccountForUser).toHaveBeenCalledWith("user-expired");
    expect(deleteAccountForUser).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      scanned: 2,
      expired: 1,
      deleted: 1,
      failed: 0,
      truncated: false,
      failures: [],
    });
  });

  it("does not call the deletion core at all when there are no expired candidates", async () => {
    listInactiveAccountCandidates.mockResolvedValue({
      candidateUserIds: [],
      scanned: 5,
      truncated: false,
    });

    const result = await runAccountRetentionBatch(referenceInstant);

    expect(deleteAccountForUser).not.toHaveBeenCalled();
    expect(result).toEqual({
      scanned: 5,
      expired: 0,
      deleted: 0,
      failed: 0,
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
    expect(deleteAccountForUser).toHaveBeenNthCalledWith(1, "user-a");
    expect(deleteAccountForUser).toHaveBeenNthCalledWith(2, "user-b");
    expect(deleteAccountForUser).toHaveBeenNthCalledWith(3, "user-c");
    expect(result).toEqual({
      scanned: 3,
      expired: 3,
      deleted: 2,
      failed: 1,
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
});
