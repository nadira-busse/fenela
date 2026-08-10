import { describe, expect, it } from "vitest";
import { isDayStateCurrent, createDayStateFromAnchors, type DayState } from "./storage";

const G1 = "goal-1111-1111-1111-111111111111";
const G2 = "goal-2222-2222-2222-222222222222";
const PERSISTED_ANCHOR_ID = "11111111-1111-1111-1111-111111111111";

function makeDayState(overrides: Partial<DayState> = {}): DayState {
  return {
    version: 3,
    dayKey: "2026-08-09",
    goalId: G1,
    activeTasks: [{ id: PERSISTED_ANCHOR_ID, text: "Existing task", pauseCount: 0 }],
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

  it("reuses authenticated day state when every active task carries a valid persisted Anchor UUID", () => {
    const stored = makeDayState({
      dayKey: "2026-08-09",
      goalId: G1,
      activeTasks: [
        { id: "11111111-1111-1111-1111-111111111111", text: "First", pauseCount: 0 },
        { id: "22222222-2222-2222-2222-222222222222", text: "Second", pauseCount: 1 },
      ],
    });

    expect(isDayStateCurrent(stored, "2026-08-09", G1)).toBe(true);
  });

  it("treats same-day, same-goal authenticated state as stale when a task carries a legacy synthetic id (Phase 4C hardening, Defect A)", () => {
    const stored = makeDayState({
      dayKey: "2026-08-09",
      goalId: G1,
      activeTasks: [{ id: "a1", text: "Existing task", pauseCount: 0 }],
    });

    expect(isDayStateCurrent(stored, "2026-08-09", G1)).toBe(false);
  });

  it("treats authenticated state as stale when only one of several active tasks has a synthetic id", () => {
    const stored = makeDayState({
      dayKey: "2026-08-09",
      goalId: G1,
      activeTasks: [
        { id: "11111111-1111-1111-1111-111111111111", text: "First", pauseCount: 0 },
        { id: "a2", text: "Second", pauseCount: 0 },
      ],
    });

    expect(isDayStateCurrent(stored, "2026-08-09", G1)).toBe(false);
  });

  it("treats authenticated state as stale when a task id is missing or malformed", () => {
    const missingId = makeDayState({
      dayKey: "2026-08-09",
      goalId: G1,
      activeTasks: [{ id: "", text: "Existing task", pauseCount: 0 }],
    });

    expect(isDayStateCurrent(missingId, "2026-08-09", G1)).toBe(false);
  });

  it("preserves the existing synthetic-id behavior for the unauthenticated/local-only path", () => {
    const stored = makeDayState({
      dayKey: "2026-08-09",
      goalId: undefined,
      activeTasks: [{ id: "a1", text: "Existing task", pauseCount: 0 }],
    });

    expect(isDayStateCurrent(stored, "2026-08-09", undefined)).toBe(true);
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

  it("uses the persisted database Anchor id when the anchor carries one (Phase 4C §7)", () => {
    const result = createDayStateFromAnchors(
      [
        { id: "anchor-real-uuid-1", text: "Drink water", source: "USER" },
        { id: "anchor-real-uuid-2", text: "Stretch gently", source: "AI" },
      ],
      G1
    );

    expect(result.activeTasks).toEqual([
      { id: "anchor-real-uuid-1", text: "Drink water", pauseCount: 0 },
      { id: "anchor-real-uuid-2", text: "Stretch gently", pauseCount: 0 },
    ]);
  });

  it("falls back to a synthetic per-position id for legacy anchors with no persisted id", () => {
    const result = createDayStateFromAnchors([{ text: "Drink water", source: "USER" }], G1);

    expect(result.activeTasks).toEqual([{ id: "a1", text: "Drink water", pauseCount: 0 }]);
  });
});

// Composes isDayStateCurrent + createDayStateFromAnchors exactly as
// CoachingScreen.tsx's hydration effect does, proving the actual rebuild
// decision boundary end-to-end rather than only the isolated validator
// (Phase 4C hardening, Defect A §4).
describe("legacy day-state rebuild boundary (Phase 4C hardening, Defect A)", () => {
  it("a stale legacy dayState is rebuilt from persisted careAnchors into task ids that pass the freshness check again", () => {
    const legacyStored = makeDayState({
      dayKey: "2026-08-09",
      goalId: G1,
      activeTasks: [{ id: "a1", text: "Old anchor text", pauseCount: 0 }],
    });

    expect(isDayStateCurrent(legacyStored, "2026-08-09", G1)).toBe(false);

    // Mirrors CoachingScreen's "not current" branch: rebuild from the
    // DB-restored careAnchors compatibility cache.
    const persistedCareAnchors = [
      { id: "11111111-1111-1111-1111-111111111111", text: "Drink water", source: "USER" as const },
      { id: "22222222-2222-2222-2222-222222222222", text: "Stretch gently", source: "AI" as const },
    ];

    const rebuilt = createDayStateFromAnchors(persistedCareAnchors, G1);

    expect(rebuilt.activeTasks.map((task) => task.id)).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
    // createDayStateFromAnchors stamps today's real dayKey (not the fixed
    // "2026-08-09" used above for the staleness check), so the freshness
    // check here is against the rebuilt state's own dayKey.
    expect(isDayStateCurrent(rebuilt, rebuilt.dayKey, G1)).toBe(true);
  });
});
