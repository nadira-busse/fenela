import { describe, expect, it } from "vitest";
import { AI_SUGGESTIONS_LABEL, isAiAssistanceEnabled } from "./AiAssistanceControl";

describe("AiAssistanceControl copy and On/Off derivation", () => {
  it("uses the exact required label", () => {
    expect(AI_SUGGESTIONS_LABEL).toBe("AI suggestions");
  });

  it("is On (enabled) for SUGGEST_ANCHORS", () => {
    expect(isAiAssistanceEnabled("SUGGEST_ANCHORS")).toBe(true);
  });

  it("is Off (disabled) for I_DECIDE", () => {
    expect(isAiAssistanceEnabled("I_DECIDE")).toBe(false);
  });
});
