-- Harden the shared preset API boundary.
--
-- The app's current product contract is shared editing through anonymous Auth:
-- raw unauthenticated Data API users can read public summaries, but any write
-- must have an Auth user and V2 writes must pass through the atomic save RPC.

BEGIN;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.kessho_save_preset_v2(
  identity_payload JSONB,
  version_payload JSONB,
  payloads_payload JSONB DEFAULT '[]'::jsonb,
  refs_payload JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  target_preset_id UUID := NULLIF(identity_payload->>'id', '')::UUID;
  target_scope TEXT := NULLIF(identity_payload->>'scope', '');
  target_owner_key TEXT := 'public';
  target_type public.preset_level_v2 := NULLIF(identity_payload->>'type', '')::public.preset_level_v2;
  target_name TEXT := NULLIF(identity_payload->>'name', '');
  target_tags TEXT[] := ARRAY[]::TEXT[];
  target_visibility public.preset_visibility_v2 := 'public'::public.preset_visibility_v2;
  target_is_internal_derived BOOLEAN := FALSE;
  target_version_no INTEGER := NULLIF(version_payload->>'version_no', '')::INTEGER;
  version_created_at TIMESTAMPTZ := COALESCE(NULLIF(version_payload->>'created_at', '')::TIMESTAMPTZ, now());
  preset_row public.presets_v2%ROWTYPE;
  version_row public.preset_versions_v2%ROWTYPE;
  payload_row JSONB;
  ref_row JSONB;
  ref_target_id UUID;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to save presets';
  END IF;

  IF target_type IS NULL THEN
    RAISE EXCEPTION 'Preset type is required';
  END IF;

  IF target_name IS NULL THEN
    RAISE EXCEPTION 'Preset name is required';
  END IF;

  IF target_version_no IS NULL OR target_version_no < 1 THEN
    RAISE EXCEPTION 'Preset version_no must be >= 1';
  END IF;

  IF identity_payload ? 'tags' AND jsonb_typeof(identity_payload->'tags') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Preset tags must be an array';
  END IF;

  target_tags := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(identity_payload->'tags', '[]'::jsonb))),
    ARRAY[]::TEXT[]
  );
  target_is_internal_derived := target_name LIKE '__derived__/%' OR 'internal-derived' = ANY(target_tags);
  target_visibility := COALESCE(
    NULLIF(identity_payload->>'visibility', '')::public.preset_visibility_v2,
    'public'::public.preset_visibility_v2
  );

  IF target_visibility = 'private'::public.preset_visibility_v2 AND NOT target_is_internal_derived THEN
    target_visibility := 'public'::public.preset_visibility_v2;
  END IF;

  IF jsonb_typeof(payloads_payload) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'payloads_payload must be an array';
  END IF;

  IF jsonb_typeof(refs_payload) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'refs_payload must be an array';
  END IF;

  FOR payload_row IN SELECT value FROM jsonb_array_elements(payloads_payload)
  LOOP
    IF payload_row->>'hash' IS NULL OR payload_row->>'hash' !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'Invalid preset payload hash';
    END IF;

    IF payload_row->>'payload_kind' NOT IN ('override', 'metadata', 'resolved', 'patch', 'refs_override') THEN
      RAISE EXCEPTION 'Invalid preset payload kind: %', payload_row->>'payload_kind';
    END IF;

    INSERT INTO public.preset_payloads_v2(hash, payload_kind, payload)
    VALUES (
      payload_row->>'hash',
      payload_row->>'payload_kind',
      COALESCE(payload_row->'payload', '{}'::jsonb)
    )
    ON CONFLICT (hash) DO UPDATE
      SET last_seen_at = now();
  END LOOP;

  IF target_preset_id IS NOT NULL THEN
    SELECT *
      INTO preset_row
      FROM public.presets_v2
     WHERE id = target_preset_id
       AND deleted_at IS NULL
       AND owner_key = target_owner_key
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Preset % does not exist, is recycled, or is not in the shared namespace', target_preset_id;
    END IF;
  ELSE
    SELECT *
      INTO preset_row
      FROM public.presets_v2
     WHERE deleted_at IS NULL
       AND owner_key = target_owner_key
       AND type = target_type
       AND COALESCE(scope, '') = COALESCE(target_scope, '')
       AND name_key = lower(btrim(target_name))
     ORDER BY updated_at DESC
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF FOUND THEN
    UPDATE public.presets_v2
       SET owner_key = target_owner_key,
           owner_user_id = NULL,
           type = target_type,
           scope = target_scope,
           name = target_name,
           author = COALESCE(NULLIF(identity_payload->>'author', ''), author),
           library = COALESCE(NULLIF(identity_payload->>'library', '')::public.preset_library_v2, library),
           creator = identity_payload->>'creator',
           description = identity_payload->>'description',
           tags = target_tags,
           visibility = target_visibility,
           family_name = identity_payload->>'family_name',
           variant_name = identity_payload->>'variant_name',
           variant_rank = NULLIF(identity_payload->>'variant_rank', '')::INTEGER,
           forked_from = NULLIF(identity_payload->>'forked_from', '')::UUID,
           rating = NULLIF(identity_payload->>'rating', '')::SMALLINT
     WHERE id = preset_row.id
     RETURNING * INTO preset_row;
  ELSE
    INSERT INTO public.presets_v2(
      owner_key,
      owner_user_id,
      type,
      scope,
      name,
      author,
      library,
      creator,
      description,
      tags,
      visibility,
      family_name,
      variant_name,
      variant_rank,
      forked_from,
      rating
    )
    VALUES (
      target_owner_key,
      NULL,
      target_type,
      target_scope,
      target_name,
      COALESCE(NULLIF(identity_payload->>'author', ''), 'user'),
      COALESCE(NULLIF(identity_payload->>'library', '')::public.preset_library_v2, 'cloud'::public.preset_library_v2),
      identity_payload->>'creator',
      identity_payload->>'description',
      target_tags,
      target_visibility,
      identity_payload->>'family_name',
      identity_payload->>'variant_name',
      NULLIF(identity_payload->>'variant_rank', '')::INTEGER,
      NULLIF(identity_payload->>'forked_from', '')::UUID,
      NULLIF(identity_payload->>'rating', '')::SMALLINT
    )
    RETURNING * INTO preset_row;
  END IF;

  INSERT INTO public.preset_versions_v2(
    preset_id,
    version_no,
    created_by,
    parent_version_id,
    storage_mode,
    note,
    override_hash,
    metadata_hash,
    patch_from_prev_hash,
    resolved_hash,
    is_checkpoint,
    created_at
  )
  VALUES (
    preset_row.id,
    target_version_no,
    caller_id,
    NULLIF(version_payload->>'parent_version_id', '')::UUID,
    COALESCE(NULLIF(version_payload->>'storage_mode', '')::public.preset_storage_mode_v2, 'patch'::public.preset_storage_mode_v2),
    COALESCE(version_payload->>'note', ''),
    NULLIF(version_payload->>'override_hash', ''),
    NULLIF(version_payload->>'metadata_hash', ''),
    NULLIF(version_payload->>'patch_from_prev_hash', ''),
    NULLIF(version_payload->>'resolved_hash', ''),
    COALESCE((version_payload->>'is_checkpoint')::BOOLEAN, FALSE),
    version_created_at
  )
  RETURNING * INTO version_row;

  FOR ref_row IN SELECT value FROM jsonb_array_elements(refs_payload)
  LOOP
    ref_target_id := NULLIF(ref_row->>'target_preset_id', '')::UUID;

    IF NULLIF(ref_row->>'ref_slot', '') IS NULL THEN
      RAISE EXCEPTION 'Preset ref_slot is required';
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM public.presets_v2 target
       WHERE target.id = ref_target_id
         AND target.deleted_at IS NULL
         AND target.owner_key = target_owner_key
    ) THEN
      RAISE EXCEPTION 'Preset ref target % does not exist, is recycled, or is not shared', ref_row->>'target_preset_id';
    END IF;

    INSERT INTO public.preset_version_refs_v2(
      version_id,
      ref_slot,
      target_preset_id,
      target_version_no,
      follow_latest,
      override_hash,
      created_at
    )
    VALUES (
      version_row.id,
      ref_row->>'ref_slot',
      ref_target_id,
      NULL,
      TRUE,
      NULLIF(ref_row->>'override_hash', ''),
      COALESCE(NULLIF(ref_row->>'created_at', '')::TIMESTAMPTZ, version_created_at)
    );
  END LOOP;

  WITH ranked_versions AS (
    SELECT
      id,
      row_number() OVER (PARTITION BY preset_id ORDER BY version_no DESC, created_at DESC) AS version_rank
    FROM public.preset_versions_v2
    WHERE preset_id = preset_row.id
  ),
  stale_versions AS (
    SELECT id
    FROM ranked_versions
    WHERE version_rank > 5
  )
  DELETE FROM public.preset_versions_v2 version
  USING stale_versions
  WHERE version.id = stale_versions.id;

  RETURN jsonb_build_object(
    'preset', to_jsonb(preset_row),
    'version', to_jsonb(version_row)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_soft_delete_preset_v2(target_preset_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  target_row public.presets_v2%ROWTYPE;
  blocking_parent_names TEXT[];
  changed_count INTEGER := 0;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to recycle presets';
  END IF;

  SELECT *
    INTO target_row
    FROM public.presets_v2
   WHERE id = target_preset_id
     AND deleted_at IS NULL
     AND owner_key = 'public';

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
         deleted_by = caller_id,
         archived = TRUE
   WHERE id = target_row.id;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_plays(preset_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to increment preset plays';
  END IF;

  UPDATE public.presets
     SET plays = COALESCE(plays, 0) + 1
   WHERE id = preset_id;
END;
$$;

ALTER TABLE public.presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presets_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preset_versions_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preset_version_refs_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preset_payloads_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.presets;
DROP POLICY IF EXISTS "Public insert access" ON public.presets;
DROP POLICY IF EXISTS "Public update access" ON public.presets;
DROP POLICY IF EXISTS "Authenticated insert access" ON public.presets;
DROP POLICY IF EXISTS "Authenticated update access" ON public.presets;
DROP POLICY IF EXISTS "presets_legacy_read_public" ON public.presets;
DROP POLICY IF EXISTS "presets_legacy_insert_authenticated" ON public.presets;
DROP POLICY IF EXISTS "presets_legacy_update_authenticated" ON public.presets;

CREATE POLICY "presets_legacy_read_public" ON public.presets
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "presets_legacy_insert_authenticated" ON public.presets
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "presets_legacy_update_authenticated" ON public.presets
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "presets_v2_read_shared_or_own" ON public.presets_v2;
DROP POLICY IF EXISTS "presets_v2_insert_shared_or_own" ON public.presets_v2;
DROP POLICY IF EXISTS "presets_v2_update_shared_or_own" ON public.presets_v2;
DROP POLICY IF EXISTS "preset_versions_v2_read" ON public.preset_versions_v2;
DROP POLICY IF EXISTS "preset_versions_v2_write" ON public.preset_versions_v2;
DROP POLICY IF EXISTS "preset_version_refs_v2_read" ON public.preset_version_refs_v2;
DROP POLICY IF EXISTS "preset_version_refs_v2_write" ON public.preset_version_refs_v2;
DROP POLICY IF EXISTS "preset_payloads_v2_read_testing" ON public.preset_payloads_v2;
DROP POLICY IF EXISTS "preset_payloads_v2_read_authenticated" ON public.preset_payloads_v2;
DROP POLICY IF EXISTS "preset_payloads_v2_insert_testing" ON public.preset_payloads_v2;

CREATE POLICY "presets_v2_read_shared_or_own" ON public.presets_v2
  FOR SELECT
  TO anon, authenticated
  USING (
    (
      deleted_at IS NULL
      AND (
        visibility IN ('public', 'featured')
        OR ((SELECT auth.uid()) IS NOT NULL AND owner_key = 'public')
        OR owner_user_id = (SELECT auth.uid())
      )
    )
    OR (
      deleted_at IS NOT NULL
      AND (SELECT auth.uid()) IS NOT NULL
      AND (
        owner_key = 'public'
        OR owner_user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "preset_versions_v2_read" ON public.preset_versions_v2
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.presets_v2 p
       WHERE p.id = preset_versions_v2.preset_id
         AND p.deleted_at IS NULL
         AND (
           p.visibility IN ('public', 'featured')
           OR ((SELECT auth.uid()) IS NOT NULL AND p.owner_key = 'public')
           OR p.owner_user_id = (SELECT auth.uid())
         )
    )
  );

CREATE POLICY "preset_version_refs_v2_read" ON public.preset_version_refs_v2
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.preset_versions_v2 v
        JOIN public.presets_v2 p ON p.id = v.preset_id
       WHERE v.id = preset_version_refs_v2.version_id
         AND p.deleted_at IS NULL
         AND (
           p.visibility IN ('public', 'featured')
           OR ((SELECT auth.uid()) IS NOT NULL AND p.owner_key = 'public')
           OR p.owner_user_id = (SELECT auth.uid())
         )
    )
  );

CREATE POLICY "preset_payloads_v2_read_authenticated" ON public.preset_payloads_v2
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

GRANT SELECT ON public.presets TO anon, authenticated;
GRANT INSERT, UPDATE ON public.presets TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.presets FROM anon;
REVOKE DELETE ON public.presets FROM authenticated;

GRANT SELECT ON public.presets_v2 TO anon, authenticated;
GRANT SELECT ON public.preset_versions_v2 TO anon, authenticated;
GRANT SELECT ON public.preset_version_refs_v2 TO anon, authenticated;
GRANT SELECT ON public.preset_payloads_v2 TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.presets_v2 FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.preset_versions_v2 FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.preset_version_refs_v2 FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.preset_payloads_v2 FROM anon, authenticated;

GRANT SELECT ON public.preset_summaries_v2 TO anon, authenticated;
GRANT SELECT ON public.legacy_preset_summaries TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.kessho_save_preset_v2(JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kessho_soft_delete_preset_v2(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kessho_soft_delete_legacy_preset(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.increment_plays(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.kessho_save_preset_v2(JSONB, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_soft_delete_preset_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_soft_delete_legacy_preset(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_plays(UUID) TO authenticated;

COMMIT;
