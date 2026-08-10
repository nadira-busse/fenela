// Orchestrates "New Goal" (Phase 4B hardening, Defect B): archive the
// current ACTIVE goal in PostgreSQL, and only clear local Goal-related
// state if that succeeds. Extracted from src/app/HomeClient.tsx so this
// ordering — and specifically that local state is left completely
// untouched on failure — is independently testable without rendering the
// component (this repo has no RTL/jsdom dependency).

import type { ArchiveActiveGoalResult } from "@/server/goals/archiveActiveGoalAction";

export const NEW_GOAL_ARCHIVE_FAILURE_MESSAGE =
  "We couldn't start a new goal right now. Your current goal is still here. Please try again.";

export type NewGoalResetResult = { ok: true } | { ok: false; message: string };

export type NewGoalResetDeps = {
  archiveActiveGoal: () => Promise<ArchiveActiveGoalResult>;
  clearLocalGoalState: () => void;
};

export async function performNewGoalReset(
  userId: string | null,
  deps: NewGoalResetDeps
): Promise<NewGoalResetResult> {
  if (userId) {
    const result = await deps.archiveActiveGoal();

    if (!result.ok) {
      return { ok: false, message: NEW_GOAL_ARCHIVE_FAILURE_MESSAGE };
    }
  }

  // Only reached when archiving succeeded (or there was no authenticated
  // user to archive for, i.e. the unauthenticated/local-only MVP1 path) —
  // local intake/careAnchors/day-state are never cleared before this.
  deps.clearLocalGoalState();

  return { ok: true };
}
