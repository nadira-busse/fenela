import { describe, expect, it, vi, beforeEach } from "vitest";

const { createSupabaseAdminClient, listUsers, fromMock, selectMock, inMock } = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  listUsers: vi.fn(),
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  inMock: vi.fn(),
}));

vi.mock("@/lib/supabase/adminClient", () => ({ createSupabaseAdminClient }));

const { listInactiveAccountCandidates, RETENTION_SCAN_MAX_PAGES, RETENTION_SCAN_USERS_PER_PAGE } =
  await import("./listInactiveAccountCandidates");

// Well clear of the 12-month threshold in either direction, so these
// fixtures do not depend on retentionPolicy.ts's exact boundary math —
// that math has its own dedicated tests in retentionPolicy.test.ts.
const referenceInstant = new Date("2026-08-11T00:00:00.000Z");
const clearlyExpiredLogin = "2020-01-01T00:00:00.000Z";
const clearlyActiveLogin = "2026-08-01T00:00:00.000Z";

function user(id: string, lastSignInAt: string | undefined) {
  return { id, last_sign_in_at: lastSignInAt };
}

function activityRow(userId: string, lastActiveAt: string) {
  return { user_id: userId, last_active_at: lastActiveAt };
}

describe("listInactiveAccountCandidates", () => {
  beforeEach(() => {
    createSupabaseAdminClient.mockReset();
    listUsers.mockReset();
    fromMock.mockReset();
    selectMock.mockReset();
    inMock.mockReset();

    selectMock.mockReturnValue({ in: inMock });
    fromMock.mockReturnValue({ select: selectMock });
    inMock.mockResolvedValue({ data: [], error: null });

    createSupabaseAdminClient.mockReturnValue({
      auth: { admin: { listUsers } },
      from: fromMock,
    });
  });

  it("scans a single page and returns only expired candidates", async () => {
    listUsers.mockResolvedValue({
      data: {
        users: [user("user-active", clearlyActiveLogin), user("user-expired", clearlyExpiredLogin)],
        nextPage: null,
      },
      error: null,
    });

    const result = await listInactiveAccountCandidates(referenceInstant);

    expect(result).toEqual({ candidateUserIds: ["user-expired"], scanned: 2, truncated: false });
    expect(listUsers).toHaveBeenCalledWith({ page: 1, perPage: RETENTION_SCAN_USERS_PER_PAGE });
    expect(listUsers).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("user_activity");
    expect(inMock).toHaveBeenCalledWith("user_id", ["user-active", "user-expired"]);
    // One batched activity lookup for the whole page, not one per user.
    expect(inMock).toHaveBeenCalledTimes(1);
  });

  it("protects a user whose last_sign_in_at is old but whose last_active_at is recent", async () => {
    listUsers.mockResolvedValue({
      data: { users: [user("user-active-session", clearlyExpiredLogin)], nextPage: null },
      error: null,
    });
    inMock.mockResolvedValue({
      data: [activityRow("user-active-session", clearlyActiveLogin)],
      error: null,
    });

    const result = await listInactiveAccountCandidates(referenceInstant);

    expect(result.candidateUserIds).toEqual([]);
  });

  it("falls back safely to last_sign_in_at when a user has no user_activity row at all (never made an authenticated request since this feature shipped)", async () => {
    listUsers.mockResolvedValue({
      data: { users: [user("user-no-activity-row", clearlyExpiredLogin)], nextPage: null },
      error: null,
    });
    // No matching row for this user in the batched result.
    inMock.mockResolvedValue({ data: [], error: null });

    const result = await listInactiveAccountCandidates(referenceInstant);

    expect(result.candidateUserIds).toEqual(["user-no-activity-row"]);
  });

  it("protects a user with a recent last_sign_in_at even with no user_activity row yet", async () => {
    listUsers.mockResolvedValue({
      data: { users: [user("user-just-signed-in", clearlyActiveLogin)], nextPage: null },
      error: null,
    });
    inMock.mockResolvedValue({ data: [], error: null });

    const result = await listInactiveAccountCandidates(referenceInstant);

    expect(result.candidateUserIds).toEqual([]);
  });

  it("treats old last_sign_in_at + old user_activity.last_active_at as expired", async () => {
    listUsers.mockResolvedValue({
      data: { users: [user("user-genuinely-inactive", clearlyExpiredLogin)], nextPage: null },
      error: null,
    });
    inMock.mockResolvedValue({
      data: [activityRow("user-genuinely-inactive", clearlyExpiredLogin)],
      error: null,
    });

    const result = await listInactiveAccountCandidates(referenceInstant);

    expect(result.candidateUserIds).toEqual(["user-genuinely-inactive"]);
  });

  it("maps each Auth user to its own correct user_activity row, not another user's", async () => {
    listUsers.mockResolvedValue({
      data: {
        users: [
          user("user-1", clearlyExpiredLogin),
          user("user-2", clearlyExpiredLogin),
          user("user-3", clearlyExpiredLogin),
        ],
        nextPage: null,
      },
      error: null,
    });
    inMock.mockResolvedValue({
      data: [
        activityRow("user-1", clearlyActiveLogin), // protected
        activityRow("user-2", clearlyExpiredLogin), // still expired
        // user-3: no row -> falls back to last_sign_in_at (expired)
      ],
      error: null,
    });

    const result = await listInactiveAccountCandidates(referenceInstant);

    expect(result.candidateUserIds.sort()).toEqual(["user-2", "user-3"]);
  });

  it("walks every page when the Admin API paginates results, batching activity per page", async () => {
    listUsers
      .mockResolvedValueOnce({
        data: { users: [user("user-1", clearlyExpiredLogin)], nextPage: 2 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { users: [user("user-2", clearlyActiveLogin)], nextPage: 3 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { users: [user("user-3", clearlyExpiredLogin)], nextPage: null },
        error: null,
      });

    const result = await listInactiveAccountCandidates(referenceInstant);

    expect(result).toEqual({
      candidateUserIds: ["user-1", "user-3"],
      scanned: 3,
      truncated: false,
    });
    expect(listUsers).toHaveBeenCalledTimes(3);
    expect(inMock).toHaveBeenCalledTimes(3);
    expect(inMock).toHaveBeenNthCalledWith(1, "user_id", ["user-1"]);
    expect(inMock).toHaveBeenNthCalledWith(2, "user_id", ["user-2"]);
    expect(inMock).toHaveBeenNthCalledWith(3, "user_id", ["user-3"]);
  });

  it("returns no candidates when every user is active", async () => {
    listUsers.mockResolvedValue({
      data: {
        users: [user("user-a", clearlyActiveLogin), user("user-b", undefined)],
        nextPage: null,
      },
      error: null,
    });

    const result = await listInactiveAccountCandidates(referenceInstant);

    expect(result).toEqual({ candidateUserIds: [], scanned: 2, truncated: false });
  });

  it("stops at the page bound and reports truncated: true rather than silently skipping pages", async () => {
    listUsers.mockResolvedValue({
      data: { users: [user("user-x", clearlyExpiredLogin)], nextPage: 999 },
      error: null,
    });

    const result = await listInactiveAccountCandidates(referenceInstant);

    expect(listUsers).toHaveBeenCalledTimes(RETENTION_SCAN_MAX_PAGES);
    expect(result.truncated).toBe(true);
    expect(result.scanned).toBe(RETENTION_SCAN_MAX_PAGES);
    expect(result.candidateUserIds).toHaveLength(RETENTION_SCAN_MAX_PAGES);
  });

  it("throws (fails the whole run) when the Admin API listing itself fails, rather than silently returning partial candidates", async () => {
    listUsers.mockResolvedValue({
      data: { users: [] },
      error: { message: "Auth service unavailable" },
    });

    await expect(listInactiveAccountCandidates(referenceInstant)).rejects.toThrow(
      "Auth service unavailable"
    );
  });

  it("throws when the batched user_activity lookup itself fails", async () => {
    listUsers.mockResolvedValue({
      data: { users: [user("user-1", clearlyExpiredLogin)], nextPage: null },
      error: null,
    });
    inMock.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    await expect(listInactiveAccountCandidates(referenceInstant)).rejects.toThrow(
      "permission denied"
    );
  });

  it("does not query user_activity at all for an empty Auth page", async () => {
    listUsers.mockResolvedValue({ data: { users: [], nextPage: null }, error: null });

    await listInactiveAccountCandidates(referenceInstant);

    expect(fromMock).not.toHaveBeenCalled();
  });
});
