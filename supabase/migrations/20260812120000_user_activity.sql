-- Fenéla MVP2 — Phase 4H: dedicated server-owned activity lifecycle table
-- for the 12-month inactivity retention policy.
--
-- Why a separate table, not a column on user_preferences (an earlier,
-- uncommitted version of this migration did exactly that, and was
-- replaced before ever being accepted):
--   - user_preferences only exists once a user completes onboarding/
--     screening. An authenticated user who returns to Fenéla before
--     completing that flow would otherwise have no server-observed
--     activity signal at all — a plain UPDATE against a row that doesn't
--     exist yet is a silent no-op, which made that user look inactive
--     purely because no row existed to update, not because they were
--     actually inactive. This table is created (upserted) on the FIRST
--     authenticated product request, independent of onboarding state.
--   - user_preferences already grants `authenticated` UPDATE on its own
--     row (RLS-scoped `user_preferences_update_own`). A destructive
--     retention decision must not depend on a timestamp the client itself
--     could write. This table grants `authenticated` nothing at all —
--     only service_role, reached exclusively through the privileged
--     server-only admin client, may read or write it.
--
-- One responsibility only: server-observed authenticated Fenéla product
-- activity for account retention. Not a generic activity/analytics log —
-- no created_at, no per-request history, no free-text/device fields.

create table public.user_activity (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_active_at timestamptz not null
);

comment on table public.user_activity is
  'One row per authenticated user: the most recent server-observed authenticated Fenéla product request (Phase 4H). Written only by the privileged root-load activity touch (src/server/account/touchOwnActivity.ts); never client-writable. Used together with auth.users.last_sign_in_at (whichever is more recent) to determine 12-month inactivity retention eligibility. Cascades on auth.users deletion like every other account-owned table.';

comment on column public.user_activity.last_active_at is
  'Server-observed timestamp of the most recent authenticated Fenéla product request for this user. Not client-writable — see table comment.';

-- =============================================================================
-- Row Level Security + grants
-- =============================================================================
--
-- Enabled as defense-in-depth even though no policy grants `authenticated`
-- anything: the destructive retention decision this table feeds must never
-- depend on a client-writable timestamp, so there is deliberately no
-- "_own" policy of the kind every other user-owned table in this schema
-- has. `anon`/`authenticated`/`public` get no table GRANT at all — with
-- RLS enabled and zero policies both would be denied even if a grant
-- existed, but the explicit revoke below keeps this table's posture as
-- visible and explicit as every other table in this schema.
--
-- service_role needs SELECT (candidate enumeration, batched per Auth page
-- via `.in("user_id", [...])`) and INSERT/UPDATE (the root-load upsert —
-- the first authenticated request creates the row, every later one
-- updates it). No DELETE grant: rows are only ever removed via the
-- auth.users cascade above, never directly. BYPASSRLS lets service_role
-- skip Row Level Security policy evaluation; it does not grant standard
-- SQL table privileges, which Postgres still enforces for every role (the
-- same root cause already fixed for push_subscriptions, reflections and
-- devices in earlier migrations).

alter table public.user_activity enable row level security;

revoke all on public.user_activity from public, anon, authenticated;

grant select, insert, update on public.user_activity to service_role;
