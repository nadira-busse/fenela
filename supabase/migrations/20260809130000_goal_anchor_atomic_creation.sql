-- Fenéla MVP2 — Phase 4B: atomic Goal + Anchor creation
--
-- Narrowly scoped to the one problem Phase 4B actually has: a completed
-- Intake produces a Goal AND its 1-5 selected Anchors together, and a Goal
-- without its anchors is not a valid completed Intake result (see
-- decisions and Phase 4B task notes). Two separate INSERT statements from
-- application code cannot guarantee that atomically; a single PL/pgSQL
-- function body can, since PostgreSQL rolls back everything the function
-- did if any statement inside it raises.
--
-- Does not touch existing schema, RLS, or any other table from
-- supabase/migrations/20260809120000_mvp2_persistence_foundation.sql.

create or replace function public.create_active_goal_with_anchors(
  p_title text,
  p_why text,
  p_initial_struggle text,
  p_personal_anchor_interpretation jsonb,
  p_interpretation_source text,
  p_anchors jsonb
)
returns table (
  goal_id uuid,
  anchor_id uuid,
  anchor_text text,
  anchor_source text,
  anchor_position smallint
)
language plpgsql
-- SECURITY INVOKER (the default, stated explicitly): this function needs no
-- privilege the calling `authenticated` role doesn't already have. Ownership
-- comes from auth.uid(), exactly like every RLS policy on these tables, and
-- the existing goals/anchors INSERT policies (`..._insert_own`, checking
-- user_id/goal_id ownership) still apply in full — this function does not
-- bypass RLS, it just wraps two of the caller's own inserts in one
-- transaction. SECURITY DEFINER is deliberately not used: it is not needed
-- here, and using it would mean taking on the search_path/grant lockdown
-- burden for no benefit.
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_goal_id uuid;
  v_anchor_count int;
  v_distinct_position_count int;
  v_invalid_source_count int;
  v_invalid_position_count int;
  v_empty_text_count int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_anchors is null or jsonb_typeof(p_anchors) <> 'array' then
    raise exception 'anchors must be a JSON array' using errcode = '22023';
  end if;

  select count(*) into v_anchor_count from jsonb_array_elements(p_anchors);

  if v_anchor_count < 1 or v_anchor_count > 5 then
    raise exception 'Anchor count must be between 1 and 5, received %', v_anchor_count
      using errcode = '22023';
  end if;

  select count(*) filter (where trim(coalesce(elem->>'text', '')) = '')
  into v_empty_text_count
  from jsonb_array_elements(p_anchors) as elem;

  if v_empty_text_count > 0 then
    raise exception 'Anchor text must not be empty' using errcode = '22023';
  end if;

  select count(*) filter (where coalesce(elem->>'source', '') not in ('USER', 'AI', 'FALLBACK'))
  into v_invalid_source_count
  from jsonb_array_elements(p_anchors) as elem;

  if v_invalid_source_count > 0 then
    raise exception 'Anchor source must be USER, AI or FALLBACK' using errcode = '22023';
  end if;

  select count(*) filter (
    where (elem->>'position') !~ '^[0-9]+$'
       or (elem->>'position')::int < 1
       or (elem->>'position')::int > 5
  )
  into v_invalid_position_count
  from jsonb_array_elements(p_anchors) as elem;

  if v_invalid_position_count > 0 then
    raise exception 'Anchor position must be between 1 and 5' using errcode = '22023';
  end if;

  select count(distinct elem->>'position') into v_distinct_position_count
  from jsonb_array_elements(p_anchors) as elem;

  if v_distinct_position_count <> v_anchor_count then
    raise exception 'Anchor positions must be unique' using errcode = '22023';
  end if;

  if trim(coalesce(p_title, '')) = '' then
    raise exception 'title must not be empty' using errcode = '22023';
  end if;

  if trim(coalesce(p_why, '')) = '' then
    raise exception 'why must not be empty' using errcode = '22023';
  end if;

  if trim(coalesce(p_initial_struggle, '')) = '' then
    raise exception 'initial_struggle must not be empty' using errcode = '22023';
  end if;

  if p_interpretation_source is not null and p_interpretation_source not in ('AI', 'FALLBACK') then
    raise exception 'interpretation_source must be AI, FALLBACK or null' using errcode = '22023';
  end if;

  -- Relies on the existing goals_one_active_per_user partial unique index
  -- for the one-active-goal invariant: if the caller already has an ACTIVE
  -- goal, this insert raises a unique_violation and the whole function
  -- (including the anchor inserts below) rolls back.
  insert into public.goals (
    user_id, title, why, initial_struggle,
    personal_anchor_interpretation, interpretation_source
  )
  values (
    v_user_id, p_title, p_why, p_initial_struggle,
    p_personal_anchor_interpretation, p_interpretation_source
  )
  returning id into v_goal_id;

  return query
  insert into public.anchors (goal_id, text, source, position)
  select
    v_goal_id,
    elem->>'text',
    elem->>'source',
    (elem->>'position')::smallint
  from jsonb_array_elements(p_anchors) as elem
  returning anchors.goal_id, anchors.id, anchors.text, anchors.source, anchors.position;
end;
$$;

comment on function public.create_active_goal_with_anchors is
  'Atomically creates one ACTIVE goal and its 1-5 anchors for the calling authenticated user (auth.uid()). Rolls back entirely on any validation failure or constraint violation. SECURITY INVOKER — relies on existing goals/anchors RLS insert policies, not elevated privilege.';

revoke all on function public.create_active_goal_with_anchors(
  text, text, text, jsonb, text, jsonb
) from public, anon;

grant execute on function public.create_active_goal_with_anchors(
  text, text, text, jsonb, text, jsonb
) to authenticated;
