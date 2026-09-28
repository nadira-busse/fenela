// Deterministically aggregates immutable ActionEvent and FrictionEvent history
// into the small ReflectionFacts contract used by reflection rendering. Raw
// friction reasons are deliberately excluded: reflections keep factual counts
// and period metadata rather than copying free text into derived history.
// Anchor text is different from friction reasons: it is short, fixed
// (position 1..5) concrete-action text the user already sees throughout the
// app (src/server/goals/getActiveGoal.ts), not free text, and the renderer
// actively uses it (not a dormant second copy) — see
// supabase/migrations/20260812130000_reflections_facts_snapshot_drop_friction_reasons.sql
// for why a *dormant* duplicate was removed; that reasoning does not apply
// to an actively-rendered field.

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
    // Distinct anchors (by anchor id) with at least one COMPLETED event in
    // the period, ordered by the anchor's own position (1..5) so the list
    // matches the order the user already sees the anchor in elsewhere.
    completedAnchors: string[];
    // Distinct anchors with at least one STARTED/POSTPONED/PARKED_TODAY
    // event in the period and no COMPLETED event in the period — i.e.
    // touched but not finished by period end. Same ordering as above.
    notCompletedAnchors: string[];
  };
  friction: {
    entriesCount: number;
  };
};

export type AggregationActionEvent = {
  eventType: ActionEventType;
  localDate: string;
  occurredAt: string;
  anchorId: string;
  anchorText: string;
  anchorPosition: number;
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

function byAnchorPositionThenText(
  a: { position: number; text: string; anchorId: string },
  b: { position: number; text: string; anchorId: string }
): number {
  if (a.position !== b.position) return a.position - b.position;
  if (a.text !== b.text) return a.text < b.text ? -1 : 1;
  if (a.anchorId !== b.anchorId) return a.anchorId < b.anchorId ? -1 : 1;
  return 0;
}

export function aggregateReflectionFacts(input: AggregateReflectionFactsInput): ReflectionFacts {
  const activeDates = new Set<string>();

  let startedCount = 0;
  let completedCount = 0;
  let postponedCount = 0;
  let parkedCount = 0;

  // Per-anchor outcome: an anchor with any COMPLETED event in the period is
  // "completed" for the period, regardless of when/whether it was also
  // started, postponed, or parked — a later completion is the factual
  // outcome that matters. Anything else touched in the period without a
  // COMPLETED event is "not completed".
  const anchorsById = new Map<string, { position: number; text: string; anchorId: string }>();
  const completedAnchorIds = new Set<string>();
  const touchedAnchorIds = new Set<string>();

  const sortedActionEvents = [...input.actionEvents].sort(byOccurredAtAscending);

  for (const event of sortedActionEvents) {
    activeDates.add(event.localDate);
    anchorsById.set(event.anchorId, {
      position: event.anchorPosition,
      text: event.anchorText,
      anchorId: event.anchorId,
    });
    touchedAnchorIds.add(event.anchorId);

    switch (event.eventType) {
      case "STARTED":
        startedCount++;
        break;
      case "COMPLETED":
        completedCount++;
        completedAnchorIds.add(event.anchorId);
        break;
      case "POSTPONED":
        postponedCount++;
        break;
      case "PARKED_TODAY":
        parkedCount++;
        break;
    }
  }

  const completedAnchors = [...completedAnchorIds]
    .map((id) => anchorsById.get(id)!)
    .sort(byAnchorPositionThenText)
    .map((anchor) => anchor.text);

  const notCompletedAnchors = [...touchedAnchorIds]
    .filter((id) => !completedAnchorIds.has(id))
    .map((id) => anchorsById.get(id)!)
    .sort(byAnchorPositionThenText)
    .map((anchor) => anchor.text);

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
      completedAnchors,
      notCompletedAnchors,
    },
    friction: {
      entriesCount: input.frictionEvents.length,
    },
  };
}
