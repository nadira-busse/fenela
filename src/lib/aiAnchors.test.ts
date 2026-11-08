import { describe, expect, it } from "vitest";

import {
  areNearDuplicateAnchors,
  buildErrorAnchors,
  buildFallbackAnchors,
  buildFallbackInterpretation,
  buildPrompt,
  buildRepairPrompt,
  findRepeatedAnchorIndexes,
  safeParseAIResponse,
  sanitizeAndDedupeAnchors,
  sanitizePreviousAnchors,
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

  it("buildErrorAnchors' default 3-anchor batch touches goal, struggle and why, not just one field repeated", () => {
    const anchors = buildErrorAnchors(baseRequest, 3);
    const goalFragment = baseRequest.intake.goal.split(" ").slice(0, 5).join(" ");
    const struggleFragment = baseRequest.intake.struggle.split(" ").slice(0, 5).join(" ");
    const whyFragment = baseRequest.intake.goalWhy.split(" ").slice(0, 5).join(" ");

    expect(anchors.some((a) => a.text.includes(goalFragment))).toBe(true);
    expect(anchors.some((a) => a.text.includes(struggleFragment))).toBe(true);
    expect(anchors.some((a) => a.text.includes(whyFragment))).toBe(true);
  });

  // A goal that is itself phrased as a verb ("Work in small portions") must
  // never be spliced after another verb, which would read as "Make Work in
  // small portions smaller".
  it("stays grammatically intelligible when the user's own goal already starts with a verb", () => {
    const request: AnchorsRequest = {
      mode: "SUGGEST_ANCHORS",
      intake: {
        goal: "Work in small portions",
        struggle: "Lack of motivation",
        goalWhy: "Helps me to reach my goals",
      },
    };

    const anchors = buildErrorAnchors(request, 3);

    expect(anchors).toHaveLength(3);
    expect(validateAnchors(anchors, 3).ok).toBe(true);

    for (const anchor of anchors) {
      // Every anchor introduces the user's fragment after a colon label
      // instead of mid-sentence.
      expect(anchor.text).not.toMatch(/^make work\b/i);
      expect(anchor.text).not.toMatch(/^start work\b/i);
      expect(anchor.text).toContain(":");
    }
  });

  it("buildErrorAnchors trims long input at a word boundary rather than mid-word", () => {
    const request: AnchorsRequest = {
      mode: "SUGGEST_ANCHORS",
      intake: {
        goal: "finish the quarterly report before the strict Friday deadline arrives",
        struggle: "procrastinating endlessly instead of starting the actual important work",
        goalWhy: "I want my manager to trust me with bigger and more important projects",
      },
    };

    const { anchors } = buildFallbackAnchors(request, 8);
    const inputs = [request.intake.goal, request.intake.struggle, request.intake.goalWhy];

    expect(anchors).toHaveLength(8);

    for (const anchor of anchors) {
      // Every fallback anchor is "<complete action>: <fragment>", where the
      // fragment is the first whole words of one of the user's own answers,
      // never a word cut in half.
      const [action, fragment] = anchor.text.split(": ");

      expect(action.split(" ").length).toBeGreaterThanOrEqual(3);
      expect(inputs.some((input) => input === fragment || input.startsWith(`${fragment} `))).toBe(
        true
      );
      expect(fragment).not.toMatch(/\b(?:and|to|of|before|every|the|a)$/i);
      expect(validateAnchors([anchor], 1).ok).toBe(true);
    }
  });

  it("buildErrorAnchors excludes previously shown anchors when a bounded replacement exists", () => {
    const first = buildErrorAnchors(baseRequest, 3);
    const firstTexts = first.map((anchor) => anchor.text);

    const second = buildErrorAnchors(baseRequest, 3, firstTexts);
    const secondTexts = second.map((anchor) => anchor.text);

    // Regenerate must not silently return the same "new" suggestions: as
    // long as the fallback pool has enough untouched entries left (it
    // does, for a single regenerate round), the next batch is disjoint
    // from the one already shown.
    expect(secondTexts.every((text) => !firstTexts.includes(text))).toBe(true);
  });

  it("buildErrorAnchors falls back to repeating only once the pool itself is exhausted, and never hides fewer anchors than requested", () => {
    const first = buildErrorAnchors(baseRequest, 3);
    const second = buildErrorAnchors(
      baseRequest,
      3,
      first.map((a) => a.text)
    );
    const exhausted = buildErrorAnchors(
      baseRequest,
      3,
      [...first, ...second].map((a) => a.text)
    );

    expect(exhausted).toHaveLength(3);
    expect(validateAnchors(exhausted, 3).ok).toBe(true);
  });
});

describe("sanitizePreviousAnchors", () => {
  it("passes through clean, bounded anchor text", () => {
    expect(sanitizePreviousAnchors(["Write the first sentence", "Open one tab"])).toEqual([
      "Write the first sentence",
      "Open one tab",
    ]);
  });

  it("drops entries with unsafe intent instead of forwarding them to the model", () => {
    expect(sanitizePreviousAnchors(["Hack their account tonight", "Open one tab"])).toEqual([
      "Open one tab",
    ]);
  });

  it("drops non-string entries and ignores a non-array input", () => {
    expect(sanitizePreviousAnchors(["Open one tab", 42, null, {}])).toEqual(["Open one tab"]);
    expect(sanitizePreviousAnchors("not an array")).toEqual([]);
    expect(sanitizePreviousAnchors(undefined)).toEqual([]);
  });

  it("dedupes case-insensitively", () => {
    expect(sanitizePreviousAnchors(["Open one tab", "open one tab "])).toEqual(["Open one tab"]);
  });

  it("caps the list at a bounded size instead of forwarding an unbounded array", () => {
    const many = Array.from({ length: 50 }, (_, i) => `Anchor number ${i}`);
    expect(sanitizePreviousAnchors(many).length).toBeLessThanOrEqual(15);
  });
});

describe("prompt payload boundary", () => {
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

describe("Regenerate novelty instruction sent to the model", () => {
  const requestWithHistory: AnchorsRequest = {
    ...baseRequest,
    previousAnchors: ["Write the first sentence of your README"],
  };

  it("buildPrompt tells the model not to repeat anchors already shown this session", () => {
    const prompt = buildPrompt(requestWithHistory, 3);

    expect(prompt).toContain("Write the first sentence of your README");
    expect(prompt).toMatch(/do not repeat/i);
  });

  it("buildPrompt omits the previous-anchors section entirely when there is no history yet", () => {
    const prompt = buildPrompt(baseRequest, 3);

    expect(prompt).not.toMatch(/already shown to this user/i);
  });

  it("buildRepairPrompt also carries the novelty instruction", () => {
    const prompt = buildRepairPrompt({
      body: requestWithHistory,
      count: 3,
      previousRaw: "",
      validationErrors: ["Response was not valid JSON."],
    });

    expect(prompt).toContain("Write the first sentence of your README");
  });
});

const REALISTIC_INTAKES: AnchorsRequest["intake"][] = [
  {
    goal: "Work in small portions",
    struggle: "Lack of motivation",
    goalWhy: "Helps me to reach my goals",
  },
  {
    goal: "Walk 10 minutes after lunch",
    struggle: "It rains a lot and I get lazy",
    goalWhy: "I want more steady energy in the afternoon",
  },
  {
    goal: "Practice Spanish vocabulary",
    struggle: "I forget and then feel behind",
    goalWhy: "I am moving to Valencia next year",
  },
  {
    goal: "Reply to emails before they pile up",
    struggle: "Opening the inbox feels overwhelming",
    goalWhy: "I want my clients to trust me",
  },
  {
    goal: "Go to bed before midnight",
    struggle: "I scroll on my phone in bed",
    goalWhy: "I wake up tired every morning",
  },
];

describe("areNearDuplicateAnchors", () => {
  it.each([
    ["Spend five minutes on the report", "Spend 5 minutes on report"],
    ["Write one line about your goal", "Write a line about your goal"],
    ["Open the report and write one sentence", "Write one sentence of the report"],
    ["Clear your desk", "clear your desk"],
  ])("treats trivial rewording as the same action: %s / %s", (a, b) => {
    expect(areNearDuplicateAnchors(a, b)).toBe(true);
  });

  it.each([
    ["Set a ten minute timer for one portion", "Write the next portion on a sticky note"],
    ["Put your walking shoes by the door", "Walk to the end of the street"],
    ["Read five Spanish words aloud", "Label three things at home in Spanish"],
  ])("keeps genuinely different actions on the same goal apart: %s / %s", (a, b) => {
    expect(areNearDuplicateAnchors(a, b)).toBe(false);
  });
});

describe("validateAnchors distinctness", () => {
  it("rejects a set whose anchors are rewordings of one action", () => {
    const result = validateAnchors(
      [
        { text: "Spend five minutes on one portion" },
        { text: "Spend 5 minutes on a portion" },
        { text: "Clear your desk for the first portion" },
      ],
      3
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("Anchors 1 and 2 describe the same action");
  });
});

describe("findRepeatedAnchorIndexes", () => {
  it("flags anchors that repeat or reword earlier suggestions, and only those", () => {
    const indexes = findRepeatedAnchorIndexes(
      [
        { text: "Set a 10 minute timer for one portion" },
        { text: "Text a friend which portion you start" },
        { text: "Write the next portion on a sticky note" },
      ],
      ["Set a ten minute timer for one portion", "Write the next portion on a sticky note"]
    );

    expect(indexes).toEqual([0, 2]);
  });

  it("flags nothing when there is no session history", () => {
    expect(findRepeatedAnchorIndexes([{ text: "Clear your desk first" }])).toEqual([]);
  });
});

describe("buildFallbackAnchors on realistic input", () => {
  it.each(REALISTIC_INTAKES)(
    "returns three valid, safe, distinct, complete anchors for goal '$goal'",
    (intake) => {
      const request: AnchorsRequest = { mode: "SUGGEST_ANCHORS", intake };
      const { anchors, repeatsPrevious } = buildFallbackAnchors(request, 3);

      expect(anchors).toHaveLength(3);
      expect(repeatsPrevious).toBe(false);
      expect(validateAnchors(anchors, 3)).toEqual({ ok: true, errors: [] });

      // One anchor each for goal, struggle and why.
      const fragments = anchors.map((anchor) => anchor.text.split(": ")[1]);
      expect(intake.goal.startsWith(fragments[0])).toBe(true);
      expect(intake.struggle.startsWith(fragments[1])).toBe(true);
      expect(intake.goalWhy.startsWith(fragments[2])).toBe(true);
    }
  );

  it.each(REALISTIC_INTAKES)(
    "gives two non-overlapping Regenerate rounds, then reports repeats for goal '$goal'",
    (intake) => {
      const request: AnchorsRequest = { mode: "SUGGEST_ANCHORS", intake };

      const first = buildFallbackAnchors(request, 3);
      const second = buildFallbackAnchors(
        request,
        3,
        first.anchors.map((a) => a.text)
      );
      const third = buildFallbackAnchors(
        request,
        3,
        [...first.anchors, ...second.anchors].map((a) => a.text)
      );

      expect(second.repeatsPrevious).toBe(false);
      expect(
        findRepeatedAnchorIndexes(
          second.anchors,
          first.anchors.map((a) => a.text)
        )
      ).toEqual([]);

      expect(third.repeatsPrevious).toBe(true);
      expect(third.anchors).toHaveLength(3);
      expect(validateAnchors(third.anchors, 3).ok).toBe(true);
    }
  );
});

describe("prompt personalization and session history", () => {
  const reproRequest: AnchorsRequest = {
    mode: "SUGGEST_ANCHORS",
    intake: REALISTIC_INTAKES[0],
    previousAnchors: ["Set a ten minute timer for one portion", "Clear your desk first"],
  };

  it.each([
    ["buildPrompt", () => buildPrompt(reproRequest, 3)],
    [
      "buildRepairPrompt",
      () =>
        buildRepairPrompt({
          body: reproRequest,
          count: 3,
          previousRaw: "{}",
          validationErrors: ["Expected exactly 3 anchors, received 0."],
        }),
    ],
  ])(
    "%s states how struggle and why shape the anchors and lists all earlier suggestions",
    (_, build) => {
      const prompt = build();

      expect(prompt).toContain("The struggle decides what is realistic");
      expect(prompt).toContain("do not quote or restate it inside an anchor");
      expect(prompt).toContain("genuinely different actions or approaches");
      expect(prompt).toContain("- Set a ten minute timer for one portion");
      expect(prompt).toContain("- Clear your desk first");
      expect(prompt).toContain("goal: Work in small portions");
      expect(prompt).toContain("struggle: Lack of motivation");
      expect(prompt).toContain("goalWhy: Helps me to reach my goals");
    }
  );

  it("omits the session-history section on a first generation", () => {
    expect(buildPrompt({ ...reproRequest, previousAnchors: [] }, 3)).not.toContain("already shown");
  });
});

describe("trailing time words", () => {
  it.each([
    ["Write down a single goal for today", "Write down a single goal"],
    ["Clear your desk right now", "Clear your desk"],
    ["Send the draft by today", "Send the draft"],
    ["Put your walking shoes on", "Put your walking shoes on"],
  ])("sanitizes %s without leaving a dangling word", (raw, expected) => {
    expect(sanitizeAndDedupeAnchors([{ text: raw }])).toEqual([{ text: expected }]);
  });
});
