import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { resolveWeeklyReflectionCore } = vi.hoisted(() => ({
  resolveWeeklyReflectionCore: vi.fn(),
}));

vi.mock("./resolveWeeklyReflectionCore", () => ({ resolveWeeklyReflectionCore }));

const { resolveWeeklyReflection } = await import("./resolveWeeklyReflection");

const NOW = new Date("2026-08-24T12:00:00.000Z");

// Same untrusted-input-boundary regression coverage as
// createReflectionForPeriod.test.ts: this Server Action takes no arguments
// at all, so there is nothing a caller can inject — proves the period is
// always derived from "now" at call time, pinned here via fake timers.
describe("resolveWeeklyReflection (public Server Action — untrusted boundary)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    resolveWeeklyReflectionCore.mockReset();
    resolveWeeklyReflectionCore.mockResolvedValue({ ok: true, reflection: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("forwards only { referenceInstant: now } to the trusted core", async () => {
    await resolveWeeklyReflection();

    expect(resolveWeeklyReflectionCore).toHaveBeenCalledTimes(1);
    expect(resolveWeeklyReflectionCore).toHaveBeenCalledWith({ referenceInstant: NOW });
  });

  it("uses a fresh 'now' on each call rather than a value cached across requests", async () => {
    await resolveWeeklyReflection();
    const firstCallInstant = resolveWeeklyReflectionCore.mock.calls[0][0].referenceInstant;

    const later = new Date("2026-08-25T12:00:00.000Z");
    vi.setSystemTime(later);

    await resolveWeeklyReflection();
    const secondCallInstant = resolveWeeklyReflectionCore.mock.calls[1][0].referenceInstant;

    expect(firstCallInstant).toEqual(NOW);
    expect(secondCallInstant).toEqual(later);
  });

  it("returns whatever the core resolves, unmodified", async () => {
    const reflection = { id: "reflection-1" };
    resolveWeeklyReflectionCore.mockResolvedValue({ ok: true, reflection });

    const result = await resolveWeeklyReflection();

    expect(result).toEqual({ ok: true, reflection });
  });
});
