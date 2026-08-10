import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { createReflectionForPeriodCore } = vi.hoisted(() => ({
  createReflectionForPeriodCore: vi.fn(),
}));

vi.mock("./createReflectionForPeriodCore", () => ({ createReflectionForPeriodCore }));

const { createReflectionForPeriod } = await import("./createReflectionForPeriod");

const NOW = new Date("2026-06-15T12:00:00.000Z");

// Regression coverage for the code-review finding: createReflectionForPeriod
// is a "use server" Server Action, so its input is untrusted. Reflection
// rows are immutable and idempotent per (user, type, period) — a
// caller-chosen referenceInstant could otherwise permanently lock in an
// incomplete current period or an empty future one. These tests prove the
// public wrapper always uses "now" (pinned here via fake timers) and never
// forwards anything else from the input, even when a caller bypasses
// TypeScript to inject extra fields.
describe("createReflectionForPeriod (public Server Action — untrusted input boundary)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    createReflectionForPeriodCore.mockReset();
    createReflectionForPeriodCore.mockResolvedValue({
      ok: true,
      created: true,
      reflection: {} as never,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("forwards only { type, referenceInstant: now } to the trusted core — the public input type has no other fields", async () => {
    await createReflectionForPeriod({ type: "WEEKLY" });

    expect(createReflectionForPeriodCore).toHaveBeenCalledTimes(1);
    expect(createReflectionForPeriodCore).toHaveBeenCalledWith({
      type: "WEEKLY",
      referenceInstant: NOW,
    });
  });

  it("ignores an injected historical referenceInstant — the period is always derived from now", async () => {
    const historicalInstant = new Date("2020-01-01T00:00:00.000Z");

    await createReflectionForPeriod({
      type: "WEEKLY",
      referenceInstant: historicalInstant,
    } as never);

    const forwarded = createReflectionForPeriodCore.mock.calls[0][0];
    expect(forwarded.referenceInstant).toEqual(NOW);
    expect(forwarded.referenceInstant).not.toEqual(historicalInstant);
  });

  it("ignores an injected future referenceInstant — the period is always derived from now", async () => {
    const futureInstant = new Date("2099-01-01T00:00:00.000Z");

    await createReflectionForPeriod({
      type: "MONTHLY",
      referenceInstant: futureInstant,
    } as never);

    const forwarded = createReflectionForPeriodCore.mock.calls[0][0];
    expect(forwarded.referenceInstant).toEqual(NOW);
    expect(forwarded.referenceInstant).not.toEqual(futureInstant);
  });

  it("ignores injected period_start/period_end — the caller cannot choose arbitrary period boundaries", async () => {
    await createReflectionForPeriod({
      type: "WEEKLY",
      period_start: "2020-01-06",
      period_end: "2020-01-12",
    } as never);

    const forwarded = createReflectionForPeriodCore.mock.calls[0][0];
    expect(forwarded).toEqual({ type: "WEEKLY", referenceInstant: NOW });
    expect(forwarded).not.toHaveProperty("period_start");
    expect(forwarded).not.toHaveProperty("period_end");
  });

  it("ignores any other injected fields (facts_snapshot, generated_text, user_id, model, time_zone)", async () => {
    await createReflectionForPeriod({
      type: "MONTHLY",
      facts_snapshot: { fabricated: true },
      generated_text: "fabricated",
      user_id: "someone-elses-id",
      model: "gpt-4",
      time_zone: "Pacific/Kiritimati",
    } as never);

    const forwarded = createReflectionForPeriodCore.mock.calls[0][0];
    expect(forwarded).toEqual({ type: "MONTHLY", referenceInstant: NOW });
  });

  it("uses a fresh 'now' on each call rather than a value cached across requests", async () => {
    await createReflectionForPeriod({ type: "WEEKLY" });
    const firstCallInstant = createReflectionForPeriodCore.mock.calls[0][0].referenceInstant;

    const later = new Date("2026-06-16T12:00:00.000Z");
    vi.setSystemTime(later);

    await createReflectionForPeriod({ type: "WEEKLY" });
    const secondCallInstant = createReflectionForPeriodCore.mock.calls[1][0].referenceInstant;

    expect(firstCallInstant).toEqual(NOW);
    expect(secondCallInstant).toEqual(later);
  });
});
