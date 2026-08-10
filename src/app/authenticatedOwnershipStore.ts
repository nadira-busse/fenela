import {
  syncAuthenticatedLocalState,
  type PersistedPreferenceFields,
  type PersistedReminderPreference,
} from "./authenticatedLocalSync";
import type { ActiveGoalWithAnchors } from "@/lib/goalMapping";

type Listener = () => void;

class AuthenticatedOwnershipStore {
  private ready = false;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly userId: string,
    private readonly dbPreference: PersistedPreferenceFields | null,
    private readonly activeGoal: ActiveGoalWithAnchors | null,
    private readonly reminderPreference: PersistedReminderPreference | null
  ) {}

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.ready;

  sync = () => {
    if (this.ready) return;

    syncAuthenticatedLocalState(
      this.userId,
      this.dbPreference,
      this.activeGoal,
      this.reminderPreference
    );
    this.ready = true;

    for (const listener of this.listeners) {
      listener();
    }
  };
}

export function createAuthenticatedOwnershipStore(
  userId: string,
  dbPreference: PersistedPreferenceFields | null,
  activeGoal: ActiveGoalWithAnchors | null,
  reminderPreference: PersistedReminderPreference | null
) {
  return new AuthenticatedOwnershipStore(userId, dbPreference, activeGoal, reminderPreference);
}
