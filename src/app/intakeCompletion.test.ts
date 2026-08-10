import { describe, expect, it, vi } from "vitest";
import { performIntakeCompletion } from "./intakeCompletion";
import type { IntakeCompletionData } from "./components/IntakeScreen";

function validData(): IntakeCompletionData {
  return {
    name: "Nadira",
    goal: "Walk daily",
    struggle: "Low energy",
    goalWhy: "Feel steadier",
    personalAnchorInterpretation: undefined,
    interpretationSource: "FALLBACK",
    anchors: [
      { id: "local-1", text: "Put on shoes", source: "USER" },
      { id: "local-2", text: "Step outside", source: "USER" },
    ],
  };
}

describe("performIntakeCompletion", () => {
  it("does not apply any compatibility state when the authenticated DB creation fails", async () => {
    const createGoalWithAnchors = vi.fn().mockResolvedValue({
      ok: false,
      error: "DATABASE_ERROR",
      message: "Could not save your goal right now. Please try again.",
    });
    const applyCompletedIntake = vi.fn();

    const result = await performIntakeCompletion("user-a", validData(), {
      createGoalWithAnchors,
      applyCompletedIntake,
    });

    expect(result).toEqual({
      ok: false,
      message: "Could not save your goal right now. Please try again.",
    });
    expect(applyCompletedIntake).not.toHaveBeenCalled();
  });

  it("calls the DB action with mapped input for an authenticated user", async () => {
    const createGoalWithAnchors = vi.fn().mockResolvedValue({
      ok: true,
      goalId: "goal-1",
      anchors: [
        { id: "anchor-1", text: "Put on shoes", source: "USER", position: 1 },
        { id: "anchor-2", text: "Step outside", source: "USER", position: 2 },
      ],
    });
    const applyCompletedIntake = vi.fn();

    await performIntakeCompletion("user-a", validData(), {
      createGoalWithAnchors,
      applyCompletedIntake,
    });

    expect(createGoalWithAnchors).toHaveBeenCalledWith({
      title: "Walk daily",
      why: "Feel steadier",
      initialStruggle: "Low energy",
      personalAnchorInterpretation: null,
      interpretationSource: "FALLBACK",
      anchors: [
        { text: "Put on shoes", source: "USER", position: 1 },
        { text: "Step outside", source: "USER", position: 2 },
      ],
    });
  });

  it("applies compatibility state using the canonical persisted anchors only after the DB creation succeeds", async () => {
    const createGoalWithAnchors = vi.fn().mockResolvedValue({
      ok: true,
      goalId: "goal-1",
      anchors: [
        // Deliberately out of order and with an unrecognized source, to
        // prove the result is re-sorted by position and defensively
        // normalized rather than trusted as-is.
        { id: "anchor-2", text: "Step outside", source: "USER", position: 2 },
        { id: "anchor-1", text: "Put on shoes", source: "not-a-real-source", position: 1 },
      ],
    });
    const applyCompletedIntake = vi.fn();

    const result = await performIntakeCompletion("user-a", validData(), {
      createGoalWithAnchors,
      applyCompletedIntake,
    });

    expect(result).toEqual({ ok: true });
    expect(applyCompletedIntake).toHaveBeenCalledTimes(1);
    expect(applyCompletedIntake).toHaveBeenCalledWith({
      goalId: "goal-1",
      intake: {
        name: "Nadira",
        goal: "Walk daily",
        struggle: "Low energy",
        goalWhy: "Feel steadier",
        personalAnchorInterpretation: undefined,
      },
      careAnchors: [
        { id: "anchor-1", text: "Put on shoes", source: "USER" },
        { id: "anchor-2", text: "Step outside", source: "USER" },
      ],
    });
  });

  it("skips the DB call and applies the submitted anchors directly for an unauthenticated (local-only) user", async () => {
    const createGoalWithAnchors = vi.fn();
    const applyCompletedIntake = vi.fn();

    const result = await performIntakeCompletion(null, validData(), {
      createGoalWithAnchors,
      applyCompletedIntake,
    });

    expect(result).toEqual({ ok: true });
    expect(createGoalWithAnchors).not.toHaveBeenCalled();
    expect(applyCompletedIntake).toHaveBeenCalledWith({
      goalId: undefined,
      intake: {
        name: "Nadira",
        goal: "Walk daily",
        struggle: "Low energy",
        goalWhy: "Feel steadier",
        personalAnchorInterpretation: undefined,
      },
      careAnchors: validData().anchors,
    });
  });
});
