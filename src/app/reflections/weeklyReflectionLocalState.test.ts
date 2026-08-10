import { describe, expect, it, vi, beforeEach } from "vitest";

const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/lib/storage", () => ({
  loadFromStorage: <T>(key: string, fallback: T): T =>
    store.has(key) ? (store.get(key) as T) : fallback,
  saveToStorage: (key: string, value: unknown) => {
    store.set(key, value);
  },
}));

const {
  getLastSeenWeeklyReflectionId,
  saveLastSeenWeeklyReflectionId,
  LS_LAST_SEEN_WEEKLY_REFLECTION_ID_KEY,
} = await import("./weeklyReflectionLocalState");

describe("weeklyReflectionLocalState", () => {
  beforeEach(() => {
    store.clear();
  });

  it("returns null when nothing has been marked as seen yet", () => {
    expect(getLastSeenWeeklyReflectionId()).toBeNull();
  });

  it("returns the saved id after marking a reflection as seen", () => {
    saveLastSeenWeeklyReflectionId("reflection-1");

    expect(getLastSeenWeeklyReflectionId()).toBe("reflection-1");
    expect(store.get(LS_LAST_SEEN_WEEKLY_REFLECTION_ID_KEY)).toBe("reflection-1");
  });

  it("overwrites a previously saved id with the latest one", () => {
    saveLastSeenWeeklyReflectionId("reflection-1");
    saveLastSeenWeeklyReflectionId("reflection-2");

    expect(getLastSeenWeeklyReflectionId()).toBe("reflection-2");
  });
});
