"use client";

import { loadScreening, type DailyReminderPreference } from "@/lib/screeningStorage";
import { AIState, getAICopy } from "@/lib/ailogic";
import { PersonalAnchorInterpretation } from "@/types/intake";
import { useEffect, useMemo, useRef, useState } from "react";
import { CoachState } from "@/types/coach";
import {
  getTodayKey,
  loadDayState,
  saveDayState,
  loadCareAnchors,
  createDayStateFromAnchors,
  isDayStateCurrent,
} from "@/lib/storage";
import { getOrCreateDeviceId } from "@/lib/device";
import { enablePushForCurrentDevice, getNotificationPermission } from "@/lib/pushClient";
import { DAILY_REMINDER_TIME_KEY, DAILY_REMINDERS_ENABLED_KEY } from "@/lib/reminderLocalKeys";
import { createActionEventAction } from "@/server/events/createActionEventAction";
import { createFrictionEventAction } from "@/server/events/createFrictionEventAction";
import type { ActionEventType } from "@/lib/eventMapping";
import { createPendingEventIdSlot } from "@/lib/pendingEventId";
import { saveReminderPreferenceAction } from "@/server/reminders/saveReminderPreferenceAction";

type EnhancedCoachState =
  | CoachState
  | "AWAITING_DONE"
  | "LATER_EMPATHY"
  | "PAUSE_QUESTION"
  | "DIRECTIONAL_MOTIVATION";

interface CoachingScreenProps {
  intake: {
    name: string;
    goal: string;
    struggle: string;
    goalWhy: string;
    personalAnchorInterpretation?: PersonalAnchorInterpretation;
  };
  // The persisted Goal id this Coaching session belongs to (authenticated
  // users only — Phase 4B hardening, Defect A). Undefined for the
  // unauthenticated/local-only MVP1 path.
  goalId?: string;
  // The canonical DB reminder_preferences row for this authenticated user
  // (Phase 4D, ADR-004), or null for the unauthenticated/local-only MVP1
  // path or when no row exists yet. When set, this — not any local
  // storage cache — is the sole source for the enabled/time state shown
  // below.
  reminderPreference?: { enabled: boolean; startTime: string } | null;
  onResetEverything: () => void;
  onRestartDay: () => void;
  // New Goal archive state (Phase 4B hardening, Defect B) — owned by
  // HomeClient, which runs the actual archive request.
  newGoalPending?: boolean;
  newGoalError?: string | null;
}

type Task = {
  id: string;
  text: string;
  pauseCount: number;
};

type TaskHistoryItem = {
  task: string;
  completed: boolean;
  status?: "DONE" | "PARKED_TODAY";
};

type ActionBtnVariant = "primary" | "ghost";
type ReminderStatus = "unknown" | "on" | "off" | "blocked" | "unsupported" | "error";
type ReminderActionStatus = "idle" | "saving" | "saved" | "error";

type ReminderScreening = {
  startTime?: string;
  dailyReminder?: DailyReminderPreference | boolean;
};

function getStoredDailyReminderTime(screening: ReminderScreening | null): string {
  if (typeof window === "undefined") return "08:00";

  const stored = window.localStorage.getItem(DAILY_REMINDER_TIME_KEY);
  if (stored) return stored;

  return typeof screening?.startTime === "string" ? screening.startTime : "08:00";
}

function screeningHasExplicitReminderOptOut(screening: ReminderScreening | null): boolean {
  return screening?.dailyReminder === false || screening?.dailyReminder === "NOT_NOW";
}

function screeningHasExplicitReminderOptIn(screening: ReminderScreening | null): boolean {
  return screening?.dailyReminder === true || screening?.dailyReminder === "YES";
}

function hasStoredOrScreeningReminderTime(screening: ReminderScreening | null): boolean {
  if (typeof window === "undefined") return false;

  const stored = window.localStorage.getItem(DAILY_REMINDER_TIME_KEY);
  if (typeof stored === "string" && stored.trim().length > 0) return true;

  return typeof screening?.startTime === "string" && screening.startTime.trim().length > 0;
}

function getStoredDailyRemindersEnabled(screening: ReminderScreening | null): boolean {
  if (typeof window === "undefined") return false;

  const stored = window.localStorage.getItem(DAILY_REMINDERS_ENABLED_KEY);

  if (stored === "true") return true;
  if (stored === "false") return false;

  if (screeningHasExplicitReminderOptOut(screening)) return false;
  if (screeningHasExplicitReminderOptIn(screening)) return true;

  const permission = getNotificationPermission();

  return permission === "granted" && hasStoredOrScreeningReminderTime(screening);
}

function saveDailyReminderSettings(input: { enabled: boolean; startTime: string }) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(DAILY_REMINDERS_ENABLED_KEY, String(input.enabled));
  window.localStorage.setItem(DAILY_REMINDER_TIME_KEY, input.startTime);
}

// Shared retry/error plumbing for the two ActionEvent/FrictionEvent writes
// that gate a local UI transition (COMPLETED, PARKED_TODAY, and a friction
// submission — Phase 4C §10). Not a generic persistence abstraction: it
// only standardizes "attempt, and tell the caller whether local state may
// now advance," while each call site still owns its own pending/error
// state and stable client_event_id.
async function attemptEventWrite(
  write: () => Promise<{ ok: true } | { ok: false; message: string }>,
  onError: (message: string) => void
): Promise<boolean> {
  try {
    const result = await write();

    if (!result.ok) {
      onError(result.message);
      return false;
    }

    return true;
  } catch (error) {
    console.warn("Event write failed.", error);
    onError("Could not save this right now. Please try again.");
    return false;
  }
}

function stateNeedsActiveTask(state: EnhancedCoachState) {
  return (
    state === "DO_ACTION" ||
    state === "AWAITING_DONE" ||
    state === "PAUSE_QUESTION" ||
    state === "DIRECTIONAL_MOTIVATION"
  );
}

function getInitialReminderStatus(enabled: boolean): ReminderStatus {
  if (typeof window === "undefined") return "unknown";

  const permission = getNotificationPermission();

  if (permission === "unsupported") return "unsupported";
  if (permission === "denied") return "blocked";
  if (enabled && permission === "granted") return "on";

  return "off";
}

function getReminderStatusLabel(status: ReminderStatus) {
  switch (status) {
    case "on":
      return "On";
    case "off":
      return "Off";
    case "blocked":
      return "Blocked";
    case "unsupported":
      return "Not supported";
    case "error":
      return "Needs attention";
    default:
      return "Checking";
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] w-full bg-[var(--bg-app)] text-[var(--text-main)] font-sans">
      <div className="mx-auto w-full max-w-[420px] px-6 pt-12 pb-10">{children}</div>
    </div>
  );
}

function Card({ children, border = false }: { children: React.ReactNode; border?: boolean }) {
  return (
    <div
      className={`rounded-[32px] bg-white p-8 shadow-[0_15px_40px_rgba(0,0,0,0.04)] border ${
        border ? "border-[var(--cta-primary)]" : "border-black/5"
      }`}
    >
      {children}
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  variant = "primary",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: ActionBtnVariant;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full py-5 rounded-2xl text-base font-bold mb-3 transition-transform active:scale-95 disabled:opacity-50 disabled:active:scale-100 ${
        variant === "primary"
          ? "bg-[var(--cta-primary)] text-white"
          : "bg-[var(--cta-secondary)] text-[var(--cta-secondary-text)]"
      }`}
    >
      {children}
    </button>
  );
}

function ReminderSettings({
  dailyReminderTime,
  draftDailyReminderTime,
  reminderStatus,
  reminderActionStatus,
  reminderMessage,
  onDraftDailyReminderTimeChange,
  onEnableDailyReminders,
  onDisableDailyReminders,
  onSaveDailyReminderTime,
}: {
  dailyReminderTime: string;
  draftDailyReminderTime: string;
  reminderStatus: ReminderStatus;
  reminderActionStatus: ReminderActionStatus;
  reminderMessage: string | null;
  onDraftDailyReminderTimeChange: (value: string) => void;
  onEnableDailyReminders: () => void;
  onDisableDailyReminders: () => void;
  onSaveDailyReminderTime: () => void;
}) {
  const isBusy = reminderActionStatus === "saving";
  const remindersAreOn = reminderStatus === "on";
  const remindersAreBlocked = reminderStatus === "blocked";
  const remindersUnsupported = reminderStatus === "unsupported";

  return (
    <div className="mt-5 border-t border-black/5 pt-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-[var(--text-main)]">Daily reminders</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-soft)]">
            Fenéla can gently remind you to return to your small action.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--badge-bg)] px-3 py-1 text-xs font-bold text-[var(--cta-secondary-text)]">
          {getReminderStatusLabel(reminderStatus)}
        </span>
      </div>

      <div>
        <label
          className="block text-xs font-bold text-[var(--cta-secondary-text)] mb-2"
          htmlFor="dailyReminder"
        >
          Daily start time
        </label>
        <input
          id="dailyReminder"
          type="time"
          value={draftDailyReminderTime}
          onChange={(event) => onDraftDailyReminderTimeChange(event.target.value)}
          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-base text-[var(--text-main)]"
        />
        <p className="mt-2 text-xs text-[var(--text-soft)]">
          Current saved time: {dailyReminderTime}. Timezone: Europe/Amsterdam.
        </p>
      </div>

      {reminderMessage ? (
        <p
          className={`text-xs leading-relaxed ${
            reminderActionStatus === "error" || remindersAreBlocked
              ? "text-red-700"
              : "text-[var(--cta-secondary-text)]"
          }`}
        >
          {reminderMessage}
        </p>
      ) : null}

      {remindersAreBlocked ? (
        <p className="text-xs leading-relaxed text-red-700">
          Notifications are blocked for this browser or installed app. Enable notifications in your
          browser or device settings, then return to Fenéla and try again.
        </p>
      ) : null}

      {remindersUnsupported ? (
        <p className="text-xs leading-relaxed text-red-700">
          Notifications are not supported in this browser or device context.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {remindersAreOn ? (
          <button
            type="button"
            onClick={onDisableDailyReminders}
            disabled={isBusy}
            className="rounded-2xl bg-[var(--cta-secondary)] px-4 py-3 text-sm font-bold text-[var(--cta-secondary-text)] disabled:opacity-60"
          >
            {isBusy ? "Saving..." : "Turn off"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onEnableDailyReminders}
            disabled={isBusy || remindersUnsupported}
            className="rounded-2xl bg-[var(--cta-primary)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {isBusy ? "Saving..." : remindersAreBlocked ? "Try again" : "Turn on"}
          </button>
        )}

        <button
          type="button"
          onClick={onSaveDailyReminderTime}
          disabled={isBusy}
          className="rounded-2xl bg-[var(--cta-secondary)] px-4 py-3 text-sm font-bold text-[var(--cta-secondary-text)] disabled:opacity-60"
        >
          {isBusy ? "Saving..." : "Save time"}
        </button>
      </div>
    </div>
  );
}

function ReminderSettingsLink({
  reminderStatus,
  onOpen,
}: {
  reminderStatus: ReminderStatus;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-5 flex w-full items-center justify-between rounded-2xl border border-black/5 bg-[var(--bg-app)] px-4 py-3 text-left transition-transform active:scale-[0.99]"
      aria-label="Open reminder settings"
    >
      <span className="text-sm font-semibold text-[var(--text-muted)]">Reminders</span>
      <span className="rounded-full bg-[var(--badge-bg)] px-3 py-1 text-xs font-bold text-[var(--cta-secondary-text)]">
        {getReminderStatusLabel(reminderStatus)}
      </span>
    </button>
  );
}

export default function CoachingScreen({
  intake,
  goalId,
  reminderPreference = null,
  onResetEverything,
  onRestartDay,
  newGoalPending = false,
  newGoalError = null,
}: CoachingScreenProps) {
  const todayKey = useMemo(() => getTodayKey(), []);
  const [hydrated, setHydrated] = useState(false);
  const screening = useMemo(() => loadScreening(), []);

  const [state, setState] = useState<EnhancedCoachState>("START_DAY");
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [parkedTasks, setParkedTasks] = useState<Task[]>([]);
  const [taskHistory, setTaskHistory] = useState<TaskHistoryItem[]>([]);
  const [nowReminderJobId, setNowReminderJobId] = useState<string | null>(null);

  const [dailyReminderTime, setDailyReminderTime] = useState("08:00");
  const [draftDailyReminderTime, setDraftDailyReminderTime] = useState("08:00");
  const [dailyRemindersEnabled, setDailyRemindersEnabled] = useState(false);
  const [reminderStatus, setReminderStatus] = useState<ReminderStatus>("unknown");
  const [reminderActionStatus, setReminderActionStatus] = useState<ReminderActionStatus>("idle");
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);
  const [showReminderSettingsPage, setShowReminderSettingsPage] = useState(false);

  // ActionEvent/FrictionEvent write state (Phase 4C §10) — only meaningful
  // for authenticated Coaching (goalId set); the unauthenticated/local-only
  // MVP1 path never sets these.
  const [completePending, setCompletePending] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [parkPending, setParkPending] = useState(false);
  const [parkError, setParkError] = useState<string | null>(null);
  const [frictionPending, setFrictionPending] = useState(false);
  const [frictionError, setFrictionError] = useState<string | null>(null);
  const [postponePending, setPostponePending] = useState(false);
  const [postponeError, setPostponeError] = useState<string | null>(null);

  // Stable client_event_id per pending logical interaction, so a retry
  // after a failed write reuses the same id (Phase 4C §5) instead of
  // generating a new one. Cleared back to null once that write succeeds,
  // so the next distinct interaction gets a fresh id. One ref per slot
  // instance keeps it stable across this component's re-renders, exactly
  // like the raw ref value it replaces (see src/lib/pendingEventId.ts).
  const completeEventIdSlot = useRef(createPendingEventIdSlot()).current;
  const parkEventIdSlot = useRef(createPendingEventIdSlot()).current;
  const frictionEventIdSlot = useRef(createPendingEventIdSlot()).current;
  const postponeEventIdSlot = useRef(createPendingEventIdSlot()).current;

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentTask = activeTasks[0];

  const ai = useMemo(() => {
    const stats = {
      doneCount: taskHistory.filter((task) => task.status === "DONE").length,
      parkedCount: taskHistory.filter((task) => task.status === "PARKED_TODAY").length,
    };

    return getAICopy({
      state: state as AIState,
      intake,
      screening,
      task: currentTask
        ? {
            text: currentTask.text,
            pauseCount: currentTask.pauseCount,
          }
        : undefined,
      stats,
    });
  }, [state, intake, screening, currentTask, taskHistory]);

  useEffect(() => {
    const stored = loadDayState<TaskHistoryItem>();

    if (isDayStateCurrent(stored, todayKey, goalId)) {
      // Intentional: localStorage is only readable after mount, so this state
      // is deliberately set post-hydration (not derivable during render)
      // to avoid a server/client hydration mismatch.

      setActiveTasks(stored.activeTasks || []);
      setParkedTasks(stored.parkedTasks || []);
      setTaskHistory(stored.taskHistory || []);
    } else {
      const anchors = loadCareAnchors();
      const freshDay = createDayStateFromAnchors(anchors, goalId);

      setActiveTasks(freshDay.activeTasks);
    }

    // For authenticated Coaching, reminder_preferences is the sole
    // canonical source (Phase 4D, ADR-004) — no local storage cache is
    // consulted, so a stale local value can never override it (Phase 4D
    // §14/§25). The unauthenticated/local-only MVP1 path is unchanged.
    const reminderTime = goalId
      ? (reminderPreference?.startTime ?? "08:00")
      : getStoredDailyReminderTime(screening);

    const remindersEnabled = goalId
      ? Boolean(reminderPreference?.enabled)
      : getStoredDailyRemindersEnabled(screening);

    setDailyReminderTime(reminderTime);
    setDraftDailyReminderTime(reminderTime);
    setDailyRemindersEnabled(remindersEnabled);
    setReminderStatus(getInitialReminderStatus(remindersEnabled));

    if (remindersEnabled) {
      saveDailyReminderSettings({ enabled: true, startTime: reminderTime });
    }

    setHydrated(true);
  }, [todayKey, screening, goalId, reminderPreference]);

  useEffect(() => {
    if (!hydrated) return;

    saveDayState({
      version: 3,
      dayKey: todayKey,
      goalId,
      activeTasks,
      parkedTasks,
      taskHistory,
    });
  }, [activeTasks, parkedTasks, taskHistory, hydrated, todayKey, goalId]);

  useEffect(() => {
    if (!hydrated) return;

    if (stateNeedsActiveTask(state) && !currentTask) {
      // Intentional: this transitions the coach state once the active task
      // list is empty, after the post-mount hydration above has completed.

      setNowReminderJobId(null);
      setState("DONE");
    }
  }, [hydrated, state, currentTask]);

  const scheduleDailyReminder = async (startTime: string) => {
    const deviceId = getOrCreateDeviceId();

    const res = await fetch("/api/jobs/schedule-daily-start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId,
        startTime,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error ?? "Daily reminder could not be scheduled.");
    }

    return data as { jobId?: string; dueAtIso?: string };
  };

  // reminder_preferences is the sole canonical enabled/start_time source
  // (Phase 4D, ADR-004) — persisted here, before any push/schedule/cancel
  // side effect, so the DB never contradicts what the UI is about to show
  // (Phase 4D §7/§16). A no-op for the unauthenticated/local-only MVP1
  // path (no goalId).
  const persistReminderPreference = async (enabled: boolean, startTime: string) => {
    if (!goalId) return true;

    const result = await saveReminderPreferenceAction({ enabled, startTime });

    if (!result.ok) {
      setReminderActionStatus("error");
      setReminderMessage(result.message);
      return false;
    }

    return true;
  };

  const enableDailyReminders = async () => {
    setReminderActionStatus("saving");
    setReminderMessage(null);

    const persisted = await persistReminderPreference(true, draftDailyReminderTime);
    if (!persisted) return;

    try {
      const pushResult = await enablePushForCurrentDevice();

      if (!pushResult.ok) {
        const nextStatus = pushResult.permission === "denied" ? "blocked" : "off";
        setReminderStatus(nextStatus);
        setDailyRemindersEnabled(false);
        saveDailyReminderSettings({ enabled: false, startTime: draftDailyReminderTime });
        setReminderActionStatus("error");
        setReminderMessage(
          pushResult.permission === "denied"
            ? "Notifications are blocked for this browser or installed app."
            : "Notification permission was not granted. Reminders were not turned on."
        );
        return;
      }

      await scheduleDailyReminder(draftDailyReminderTime);

      saveDailyReminderSettings({ enabled: true, startTime: draftDailyReminderTime });
      setDailyReminderTime(draftDailyReminderTime);
      setDailyRemindersEnabled(true);
      setReminderStatus("on");
      setReminderActionStatus("saved");
      setReminderMessage("Daily reminders are on for this device.");
    } catch (error) {
      console.warn("Daily reminders could not be enabled.", error);
      const permission = getNotificationPermission();
      const nextStatus =
        permission === "unsupported"
          ? "unsupported"
          : permission === "denied"
            ? "blocked"
            : "error";

      setReminderStatus(nextStatus);
      setDailyRemindersEnabled(false);
      saveDailyReminderSettings({ enabled: false, startTime: draftDailyReminderTime });
      setReminderActionStatus("error");
      setReminderMessage(
        error instanceof Error ? error.message : "Daily reminders could not be turned on."
      );
    }
  };

  const disableDailyReminders = async () => {
    setReminderActionStatus("saving");
    setReminderMessage(null);

    const persisted = await persistReminderPreference(false, draftDailyReminderTime);
    if (!persisted) return;

    const deviceId = getOrCreateDeviceId();

    try {
      const res = await fetch("/api/jobs/cancel-daily-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error ?? "Daily reminder could not be disabled.");
      }

      saveDailyReminderSettings({ enabled: false, startTime: draftDailyReminderTime });
      setDailyReminderTime(draftDailyReminderTime);
      setDailyRemindersEnabled(false);
      setReminderStatus("off");
      setReminderActionStatus("saved");
      setReminderMessage("Daily reminders are off for this device.");
    } catch (error) {
      console.warn("Daily reminders could not be disabled.", error);
      setReminderActionStatus("error");
      setReminderStatus("error");
      setReminderMessage(
        error instanceof Error ? error.message : "Daily reminders could not be disabled."
      );
    }
  };

  const saveDailyReminderTime = async () => {
    setReminderActionStatus("saving");
    setReminderMessage(null);

    const persisted = await persistReminderPreference(
      dailyRemindersEnabled,
      draftDailyReminderTime
    );
    if (!persisted) return;

    if (!dailyRemindersEnabled) {
      saveDailyReminderSettings({ enabled: false, startTime: draftDailyReminderTime });
      setDailyReminderTime(draftDailyReminderTime);
      setReminderStatus((current) =>
        current === "blocked" || current === "unsupported" ? current : "off"
      );
      setReminderActionStatus("saved");
      setReminderMessage("Reminder time saved. Turn on reminders to schedule it on this device.");
      return;
    }

    try {
      await scheduleDailyReminder(draftDailyReminderTime);

      saveDailyReminderSettings({ enabled: true, startTime: draftDailyReminderTime });
      setDailyReminderTime(draftDailyReminderTime);
      setReminderStatus("on");
      setReminderActionStatus("saved");
      setReminderMessage("Daily reminder time updated.");
    } catch (error) {
      console.warn("Daily reminder time could not be updated.", error);
      const permission = getNotificationPermission();
      const nextStatus =
        permission === "unsupported"
          ? "unsupported"
          : permission === "denied"
            ? "blocked"
            : "error";

      setReminderStatus(nextStatus);
      setReminderActionStatus("error");
      setReminderMessage(
        error instanceof Error ? error.message : "Daily reminder time could not be updated."
      );
    }
  };

  const scheduleNowReminder = async () => {
    if (!currentTask) return;
    if (nowReminderJobId) return;

    const deviceId = getOrCreateDeviceId();

    try {
      const res = await fetch("/api/jobs/schedule-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          dueInMs: 10 * 60 * 1000,
          payload: {
            title: "Fenéla",
            body: `Quick check: did you do "${currentTask.text}"?`,
            url: "/",
          },
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        console.warn(
          data?.error ?? "Reminder could not be scheduled. Continuing without reminder."
        );
        return;
      }

      setNowReminderJobId(data.jobId ?? null);
    } catch (error) {
      console.warn("Reminder scheduling failed. Continuing without reminder.", error);
    }
  };

  const cancelNowReminder = async (jobId: string) => {
    const deviceId = getOrCreateDeviceId();

    const res = await fetch("/api/jobs/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, jobId }),
    });

    if (!res.ok && process.env.NODE_ENV === "development") {
      const data = await res.json().catch(() => ({}));
      console.warn(data?.error ?? "Failed to cancel reminder");
    }
  };

  const cancelIfExists = async () => {
    const jobId = nowReminderJobId;
    if (!jobId) return;

    setNowReminderJobId(null);
    await cancelNowReminder(jobId);
  };

  // Fire-and-forget ActionEvent write for STARTED (Phase 4C §10): it does
  // not correspond to a local taskHistory entry the End-of-day screen
  // already shows the user, so a failure here cannot create a visible
  // local/canonical contradiction — the local transition is not blocked on
  // it, matching this file's existing best-effort reminder-scheduling
  // pattern (see scheduleNowReminder/cancelNowReminder above). POSTPONED is
  // NOT recorded through this helper (Phase 4C hardening, Defect B) — see
  // savePauseReason(), the single point that writes it.
  const recordActionEvent = (anchorId: string, eventType: ActionEventType) => {
    if (!goalId) return;

    createActionEventAction({
      anchorId,
      eventType,
      clientEventId: crypto.randomUUID(),
    })
      .then((result) => {
        if (!result.ok) {
          console.warn(`Could not record ${eventType} action event.`, result.message);
        }
      })
      .catch((error) => {
        console.warn(`Could not record ${eventType} action event.`, error);
      });
  };

  // Reads the (uncontrolled) pause-reason textarea and, for authenticated
  // Coaching with real friction text, blocks on persisting it before the
  // caller may advance the screen (Phase 4C §8/§18) — unlike
  // recordActionEvent, a FrictionEvent corresponds to user-authored text
  // that must not silently disappear on failure. Returns true when it is
  // safe to proceed (nothing to submit, or the submission succeeded).
  const submitFrictionIfPresent = async (anchorId: string): Promise<boolean> => {
    if (!goalId) return true;

    const reason = textareaRef.current?.value.trim() ?? "";
    if (!reason) return true;

    setFrictionPending(true);
    setFrictionError(null);

    const ok = await attemptEventWrite(
      () =>
        createFrictionEventAction({
          anchorId,
          reason,
          clientEventId: frictionEventIdSlot.get(),
        }),
      setFrictionError
    );

    setFrictionPending(false);

    if (ok) {
      frictionEventIdSlot.clear();
    }

    return ok;
  };

  const handleStartDay = () => {
    setState(activeTasks.length > 0 ? "DO_ACTION" : "DONE");
  };

  const handleNow = async () => {
    if (!currentTask) {
      setNowReminderJobId(null);
      setState("DONE");
      return;
    }

    // The pause-reason textarea only exists on PAUSE_QUESTION — reading it
    // here as well as from savePauseReason() means the friction answer is
    // captured regardless of which of that screen's two exits the user
    // takes (Phase 4C §8/ADR-005).
    if (state === "PAUSE_QUESTION") {
      const submitted = await submitFrictionIfPresent(currentTask.id);
      if (!submitted) return;
    }

    recordActionEvent(currentTask.id, "STARTED");

    setState("AWAITING_DONE");
    await scheduleNowReminder();
  };

  const handleDone = async () => {
    if (!currentTask) {
      setNowReminderJobId(null);
      setState("DONE");
      return;
    }

    if (goalId) {
      setCompletePending(true);
      setCompleteError(null);

      const ok = await attemptEventWrite(
        () =>
          createActionEventAction({
            anchorId: currentTask.id,
            eventType: "COMPLETED",
            clientEventId: completeEventIdSlot.get(),
          }),
        setCompleteError
      );

      setCompletePending(false);

      // Stay on AWAITING_DONE with the same currentTask so the user can
      // retry with the same button (Phase 4C §10/§18) — the local
      // taskHistory "done" entry below must not be written until this
      // succeeds, since that entry is what the End-of-day screen shows.
      if (!ok) return;

      completeEventIdSlot.clear();
    }

    const jobId = nowReminderJobId;
    setNowReminderJobId(null);

    if (jobId) {
      await cancelNowReminder(jobId);
    }

    setTaskHistory((prev) => [
      ...prev,
      {
        task: currentTask.text,
        completed: true,
        status: "DONE",
      },
    ]);

    const nextTasks = activeTasks.slice(1);
    setActiveTasks(nextTasks);
    setState(nextTasks.length === 0 ? "DONE" : "DO_ACTION");
  };

  const handleLater = async () => {
    if (!currentTask) {
      setNowReminderJobId(null);
      setState("DONE");
      return;
    }

    // No ActionEvent here (Phase 4C hardening, Defect B): "Later" begins
    // the postponement/pause flow, not the factual decision itself — the
    // decision is either "I'll do it now" (STARTED, no postponement after
    // all) or the final "Try again later" (POSTPONED, in savePauseReason).
    // Writing POSTPONED at every escalation step as well would double-count
    // one hesitation sequence in weekly/monthly factual aggregation.
    await cancelIfExists();

    const nextPauseCount = currentTask.pauseCount + 1;

    if (nextPauseCount === 1) {
      setState("LATER_EMPATHY");

      window.setTimeout(() => {
        const updatedTask = { ...currentTask, pauseCount: 1 };
        setActiveTasks([...activeTasks.slice(1), updatedTask]);
        setState("DO_ACTION");
      }, 2000);

      return;
    }

    if (nextPauseCount === 2) {
      setState("PAUSE_QUESTION");
      return;
    }

    setState("DIRECTIONAL_MOTIVATION");
  };

  const savePauseReason = async () => {
    if (!currentTask) {
      setNowReminderJobId(null);
      setState("DONE");
      return;
    }

    const submitted = await submitFrictionIfPresent(currentTask.id);
    if (!submitted) return;

    // This is the final postponement decision (Phase 4C hardening,
    // Defect B) — the one and only place POSTPONED is written, so it is
    // blocking like COMPLETED/PARKED_TODAY: local state (the requeue back
    // to DO_ACTION below) must not advance until the factual event is
    // actually recorded, or a DB failure would produce false local success.
    if (goalId) {
      setPostponePending(true);
      setPostponeError(null);

      const ok = await attemptEventWrite(
        () =>
          createActionEventAction({
            anchorId: currentTask.id,
            eventType: "POSTPONED",
            clientEventId: postponeEventIdSlot.get(),
          }),
        setPostponeError
      );

      setPostponePending(false);

      if (!ok) return;

      postponeEventIdSlot.clear();
    }

    await cancelIfExists();

    const updatedTask = { ...currentTask, pauseCount: 2 };
    setActiveTasks([...activeTasks.slice(1), updatedTask]);
    setState("DO_ACTION");
  };

  const parkTaskFinal = async () => {
    if (!currentTask) {
      setNowReminderJobId(null);
      setState("DONE");
      return;
    }

    if (goalId) {
      setParkPending(true);
      setParkError(null);

      const ok = await attemptEventWrite(
        () =>
          createActionEventAction({
            anchorId: currentTask.id,
            eventType: "PARKED_TODAY",
            clientEventId: parkEventIdSlot.get(),
          }),
        setParkError
      );

      setParkPending(false);

      // Stay on DIRECTIONAL_MOTIVATION with the same currentTask so the
      // user can retry (Phase 4C §10/§18) — the local taskHistory "parked"
      // entry below must not be written until this succeeds.
      if (!ok) return;

      parkEventIdSlot.clear();
    }

    await cancelIfExists();

    setTaskHistory((prev) => [
      ...prev,
      {
        task: currentTask.text,
        completed: false,
        status: "PARKED_TODAY",
      },
    ]);

    setParkedTasks((prev) => [...prev, { ...currentTask, pauseCount: 3 }]);

    const nextTasks = activeTasks.slice(1);
    setActiveTasks(nextTasks);
    setState(nextTasks.length === 0 ? "DONE" : "DO_ACTION");
  };

  if (!hydrated) return null;

  if (showReminderSettingsPage) {
    return (
      <Shell>
        <button
          type="button"
          onClick={() => setShowReminderSettingsPage(false)}
          className="mb-6 text-sm font-bold text-[var(--cta-secondary-text)]"
        >
          {"\u2190"} Back
        </button>

        <h1 className="text-2xl font-bold mb-2">Reminder settings</h1>
        <p className="text-sm leading-relaxed text-[var(--text-soft)] mb-8">
          Choose whether Fenéla may send daily reminders on this device.
        </p>

        <Card>
          <ReminderSettings
            dailyReminderTime={dailyReminderTime}
            draftDailyReminderTime={draftDailyReminderTime}
            reminderStatus={reminderStatus}
            reminderActionStatus={reminderActionStatus}
            reminderMessage={reminderMessage}
            onDraftDailyReminderTimeChange={(value) => {
              setDraftDailyReminderTime(value);
              setReminderActionStatus("idle");
              setReminderMessage(null);
            }}
            onEnableDailyReminders={enableDailyReminders}
            onDisableDailyReminders={disableDailyReminders}
            onSaveDailyReminderTime={saveDailyReminderTime}
          />
        </Card>
      </Shell>
    );
  }

  if (state === "START_DAY") {
    return (
      <Shell>
        <p className="text-sm text-black/40 mb-2">Hello, {intake.name}</p>
        <h1 className="text-2xl font-bold mb-8">{ai.title ?? "Your anchor"}</h1>

        <Card>
          <div className="space-y-5 mb-8">
            <p className="text-lg leading-relaxed font-medium whitespace-pre-line">
              {ai.subline ?? intake.goal}
            </p>

            {ai.taskLine ? (
              <p className="text-sm leading-relaxed text-[var(--cta-secondary-text)] whitespace-pre-line">
                {ai.taskLine}
              </p>
            ) : null}
          </div>

          <ActionBtn onClick={handleStartDay}>{ai.primaryCta ?? "Start day"}</ActionBtn>

          <ReminderSettingsLink
            reminderStatus={reminderStatus}
            onOpen={() => setShowReminderSettingsPage(true)}
          />
        </Card>
      </Shell>
    );
  }

  if (state === "DO_ACTION") {
    return (
      <Shell>
        <h1 className="text-2xl font-bold mb-1">{ai.title ?? "Today's small step"}</h1>
        <p className="text-sm text-black/40 mb-8 whitespace-pre-line">{ai.subline}</p>

        <Card>
          <p className="text-2xl leading-tight mb-12 font-medium">
            {ai.taskLine ?? currentTask?.text ?? "One small step"}
          </p>

          <ActionBtn onClick={handleNow}>{ai.primaryCta ?? "I'll do this now"}</ActionBtn>
          <ActionBtn onClick={handleLater} variant="ghost">
            {ai.secondaryCta ?? "Later"}
          </ActionBtn>
        </Card>
      </Shell>
    );
  }

  if (state === "AWAITING_DONE") {
    return (
      <Shell>
        <h1 className="text-xl font-bold mb-1">{ai.waitingTitle ?? "Now"}</h1>
        <p className="text-sm text-black/40 mb-8">{ai.subline ?? "Come back when you’re done."}</p>

        <Card border>
          <p className="text-xl mb-10 leading-relaxed font-medium">
            {ai.waitingLine ?? currentTask?.text ?? "One small step"}
          </p>

          <ActionBtn onClick={handleDone} disabled={completePending}>
            {completePending ? "Saving…" : (ai.doneCta ?? "Done")}
          </ActionBtn>

          {completeError ? (
            <p role="alert" className="text-xs leading-relaxed text-red-700 text-center mt-2">
              {completeError}
            </p>
          ) : null}
        </Card>
      </Shell>
    );
  }

  if (state === "PAUSE_QUESTION") {
    return (
      <Shell>
        <h1 className="text-xl font-bold mb-1">{ai.pauseTitle ?? "Pause noted"}</h1>
        {ai.pauseSubline ? (
          <p className="text-sm text-black/40 mb-8 whitespace-pre-line">{ai.pauseSubline}</p>
        ) : null}

        <Card>
          <label htmlFor="pause-reason" className="block text-lg mb-6 font-medium">
            {ai.pausePrompt ?? "What is making this step hard right now?"}
          </label>

          <textarea
            id="pause-reason"
            name="pause-reason"
            autoFocus
            ref={textareaRef}
            className="w-full p-4 rounded-xl border border-black/10 mb-6 focus:outline-none focus:ring-2 focus:ring-[var(--cta-primary)] focus:ring-opacity-20 text-left"
            placeholder={ai.pausePlaceholder ?? "One honest sentence is enough..."}
            rows={3}
          />

          <ActionBtn onClick={handleNow} disabled={frictionPending || postponePending}>
            {ai.pauseDoNowCta ?? "I'll do it now"}
          </ActionBtn>
          <ActionBtn
            onClick={savePauseReason}
            variant="ghost"
            disabled={frictionPending || postponePending}
          >
            {postponePending ? "Saving…" : (ai.pauseSaveCta ?? "Try again later")}
          </ActionBtn>

          {frictionError ? (
            <p role="alert" className="text-xs leading-relaxed text-red-700 text-center mt-2">
              {frictionError}
            </p>
          ) : null}

          {postponeError ? (
            <p role="alert" className="text-xs leading-relaxed text-red-700 text-center mt-2">
              {postponeError}
            </p>
          ) : null}
        </Card>
      </Shell>
    );
  }

  if (state === "DIRECTIONAL_MOTIVATION") {
    return (
      <Shell>
        <h1 className="text-xl font-bold mb-1">{ai.directionalTitle ?? "Parked for today"}</h1>
        <p className="text-sm text-black/40 mb-8">{ai.directionalSubline ?? "No failure here."}</p>

        <Card border>
          {ai.directionalLine ? (
            <p className="text-lg mb-6 leading-relaxed whitespace-pre-line">{ai.directionalLine}</p>
          ) : null}

          {ai.directionalNote ? (
            <p className="text-sm text-[var(--cta-secondary-text)] mb-8 text-center px-2 whitespace-pre-line">
              {ai.directionalNote}
            </p>
          ) : null}

          <ActionBtn onClick={parkTaskFinal} disabled={parkPending}>
            {parkPending ? "Saving…" : (ai.directionalCta ?? "Okay")}
          </ActionBtn>

          {parkError ? (
            <p role="alert" className="text-xs leading-relaxed text-red-700 text-center mt-2">
              {parkError}
            </p>
          ) : null}
        </Card>
      </Shell>
    );
  }

  if (state === "LATER_EMPATHY") {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center">
          <h2 className="text-xl font-bold mb-2">{ai.laterEmpathyTitle ?? "Paused."}</h2>
          <p className="text-[var(--text-soft)] leading-relaxed whitespace-pre-line">
            {ai.laterEmpathyLine ?? "One small step is enough for today."}
          </p>
        </div>
      </Shell>
    );
  }

  if (state === "DONE") {
    const finished = taskHistory.filter((task) => task.status === "DONE");
    const parked = taskHistory.filter((task) => task.status === "PARKED_TODAY");

    return (
      <Shell>
        <h1 className="text-2xl font-bold mb-1">{ai.doneTitle ?? "End of day"}</h1>
        <p className="text-sm text-black/40 mb-8 whitespace-pre-line">
          {ai.doneLine ?? "Continue tomorrow."}
        </p>

        <Card>
          <div className="space-y-3 mb-8">
            {finished.length === 0 && parked.length === 0 ? (
              <p className="text-sm text-[var(--cta-secondary-text)] text-center">
                No anchors were completed yet. You can reset today and start again.
              </p>
            ) : null}

            {finished.map((task, index) => (
              <div key={index} className="flex items-center text-sm text-[var(--text-main)]">
                <span className="mr-2 text-green-600 font-bold">{"\u2713"}</span> {task.task}
              </div>
            ))}

            {parked.map((task, index) => (
              <div className="flex items-center text-sm text-black/30" key={index}>
                <span className="mr-2 text-orange-400 font-bold">{"\u2192"}</span> {task.task}{" "}
                parked
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <p className="text-xs text-[var(--text-soft)] text-center">
              Reset today keeps your anchors and starts this day again.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <ActionBtn onClick={onRestartDay} variant="ghost">
                Reset today
              </ActionBtn>
              <ActionBtn onClick={onResetEverything} variant="ghost" disabled={newGoalPending}>
                {newGoalPending ? "Starting…" : "New goal"}
              </ActionBtn>
            </div>

            {newGoalError ? (
              <p role="alert" className="text-xs leading-relaxed text-red-700 text-center">
                {newGoalError}
              </p>
            ) : null}
          </div>
        </Card>
      </Shell>
    );
  }

  return null;
}
