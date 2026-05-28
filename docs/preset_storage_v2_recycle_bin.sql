-- Preset Storage V2 recycle bin patch.
--
-- Run after docs/preset_storage_v2.sql on existing Supabase projects.
-- Normal app deletion becomes a soft delete: rows are moved into a recycle bin
-- by setting deleted_at/deleted_by. Active queries ignore recycled rows, but
-- referenced recycled child presets remain available by ID so active parent
-- presets can still materialize their relative child graph.
--
-- The scheduled purge hard-deletes only rows that:
-- - have already been soft-deleted,
-- - have been in the recycle bin for at least 30 days,
-- - are not reachable from any active latest preset graph.
--
-- If an expired recycled row is referenced only by historical versions, purge
-- prunes those historical version rows first, then deletes newly unblocked
-- recycled presets in repeated passes.

BEGIN;

ALTER TABLE public.presets_v2
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS public.idx_presets_v2_owner_type_scope_name;
CREATE UNIQUE INDEX IF NOT EXISTS idx_presets_v2_owner_type_scope_name_active
  ON public.presets_v2(owner_key, type, COALESCE(scope, ''), name_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_presets_v2_owner_type_scope_name_deleted
  ON public.presets_v2(owner_key, type, COALESCE(scope, ''), name_key)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_presets_v2_deleted_at
  ON public.presets_v2(deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.rollup_latest_version_v2()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.presets_v2
     SET latest_version_no = NEW.version_no,
         latest_version_id = NEW.id,
         latest_resolved_hash = NEW.resolved_hash,
         latest_metadata_hash = NEW.metadata_hash,
         updated_at = now()
   WHERE id = NEW.preset_id
     AND latest_version_no <= NEW.version_no;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

WITH latest AS (
  SELECT DISTINCT ON (preset_id)
    preset_id,
    id,
    version_no,
    resolved_hash,
    metadata_hash
  FROM public.preset_versions_v2
  ORDER BY preset_id, version_no DESC, created_at DESC
)
UPDATE public.presets_v2 p
   SET latest_version_no = latest.version_no,
       latest_version_id = latest.id,
       latest_resolved_hash = latest.resolved_hash,
       latest_metadata_hash = latest.metadata_hash
  FROM latest
 WHERE p.id = latest.preset_id
   AND (
     p.latest_version_no IS DISTINCT FROM latest.version_no
     OR p.latest_version_id IS DISTINCT FROM latest.id
     OR p.latest_resolved_hash IS DISTINCT FROM latest.resolved_hash
     OR p.latest_metadata_hash IS DISTINCT FROM latest.metadata_hash
   );

WITH ordered_versions AS (
  SELECT
    id,
    version_no,
    LAG(id) OVER (PARTITION BY preset_id ORDER BY version_no ASC, created_at ASC) AS previous_version_id
  FROM public.preset_versions_v2
)
UPDATE public.preset_versions_v2 v
   SET parent_version_id = ordered_versions.previous_version_id
  FROM ordered_versions
 WHERE v.id = ordered_versions.id
   AND ordered_versions.version_no > 1
   AND v.parent_version_id IS NULL
   AND ordered_versions.previous_version_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.kessho_guard_preset_hard_delete_v2()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.deleted_at IS NULL THEN
    RAISE EXCEPTION 'presets_v2 rows must be moved to the recycle bin before hard delete';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS presets_v2_guard_hard_delete ON public.presets_v2;
CREATE TRIGGER presets_v2_guard_hard_delete
  BEFORE DELETE ON public.presets_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.kessho_guard_preset_hard_delete_v2();

CREATE OR REPLACE FUNCTION public.kessho_guard_preset_recycle_update_v2()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.deleted_at IS DISTINCT FROM NEW.deleted_at
     AND COALESCE(current_setting('app.kessho_allow_preset_recycle_update', TRUE), '') <> 'on' THEN
    RAISE EXCEPTION 'presets_v2 deleted_at can only be changed by recycle-bin functions';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS presets_v2_guard_recycle_update ON public.presets_v2;
CREATE TRIGGER presets_v2_guard_recycle_update
  BEFORE UPDATE OF deleted_at ON public.presets_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.kessho_guard_preset_recycle_update_v2();

CREATE OR REPLACE FUNCTION public.kessho_soft_delete_preset_v2(target_preset_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  target_row public.presets_v2%ROWTYPE;
  blocking_parent_names TEXT[];
  changed_count INTEGER := 0;
BEGIN
  SELECT *
    INTO target_row
    FROM public.presets_v2
   WHERE id = target_preset_id
     AND deleted_at IS NULL
     AND auth.uid() IS NOT NULL
     AND (owner_key = 'public' OR owner_user_id = auth.uid());

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  WITH RECURSIVE active_graph(root_preset_id, preset_id, version_id) AS (
    SELECT p.id, p.id, p.latest_version_id
      FROM public.presets_v2 p
     WHERE p.deleted_at IS NULL
       AND p.latest_version_id IS NOT NULL
    UNION
    SELECT active_graph.root_preset_id, child.id, child.latest_version_id
      FROM active_graph
      JOIN public.preset_version_refs_v2 r ON r.version_id = active_graph.version_id
      JOIN public.presets_v2 child ON child.id = r.target_preset_id
  )
  SELECT ARRAY_AGG(DISTINCT root.name ORDER BY root.name)
    INTO blocking_parent_names
    FROM active_graph
    JOIN public.presets_v2 root ON root.id = active_graph.root_preset_id
   WHERE active_graph.preset_id = target_row.id
     AND active_graph.root_preset_id <> target_row.id;

  IF COALESCE(ARRAY_LENGTH(blocking_parent_names, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Cannot recycle preset "%": active latest presets still reference it (%)',
      target_row.name,
      ARRAY_TO_STRING(blocking_parent_names, ', ');
  END IF;

  PERFORM set_config('app.kessho_allow_preset_recycle_update', 'on', TRUE);

  UPDATE public.presets_v2
     SET deleted_at = COALESCE(deleted_at, now()),
         deleted_by = auth.uid(),
         archived = TRUE
   WHERE id = target_row.id;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.kessho_restore_preset_v2(target_preset_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  target_row public.presets_v2%ROWTYPE;
  changed_count INTEGER := 0;
BEGIN
  SELECT *
    INTO target_row
    FROM public.presets_v2
   WHERE id = target_preset_id
     AND deleted_at IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND (owner_key = 'public' OR owner_user_id = auth.uid());

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.presets_v2 p
     WHERE p.id <> target_row.id
       AND p.deleted_at IS NULL
       AND p.owner_key = target_row.owner_key
       AND p.type = target_row.type
       AND COALESCE(p.scope, '') = COALESCE(target_row.scope, '')
       AND p.name_key = target_row.name_key
  ) THEN
    RAISE EXCEPTION 'Cannot restore preset "%": an active preset with this name already exists', target_row.name;
  END IF;

  PERFORM set_config('app.kessho_allow_preset_recycle_update', 'on', TRUE);

  UPDATE public.presets_v2
     SET deleted_at = NULL,
         deleted_by = NULL,
         archived = FALSE
   WHERE id = target_preset_id;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
) AS $$
DECLARE
  selected_count BIGINT := 0;
  removed_count BIGINT := 0;
  pruned_version_count BIGINT := 0;
  total_selected BIGINT := 0;
  total_removed BIGINT := 0;
  remaining_limit INTEGER := GREATEST(limit_count, 0);
BEGIN
  IF retention < INTERVAL '0 seconds' THEN
    RAISE EXCEPTION 'retention must be non-negative';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS kessho_recycled_preset_purge_candidates (
    id UUID PRIMARY KEY
  ) ON COMMIT DROP;

  LOOP
    IF remaining_limit <= 0 THEN
      EXIT;
    END IF;

    IF NOT dry_run_mode THEN
      WITH RECURSIVE active_graph(preset_id, version_id) AS (
        SELECT p.id, p.latest_version_id
          FROM public.presets_v2 p
         WHERE p.deleted_at IS NULL
           AND p.latest_version_id IS NOT NULL
        UNION
        SELECT child.id, child.latest_version_id
          FROM active_graph g
          JOIN public.preset_version_refs_v2 r ON r.version_id = g.version_id
          JOIN public.presets_v2 child ON child.id = r.target_preset_id
      ),
      historical_versions_to_prune AS (
        SELECT DISTINCT owner_version.id
          FROM public.preset_version_refs_v2 r
          JOIN public.presets_v2 target ON target.id = r.target_preset_id
          JOIN public.preset_versions_v2 owner_version ON owner_version.id = r.version_id
          JOIN public.presets_v2 owner ON owner.id = owner_version.preset_id
          LEFT JOIN active_graph protected_target ON protected_target.preset_id = target.id
          LEFT JOIN active_graph protected_owner_version ON protected_owner_version.version_id = owner_version.id
         WHERE target.deleted_at IS NOT NULL
           AND target.deleted_at <= now() - retention
           AND protected_target.preset_id IS NULL
           AND protected_owner_version.version_id IS NULL
           AND (
             owner.deleted_at IS NULL
             OR owner.deleted_at <= now() - retention
           )
         LIMIT GREATEST(remaining_limit * 10, 100)
      )
      DELETE FROM public.preset_versions_v2 v
       USING historical_versions_to_prune doomed
       WHERE v.id = doomed.id;

      GET DIAGNOSTICS pruned_version_count = ROW_COUNT;
    END IF;

    TRUNCATE kessho_recycled_preset_purge_candidates;

    WITH RECURSIVE active_graph(preset_id, version_id) AS (
      SELECT p.id, p.latest_version_id
        FROM public.presets_v2 p
       WHERE p.deleted_at IS NULL
         AND p.latest_version_id IS NOT NULL
      UNION
      SELECT child.id, child.latest_version_id
        FROM active_graph g
        JOIN public.preset_version_refs_v2 r ON r.version_id = g.version_id
        JOIN public.presets_v2 child ON child.id = r.target_preset_id
    )
    INSERT INTO kessho_recycled_preset_purge_candidates(id)
    SELECT p.id
      FROM public.presets_v2 p
      LEFT JOIN active_graph protected ON protected.preset_id = p.id
     WHERE p.deleted_at IS NOT NULL
       AND p.deleted_at <= now() - retention
       AND protected.preset_id IS NULL
       AND NOT EXISTS (
             SELECT 1
               FROM public.preset_version_refs_v2 r
              WHERE r.target_preset_id = p.id
           )
     ORDER BY p.deleted_at ASC, p.created_at ASC
     LIMIT remaining_limit;

    SELECT COUNT(*) INTO selected_count
      FROM kessho_recycled_preset_purge_candidates;

    total_selected := total_selected + selected_count;

    IF dry_run_mode OR selected_count = 0 THEN
      EXIT;
    END IF;

    DELETE FROM public.presets_v2 p
     USING kessho_recycled_preset_purge_candidates c
     WHERE p.id = c.id;

    GET DIAGNOSTICS removed_count = ROW_COUNT;
    total_removed := total_removed + removed_count;
    remaining_limit := remaining_limit - removed_count;

    EXIT WHEN (removed_count = 0 AND pruned_version_count = 0) OR remaining_limit <= 0;
  END LOOP;

  RETURN QUERY
  WITH RECURSIVE active_graph(preset_id, version_id) AS (
    SELECT p.id, p.latest_version_id
      FROM public.presets_v2 p
     WHERE p.deleted_at IS NULL
       AND p.latest_version_id IS NOT NULL
    UNION
    SELECT child.id, child.latest_version_id
      FROM active_graph g
      JOIN public.preset_version_refs_v2 r ON r.version_id = g.version_id
      JOIN public.presets_v2 child ON child.id = r.target_preset_id
  )
  SELECT
    dry_run_mode,
    total_selected,
    total_removed,
    (
      SELECT COUNT(*)
        FROM public.presets_v2 p
       WHERE p.deleted_at IS NOT NULL
         AND p.deleted_at <= now() - retention
         AND (
           EXISTS (
             SELECT 1
               FROM active_graph protected
              WHERE protected.preset_id = p.id
           )
           OR EXISTS (
             SELECT 1
               FROM public.preset_version_refs_v2 r
              WHERE r.target_preset_id = p.id
           )
         )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP POLICY IF EXISTS "presets_v2_read_shared_or_own" ON public.presets_v2;
CREATE POLICY "presets_v2_read_shared_or_own" ON public.presets_v2
  FOR SELECT USING (
    (
      deleted_at IS NULL
      AND (
        visibility IN ('public', 'featured')
        OR auth.uid() = owner_user_id
        OR (
          auth.uid() IS NOT NULL
          AND 'internal-derived' = ANY(tags)
        )
      )
    )
    OR (
      deleted_at IS NOT NULL
      AND auth.uid() IS NOT NULL
      AND (owner_key = 'public' OR auth.uid() = owner_user_id)
    )
  );

CREATE OR REPLACE FUNCTION public.kessho_prune_internal_derived_v2()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
  total_deleted INTEGER := 0;
BEGIN
  PERFORM set_config('app.kessho_allow_preset_recycle_update', 'on', TRUE);

  LOOP
    UPDATE public.presets_v2 p
       SET deleted_at = COALESCE(p.deleted_at, now()),
           deleted_by = NULL,
           archived = TRUE
     WHERE 'internal-derived' = ANY(p.tags)
       AND p.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.preset_version_refs_v2 r
         WHERE r.target_preset_id = p.id
       );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;
    EXIT WHEN deleted_count = 0;
  END LOOP;

  RETURN total_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  existing_job_id BIGINT;
BEGIN
  SELECT jobid
    INTO existing_job_id
    FROM cron.job
   WHERE jobname = 'kessho-purge-recycled-presets-v2'
   LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'kessho-purge-recycled-presets-v2',
    '17 3 * * *',
    $cron$
      SELECT *
        FROM public.kessho_purge_recycled_presets_v2(
          FALSE,
          INTERVAL '30 days',
          250
        );
    $cron$
  );
END $$;
