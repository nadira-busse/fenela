"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import ScreeningScreen from "./components/ScreeningScreen";
import IntakeScreen from "./components/IntakeScreen";
import CoachingScreen from "./components/CoachingScreen";
import { PersonalAnchorInterpretation } from "@/types/intake";
import {
  loadFromStorage,
  saveToStorage,
  removeFromStorage,
  loadCareAnchors,
  createDayStateFromAnchors,
  saveDayState,
  clearDayState,
} from "@/lib/storage";

type Intake = {
  name: string;
  goal: string;
  struggle: string;
  goalWhy: string;
  personalAnchorInterpretation?: PersonalAnchorInterpretation;
};

const LS_SCREENING_DONE_KEY = "fenela:screeningDone";
const LS_INTAKE_KEY = "fenela:intake";
const LEGACY_DAYSTATE_KEY = "anchor:dayState";

async function registerSWOnce() {
  if (typeof window === "undefined") return;

  if (!("serviceWorker" in navigator)) {
    console.warn("[SW] not supported in this browser");
    return;
  }

  try {
    const existing = await navigator.serviceWorker.getRegistration();

    if (existing) {
      return;
    }

    await navigator.serviceWorker.register("/sw.js");
  } catch (error) {
    console.error("[SW] register failed:", error);
  }
}

function subscribeToHydrationStore() {
  return () => {
    // No external subscription is needed. This store only separates the
    // server snapshot from the client snapshot so localStorage is not read
    // during server rendering.
  };
}

function getClientHydrationSnapshot() {
  return true;
}

function getServerHydrationSnapshot() {
  return false;
}

export default function Page() {
  const hydrated = useSyncExternalStore(
    subscribeToHydrationStore,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot
  );

  const storedScreeningDone = hydrated
    ? loadFromStorage<boolean>(LS_SCREENING_DONE_KEY, false)
    : false;

  const storedIntake = hydrated ? loadFromStorage<Intake | null>(LS_INTAKE_KEY, null) : null;

  const [screeningDoneOverride, setScreeningDoneOverride] = useState<boolean | null>(null);

  const [intakeOverride, setIntakeOverride] = useState<Intake | null | undefined>(undefined);

  // Keep name across "New Goal".
  const [identityNameOverride, setIdentityNameOverride] = useState<string | null>(null);

  // Force-remount CoachingScreen when restarting day.
  const [coachMountKey, setCoachMountKey] = useState(0);

  useEffect(() => {
    registerSWOnce();
  }, []);

  const screeningDone = screeningDoneOverride ?? storedScreeningDone;
  const intake = intakeOverride !== undefined ? intakeOverride : storedIntake;
  const identityName = identityNameOverride ?? storedIntake?.name ?? "";

  const handleCompleteScreening = () => {
    setScreeningDoneOverride(true);
    saveToStorage(LS_SCREENING_DONE_KEY, true);
  };

  const handleCompleteIntake = (data: Intake) => {
    setIntakeOverride(data);
    saveToStorage(LS_INTAKE_KEY, data);

    setIdentityNameOverride(data.name);

    const anchors = loadCareAnchors();
    const freshDay = createDayStateFromAnchors(anchors);
    saveDayState(freshDay);

    removeFromStorage(LEGACY_DAYSTATE_KEY);

    setCoachMountKey((key) => key + 1);
  };

  const restartDay = () => {
    clearDayState();
    removeFromStorage(LEGACY_DAYSTATE_KEY);

    const anchors = loadCareAnchors();
    const freshDay = createDayStateFromAnchors(anchors);
    saveDayState(freshDay);

    setCoachMountKey((key) => key + 1);
  };

  const resetEverything = () => {
    // Keep screening. User guidance preferences should not be removed by a new goal.
    clearDayState();
    removeFromStorage(LEGACY_DAYSTATE_KEY);

    removeFromStorage("careAnchors");

    removeFromStorage(LS_INTAKE_KEY);
    setIntakeOverride(null);

    setCoachMountKey((key) => key + 1);
  };

  if (!hydrated) return null;

  return (
    <>
      {!screeningDone ? (
        <ScreeningScreen onDone={handleCompleteScreening} />
      ) : !intake ? (
        <IntakeScreen
          onComplete={handleCompleteIntake}
          initialName={identityName}
          skipNameStep={Boolean(identityName)}
        />
      ) : (
        <CoachingScreen
          key={coachMountKey}
          intake={intake}
          onResetEverything={resetEverything}
          onRestartDay={restartDay}
        />
      )}
    </>
  );
}
