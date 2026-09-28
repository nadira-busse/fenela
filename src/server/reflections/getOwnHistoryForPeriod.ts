// Server-side read path for the authenticated user's own ActionEvent +
// FrictionEvent history within one exact reflection period.
// Server Component/server-boundary use only — not a Server Action, so it
// is not reachable as a client-callable endpoint. Mirrors
// src/server/preferences/getOwnUserPreference.ts / getActiveGoal.ts.
//
// Ownership: uses the request-scoped, RLS-enforced Supabase client — the
// `action_events_select_own`/`friction_events_select_own` policies
// (anchor -> goal -> auth.uid()) are the actual authorization check, with
// no caller-supplied user_id anywhere. Those policies carry no status
// filter, so ARCHIVED-Goal history is included automatically. The embedded
// `anchors(text, position)` select below is a second, independent RLS
// check (`anchors_select_own`, same anchor -> goal -> auth.uid() shape) —
// PostgREST enforces RLS on the embedded table too, so this cannot surface
// another user's anchor text even if action_events row-level ownership
// were ever satisfied by mistake.
//
// Date filtering uses the stored `local_date` column directly — the
// column the write boundary already derived specifically to represent
// calendar-day membership (src/server/events/createActionEventAction.ts,
// createFrictionEventAction.ts) — rather than re-deriving membership from
// `occurred_at`, which would require re-applying timezone logic that
// `local_date` already captured once, correctly, at write time.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth/requireUser";
import { isActionEventType, type ActionEventType } from "@/lib/eventMapping";

export type ReflectionActionEvent = {
  eventType: ActionEventType;
  localDate: string;
  occurredAt: string;
  // anchor_id is not null in the DB (action_events.anchor_id references
  // anchors, not-null); anchorText/anchorPosition come from the embedded
  // anchors row, which the same-shaped RLS policy guarantees is present
  // whenever the action_events row itself is visible.
  anchorId: string;
  anchorText: string;
  anchorPosition: number;
};

export type ReflectionFrictionEvent = {
  reason: string;
  localDate: string;
  occurredAt: string;
};

export type OwnHistoryForPeriod = {
  actionEvents: ReflectionActionEvent[];
  frictionEvents: ReflectionFrictionEvent[];
};

export async function getOwnHistoryForPeriod(period: {
  start: string;
  end: string;
}): Promise<OwnHistoryForPeriod> {
  // Ownership is enforced by RLS on the query below; this call only fails
  // closed for an unauthenticated/unverifiable caller before any query runs.
  await requireUser();

  const supabase = await createSupabaseServerClient();

  const { data: actionRows, error: actionError } = await supabase
    .from("action_events")
    .select("event_type, local_date, occurred_at, anchor_id, anchors(text, position)")
    .gte("local_date", period.start)
    .lte("local_date", period.end)
    .order("occurred_at", { ascending: true });

  if (actionError) {
    throw new Error(`Failed to load action_events: ${actionError.message}`);
  }

  // The generated Supabase types don't model the embedded `anchors(...)`
  // shape from a plain string select; this is the same defensive-cast
  // pattern already used below for event_type, applied to the one
  // additional shape PostgREST adds for the embed.
  type ActionRowWithAnchor = {
    event_type: string;
    local_date: string;
    occurred_at: string;
    anchor_id: string;
    anchors: { text: string; position: number } | null;
  };
  const typedActionRows = (actionRows ?? []) as unknown as ActionRowWithAnchor[];

  const { data: frictionRows, error: frictionError } = await supabase
    .from("friction_events")
    .select("reason, local_date, occurred_at")
    .gte("local_date", period.start)
    .lte("local_date", period.end)
    .order("occurred_at", { ascending: true });

  if (frictionError) {
    throw new Error(`Failed to load friction_events: ${frictionError.message}`);
  }

  return {
    // Defensive: the DB column is plain `text` in the generated types
    // (the CHECK constraint isn't reflected there) — an unrecognized value
    // is dropped rather than silently miscounted under the wrong bucket.
    // A null embedded `anchors` row is dropped the same way: it cannot
    // happen for genuinely own data (anchor_id is not-null and RLS
    // ownership is identical on both tables), so treating it as
    // unrecognized rather than fabricating placeholder text is the
    // correct fail-closed behavior.
    actionEvents: typedActionRows
      .filter((row) => isActionEventType(row.event_type) && row.anchors !== null)
      .map((row) => ({
        eventType: row.event_type as ActionEventType,
        localDate: row.local_date,
        occurredAt: row.occurred_at,
        anchorId: row.anchor_id,
        anchorText: (row.anchors as { text: string; position: number }).text,
        anchorPosition: (row.anchors as { text: string; position: number }).position,
      })),
    frictionEvents: (frictionRows ?? []).map((row) => ({
      reason: row.reason,
      localDate: row.local_date,
      occurredAt: row.occurred_at,
    })),
  };
}
