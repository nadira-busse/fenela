// src/lib/safety.test.ts

import { describe, expect, it } from "vitest";

import {
  AnchorValidationError,
  hasEnoughMeaningfulInput,
  hasUnsafeIntent,
  normalizeSafetyText,
  validateSafeAnchorList,
  validateSafeAnchorText,
  validateSafeUserText,
  assertSafeAnchorList,
} from "./safety";

describe("normalizeSafetyText", () => {
  it("normalizes whitespace and line breaks", () => {
    expect(normalizeSafetyText("  Review\n\nmy\tportfolio   repo  ")).toBe(
      "Review my portfolio repo"
    );
  });

  it("handles nullish values safely", () => {
    expect(normalizeSafetyText(null)).toBe("");
    expect(normalizeSafetyText(undefined)).toBe("");
  });
});

describe("hasUnsafeIntent", () => {
  it("blocks explicit self-harm intent", () => {
    expect(hasUnsafeIntent("I want to hurt myself")).toBe(true);
    expect(hasUnsafeIntent("suicide")).toBe(true);
  });

  it("blocks explicit violence against a person target", () => {
    expect(hasUnsafeIntent("I want to kill someone")).toBe(true);
    expect(hasUnsafeIntent("attack a person")).toBe(true);
    expect(hasUnsafeIntent("run someone over")).toBe(true);
  });

  it("blocks broader violence terms with low idiomatic overlap", () => {
    expect(hasUnsafeIntent("poison my boss")).toBe(true);
    expect(hasUnsafeIntent("strangle their partner")).toBe(true);
  });

  it("does not block common motivational idioms", () => {
    expect(hasUnsafeIntent("I want to kill it at my interview")).toBe(false);
    expect(hasUnsafeIntent("attack my todo list")).toBe(false);
    expect(hasUnsafeIntent("shoot for a promotion")).toBe(false);
    expect(hasUnsafeIntent("I always choke under pressure")).toBe(false);
  });

  it("blocks theft, fraud and cyber abuse patterns", () => {
    expect(hasUnsafeIntent("steal passwords")).toBe(true);
    expect(hasUnsafeIntent("create a phishing campaign")).toBe(true);
    expect(hasUnsafeIntent("hack into a server")).toBe(true);
  });

  it("does not block benign productivity language that contains risky-looking words", () => {
    expect(hasUnsafeIntent("Use a habit hack for my morning routine")).toBe(false);
    expect(hasUnsafeIntent("Find my secret weapon for staying focused")).toBe(false);
  });

  it("blocks Dutch violence variants", () => {
    expect(hasUnsafeIntent("iemand bedreigen")).toBe(true);
    expect(hasUnsafeIntent("mensen aanvallen")).toBe(true);
  });
});

describe("hasEnoughMeaningfulInput", () => {
  it("accepts realistic short task input", () => {
    expect(hasEnoughMeaningfulInput("Review my portfolio repo")).toBe(true);
    expect(hasEnoughMeaningfulInput("Add one screenshot")).toBe(true);
  });

  it("rejects empty, one-word or low-information input", () => {
    expect(hasEnoughMeaningfulInput("")).toBe(false);
    expect(hasEnoughMeaningfulInput("help")).toBe(false);
    expect(hasEnoughMeaningfulInput("aaa aaa")).toBe(false);
    expect(hasEnoughMeaningfulInput("ok go")).toBe(false);
  });
});

describe("validateSafeUserText", () => {
  it("returns ok for safe meaningful user text", () => {
    expect(validateSafeUserText("Review my portfolio repo")).toEqual({
      ok: true,
    });
  });

  it("returns unsafe intent for unsafe user text before checking quality", () => {
    expect(validateSafeUserText("hurt myself")).toEqual({
      ok: false,
      code: "UNSAFE_INTENT",
      message:
        "Fenéla cannot help turn this into an action. Choose a safe, lawful and respectful goal instead.",
    });
  });

  it("returns low quality for vague user text", () => {
    expect(validateSafeUserText("help")).toEqual({
      ok: false,
      code: "LOW_QUALITY_INPUT",
      message:
        "Please add a little more context so Fenéla can turn this into a useful small action.",
    });
  });
});

describe("validateSafeAnchorText", () => {
  it("returns ok for safe meaningful anchor text", () => {
    expect(validateSafeAnchorText("Pick one README fix")).toEqual({
      ok: true,
    });
  });

  it("rejects unsafe anchor text", () => {
    expect(validateSafeAnchorText("attack a person")).toEqual({
      ok: false,
      code: "UNSAFE_INTENT",
      message:
        "Fenéla cannot help turn this into an action. Choose a safe, lawful and respectful goal instead.",
    });
  });

  it("rejects low-quality anchor text", () => {
    expect(validateSafeAnchorText("fix")).toEqual({
      ok: false,
      code: "LOW_QUALITY_INPUT",
      message:
        "Please add a little more context so Fenéla can turn this into a useful small action.",
    });
  });
});

describe("validateSafeAnchorList", () => {
  it("returns ok when every anchor is safe and meaningful", () => {
    expect(
      validateSafeAnchorList(["Pick one README fix", "Add one screenshot", "Write three notes"])
    ).toEqual({ ok: true });
  });

  it("returns the first validation failure", () => {
    expect(
      validateSafeAnchorList(["Pick one README fix", "hurt myself", "Add one screenshot"])
    ).toEqual({
      ok: false,
      code: "UNSAFE_INTENT",
      message:
        "Fenéla cannot help turn this into an action. Choose a safe, lawful and respectful goal instead.",
    });
  });
});

describe("assertSafeAnchorList", () => {
  it("does not throw for a safe anchor list", () => {
    expect(() => assertSafeAnchorList(["Pick one README fix", "Add one screenshot"])).not.toThrow();
  });

  it("throws AnchorValidationError for an unsafe anchor list", () => {
    expect(() => assertSafeAnchorList(["Pick one README fix", "attack a person"])).toThrow(
      AnchorValidationError
    );
  });
});
