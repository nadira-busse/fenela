"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ActionTrigger,
  AnchorChoiceHelp,
  AntiHelp,
  DailyReminderPreference,
  MainChallenge,
  ResistancePattern,
  saveScreening,
} from "@/lib/screeningStorage";
import { getOrCreateDeviceId, setDeviceId } from "@/lib/device";
import { getBrowserTimeZone } from "@/lib/browserTimeZone";
import { saveUserPreferenceAction } from "@/server/preferences/saveUserPreferenceAction";
import { saveReminderPreferenceAction } from "@/server/reminders/saveReminderPreferenceAction";

type Props = { onDone: () => void };

type PushSubscriptionJSON = {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function toSubJSON(sub: PushSubscription): PushSubscriptionJSON {
  return sub.toJSON() as PushSubscriptionJSON;
}

async function fetchWebPushPublicKey(): Promise<
  { ok: true; publicKey: string } | { ok: false; error: string }
> {
  const res = await fetch("/api/push/public-key", { method: "GET" });
  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok || !data?.publicKey) {
    return { ok: false, error: data?.error ?? `Failed to load public key (${res.status})` };
  }

  return { ok: true, publicKey: data.publicKey as string };
}

async function ensurePushAndSubscribe(
  deviceId: string
): Promise<{ ok: true; deviceId: string } | { ok: false; error: string }> {
  try {
    if (!("serviceWorker" in navigator)) {
      return { ok: false, error: "Service Worker not supported." };
    }

    if (!("PushManager" in window)) {
      return { ok: false, error: "Push not supported." };
    }

    if (!("Notification" in window)) {
      return { ok: false, error: "Notifications not supported." };
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      return { ok: false, error: "Push permission not granted." };
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      const keyRes = await fetchWebPushPublicKey();

      if (!keyRes.ok) {
        return { ok: false, error: keyRes.error };
      }

      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
      });
    }

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, subscription: toSubJSON(sub) }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        error: data?.error ?? `Subscribe failed (${res.status})`,
      };
    }

    const effectiveDeviceId =
      typeof data?.deviceId === "string" && data.deviceId.length > 0 ? data.deviceId : deviceId;

    if (effectiveDeviceId !== deviceId) {
      setDeviceId(effectiveDeviceId);
    }

    return { ok: true, deviceId: effectiveDeviceId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown push setup error";
    return { ok: false, error: message };
  }
}

async function scheduleDailyStart(deviceId: string, startTime: string) {
  const res = await fetch("/api/jobs/schedule-daily-start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, startTime }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.ok) {
    return { ok: false as const, error: data?.error ?? `Schedule failed (${res.status})` };
  }

  return { ok: true as const, dueAt: data?.dueAt };
}

export default function ScreeningScreen({ onDone }: Props) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState<AnchorChoiceHelp>("I_DECIDE");
  const [dailyReminder, setDailyReminder] = useState<DailyReminderPreference>("YES");
  const [startTime, setStartTime] = useState<string>("08:00");

  const [resistancePattern, setResistancePattern] = useState<ResistancePattern>("DELAY");
  const [mainChallenge, setMainChallenge] = useState<MainChallenge>("START");
  const [actionTrigger, setActionTrigger] = useState<ActionTrigger>("SMALL");
  const [antiHelp, setAntiHelp] = useState<AntiHelp[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [warning, setWarning] = useState("");
  const [canContinueWithoutReminders, setCanContinueWithoutReminders] = useState(false);
  const [persistError, setPersistError] = useState<{
    message: string;
    canRetryAuth: boolean;
  } | null>(null);

  const antiHelpOptions: { key: AntiHelp; label: string }[] = useMemo(
    () => [
      { key: "PRESSURE", label: "Pressure" },
      { key: "LONG_TEXT", label: "Too much text" },
      { key: "REPETITION", label: "Repetition" },
    ],
    []
  );

  const toggleAntiHelp = (key: AntiHelp) => {
    setAntiHelp((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const saveCurrentScreening = (overrideDailyReminder?: DailyReminderPreference) => {
    saveScreening({
      name,
      mode,
      dailyReminder: overrideDailyReminder ?? dailyReminder,
      startTime,
      resistancePattern,
      mainChallenge,
      actionTrigger,
      antiHelp,
    });
  };

  const handleSubmit = async () => {
    if (submitting) return;

    setSubmitting(true);
    setWarning("");
    setPersistError(null);
    setCanContinueWithoutReminders(false);

    try {
      const timeZone = getBrowserTimeZone();

      if (!timeZone) {
        setPersistError({
          message:
            "Fenéla could not detect your timezone. Please try again in a supported browser.",
          canRetryAuth: false,
        });
        return;
      }

      const result = await saveUserPreferenceAction({
        displayName: name,
        anchorChoiceMode: mode,
        resistancePattern,
        mainChallenge,
        actionTrigger,
        antiHelp,
        timeZone,
      });

      if (!result.ok) {
        setPersistError({
          message: result.message,
          canRetryAuth: result.error === "UNAUTHENTICATED",
        });
        return;
      }

      saveCurrentScreening();

      const reminderPrefResult = await saveReminderPreferenceAction({
        enabled: dailyReminder === "YES",
        startTime,
      });

      if (!reminderPrefResult.ok) {
        console.warn("Reminder preference save failed:", reminderPrefResult.message);
        setWarning(
          "Reminder settings could not be saved right now. Fenéla still works without notifications."
        );
        setCanContinueWithoutReminders(true);
        return;
      }

      if (dailyReminder === "NOT_NOW") {
        onDone();
        return;
      }

      const deviceId = getOrCreateDeviceId();
      const subRes = await ensurePushAndSubscribe(deviceId);

      if (!subRes.ok) {
        console.warn("Reminder setup failed:", subRes.error);
        setWarning(
          "Reminders could not be enabled on this device. Fenéla still works without notifications."
        );
        setCanContinueWithoutReminders(true);
        return;
      }

      const schedRes = await scheduleDailyStart(subRes.deviceId, startTime);

      if (!schedRes.ok) {
        console.warn("Daily reminder scheduling failed:", schedRes.error);
        setWarning(
          "Reminders could not be scheduled right now. Fenéla still works without notifications."
        );
        setCanContinueWithoutReminders(true);
        return;
      }

      onDone();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown reminder setup error";

      if (process.env.NODE_ENV === "development") {
        console.warn("Reminder setup fallback:", message);
      }

      setWarning(
        "Something went wrong while setting up reminders. Fenéla still works without notifications."
      );
      setCanContinueWithoutReminders(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinueWithoutReminders = () => {
    saveCurrentScreening("NOT_NOW");
    onDone();
  };

  const canSubmit = name.trim().length > 0;

  return (
    <div className="min-h-[100dvh] w-full bg-[var(--bg-app)] text-[var(--text-main)]">
      <div className="mx-auto w-full max-w-[420px] px-5 py-10">
        <div className="rounded-[32px] border border-black/5 bg-[var(--card-bg)] px-6 py-7 shadow-[0_15px_40px_rgba(0,0,0,0.04)]">
          <h1 className="text-2xl font-bold">Let’s set up Fenéla.</h1>

          <p className="mt-4 text-sm leading-relaxed text-[var(--text-soft)]">
            A few quick choices help Fenéla support you in a way that fits.
          </p>

          {persistError ? (
            <div
              role="alert"
              className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm"
            >
              <div className="font-semibold">Could not save your preferences</div>
              <div className="mt-1 opacity-90">{persistError.message}</div>
              {persistError.canRetryAuth ? (
                <a href="/auth?next=%2F" className="mt-2 inline-block text-sm underline">
                  Sign in again
                </a>
              ) : null}
            </div>
          ) : null}

          {warning ? (
            <div className="mt-5 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm">
              <div className="font-semibold">Reminder skipped</div>
              <div className="mt-1 opacity-90">{warning}</div>
            </div>
          ) : null}

          <Section title="1) What should Fenéla call you?">
            <label htmlFor="screening-name" className="sr-only">
              Your first name
            </label>
            <input
              id="screening-name"
              name="screening-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your first name"
              autoComplete="given-name"
              className="mt-3 w-full rounded-2xl border border-[var(--text-main)]/15 bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--cta-primary)]"
            />
          </Section>

          <Section title="2) Would you like help choosing anchors?">
            <Radio
              name="anchorChoiceHelp"
              value={mode}
              onChange={setMode}
              options={[
                { value: "I_DECIDE", label: "I’ll choose my own" },
                { value: "SUGGEST_ANCHORS", label: "Suggest anchors" },
              ]}
            />
          </Section>

          <Section title="3) Do you want daily reminders?">
            <Radio
              name="dailyReminder"
              value={dailyReminder}
              onChange={(value) => {
                setDailyReminder(value);
                setWarning("");
                setCanContinueWithoutReminders(false);
              }}
              options={[
                { value: "YES", label: "Yes — gently remind me" },
                { value: "NOT_NOW", label: "Not now" },
              ]}
            />

            {dailyReminder === "YES" ? (
              <div className="mt-4">
                <label htmlFor="daily-start-time" className="text-sm font-medium">
                  Daily start time
                </label>

                <input
                  id="daily-start-time"
                  name="daily-start-time"
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[var(--text-main)]/15 bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--cta-primary)]"
                />
              </div>
            ) : null}
          </Section>

          <Section title="4) When today feels hard, what usually happens?">
            <Radio
              name="resistancePattern"
              value={resistancePattern}
              onChange={setResistancePattern}
              options={[
                { value: "DELAY", label: "I delay starting" },
                { value: "FORCE", label: "I push myself too hard" },
                { value: "QUIT", label: "I lose momentum" },
              ]}
            />
          </Section>

          <Section title="5) What are you struggling with most right now?">
            <Radio
              name="mainChallenge"
              value={mainChallenge}
              onChange={setMainChallenge}
              options={[
                { value: "START", label: "Starting things" },
                { value: "SUSTAIN", label: "Keeping going once I start" },
                { value: "BOUNDARIES", label: "Protecting boundaries / not overdoing it" },
              ]}
            />
          </Section>

          <Section title="6) I take action more easily when…">
            <Radio
              name="actionTrigger"
              value={actionTrigger}
              onChange={setActionTrigger}
              options={[
                { value: "SMALL", label: "It is very small and simple" },
                { value: "WHY", label: "I understand why it helps" },
                { value: "REMINDER", label: "I get reminded" },
              ]}
            />
          </Section>

          <Section title="7) What should Fenéla avoid?">
            <div className="mt-3 grid gap-2">
              {antiHelpOptions.map((option) => {
                const id = `anti-help-${option.key.toLowerCase().replaceAll("_", "-")}`;

                return (
                  <label
                    key={option.key}
                    htmlFor={id}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[var(--text-main)]/10 px-4 py-3 text-sm"
                  >
                    <input
                      id={id}
                      name="antiHelp"
                      type="checkbox"
                      value={option.key}
                      checked={antiHelp.includes(option.key)}
                      onChange={() => toggleAntiHelp(option.key)}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </Section>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            className="mt-8 w-full rounded-2xl bg-[var(--cta-primary)] px-4 py-4 text-base font-bold text-[var(--cta-primary-text)] transition-transform active:scale-95 disabled:opacity-50"
          >
            {submitting ? "Setting up…" : "Start my day"}
          </button>

          {canContinueWithoutReminders ? (
            <button
              type="button"
              onClick={handleContinueWithoutReminders}
              className="mt-3 w-full rounded-2xl border border-[var(--text-main)]/15 px-4 py-4 font-medium"
            >
              Continue without reminders
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-sm font-semibold leading-snug">{title}</h2>
      {children}
    </section>
  );
}

function Radio<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="mt-3 grid gap-2">
      {options.map((option) => {
        const id = `${name}-${option.value.toLowerCase().replaceAll("_", "-")}`;

        return (
          <label
            key={option.value}
            htmlFor={id}
            className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[var(--text-main)]/10 px-4 py-3 text-sm"
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}
