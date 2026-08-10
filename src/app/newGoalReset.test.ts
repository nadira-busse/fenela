import { describe, expect, it, vi } from "vitest";
import { performNewGoalReset, NEW_GOAL_ARCHIVE_FAILURE_MESSAGE } from "./newGoalReset";

describe("performNewGoalReset", () => {
  it("does not clear local state when the archive fails, and returns a calm controlled error", async () => {
    const archiveActiveGoal = vi.fn().mockResolvedValue({
      ok: false,
      error: "DATABASE_ERROR",
      message: "duplicate key value violates unique constraint",
    });
    const clearLocalGoalState = vi.fn();

    const result = await performNewGoalReset("user-a", {
      archiveActiveGoal,
      clearLocalGoalState,
    });

    expect(result).toEqual({ ok: false, message: NEW_GOAL_ARCHIVE_FAILURE_MESSAGE });
    expect(clearLocalGoalState).not.toHaveBeenCalled();
    // The raw DB error is never surfaced to the caller.
    if (!result.ok) {
      expect(result.message).not.toContain("constraint");
    }
  });

  it("clears local state only after the archive succeeds", async () => {
    const archiveActiveGoal = vi.fn().mockResolvedValue({ ok: true, archivedGoalId: "goal-1" });
    const clearLocalGoalState = vi.fn();

    const result = await performNewGoalReset("user-a", {
      archiveActiveGoal,
      clearLocalGoalState,
    });

    expect(result).toEqual({ ok: true });
    expect(clearLocalGoalState).toHaveBeenCalledTimes(1);
  });

  it("clears local state without attempting to archive when there is no authenticated user", async () => {
    const archiveActiveGoal = vi.fn();
    const clearLocalGoalState = vi.fn();

    const result = await performNewGoalReset(null, {
      archiveActiveGoal,
      clearLocalGoalState,
    });

    expect(result).toEqual({ ok: true });
    expect(archiveActiveGoal).not.toHaveBeenCalled();
    expect(clearLocalGoalState).toHaveBeenCalledTimes(1);
  });

  it("treats archiving with no ACTIVE goal to archive (a controlled no-op) as success", async () => {
    const archiveActiveGoal = vi.fn().mockResolvedValue({ ok: true, archivedGoalId: null });
    const clearLocalGoalState = vi.fn();

    const result = await performNewGoalReset("user-a", {
      archiveActiveGoal,
      clearLocalGoalState,
    });

    expect(result).toEqual({ ok: true });
    expect(clearLocalGoalState).toHaveBeenCalledTimes(1);
  });
});
