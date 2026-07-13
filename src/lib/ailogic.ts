// src/lib/ailogic.ts

import type { ScreeningV1 } from "@/lib/screeningStorage";
import { hasUnsafeIntent } from "@/lib/safety";
import type { PersonalAnchorInterpretation } from "@/types/intake";

export type AIState =
  | "START_DAY"
  | "DO_ACTION"
  | "AWAITING_DONE"
  | "LATER_EMPATHY"
  | "PAUSE_QUESTION"
  | "DIRECTIONAL_MOTIVATION"
  | "DONE";

export type AICtx = {
  state: AIState;

  intake: {
    name: string;
    goal: string;
    struggle: string;
    goalWhy: string;
    personalAnchorInterpretation?: PersonalAnchorInterpretation;
  };

  screening: ScreeningV1 | null;

  task?: {
    text: string;
    pauseCount: number;
  };

  stats?: {
    doneCount: number;
    parkedCount: number;
  };
};

export type AICopy = {
  // Shared
  title?: string;
  subline?: string;

  // Today
  taskLine?: string;
  primaryCta?: string;
  secondaryCta?: string;

  // Awaiting done
  waitingTitle?: string;
  waitingLine?: string;
  doneCta?: string;

  // Pause question
  pauseTitle?: string;
  pauseSubline?: string;
  pausePrompt?: string;
  pausePlaceholder?: string;
  pauseSaveCta?: string;
  pauseDoNowCta?: string;

  // Directional
  directionalTitle?: string;
  directionalSubline?: string;
  directionalLine?: string;
  directionalNote?: string;
  directionalCta?: string;

  // Later empathy
  laterEmpathyTitle?: string;
  laterEmpathyLine?: string;

  // Done screen
  doneTitle?: string;
  doneLine?: string;
};

function preferShortText(screening: ScreeningV1 | null) {
  return (
    screening?.guidanceProfile?.copyLength === "SHORT" ||
    screening?.antiHelp?.includes("LONG_TEXT") ||
    false
  );
}

function avoidPressure(screening: ScreeningV1 | null) {
  return (
    screening?.guidanceProfile?.pressureLimit === "LOW" ||
    screening?.antiHelp?.includes("PRESSURE") ||
    false
  );
}

function avoidRepetition(screening: ScreeningV1 | null) {
  return (
    screening?.guidanceProfile?.repetitionLimit === "LOW" ||
    screening?.antiHelp?.includes("REPETITION") ||
    false
  );
}

function actionStyle(screening: ScreeningV1 | null) {
  return screening?.guidanceProfile?.actionStyle ?? "SMALL_STEP";
}

function mainChallenge(screening: ScreeningV1 | null) {
  return screening?.mainChallenge ?? "START";
}

function resistancePattern(screening: ScreeningV1 | null) {
  return screening?.resistancePattern ?? "DELAY";
}

function cleanLine(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function safeDisplayLine(value: string | undefined) {
  const cleaned = cleanLine(value);
  if (!cleaned) return "";
  return hasUnsafeIntent(cleaned) ? "" : cleaned;
}

function buildFallbackInterpretation(ctx: AICtx): PersonalAnchorInterpretation {
  const goal = safeDisplayLine(ctx.intake.goal);
  const why = safeDisplayLine(ctx.intake.goalWhy);

  return {
    directionLine: goal ? `You want to return to ${goal}` : "You want to return to what matters",
    whyLine: why,
    frictionLine: "",
    returnLine: "One small step is enough for today",
  };
}

function getInterpretation(ctx: AICtx): PersonalAnchorInterpretation {
  const interpretation = ctx.intake.personalAnchorInterpretation;

  if (
    interpretation?.directionLine &&
    interpretation?.whyLine &&
    interpretation?.frictionLine &&
    interpretation?.returnLine
  ) {
    return {
      directionLine: safeDisplayLine(interpretation.directionLine),
      whyLine: safeDisplayLine(interpretation.whyLine),
      frictionLine: safeDisplayLine(interpretation.frictionLine),
      returnLine: safeDisplayLine(interpretation.returnLine),
    };
  }

  return buildFallbackInterpretation(ctx);
}

function taskLabel(task: string | undefined) {
  const cleaned = safeDisplayLine(task);
  return cleaned || "one small step";
}

function buildActionNudge(input: {
  style: ReturnType<typeof actionStyle>;
  pattern: ReturnType<typeof resistancePattern>;
  interpretation: PersonalAnchorInterpretation;
  short: boolean;
}) {
  const { style, pattern, interpretation, short } = input;

  if (style === "WHY_FIRST" && interpretation.whyLine) {
    return interpretation.whyLine;
  }

  if (style === "REMINDER_FIRST" && interpretation.returnLine) {
    return interpretation.returnLine;
  }

  if (pattern === "FORCE") {
    return short ? "Small is enough." : "Keep the step small enough to start.";
  }

  if (pattern === "SWITCH") {
    return short ? "One thing only." : "One thing only. Do not solve the whole day.";
  }

  if (pattern === "QUIT") {
    return short ? "Begin again small." : "Begin again with one small step.";
  }

  return "Keep it small enough to start.";
}

// Prefer the AI-refined whyLine (already computed in getAICopy via
// getInterpretation) over re-deriving it from the raw intake text. Falls
// back to the raw text only when no interpretation is available.
function buildWhyReminder(ctx: AICtx, interpretation: PersonalAnchorInterpretation) {
  const why = interpretation.whyLine || safeDisplayLine(ctx.intake.goalWhy);
  return why ? `Remember your why:\n${why}` : "";
}

export function getAICopy(ctx: AICtx): AICopy {
  const screening = ctx.screening;

  const short = preferShortText(screening);
  const noPressure = avoidPressure(screening);
  const lowRepetition = avoidRepetition(screening);
  const style = actionStyle(screening);
  const challenge = mainChallenge(screening);
  const pattern = resistancePattern(screening);

  const interpretation = getInterpretation(ctx);
  const task = taskLabel(ctx.task?.text);

  // ---- START DAY ----
  if (ctx.state === "START_DAY") {
    const subline = short
      ? interpretation.directionLine
      : [interpretation.directionLine, interpretation.whyLine].filter(Boolean).join("\n");

    return {
      title: "Your anchor",
      subline: subline || ctx.intake.goal,
      primaryCta: "Start day",
    };
  }

  // ---- DO ACTION ----
  if (ctx.state === "DO_ACTION") {
    const actionNudge = buildActionNudge({
      style,
      pattern,
      interpretation,
      short,
    });

    return {
      title: "Today's small step",
      subline: short ? actionNudge : `${actionNudge} No extra plan needed.`,
      taskLine: task,
      primaryCta: "I'll do this now",
      secondaryCta: "Later",
    };
  }

  // ---- AWAITING DONE ----
  if (ctx.state === "AWAITING_DONE") {
    return {
      waitingTitle: "Now",
      waitingLine: noPressure ? `Take your time with: ${task}` : `Do this now: ${task}`,
      doneCta: "Done",
      subline: short
        ? "Take your time. Come back when you’re done."
        : "Come back when this small step is done.",
    };
  }

  // ---- LATER EMPATHY ----
  if (ctx.state === "LATER_EMPATHY") {
    return {
      laterEmpathyTitle: noPressure ? "No pressure." : "Paused.",
      laterEmpathyLine: "We’ll come back to this anchor later.",
    };
  }

  // ---- PAUSE QUESTION ----
  if (ctx.state === "PAUSE_QUESTION") {
    const prompt =
      challenge === "BOUNDARIES"
        ? "What would make this step safe enough today?"
        : challenge === "SUSTAIN"
          ? "What would make this step easier to finish?"
          : "What is making this step hard right now?";

    return {
      pauseTitle: "Pause noted",
      pauseSubline: interpretation.frictionLine || undefined,
      pausePrompt: prompt,
      pausePlaceholder: "One honest sentence is enough...",
      pauseSaveCta: "Try again later",
      pauseDoNowCta: "I'll do it now",
    };
  }

  // ---- DIRECTIONAL MOTIVATION ----
  if (ctx.state === "DIRECTIONAL_MOTIVATION") {
    return {
      directionalTitle: "Parked for today",
      directionalSubline: lowRepetition ? "No failure here." : "No failure here. Just steering.",
      directionalLine: buildWhyReminder(ctx, interpretation),
      directionalNote: "Let's try again tomorrow.",
      directionalCta: "Okay",
    };
  }

  // ---- DONE ----
  if (ctx.state === "DONE") {
    const done = ctx.stats?.doneCount ?? 0;
    const parked = ctx.stats?.parkedCount ?? 0;

    if (done > 0 && parked === 0) {
      return {
        doneTitle: "End of day",
        doneLine: "You showed up. Continue tomorrow.",
      };
    }

    if (done > 0 && parked > 0) {
      return {
        doneTitle: "End of day",
        doneLine: "Some done, some parked. Continue tomorrow.",
      };
    }

    return {
      doneTitle: "End of day",
      doneLine: "Try again tomorrow.",
    };
  }

  return {};
}
