BEGIN;

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
SET search_path = ''
AS $$
DECLARE
  safe_limit INTEGER := LEAST(GREATEST(COALESCE(orphan_payload_limit, 1000), 0), 5000);
  converted_count BIGINT := 0;
  cleared_count BIGINT := 0;
  deleted_payload_count BIGINT := 0;
BEGIN
  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtext('kessho_preset_storage_maintenance_v2')
  ) THEN
    RETURN QUERY SELECT dry_run_mode, 0::BIGINT, 0::BIGINT, 0::BIGINT;
    RETURN;
  END IF;

  IF dry_run_mode THEN
    SELECT COUNT(*)
      INTO converted_count
      FROM public.preset_version_refs_v2 ref
     WHERE ref.follow_latest IS DISTINCT FROM TRUE
        OR ref.target_version_no IS NOT NULL;

    SELECT COUNT(*)
      INTO cleared_count
      FROM public.preset_versions_v2 version
     WHERE version.resolved_hash IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.presets_v2 preset
          WHERE preset.latest_version_id = version.id
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.preset_version_refs_v2 ref
          WHERE ref.version_id = version.id
       );

    WITH clearable_versions AS (
      SELECT version.id
        FROM public.preset_versions_v2 version
       WHERE version.resolved_hash IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
             FROM public.presets_v2 preset
            WHERE preset.latest_version_id = version.id
         )
         AND NOT EXISTS (
           SELECT 1
             FROM public.preset_version_refs_v2 ref
            WHERE ref.version_id = version.id
         )
    ),
    referenced_hashes AS (
      SELECT override_hash AS hash FROM public.preset_versions_v2 WHERE override_hash IS NOT NULL
      UNION SELECT metadata_hash FROM public.preset_versions_v2 WHERE metadata_hash IS NOT NULL
      UNION SELECT patch_from_prev_hash FROM public.preset_versions_v2 WHERE patch_from_prev_hash IS NOT NULL
      UNION SELECT version.resolved_hash
        FROM public.preset_versions_v2 version
       WHERE version.resolved_hash IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM clearable_versions clearable WHERE clearable.id = version.id
         )
      UNION SELECT override_hash FROM public.preset_version_refs_v2 WHERE override_hash IS NOT NULL
      UNION SELECT content_hash FROM public.preset_version_content_refs_v2
      UNION SELECT latest_resolved_hash FROM public.presets_v2 WHERE latest_resolved_hash IS NOT NULL
      UNION SELECT latest_metadata_hash FROM public.presets_v2 WHERE latest_metadata_hash IS NOT NULL
    )
    SELECT COUNT(*)
      INTO deleted_payload_count
      FROM public.preset_payloads_v2 payload
      LEFT JOIN referenced_hashes refs USING (hash)
     WHERE refs.hash IS NULL;
  ELSE
    UPDATE public.preset_version_refs_v2 ref
       SET follow_latest = TRUE,
           target_version_no = NULL
     WHERE ref.follow_latest IS DISTINCT FROM TRUE
        OR ref.target_version_no IS NOT NULL;
    GET DIAGNOSTICS converted_count = ROW_COUNT;

    UPDATE public.preset_versions_v2 version
       SET resolved_hash = NULL
     WHERE version.resolved_hash IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.presets_v2 preset
          WHERE preset.latest_version_id = version.id
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.preset_version_refs_v2 ref
          WHERE ref.version_id = version.id
       );
    GET DIAGNOSTICS cleared_count = ROW_COUNT;

    PERFORM public.kessho_prune_internal_derived_v2();

    WITH referenced_hashes AS (
      SELECT override_hash AS hash FROM public.preset_versions_v2 WHERE override_hash IS NOT NULL
      UNION SELECT metadata_hash FROM public.preset_versions_v2 WHERE metadata_hash IS NOT NULL
      UNION SELECT patch_from_prev_hash FROM public.preset_versions_v2 WHERE patch_from_prev_hash IS NOT NULL
      UNION SELECT resolved_hash FROM public.preset_versions_v2 WHERE resolved_hash IS NOT NULL
      UNION SELECT override_hash FROM public.preset_version_refs_v2 WHERE override_hash IS NOT NULL
      UNION SELECT content_hash FROM public.preset_version_content_refs_v2
      UNION SELECT latest_resolved_hash FROM public.presets_v2 WHERE latest_resolved_hash IS NOT NULL
      UNION SELECT latest_metadata_hash FROM public.presets_v2 WHERE latest_metadata_hash IS NOT NULL
    ),
    candidates AS (
      SELECT payload.hash
        FROM public.preset_payloads_v2 payload
        LEFT JOIN referenced_hashes refs USING (hash)
       WHERE refs.hash IS NULL
       ORDER BY payload.last_seen_at ASC, payload.created_at ASC
       LIMIT safe_limit
    )
    DELETE FROM public.preset_payloads_v2 payload
     USING candidates
     WHERE payload.hash = candidates.hash;
    GET DIAGNOSTICS deleted_payload_count = ROW_COUNT;
  END IF;

  RETURN QUERY
    SELECT dry_run_mode, converted_count, cleared_count, deleted_payload_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kessho_run_preset_storage_maintenance_v2(BOOLEAN, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_run_preset_storage_maintenance_v2(BOOLEAN, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.kessho_run_preset_storage_maintenance_v2(BOOLEAN, INTEGER) IS
  'Converts refs to latest-only policy, drops only reconstructable historical resolved caches without mutable preset refs, prunes internal derived presets, and deletes unreferenced payloads.';

COMMIT;
