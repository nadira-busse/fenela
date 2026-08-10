import { describe, expect, it } from "vitest";
import { aggregateReflectionFacts } from "./reflectionAggregation";
import type { ReflectionPeriod } from "./reflectionPeriod";

const PERIOD: ReflectionPeriod = {
  type: "WEEKLY",
  start: "2026-03-16",
  end: "2026-03-22",
  timeZone: "Europe/Amsterdam",
};

function actionEvent(eventType: string, localDate: string, occurredAt: string) {
  return { eventType: eventType as never, localDate, occurredAt };
}

function frictionEvent(reason: string, localDate: string, occurredAt: string) {
  return { reason, localDate, occurredAt };
}

describe("aggregateReflectionFacts", () => {
  it("counts each ActionEvent type independently", () => {
    const facts = aggregateReflectionFacts({
      period: PERIOD,
      actionEvents: [
        actionEvent("STARTED", "2026-03-16", "2026-03-16T08:00:00Z"),
        actionEvent("STARTED", "2026-03-17", "2026-03-17T08:00:00Z"),
        actionEvent("COMPLETED", "2026-03-16", "2026-03-16T08:05:00Z"),
        actionEvent("POSTPONED", "2026-03-18", "2026-03-18T08:00:00Z"),
        actionEvent("PARKED_TODAY", "2026-03-19", "2026-03-19T08:00:00Z"),
      ],
      frictionEvents: [],
    });

    expect(facts.activity).toEqual({
      activeDays: 4,
      startedCount: 2,
      completedCount: 1,
      postponedCount: 1,
      parkedCount: 1,
    });
  });

  it("counts a local_date once even with multiple events on it", () => {
    const facts = aggregateReflectionFacts({
      period: PERIOD,
      actionEvents: [
        actionEvent("STARTED", "2026-03-16", "2026-03-16T08:00:00Z"),
        actionEvent("COMPLETED", "2026-03-16", "2026-03-16T09:00:00Z"),
        actionEvent("POSTPONED", "2026-03-16", "2026-03-16T10:00:00Z"),
      ],
      frictionEvents: [],
    });

    expect(facts.activity.activeDays).toBe(1);
  });

  it("counts an ActionEvent + FrictionEvent on the same date as one active day", () => {
    const facts = aggregateReflectionFacts({
      period: PERIOD,
      actionEvents: [actionEvent("STARTED", "2026-03-16", "2026-03-16T08:00:00Z")],
      frictionEvents: [frictionEvent("Too tired", "2026-03-16", "2026-03-16T08:01:00Z")],
    });

    expect(facts.activity.activeDays).toBe(1);
  });

  it("counts a FrictionEvent-only day as an active day", () => {
    const facts = aggregateReflectionFacts({
      period: PERIOD,
      actionEvents: [],
      frictionEvents: [frictionEvent("Too tired", "2026-03-17", "2026-03-17T08:00:00Z")],
    });

    expect(facts.activity.activeDays).toBe(1);
    expect(facts.activity.startedCount).toBe(0);
  });

  it("handles an empty period deterministically — all zero, no fabricated activity", () => {
    const facts = aggregateReflectionFacts({
      period: PERIOD,
      actionEvents: [],
      frictionEvents: [],
    });

    expect(facts.activity).toEqual({
      activeDays: 0,
      startedCount: 0,
      completedCount: 0,
      postponedCount: 0,
      parkedCount: 0,
    });
    expect(facts.friction).toEqual({ entriesCount: 0, reasons: [] });
  });

  it("preserves the period passed in unchanged", () => {
    const facts = aggregateReflectionFacts({
      period: PERIOD,
      actionEvents: [],
      frictionEvents: [],
    });

    expect(facts.period).toEqual(PERIOD);
  });

  describe("friction", () => {
    it("counts entries and preserves raw reason text", () => {
      const facts = aggregateReflectionFacts({
        period: PERIOD,
        actionEvents: [],
        frictionEvents: [
          frictionEvent("It felt too big", "2026-03-16", "2026-03-16T08:00:00Z"),
          frictionEvent("Low energy today", "2026-03-17", "2026-03-17T08:00:00Z"),
        ],
      });

      expect(facts.friction.entriesCount).toBe(2);
      expect(facts.friction.reasons).toEqual(["It felt too big", "Low energy today"]);
    });

    it("preserves exact duplicate reason text as separate factual entries", () => {
      const facts = aggregateReflectionFacts({
        period: PERIOD,
        actionEvents: [],
        frictionEvents: [
          frictionEvent("Low energy", "2026-03-16", "2026-03-16T08:00:00Z"),
          frictionEvent("Low energy", "2026-03-17", "2026-03-17T08:00:00Z"),
        ],
      });

      expect(facts.friction.entriesCount).toBe(2);
      expect(facts.friction.reasons).toEqual(["Low energy", "Low energy"]);
    });

    it("orders reasons by occurred_at ascending regardless of input order", () => {
      const facts = aggregateReflectionFacts({
        period: PERIOD,
        actionEvents: [],
        frictionEvents: [
          frictionEvent("third", "2026-03-18", "2026-03-18T08:00:00Z"),
          frictionEvent("first", "2026-03-16", "2026-03-16T08:00:00Z"),
          frictionEvent("second", "2026-03-17", "2026-03-17T08:00:00Z"),
        ],
      });

      expect(facts.friction.reasons).toEqual(["first", "second", "third"]);
    });

    it("never introduces a classification/sentiment field", () => {
      const facts = aggregateReflectionFacts({
        period: PERIOD,
        actionEvents: [],
        frictionEvents: [frictionEvent("Low energy", "2026-03-16", "2026-03-16T08:00:00Z")],
      });

      expect(Object.keys(facts.friction).sort()).toEqual(["entriesCount", "reasons"]);
    });
  });

  it("includes events regardless of which Goal/Anchor they trace back to (archived-Goal history is the caller's responsibility to fetch, not this function's to filter)", () => {
    // aggregateReflectionFacts has no Goal/Anchor concept at all — it only
    // ever sees whatever rows the caller already retrieved. This proves it
    // does not silently drop or special-case anything based on shape.
    const facts = aggregateReflectionFacts({
      period: PERIOD,
      actionEvents: [actionEvent("COMPLETED", "2026-03-16", "2026-03-16T08:00:00Z")],
      frictionEvents: [],
    });

    expect(facts.activity.completedCount).toBe(1);
  });
});
