import { describe, expect, it } from "vitest";

import { getAICopy, type AICtx } from "./ailogic";

function baseCtx(overrides: Partial<AICtx>): AICtx {
  return {
    state: "PAUSE_QUESTION",
    intake: {
      name: "Nadira",
      goal: "Finish my portfolio",
      struggle: "I keep overthinking",
      goalWhy: "I want to apply for jobs",
      personalAnchorInterpretation: {
        directionLine: "You want to return to finishing your portfolio",
        whyLine: "Because you want to apply for jobs",
        frictionLine: "Starting feels harder than the task itself",
        returnLine: "One small step is enough for today",
      },
    },
    screening: null,
    ...overrides,
  };
}

describe("getAICopy", () => {
  it("surfaces the AI-generated frictionLine as the pause subline", () => {
    const copy = getAICopy(baseCtx({ state: "PAUSE_QUESTION" }));

    expect(copy.pauseSubline).toBe("Starting feels harder than the task itself");
  });

  it("omits the pause subline when no frictionLine is available", () => {
    const ctx = baseCtx({ state: "PAUSE_QUESTION" });
    ctx.intake.personalAnchorInterpretation = undefined;

    const copy = getAICopy(ctx);

    expect(copy.pauseSubline).toBeUndefined();
  });

  it("uses the AI-refined whyLine for the directional reminder, not the raw intake text", () => {
    const copy = getAICopy(baseCtx({ state: "DIRECTIONAL_MOTIVATION" }));

    expect(copy.directionalLine).toBe("Remember your why:\nBecause you want to apply for jobs");
  });

  it("falls back to the raw goalWhy for the directional reminder when no interpretation exists", () => {
    const ctx = baseCtx({ state: "DIRECTIONAL_MOTIVATION" });
    ctx.intake.personalAnchorInterpretation = undefined;

    const copy = getAICopy(ctx);

    expect(copy.directionalLine).toBe("Remember your why:\nI want to apply for jobs");
  });
});
