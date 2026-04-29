-- Preset Storage V2 maintenance helpers.
-- These helpers are intentionally dry-run first. Apply them after
-- docs/preset_storage_v2.sql has created the V2 tables and policies.

CREATE OR REPLACE FUNCTION public.kessho_find_unreferenced_payloads_v2(limit_count INTEGER DEFAULT 100)
RETURNS TABLE (
  hash TEXT,
  payload_kind TEXT,
  payload_bytes INTEGER,
  created_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT p.hash, p.payload_kind, p.payload_bytes, p.created_at, p.last_seen_at
    FROM public.preset_payloads_v2 p
   WHERE NOT EXISTS (
          SELECT 1
            FROM public.preset_versions_v2 v
           WHERE p.hash IN (v.override_hash, v.metadata_hash, v.patch_from_prev_hash, v.resolved_hash)
        )
     AND NOT EXISTS (
          SELECT 1
            FROM public.preset_version_refs_v2 r
           WHERE r.override_hash = p.hash
        )
     AND NOT EXISTS (
          SELECT 1
            FROM public.presets_v2 preset
           WHERE p.hash IN (preset.latest_resolved_hash, preset.latest_metadata_hash)
        )
   ORDER BY p.last_seen_at ASC, p.created_at ASC
   LIMIT GREATEST(limit_count, 0);
$$;

CREATE OR REPLACE FUNCTION public.kessho_prune_unreferenced_payloads_v2(
  dry_run_mode BOOLEAN DEFAULT TRUE,
  limit_count INTEGER DEFAULT 100
)
RETURNS TABLE (
  dry_run BOOLEAN,
  candidate_count BIGINT,
  candidate_bytes BIGINT,
  deleted_count BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  selected_count BIGINT := 0;
  selected_bytes BIGINT := 0;
  removed_count BIGINT := 0;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS kessho_payload_prune_candidates (
    hash TEXT PRIMARY KEY,
    payload_bytes INTEGER NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE kessho_payload_prune_candidates;

  INSERT INTO kessho_payload_prune_candidates(hash, payload_bytes)
  SELECT candidate.hash, candidate.payload_bytes
    FROM public.kessho_find_unreferenced_payloads_v2(limit_count) candidate;

  SELECT COUNT(*), COALESCE(SUM(payload_bytes), 0)
    INTO selected_count, selected_bytes
    FROM kessho_payload_prune_candidates;

  IF NOT dry_run_mode THEN
    DELETE FROM public.preset_payloads_v2 p
     USING kessho_payload_prune_candidates c
     WHERE p.hash = c.hash;
    GET DIAGNOSTICS removed_count = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT dry_run_mode, selected_count, selected_bytes, removed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_find_duplicate_latest_presets_v2(
  include_metadata BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  type TEXT,
  scope TEXT,
  resolved_hash TEXT,
  metadata_hash TEXT,
  preset_count BIGINT,
  preset_names TEXT[]
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    p.type::TEXT,
    p.scope,
    p.latest_resolved_hash,
    CASE WHEN include_metadata THEN p.latest_metadata_hash ELSE NULL END AS metadata_hash,
    COUNT(*) AS preset_count,
    ARRAY_AGG(p.name || ' (v' || p.latest_version_no || ')' ORDER BY p.name) AS preset_names
  FROM public.presets_v2 p
  WHERE p.latest_resolved_hash IS NOT NULL
    AND p.archived = FALSE
  GROUP BY
    p.type,
    p.scope,
    p.latest_resolved_hash,
    CASE WHEN include_metadata THEN p.latest_metadata_hash ELSE NULL END
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC, p.type::TEXT, p.scope, p.latest_resolved_hash;
$$;
