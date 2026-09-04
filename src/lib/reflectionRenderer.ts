// Deterministic, non-AI reflection renderer. The same ReflectionFacts always
// produce the same text. The wording is intentionally calm, factual and brief;
// it does not infer meaning from friction text or introduce a second source of
// truth beside the persisted facts snapshot.

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
