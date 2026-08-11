-- Fenéla MVP2 — Phase 4H hardening: remove duplicated raw friction text
-- from existing persisted Reflection snapshots.
--
-- ReflectionFacts.friction.reasons (src/lib/reflectionAggregation.ts) has
-- been removed from the application: the deterministic renderer
-- (src/lib/reflectionRenderer.ts) only ever used friction.entriesCount, and
-- nothing else in the current product reads the raw reason text back out
-- of a persisted facts_snapshot — it was a second, dormant copy of data
-- already canonically stored in friction_events.reason.
--
-- This is a one-time, narrowly targeted backfill for rows written before
-- that change, not a general reflections migration: it removes exactly the
-- nested `friction.reasons` key from facts_snapshot and leaves every other
-- field — period, activity, friction.entriesCount, generated_text,
-- generation_mode, model, timestamps — untouched. The jsonb `#-` operator
-- deletes one key at a path without rewriting the rest of the document.
--
-- Reflections are not regenerated and generated_text is never touched:
-- that text never echoed the raw reason text in the first place (it only
-- ever rendered friction.entriesCount as a count), so removing the raw
-- text from facts_snapshot changes no user-visible output. This does not
-- reopen or weaken the "reflections are immutable historical records"
-- policy (supabase/migrations/20260809120000_mvp2_persistence_foundation.sql)
-- going forward — no application code is granted UPDATE on this table, and
-- this migration itself runs outside the PostgREST role/RLS path exactly
-- once, the same way any other schema/data migration does.
--
-- The `where` clause makes this a no-op for rows that never had the key
-- (already-clean rows, or rows written after the application-side removal
-- lands) rather than rewriting every row unconditionally.

update public.reflections
set facts_snapshot = facts_snapshot #- '{friction,reasons}'
where facts_snapshot #> '{friction,reasons}' is not null;
