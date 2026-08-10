// Deterministic aggregation from stored ActionEvent/FrictionEvent history
// into the small, explicit ReflectionFacts contract (Phase 4E §4/§10/§11,
// ADR-005). Pure and framework-free — takes already-retrieved rows (see
// src/server/reflections/getOwnHistoryForPeriod.ts) and never touches
// Supabase itself, so the counting/ordering rules are directly
// unit-testable.
//
// Deliberately excluded, per ADR-005/Phase 4E §29: completion percentages,
// success rates, streaks, rankings, inferred trends, friction
// classification, sentiment. Only counts and raw stored text.

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
    // Raw, factual, stored user text — occurred_at ascending (§11).
    // Exact duplicates from separate events remain duplicated; nothing is
    // deduplicated, classified, or reworded.
    reasons: string[];
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

  const sortedFrictionEvents = [...input.frictionEvents].sort(byOccurredAtAscending);
  const reasons: string[] = [];

  for (const event of sortedFrictionEvents) {
    activeDates.add(event.localDate);
    reasons.push(event.reason);
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
      entriesCount: sortedFrictionEvents.length,
      reasons,
    },
  };
}
