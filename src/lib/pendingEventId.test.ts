import { describe, expect, it } from "vitest";
import { createPendingEventIdSlot } from "./pendingEventId";

describe("createPendingEventIdSlot", () => {
  it("reuses the same id across repeated get() calls before clear() (a retry before success)", () => {
    const slot = createPendingEventIdSlot();

    const first = slot.get();
    const second = slot.get();

    expect(second).toBe(first);
  });

  it("returns a fresh id after clear() (the next distinct interaction, following success)", () => {
    const slot = createPendingEventIdSlot();

    const first = slot.get();
    slot.clear();
    const second = slot.get();

    expect(second).not.toBe(first);
  });

  it("returns a UUID-shaped id", () => {
    const slot = createPendingEventIdSlot();

    expect(slot.get()).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
