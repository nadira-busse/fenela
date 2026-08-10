import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { OWNER_MARKER_KEY, OWNED_STORAGE_KEYS } from "@/lib/localOwner";
import { syncAuthenticatedLocalState, LS_SCREENING_DONE_KEY } from "./authenticatedLocalSync";
import type { ActiveGoalWithAnchors } from "@/lib/goalMapping";

// src/lib/storage.ts checks `typeof window` and calls the bare `localStorage`
// global; src/lib/screeningStorage.ts calls `window.localStorage` directly.
// Faking both globals against one shared in-memory Map exercises the real
// modules together (no jsdom, no module mocking) — this is the compound
// "reset, then repopulate from DB" transition the hardening task asks to
// have proven, not just inspected.
function createFakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    _store: store,
  };
}

let fakeLocalStorage: ReturnType<typeof createFakeLocalStorage>;

const USER_A = "user-a-11111111-1111-1111-1111-111111111111";
const USER_B = "user-b-22222222-2222-2222-2222-222222222222";

const dbPreference = {
  name: "Nadira",
  mode: "SUGGEST_ANCHORS" as const,
  resistancePattern: "FORCE" as const,
  mainChallenge: "SUSTAIN" as const,
  actionTrigger: "WHY" as const,
  antiHelp: ["PRESSURE" as const],
};

const activeGoal: ActiveGoalWithAnchors = {
  id: "goal-1",
  title: "Walk daily",
  why: "Feel steadier",
  initialStruggle: "Low energy",
  personalAnchorInterpretation: null,
  anchors: [
    { id: "anchor-2", text: "Second anchor", source: "AI", position: 2 },
    { id: "anchor-1", text: "First anchor", source: "USER", position: 1 },
  ],
};

beforeEach(() => {
  fakeLocalStorage = createFakeLocalStorage();
  vi.stubGlobal("window", { localStorage: fakeLocalStorage });
  vi.stubGlobal("localStorage", fakeLocalStorage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("syncAuthenticatedLocalState", () => {
  it("resets foreign local state before repopulating the screening cache from the DB preference", () => {
    fakeLocalStorage._store.set(OWNER_MARKER_KEY, JSON.stringify(USER_A));
    fakeLocalStorage._store.set("fenela:intake", JSON.stringify({ goal: "A's goal" }));
    fakeLocalStorage._store.set("careAnchors", JSON.stringify(["A's anchor"]));

    syncAuthenticatedLocalState(USER_B, dbPreference, null);

    // A's foreign state is gone.
    expect(fakeLocalStorage._store.has("fenela:intake")).toBe(false);
    expect(fakeLocalStorage._store.has("careAnchors")).toBe(false);
    expect(fakeLocalStorage._store.get(OWNER_MARKER_KEY)).toBe(JSON.stringify(USER_B));

    // The screening cache was repopulated from the DB preference, not left
    // empty, and marked done — so screening is not incorrectly repeated.
    const screeningRaw = fakeLocalStorage._store.get("fenela:screening:v1");
    expect(screeningRaw).toBeDefined();
    const screening = JSON.parse(screeningRaw!);
    expect(screening.name).toBe("Nadira");
    expect(screening.mode).toBe("SUGGEST_ANCHORS");
    expect(fakeLocalStorage._store.get(LS_SCREENING_DONE_KEY)).toBe("true");
  });

  it("does not repopulate the screening cache when there is no DB preference yet", () => {
    syncAuthenticatedLocalState(USER_A, null, null);

    expect(fakeLocalStorage._store.get(OWNER_MARKER_KEY)).toBe(JSON.stringify(USER_A));
    expect(fakeLocalStorage._store.has("fenela:screening:v1")).toBe(false);
    expect(fakeLocalStorage._store.has(LS_SCREENING_DONE_KEY)).toBe(false);
  });

  it("preserves the same owner's local-only reminder fields while refreshing canonical fields from the DB", () => {
    fakeLocalStorage._store.set(OWNER_MARKER_KEY, JSON.stringify(USER_A));
    fakeLocalStorage._store.set(
      "fenela:screening:v1",
      JSON.stringify({
        version: 1,
        createdAtIso: "2026-01-01T00:00:00.000Z",
        name: "Old name",
        mode: "I_DECIDE",
        dailyReminder: "YES",
        startTime: "07:15",
        resistancePattern: "DELAY",
        mainChallenge: "START",
        actionTrigger: "SMALL",
        antiHelp: [],
        guidanceProfile: {},
      })
    );

    syncAuthenticatedLocalState(USER_A, dbPreference, null);

    const screening = JSON.parse(fakeLocalStorage._store.get("fenela:screening:v1")!);
    expect(screening.name).toBe("Nadira"); // refreshed from DB
    expect(screening.dailyReminder).toBe("YES"); // preserved local-only field
    expect(screening.startTime).toBe("07:15"); // preserved local-only field
  });

  it("clears every owned key for a different owner, not just the ones a caller happened to seed", () => {
    fakeLocalStorage._store.set(OWNER_MARKER_KEY, JSON.stringify(USER_A));
    for (const key of OWNED_STORAGE_KEYS) {
      fakeLocalStorage._store.set(key, "1");
    }

    syncAuthenticatedLocalState(USER_B, null, null);

    for (const key of OWNED_STORAGE_KEYS) {
      expect(fakeLocalStorage._store.has(key)).toBe(false);
    }
  });

  it("bridges the active goal + anchors into the intake/careAnchors compatibility cache, ordered by position", () => {
    syncAuthenticatedLocalState(USER_A, dbPreference, activeGoal);

    const intake = JSON.parse(fakeLocalStorage._store.get("fenela:intake")!);
    expect(intake).toEqual({
      name: "Nadira",
      goal: "Walk daily",
      struggle: "Low energy",
      goalWhy: "Feel steadier",
      personalAnchorInterpretation: undefined,
    });

    const careAnchors = JSON.parse(fakeLocalStorage._store.get("careAnchors")!);
    expect(careAnchors).toEqual([
      { id: "anchor-1", text: "First anchor", source: "USER" },
      { id: "anchor-2", text: "Second anchor", source: "AI" },
    ]);
  });

  it("clears stale local intake/careAnchors when the DB has no active goal, even for the same owner", () => {
    fakeLocalStorage._store.set(OWNER_MARKER_KEY, JSON.stringify(USER_A));
    fakeLocalStorage._store.set(
      "fenela:intake",
      JSON.stringify({ goal: "An old, now-archived goal" })
    );
    fakeLocalStorage._store.set("careAnchors", JSON.stringify(["stale anchor"]));

    // Same owner (no ownership reset triggered), but the DB now has no
    // ACTIVE goal — e.g. archived from a different device/session.
    syncAuthenticatedLocalState(USER_A, dbPreference, null);

    expect(fakeLocalStorage._store.has("fenela:intake")).toBe(false);
    expect(fakeLocalStorage._store.has("careAnchors")).toBe(false);
  });
});
