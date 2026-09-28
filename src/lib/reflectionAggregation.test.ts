import { describe, expect, it } from "vitest";
import { aggregateReflectionFacts } from "./reflectionAggregation";
import type { ReflectionPeriod } from "./reflectionPeriod";

const PERIOD: ReflectionPeriod = {
  type: "WEEKLY",
  start: "2026-03-16",
  end: "2026-03-22",
  timeZone: "Europe/Amsterdam",
};

function actionEvent(
  eventType: string,
  localDate: string,
  occurredAt: string,
  anchor: { id: string; text: string; position: number }
) {
  return {
    eventType: eventType as never,
    localDate,
    occurredAt,
    anchorId: anchor.id,
    anchorText: anchor.text,
    anchorPosition: anchor.position,
  };
}

function frictionEvent(reason: string, localDate: string, occurredAt: string) {
  return { reason, localDate, occurredAt };
}

const READ = { id: "anchor-read", text: "Read for 10 minutes", position: 1 };
const WALK = { id: "anchor-walk", text: "Walk for 20 minutes", position: 2 };
const JOURNAL = { id: "anchor-journal", text: "Journal for 5 minutes", position: 3 };

describe("aggregateReflectionFacts", () => {
  it("counts each ActionEvent type independently", () => {
    const facts = aggregateReflectionFacts({
      period: PERIOD,
      actionEvents: [
        actionEvent("STARTED", "2026-03-16", "2026-03-16T08:00:00Z", READ),
        actionEvent("STARTED", "2026-03-17", "2026-03-17T08:00:00Z", READ),
        actionEvent("COMPLETED", "2026-03-16", "2026-03-16T08:05:00Z", READ),
        actionEvent("POSTPONED", "2026-03-18", "2026-03-18T08:00:00Z", WALK),
        actionEvent("PARKED_TODAY", "2026-03-19", "2026-03-19T08:00:00Z", JOURNAL),
      ],
      frictionEvents: [],
    });

    expect(facts.activity.activeDays).toBe(4);
    expect(facts.activity.startedCount).toBe(2);
    expect(facts.activity.completedCount).toBe(1);
    expect(facts.activity.postponedCount).toBe(1);
    expect(facts.activity.parkedCount).toBe(1);
  });

  it("counts a local_date once even with multiple events on it", () => {
    const facts = aggregateReflectionFacts({
      period: PERIOD,
      actionEvents: [
        actionEvent("STARTED", "2026-03-16", "2026-03-16T08:00:00Z", READ),
        actionEvent("COMPLETED", "2026-03-16", "2026-03-16T09:00:00Z", READ),
        actionEvent("POSTPONED", "2026-03-16", "2026-03-16T10:00:00Z", WALK),
      ],
      frictionEvents: [],
    });

    expect(facts.activity.activeDays).toBe(1);
  });

  it("counts an ActionEvent + FrictionEvent on the same date as one active day", () => {
    const facts = aggregateReflectionFacts({
      period: PERIOD,
      actionEvents: [actionEvent("STARTED", "2026-03-16", "2026-03-16T08:00:00Z", READ)],
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
      completedAnchors: [],
      notCompletedAnchors: [],
    });
    expect(facts.friction).toEqual({ entriesCount: 0 });
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
    it("counts entries without persisting raw reason text that has no current consumer", () => {
      const facts = aggregateReflectionFacts({
        period: PERIOD,
        actionEvents: [],
        frictionEvents: [
          frictionEvent("It felt too big", "2026-03-16", "2026-03-16T08:00:00Z"),
          frictionEvent("Low energy today", "2026-03-17", "2026-03-17T08:00:00Z"),
        ],
      });

      expect(facts.friction.entriesCount).toBe(2);
      expect(facts.friction).not.toHaveProperty("reasons");
    });

    it("counts exact duplicate reason submissions as separate factual entries", () => {
      const facts = aggregateReflectionFacts({
        period: PERIOD,
        actionEvents: [],
        frictionEvents: [
          frictionEvent("Low energy", "2026-03-16", "2026-03-16T08:00:00Z"),
          frictionEvent("Low energy", "2026-03-17", "2026-03-17T08:00:00Z"),
        ],
      });

      expect(facts.friction.entriesCount).toBe(2);
    });

    it("never introduces a classification/sentiment/raw-text field", () => {
      const facts = aggregateReflectionFacts({
        period: PERIOD,
        actionEvents: [],
        frictionEvents: [frictionEvent("Low energy", "2026-03-16", "2026-03-16T08:00:00Z")],
      });

      expect(Object.keys(facts.friction).sort()).toEqual(["entriesCount"]);
    });
  });

  it("includes events regardless of which Goal/Anchor they trace back to (archived-Goal history is the caller's responsibility to fetch, not this function's to filter)", () => {
    // aggregateReflectionFacts has no Goal/Anchor status concept at all — it
    // only ever sees whatever rows the caller already retrieved. This proves
    // it does not silently drop or special-case anything based on shape.
    const facts = aggregateReflectionFacts({
      period: PERIOD,
      actionEvents: [actionEvent("COMPLETED", "2026-03-16", "2026-03-16T08:00:00Z", READ)],
      frictionEvents: [],
    });

    expect(facts.activity.completedCount).toBe(1);
  });

  describe("completedAnchors / notCompletedAnchors", () => {
    it("puts an anchor with a COMPLETED event in completedAnchors, by text", () => {
      const facts = aggregateReflectionFacts({
        period: PERIOD,
        actionEvents: [actionEvent("COMPLETED", "2026-03-16", "2026-03-16T08:00:00Z", READ)],
        frictionEvents: [],
      });

      expect(facts.activity.completedAnchors).toEqual(["Read for 10 minutes"]);
      expect(facts.activity.notCompletedAnchors).toEqual([]);
    });

    it("puts a postponed-only anchor in notCompletedAnchors", () => {
      const facts = aggregateReflectionFacts({
        period: PERIOD,
        actionEvents: [actionEvent("POSTPONED", "2026-03-16", "2026-03-16T08:00:00Z", WALK)],
        frictionEvents: [],
      });

      expect(facts.activity.completedAnchors).toEqual([]);
      expect(facts.activity.notCompletedAnchors).toEqual(["Walk for 20 minutes"]);
    });

    it("puts a parked-only anchor in notCompletedAnchors", () => {
      const facts = aggregateReflectionFacts({
        period: PERIOD,
        actionEvents: [actionEvent("PARKED_TODAY", "2026-03-16", "2026-03-16T08:00:00Z", JOURNAL)],
        frictionEvents: [],
      });

      expect(facts.activity.notCompletedAnchors).toEqual(["Journal for 5 minutes"]);
    });

    it("puts a started-but-never-completed anchor in notCompletedAnchors", () => {
      const facts = aggregateReflectionFacts({
        period: PERIOD,
        actionEvents: [actionEvent("STARTED", "2026-03-16", "2026-03-16T08:00:00Z", READ)],
        frictionEvents: [],
      });

      expect(facts.activity.notCompletedAnchors).toEqual(["Read for 10 minutes"]);
    });

    it("treats an anchor that was eventually completed as completed, even if it was postponed earlier in the period", () => {
      const facts = aggregateReflectionFacts({
        period: PERIOD,
        actionEvents: [
          actionEvent("POSTPONED", "2026-03-16", "2026-03-16T08:00:00Z", READ),
          actionEvent("COMPLETED", "2026-03-18", "2026-03-18T08:00:00Z", READ),
        ],
        frictionEvents: [],
      });

      expect(facts.activity.completedAnchors).toEqual(["Read for 10 minutes"]);
      expect(facts.activity.notCompletedAnchors).toEqual([]);
    });

    it("lists a repeatedly-completed anchor once, not once per COMPLETED event", () => {
      const facts = aggregateReflectionFacts({
        period: PERIOD,
        actionEvents: [
          actionEvent("COMPLETED", "2026-03-16", "2026-03-16T08:00:00Z", READ),
          actionEvent("COMPLETED", "2026-03-17", "2026-03-17T08:00:00Z", READ),
          actionEvent("COMPLETED", "2026-03-18", "2026-03-18T08:00:00Z", READ),
        ],
        frictionEvents: [],
      });

      expect(facts.activity.completedAnchors).toEqual(["Read for 10 minutes"]);
      expect(facts.activity.completedCount).toBe(3);
    });

    it("orders both lists by anchor position, independent of event order", () => {
      const facts = aggregateReflectionFacts({
        period: PERIOD,
        actionEvents: [
          actionEvent("COMPLETED", "2026-03-18", "2026-03-18T08:00:00Z", JOURNAL),
          actionEvent("COMPLETED", "2026-03-16", "2026-03-16T08:00:00Z", WALK),
          actionEvent("COMPLETED", "2026-03-17", "2026-03-17T08:00:00Z", READ),
        ],
        frictionEvents: [],
      });

      expect(facts.activity.completedAnchors).toEqual([
        "Read for 10 minutes",
        "Walk for 20 minutes",
        "Journal for 5 minutes",
      ]);
    });

    it("keeps completed and not-completed anchors in separate, non-overlapping lists", () => {
      const facts = aggregateReflectionFacts({
        period: PERIOD,
        actionEvents: [
          actionEvent("COMPLETED", "2026-03-16", "2026-03-16T08:00:00Z", READ),
          actionEvent("POSTPONED", "2026-03-17", "2026-03-17T08:00:00Z", WALK),
          actionEvent("PARKED_TODAY", "2026-03-18", "2026-03-18T08:00:00Z", JOURNAL),
        ],
        frictionEvents: [],
      });

      expect(facts.activity.completedAnchors).toEqual(["Read for 10 minutes"]);
      expect(facts.activity.notCompletedAnchors).toEqual([
        "Walk for 20 minutes",
        "Journal for 5 minutes",
      ]);
    });
  });
});
