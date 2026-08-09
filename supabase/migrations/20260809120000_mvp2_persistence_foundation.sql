-- Fenéla MVP2 — Phase 3C-1: Supabase persistence foundation
--
-- Implements the relational schema, constraints, indexes and Row Level
-- Security for the domain model accepted in:
--   decisions/ADR-003-authenticated-user-owned-persistence.md
--   decisions/ADR-004-reminder-preferences-and-device-ownership.md
--   decisions/ADR-005-deterministic-reflection-history.md
--
-- Identity root is Supabase's own auth.users table (ADR-003). No second
-- application-level `users` table is created.
--
-- This migration is schema/RLS only. No application runtime code depends on
-- it yet (Phase 3C-1 scope boundary).

-- =============================================================================
-- user_preferences
-- =============================================================================

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  anchor_choice_mode text not null default 'USER_DECIDES'
    check (anchor_choice_mode in ('USER_DECIDES', 'FENELA_SUGGESTS')),
  resistance_pattern text not null default 'DELAY'
    check (resistance_pattern in ('DELAY', 'FORCE', 'QUIT', 'SWITCH')),
  main_challenge text not null default 'START'
    check (main_challenge in ('START', 'SUSTAIN', 'BOUNDARIES')),
  action_trigger text not null default 'SMALL'
    check (action_trigger in ('SMALL', 'WHY', 'REMINDER')),
  anti_help text[] not null default '{}'
    check (anti_help <@ array['PRESSURE', 'LONG_TEXT', 'REPETITION']::text[]),
  time_zone text not null check (length(trim(time_zone)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_preferences is
  'One row per authenticated user. Canonical home for the guidance preferences that already change deterministic copy and AI prompt context today (see docs/product/mvp2-input-audit.md).';
comment on column public.user_preferences.time_zone is
  'IANA timezone identifier (e.g. Europe/Amsterdam). Identifier format is validated in application code; this constraint only rejects empty values.';

-- =============================================================================
-- reminder_preferences
-- =============================================================================

create table public.reminder_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  start_time time not null default '08:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.reminder_preferences is
  'Canonical, single reminder preference per user (ADR-004). Onboarding and post-onboarding settings both read/write this one row instead of two independent local values.';
comment on column public.reminder_preferences.start_time is
  'Wall-clock time of day. Interpreted using user_preferences.time_zone; no timezone is stored here (ADR-004).';

-- =============================================================================
-- goals
-- =============================================================================

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  why text not null check (length(trim(why)) > 0),
  initial_struggle text not null check (length(trim(initial_struggle)) > 0),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'COMPLETED', 'ARCHIVED')),
  personal_anchor_interpretation jsonb,
  interpretation_source text
    check (interpretation_source is null or interpretation_source in ('AI', 'FALLBACK')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz
);

comment on table public.goals is
  'The single goal a user is currently (or was previously) working toward. title/why/initial_struggle map to the existing intake goal/goalWhy/struggle fields.';
comment on column public.goals.personal_anchor_interpretation is
  'Derived presentation context (directionLine/whyLine/frictionLine/returnLine), not historical source of truth.';

-- Only one ACTIVE goal per user at a time.
create unique index goals_one_active_per_user
  on public.goals (user_id)
  where status = 'ACTIVE';

create index goals_user_id_idx on public.goals (user_id);

-- =============================================================================
-- anchors
-- =============================================================================

create table public.anchors (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  text text not null check (length(trim(text)) > 0),
  source text not null check (source in ('USER', 'AI', 'FALLBACK')),
  position smallint not null check (position between 1 and 5),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table public.anchors is
  'Small, concrete actions belonging to one goal. Not a generic task hierarchy — position is bounded to 1..5 per the product''s anchor-count limit.';

-- At most one active anchor per position within a goal.
create unique index anchors_one_active_position_per_goal
  on public.anchors (goal_id, position)
  where status = 'ACTIVE';

create index anchors_goal_id_idx on public.anchors (goal_id);

-- =============================================================================
-- action_events
-- =============================================================================

create table public.action_events (
  id uuid primary key default gen_random_uuid(),
  anchor_id uuid not null references public.anchors (id) on delete cascade,
  client_event_id text not null check (length(trim(client_event_id)) > 0),
  event_type text not null
    check (event_type in ('STARTED', 'COMPLETED', 'POSTPONED', 'PARKED_TODAY')),
  occurred_at timestamptz not null default now(),
  local_date date not null,
  time_zone text not null check (length(trim(time_zone)) > 0),
  constraint action_events_client_event_id_key unique (client_event_id)
);

comment on table public.action_events is
  'Immutable historical facts about an anchor (started/completed/postponed/parked). client_event_id makes retried writes idempotent. No routine UPDATE/DELETE is granted (see RLS section below).';
comment on column public.action_events.local_date is
  'Calendar date the event is attributed to, derived using time_zone at the moment it occurred, so later timezone changes do not retroactively reclassify history.';

create index action_events_anchor_id_local_date_idx
  on public.action_events (anchor_id, local_date);

-- =============================================================================
-- friction_events
-- =============================================================================

create table public.friction_events (
  id uuid primary key default gen_random_uuid(),
  anchor_id uuid not null references public.anchors (id) on delete cascade,
  client_event_id text not null check (length(trim(client_event_id)) > 0),
  reason text not null check (length(trim(reason)) > 0),
  occurred_at timestamptz not null default now(),
  local_date date not null,
  time_zone text not null check (length(trim(time_zone)) > 0),
  constraint friction_events_client_event_id_key unique (client_event_id)
);

comment on table public.friction_events is
  'The user''s own explanation of a specific action difficulty (the pause-reason textarea, ADR-005). Immutable; no routine UPDATE/DELETE is granted. reason must be non-empty — an empty friction event must never be created.';

create index friction_events_anchor_id_local_date_idx
  on public.friction_events (anchor_id, local_date);

-- =============================================================================
-- reflections
-- =============================================================================

create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reflection_type text not null check (reflection_type in ('WEEKLY', 'MONTHLY')),
  period_start date not null,
  period_end date not null,
  time_zone text not null check (length(trim(time_zone)) > 0),
  facts_snapshot jsonb not null,
  generated_text text not null check (length(trim(generated_text)) > 0),
  generation_mode text not null
    check (generation_mode in ('DETERMINISTIC', 'AI_ASSISTED', 'FALLBACK')),
  model text,
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  constraint reflections_period_unique
    unique (user_id, reflection_type, period_start, period_end)
);

comment on table public.reflections is
  'Derived weekly/monthly reflection output (ADR-005). facts_snapshot/generated_text are derived presentation data — action_events/friction_events remain the historical source of truth, not this table.';

-- =============================================================================
-- devices
-- =============================================================================

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

comment on table public.devices is
  'A device/browser installation belonging to an authenticated user. Not a user identity — replaces the current browser-generated device ID used as pseudo-authorization (ADR-004).';

create index devices_user_id_idx on public.devices (user_id);

-- =============================================================================
-- push_subscriptions
-- =============================================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices (id) on delete cascade,
  endpoint text not null,
  p256dh text not null check (length(trim(p256dh)) > 0),
  auth_key text not null check (length(trim(auth_key)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_key unique (endpoint),
  -- At most one current subscription per device for MVP2 (ADR-004).
  constraint push_subscriptions_device_id_key unique (device_id)
);

comment on table public.push_subscriptions is
  'The technical Web Push endpoint for one device. Reminder time/enabled state does not belong here — see reminder_preferences.';

-- =============================================================================
-- updated_at maintenance
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Shared trigger function: stamps updated_at = now() on UPDATE. Used by every mutable preference/subscription table instead of a per-table copy.';

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row
  execute function public.set_updated_at();

create trigger reminder_preferences_set_updated_at
  before update on public.reminder_preferences
  for each row
  execute function public.set_updated_at();

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row
  execute function public.set_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================
--
-- All tables below are user-owned, directly or indirectly, and are only ever
-- accessed by an authenticated Fenéla user or trusted server-side code
-- (service_role, which bypasses RLS and table grants entirely and therefore
-- needs no explicit grants here).
--
-- No table in this migration grants anything to `anon` — MVP2 has no
-- anonymous-authentication stage (ADR-003) — so every policy below is scoped
-- `to authenticated` only. Table-level GRANTs are explicit rather than relied
-- on implicitly, because the current Supabase default (see
-- supabase/config.toml, `auto_expose_new_tables`) does NOT auto-expose new
-- public-schema tables to API roles; explicit GRANTs make that posture
-- visible in the migration itself rather than depending on a config default
-- that could change.
--
-- (select auth.uid()) is used instead of a bare auth.uid() call per current
-- Supabase RLS guidance, so the value is evaluated once per statement rather
-- than once per row.

revoke all on
  public.user_preferences,
  public.reminder_preferences,
  public.goals,
  public.anchors,
  public.action_events,
  public.friction_events,
  public.reflections,
  public.devices,
  public.push_subscriptions
from public, anon;

-- ---------------------------------------------------------------------------
-- user_preferences — direct ownership. keep/change/remove: no hard delete in
-- normal product flow.
-- ---------------------------------------------------------------------------

alter table public.user_preferences enable row level security;

create policy "user_preferences_select_own"
  on public.user_preferences for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "user_preferences_insert_own"
  on public.user_preferences for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "user_preferences_update_own"
  on public.user_preferences for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.user_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- reminder_preferences — direct ownership.
-- ---------------------------------------------------------------------------

alter table public.reminder_preferences enable row level security;

create policy "reminder_preferences_select_own"
  on public.reminder_preferences for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "reminder_preferences_insert_own"
  on public.reminder_preferences for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "reminder_preferences_update_own"
  on public.reminder_preferences for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.reminder_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- goals — direct ownership.
-- ---------------------------------------------------------------------------

alter table public.goals enable row level security;

create policy "goals_select_own"
  on public.goals for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "goals_insert_own"
  on public.goals for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "goals_update_own"
  on public.goals for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.goals to authenticated;

-- ---------------------------------------------------------------------------
-- anchors — indirect ownership through goals.
-- ---------------------------------------------------------------------------

alter table public.anchors enable row level security;

create policy "anchors_select_own"
  on public.anchors for select
  to authenticated
  using (
    exists (
      select 1
      from public.goals g
      where g.id = anchors.goal_id
        and g.user_id = (select auth.uid())
    )
  );

create policy "anchors_insert_own"
  on public.anchors for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.goals g
      where g.id = anchors.goal_id
        and g.user_id = (select auth.uid())
    )
  );

create policy "anchors_update_own"
  on public.anchors for update
  to authenticated
  using (
    exists (
      select 1
      from public.goals g
      where g.id = anchors.goal_id
        and g.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.goals g
      where g.id = anchors.goal_id
        and g.user_id = (select auth.uid())
    )
  );

grant select, insert, update on public.anchors to authenticated;

-- ---------------------------------------------------------------------------
-- action_events — indirect ownership through anchors -> goals. Immutable:
-- SELECT + INSERT only. No UPDATE/DELETE policy or grant is defined, so
-- authenticated users cannot modify historical facts even if a future policy
-- mistake were made elsewhere (the table-level GRANT itself blocks it).
-- ---------------------------------------------------------------------------

alter table public.action_events enable row level security;

create policy "action_events_select_own"
  on public.action_events for select
  to authenticated
  using (
    exists (
      select 1
      from public.anchors a
      join public.goals g on g.id = a.goal_id
      where a.id = action_events.anchor_id
        and g.user_id = (select auth.uid())
    )
  );

create policy "action_events_insert_own"
  on public.action_events for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.anchors a
      join public.goals g on g.id = a.goal_id
      where a.id = action_events.anchor_id
        and g.user_id = (select auth.uid())
    )
  );

grant select, insert on public.action_events to authenticated;

-- ---------------------------------------------------------------------------
-- friction_events — indirect ownership through anchors -> goals. Immutable,
-- same reasoning as action_events.
-- ---------------------------------------------------------------------------

alter table public.friction_events enable row level security;

create policy "friction_events_select_own"
  on public.friction_events for select
  to authenticated
  using (
    exists (
      select 1
      from public.anchors a
      join public.goals g on g.id = a.goal_id
      where a.id = friction_events.anchor_id
        and g.user_id = (select auth.uid())
    )
  );

create policy "friction_events_insert_own"
  on public.friction_events for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.anchors a
      join public.goals g on g.id = a.goal_id
      where a.id = friction_events.anchor_id
        and g.user_id = (select auth.uid())
    )
  );

grant select, insert on public.friction_events to authenticated;

-- ---------------------------------------------------------------------------
-- reflections — direct ownership, SELECT-only for authenticated users.
--
-- Explicit least-privilege decision (AGENTS.md §12/§18 requires this to be
-- documented, not guessed): ADR-005 describes reflection generation as
-- deterministic aggregation -> optional AI wording -> validation -> fallback,
-- an orchestrated server-side process analogous to the existing
-- /api/ai/anchors route, not a value the client assembles and writes
-- directly. Writes are therefore expected to happen through trusted
-- server-side application code using the service_role key (which bypasses
-- RLS and table grants), once that server route is implemented in a later
-- phase. No INSERT/UPDATE policy or grant is created here for `authenticated`.
-- If a future phase decides the client should write reflections directly,
-- that is a product/architecture decision to make explicitly then, not a
-- default this migration should assume.
-- ---------------------------------------------------------------------------

alter table public.reflections enable row level security;

create policy "reflections_select_own"
  on public.reflections for select
  to authenticated
  using (user_id = (select auth.uid()));

grant select on public.reflections to authenticated;

-- ---------------------------------------------------------------------------
-- devices — direct ownership.
-- ---------------------------------------------------------------------------

alter table public.devices enable row level security;

create policy "devices_select_own"
  on public.devices for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "devices_insert_own"
  on public.devices for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "devices_update_own"
  on public.devices for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.devices to authenticated;

-- ---------------------------------------------------------------------------
-- push_subscriptions — indirect ownership through devices. Subscription
-- lifecycle (browser unsubscribe/replace) genuinely needs DELETE.
-- ---------------------------------------------------------------------------

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  to authenticated
  using (
    exists (
      select 1
      from public.devices d
      where d.id = push_subscriptions.device_id
        and d.user_id = (select auth.uid())
    )
  );

create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.devices d
      where d.id = push_subscriptions.device_id
        and d.user_id = (select auth.uid())
    )
  );

create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  to authenticated
  using (
    exists (
      select 1
      from public.devices d
      where d.id = push_subscriptions.device_id
        and d.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.devices d
      where d.id = push_subscriptions.device_id
        and d.user_id = (select auth.uid())
    )
  );

create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  to authenticated
  using (
    exists (
      select 1
      from public.devices d
      where d.id = push_subscriptions.device_id
        and d.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.push_subscriptions to authenticated;
