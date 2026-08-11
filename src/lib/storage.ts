import { assertSafeAnchorList } from "./safety";
import { isUuidShaped } from "./eventMapping";
import type { AnchorSource } from "@/types/CareAnchor";

// ---------- Generic helpers ----------

export const loadFromStorage = <T>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export const saveToStorage = (key: string, value: unknown) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
};

export const removeFromStorage = (key: string) => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key);
};

// ---------- Day helpers ----------

export const DAY_STATE_KEY = "dayStateV3";

const APP_TIME_ZONE = "Europe/Amsterdam";

export type ActiveTask = {
  // The persisted database Anchor id when this task was built from an
  // authenticated Anchor with one (Phase 4C §7); otherwise a synthetic
  // per-position id (`a1`, `a2`, ...) for the unauthenticated/local-only
  // MVP1 path or legacy data. Authenticated Coaching interactions use this
  // as the ActionEvent/FrictionEvent anchor_id — never a synthetic id.
  id: string;
  text: string;
  pauseCount: number;
};

export type DayState<TTaskHistoryItem = never> = {
  version: 3;
  dayKey: string;
  // The persisted Goal this day state was built from (Phase 4B hardening,
  // Defect A). Absent for the unauthenticated/local-only MVP1 path and for
  // legacy day state saved before this field existed — both are treated as
  // "no goal identity to check", not as a fabricated match.
  goalId?: string;
  activeTasks: ActiveTask[];
  parkedTasks: ActiveTask[];
  taskHistory: TTaskHistoryItem[];
};

export const getTodayKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Could not create Amsterdam day key");
  }

  return `${year}-${month}-${day}`;
};

export const loadDayState = <TTaskHistoryItem = never>() =>
  loadFromStorage<DayState<TTaskHistoryItem> | null>(DAY_STATE_KEY, null);

export const saveDayState = <TTaskHistoryItem = never>(state: DayState<TTaskHistoryItem>) =>
  saveToStorage(DAY_STATE_KEY, state);

export const clearDayState = () => removeFromStorage(DAY_STATE_KEY);

// Extracted so the reuse-vs-rebuild decision (Phase 4B hardening, Defect A;
// extended in Phase 4C hardening, Defect A) is unit-testable on its own —
// CoachingScreen.tsx has no render-level test coverage in this repo (no
// RTL/jsdom dependency). Day state may only be reused when it is from
// today AND belongs to the same persisted Goal. `goalId` is `undefined`
// for the unauthenticated/local-only MVP1 path and for legacy day state
// saved before this field existed; both sides being `undefined` compares
// equal, preserving the original dayKey-only behavior for that path.
//
// For an authenticated persisted Goal (`goalId` defined), reuse additionally
// requires every active task to carry a valid persisted Anchor UUID
// (Phase 4C hardening, Defect A): a same-day, same-goal dayState saved
// before Phase 4C's createDayStateFromAnchors() fix can still contain
// synthetic ids (`a1`, `a2`, ...), which ActionEvent/FrictionEvent writes
// cannot use as anchor_id. Treating that as stale forces the caller's
// existing "not current" branch to rebuild from the current DB-restored
// careAnchors, which already carry real persisted ids.
export function isDayStateCurrent<TTaskHistoryItem>(
  stored: DayState<TTaskHistoryItem> | null,
  todayKey: string,
  goalId: string | undefined
): stored is DayState<TTaskHistoryItem> {
  if (stored === null || stored.dayKey !== todayKey || stored.goalId !== goalId) {
    return false;
  }

  if (goalId === undefined) {
    return true;
  }

  return stored.activeTasks.every((task) => isUuidShaped(task.id));
}

// ---------- Care Anchors ----------

export const CARE_ANCHORS_KEY = "careAnchors";

// Plain strings are legacy/pre-Phase-4B shape and carry no provenance or id.
// `id`, when present, is the persisted database Anchor id (Phase 4B
// createGoalWithAnchorsAction / DB restore via mapActiveGoalToCompatibilityState)
// — absent for the unauthenticated/local-only MVP1 path and for legacy
// entries saved before ids were tracked.
export type StoredCareAnchor = string | { id?: string; text?: string; source?: AnchorSource };

export const loadCareAnchors = (): StoredCareAnchor[] =>
  loadFromStorage<StoredCareAnchor[]>(CARE_ANCHORS_KEY, []);

function getAnchorText(anchor: unknown) {
  if (typeof anchor === "string") {
    return anchor;
  }

  if (anchor && typeof anchor === "object" && "text" in anchor) {
    return String((anchor as { text?: unknown }).text ?? "");
  }

  return String(anchor ?? "");
}

// No recorded source (a plain string, or an object that predates Phase 4B
// provenance tracking) defaults to USER — the safest assumption, since it
// is never persisted as AI/FALLBACK without the app having actually
// recorded that provenance.
export function getAnchorSource(anchor: unknown): AnchorSource {
  if (
    anchor &&
    typeof anchor === "object" &&
    "source" in anchor &&
    (anchor as { source?: unknown }).source
  ) {
    const source = (anchor as { source?: unknown }).source;

    if (source === "USER" || source === "AI" || source === "FALLBACK") {
      return source;
    }
  }

  return "USER";
}

function getAnchorTexts(anchors: StoredCareAnchor[]) {
  return anchors.map(getAnchorText);
}

// The persisted database Anchor id, when this anchor carries one (Phase 4C
// §7) — undefined for the unauthenticated/local-only MVP1 path and for
// legacy entries saved before ids were tracked, in which case the caller
// falls back to a synthetic per-position id.
function getAnchorId(anchor: unknown): string | undefined {
  if (anchor && typeof anchor === "object" && "id" in anchor) {
    const id = (anchor as { id?: unknown }).id;
    return typeof id === "string" && id.trim().length > 0 ? id : undefined;
  }

  return undefined;
}

export const saveCareAnchors = (anchors: StoredCareAnchor[]) => {
  assertSafeAnchorList(getAnchorTexts(anchors));
  saveToStorage(CARE_ANCHORS_KEY, anchors);
};

export const createDayStateFromAnchors = (
  anchors: StoredCareAnchor[],
  goalId?: string
): DayState => {
  const nonEmptyAnchors = anchors.filter((anchor) => getAnchorText(anchor).trim().length > 0);

  assertSafeAnchorList(getAnchorTexts(nonEmptyAnchors));

  const todayKey = getTodayKey();

  const activeTasks = nonEmptyAnchors.map((anchor, idx) => ({
    id: getAnchorId(anchor) ?? `a${idx + 1}`,
    text: getAnchorText(anchor),
    pauseCount: 0,
  }));

  return {
    version: 3,
    dayKey: todayKey,
    goalId,
    activeTasks,
    parkedTasks: [],
    taskHistory: [],
  };
};
