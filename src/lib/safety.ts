// src/lib/safety.ts

export type SafetyIssueCode = "LOW_QUALITY_INPUT" | "UNSAFE_INTENT";

export type SafetyValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      code: SafetyIssueCode;
      message: string;
    };

export class AnchorValidationError extends Error {
  code: SafetyIssueCode;

  constructor(result: Exclude<SafetyValidationResult, { ok: true }>) {
    super(result.message);
    this.name = "AnchorValidationError";
    this.code = result.code;
  }
}

export const LOW_QUALITY_INPUT_MESSAGE =
  "Please add a little more context so Fenéla can turn this into a useful small action.";

export const UNSAFE_INTENT_MESSAGE =
  "Fenéla cannot help turn this into an action. Choose a safe, lawful and respectful goal instead.";

export function normalizeSafetyText(value: unknown) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pattern design notes (read before adding new words):
 *
 * This is a basic, pattern-based safety filter. It is NOT intent detection
 * and NOT comprehensive content moderation. See docs/product/known-limitations.md.
 *
 * False positives and false negatives both matter here, and the right
 * balance differs by category:
 *
 *   - FALSE NEGATIVE: unsafe input slips through (e.g. "strangle someone").
 *   - FALSE POSITIVE: an ordinary goal gets blocked (e.g. "kill it at my
 *     interview", "attack my todo list", "shoot for a promotion",
 *     "I always choke under pressure", "use my secret weapon").
 *
 * For verbs that double as everyday motivational language (kill, attack,
 * shoot, weapon, hack, phishing, ...), this filter leans toward avoiding
 * false positives: it accepts that some explicitly-targeted phrasing (e.g.
 * "kill my neighbor") may be missed here, a gap also covered by a second,
 * non-deterministic layer (the AI prompt-level guardrails in
 * src/app/api/ai/anchors/route.ts — see docs/product/known-limitations.md
 * for what that layer does and does not guarantee).
 *
 * For the self-harm category specifically, this filter leans the other way
 * on purpose: a missed reference matters more there than an occasional
 * false positive, so those patterns stay broad and bare-word.
 *
 * Because many violence-adjacent verbs (kill, attack, shoot, stab, rob,
 * weapon, hack, phishing) double as extremely common motivational idioms,
 * those verbs are NOT matched as bare words. They only match when followed
 * directly by an explicit person-target (someone / somebody / a person /
 * them / him / her / a child / children). This intentionally misses a
 * phrasing like "kill my neighbor" in favor of not blocking "kill it at my
 * interview". That tradeoff is deliberate and documented, not an oversight.
 *
 * Verbs with negligible idiomatic overlap (choke, strangle, poison, scam,
 * abuse, molest) use a broader target that also accepts "my/his/her/their
 * + noun", since there is no common motivational idiom of that shape.
 */

// Strict target: only matches an explicit person reference. Used for verbs
// that are also common figurative idioms (kill, attack, shoot, stab, rob,
// hit, hurt, harm, beat, punch, kick, slap, follow, track).
const STRICT_PERSON_TARGET =
  "(?:someone|somebody|anybody|a person|the person|people|others|them|him|her|a child|the child|children|kids)";

// Broad target: also accepts "my/his/her/their/our <noun>". Used only for
// verbs with no meaningful figurative-idiom risk, so the wider net does not
// reintroduce false positives.
const BROAD_PERSON_TARGET = `(?:${STRICT_PERSON_TARGET}|(?:my|his|her|their|our)\\s+\\w+)`;

function strict(verb: string) {
  return new RegExp(`\\b${verb}\\s+${STRICT_PERSON_TARGET}\\b`);
}

function broad(verb: string) {
  return new RegExp(`\\b${verb}\\s+${BROAD_PERSON_TARGET}\\b`);
}

export function hasUnsafeIntent(value: unknown) {
  const text = normalizeSafetyText(value).toLowerCase();

  const blockedPatterns: RegExp[] = [
    // --- Violence verbs with high idiomatic overlap: require a strict,
    // explicit person-target so normal motivational language is not caught.
    strict("kill"),
    strict("murder"),
    strict("attack"),
    strict("shoot"),
    strict("stab"),
    strict("beat"),
    strict("punch"),
    strict("kick"),
    strict("slap"),
    strict("hit"),
    strict("hurt"),
    strict("harm"),
    /\brob\s+(?:a bank|a store|a shop|a house|someone|somebody|them|him|her)\b/,
    /\bassault\b/,

    // --- Violence/abuse verbs with negligible idiomatic overlap: a broader
    // target ("my partner", "my boss", "my ex", ...) is safe to allow here.
    broad("choke"),
    broad("strangle"),
    broad("poison"),
    broad("abuse"),
    broad("molest"),
    /\btorture\b/,
    /\brape\b/,
    /\bkidnap(?:ping)?\b/,

    // --- Euphemistic/indirect violent phrasing, found via manual testing.
    // These bypass the literal-verb patterns above (kill/hit/attack/...) but
    // have no meaningful figurative-idiom overlap, so a strict person-target
    // (or, for "hit and run"/"six feet under", a bare fixed phrase) is safe.
    new RegExp(`\\brun\\s+${STRICT_PERSON_TARGET}\\s+over\\b`),
    new RegExp(`\\brun over\\s+${STRICT_PERSON_TARGET}\\b`),
    /\bhit and run\b/,
    new RegExp(
      `\\b(?:put|bury)\\s+${STRICT_PERSON_TARGET}\\s+(?:under the ground|six feet under|in the ground)\\b`
    ),
    /\bsix feet under\b/,

    // --- Child grooming / exploitation (kept narrow and explicit)
    /\bgroom(?:ing)?\s+(?:a child|the child|children|kids|a minor|minors)\b/,
    /\bexploit\s+(?:a child|the child|children|kids|a minor|minors)\b/,
    /\bchild abuse\b/,
    /\bsexual exploitation\b/,

    // --- Threats, coercion, stalking, harassment
    /\bthreaten\b/,
    /\bblackmail\b/,
    /\bintimidate\b/,
    /\bstalk\b/,
    /\bharass\b/,
    strict("follow"),
    strict("track"),
    /\bspy on\b/,

    // --- Dutch violence variants (SOV phrasing: target before verb)
    /\biemand\s+(slaan|verwonden|pijn doen|aanvallen|bedreigen|vermoorden|doden|wurgen|vergiftigen|ontvoeren|mishandelen|chanteren|afpersen)\b/,
    /\bmensen\s+(slaan|verwonden|pijn doen|aanvallen|bedreigen|vermoorden|doden|wurgen|vergiftigen|ontvoeren|mishandelen|chanteren|afpersen)\b/,

    // --- Theft, fraud, scams (low idiom risk once a target/object follows)
    /\bsteal\b/,
    /\btheft\b/,
    /\bshoplift\b/,
    /\bburglary\b/,
    /\b(?:fraud|fraude)\b/, // EN "fraud" and NL "fraude"
    broad("scam"),
    /\b(?:send|create|run|do|launch)\s+(?:a\s+)?phishing\b/,
    /\bphishing\s+(?:attack|scam|campaign)\b/,
    /\bforge\b/,
    /\bfake documents\b/,
    /\blaunder money\b/,

    // --- Illegal drug activity (multi-word phrases, low idiom risk)
    /\bsell drugs\b/,
    /\bdeal drugs\b/,
    /\bdrug dealing\b/,
    /\bsmuggle\b/,

    // --- Cyber abuse and unauthorized access. "hack" alone is excluded:
    // it is extremely common in this app's own domain ("life hack",
    // "habit hack"), so it only counts with a clearly malicious object.
    /\bhack(?:ing)?\s+(?:into|someone|somebody|their|his|her|a (?:system|server|website|account|database|network))\b/,
    /\bmalware\b/,
    /\bransomware\b/,
    /\bkeylogger\b/,
    /\bsteal passwords\b/,
    /\bunauthorized access\b/,
    /\bbypass security\b/,

    // --- Evading law enforcement or accountability
    /\bevade police\b/,
    /\bavoid arrest\b/,
    /\bhide evidence\b/,
    /\bdestroy evidence\b/,

    // --- Self-harm or harm to others (kept broad/bare deliberately: this
    // is a safety-critical category where a missed match matters more
    // than an occasional false positive).
    /\bself[\s-]?harm\b/,
    /\bsuicide\b/,
    /\bkill myself\b/,
    /\bhurt myself\b/,
    /\bharm myself\b/,
  ];

  return blockedPatterns.some((pattern) => pattern.test(text));
}

export function hasEnoughMeaningfulInput(value: unknown) {
  const cleaned = normalizeSafetyText(value);

  const words = cleaned.split(" ").filter(Boolean);
  if (words.length < 2) return false;

  const lettersOnly = cleaned.toLowerCase().replace(/[^a-z]/g, "");
  const uniqueLetters = new Set(lettersOnly.split(""));

  if (lettersOnly.length < 6) return false;
  if (uniqueLetters.size <= 3) return false;

  return true;
}

export function validateSafeUserText(value: unknown): SafetyValidationResult {
  if (hasUnsafeIntent(value)) {
    return {
      ok: false,
      code: "UNSAFE_INTENT",
      message: UNSAFE_INTENT_MESSAGE,
    };
  }

  if (!hasEnoughMeaningfulInput(value)) {
    return {
      ok: false,
      code: "LOW_QUALITY_INPUT",
      message: LOW_QUALITY_INPUT_MESSAGE,
    };
  }

  return { ok: true };
}

export function validateSafeAnchorText(value: unknown): SafetyValidationResult {
  const text = normalizeSafetyText(value);

  if (hasUnsafeIntent(text)) {
    return {
      ok: false,
      code: "UNSAFE_INTENT",
      message: UNSAFE_INTENT_MESSAGE,
    };
  }

  if (!hasEnoughMeaningfulInput(text)) {
    return {
      ok: false,
      code: "LOW_QUALITY_INPUT",
      message: LOW_QUALITY_INPUT_MESSAGE,
    };
  }

  return { ok: true };
}

export function assertSafeAnchorText(value: unknown) {
  const result = validateSafeAnchorText(value);

  if (!result.ok) {
    throw new AnchorValidationError(result);
  }
}

export function validateSafeAnchorList(values: unknown[]): SafetyValidationResult {
  for (const value of values) {
    const result = validateSafeAnchorText(value);

    if (!result.ok) {
      return result;
    }
  }

  return { ok: true };
}

export function assertSafeAnchorList(values: unknown[]) {
  const result = validateSafeAnchorList(values);

  if (!result.ok) {
    throw new AnchorValidationError(result);
  }
}
