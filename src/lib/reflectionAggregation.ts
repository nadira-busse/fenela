// Deterministic aggregation from stored ActionEvent/FrictionEvent history
// into the small, explicit ReflectionFacts contract (Phase 4E §4/§10/§11,
// ADR-005). Pure and framework-free — takes already-retrieved rows (see
// src/server/reflections/getOwnHistoryForPeriod.ts) and never touches
// Supabase itself, so the counting/ordering rules are directly
// unit-testable.
//
// Deliberately excluded, per ADR-005/Phase 4E §29: completion percentages,
// success rates, streaks, rankings, inferred trends, friction
// classification, sentiment. Only counts — no raw text.
//
// Phase 4H hardening: this previously also copied every raw
// friction_events.reason string into `friction.reasons`. The deterministic
// renderer (reflectionRenderer.ts) never used it — only
// `friction.entriesCount` — so it was a second, dormant persisted copy of
// text already canonically stored in friction_events.reason, with no
// current product consumer. Removed rather than kept for a hypothetical
// future (MVP3 AI-assisted wording is not implemented); that feature, if
// built, can read friction_events directly the same way this function
// already does.

import type { ActionEventType } from "@/lib/eventMapping";
import type { ReflectionPeriod } from "@/lib/reflectionPeriod";

export type ReflectionFacts = {
  period: ReflectionPeriod;
  activity: {
    // Distinct local_date values with at least one ActionEvent or
    // FrictionEvent in the period (§10) — a FrictionEvent-only day still
    // counts, since the user meaningfully interacted with Fenéla that day
    // even without a completed/started/postponed/parked action.
    activeDays: number;
    startedCount: number;
    completedCount: number;
    postponedCount: number;
    parkedCount: number;
  };
  friction: {
    entriesCount: number;
  };
};

export type AggregationActionEvent = {
  eventType: ActionEventType;
  localDate: string;
  occurredAt: string;
};

export type AggregationFrictionEvent = {
  reason: string;
  localDate: string;
  occurredAt: string;
};

export type AggregateReflectionFactsInput = {
  period: ReflectionPeriod;
  actionEvents: AggregationActionEvent[];
  frictionEvents: AggregationFrictionEvent[];
};

function byOccurredAtAscending<T extends { occurredAt: string }>(a: T, b: T): number {
  if (a.occurredAt < b.occurredAt) return -1;
  if (a.occurredAt > b.occurredAt) return 1;
  return 0;
}

export function aggregateReflectionFacts(input: AggregateReflectionFactsInput): ReflectionFacts {
  const activeDates = new Set<string>();

  let startedCount = 0;
  let completedCount = 0;
  let postponedCount = 0;
  let parkedCount = 0;

  const sortedActionEvents = [...input.actionEvents].sort(byOccurredAtAscending);

  for (const event of sortedActionEvents) {
    activeDates.add(event.localDate);

    switch (event.eventType) {
      case "STARTED":
        startedCount++;
        break;
      case "COMPLETED":
        completedCount++;
        break;
      case "POSTPONED":
        postponedCount++;
        break;
      case "PARKED_TODAY":
        parkedCount++;
        break;
    }
  }

  // No longer sorted by occurred_at (Phase 4H hardening): that ordering
  // only existed to keep the now-removed `reasons` array chronological —
  // activeDates (a Set) and entriesCount are both order-independent.
  for (const event of input.frictionEvents) {
    activeDates.add(event.localDate);
  }

  return {
    period: input.period,
    activity: {
      activeDays: activeDates.size,
      startedCount,
      completedCount,
      postponedCount,
      parkedCount,
    },
    friction: {
      entriesCount: input.frictionEvents.length,
    },
  };
}
