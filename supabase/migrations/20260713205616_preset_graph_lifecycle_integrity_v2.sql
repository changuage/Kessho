BEGIN;

-- A recycled user-visible preset is still a retained root: its latest graph is
-- needed for restore until the root itself is hard-purged. Only hidden rows
-- unreachable from every retained visible root are true garbage.
CREATE OR REPLACE FUNCTION public.kessho_prune_internal_derived_v2()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  PERFORM set_config('app.kessho_allow_preset_recycle_update', 'on', TRUE);

  WITH RECURSIVE retained_visible_graph(preset_id, version_id) AS (
    SELECT preset.id, preset.latest_version_id
      FROM public.presets_v2 preset
     WHERE preset.latest_version_id IS NOT NULL
       AND NOT (
         preset.name LIKE '__derived__/%'
         OR 'internal-derived' = ANY(COALESCE(preset.tags, ARRAY[]::TEXT[]))
       )
    UNION
    SELECT child.id, child.latest_version_id
      FROM retained_visible_graph graph
      JOIN public.preset_version_refs_v2 ref ON ref.version_id = graph.version_id
      JOIN public.presets_v2 child ON child.id = ref.target_preset_id
     WHERE child.latest_version_id IS NOT NULL
  ),
  pruned AS (
    UPDATE public.presets_v2 preset
       SET deleted_at = COALESCE(preset.deleted_at, now()),
           deleted_by = NULL,
           archived = TRUE
     WHERE preset.deleted_at IS NULL
       AND (
         preset.name LIKE '__derived__/%'
         OR 'internal-derived' = ANY(COALESCE(preset.tags, ARRAY[]::TEXT[]))
       )
       AND NOT EXISTS (
         SELECT 1
           FROM retained_visible_graph graph
          WHERE graph.preset_id = preset.id
       )
     RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM pruned;

  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kessho_prune_internal_derived_v2()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_prune_internal_derived_v2()
  TO service_role;

-- Restore is atomic. Hidden implementation descendants are restored with the
-- root; independently visible deleted dependencies must be restored first.
CREATE OR REPLACE FUNCTION public.kessho_restore_preset_v2(target_preset_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  target_row public.presets_v2%ROWTYPE;
  blocking_dependency_names TEXT[];
  conflicting_names TEXT[];
  changed_count INTEGER := 0;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to restore presets';
  END IF;

  SELECT *
    INTO target_row
    FROM public.presets_v2 preset
   WHERE preset.id = target_preset_id
     AND preset.deleted_at IS NOT NULL
     AND (preset.owner_key = 'public' OR preset.owner_user_id = caller_id)
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  WITH RECURSIVE restore_graph(preset_id, version_id) AS (
    SELECT target_row.id, target_row.latest_version_id
    UNION
    SELECT child.id, child.latest_version_id
      FROM restore_graph graph
      JOIN public.preset_version_refs_v2 ref ON ref.version_id = graph.version_id
      JOIN public.presets_v2 child ON child.id = ref.target_preset_id
     WHERE child.latest_version_id IS NOT NULL
  )
  SELECT ARRAY_AGG(DISTINCT dependency.name ORDER BY dependency.name)
    INTO blocking_dependency_names
    FROM restore_graph graph
    JOIN public.presets_v2 dependency ON dependency.id = graph.preset_id
   WHERE dependency.id <> target_row.id
     AND dependency.deleted_at IS NOT NULL
     AND NOT (
       dependency.name LIKE '__derived__/%'
       OR 'internal-derived' = ANY(COALESCE(dependency.tags, ARRAY[]::TEXT[]))
     );

  IF COALESCE(ARRAY_LENGTH(blocking_dependency_names, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Cannot restore preset "%": restore visible dependencies first (%)',
      target_row.name,
      ARRAY_TO_STRING(blocking_dependency_names, ', ');
  END IF;

  WITH RECURSIVE restore_graph(preset_id, version_id) AS (
    SELECT target_row.id, target_row.latest_version_id
    UNION
    SELECT child.id, child.latest_version_id
      FROM restore_graph graph
      JOIN public.preset_version_refs_v2 ref ON ref.version_id = graph.version_id
      JOIN public.presets_v2 child ON child.id = ref.target_preset_id
     WHERE child.latest_version_id IS NOT NULL
  ),
  rows_to_restore AS (
    SELECT candidate.*
      FROM restore_graph graph
      JOIN public.presets_v2 candidate ON candidate.id = graph.preset_id
     WHERE candidate.deleted_at IS NOT NULL
       AND (
         candidate.id = target_row.id
         OR candidate.name LIKE '__derived__/%'
         OR 'internal-derived' = ANY(COALESCE(candidate.tags, ARRAY[]::TEXT[]))
       )
  )
  SELECT ARRAY_AGG(DISTINCT candidate.name ORDER BY candidate.name)
    INTO conflicting_names
    FROM rows_to_restore candidate
   WHERE EXISTS (
     SELECT 1
       FROM public.presets_v2 active
      WHERE active.id <> candidate.id
        AND active.deleted_at IS NULL
        AND active.owner_key = candidate.owner_key
        AND active.type = candidate.type
        AND COALESCE(active.scope, '') = COALESCE(candidate.scope, '')
        AND active.name_key = candidate.name_key
   );

  IF COALESCE(ARRAY_LENGTH(conflicting_names, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Cannot restore preset "%": active logical identities already exist (%)',
      target_row.name,
      ARRAY_TO_STRING(conflicting_names, ', ');
  END IF;

  PERFORM set_config('app.kessho_allow_preset_recycle_update', 'on', TRUE);

  WITH RECURSIVE restore_graph(preset_id, version_id) AS (
    SELECT target_row.id, target_row.latest_version_id
    UNION
    SELECT child.id, child.latest_version_id
      FROM restore_graph graph
      JOIN public.preset_version_refs_v2 ref ON ref.version_id = graph.version_id
      JOIN public.presets_v2 child ON child.id = ref.target_preset_id
     WHERE child.latest_version_id IS NOT NULL
  )
  UPDATE public.presets_v2 preset
     SET deleted_at = NULL,
         deleted_by = NULL,
         archived = FALSE
    FROM restore_graph graph
   WHERE preset.id = graph.preset_id
     AND preset.deleted_at IS NOT NULL
     AND (
       preset.id = target_row.id
       OR preset.name LIKE '__derived__/%'
       OR 'internal-derived' = ANY(COALESCE(preset.tags, ARRAY[]::TEXT[]))
     );

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kessho_restore_preset_v2(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kessho_restore_preset_v2(UUID)
  TO authenticated;

-- ON DELETE SET NULL must not leave a surviving patch row claiming a parent
-- that no longer exists. The loader already treats this row as self-contained;
-- formalize that fallback and release the now-unused patch hash.
CREATE OR REPLACE FUNCTION public.kessho_rebase_orphaned_patch_version_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.parent_version_id IS NOT NULL
     AND NEW.parent_version_id IS NULL
     AND NEW.storage_mode = 'patch' THEN
    NEW.storage_mode = 'checkpoint';
    NEW.patch_from_prev_hash = NULL;
    NEW.is_checkpoint = TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS preset_versions_v2_rebase_orphaned_patch
  ON public.preset_versions_v2;
CREATE TRIGGER preset_versions_v2_rebase_orphaned_patch
  BEFORE UPDATE OF parent_version_id ON public.preset_versions_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.kessho_rebase_orphaned_patch_version_v2();

UPDATE public.preset_versions_v2
   SET storage_mode = 'checkpoint',
       patch_from_prev_hash = NULL,
       is_checkpoint = TRUE
 WHERE version_no > 1
   AND parent_version_id IS NULL
   AND storage_mode = 'patch';

REVOKE EXECUTE ON FUNCTION public.kessho_rebase_orphaned_patch_version_v2()
  FROM PUBLIC, anon, authenticated;

-- Hard-purging a retained root removes its outgoing refs. Re-run hidden graph
-- reachability after the statement so newly unreachable implementation rows
-- enter the recycle bin instead of remaining active forever.
CREATE OR REPLACE FUNCTION public.kessho_prune_internal_after_preset_delete_v2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.kessho_prune_internal_derived_v2();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS presets_v2_prune_internal_after_delete
  ON public.presets_v2;
CREATE TRIGGER presets_v2_prune_internal_after_delete
  AFTER DELETE ON public.presets_v2
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.kessho_prune_internal_after_preset_delete_v2();

REVOKE EXECUTE ON FUNCTION public.kessho_prune_internal_after_preset_delete_v2()
  FROM PUBLIC, anon, authenticated;

-- The legacy purge path previously deleted historical owner versions to break
-- incoming refs. That can sever version ancestry. Purge roots top-down instead;
-- a row with any retained incoming ref is not an orphan and remains protected.
CREATE OR REPLACE FUNCTION public.kessho_purge_recycled_presets_v2(
  dry_run_mode BOOLEAN DEFAULT TRUE,
  retention INTERVAL DEFAULT INTERVAL '30 days',
  limit_count INTEGER DEFAULT 100
)
RETURNS TABLE (
  dry_run BOOLEAN,
  eligible_count BIGINT,
  purged_count BIGINT,
  blocked_by_refs_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_count BIGINT := 0;
  removed_count BIGINT := 0;
  total_selected BIGINT := 0;
  total_removed BIGINT := 0;
  remaining_limit INTEGER := GREATEST(COALESCE(limit_count, 100), 0);
BEGIN
  IF retention < INTERVAL '0 seconds' THEN
    RAISE EXCEPTION 'retention must be non-negative';
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('kessho_preset_lifecycle_v2')) THEN
    RETURN QUERY SELECT dry_run_mode, 0::BIGINT, 0::BIGINT, 0::BIGINT;
    RETURN;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS kessho_recycled_preset_purge_candidates (
    id UUID PRIMARY KEY
  ) ON COMMIT DROP;

  LOOP
    EXIT WHEN remaining_limit <= 0;
    TRUNCATE kessho_recycled_preset_purge_candidates;

    INSERT INTO kessho_recycled_preset_purge_candidates(id)
    SELECT preset.id
      FROM public.presets_v2 preset
     WHERE preset.deleted_at IS NOT NULL
       AND preset.deleted_at <= now() - retention
       AND NOT EXISTS (
         SELECT 1
           FROM public.preset_version_refs_v2 ref
          WHERE ref.target_preset_id = preset.id
       )
     ORDER BY preset.deleted_at ASC, preset.created_at ASC
     LIMIT remaining_limit;

    SELECT COUNT(*) INTO selected_count
      FROM kessho_recycled_preset_purge_candidates;
    total_selected := total_selected + selected_count;

    EXIT WHEN dry_run_mode OR selected_count = 0;

    DELETE FROM public.presets_v2 preset
     USING kessho_recycled_preset_purge_candidates candidate
     WHERE preset.id = candidate.id;

    GET DIAGNOSTICS removed_count = ROW_COUNT;
    total_removed := total_removed + removed_count;
    remaining_limit := remaining_limit - removed_count;
    EXIT WHEN removed_count = 0;
  END LOOP;

  RETURN QUERY
  SELECT
    dry_run_mode,
    total_selected,
    total_removed,
    (
      SELECT COUNT(*)
        FROM public.presets_v2 preset
       WHERE preset.deleted_at IS NOT NULL
         AND preset.deleted_at <= now() - retention
         AND EXISTS (
           SELECT 1
             FROM public.preset_version_refs_v2 ref
            WHERE ref.target_preset_id = preset.id
         )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kessho_purge_recycled_presets_v2(BOOLEAN, INTERVAL, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_purge_recycled_presets_v2(BOOLEAN, INTERVAL, INTEGER)
  TO service_role;

-- Keep the historical API safe for existing automation. Direct content refs
-- are reachability roots, and resolved snapshots stay available to avoid CPU
-- regressions and broken legacy patch chains.
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
  safe_limit INTEGER := LEAST(GREATEST(COALESCE(orphan_payload_limit, 1000), 0), 5000);
  converted_count BIGINT := 0;
  deleted_payload_count BIGINT := 0;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('kessho_preset_storage_maintenance_v2')) THEN
    RETURN QUERY SELECT dry_run_mode, 0::BIGINT, 0::BIGINT, 0::BIGINT;
    RETURN;
  END IF;

  IF dry_run_mode THEN
    SELECT COUNT(*)
      INTO converted_count
      FROM public.preset_version_refs_v2 ref
     WHERE ref.follow_latest IS DISTINCT FROM TRUE
        OR ref.target_version_no IS NOT NULL;

    WITH referenced_hashes AS (
      SELECT override_hash AS hash FROM public.preset_versions_v2 WHERE override_hash IS NOT NULL
      UNION SELECT metadata_hash FROM public.preset_versions_v2 WHERE metadata_hash IS NOT NULL
      UNION SELECT patch_from_prev_hash FROM public.preset_versions_v2 WHERE patch_from_prev_hash IS NOT NULL
      UNION SELECT resolved_hash FROM public.preset_versions_v2 WHERE resolved_hash IS NOT NULL
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

  RETURN QUERY SELECT dry_run_mode, converted_count, 0::BIGINT, deleted_payload_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kessho_run_preset_storage_maintenance_v2(BOOLEAN, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_run_preset_storage_maintenance_v2(BOOLEAN, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.kessho_run_preset_lifecycle_maintenance_v2()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pruned_internal INTEGER := 0;
  purge_result JSONB := '{}'::JSONB;
  storage_result JSONB := '{}'::JSONB;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('kessho_preset_lifecycle_v2')) THEN
    RETURN jsonb_build_object('lock_acquired', FALSE);
  END IF;

  pruned_internal := public.kessho_prune_internal_derived_v2();
  purge_result := public.kessho_purge_deleted_presets_v2(
    FALSE,
    INTERVAL '30 days',
    INTERVAL '180 days',
    500
  );
  SELECT to_jsonb(result)
    INTO storage_result
    FROM public.kessho_run_preset_storage_maintenance_v2(FALSE, 1000) result;

  RETURN jsonb_build_object(
    'lock_acquired', TRUE,
    'pruned_internal_presets', pruned_internal,
    'purge', purge_result,
    'storage', COALESCE(storage_result, '{}'::JSONB)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kessho_run_preset_lifecycle_maintenance_v2()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_run_preset_lifecycle_maintenance_v2()
  TO service_role;

-- Repair previously recycled hidden descendants that are still retained by a
-- visible root. Prefer an already-active same-content identity when available.
WITH RECURSIVE retained_graph(preset_id, version_id) AS (
  SELECT preset.id, preset.latest_version_id
    FROM public.presets_v2 preset
   WHERE preset.latest_version_id IS NOT NULL
     AND NOT (
       preset.name LIKE '__derived__/%'
       OR 'internal-derived' = ANY(COALESCE(preset.tags, ARRAY[]::TEXT[]))
     )
  UNION
  SELECT child.id, child.latest_version_id
    FROM retained_graph graph
    JOIN public.preset_version_refs_v2 ref ON ref.version_id = graph.version_id
    JOIN public.presets_v2 child ON child.id = ref.target_preset_id
   WHERE child.latest_version_id IS NOT NULL
),
replacement AS (
  SELECT DISTINCT ON (deleted.id)
    deleted.id AS deleted_id,
    active.id AS active_id
  FROM retained_graph graph
  JOIN public.presets_v2 deleted ON deleted.id = graph.preset_id
  JOIN public.presets_v2 active
    ON active.id <> deleted.id
   AND active.deleted_at IS NULL
   AND active.owner_key = deleted.owner_key
   AND active.type = deleted.type
   AND COALESCE(active.scope, '') = COALESCE(deleted.scope, '')
   AND active.name_key = deleted.name_key
   AND active.latest_resolved_hash IS NOT DISTINCT FROM deleted.latest_resolved_hash
  WHERE deleted.deleted_at IS NOT NULL
    AND (
      deleted.name LIKE '__derived__/%'
      OR 'internal-derived' = ANY(COALESCE(deleted.tags, ARRAY[]::TEXT[]))
    )
  ORDER BY deleted.id, active.updated_at DESC, active.id
)
UPDATE public.preset_version_refs_v2 ref
   SET target_preset_id = replacement.active_id
  FROM replacement
 WHERE ref.target_preset_id = replacement.deleted_id;

SELECT set_config('app.kessho_allow_preset_recycle_update', 'on', TRUE);

WITH RECURSIVE retained_graph(preset_id, version_id) AS (
  SELECT preset.id, preset.latest_version_id
    FROM public.presets_v2 preset
   WHERE preset.latest_version_id IS NOT NULL
     AND NOT (
       preset.name LIKE '__derived__/%'
       OR 'internal-derived' = ANY(COALESCE(preset.tags, ARRAY[]::TEXT[]))
     )
  UNION
  SELECT child.id, child.latest_version_id
    FROM retained_graph graph
    JOIN public.preset_version_refs_v2 ref ON ref.version_id = graph.version_id
    JOIN public.presets_v2 child ON child.id = ref.target_preset_id
   WHERE child.latest_version_id IS NOT NULL
)
UPDATE public.presets_v2 preset
   SET deleted_at = NULL,
       deleted_by = NULL,
       archived = FALSE
  FROM retained_graph graph
 WHERE preset.id = graph.preset_id
   AND preset.deleted_at IS NOT NULL
   AND (
     preset.name LIKE '__derived__/%'
     OR 'internal-derived' = ANY(COALESCE(preset.tags, ARRAY[]::TEXT[]))
   )
   AND NOT EXISTS (
     SELECT 1
       FROM public.presets_v2 active
      WHERE active.id <> preset.id
        AND active.deleted_at IS NULL
        AND active.owner_key = preset.owner_key
        AND active.type = preset.type
        AND COALESCE(active.scope, '') = COALESCE(preset.scope, '')
        AND active.name_key = preset.name_key
   );

DO $$
DECLARE
  existing_job RECORD;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RETURN;
  END IF;

  FOR existing_job IN
    SELECT jobid
      FROM cron.job
     WHERE jobname IN (
       'kessho-v2-storage-maintenance',
       'kessho-purge-recycled-presets-v2',
       'kessho-v2-lifecycle-maintenance'
     )
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'kessho-v2-lifecycle-maintenance',
    '23 4 1,16 * *',
    'select public.kessho_run_preset_lifecycle_maintenance_v2();'
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
