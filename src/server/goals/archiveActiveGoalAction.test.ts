import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireUser, UnauthenticatedError } = vi.hoisted(() => {
  class UnauthenticatedError extends Error {}
  return { requireUser: vi.fn(), UnauthenticatedError };
});

vi.mock("@/server/auth/requireUser", () => ({
  requireUser,
  UnauthenticatedError,
}));

const { createSupabaseServerClient, updateMock, eqOwnerMock, eqStatusMock, selectMock } =
  vi.hoisted(() => ({
    createSupabaseServerClient: vi.fn(),
    updateMock: vi.fn(),
    eqOwnerMock: vi.fn(),
    eqStatusMock: vi.fn(),
    selectMock: vi.fn(),
  }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

const { archiveActiveGoalAction } = await import("./archiveActiveGoalAction");

describe("archiveActiveGoalAction", () => {
  beforeEach(() => {
    requireUser.mockReset();
    updateMock.mockReset();
    eqOwnerMock.mockReset();
    eqStatusMock.mockReset();
    selectMock.mockReset();

    eqStatusMock.mockReturnValue({ select: selectMock });
    eqOwnerMock.mockReturnValue({ eq: eqStatusMock });
    updateMock.mockReturnValue({ eq: eqOwnerMock });

    createSupabaseServerClient.mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: updateMock }),
    });
  });

  it("fails closed when there is no authenticated user", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    const result = await archiveActiveGoalAction();

    expect(result).toEqual({
      ok: false,
      error: "UNAUTHENTICATED",
      message: "Your session expired. Please sign in again to continue.",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("scopes the update to the caller's own user_id and only the ACTIVE goal, never a caller-supplied id", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    selectMock.mockResolvedValue({ data: [{ id: "goal-1" }], error: null });

    await archiveActiveGoalAction();

    expect(eqOwnerMock).toHaveBeenCalledWith("user_id", "user-a");
    expect(eqStatusMock).toHaveBeenCalledWith("status", "ACTIVE");
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ARCHIVED", archived_at: expect.any(String) })
    );
  });

  it("returns the archived goal id when a goal was archived", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    selectMock.mockResolvedValue({ data: [{ id: "goal-1" }], error: null });

    const result = await archiveActiveGoalAction();

    expect(result).toEqual({ ok: true, archivedGoalId: "goal-1" });
  });

  it("returns a controlled no-op when there was no ACTIVE goal to archive", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    selectMock.mockResolvedValue({ data: [], error: null });

    const result = await archiveActiveGoalAction();

    expect(result).toEqual({ ok: true, archivedGoalId: null });
  });

  it("surfaces a database failure as a controlled result without leaking the raw error", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    selectMock.mockResolvedValue({ data: null, error: { message: "connection reset" } });

    const result = await archiveActiveGoalAction();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("DATABASE_ERROR");
      expect(result.message).not.toContain("connection reset");
    }
  });
});
