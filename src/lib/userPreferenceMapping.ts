// Mapping and validation between the screening/application vocabulary
// (src/types/screening.ts) and the persisted `user_preferences` vocabulary
// (supabase/migrations/20260809120000_mvp2_persistence_foundation.sql).
//
// Only `anchor_choice_mode` needs translation — resistance_pattern,
// main_challenge, action_trigger and anti_help already share the same
// literal vocabulary as their DB columns. Framework-free and pure so it can
// be unit-tested without a Supabase boundary.

import type {
  AnchorChoiceHelp,
  ResistancePattern,
  MainChallenge,
  ActionTrigger,
  AntiHelp,
  ScreeningInput,
} from "@/lib/screeningStorage";

export type AnchorChoiceModeDb = "USER_DECIDES" | "FENELA_SUGGESTS";

const RESISTANCE_PATTERNS: readonly ResistancePattern[] = ["DELAY", "FORCE", "QUIT", "SWITCH"];
const MAIN_CHALLENGES: readonly MainChallenge[] = ["START", "SUSTAIN", "BOUNDARIES"];
const ACTION_TRIGGERS: readonly ActionTrigger[] = ["SMALL", "WHY", "REMINDER"];
const ANTI_HELP_VALUES: readonly AntiHelp[] = ["PRESSURE", "LONG_TEXT", "REPETITION"];
const ANCHOR_CHOICE_MODES: readonly AnchorChoiceHelp[] = ["I_DECIDE", "SUGGEST_ANCHORS"];

const MAX_DISPLAY_NAME_LENGTH = 40;
const MAX_TIME_ZONE_LENGTH = 100;

export function mapAnchorChoiceModeToDb(mode: AnchorChoiceHelp): AnchorChoiceModeDb {
  return mode === "SUGGEST_ANCHORS" ? "FENELA_SUGGESTS" : "USER_DECIDES";
}

// Defensive: the DB column is typed as plain `string` in the generated
// types (CHECK constraints aren't reflected there), so an unrecognized
// value falls back to the schema's own default (USER_DECIDES → I_DECIDE)
// rather than producing an invalid application value.
export function mapAnchorChoiceModeFromDb(mode: string): AnchorChoiceHelp {
  return mode === "FENELA_SUGGESTS" ? "SUGGEST_ANCHORS" : "I_DECIDE";
}

function isResistancePattern(value: string): value is ResistancePattern {
  return (RESISTANCE_PATTERNS as readonly string[]).includes(value);
}

function isMainChallenge(value: string): value is MainChallenge {
  return (MAIN_CHALLENGES as readonly string[]).includes(value);
}

function isActionTrigger(value: string): value is ActionTrigger {
  return (ACTION_TRIGGERS as readonly string[]).includes(value);
}

function isAntiHelp(value: string): value is AntiHelp {
  return (ANTI_HELP_VALUES as readonly string[]).includes(value);
}

// The browser is not a trust boundary: getBrowserTimeZone() (src/lib/
// browserTimeZone.ts) only proves the *client* sent something IANA-shaped,
// not that a Server Action request actually did. Constructing an
// Intl.DateTimeFormat with the submitted zone is the runtime's own IANA
// database — no hardcoded allowlist, no timezone library, no default zone.
export function isValidIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export type UserPreferenceDbRow = {
  display_name: string;
  anchor_choice_mode: string;
  resistance_pattern: string;
  main_challenge: string;
  action_trigger: string;
  anti_help: string[];
};

// The canonical DB preference does not include dailyReminder/startTime
// (reminder ownership is a later phase, ADR-004) — callers merge those in
// from the existing local-only reminder state.
export function mapDbRowToScreeningFields(
  row: UserPreferenceDbRow
): Omit<ScreeningInput, "dailyReminder" | "startTime"> {
  return {
    name: row.display_name,
    mode: mapAnchorChoiceModeFromDb(row.anchor_choice_mode),
    resistancePattern: isResistancePattern(row.resistance_pattern)
      ? row.resistance_pattern
      : "DELAY",
    mainChallenge: isMainChallenge(row.main_challenge) ? row.main_challenge : "START",
    actionTrigger: isActionTrigger(row.action_trigger) ? row.action_trigger : "SMALL",
    antiHelp: row.anti_help.filter(isAntiHelp),
  };
}

export type UserPreferenceWriteInput = {
  displayName: string;
  anchorChoiceMode: AnchorChoiceHelp;
  resistancePattern: ResistancePattern;
  mainChallenge: MainChallenge;
  actionTrigger: ActionTrigger;
  antiHelp: AntiHelp[];
  timeZone: string;
};

export type PreferenceValidationResult = { ok: true } | { ok: false; message: string };

// Server-boundary validation (AGENTS.md §12): runs regardless of what the
// caller's TypeScript types claim, since a Server Action is reachable as a
// plain POST endpoint. Deliberately does not run free-text safety filtering
// (src/lib/safety.ts) — every field here is an already-bounded choice, not
// open-ended user text.
export function validateUserPreferenceInput(
  input: UserPreferenceWriteInput
): PreferenceValidationResult {
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";

  if (!displayName || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return { ok: false, message: "Please enter a valid name." };
  }

  if (!ANCHOR_CHOICE_MODES.includes(input.anchorChoiceMode)) {
    return { ok: false, message: "Invalid anchor choice preference." };
  }

  if (!isResistancePattern(input.resistancePattern)) {
    return { ok: false, message: "Invalid resistance pattern." };
  }

  if (!isMainChallenge(input.mainChallenge)) {
    return { ok: false, message: "Invalid main challenge." };
  }

  if (!isActionTrigger(input.actionTrigger)) {
    return { ok: false, message: "Invalid action trigger." };
  }

  if (!Array.isArray(input.antiHelp) || !input.antiHelp.every(isAntiHelp)) {
    return { ok: false, message: "Invalid preference selection." };
  }

  const timeZone = typeof input.timeZone === "string" ? input.timeZone.trim() : "";

  if (!timeZone || timeZone.length > MAX_TIME_ZONE_LENGTH || !isValidIanaTimeZone(timeZone)) {
    return { ok: false, message: "Fenéla could not detect a valid timezone." };
  }

  return { ok: true };
}
