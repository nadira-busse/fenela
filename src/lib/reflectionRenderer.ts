// Deterministic, non-AI reflection renderer. The same ReflectionFacts always
// produce the same text. The wording is intentionally calm, factual and brief;
// it does not infer meaning from friction text or introduce a second source of
// truth beside the persisted facts snapshot.
//
// Outcome lines name the concrete anchors (activity.completedAnchors /
// notCompletedAnchors — already deterministically ordered by
// aggregateReflectionFacts) instead of restating raw event-type counts: a
// user who came back to "You completed 1 action" cannot tell what that
// action was. Naming it is what makes the reflection a factual account
// rather than a tally. Sub-categorizing "not completed" by started vs
// postponed vs parked was deliberately left out to keep the text concise —
// the anchor either reached COMPLETED in the period or it didn't.

import type { ReflectionFacts } from "@/lib/reflectionAggregation";

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function formatList(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function renderDeterministicReflectionText(facts: ReflectionFacts): string {
  const { activity, friction } = facts;
  const lines: string[] = [];

  if (activity.activeDays === 0) {
    lines.push("There was no recorded activity in this period.");
  } else {
    lines.push(`You came back on ${activity.activeDays} ${pluralize(activity.activeDays, "day")}.`);
  }

  if (activity.completedAnchors.length > 0) {
    lines.push(`You completed: ${formatList(activity.completedAnchors)}.`);
  }

  if (activity.notCompletedAnchors.length > 0) {
    lines.push(`You did not complete: ${formatList(activity.notCompletedAnchors)}.`);
  }

  if (friction.entriesCount > 0) {
    lines.push(
      `You noted ${friction.entriesCount} ${pluralize(friction.entriesCount, "moment")} of friction.`
    );
  }

  return lines.join("\n");
}
