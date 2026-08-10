import { describe, expect, it, vi, beforeEach } from "vitest";

const { requireUser, UnauthenticatedError } = vi.hoisted(() => {
  class UnauthenticatedError extends Error {}
  return { requireUser: vi.fn(), UnauthenticatedError };
});

vi.mock("@/server/auth/requireUser", () => ({
  requireUser,
  UnauthenticatedError,
}));

const { createSupabaseServerClient, rpcMock } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient,
}));

const { createGoalWithAnchorsAction } = await import("./createGoalWithAnchorsAction");

function validInput() {
  return {
    title: "Walk daily",
    why: "Feel steadier",
    initialStruggle: "Low energy",
    personalAnchorInterpretation: null,
    interpretationSource: null,
    anchors: [
      { text: "Put on shoes", source: "USER" as const, position: 1 },
      { text: "Step outside", source: "USER" as const, position: 2 },
    ],
  };
}

function rpcRows() {
  return [
    {
      goal_id: "goal-1",
      anchor_id: "anchor-1",
      anchor_text: "Put on shoes",
      anchor_source: "USER",
      anchor_position: 1,
    },
    {
      goal_id: "goal-1",
      anchor_id: "anchor-2",
      anchor_text: "Step outside",
      anchor_source: "USER",
      anchor_position: 2,
    },
  ];
}

describe("createGoalWithAnchorsAction", () => {
  beforeEach(() => {
    requireUser.mockReset();
    rpcMock.mockReset();
    createSupabaseServerClient.mockReset();
    createSupabaseServerClient.mockResolvedValue({ rpc: rpcMock });
  });

  it("fails closed when there is no authenticated user", async () => {
    requireUser.mockRejectedValue(new UnauthenticatedError("no session"));

    const result = await createGoalWithAnchorsAction(validInput());

    expect(result).toEqual({
      ok: false,
      error: "UNAUTHENTICATED",
      message: "Your session expired. Please sign in again to continue.",
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects invalid input before calling the RPC", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });

    const result = await createGoalWithAnchorsAction({ ...validInput(), title: "" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_INPUT");
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects zero anchors before calling the RPC", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });

    const result = await createGoalWithAnchorsAction({ ...validInput(), anchors: [] });

    expect(result.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("never sends a caller-supplied user id — ownership comes only from requireUser() inside the RPC itself", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    rpcMock.mockResolvedValue({ data: rpcRows(), error: null });

    await createGoalWithAnchorsAction(validInput());

    const [, args] = rpcMock.mock.calls[0];
    expect(args).not.toHaveProperty("user_id");
    expect(args).not.toHaveProperty("p_user_id");
  });

  it("calls the RPC with mapped args and returns the created goal + anchors on success", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    rpcMock.mockResolvedValue({ data: rpcRows(), error: null });

    const result = await createGoalWithAnchorsAction(validInput());

    expect(rpcMock).toHaveBeenCalledWith(
      "create_active_goal_with_anchors",
      expect.objectContaining({
        p_title: "Walk daily",
        p_why: "Feel steadier",
        p_initial_struggle: "Low energy",
        p_anchors: [
          { text: "Put on shoes", source: "USER", position: 1 },
          { text: "Step outside", source: "USER", position: 2 },
        ],
      })
    );

    expect(result).toEqual({
      ok: true,
      goalId: "goal-1",
      anchors: [
        { id: "anchor-1", text: "Put on shoes", source: "USER", position: 1 },
        { id: "anchor-2", text: "Step outside", source: "USER", position: 2 },
      ],
    });
  });

  it("surfaces an RPC failure (e.g. transaction rollback) as a controlled result without leaking the raw error", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: 'duplicate key value violates unique constraint "goals_one_active_per_user"',
      },
    });

    const result = await createGoalWithAnchorsAction(validInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("DATABASE_ERROR");
      expect(result.message).not.toContain("goals_one_active_per_user");
    }
  });

  it("treats an empty RPC result as a controlled database error", async () => {
    requireUser.mockResolvedValue({ id: "user-a" });
    rpcMock.mockResolvedValue({ data: [], error: null });

    const result = await createGoalWithAnchorsAction(validInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("DATABASE_ERROR");
    }
  });
});
