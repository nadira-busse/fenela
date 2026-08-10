"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import ScreeningScreen from "./components/ScreeningScreen";
import IntakeScreen, {
  type IntakeCompletionData,
  type IntakeCompletionResult,
} from "./components/IntakeScreen";
import CoachingScreen from "./components/CoachingScreen";
import AuthGateScreen from "./components/AuthGateScreen";
import WeeklyReflectionGate from "./components/WeeklyReflectionGate";
import {
  loadFromStorage,
  saveToStorage,
  removeFromStorage,
  loadCareAnchors,
  saveCareAnchors,
  createDayStateFromAnchors,
  saveDayState,
  clearDayState,
  CARE_ANCHORS_KEY,
} from "@/lib/storage";
import {
  LS_SCREENING_DONE_KEY,
  LS_INTAKE_KEY,
  type PersistedPreferenceFields,
  type PersistedReminderPreference,
} from "./authenticatedLocalSync";
import { createAuthenticatedOwnershipStore } from "./authenticatedOwnershipStore";
import type { ActiveGoalWithAnchors } from "@/lib/goalMapping";
import { createGoalWithAnchorsAction } from "@/server/goals/createGoalWithAnchorsAction";
import { archiveActiveGoalAction } from "@/server/goals/archiveActiveGoalAction";
import { performNewGoalReset } from "./newGoalReset";
import { performIntakeCompletion, type Intake } from "./intakeCompletion";

type Props = {
  userId: string | null;
  dbPreference: PersistedPreferenceFields | null;
  activeGoal: ActiveGoalWithAnchors | null;
  reminderPreference: PersistedReminderPreference | null;
};

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

export default function HomeClient({
  userId,
  dbPreference,
  activeGoal,
  reminderPreference,
}: Props) {
  const isAuthenticated = userId !== null;

  const hydrated = useSyncExternalStore(
    subscribeToHydrationStore,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot
  );

  const [screeningDoneOverride, setScreeningDoneOverride] = useState<boolean | null>(null);

  const [intakeOverride, setIntakeOverride] = useState<Intake | null | undefined>(undefined);

  // Same three-state override pattern as intakeOverride: undefined = defer
  // to the `activeGoal` prop, null = explicitly no goal (just archived),
  // a string = explicitly this goal (just created) — needed because the
  // server-provided `activeGoal` prop cannot reflect a mutation that just
  // happened in this same client session (Phase 4B hardening, Defect A).
  const [goalIdOverride, setGoalIdOverride] = useState<string | null | undefined>(undefined);

  // Keep name across "New Goal".
  const [identityNameOverride, setIdentityNameOverride] = useState<string | null>(null);

  // Force-remount CoachingScreen when restarting day.
  const [coachMountKey, setCoachMountKey] = useState(0);

  // New Goal archive request state (Phase 4B hardening, Defect B).
  const [archivingNewGoal, setArchivingNewGoal] = useState(false);
  const [newGoalError, setNewGoalError] = useState<string | null>(null);

  const ownershipStore = useMemo(
    () =>
      userId
        ? createAuthenticatedOwnershipStore(userId, dbPreference, activeGoal, reminderPreference)
        : null,
    [userId, dbPreference, activeGoal, reminderPreference]
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

  // Same precedence as `intake`: an explicit override (just created/just
  // archived, this session) wins over the server-provided `activeGoal`
  // prop, which only reflects state as of the last server render.
  const goalId = (goalIdOverride !== undefined ? goalIdOverride : activeGoal?.id) ?? undefined;

  const handleCompleteScreening = () => {
    setScreeningDoneOverride(true);
    saveToStorage(LS_SCREENING_DONE_KEY, true);
  };

  // Goal data complete + final Anchor set chosen is the persistence
  // boundary (Phase 4B §16) — not shown to the user until this succeeds
  // (§17): for an authenticated user, the DB write happens first and the
  // local compatibility cache/Coaching transition only proceed on success.
  // Unauthenticated visitors keep the existing MVP1 local-only behavior.
  const handleCompleteIntake = (data: IntakeCompletionData): Promise<IntakeCompletionResult> =>
    performIntakeCompletion(userId, data, {
      createGoalWithAnchors: createGoalWithAnchorsAction,
      applyCompletedIntake: ({ goalId: newGoalId, intake, careAnchors }) => {
        setIntakeOverride(intake);
        saveToStorage(LS_INTAKE_KEY, intake);
        saveCareAnchors(careAnchors);
        setGoalIdOverride(newGoalId ?? null);

        setIdentityNameOverride(intake.name);

        const freshDay = createDayStateFromAnchors(careAnchors, newGoalId);
        saveDayState(freshDay);

        removeFromStorage(LEGACY_DAYSTATE_KEY);

        setCoachMountKey((key) => key + 1);
      },
    });

  const restartDay = () => {
    clearDayState();
    removeFromStorage(LEGACY_DAYSTATE_KEY);

    const anchors = loadCareAnchors();
    const freshDay = createDayStateFromAnchors(anchors, goalId);
    saveDayState(freshDay);

    setCoachMountKey((key) => key + 1);
  };

  // Archives the current ACTIVE goal in PostgreSQL before clearing local
  // state (Phase 4B §14) — never deletes it, and never creates a
  // replacement goal (the next completed Intake does that). If the archive
  // fails, local state is deliberately left untouched and a calm error is
  // shown near the New Goal action (Phase 4B hardening, Defect B) so the
  // user isn't left wondering whether the button did anything. The actual
  // archive-then-clear ordering lives in performNewGoalReset() so it stays
  // testable outside this component.
  const resetEverything = async () => {
    if (archivingNewGoal) return;

    setArchivingNewGoal(true);
    setNewGoalError(null);

    const result = await performNewGoalReset(userId, {
      archiveActiveGoal: archiveActiveGoalAction,
      clearLocalGoalState: () => {
        setGoalIdOverride(null);

        // Keep screening. User guidance preferences should not be removed by a new goal.
        clearDayState();
        removeFromStorage(LEGACY_DAYSTATE_KEY);
        removeFromStorage(CARE_ANCHORS_KEY);
        removeFromStorage(LS_INTAKE_KEY);
        setIntakeOverride(null);

        setCoachMountKey((key) => key + 1);
      },
    });

    setArchivingNewGoal(false);

    if (!result.ok) {
      setNewGoalError(result.message);
    }
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
        <WeeklyReflectionGate enabled={isAuthenticated && Boolean(goalId)}>
          <CoachingScreen
            key={coachMountKey}
            intake={intake}
            goalId={goalId}
            reminderPreference={goalId ? reminderPreference : null}
            onResetEverything={resetEverything}
            onRestartDay={restartDay}
            newGoalPending={archivingNewGoal}
            newGoalError={newGoalError}
          />
        </WeeklyReflectionGate>
      )}
    </>
  );
}
