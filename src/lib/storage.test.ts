import { describe, expect, it } from "vitest";
import { isDayStateCurrent, createDayStateFromAnchors, type DayState } from "./storage";

const G1 = "goal-1111-1111-1111-111111111111";
const G2 = "goal-2222-2222-2222-222222222222";

function makeDayState(overrides: Partial<DayState> = {}): DayState {
  return {
    version: 3,
    dayKey: "2026-08-09",
    goalId: G1,
    activeTasks: [{ id: "a1", text: "Existing task", pauseCount: 0 }],
    parkedTasks: [],
    taskHistory: [],
    ...overrides,
  };
}

describe("isDayStateCurrent", () => {
  it("reuses day state for the same day and the same goal", () => {
    const stored = makeDayState({ dayKey: "2026-08-09", goalId: G1 });

    expect(isDayStateCurrent(stored, "2026-08-09", G1)).toBe(true);
  });

  it("does not reuse day state for a different goal, even on the same day", () => {
    const stored = makeDayState({ dayKey: "2026-08-09", goalId: G1 });

    expect(isDayStateCurrent(stored, "2026-08-09", G2)).toBe(false);
  });

  it("does not reuse day state for a different day, even for the same goal", () => {
    const stored = makeDayState({ dayKey: "2026-08-08", goalId: G1 });

    expect(isDayStateCurrent(stored, "2026-08-09", G1)).toBe(false);
  });

  it("treats legacy day state with no goalId as stale for an authenticated persisted Goal", () => {
    const stored = makeDayState({ dayKey: "2026-08-09", goalId: undefined });

    expect(isDayStateCurrent(stored, "2026-08-09", G1)).toBe(false);
  });

  it("preserves dayKey-only behavior for the unauthenticated/local-only path (both sides undefined)", () => {
    const stored = makeDayState({ dayKey: "2026-08-09", goalId: undefined });

    expect(isDayStateCurrent(stored, "2026-08-09", undefined)).toBe(true);
  });

  it("returns false when there is no stored day state at all", () => {
    expect(isDayStateCurrent(null, "2026-08-09", G1)).toBe(false);
  });
});

describe("createDayStateFromAnchors", () => {
  it("stamps the given goalId onto the created day state", () => {
    const result = createDayStateFromAnchors(["Drink water", "Stretch gently"], G1);

    expect(result.goalId).toBe(G1);
    expect(result.activeTasks).toEqual([
      { id: "a1", text: "Drink water", pauseCount: 0 },
      { id: "a2", text: "Stretch gently", pauseCount: 0 },
    ]);
  });

  it("omits goalId when none is given (unauthenticated/local-only path)", () => {
    const result = createDayStateFromAnchors(["Drink water"]);

    expect(result.goalId).toBeUndefined();
  });

  it("filters out blank anchor text before building tasks", () => {
    const result = createDayStateFromAnchors(["Drink water", "  ", ""], G1);

    expect(result.activeTasks.map((task) => task.text)).toEqual(["Drink water"]);
  });
});
