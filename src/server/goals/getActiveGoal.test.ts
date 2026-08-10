import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireUser, UnauthenticatedError } = vi.hoisted(() => {
  class UnauthenticatedError extends Error {}
  return { requireUser: vi.fn(), UnauthenticatedError };
});

vi.mock("@/server/auth/requireUser", () => ({
  requireUser,
  UnauthenticatedError,
}));

const {
  createSupabaseServerClient,
  goalMaybeSingleMock,
  goalEqUserMock,
  goalEqStatusMock,
  anchorOrderMock,
  anchorEqGoalMock,
  anchorEqStatusMock,
  fromMock,
} = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  goalMaybeSingleMock: vi.fn(),
  goalEqUserMock: vi.fn(),
  goalEqStatusMock: vi.fn(),
  anchorOrderMock: vi.fn(),
  anchorEqGoalMock: vi.fn(),
  anchorEqStatusMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

const { getActiveGoal } = await import("./getActiveGoal");

describe("getActiveGoal", () => {
  beforeEach(() => {
    requireUser.mockReset();
    goalMaybeSingleMock.mockReset();
    goalEqUserMock.mockReset();
    goalEqStatusMock.mockReset();
    anchorOrderMock.mockReset();
    anchorEqGoalMock.mockReset();
    anchorEqStatusMock.mockReset();
    fromMock.mockReset();

    // goals: .from("goals").select("*").eq("user_id", ...).eq("status", ...).maybeSingle()
    goalEqStatusMock.mockReturnValue({ maybeSingle: goalMaybeSingleMock });
    goalEqUserMock.mockReturnValue({ eq: goalEqStatusMock });
    const goalSelect = { eq: goalEqUserMock };

    // anchors: .from("anchors").select("*").eq("goal_id", ...).eq("status", ...).order(...)
    anchorEqStatusMock.mockReturnValue({ order: anchorOrderMock });
    anchorEqGoalMock.mockReturnValue({ eq: anchorEqStatusMock });
    const anchorSelect = { eq: anchorEqGoalMock };

    fromMock.mockImplementation((table: string) => {
      if (table === "goals") return { select: vi.fn().mockReturnValue(goalSelect) };
      if (table === "anchors") return { select: vi.fn().mockReturnValue(anchorSelect) };
      throw new Error(`unexpected table ${table}`);
    });

    createSupabaseServerClient.mockResolvedValue({ from: fromMock });
  });

  it("propagates (fails closed) when there is no authenticated user", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    await expect(getActiveGoal()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("returns null when there is no active goal", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    goalMaybeSingleMock.mockResolvedValue({ data: null, error: null });

    await expect(getActiveGoal()).resolves.toBeNull();
  });

  it("returns the active goal with anchors ordered by position and mapped provenance", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    goalMaybeSingleMock.mockResolvedValue({
      data: {
        id: "goal-1",
        title: "Walk daily",
        why: "Feel steadier",
        initial_struggle: "Low energy",
        personal_anchor_interpretation: null,
        interpretation_source: null,
      },
      error: null,
    });
    anchorOrderMock.mockResolvedValue({
      data: [
        { id: "a1", text: "First", source: "USER", position: 1 },
        { id: "a2", text: "Second", source: "NOT_REAL", position: 2 },
      ],
      error: null,
    });

    const result = await getActiveGoal();

    expect(result).toEqual({
      id: "goal-1",
      title: "Walk daily",
      why: "Feel steadier",
      initialStruggle: "Low energy",
      personalAnchorInterpretation: null,
      anchors: [
        { id: "a1", text: "First", source: "USER", position: 1 },
        { id: "a2", text: "Second", source: "USER", position: 2 }, // defensive fallback
      ],
    });
    expect(anchorEqGoalMock).toHaveBeenCalledWith("goal_id", "goal-1");
    expect(anchorEqStatusMock).toHaveBeenCalledWith("status", "ACTIVE");
  });

  it("scopes the goal read to the server-derived user id, not a caller-supplied one", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    goalMaybeSingleMock.mockResolvedValue({ data: null, error: null });

    await getActiveGoal();

    expect(goalEqUserMock).toHaveBeenCalledWith("user_id", "user-a");
    expect(goalEqStatusMock).toHaveBeenCalledWith("status", "ACTIVE");
  });

  it("throws a controlled error on a goal read failure", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    goalMaybeSingleMock.mockResolvedValue({ data: null, error: { message: "connection reset" } });

    await expect(getActiveGoal()).rejects.toThrow(/Failed to load active goal/);
  });
});
