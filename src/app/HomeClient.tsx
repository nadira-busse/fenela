"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import ScreeningScreen from "./components/ScreeningScreen";
import IntakeScreen from "./components/IntakeScreen";
import CoachingScreen from "./components/CoachingScreen";
import AuthGateScreen from "./components/AuthGateScreen";
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
import { LS_SCREENING_DONE_KEY, type PersistedPreferenceFields } from "./authenticatedLocalSync";
import { createAuthenticatedOwnershipStore } from "./authenticatedOwnershipStore";

type Intake = {
  name: string;
  goal: string;
  struggle: string;
  goalWhy: string;
  personalAnchorInterpretation?: PersonalAnchorInterpretation;
};

type Props = {
  userId: string | null;
  dbPreference: PersistedPreferenceFields | null;
};

const LS_INTAKE_KEY = "fenela:intake";
const LEGACY_DAYSTATE_KEY = "anchor:dayState";
const ROOT_PATH = "/";

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

function subscribeAlwaysReady() {
  return () => {};
}

function getAlwaysReadySnapshot() {
  return true;
}

function getOwnershipServerSnapshot() {
  return false;
}

export default function HomeClient({ userId, dbPreference }: Props) {
  const isAuthenticated = userId !== null;

  const hydrated = useSyncExternalStore(
    subscribeToHydrationStore,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot
  );

  const [screeningDoneOverride, setScreeningDoneOverride] = useState<boolean | null>(null);

  const [intakeOverride, setIntakeOverride] = useState<Intake | null | undefined>(undefined);

  // Keep name across "New Goal".
  const [identityNameOverride, setIdentityNameOverride] = useState<string | null>(null);

  // Force-remount CoachingScreen when restarting day.
  const [coachMountKey, setCoachMountKey] = useState(0);

  const ownershipStore = useMemo(
    () => (userId ? createAuthenticatedOwnershipStore(userId, dbPreference) : null),
    [userId, dbPreference]
  );

  const ownershipReady = useSyncExternalStore(
    ownershipStore?.subscribe ?? subscribeAlwaysReady,
    ownershipStore?.getSnapshot ?? getAlwaysReadySnapshot,
    getOwnershipServerSnapshot
  );

  useEffect(() => {
    registerSWOnce();
  }, []);

  useEffect(() => {
    ownershipStore?.sync();
  }, [ownershipStore]);

  const canReadOwnedLocalState = hydrated && (!isAuthenticated || ownershipReady);

  const storedScreeningDone = canReadOwnedLocalState
    ? loadFromStorage<boolean>(LS_SCREENING_DONE_KEY, false)
    : false;

  const storedIntake = canReadOwnedLocalState
    ? loadFromStorage<Intake | null>(LS_INTAKE_KEY, null)
    : null;

  // Identity and screening completion are separate facts (Phase 4A §5):
  // for an authenticated user, the DB preference (not a possibly-stale
  // local flag) is the base signal — syncAuthenticatedLocalState already
  // refreshed the local cache from it above. screeningDoneOverride still
  // wins once set, e.g. right after a successful screening submit, so the
  // UI advances immediately without waiting on a server refetch of the
  // now-stale `dbPreference` prop. Unauthenticated visitors keep the
  // existing MVP1 local-only behavior unchanged.
  const screeningDone =
    screeningDoneOverride ?? (isAuthenticated ? Boolean(dbPreference) : storedScreeningDone);

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

  if (!hydrated || (isAuthenticated && !ownershipReady)) return null;

  if (!screeningDone && !isAuthenticated) {
    return <AuthGateScreen nextPath={ROOT_PATH} />;
  }

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
