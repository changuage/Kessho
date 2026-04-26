-- Patch for existing V2 installs: hidden derived child presets.
--
-- Run this after docs/preset_storage_v2.sql has already created the V2 tables.
-- It keeps auto-derived child presets private and hidden from app dropdowns,
-- while still allowing authenticated testers to resolve public presets that
-- reference those hidden children.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_presets_v2_type_scope_hash
  ON public.presets_v2(type, scope, latest_resolved_hash)
  WHERE latest_resolved_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_presets_v2_tags_gin
  ON public.presets_v2 USING gin(tags);

DROP POLICY IF EXISTS "presets_v2_read_shared_or_own" ON public.presets_v2;
CREATE POLICY "presets_v2_read_shared_or_own" ON public.presets_v2
  FOR SELECT USING (
    visibility IN ('public', 'featured')
    OR auth.uid() = owner_user_id
    OR (
      auth.uid() IS NOT NULL
      AND 'internal-derived' = ANY(tags)
    )
  );

CREATE OR REPLACE FUNCTION public.kessho_prune_preset_versions_v2(keep_count INTEGER DEFAULT 5)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  IF keep_count < 1 THEN
    RAISE EXCEPTION 'keep_count must be >= 1';
  END IF;

  WITH ranked AS (
    SELECT
      id,
      row_number() OVER (PARTITION BY preset_id ORDER BY version_no DESC) AS version_rank
    FROM public.preset_versions_v2
  )
  DELETE FROM public.preset_versions_v2 v
  USING ranked r
  WHERE v.id = r.id
    AND r.version_rank > keep_count;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.kessho_prune_internal_derived_v2()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
  total_deleted INTEGER := 0;
BEGIN
  LOOP
    DELETE FROM public.presets_v2 p
    WHERE 'internal-derived' = ANY(p.tags)
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
