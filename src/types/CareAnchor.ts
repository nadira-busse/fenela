// "USER" | "AI" | "FALLBACK" mirrors the DB-enforced vocabulary in
// anchors.source (supabase/migrations/20260809120000_mvp2_persistence_foundation.sql).
// Optional so existing legacy callers/data that never set
// provenance keep compiling and loading; src/lib/storage.ts's
// getAnchorSource() is the one place that decides the default for an
// anchor with no recorded source.
export type AnchorSource = "USER" | "AI" | "FALLBACK";

export type CareAnchor = {
  id: string;
  text: string;
  source?: AnchorSource;
};
