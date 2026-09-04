// Deterministically aggregates immutable ActionEvent and FrictionEvent history
// into the small ReflectionFacts contract used by reflection rendering. Raw
// friction reasons are deliberately excluded: reflections keep factual counts
// and period metadata rather than copying free text into derived history.

import type { ActionEventType } from "@/lib/eventMapping";
import type { ReflectionPeriod } from "@/lib/reflectionPeriod";

export type ReflectionFacts = {
  period: ReflectionPeriod;
  activity: {
    // Distinct local_date values with at least one ActionEvent or
    // FrictionEvent in the period; a FrictionEvent-only day still
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

  // Friction aggregation depends on counts and active dates, not event order.
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
