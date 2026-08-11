import { describe, expect, it } from "vitest";

import {
  buildErrorAnchors,
  buildFallbackInterpretation,
  buildPrompt,
  buildRepairPrompt,
  safeParseAIResponse,
  sanitizeAndDedupeAnchors,
  validateAnchors,
  type AnchorsRequest,
} from "./aiAnchors";

const baseRequest: AnchorsRequest = {
  mode: "SUGGEST_ANCHORS",
  intake: {
    name: "Test user",
    goal: "finish my portfolio README",
    struggle: "I keep adding extra sections",
    goalWhy: "I want reviewers to understand my work quickly",
  },
  screening: {
    mode: "SUGGEST_ANCHORS",
    dailyReminder: "NOT_NOW",
    guidanceProfile: {
      copyLength: "SHORT",
      pressureLimit: "LOW",
      choiceStyle: "ANCHOR_SUGGESTS",
      repetitionLimit: "LOW",
      actionStyle: "SMALL_STEP",
    },
  },
};

describe("safeParseAIResponse", () => {
  it("parses valid JSON responses", () => {
    const parsed = safeParseAIResponse(
      JSON.stringify({
        personalAnchorInterpretation: {
          directionLine: "You want to finish the README",
          whyLine: "Reviewers need the main point quickly",
          frictionLine: "Extra sections may slow you down",
          returnLine: "One edit is enough today",
        },
        anchors: [{ text: "Remove one extra section" }],
      })
    );

    expect(parsed?.anchors?.[0]?.text).toBe("Remove one extra section");
  });

  it("extracts JSON when the model returns surrounding text", () => {
    const parsed = safeParseAIResponse(
      'Here is the JSON:\n{"anchors":[{"text":"Rewrite the first paragraph"}]}\nDone.'
    );

    expect(parsed?.anchors?.[0]?.text).toBe("Rewrite the first paragraph");
  });

  it("returns null for invalid JSON", () => {
    expect(safeParseAIResponse("not json")).toBeNull();
  });
});

describe("sanitizeAndDedupeAnchors", () => {
  it("trims whitespace, removes trailing punctuation and deduplicates anchors", () => {
    const anchors = sanitizeAndDedupeAnchors([
      { text: "  Rewrite the README intro. " },
      { text: "Rewrite the README intro" },
      { text: "Remove one repeated sentence!" },
    ]);

    expect(anchors).toEqual([
      { text: "Rewrite the README intro" },
      { text: "Remove one repeated sentence" },
    ]);
  });
});

describe("validateAnchors", () => {
  it("accepts the expected number of concrete anchors", () => {
    const result = validateAnchors(
      [
        { text: "Rewrite the README intro" },
        { text: "Remove one repeated section" },
        { text: "Check screenshots before publishing" },
      ],
      3
    );

    expect(result).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("rejects too few anchors", () => {
    const result = validateAnchors([{ text: "Rewrite the README intro" }], 3);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Expected exactly 3 anchors, received 1.");
  });

  it("rejects generic blocklisted anchors", () => {
    const result = validateAnchors(
      [
        { text: "Read your why once" },
        { text: "Remove one repeated section" },
        { text: "Check screenshots before publishing" },
      ],
      3
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("too generic"))).toBe(true);
  });

  it("rejects anchors with unsafe intent", () => {
    const result = validateAnchors(
      [
        { text: "Hack their account tonight" },
        { text: "Remove one repeated section" },
        { text: "Check screenshots before publishing" },
      ],
      3
    );

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("unsafe"))).toBe(true);
  });
});

describe("fallback builders", () => {
  it("builds a safe fallback interpretation from user input", () => {
    const interpretation = buildFallbackInterpretation(baseRequest);

    expect(interpretation.directionLine).toContain("finish my portfolio readme");
    expect(interpretation.whyLine).toBe("I want reviewers to understand my work quickly");
    expect(interpretation.returnLine).toBe("One small step is enough for today");
  });

  it("buildErrorAnchors returns the requested number of anchors", () => {
    const anchors = buildErrorAnchors(baseRequest, 3);

    expect(anchors).toHaveLength(3);
    expect(validateAnchors(anchors, 3).ok).toBe(true);
  });
});

describe("prompt payload boundary (Phase 4H hardening)", () => {
  it("buildPrompt does not send the user's display name to the model", () => {
    const prompt = buildPrompt(baseRequest, 3);

    expect(prompt).not.toContain("Test user");
    expect(prompt).not.toMatch(/^name:/m);
  });

  it("buildPrompt still sends goal, why and struggle — grounding is unaffected by removing the name", () => {
    const prompt = buildPrompt(baseRequest, 3);

    expect(prompt).toContain("goal: finish my portfolio README");
    expect(prompt).toContain("goalWhy: I want reviewers to understand my work quickly");
    expect(prompt).toContain("struggle: I keep adding extra sections");
  });

  it("buildRepairPrompt does not send the user's display name to the model", () => {
    const prompt = buildRepairPrompt({
      body: baseRequest,
      count: 3,
      previousRaw: "",
      validationErrors: ["Response was not valid JSON."],
    });

    expect(prompt).not.toContain("Test user");
    expect(prompt).not.toMatch(/^name:/m);
  });

  it("buildRepairPrompt still sends goal, why and struggle", () => {
    const prompt = buildRepairPrompt({
      body: baseRequest,
      count: 3,
      previousRaw: "",
      validationErrors: ["Response was not valid JSON."],
    });

    expect(prompt).toContain("goal: finish my portfolio README");
    expect(prompt).toContain("goalWhy: I want reviewers to understand my work quickly");
    expect(prompt).toContain("struggle: I keep adding extra sections");
  });
});
