// Deterministic, non-AI reflection text renderer (Phase 4E §13/§28,
// ADR-005). Pure function of ReflectionFacts — same facts always produce
// the exact same text, with no OpenAI/LLM call anywhere in this module.
//
// Downstream-replaceable by design: an optional AI renderer (Phase 4F)
// would sit alongside this one, both consuming the same ReflectionFacts —
// aggregation is never coupled to either renderer.
//
// Style constraints (deliberate, ADR-005 §13): calm, factual, brief,
// non-judgmental. No productivity/therapeutic language, no percentages or
// rates, no inferred meaning from friction text — only what was counted.

import type { ReflectionFacts } from "@/lib/reflectionAggregation";

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function renderDeterministicReflectionText(facts: ReflectionFacts): string {
  const { activity, friction } = facts;
  const lines: string[] = [];

  if (activity.activeDays === 0) {
    lines.push("There was no recorded activity in this period.");
  } else {
    lines.push(`You came back on ${activity.activeDays} ${pluralize(activity.activeDays, "day")}.`);
  }

  const actionParts: string[] = [];

  if (activity.completedCount > 0) {
    actionParts.push(
      `completed ${activity.completedCount} ${pluralize(activity.completedCount, "action")}`
    );
  }

  if (activity.postponedCount > 0) {
    actionParts.push(
      `postponed ${activity.postponedCount} ${pluralize(activity.postponedCount, "action")}`
    );
  }

  if (actionParts.length > 0) {
    lines.push(`You ${actionParts.join(" and ")}.`);
  }

  if (activity.parkedCount > 0) {
    const anchorWord = pluralize(activity.parkedCount, "anchor");
    const verbPhrase = activity.parkedCount === 1 ? "was parked" : "were parked";
    lines.push(`${activity.parkedCount} ${anchorWord} ${verbPhrase} for the day.`);
  }

  if (friction.entriesCount > 0) {
    lines.push(
      `You noted ${friction.entriesCount} ${pluralize(friction.entriesCount, "moment")} of friction.`
    );
  }

  return lines.join("\n");
}
