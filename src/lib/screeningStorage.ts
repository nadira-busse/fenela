// src/lib/screeningStorage.ts

// Screening MVP:
// The active screening now stores 7 product-relevant choices:
//
// 1. The user's first name.
// 2. How much help the user wants with choosing anchors.
// 3. Whether the user wants daily reminders.
// 4. What usually happens when today feels hard.
// 5. What the user is struggling with right now.
// 6. What helps the user take action.
// 7. What Fenéla should avoid.
//
// Removed from active MVP:
// - tone
// - morning energy
// - choice load on busy days
// - rescreen permission

//
// Product tone is fixed and implicit:
// warm, caring, kind, calm, respectful.
//
// Backwards compatibility:
// Older localStorage data may still contain mode="SELF", mode="TAKE_OVER",
// tone, energyPattern, choiceLoad or rescreenPermission.
// These values are read safely and normalized into the current MVP shape.

// Shared screening/guidance vocabulary lives in one place and is re-exported
// here so existing imports from "@/lib/screeningStorage" keep working.
export type {
  AnchorChoiceHelp,
  DailyReminderPreference,
  ResistancePattern,
  MainChallenge,
  ActionTrigger,
  AntiHelp,
  ProductTone,
  CopyLength,
  ChoiceStyle,
  PressureLimit,
  RepetitionLimit,
  ActionStyle,
  GuidanceProfile,
} from "@/types/screening";

import type {
  AnchorChoiceHelp,
  DailyReminderPreference,
  ResistancePattern,
  MainChallenge,
  ActionTrigger,
  AntiHelp,
  ProductTone,
  CopyLength,
  ChoiceStyle,
  PressureLimit,
  RepetitionLimit,
  ActionStyle,
  GuidanceProfile,
} from "@/types/screening";

export type ScreeningV1 = {
  version: 1;
  createdAtIso: string;

  name: string;
  mode: AnchorChoiceHelp;
  dailyReminder: DailyReminderPreference;
  startTime: string;

  resistancePattern: ResistancePattern;
  mainChallenge: MainChallenge;
  actionTrigger: ActionTrigger;
  antiHelp: AntiHelp[];

  guidanceProfile: GuidanceProfile;
};

export type ScreeningInput = Omit<ScreeningV1, "version" | "createdAtIso" | "guidanceProfile">;

// Legacy values that may still exist in localStorage.
type LegacySupportMode = "SELF" | "SUGGEST" | "TAKE_OVER";
type LegacyTone = "SOFT" | "NEUTRAL" | "DIRECT";
type LegacyEnergyPattern = "LOW" | "MIXED" | "STABLE";
type LegacyChoiceLoad = "OVERWHELMED" | "COSTS_EFFORT" | "OK";
type LegacyRescreenPermission = "YES" | "NO" | "AFTER_3_MONTHS" | "ONLY_ME";
type LegacyAntiHelp = AntiHelp;

type LegacyScreeningV1 = Partial<{
  version: 1;
  createdAtIso: string;

  name: string;
  mode: AnchorChoiceHelp | LegacySupportMode;
  dailyReminder: DailyReminderPreference;
  startTime: string;

  tone: LegacyTone;
  energyPattern: LegacyEnergyPattern;
  resistancePattern: ResistancePattern;
  choiceLoad: LegacyChoiceLoad;
  mainChallenge: MainChallenge;
  actionTrigger: ActionTrigger;
  antiHelp: LegacyAntiHelp[];

  rescreenPermission: LegacyRescreenPermission;
}>;

const KEY = "fenela:screening:v1";
const DEFAULT_START_TIME = "08:00";
const FIXED_PRODUCT_TONE: ProductTone = "WARM_CARING_KIND";

function normalizeName(value: unknown): string {
  if (typeof value !== "string") return "";

  return value.replace(/\s+/g, " ").trim().slice(0, 40);
}

function normalizeAnchorChoiceHelp(value: unknown): AnchorChoiceHelp {
  if (value === "I_DECIDE" || value === "SUGGEST_ANCHORS") return value;

  // Legacy mapping:
  // SELF and SUGGEST both mean the user still decides.
  // TAKE_OVER maps to the app suggesting anchors.
  if (value === "SELF" || value === "SUGGEST") return "I_DECIDE";
  if (value === "TAKE_OVER") return "SUGGEST_ANCHORS";

  return "I_DECIDE";
}

function normalizeDailyReminderPreference(value: unknown): DailyReminderPreference {
  if (value === "YES" || value === "NOT_NOW") return value;

  // Legacy screening did not store an explicit daily reminder choice.
  // If old data exists, default to NOT_NOW so Fenéla does not imply permission.
  return "NOT_NOW";
}

function normalizeResistancePattern(value: unknown): ResistancePattern {
  if (value === "DELAY" || value === "FORCE" || value === "QUIT" || value === "SWITCH") {
    return value;
  }

  return "DELAY";
}

function normalizeMainChallenge(value: unknown): MainChallenge {
  if (value === "START" || value === "SUSTAIN" || value === "BOUNDARIES") return value;
  return "START";
}

function normalizeActionTrigger(value: unknown): ActionTrigger {
  if (value === "SMALL" || value === "WHY" || value === "REMINDER") return value;
  return "SMALL";
}

function normalizeAntiHelp(value: unknown): AntiHelp[] {
  if (!Array.isArray(value)) return [];

  const validValues: AntiHelp[] = [];

  for (const item of value) {
    if (item === "PRESSURE" || item === "LONG_TEXT" || item === "REPETITION") {
      validValues.push(item);
    }
  }

  return validValues;
}

function normalizeStartTime(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_START_TIME;

  const isValidTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  return isValidTime ? value : DEFAULT_START_TIME;
}

function normalizeScreeningInput(value: unknown): ScreeningInput {
  const data = value as LegacyScreeningV1;

  return {
    name: normalizeName(data?.name),
    mode: normalizeAnchorChoiceHelp(data?.mode),
    dailyReminder: normalizeDailyReminderPreference(data?.dailyReminder),
    startTime: normalizeStartTime(data?.startTime),
    resistancePattern: normalizeResistancePattern(data?.resistancePattern),
    mainChallenge: normalizeMainChallenge(data?.mainChallenge),
    actionTrigger: normalizeActionTrigger(data?.actionTrigger),
    antiHelp: normalizeAntiHelp(data?.antiHelp),
  };
}

export function buildGuidanceProfile(screening: ScreeningInput): GuidanceProfile {
  const antiHelp = screening.antiHelp;

  const copyLength: CopyLength = antiHelp.includes("LONG_TEXT") ? "SHORT" : "MEDIUM";

  const pressureLimit: PressureLimit = antiHelp.includes("PRESSURE") ? "LOW" : "NORMAL";

  const repetitionLimit: RepetitionLimit = antiHelp.includes("REPETITION") ? "LOW" : "NORMAL";

  const choiceStyle: ChoiceStyle =
    screening.mode === "SUGGEST_ANCHORS" ? "ANCHOR_SUGGESTS" : "USER_DECIDES";

  let actionStyle: ActionStyle = "SMALL_STEP";

  if (screening.actionTrigger === "WHY") {
    actionStyle = "WHY_FIRST";
  }

  if (screening.actionTrigger === "REMINDER") {
    actionStyle = "REMINDER_FIRST";
  }

  return {
    copyLength,
    tone: FIXED_PRODUCT_TONE,
    choiceStyle,
    pressureLimit,
    repetitionLimit,
    actionStyle,
    dailyReminder: screening.dailyReminder,
  };
}

export function loadScreening(): ScreeningV1 | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as LegacyScreeningV1;
    if (!parsed || parsed.version !== 1) return null;

    const normalizedInput = normalizeScreeningInput(parsed);

    return {
      version: 1,
      createdAtIso:
        typeof parsed.createdAtIso === "string" ? parsed.createdAtIso : new Date().toISOString(),
      ...normalizedInput,
      guidanceProfile: buildGuidanceProfile(normalizedInput),
    };
  } catch {
    return null;
  }
}

export function hasScreening(): boolean {
  return !!loadScreening();
}

export function saveScreening(data: ScreeningInput): ScreeningV1 {
  if (typeof window === "undefined") {
    throw new Error("saveScreening must run in the browser");
  }

  const normalizedInput = normalizeScreeningInput(data);

  const full: ScreeningV1 = {
    version: 1,
    createdAtIso: new Date().toISOString(),
    ...normalizedInput,
    guidanceProfile: buildGuidanceProfile(normalizedInput),
  };

  window.localStorage.setItem(KEY, JSON.stringify(full));
  return full;
}

export function clearScreening(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
