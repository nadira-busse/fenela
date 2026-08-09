import { describe, expect, it, vi, beforeEach } from "vitest";

// vitest runs in a plain Node environment (no window/localStorage), and
// src/lib/storage.ts's helpers already short-circuit to no-ops without one.
// Mocking the storage boundary (the same seam HomeClient/screeningStorage
// use) lets these tests prove the real key-clearing/marker transition
// without adding a jsdom/happy-dom dependency for one small module.
const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("@/lib/storage", () => ({
  loadFromStorage: <T>(key: string, fallback: T): T =>
    store.has(key) ? (store.get(key) as T) : fallback,
  saveToStorage: (key: string, value: unknown) => {
    store.set(key, value);
  },
  removeFromStorage: (key: string) => {
    store.delete(key);
  },
}));

const { ensureLocalOwnership, OWNER_MARKER_KEY, OWNED_STORAGE_KEYS } = await import("./localOwner");

const USER_A = "user-a-11111111-1111-1111-1111-111111111111";
const USER_B = "user-b-22222222-2222-2222-2222-222222222222";

function seedOwnedState() {
  for (const key of OWNED_STORAGE_KEYS) {
    store.set(key, `value-for-${key}`);
  }
}

describe("ensureLocalOwnership", () => {
  beforeEach(() => {
    store.clear();
  });

  it("retains existing local state when the marker already matches the current user", () => {
    store.set(OWNER_MARKER_KEY, USER_A);
    seedOwnedState();

    ensureLocalOwnership(USER_A);

    expect(store.get(OWNER_MARKER_KEY)).toBe(USER_A);
    for (const key of OWNED_STORAGE_KEYS) {
      expect(store.get(key)).toBe(`value-for-${key}`);
    }
  });

  it("resets owned state and reassigns the marker for a different authenticated user", () => {
    store.set(OWNER_MARKER_KEY, USER_A);
    seedOwnedState();

    ensureLocalOwnership(USER_B);

    expect(store.get(OWNER_MARKER_KEY)).toBe(USER_B);
    for (const key of OWNED_STORAGE_KEYS) {
      expect(store.has(key)).toBe(false);
    }
  });

  it("does not adopt old ownerless (pre-auth) local state when no marker exists yet", () => {
    seedOwnedState(); // old MVP1 state, never touched by an authenticated session

    ensureLocalOwnership(USER_A);

    expect(store.get(OWNER_MARKER_KEY)).toBe(USER_A);
    for (const key of OWNED_STORAGE_KEYS) {
      expect(store.has(key)).toBe(false);
    }
  });

  it("is a no-op (idempotent) when called repeatedly for the same user", () => {
    ensureLocalOwnership(USER_A);
    seedOwnedState();

    ensureLocalOwnership(USER_A);

    for (const key of OWNED_STORAGE_KEYS) {
      expect(store.get(key)).toBe(`value-for-${key}`);
    }
  });

  it("does not touch storage keys outside the owned list", () => {
    store.set(OWNER_MARKER_KEY, USER_A);
    store.set("fenela_device_id", "some-device-id");
    store.set("fenela:dailyReminder:startTime", "08:00");

    ensureLocalOwnership(USER_B);

    expect(store.get("fenela_device_id")).toBe("some-device-id");
    expect(store.get("fenela:dailyReminder:startTime")).toBe("08:00");
  });
});
