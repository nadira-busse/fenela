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
  // Suggestions already shown during the current intake session (the first
  // generation and every Regenerate since), supplied by the client so both
  // the AI prompt and the deterministic fallback can avoid repeating them.
  // Untrusted input: see sanitizePreviousAnchors.
  previousAnchors?: string[];
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

// The UI already supplies timing context, so a trailing time word is
// removed. A preposition directly before it goes too ("goal for today"
// becomes "goal", not "goal for"), so the anchor does not end mid-phrase.
function stripTrailingTimeWords(value: string) {
  return value
    .replace(/\s+(?:(?:for|by|until|before|from)\s+)?(right now|right away|now|today)\s*$/i, "")
    .trim();
}

function wordCount(value: string) {
  return normalizeWhitespace(value).split(" ").filter(Boolean).length;
}

// Words that leave a phrase visibly unfinished when they end it ("It rains
// a lot and", "I wake up tired every", "finish the report before").
const DANGLING_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "so",
  "to",
  "of",
  "for",
  "in",
  "on",
  "at",
  "by",
  "from",
  "with",
  "about",
  "into",
  "before",
  "after",
  "because",
  "when",
  "then",
  "than",
  "that",
  "instead",
  "every",
  "my",
  "your",
  "his",
  "her",
  "their",
  "our",
  "i",
  "is",
  "am",
  "are",
  "get",
]);

const CLAUSE_BREAK = /[,;:.!?]|\s(?:and|but|because|so|when)\s/i;

// Short, word-bounded fragment of the user's own text for the fallback
// templates. Never slices characters (which can cut a word in half). Long
// input is shortened at its first clause break when that keeps at least two
// words, then capped by word count, then stripped of dangling trailing
// words, so the fragment does not end mid-phrase. Capping by word count
// also keeps every fallback anchor within the 3-10 word validation limit.
function shortFragment(value: string, maxWords: number) {
  const normalized = normalizeWhitespace(value);
  const allWords = normalized.split(" ").filter(Boolean);

  if (allWords.length <= maxWords) {
    return stripTrailingPunctuation(normalized);
  }

  const firstClause = normalized.split(CLAUSE_BREAK)[0].trim();
  const clauseWords = firstClause.split(" ").filter(Boolean);
  const words = (clauseWords.length >= 2 ? clauseWords : allWords).slice(0, maxWords);

  while (words.length > 1 && DANGLING_WORDS.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }

  return stripTrailingPunctuation(words.join(" "));
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

// Bounds how many previously-shown anchors a client can echo back, and
// re-screens each one with the same unsafe-intent check applied to fresh
// user input. The intake screen only sends texts that an earlier response
// itself produced, but the route is a plain POST endpoint, so this is
// still untrusted input, not server-produced data. 15 covers one intake
// session at the AI route's own rate limit (an initial generation plus
// four Regenerate clicks, three anchors each) while keeping the prompt
// small.
const MAX_PREVIOUS_ANCHORS = 15;

// Deterministic "is this the same action, reworded?" check used both to
// keep the three anchors in one response distinct and to keep Regenerate
// from offering a trivial rewording of something already shown. It
// compares content words (stopwords dropped, number words folded to
// digits, a trailing plural "s" removed) by Jaccard overlap. It is a
// bounded heuristic, not semantic understanding: it catches "Spend five
// minutes on the report" vs "Spend 5 minutes on report", and lets
// genuinely different actions on the same goal through.
const SIMILARITY_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "for",
  "on",
  "in",
  "at",
  "and",
  "or",
  "with",
  "your",
  "my",
  "you",
  "it",
  "this",
  "that",
  "about",
  "from",
  "into",
  "by",
  "just",
  "only",
]);

const NUMBER_WORDS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  ten: "10",
  fifteen: "15",
  twenty: "20",
};

const NEAR_DUPLICATE_THRESHOLD = 0.6;

function anchorContentTokens(text: string) {
  const tokens = new Set<string>();

  for (const rawWord of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!rawWord || SIMILARITY_STOPWORDS.has(rawWord)) {
      continue;
    }

    const word = NUMBER_WORDS[rawWord] ?? rawWord;
    const stemmed =
      word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;

    tokens.add(stemmed);
  }

  return tokens;
}

export function areNearDuplicateAnchors(a: string, b: string) {
  const tokensA = anchorContentTokens(a);
  const tokensB = anchorContentTokens(b);

  if (tokensA.size === 0 || tokensB.size === 0) {
    return normalizeWhitespace(a).toLowerCase() === normalizeWhitespace(b).toLowerCase();
  }

  let shared = 0;

  for (const token of tokensA) {
    if (tokensB.has(token)) {
      shared++;
    }
  }

  const union = tokensA.size + tokensB.size - shared;

  return shared / union >= NEAR_DUPLICATE_THRESHOLD;
}

// Indexes of anchors that repeat, or only trivially reword, an anchor
// already shown to the user this session.
export function findRepeatedAnchorIndexes(anchors: AnchorItem[], previousAnchors: string[] = []) {
  return anchors
    .map((anchor, index) =>
      previousAnchors.some((previous) => areNearDuplicateAnchors(anchor.text, previous))
        ? index
        : -1
    )
    .filter((index) => index !== -1);
}

export function sanitizePreviousAnchors(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of raw) {
    if (typeof item !== "string") {
      continue;
    }

    const text = sanitizeAnchorText(item);
    const key = text.toLowerCase();

    if (!text || hasUnsafeIntent(text) || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(text);

    if (result.length >= MAX_PREVIOUS_ANCHORS) {
      break;
    }
  }

  return result;
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

    for (let other = 0; other < index; other++) {
      if (areNearDuplicateAnchors(anchor.text, anchors[other].text)) {
        errors.push(
          `Anchors ${other + 1} and ${index + 1} describe the same action; make each a different action.`
        );
      }
    }
  });

  return {
    ok: errors.length === 0,
    errors,
  };
}

// Shared by buildPrompt and buildRepairPrompt so Regenerate can ask for
// genuinely different wording instead of relying on temperature alone to
// avoid repeating what the user has already seen this session.
function previousAnchorsPromptLines(previousAnchors: string[] | undefined) {
  if (!previousAnchors || previousAnchors.length === 0) {
    return [];
  }

  return [
    "Anchors already shown to this user this session:",
    ...previousAnchors.map((text) => `- ${text}`),
    "Do not repeat or reword these. Each new anchor must be a different action or approach than every anchor listed above, while staying just as relevant to the user's goal.",
    "",
  ];
}

// How goal, struggle and why each shape an anchor. Shared by buildPrompt
// and buildRepairPrompt so a repair attempt keeps the same personalization
// contract as the first attempt.
const PERSONALIZATION_RULES = [
  "- The goal decides what each anchor moves toward.",
  "- The struggle decides what is realistic: shape each step so it still works when that struggle is present (smaller, easier to start, less effort to begin).",
  "- The why decides what kind of step feels meaningful. Use it as context; do not quote or restate it inside an anchor.",
  "- The anchors must be genuinely different actions or approaches (for example: preparing, doing a first slice, lowering the struggle), not rewordings of one action.",
];

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
    ...PERSONALIZATION_RULES,
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
    ...previousAnchorsPromptLines(body.previousAnchors),
    "User context:",
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
    ...PERSONALIZATION_RULES,
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
    ...previousAnchorsPromptLines(input.body.previousAnchors),
    "User context:",
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

// Deterministic, no-AI fallback for when AI is unavailable or its output
// fails validation. It is deliberately not a second pseudo-AI system: a
// small fixed set of concrete, generally useful micro-actions, labelled as
// general starting points in the UI (source "fallback"), never presented
// as personalized suggestions.
//
// Every template is a complete action followed by a colon and a short,
// word-bounded fragment of the user's own text (shortFragment). Splicing
// the user's text mid-sentence would collide with its own grammar (a goal
// such as "Work in small portions" after a verb such as "Make" reads as
// "Make Work in small portions smaller"); a colon label stays intelligible
// whatever the fragment's grammar. Each template is at most five words, so
// with a five-word fragment an anchor stays within the 3-10 word limit.
//
// The pool has more entries than one request needs, so buildFallbackAnchors
// can skip anchors already shown this session before repeating any —
// bounded novelty for a couple of Regenerate clicks, reported honestly
// through `repeatsPrevious` once the pool runs out.
//
// Built as one list per field, then interleaved (goal, struggle, why,
// goal, ...), so a 3-anchor request touches goal, struggle and why once
// each before using any field's second template.
function fallbackAnchorPool(body: AnchorsRequest) {
  const goal = shortFragment(body.intake.goal, 5);
  const struggle = shortFragment(body.intake.struggle, 5);
  const why = shortFragment(body.intake.goalWhy, 5);

  const byField = [
    [
      `Spend two minutes on: ${goal}`,
      `Gather what you need for: ${goal}`,
      `Do the easiest bit of: ${goal}`,
      `Write one sentence about: ${goal}`,
    ],
    [`Start with one minute despite: ${struggle}`, `Note the hard part: ${struggle}`],
    [`Read your reason once: ${why}`, `Say your reason out loud: ${why}`],
  ];

  const maxLength = Math.max(...byField.map((field) => field.length));
  const interleaved: string[] = [];

  for (let i = 0; i < maxLength; i++) {
    for (const field of byField) {
      if (field[i]) {
        interleaved.push(field[i]);
      }
    }
  }

  return interleaved;
}

export type FallbackAnchorSet = {
  anchors: AnchorItem[];
  // True when the pool had too few anchors not already shown this session,
  // so some returned anchors repeat earlier ones. The UI tells the user
  // instead of implying the set is new.
  repeatsPrevious: boolean;
};

export function buildFallbackAnchors(
  body: AnchorsRequest,
  count: number,
  excludeTexts: string[] = []
): FallbackAnchorSet {
  const sanitizedPool = sanitizeAndDedupeAnchors(
    fallbackAnchorPool(body).map((text) => ({ text }))
  );
  const isNovel = (anchor: AnchorItem) =>
    !excludeTexts.some((previous) => areNearDuplicateAnchors(anchor.text, previous));

  const novel = sanitizedPool.filter(isNovel);

  if (novel.length >= count) {
    return { anchors: novel.slice(0, count), repeatsPrevious: false };
  }

  // Not enough unseen anchors left: use every unseen one first, then fill
  // from the already-shown ones so the user still gets a full set, and
  // report the repeat.
  const repeated = sanitizedPool.filter((anchor) => !isNovel(anchor));

  return {
    anchors: [...novel, ...repeated].slice(0, count),
    repeatsPrevious: true,
  };
}

export function buildErrorAnchors(
  body: AnchorsRequest,
  count: number,
  excludeTexts: string[] = []
): AnchorItem[] {
  return buildFallbackAnchors(body, count, excludeTexts).anchors;
}
