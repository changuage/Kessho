-- Align preset storage V2 with the latest-only graph, aggressive history
-- cleanup, and legacy soft-delete policy.
--
-- Apply after taking a logical export and reviewing duplicate active logical
-- identities. This migration intentionally keeps the atomic save RPC as a
-- follow-up app/DB contract because that RPC needs the final client payload
-- shape and integration tests.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Existing refs now follow child presets' latest versions. Historical fixed
-- child-version refs are not part of the product contract.
UPDATE public.preset_version_refs_v2
   SET follow_latest = TRUE,
       target_version_no = NULL
 WHERE follow_latest IS DISTINCT FROM TRUE
    OR target_version_no IS NOT NULL;

ALTER TABLE public.preset_version_refs_v2
  ALTER COLUMN follow_latest SET DEFAULT TRUE;

ALTER TABLE public.preset_version_refs_v2
  DROP CONSTRAINT IF EXISTS preset_version_refs_v2_check;

ALTER TABLE public.preset_version_refs_v2
  DROP CONSTRAINT IF EXISTS preset_version_refs_v2_latest_only_chk;

ALTER TABLE public.preset_version_refs_v2
  ADD CONSTRAINT preset_version_refs_v2_latest_only_chk
  CHECK (follow_latest = TRUE AND target_version_no IS NULL)
  NOT VALID;

ALTER TABLE public.preset_version_refs_v2
  VALIDATE CONSTRAINT preset_version_refs_v2_latest_only_chk;

CREATE INDEX IF NOT EXISTS idx_preset_version_refs_v2_target_latest
  ON public.preset_version_refs_v2(target_preset_id);

-- The TypeScript canonicalizer is the hash authority. This helper stores a
-- caller-supplied hash instead of generating an incompatible SQL hash.
CREATE OR REPLACE FUNCTION public.kessho_put_payload_v2(
  kind TEXT,
  supplied_hash TEXT,
  body JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized JSONB := COALESCE(body, '{}'::jsonb);
BEGIN
  IF supplied_hash IS NULL OR supplied_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid preset payload hash';
  END IF;

  IF kind NOT IN ('override', 'metadata', 'resolved', 'patch', 'refs_override') THEN
    RAISE EXCEPTION 'Invalid preset payload kind: %', kind;
  END IF;

  INSERT INTO public.preset_payloads_v2(hash, payload_kind, payload)
  VALUES (supplied_hash, kind, normalized)
  ON CONFLICT (hash) DO UPDATE
    SET last_seen_at = now();

  RETURN supplied_hash;
END;
$$;

ALTER TABLE IF EXISTS public.presets
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_presets_legacy_deleted_at
  ON public.presets(deleted_at);

CREATE INDEX IF NOT EXISTS idx_presets_legacy_active_name
  ON public.presets(type, COALESCE(scope, ''), lower(btrim(name)))
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.kessho_soft_delete_legacy_preset(
  target_type TEXT,
  target_name TEXT,
  target_scope TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_count INTEGER := 0;
BEGIN
  UPDATE public.presets
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         archived = TRUE
   WHERE deleted_at IS NULL
     AND type = target_type
     AND lower(btrim(name)) = lower(btrim(target_name))
     AND COALESCE(scope, '') = COALESCE(target_scope, '')
     AND (
       user_id = auth.uid()
       OR (user_id IS NULL AND auth.uid() IS NOT NULL)
     );

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_preset_storage_v2_dry_run_report(
  private_retention INTERVAL DEFAULT INTERVAL '30 days',
  public_retention INTERVAL DEFAULT INTERVAL '180 days'
)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  WITH latest_versions AS (
    SELECT latest_version_id AS id
      FROM public.presets_v2
     WHERE latest_version_id IS NOT NULL
  ),
  fixed_refs AS (
    SELECT COUNT(*) AS count
      FROM public.preset_version_refs_v2
     WHERE follow_latest IS DISTINCT FROM TRUE
        OR target_version_no IS NOT NULL
  ),
  historical_resolved AS (
    SELECT COUNT(*) AS count,
           COALESCE(SUM(payload.payload_bytes), 0) AS bytes
      FROM public.preset_versions_v2 version
      LEFT JOIN public.preset_payloads_v2 payload ON payload.hash = version.resolved_hash
     WHERE version.resolved_hash IS NOT NULL
       AND version.id NOT IN (SELECT id FROM latest_versions)
  ),
  duplicate_active_identities AS (
    SELECT COUNT(*) AS groups
      FROM (
        SELECT owner_key, type, COALESCE(scope, '') AS scope_key, name_key
          FROM public.presets_v2
         WHERE deleted_at IS NULL
         GROUP BY owner_key, type, COALESCE(scope, ''), name_key
        HAVING COUNT(*) > 1
      ) duplicates
  ),
  orphan_payloads AS (
    WITH referenced_hashes AS (
      SELECT override_hash AS hash FROM public.preset_versions_v2 WHERE override_hash IS NOT NULL
      UNION
      SELECT metadata_hash FROM public.preset_versions_v2 WHERE metadata_hash IS NOT NULL
      UNION
      SELECT patch_from_prev_hash FROM public.preset_versions_v2 WHERE patch_from_prev_hash IS NOT NULL
      UNION
      SELECT resolved_hash FROM public.preset_versions_v2 WHERE resolved_hash IS NOT NULL
      UNION
      SELECT override_hash FROM public.preset_version_refs_v2 WHERE override_hash IS NOT NULL
      UNION
      SELECT latest_resolved_hash FROM public.presets_v2 WHERE latest_resolved_hash IS NOT NULL
      UNION
      SELECT latest_metadata_hash FROM public.presets_v2 WHERE latest_metadata_hash IS NOT NULL
    )
    SELECT COUNT(*) AS count,
           COALESCE(SUM(payload.payload_bytes), 0) AS bytes
      FROM public.preset_payloads_v2 payload
      LEFT JOIN referenced_hashes refs USING (hash)
     WHERE refs.hash IS NULL
  ),
  purge_candidates AS (
    SELECT
      COUNT(*) FILTER (
        WHERE deleted_at <= now() - private_retention
          AND visibility = 'private'
          AND NOT ('system' = ANY(tags) OR 'factory' = ANY(tags) OR visibility = 'featured')
      ) AS private_count,
      COUNT(*) FILTER (
        WHERE deleted_at <= now() - public_retention
          AND (visibility IN ('public', 'featured') OR 'system' = ANY(tags) OR 'factory' = ANY(tags))
      ) AS protected_count
    FROM public.presets_v2
    WHERE deleted_at IS NOT NULL
  )
  SELECT jsonb_build_object(
    'fixed_refs_to_convert', fixed_refs.count,
    'historical_resolved_cache_rows', historical_resolved.count,
    'historical_resolved_cache_bytes', historical_resolved.bytes,
    'duplicate_active_logical_identity_groups', duplicate_active_identities.groups,
    'orphan_payload_rows', orphan_payloads.count,
    'orphan_payload_bytes', orphan_payloads.bytes,
    'private_recycled_purge_candidates', purge_candidates.private_count,
    'protected_recycled_purge_candidates', purge_candidates.protected_count
  )
  FROM fixed_refs, historical_resolved, duplicate_active_identities, orphan_payloads, purge_candidates;
$$;

CREATE OR REPLACE FUNCTION public.kessho_run_preset_storage_maintenance_v2(
  dry_run_mode BOOLEAN DEFAULT TRUE,
  orphan_payload_limit INTEGER DEFAULT 1000
)
RETURNS TABLE (
  dry_run BOOLEAN,
  refs_converted BIGINT,
  historical_resolved_caches_cleared BIGINT,
  orphan_payloads_deleted BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  converted_count BIGINT := 0;
  cleared_count BIGINT := 0;
  deleted_payload_count BIGINT := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('kessho_preset_storage_maintenance_v2')) THEN
    RETURN QUERY SELECT dry_run_mode, 0::BIGINT, 0::BIGINT, 0::BIGINT;
    RETURN;
  END IF;

  IF dry_run_mode THEN
    SELECT COUNT(*)
      INTO converted_count
      FROM public.preset_version_refs_v2
     WHERE follow_latest IS DISTINCT FROM TRUE
        OR target_version_no IS NOT NULL;

    SELECT COUNT(*)
      INTO cleared_count
      FROM public.preset_versions_v2 version
     WHERE version.resolved_hash IS NOT NULL
       AND version.id NOT IN (
         SELECT latest_version_id
           FROM public.presets_v2
          WHERE latest_version_id IS NOT NULL
       );

    WITH referenced_hashes AS (
      SELECT override_hash AS hash FROM public.preset_versions_v2 WHERE override_hash IS NOT NULL
      UNION
      SELECT metadata_hash FROM public.preset_versions_v2 WHERE metadata_hash IS NOT NULL
      UNION
      SELECT patch_from_prev_hash FROM public.preset_versions_v2 WHERE patch_from_prev_hash IS NOT NULL
      UNION
      SELECT resolved_hash FROM public.preset_versions_v2 WHERE resolved_hash IS NOT NULL
      UNION
      SELECT override_hash FROM public.preset_version_refs_v2 WHERE override_hash IS NOT NULL
      UNION
      SELECT latest_resolved_hash FROM public.presets_v2 WHERE latest_resolved_hash IS NOT NULL
      UNION
      SELECT latest_metadata_hash FROM public.presets_v2 WHERE latest_metadata_hash IS NOT NULL
    )
    SELECT COUNT(*)
      INTO deleted_payload_count
      FROM public.preset_payloads_v2 payload
      LEFT JOIN referenced_hashes refs USING (hash)
     WHERE refs.hash IS NULL;
  ELSE
    UPDATE public.preset_version_refs_v2
       SET follow_latest = TRUE,
           target_version_no = NULL
     WHERE follow_latest IS DISTINCT FROM TRUE
        OR target_version_no IS NOT NULL;
    GET DIAGNOSTICS converted_count = ROW_COUNT;

    UPDATE public.preset_versions_v2 version
       SET resolved_hash = NULL
     WHERE version.resolved_hash IS NOT NULL
       AND version.id NOT IN (
         SELECT latest_version_id
           FROM public.presets_v2
          WHERE latest_version_id IS NOT NULL
       );
    GET DIAGNOSTICS cleared_count = ROW_COUNT;

    WITH referenced_hashes AS (
      SELECT override_hash AS hash FROM public.preset_versions_v2 WHERE override_hash IS NOT NULL
      UNION
      SELECT metadata_hash FROM public.preset_versions_v2 WHERE metadata_hash IS NOT NULL
      UNION
      SELECT patch_from_prev_hash FROM public.preset_versions_v2 WHERE patch_from_prev_hash IS NOT NULL
      UNION
      SELECT resolved_hash FROM public.preset_versions_v2 WHERE resolved_hash IS NOT NULL
      UNION
      SELECT override_hash FROM public.preset_version_refs_v2 WHERE override_hash IS NOT NULL
      UNION
      SELECT latest_resolved_hash FROM public.presets_v2 WHERE latest_resolved_hash IS NOT NULL
      UNION
      SELECT latest_metadata_hash FROM public.presets_v2 WHERE latest_metadata_hash IS NOT NULL
    ),
    candidates AS (
      SELECT payload.hash
        FROM public.preset_payloads_v2 payload
        LEFT JOIN referenced_hashes refs USING (hash)
       WHERE refs.hash IS NULL
       ORDER BY payload.last_seen_at ASC, payload.created_at ASC
       LIMIT GREATEST(orphan_payload_limit, 0)
    )
    DELETE FROM public.preset_payloads_v2 payload
     USING candidates
     WHERE payload.hash = candidates.hash;
    GET DIAGNOSTICS deleted_payload_count = ROW_COUNT;
  END IF;

  RETURN QUERY SELECT dry_run_mode, converted_count, cleared_count, deleted_payload_count;
END;
$$;

COMMIT;
