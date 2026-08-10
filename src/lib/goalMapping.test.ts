import { describe, expect, it } from "vitest";
import {
  mapApiSourceToAnchorSource,
  mapApiSourceToInterpretationSource,
  mapDbAnchorSource,
  mapActiveGoalToCompatibilityState,
  validateCreateGoalInput,
  type CreateGoalInput,
  type ActiveGoalWithAnchors,
} from "./goalMapping";

function baseGoalInput(overrides: Partial<CreateGoalInput> = {}): CreateGoalInput {
  return {
    title: "Walk daily",
    why: "Feel steadier",
    initialStruggle: "Low energy",
    personalAnchorInterpretation: null,
    interpretationSource: null,
    anchors: [{ text: "Put on shoes", source: "USER", position: 1 }],
    ...overrides,
  };
}

describe("mapApiSourceToAnchorSource / mapApiSourceToInterpretationSource", () => {
  it("maps the AI route's ai source to AI", () => {
    expect(mapApiSourceToAnchorSource("ai")).toBe("AI");
    expect(mapApiSourceToInterpretationSource("ai")).toBe("AI");
  });

  it("maps fallback and deterministic to FALLBACK", () => {
    expect(mapApiSourceToAnchorSource("fallback")).toBe("FALLBACK");
    expect(mapApiSourceToAnchorSource("deterministic")).toBe("FALLBACK");
    expect(mapApiSourceToInterpretationSource("fallback")).toBe("FALLBACK");
    expect(mapApiSourceToInterpretationSource("deterministic")).toBe("FALLBACK");
  });
});

describe("mapDbAnchorSource", () => {
  it("passes through valid sources", () => {
    expect(mapDbAnchorSource("USER")).toBe("USER");
    expect(mapDbAnchorSource("AI")).toBe("AI");
    expect(mapDbAnchorSource("FALLBACK")).toBe("FALLBACK");
  });

  it("falls back to USER for an unrecognized DB value", () => {
    expect(mapDbAnchorSource("SOMETHING_UNEXPECTED")).toBe("USER");
  });
});

describe("mapActiveGoalToCompatibilityState", () => {
  it("reconstructs the intake shape and orders anchors by position", () => {
    const goal: ActiveGoalWithAnchors = {
      id: "goal-1",
      title: "Walk daily",
      why: "Feel steadier",
      initialStruggle: "Low energy",
      personalAnchorInterpretation: {
        directionLine: "d",
        whyLine: "w",
        frictionLine: "f",
        returnLine: "r",
      },
      anchors: [
        { id: "a2", text: "Second", source: "AI", position: 2 },
        { id: "a1", text: "First", source: "USER", position: 1 },
        { id: "a3", text: "Third", source: "FALLBACK", position: 3 },
      ],
    };

    const result = mapActiveGoalToCompatibilityState(goal, "Nadira");

    expect(result.intake).toEqual({
      name: "Nadira",
      goal: "Walk daily",
      struggle: "Low energy",
      goalWhy: "Feel steadier",
      personalAnchorInterpretation: goal.personalAnchorInterpretation,
    });

    expect(result.careAnchors).toEqual([
      { id: "a1", text: "First", source: "USER" },
      { id: "a2", text: "Second", source: "AI" },
      { id: "a3", text: "Third", source: "FALLBACK" },
    ]);
  });

  it("omits personalAnchorInterpretation when null", () => {
    const goal: ActiveGoalWithAnchors = {
      id: "goal-1",
      title: "Walk daily",
      why: "Feel steadier",
      initialStruggle: "Low energy",
      personalAnchorInterpretation: null,
      anchors: [],
    };

    const result = mapActiveGoalToCompatibilityState(goal, "Nadira");

    expect(result.intake.personalAnchorInterpretation).toBeUndefined();
  });
});

describe("validateCreateGoalInput", () => {
  it("accepts a fully valid input", () => {
    expect(validateCreateGoalInput(baseGoalInput())).toEqual({ ok: true });
  });

  it("accepts 5 anchors", () => {
    const anchors = [1, 2, 3, 4, 5].map((position) => ({
      text: `Anchor ${position}`,
      source: "AI" as const,
      position,
    }));

    expect(validateCreateGoalInput(baseGoalInput({ anchors }))).toEqual({ ok: true });
  });

  it("rejects an empty title", () => {
    expect(validateCreateGoalInput(baseGoalInput({ title: "   " })).ok).toBe(false);
  });

  it("rejects an empty why", () => {
    expect(validateCreateGoalInput(baseGoalInput({ why: "" })).ok).toBe(false);
  });

  it("rejects an empty initialStruggle", () => {
    expect(validateCreateGoalInput(baseGoalInput({ initialStruggle: "" })).ok).toBe(false);
  });

  it("rejects zero anchors", () => {
    expect(validateCreateGoalInput(baseGoalInput({ anchors: [] })).ok).toBe(false);
  });

  it("rejects more than 5 anchors", () => {
    const anchors = [1, 2, 3, 4, 5, 6].map((position) => ({
      text: `Anchor ${position}`,
      source: "AI" as const,
      position: Math.min(position, 5),
    }));

    expect(validateCreateGoalInput(baseGoalInput({ anchors })).ok).toBe(false);
  });

  it("rejects an invalid anchor source", () => {
    const result = validateCreateGoalInput(
      baseGoalInput({
        anchors: [
          {
            text: "x",
            source: "NOT_REAL" as CreateGoalInput["anchors"][number]["source"],
            position: 1,
          },
        ],
      })
    );

    expect(result.ok).toBe(false);
  });

  it("rejects duplicate anchor positions", () => {
    const result = validateCreateGoalInput(
      baseGoalInput({
        anchors: [
          { text: "one", source: "USER", position: 1 },
          { text: "two", source: "USER", position: 1 },
        ],
      })
    );

    expect(result.ok).toBe(false);
  });

  it("rejects an out-of-range anchor position", () => {
    const result = validateCreateGoalInput(
      baseGoalInput({ anchors: [{ text: "one", source: "USER", position: 6 }] })
    );

    expect(result.ok).toBe(false);
  });

  it("rejects a personal anchor interpretation without an interpretation source", () => {
    const result = validateCreateGoalInput(
      baseGoalInput({
        personalAnchorInterpretation: {
          directionLine: "d",
          whyLine: "w",
          frictionLine: "f",
          returnLine: "r",
        },
        interpretationSource: null,
      })
    );

    expect(result.ok).toBe(false);
  });

  it("accepts a null interpretation with a null source", () => {
    const result = validateCreateGoalInput(
      baseGoalInput({ personalAnchorInterpretation: null, interpretationSource: null })
    );

    expect(result).toEqual({ ok: true });
  });
});
