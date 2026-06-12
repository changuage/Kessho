-- Narrow runtime read RPCs for preset save, export, stats, and reference checks.
--
-- These functions replace browser Data API reads of the wide preset base
-- tables. Summary views remain the list API; detail and runtime helpers are
-- authenticated RPCs with explicit visibility predicates.

BEGIN;

CREATE OR REPLACE FUNCTION public.kessho_lookup_preset_rows_v2(
  target_preset_id UUID DEFAULT NULL,
  target_type TEXT DEFAULT NULL,
  target_name TEXT DEFAULT NULL,
  target_scopes TEXT[] DEFAULT NULL,
  target_scope_is_null BOOLEAN DEFAULT FALSE,
  target_resolved_hash TEXT DEFAULT NULL,
  exclude_preset_id UUID DEFAULT NULL,
  include_deleted BOOLEAN DEFAULT FALSE,
  deleted_only BOOLEAN DEFAULT FALSE,
  include_internal_derived BOOLEAN DEFAULT TRUE,
  internal_derived_only BOOLEAN DEFAULT FALSE,
  max_rows INTEGER DEFAULT 20,
  page_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  safe_limit INTEGER := LEAST(GREATEST(COALESCE(max_rows, 20), 1), 1000);
  safe_offset INTEGER := GREATEST(COALESCE(page_offset, 0), 0);
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to look up preset rows';
  END IF;

  IF target_preset_id IS NULL
     AND target_type IS NULL
     AND target_name IS NULL
     AND target_resolved_hash IS NULL
     AND include_internal_derived THEN
    RAISE EXCEPTION 'A constrained preset lookup filter is required';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.updated_at DESC, row_data.latest_version_no DESC, row_data.created_at DESC)
      FROM (
        SELECT p.*
          FROM public.presets_v2 p
         WHERE (target_preset_id IS NULL OR p.id = target_preset_id)
           AND (target_type IS NULL OR p.type::TEXT = target_type)
           AND (target_name IS NULL OR p.name_key = lower(btrim(target_name)))
           AND (
             (target_scopes IS NULL AND NOT target_scope_is_null)
             OR (target_scope_is_null AND p.scope IS NULL)
             OR (target_scopes IS NOT NULL AND p.scope = ANY(target_scopes))
           )
           AND (target_resolved_hash IS NULL OR p.latest_resolved_hash = target_resolved_hash)
           AND (exclude_preset_id IS NULL OR p.id <> exclude_preset_id)
           AND (
             (deleted_only AND p.deleted_at IS NOT NULL)
             OR (NOT deleted_only AND (include_deleted OR p.deleted_at IS NULL))
           )
           AND (
             include_internal_derived
             OR (
               p.name NOT LIKE '__derived__/%'
               AND NOT ('internal-derived' = ANY(COALESCE(p.tags, ARRAY[]::TEXT[])))
             )
           )
           AND (
             NOT internal_derived_only
             OR p.name LIKE '__derived__/%'
             OR 'internal-derived' = ANY(COALESCE(p.tags, ARRAY[]::TEXT[]))
           )
           AND (
             p.visibility IN ('public', 'featured')
             OR p.owner_key = 'public'
             OR p.owner_user_id = caller_id
           )
         ORDER BY
           CASE WHEN p.owner_user_id = caller_id THEN 0 ELSE 1 END,
           CASE WHEN p.visibility = 'featured' THEN 0 ELSE 1 END,
           p.updated_at DESC,
           p.latest_version_no DESC,
           p.created_at DESC
         LIMIT safe_limit
        OFFSET safe_offset
      ) row_data
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_get_preset_versions_v2(target_preset_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to read preset versions';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.presets_v2 p
     WHERE p.id = target_preset_id
       AND p.deleted_at IS NULL
       AND (
         p.visibility IN ('public', 'featured')
         OR p.owner_key = 'public'
         OR p.owner_user_id = caller_id
       )
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(v) ORDER BY v.version_no ASC)
      FROM public.preset_versions_v2 v
     WHERE v.preset_id = target_preset_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_get_preset_version_ref_keys_v2(target_version_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to read preset refs';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.preset_versions_v2 v
      JOIN public.presets_v2 p ON p.id = v.preset_id
     WHERE v.id = target_version_id
       AND p.deleted_at IS NULL
       AND (
         p.visibility IN ('public', 'featured')
         OR p.owner_key = 'public'
         OR p.owner_user_id = caller_id
       )
  ) THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  RETURN COALESCE((
    SELECT array_agg(
      concat_ws(':', r.ref_slot, r.target_preset_id::TEXT, COALESCE(r.target_version_no::TEXT, 'latest'), COALESCE(r.override_hash, ''))
      ORDER BY r.ref_slot, r.target_preset_id
    )
      FROM public.preset_version_refs_v2 r
     WHERE r.version_id = target_version_id
  ), ARRAY[]::TEXT[]);
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_get_latest_ref_targets_v2(target_version_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to read preset ref targets';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.preset_versions_v2 v
      JOIN public.presets_v2 p ON p.id = v.preset_id
     WHERE v.id = target_version_id
       AND p.deleted_at IS NULL
       AND (
         p.visibility IN ('public', 'featured')
         OR p.owner_key = 'public'
         OR p.owner_user_id = caller_id
       )
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object('ref_slot', r.ref_slot, 'target', to_jsonb(target))
      ORDER BY r.ref_slot
    )
      FROM public.preset_version_refs_v2 r
      JOIN public.presets_v2 target ON target.id = r.target_preset_id
     WHERE r.version_id = target_version_id
       AND target.deleted_at IS NULL
       AND (
         target.visibility IN ('public', 'featured')
         OR target.owner_key = 'public'
         OR target.owner_user_id = caller_id
       )
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_get_preset_payloads_v2(target_hashes TEXT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to read preset payloads';
  END IF;

  IF target_hashes IS NULL OR array_length(target_hashes, 1) IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    WITH visible_presets AS (
      SELECT p.id, p.latest_resolved_hash, p.latest_metadata_hash
        FROM public.presets_v2 p
       WHERE p.deleted_at IS NULL
         AND (
           p.visibility IN ('public', 'featured')
           OR p.owner_key = 'public'
           OR p.owner_user_id = caller_id
         )
    ),
    visible_versions AS (
      SELECT v.*
        FROM public.preset_versions_v2 v
        JOIN visible_presets p ON p.id = v.preset_id
    ),
    allowed_hashes AS (
      SELECT latest_resolved_hash AS hash FROM visible_presets
      UNION
      SELECT latest_metadata_hash FROM visible_presets
      UNION
      SELECT override_hash FROM visible_versions
      UNION
      SELECT metadata_hash FROM visible_versions
      UNION
      SELECT patch_from_prev_hash FROM visible_versions
      UNION
      SELECT resolved_hash FROM visible_versions
      UNION
      SELECT r.override_hash
        FROM public.preset_version_refs_v2 r
        JOIN visible_versions v ON v.id = r.version_id
    )
    SELECT jsonb_agg(to_jsonb(payload) ORDER BY payload.hash)
      FROM public.preset_payloads_v2 payload
     WHERE payload.hash = ANY(target_hashes)
       AND payload.hash IN (SELECT hash FROM allowed_hashes WHERE hash IS NOT NULL)
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_find_preset_references_v2(
  target_type TEXT,
  target_name TEXT
)
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to inspect preset references';
  END IF;

  RETURN COALESCE((
    SELECT array_agg(DISTINCT parent.name ORDER BY parent.name)
      FROM public.presets_v2 target
      JOIN public.preset_version_refs_v2 ref ON ref.target_preset_id = target.id
      JOIN public.preset_versions_v2 parent_version ON parent_version.id = ref.version_id
      JOIN public.presets_v2 parent ON parent.id = parent_version.preset_id
     WHERE target.type::TEXT = target_type
       AND target.name_key = lower(btrim(target_name))
       AND target.deleted_at IS NULL
       AND parent.deleted_at IS NULL
       AND (
         target.visibility IN ('public', 'featured')
         OR target.owner_key = 'public'
         OR target.owner_user_id = caller_id
       )
       AND (
         parent.visibility IN ('public', 'featured')
         OR parent.owner_key = 'public'
         OR parent.owner_user_id = caller_id
       )
  ), ARRAY[]::TEXT[]);
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_get_preset_storage_stats_v2()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  preset_count INTEGER := 0;
  version_count INTEGER := 0;
  ref_count INTEGER := 0;
  payload_count INTEGER := 0;
  payload_bytes BIGINT := 0;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to inspect preset storage';
  END IF;

  WITH visible_presets AS (
    SELECT p.id
      FROM public.presets_v2 p
     WHERE p.deleted_at IS NULL
       AND p.name NOT LIKE '__derived__/%'
       AND NOT ('internal-derived' = ANY(COALESCE(p.tags, ARRAY[]::TEXT[])))
       AND (
         p.visibility IN ('public', 'featured')
         OR p.owner_key = 'public'
         OR p.owner_user_id = caller_id
       )
  ),
  visible_hashes AS (
    SELECT v.override_hash AS hash
      FROM public.preset_versions_v2 v
      JOIN visible_presets p ON p.id = v.preset_id
    UNION
    SELECT v.metadata_hash
      FROM public.preset_versions_v2 v
      JOIN visible_presets p ON p.id = v.preset_id
    UNION
    SELECT v.patch_from_prev_hash
      FROM public.preset_versions_v2 v
      JOIN visible_presets p ON p.id = v.preset_id
    UNION
    SELECT v.resolved_hash
      FROM public.preset_versions_v2 v
      JOIN visible_presets p ON p.id = v.preset_id
    UNION
    SELECT r.override_hash
      FROM public.preset_versions_v2 v
      JOIN visible_presets p ON p.id = v.preset_id
      JOIN public.preset_version_refs_v2 r ON r.version_id = v.id
  )
  SELECT
    (SELECT count(*) FROM visible_presets),
    (SELECT count(*)
       FROM public.preset_versions_v2 v
       JOIN visible_presets p ON p.id = v.preset_id),
    (SELECT count(*)
       FROM public.preset_version_refs_v2 r
       JOIN public.preset_versions_v2 v ON v.id = r.version_id
       JOIN visible_presets p ON p.id = v.preset_id),
    COALESCE((
      SELECT count(*)
        FROM public.preset_payloads_v2 payload
       WHERE payload.hash IN (SELECT hash FROM visible_hashes WHERE hash IS NOT NULL)
    ), 0),
    COALESCE((
      SELECT sum(payload.payload_bytes)
        FROM public.preset_payloads_v2 payload
       WHERE payload.hash IN (SELECT hash FROM visible_hashes WHERE hash IS NOT NULL)
    ), 0)
    INTO preset_count, version_count, ref_count, payload_count, payload_bytes;

  RETURN jsonb_build_object(
    'bytes', payload_bytes,
    'count', preset_count,
    'version_count', version_count,
    'ref_count', ref_count,
    'payload_count', payload_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.kessho_save_legacy_preset(preset_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  target_type TEXT := NULLIF(preset_payload->>'type', '');
  target_scope TEXT := NULLIF(preset_payload->>'scope', '');
  target_name TEXT := NULLIF(preset_payload->>'name', '');
  target_tags TEXT[] := ARRAY[]::TEXT[];
  target_versions JSONB := COALESCE(preset_payload->'versions', '[]'::jsonb);
  target_visibility TEXT := COALESCE(NULLIF(preset_payload->>'visibility', ''), 'public');
  saved_row public.presets%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to save legacy presets';
  END IF;

  IF target_type IS NULL THEN
    RAISE EXCEPTION 'Legacy preset type is required';
  END IF;

  IF target_name IS NULL THEN
    RAISE EXCEPTION 'Legacy preset name is required';
  END IF;

  IF jsonb_typeof(target_versions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Legacy preset versions must be an array';
  END IF;

  target_tags := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(preset_payload->'tags', '[]'::jsonb))),
    ARRAY[]::TEXT[]
  );

  IF target_visibility = 'private' THEN
    target_visibility := 'public';
  END IF;

  SELECT *
    INTO saved_row
    FROM public.presets
   WHERE deleted_at IS NULL
     AND type = target_type
     AND lower(btrim(name)) = lower(btrim(target_name))
     AND COALESCE(scope, '') = COALESCE(target_scope, '')
     AND (user_id = caller_id OR user_id IS NULL)
   ORDER BY CASE WHEN user_id = caller_id THEN 0 ELSE 1 END, updated_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    UPDATE public.presets
       SET user_id = caller_id,
           type = target_type,
           scope = target_scope,
           name = target_name,
           author = COALESCE(NULLIF(preset_payload->>'author', ''), author),
           library = COALESCE(NULLIF(preset_payload->>'library', ''), library),
           creator = preset_payload->>'creator',
           description = preset_payload->>'description',
           tags = target_tags,
           visibility = target_visibility,
           family_name = COALESCE(NULLIF(preset_payload->>'family_name', ''), target_name),
           variant_name = COALESCE(NULLIF(preset_payload->>'variant_name', ''), target_name),
           variant_rank = NULLIF(preset_payload->>'variant_rank', '')::INTEGER,
           plays = COALESCE(NULLIF(preset_payload->>'plays', '')::INTEGER, plays, 0),
           versions = target_versions,
           current_version = COALESCE(NULLIF(preset_payload->>'current_version', '')::INTEGER, GREATEST(jsonb_array_length(target_versions), 1)),
           rating = NULLIF(preset_payload->>'rating', '')::SMALLINT,
           updated_at = now()
     WHERE id = saved_row.id
     RETURNING * INTO saved_row;
  ELSE
    INSERT INTO public.presets(
      user_id,
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
      plays,
      versions,
      current_version,
      rating
    )
    VALUES (
      caller_id,
      target_type,
      target_scope,
      target_name,
      COALESCE(NULLIF(preset_payload->>'author', ''), 'user'),
      COALESCE(NULLIF(preset_payload->>'library', ''), 'cloud'),
      preset_payload->>'creator',
      preset_payload->>'description',
      target_tags,
      target_visibility,
      COALESCE(NULLIF(preset_payload->>'family_name', ''), target_name),
      COALESCE(NULLIF(preset_payload->>'variant_name', ''), target_name),
      NULLIF(preset_payload->>'variant_rank', '')::INTEGER,
      COALESCE(NULLIF(preset_payload->>'plays', '')::INTEGER, 0),
      target_versions,
      COALESCE(NULLIF(preset_payload->>'current_version', '')::INTEGER, GREATEST(jsonb_array_length(target_versions), 1)),
      NULLIF(preset_payload->>'rating', '')::SMALLINT
    )
    RETURNING * INTO saved_row;
  END IF;

  RETURN to_jsonb(saved_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kessho_lookup_preset_rows_v2(UUID, TEXT, TEXT, TEXT[], BOOLEAN, TEXT, UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kessho_get_preset_versions_v2(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kessho_get_preset_version_ref_keys_v2(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kessho_get_latest_ref_targets_v2(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kessho_get_preset_payloads_v2(TEXT[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kessho_find_preset_references_v2(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kessho_get_preset_storage_stats_v2() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.kessho_save_legacy_preset(JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.kessho_lookup_preset_rows_v2(UUID, TEXT, TEXT, TEXT[], BOOLEAN, TEXT, UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_get_preset_versions_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_get_preset_version_ref_keys_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_get_latest_ref_targets_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_get_preset_payloads_v2(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_find_preset_references_v2(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_get_preset_storage_stats_v2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_save_legacy_preset(JSONB) TO authenticated;

COMMENT ON FUNCTION public.kessho_lookup_preset_rows_v2(UUID, TEXT, TEXT, TEXT[], BOOLEAN, TEXT, UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, INTEGER) IS
  'Authenticated constrained lookup API for V2 preset identity, hash, export, and ref resolution paths.';

COMMENT ON FUNCTION public.kessho_save_legacy_preset(JSONB) IS
  'Authenticated legacy preset save API. Replaces browser INSERT/UPDATE access to public.presets.';

COMMIT;
