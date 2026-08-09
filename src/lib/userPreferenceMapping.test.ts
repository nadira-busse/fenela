import { describe, expect, it } from "vitest";
import {
  mapAnchorChoiceModeToDb,
  mapAnchorChoiceModeFromDb,
  mapDbRowToScreeningFields,
  validateUserPreferenceInput,
  isValidIanaTimeZone,
  type UserPreferenceWriteInput,
} from "./userPreferenceMapping";

function baseInput(overrides: Partial<UserPreferenceWriteInput> = {}): UserPreferenceWriteInput {
  return {
    displayName: "Nadira",
    anchorChoiceMode: "I_DECIDE",
    resistancePattern: "DELAY",
    mainChallenge: "START",
    actionTrigger: "SMALL",
    antiHelp: ["PRESSURE"],
    timeZone: "Europe/Amsterdam",
    ...overrides,
  };
}

describe("mapAnchorChoiceModeToDb / mapAnchorChoiceModeFromDb", () => {
  it("maps I_DECIDE to USER_DECIDES", () => {
    expect(mapAnchorChoiceModeToDb("I_DECIDE")).toBe("USER_DECIDES");
  });

  it("maps SUGGEST_ANCHORS to FENELA_SUGGESTS", () => {
    expect(mapAnchorChoiceModeToDb("SUGGEST_ANCHORS")).toBe("FENELA_SUGGESTS");
  });

  it("round-trips both directions", () => {
    expect(mapAnchorChoiceModeFromDb(mapAnchorChoiceModeToDb("I_DECIDE"))).toBe("I_DECIDE");
    expect(mapAnchorChoiceModeFromDb(mapAnchorChoiceModeToDb("SUGGEST_ANCHORS"))).toBe(
      "SUGGEST_ANCHORS"
    );
  });

  it("falls back to I_DECIDE for an unrecognized DB value", () => {
    expect(mapAnchorChoiceModeFromDb("SOMETHING_UNEXPECTED")).toBe("I_DECIDE");
  });
});

describe("mapDbRowToScreeningFields", () => {
  it("reconstructs the correct application choice mode and bounded values", () => {
    const fields = mapDbRowToScreeningFields({
      display_name: "Nadira",
      anchor_choice_mode: "FENELA_SUGGESTS",
      resistance_pattern: "FORCE",
      main_challenge: "SUSTAIN",
      action_trigger: "WHY",
      anti_help: ["PRESSURE", "REPETITION"],
    });

    expect(fields).toEqual({
      name: "Nadira",
      mode: "SUGGEST_ANCHORS",
      resistancePattern: "FORCE",
      mainChallenge: "SUSTAIN",
      actionTrigger: "WHY",
      antiHelp: ["PRESSURE", "REPETITION"],
    });
  });

  it("drops anti_help values outside the bounded vocabulary instead of trusting the DB blindly", () => {
    const fields = mapDbRowToScreeningFields({
      display_name: "Nadira",
      anchor_choice_mode: "USER_DECIDES",
      resistance_pattern: "DELAY",
      main_challenge: "START",
      action_trigger: "SMALL",
      anti_help: ["PRESSURE", "NOT_A_REAL_VALUE"],
    });

    expect(fields.antiHelp).toEqual(["PRESSURE"]);
  });

  it("falls back to schema defaults for an unrecognized bounded value", () => {
    const fields = mapDbRowToScreeningFields({
      display_name: "Nadira",
      anchor_choice_mode: "USER_DECIDES",
      resistance_pattern: "NOT_REAL",
      main_challenge: "NOT_REAL",
      action_trigger: "NOT_REAL",
      anti_help: [],
    });

    expect(fields.resistancePattern).toBe("DELAY");
    expect(fields.mainChallenge).toBe("START");
    expect(fields.actionTrigger).toBe("SMALL");
  });
});

describe("validateUserPreferenceInput", () => {
  it("accepts a fully valid input", () => {
    expect(validateUserPreferenceInput(baseInput())).toEqual({ ok: true });
  });

  it("rejects an empty display name", () => {
    const result = validateUserPreferenceInput(baseInput({ displayName: "   " }));
    expect(result.ok).toBe(false);
  });

  it("rejects an overlong display name", () => {
    const result = validateUserPreferenceInput(baseInput({ displayName: "a".repeat(41) }));
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid anchor choice mode", () => {
    const result = validateUserPreferenceInput(
      baseInput({ anchorChoiceMode: "NOT_A_MODE" as UserPreferenceWriteInput["anchorChoiceMode"] })
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an invalid resistance pattern", () => {
    const result = validateUserPreferenceInput(
      baseInput({
        resistancePattern: "NOT_REAL" as UserPreferenceWriteInput["resistancePattern"],
      })
    );
    expect(result.ok).toBe(false);
  });

  it("rejects an anti_help value outside the bounded vocabulary", () => {
    const result = validateUserPreferenceInput(
      baseInput({ antiHelp: ["NOT_REAL"] as unknown as UserPreferenceWriteInput["antiHelp"] })
    );
    expect(result.ok).toBe(false);
  });

  it("rejects a missing timezone", () => {
    const result = validateUserPreferenceInput(baseInput({ timeZone: "" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a non-IANA timezone-shaped string", () => {
    const result = validateUserPreferenceInput(baseInput({ timeZone: "banana" }));
    expect(result.ok).toBe(false);
  });

  it("rejects arbitrary normal text as a timezone", () => {
    const result = validateUserPreferenceInput(
      baseInput({ timeZone: "not a real timezone at all" })
    );
    expect(result.ok).toBe(false);
  });
});

describe("isValidIanaTimeZone", () => {
  it("accepts Europe/Amsterdam", () => {
    expect(isValidIanaTimeZone("Europe/Amsterdam")).toBe(true);
  });

  it("accepts America/New_York", () => {
    expect(isValidIanaTimeZone("America/New_York")).toBe(true);
  });

  it("accepts UTC", () => {
    expect(isValidIanaTimeZone("UTC")).toBe(true);
  });

  it("rejects a made-up zone name", () => {
    expect(isValidIanaTimeZone("banana")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidIanaTimeZone("")).toBe(false);
  });

  it("rejects arbitrary normal text", () => {
    expect(isValidIanaTimeZone("not a real timezone at all")).toBe(false);
  });
});
