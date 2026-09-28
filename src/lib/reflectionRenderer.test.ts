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
      completedAnchors: [],
      notCompletedAnchors: [],
      ...overrides,
    },
    friction: {
      entriesCount: frictionEntriesCount,
    },
  };
}

describe("renderDeterministicReflectionText", () => {
  it("is deterministic — the same facts always produce the exact same text", () => {
    const facts = makeFacts({
      activeDays: 3,
      completedAnchors: ["Read for 10 minutes"],
      notCompletedAnchors: ["Walk for 20 minutes"],
    });

    expect(renderDeterministicReflectionText(facts)).toBe(renderDeterministicReflectionText(facts));
  });

  it("produces calm, valid output for an empty period", () => {
    const facts = makeFacts();

    expect(renderDeterministicReflectionText(facts)).toBe(
      "There was no recorded activity in this period."
    );
  });

  it("names what was completed and what was not, concretely", () => {
    const facts = makeFacts(
      {
        activeDays: 3,
        completedCount: 4,
        postponedCount: 2,
        completedAnchors: ["Read for 10 minutes"],
        notCompletedAnchors: ["Walk for 20 minutes", "Journal for 5 minutes"],
      },
      2
    );

    expect(renderDeterministicReflectionText(facts)).toBe(
      "You came back on 3 days.\n" +
        "You completed: Read for 10 minutes.\n" +
        "You did not complete: Walk for 20 minutes and Journal for 5 minutes.\n" +
        "You noted 2 moments of friction."
    );
  });

  it("omits the completed line entirely when nothing was completed", () => {
    const facts = makeFacts({
      activeDays: 1,
      notCompletedAnchors: ["Walk for 20 minutes"],
    });

    expect(renderDeterministicReflectionText(facts)).toBe(
      "You came back on 1 day.\nYou did not complete: Walk for 20 minutes."
    );
  });

  it("omits the not-completed line entirely when everything touched was completed", () => {
    const facts = makeFacts({
      activeDays: 1,
      completedAnchors: ["Read for 10 minutes"],
    });

    expect(renderDeterministicReflectionText(facts)).toBe(
      "You came back on 1 day.\nYou completed: Read for 10 minutes."
    );
  });

  it("joins three or more anchors with a trailing 'and', not just commas", () => {
    const facts = makeFacts({
      activeDays: 1,
      completedAnchors: ["Read for 10 minutes", "Walk for 20 minutes", "Journal for 5 minutes"],
    });

    expect(renderDeterministicReflectionText(facts)).toBe(
      "You came back on 1 day.\n" +
        "You completed: Read for 10 minutes, Walk for 20 minutes, and Journal for 5 minutes."
    );
  });

  it("uses singular wording for count-of-one values", () => {
    const facts = makeFacts({ activeDays: 1, completedAnchors: ["Read for 10 minutes"] }, 1);

    expect(renderDeterministicReflectionText(facts)).toBe(
      "You came back on 1 day.\n" +
        "You completed: Read for 10 minutes.\n" +
        "You noted 1 moment of friction."
    );
  });

  it("never includes a percentage, rate, or score", () => {
    const facts = makeFacts(
      {
        activeDays: 5,
        completedAnchors: ["Read for 10 minutes"],
        notCompletedAnchors: ["Walk for 20 minutes"],
      },
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

  it("includes friction presence as a factual count only because ReflectionFacts carries no raw reason text to echo", () => {
    const facts = makeFacts({}, 1);
    const text = renderDeterministicReflectionText(facts);

    expect(text).toContain("1 moment of friction");
  });
});
