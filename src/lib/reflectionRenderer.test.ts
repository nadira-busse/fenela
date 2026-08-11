import { describe, expect, it } from "vitest";
import { renderDeterministicReflectionText } from "./reflectionRenderer";
import type { ReflectionFacts } from "./reflectionAggregation";

const PERIOD = {
  type: "WEEKLY" as const,
  start: "2026-03-16",
  end: "2026-03-22",
  timeZone: "Europe/Amsterdam",
};

function makeFacts(
  overrides: Partial<ReflectionFacts["activity"]> = {},
  frictionEntriesCount = 0
): ReflectionFacts {
  return {
    period: PERIOD,
    activity: {
      activeDays: 0,
      startedCount: 0,
      completedCount: 0,
      postponedCount: 0,
      parkedCount: 0,
      ...overrides,
    },
    friction: {
      entriesCount: frictionEntriesCount,
    },
  };
}

describe("renderDeterministicReflectionText", () => {
  it("is deterministic — the same facts always produce the exact same text", () => {
    const facts = makeFacts({ activeDays: 3, completedCount: 4, postponedCount: 2 });

    expect(renderDeterministicReflectionText(facts)).toBe(renderDeterministicReflectionText(facts));
  });

  it("produces calm, valid output for an empty period", () => {
    const facts = makeFacts();

    expect(renderDeterministicReflectionText(facts)).toBe(
      "There was no recorded activity in this period."
    );
  });

  it("renders a representative WEEKLY-shaped summary", () => {
    const facts = makeFacts({ activeDays: 3, completedCount: 4, postponedCount: 2 }, 2);

    expect(renderDeterministicReflectionText(facts)).toBe(
      "You came back on 3 days.\n" +
        "You completed 4 actions and postponed 2 actions.\n" +
        "You noted 2 moments of friction."
    );
  });

  it("renders a representative MONTHLY-shaped summary (same renderer, larger counts)", () => {
    const facts: ReflectionFacts = {
      period: {
        type: "MONTHLY",
        start: "2026-03-01",
        end: "2026-03-31",
        timeZone: "Europe/Amsterdam",
      },
      activity: {
        activeDays: 14,
        startedCount: 20,
        completedCount: 16,
        postponedCount: 5,
        parkedCount: 2,
      },
      friction: { entriesCount: 3 },
    };

    expect(renderDeterministicReflectionText(facts)).toBe(
      "You came back on 14 days.\n" +
        "You completed 16 actions and postponed 5 actions.\n" +
        "2 anchors were parked for the day.\n" +
        "You noted 3 moments of friction."
    );
  });

  it("uses singular wording for count-of-one values", () => {
    const facts = makeFacts({ activeDays: 1, completedCount: 1, parkedCount: 1 }, 1);

    expect(renderDeterministicReflectionText(facts)).toBe(
      "You came back on 1 day.\n" +
        "You completed 1 action.\n" +
        "1 anchor was parked for the day.\n" +
        "You noted 1 moment of friction."
    );
  });

  it("never includes a percentage, rate, or score", () => {
    const facts = makeFacts(
      { activeDays: 5, completedCount: 3, postponedCount: 3, parkedCount: 1 },
      1
    );
    const text = renderDeterministicReflectionText(facts);

    expect(text).not.toMatch(/%|rate|score|streak|productiv/i);
  });

  it("never mentions AI or a model", () => {
    const facts = makeFacts({ activeDays: 1 });
    const text = renderDeterministicReflectionText(facts);

    expect(text).not.toMatch(/AI|model|GPT/i);
  });

  it("includes friction presence as a factual count only — ReflectionFacts carries no raw reason text to echo (Phase 4H hardening)", () => {
    const facts = makeFacts({}, 1);
    const text = renderDeterministicReflectionText(facts);

    expect(text).toContain("1 moment of friction");
  });
});
