import { describe, expect, it } from "vitest";
import {
  isActionEventType,
  validateCreateActionEventInput,
  validateCreateFrictionEventInput,
} from "./eventMapping";

const ANCHOR_ID = "9d3f6b0e-2c1a-4f7e-8b1a-1a2b3c4d5e6f";
const CLIENT_EVENT_ID = "6f5e4d3c-2b1a-4c8d-9e0f-1a2b3c4d5e6f";

describe("isActionEventType", () => {
  it("accepts every schema-supported value", () => {
    expect(isActionEventType("STARTED")).toBe(true);
    expect(isActionEventType("COMPLETED")).toBe(true);
    expect(isActionEventType("POSTPONED")).toBe(true);
    expect(isActionEventType("PARKED_TODAY")).toBe(true);
  });

  it("rejects values outside the schema vocabulary", () => {
    expect(isActionEventType("DONE")).toBe(false);
    expect(isActionEventType("")).toBe(false);
    expect(isActionEventType(123)).toBe(false);
  });
});

describe("validateCreateActionEventInput", () => {
  function validInput() {
    return {
      anchorId: ANCHOR_ID,
      eventType: "COMPLETED" as const,
      clientEventId: CLIENT_EVENT_ID,
    };
  }

  it("accepts a well-formed input", () => {
    expect(validateCreateActionEventInput(validInput())).toEqual({ ok: true });
  });

  it("rejects a non-UUID anchor id", () => {
    const result = validateCreateActionEventInput({ ...validInput(), anchorId: "not-a-uuid" });
    expect(result.ok).toBe(false);
  });

  it("rejects an event type outside the schema vocabulary", () => {
    const result = validateCreateActionEventInput({
      ...validInput(),
      // @ts-expect-error deliberately invalid for the test
      eventType: "DONE",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-UUID client event id", () => {
    const result = validateCreateActionEventInput({ ...validInput(), clientEventId: "retry-1" });
    expect(result.ok).toBe(false);
  });
});

describe("validateCreateFrictionEventInput", () => {
  function validInput() {
    return {
      anchorId: ANCHOR_ID,
      clientEventId: CLIENT_EVENT_ID,
      reason: "It feels too big to start right now.",
    };
  }

  it("accepts a well-formed, non-empty reason", () => {
    expect(validateCreateFrictionEventInput(validInput())).toEqual({ ok: true });
  });

  it("rejects whitespace-only reason text", () => {
    const result = validateCreateFrictionEventInput({ ...validInput(), reason: "   " });
    expect(result.ok).toBe(false);
  });

  it("rejects empty reason text", () => {
    const result = validateCreateFrictionEventInput({ ...validInput(), reason: "" });
    expect(result.ok).toBe(false);
  });

  it("rejects reason text over the bounded length", () => {
    const result = validateCreateFrictionEventInput({
      ...validInput(),
      reason: "a".repeat(501),
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-UUID anchor id", () => {
    const result = validateCreateFrictionEventInput({ ...validInput(), anchorId: "not-a-uuid" });
    expect(result.ok).toBe(false);
  });
});
