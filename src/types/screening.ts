// Shared screening and guidance vocabulary.
//
// These types describe the same product concepts used in two places:
// - src/lib/screeningStorage.ts (stored screening data, fields required)
// - src/lib/aiAnchors.ts (AI request/guidance data, fields optional)
//
// The underlying unions and the base GuidanceProfile shape live here once,
// so both consumers build on the same source instead of maintaining
// duplicate definitions.

export type AnchorChoiceHelp = "I_DECIDE" | "SUGGEST_ANCHORS";
export type DailyReminderPreference = "YES" | "NOT_NOW";

export type ResistancePattern = "DELAY" | "FORCE" | "QUIT" | "SWITCH";
export type MainChallenge = "START" | "SUSTAIN" | "BOUNDARIES";
export type ActionTrigger = "SMALL" | "WHY" | "REMINDER";
export type AntiHelp = "PRESSURE" | "LONG_TEXT" | "REPETITION";

export type ProductTone = "WARM_CARING_KIND";
export type CopyLength = "SHORT" | "MEDIUM";
export type ChoiceStyle = "USER_DECIDES" | "ANCHOR_SUGGESTS";
export type PressureLimit = "LOW" | "NORMAL";
export type RepetitionLimit = "LOW" | "NORMAL";
export type ActionStyle = "SMALL_STEP" | "WHY_FIRST" | "REMINDER_FIRST";

export type GuidanceProfile = {
  copyLength: CopyLength;
  tone: ProductTone;
  choiceStyle: ChoiceStyle;
  pressureLimit: PressureLimit;
  repetitionLimit: RepetitionLimit;
  actionStyle: ActionStyle;
  dailyReminder: DailyReminderPreference;
};
