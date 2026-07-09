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
  type StoredCareAnchor,
} from "@/lib/storage";
import { getOrCreateDeviceId } from "@/lib/device";
import { enablePushForCurrentDevice, getNotificationPermission } from "@/lib/pushClient";

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
  onResetEverything: () => void;
  onRestartDay: () => void;
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

const DAILY_REMINDER_TIME_KEY = "fenela:dailyReminder:startTime";
const DAILY_REMINDERS_ENABLED_KEY = "fenela:dailyReminder:enabled";

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
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: ActionBtnVariant;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full py-5 rounded-2xl text-base font-bold mb-3 transition-transform active:scale-95 ${
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
  onResetEverything,
  onRestartDay,
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

    if (stored && stored.dayKey === todayKey) {
      setActiveTasks(stored.activeTasks || []);
      setParkedTasks(stored.parkedTasks || []);
      setTaskHistory(stored.taskHistory || []);
    } else {
      const anchors = loadCareAnchors();

      const freshTasks = anchors
        .map((anchor: StoredCareAnchor, index: number) => ({
          id: `t-${index}`,
          text: typeof anchor === "string" ? anchor : anchor.text || "",
          pauseCount: 0,
        }))
        .filter((task) => task.text.trim().length > 0);

      setActiveTasks(freshTasks);
    }

    const reminderTime = getStoredDailyReminderTime(screening);
    const remindersEnabled = getStoredDailyRemindersEnabled(screening);

    setDailyReminderTime(reminderTime);
    setDraftDailyReminderTime(reminderTime);
    setDailyRemindersEnabled(remindersEnabled);
    setReminderStatus(getInitialReminderStatus(remindersEnabled));

    if (remindersEnabled) {
      saveDailyReminderSettings({ enabled: true, startTime: reminderTime });
    }

    setHydrated(true);
  }, [todayKey, screening]);

  useEffect(() => {
    if (!hydrated) return;

    saveDayState({
      version: 3,
      dayKey: todayKey,
      activeTasks,
      parkedTasks,
      taskHistory,
    });
  }, [activeTasks, parkedTasks, taskHistory, hydrated, todayKey]);

  useEffect(() => {
    if (!hydrated) return;

    if (stateNeedsActiveTask(state) && !currentTask) {
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

  const enableDailyReminders = async () => {
    setReminderActionStatus("saving");
    setReminderMessage(null);

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
    const deviceId = getOrCreateDeviceId();

    setReminderActionStatus("saving");
    setReminderMessage(null);

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

  const handleStartDay = () => {
    setState(activeTasks.length > 0 ? "DO_ACTION" : "DONE");
  };

  const handleNow = async () => {
    if (!currentTask) {
      setNowReminderJobId(null);
      setState("DONE");
      return;
    }

    setState("AWAITING_DONE");
    await scheduleNowReminder();
  };

  const handleDone = async () => {
    if (!currentTask) {
      setNowReminderJobId(null);
      setState("DONE");
      return;
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

          <ActionBtn onClick={handleDone}>{ai.doneCta ?? "Done"}</ActionBtn>
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

          <ActionBtn onClick={handleNow}>{ai.pauseDoNowCta ?? "I'll do it now"}</ActionBtn>
          <ActionBtn onClick={savePauseReason} variant="ghost">
            {ai.pauseSaveCta ?? "Save & try later"}
          </ActionBtn>
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

          <ActionBtn onClick={parkTaskFinal}>{ai.directionalCta ?? "Okay"}</ActionBtn>
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
              <ActionBtn onClick={onResetEverything} variant="ghost">
                New goal
              </ActionBtn>
            </div>
          </div>
        </Card>
      </Shell>
    );
  }

  return null;
}
