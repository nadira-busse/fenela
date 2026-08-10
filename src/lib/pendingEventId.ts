// The stable-client_event_id-across-retry mechanism (Phase 4C §5, extended
// in Phase 4C hardening §8) used by every blocking ActionEvent/FrictionEvent
// write in src/app/components/CoachingScreen.tsx (COMPLETED, PARKED_TODAY,
// the final POSTPONED, and the friction submission). Extracted into a
// framework-free helper so this specific claim — a retry before success
// reuses the same id, and the next distinct interaction after success gets
// a fresh one — is unit-testable without rendering CoachingScreen (this
// repo has no RTL/jsdom dependency).
//
// A React component holds one slot per interaction type in a useRef, so
// the slot instance itself persists across re-renders exactly like the
// literal ref value it replaces.

export type PendingEventIdSlot = {
  // Returns the id for the current pending attempt, generating one only if
  // this is the first attempt (or the previous one succeeded and cleared
  // it) — never a fresh id on every call, which would break retry
  // idempotency.
  get(): string;
  // Call only after a successful write, so the next distinct interaction
  // gets a fresh id.
  clear(): void;
};

export function createPendingEventIdSlot(): PendingEventIdSlot {
  let current: string | null = null;

  return {
    get(): string {
      if (!current) {
        current = crypto.randomUUID();
      }

      return current;
    },
    clear(): void {
      current = null;
    },
  };
}
