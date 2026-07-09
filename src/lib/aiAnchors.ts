import { hasUnsafeIntent } from "./safety";
import type {
  AnchorChoiceHelp,
  DailyReminderPreference,
  ResistancePattern,
  MainChallenge,
  ActionTrigger,
  AntiHelp,
  GuidanceProfile as StoredGuidanceProfile,
} from "@/types/screening";

export type {
  AnchorChoiceHelp,
  DailyReminderPreference,
  ResistancePattern,
  MainChallenge,
  ActionTrigger,
  AntiHelp,
} from "@/types/screening";

export type AnchorItem = {
  text: string;
};

// The AI route works with a partially-filled guidance profile (not every
// field is known yet), while the stored screening always has all fields
// set. Both share the same underlying shape from "@/types/screening".
export type GuidanceProfile = Partial<StoredGuidanceProfile>;

export type PersonalAnchorInterpretation = {
  directionLine: string;
  whyLine: string;
  frictionLine: string;
  returnLine: string;
};

export type AnchorsRequest = {
  mode: AnchorChoiceHelp;
  deviceId?: string;
  intake: {
    name?: string;
    goal: string;
    struggle: string;
    goalWhy: string;
  };
  screening?: {
    version?: 1;
    createdAtIso?: string;

    name?: string;
    mode?: AnchorChoiceHelp;
    dailyReminder?: DailyReminderPreference;
    startTime?: string;

    resistancePattern?: ResistancePattern;
    mainChallenge?: MainChallenge;
    actionTrigger?: ActionTrigger;
    antiHelp?: AntiHelp[];

    guidanceProfile?: GuidanceProfile;
  } | null;
};

export type AIResponse = {
  personalAnchorInterpretation?: Partial<PersonalAnchorInterpretation>;
  anchors?: Partial<AnchorItem>[];
};

export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

const VAGUE_ANCHORS = new Set([
  "read your why once",
  "start before deciding more",
  "do the first visible step",
  "start with one breath",
  "open what you need",
  "choose one small action",
  "start one tiny part",
  "do one small thing",
  "make the next step visible",
  "pause and choose gently",
  "take one deep breath",
  "open your study materials",
  "set a timer for 5 minutes",
  "make a plan",
  "prioritize your tasks",
  "decide what to do",
]);

const DECISION_WORK_PATTERNS = [
  /\bchoose\b/i,
  /\bdecide\b/i,
  /\bprioriti[sz]e\b/i,
  /\bpriority\b/i,
];

function addsDecisionWork(text: string) {
  return DECISION_WORK_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeWhitespace(value: string) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTrailingPunctuation(value: string) {
  return value.replace(/[.,;:!?\u2026]+$/g, "").trim();
}

function stripTrailingTimeWords(value: string) {
  return value.replace(/\s+(right now|right away|now|today)\s*$/i, "").trim();
}

function wordCount(value: string) {
  return normalizeWhitespace(value).split(" ").filter(Boolean).length;
}

function sanitizeAnchorText(raw: unknown) {
  return stripTrailingPunctuation(stripTrailingTimeWords(normalizeWhitespace(String(raw ?? ""))))
    .slice(0, 90)
    .trim();
}

function sanitizeLine(raw: unknown, maxWords: number) {
  const cleaned = normalizeWhitespace(String(raw ?? ""));
  const words = cleaned.split(" ").filter(Boolean);

  return words.slice(0, maxWords).join(" ").slice(0, 180).trim();
}

export function isValidMode(value: unknown): value is AnchorChoiceHelp {
  return value === "I_DECIDE" || value === "SUGGEST_ANCHORS";
}

export function anchorCount(mode: AnchorChoiceHelp) {
  return mode === "SUGGEST_ANCHORS" ? 3 : 0;
}

function prefersShortCopy(body: AnchorsRequest) {
  return (
    body.screening?.guidanceProfile?.copyLength === "SHORT" ||
    body.screening?.antiHelp?.includes("LONG_TEXT") ||
    false
  );
}

function isLowPressure(body: AnchorsRequest) {
  return (
    body.screening?.guidanceProfile?.pressureLimit === "LOW" ||
    body.screening?.antiHelp?.includes("PRESSURE") ||
    false
  );
}

function prefersFewOptions(body: AnchorsRequest) {
  return body.screening?.guidanceProfile?.choiceStyle === "ANCHOR_SUGGESTS" || false;
}

function prefersLowRepetition(body: AnchorsRequest) {
  return (
    body.screening?.guidanceProfile?.repetitionLimit === "LOW" ||
    body.screening?.antiHelp?.includes("REPETITION") ||
    false
  );
}

export function buildFallbackInterpretation(body: AnchorsRequest): PersonalAnchorInterpretation {
  const goal = stripTrailingPunctuation(normalizeWhitespace(body.intake.goal));
  const struggle = stripTrailingPunctuation(normalizeWhitespace(body.intake.struggle));
  const why = stripTrailingPunctuation(normalizeWhitespace(body.intake.goalWhy));

  return {
    directionLine: goal
      ? `You want to return to ${goal.toLowerCase()}`
      : "You want to return to what matters",
    whyLine: why || "This matters because you chose it before the day got heavy",
    frictionLine: struggle
      ? `${struggle} may make the step smaller, not impossible`
      : "Friction may make the step smaller, not impossible",
    returnLine: "One small step is enough for today",
  };
}

function safeInterpretationLine(raw: unknown, maxWords: number, fallback: string) {
  const cleaned = sanitizeLine(raw, maxWords);

  if (!cleaned || hasUnsafeIntent(cleaned)) {
    return fallback;
  }

  return cleaned;
}

export function sanitizeInterpretation(
  raw: AIResponse["personalAnchorInterpretation"],
  body: AnchorsRequest
): PersonalAnchorInterpretation {
  const fallback = buildFallbackInterpretation(body);
  const maxWords = prefersShortCopy(body) ? 11 : 15;

  return {
    directionLine: safeInterpretationLine(raw?.directionLine, maxWords, fallback.directionLine),
    whyLine: safeInterpretationLine(raw?.whyLine, maxWords, fallback.whyLine),
    frictionLine: safeInterpretationLine(raw?.frictionLine, maxWords, fallback.frictionLine),
    returnLine: safeInterpretationLine(raw?.returnLine, maxWords, fallback.returnLine),
  };
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return "";
  }

  return trimmed.slice(start, end + 1);
}

export function safeParseAIResponse(raw: string): AIResponse | null {
  const jsonText = extractJsonObject(raw);

  if (!jsonText) {
    return null;
  }

  try {
    return JSON.parse(jsonText) as AIResponse;
  } catch {
    return null;
  }
}

function isVagueAnchor(text: string) {
  return VAGUE_ANCHORS.has(text.toLowerCase());
}

export function sanitizeAndDedupeAnchors(rawAnchors: AIResponse["anchors"]) {
  if (!Array.isArray(rawAnchors)) {
    return [];
  }

  const seen = new Set<string>();
  const anchors: AnchorItem[] = [];

  for (const item of rawAnchors) {
    const text = sanitizeAnchorText(item?.text);
    const key = text.toLowerCase();

    if (!text || seen.has(key)) {
      continue;
    }

    seen.add(key);
    anchors.push({ text });
  }

  return anchors;
}

export function validateAnchors(anchors: AnchorItem[], count: number): ValidationResult {
  const errors: string[] = [];

  if (anchors.length !== count) {
    errors.push(`Expected exactly ${count} anchors, received ${anchors.length}.`);
  }

  anchors.forEach((anchor, index) => {
    const words = wordCount(anchor.text);

    if (words < 3 || words > 10) {
      errors.push(`Anchor ${index + 1} must be 3-10 words.`);
    }

    if (/[.,;:!?\u2026]$/.test(anchor.text)) {
      errors.push(`Anchor ${index + 1} must not end with punctuation.`);
    }

    if (isVagueAnchor(anchor.text)) {
      errors.push(`Anchor ${index + 1} is too generic: "${anchor.text}".`);
    }

    if (addsDecisionWork(anchor.text)) {
      errors.push(`Anchor ${index + 1} adds decision work: "${anchor.text}".`);
    }

    if (
      /diagnos|therapy|therapist|heal|healing|trauma|treatment|crisis|mental health/i.test(
        anchor.text
      )
    ) {
      errors.push(`Anchor ${index + 1} uses unsupported therapy, crisis or treatment language.`);
    }

    if (hasUnsafeIntent(anchor.text)) {
      errors.push(`Anchor ${index + 1} contains unsafe or unsupported intent.`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
  };
}

export function buildPrompt(body: AnchorsRequest, count: number) {
  const screening = body.screening;
  const guidanceProfile = screening?.guidanceProfile;

  const copyLength = guidanceProfile?.copyLength ?? (prefersShortCopy(body) ? "SHORT" : "MEDIUM");
  const pressureLimit = guidanceProfile?.pressureLimit ?? (isLowPressure(body) ? "LOW" : "NORMAL");
  const repetitionLimit =
    guidanceProfile?.repetitionLimit ?? (prefersLowRepetition(body) ? "LOW" : "NORMAL");
  const choiceStyle =
    guidanceProfile?.choiceStyle ?? (prefersFewOptions(body) ? "ANCHOR_SUGGESTS" : "USER_DECIDES");
  const actionStyle = guidanceProfile?.actionStyle ?? "SMALL_STEP";

  return [
    "You generate bounded personal guidance for an accountability app called Fenéla.",
    "Fenéla helps users move from overwhelm to one small action.",
    "",
    "Return ONLY valid JSON with this exact shape:",
    `{"personalAnchorInterpretation":{"directionLine":string,"whyLine":string,"frictionLine":string,"returnLine":string},"anchors":[{"text":string}]}`,
    "",
    "Primary task:",
    "- Interpret the user's actual goal, struggle and why.",
    "- Use the user's why as the main grounding signal for the anchors.",
    "- Create tiny anchors that are clearly connected to that meaning.",
    "- Do not use category templates or generic defaults.",
    "- Do not simply repeat the user's sentence.",
    "- Turn the goal into small, concrete, doable actions.",
    "",
    "Anchor quality rules:",
    `- Provide EXACTLY ${count} anchors.`,
    "- Each anchor must be 3-10 words.",
    "- Each anchor must be actionable.",
    "- Each anchor should start with a verb when natural.",
    "- Each anchor must be tiny enough to do today.",
    "- Each anchor must be specific to the user's input.",
    "- Do not end anchors with now, today, right now or right away. The UI already provides timing context.",
    "- Do not ask the user to prioritize, list, plan or choose between multiple things.",
    "- Do not create anchors that add new decision work.",
    "- Prefer one visible, physical or written next action.",
    "- The anchor should already contain the next step, not ask the user to decide it later.",
    "- No punctuation at the end.",
    "- No duplicates.",
    "",
    "Avoid these generic anchors unless the user's input directly asks for them:",
    "- Read your why once",
    "- Start before deciding more",
    "- Do the first visible step",
    "- Start with one breath",
    "- Open what you need",
    "- Take one deep breath",
    "- Open your study materials",
    "- Set a timer for 5 minutes",
    "",
    "AI scope guardrails:",
    "- You are not a chat assistant, therapist, coach or clinician.",
    "- Do not diagnose.",
    "- Do not give therapy, treatment, crisis or mental health advice.",
    "- Do not make claims about healing, recovery or health outcomes.",
    "- Do not generate broad wellness boilerplate.",
    "- Stay close to the user's goal, struggle and why.",
    "- Deterministic app flow remains leading; you only fill bounded copy and anchor fields.",
    "",
    "Ethical use guardrails:",
    "- Do not help users turn harmful, illegal, abusive or exploitative intentions into small actions.",
    "- Do not generate anchors for violence, threats, stalking, harassment, theft, fraud, scams, weapons, drug dealing, hacking, malware, evading law enforcement, sexual exploitation, self-harm or harm to others.",
    "- If the user intent appears unsafe, do not normalize it, operationalize it or make it easier.",
    "- Keep suggestions safe, lawful and respectful.",
    "",
    "PersonalAnchorInterpretation rules:",
    "- directionLine: clarify the direction behind the raw goal.",
    "- whyLine: capture why this matters, using the user's meaning.",
    "- frictionLine: name the likely friction calmly.",
    "- returnLine: help the user return without guilt or pressure.",
    "- Each line must be short.",
    "- No emojis.",
    "- No dramatic language.",
    "- No therapy language.",
    "- No claims about healing, diagnosis, crisis support or mental health treatment.",
    "- No harmful, illegal, abusive or exploitative framing.",
    "",
    "Product tone:",
    "- warm, caring, kind, calm and respectful.",
    "- Do not sound like a productivity coach.",
    "- Do not moralize.",
    "- Do not pressure the user.",
    "",
    "Guidance rules from screening:",
    `- copyLength: ${copyLength}`,
    `- choiceStyle: ${choiceStyle}`,
    `- pressureLimit: ${pressureLimit}`,
    `- repetitionLimit: ${repetitionLimit}`,
    `- actionStyle: ${actionStyle}`,
    "",
    "If copyLength is SHORT:",
    "- Use very short lines.",
    "- Avoid explanation.",
    "- Prefer plain wording.",
    "",
    "If pressureLimit is LOW:",
    "- Avoid should, must, push, discipline, no excuses.",
    "- Make the step smaller instead of more forceful.",
    "",
    "If choiceStyle is ANCHOR_SUGGESTS:",
    "- Give clear suggestions.",
    "- Do not present many options.",
    "",
    "User context:",
    `name: ${body.intake.name ?? ""}`,
    `goal: ${body.intake.goal}`,
    `goalWhy: ${body.intake.goalWhy}`,
    `struggle: ${body.intake.struggle}`,
    "",
    "Screening signals:",
    `mode: ${body.mode}`,
    `resistancePattern: ${screening?.resistancePattern ?? ""}`,
    `mainChallenge: ${screening?.mainChallenge ?? ""}`,
    `actionTrigger: ${screening?.actionTrigger ?? ""}`,
    `antiHelp: ${(screening?.antiHelp ?? []).join(", ")}`,
    "",
    "Output JSON only. No markdown. No commentary.",
  ].join("\n");
}

export function buildRepairPrompt(input: {
  body: AnchorsRequest;
  count: number;
  previousRaw: string;
  validationErrors: string[];
}) {
  return [
    "Repair the previous Fenéla response.",
    "",
    "Return ONLY valid JSON with this exact shape:",
    `{"personalAnchorInterpretation":{"directionLine":string,"whyLine":string,"frictionLine":string,"returnLine":string},"anchors":[{"text":string}]}`,
    "",
    "Validation errors to fix:",
    ...input.validationErrors.map((error) => `- ${error}`),
    "",
    "Non-negotiable repair rules:",
    `- Return exactly ${input.count} anchors.`,
    "- Each anchor must be 3-10 words.",
    "- Each anchor must be specific to the user's goal, struggle and why.",
    "- Do not end anchors with now, today, right now or right away. The UI already provides timing context.",
    "- Use the user's why as the main grounding signal.",
    "- Do not ask the user to prioritize, list, plan or choose between multiple things.",
    "- Do not create anchors that add new decision work.",
    "- Prefer one visible, physical or written next action.",
    "- The anchor should already contain the next step, not ask the user to decide it later.",
    "- No generic filler anchors.",
    "- No punctuation at the end.",
    "- No duplicates.",
    "- No therapy, diagnosis, healing, crisis or treatment language.",
    "- No harmful, illegal, abusive or exploitative suggestions.",
    "- Do not generate anchors for violence, threats, stalking, harassment, theft, fraud, scams, weapons, drug dealing, hacking, malware, evading law enforcement, sexual exploitation, self-harm or harm to others.",
    "",
    "User context:",
    `name: ${input.body.intake.name ?? ""}`,
    `goal: ${input.body.intake.goal}`,
    `goalWhy: ${input.body.intake.goalWhy}`,
    `struggle: ${input.body.intake.struggle}`,
    "",
    "Screening signals:",
    `mode: ${input.body.mode}`,
    `resistancePattern: ${input.body.screening?.resistancePattern ?? ""}`,
    `mainChallenge: ${input.body.screening?.mainChallenge ?? ""}`,
    `actionTrigger: ${input.body.screening?.actionTrigger ?? ""}`,
    `antiHelp: ${(input.body.screening?.antiHelp ?? []).join(", ")}`,
    "",
    "Previous invalid response:",
    input.previousRaw.slice(0, 2000),
    "",
    "Output JSON only.",
  ].join("\n");
}

export function buildErrorAnchors(body: AnchorsRequest, count: number): AnchorItem[] {
  const goal = normalizeWhitespace(body.intake.goal).slice(0, 60);
  const struggle = normalizeWhitespace(body.intake.struggle).slice(0, 60);
  const why = normalizeWhitespace(body.intake.goalWhy).slice(0, 60);

  const candidates = [
    `Make ${goal} smaller`,
    `Start ${goal} gently`,
    `Write one small start`,
    `Reduce ${struggle} first`,
    `Read ${why} briefly`,
  ];

  const anchors = sanitizeAndDedupeAnchors(candidates.map((text) => ({ text })));

  return anchors.slice(0, count);
}
