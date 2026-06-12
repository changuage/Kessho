-- Narrow preset detail read RPC.
--
-- This prepares the app for removing browser SELECT access from the wide V2
-- base tables. Summary views remain the list API; this RPC is the detail API.
-- It requires an authenticated Supabase user, which includes anonymous Auth
-- sessions created by the app.

BEGIN;

CREATE OR REPLACE FUNCTION public.kessho_get_preset_detail_v2(
  target_preset_id UUID DEFAULT NULL,
  target_type TEXT DEFAULT NULL,
  target_name TEXT DEFAULT NULL,
  target_scopes TEXT[] DEFAULT NULL,
  target_version_no INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  selected_preset_id UUID;
  preset_json JSONB;
  version_ids UUID[] := ARRAY[]::UUID[];
  target_ids UUID[] := ARRAY[]::UUID[];
  payload_hashes TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to load preset details';
  END IF;

  IF target_preset_id IS NULL AND (target_type IS NULL OR NULLIF(target_name, '') IS NULL) THEN
    RAISE EXCEPTION 'target_preset_id or target_type/target_name is required';
  END IF;

  WITH candidate AS (
    SELECT p.*
      FROM public.presets_v2 p
     WHERE p.deleted_at IS NULL
       AND (
         (target_preset_id IS NOT NULL AND p.id = target_preset_id)
         OR (
           target_preset_id IS NULL
           AND p.type::TEXT = target_type
           AND p.name_key = lower(btrim(target_name))
           AND (
             (target_scopes IS NULL AND p.scope IS NULL)
             OR (target_scopes IS NOT NULL AND p.scope = ANY(target_scopes))
           )
         )
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
     LIMIT 1
  )
  SELECT
    c.id,
    jsonb_build_object(
      'id', c.id,
      'owner_key', c.owner_key,
      'owner_user_id', c.owner_user_id,
      'type', c.type,
      'scope', c.scope,
      'name', c.name,
      'author', c.author,
      'library', c.library,
      'creator', c.creator,
      'description', c.description,
      'tags', c.tags,
      'visibility', c.visibility,
      'family_name', c.family_name,
      'variant_name', c.variant_name,
      'variant_rank', c.variant_rank,
      'forked_from', c.forked_from,
      'latest_version_no', c.latest_version_no,
      'latest_version_id', c.latest_version_id,
      'latest_resolved_hash', c.latest_resolved_hash,
      'latest_metadata_hash', c.latest_metadata_hash,
      'play_count', c.play_count,
      'rating', c.rating,
      'archived', c.archived,
      'deleted_at', c.deleted_at,
      'deleted_by', c.deleted_by,
      'created_at', c.created_at,
      'updated_at', c.updated_at
    )
    INTO selected_preset_id, preset_json
    FROM candidate c;

  IF selected_preset_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(array_agg(v.id ORDER BY v.version_no ASC), ARRAY[]::UUID[])
    INTO version_ids
    FROM public.preset_versions_v2 v
   WHERE v.preset_id = selected_preset_id
     AND (target_version_no IS NULL OR v.version_no <= target_version_no);

  SELECT COALESCE(array_agg(DISTINCT r.target_preset_id), ARRAY[]::UUID[])
    INTO target_ids
    FROM public.preset_version_refs_v2 r
   WHERE r.version_id = ANY(version_ids);

  WITH hashes AS (
    SELECT v.override_hash AS hash
      FROM public.preset_versions_v2 v
     WHERE v.id = ANY(version_ids)
    UNION
    SELECT v.metadata_hash AS hash
      FROM public.preset_versions_v2 v
     WHERE v.id = ANY(version_ids)
    UNION
    SELECT v.patch_from_prev_hash AS hash
      FROM public.preset_versions_v2 v
     WHERE v.id = ANY(version_ids)
    UNION
    SELECT v.resolved_hash AS hash
      FROM public.preset_versions_v2 v
     WHERE v.id = ANY(version_ids)
    UNION
    SELECT r.override_hash AS hash
      FROM public.preset_version_refs_v2 r
     WHERE r.version_id = ANY(version_ids)
    UNION
    SELECT target.latest_resolved_hash AS hash
      FROM public.presets_v2 target
     WHERE target.id = ANY(target_ids)
       AND target.deleted_at IS NULL
       AND (
         target.visibility IN ('public', 'featured')
         OR target.owner_key = 'public'
         OR target.owner_user_id = caller_id
       )
  )
  SELECT COALESCE(array_agg(DISTINCT hash) FILTER (WHERE hash IS NOT NULL), ARRAY[]::TEXT[])
    INTO payload_hashes
    FROM hashes;

  RETURN jsonb_build_object(
    'preset', preset_json,
    'versions', COALESCE((
      SELECT jsonb_agg(to_jsonb(v) ORDER BY v.version_no ASC)
        FROM public.preset_versions_v2 v
       WHERE v.id = ANY(version_ids)
    ), '[]'::jsonb),
    'refs', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.version_id, r.ref_slot)
        FROM public.preset_version_refs_v2 r
       WHERE r.version_id = ANY(version_ids)
    ), '[]'::jsonb),
    'targetPresets', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', target.id,
          'owner_key', target.owner_key,
          'owner_user_id', target.owner_user_id,
          'type', target.type,
          'scope', target.scope,
          'name', target.name,
          'author', target.author,
          'library', target.library,
          'creator', target.creator,
          'description', target.description,
          'tags', target.tags,
          'visibility', target.visibility,
          'family_name', target.family_name,
          'variant_name', target.variant_name,
          'variant_rank', target.variant_rank,
          'forked_from', target.forked_from,
          'latest_version_no', target.latest_version_no,
          'latest_version_id', target.latest_version_id,
          'latest_resolved_hash', target.latest_resolved_hash,
          'latest_metadata_hash', target.latest_metadata_hash,
          'play_count', target.play_count,
          'rating', target.rating,
          'archived', target.archived,
          'deleted_at', target.deleted_at,
          'deleted_by', target.deleted_by,
          'created_at', target.created_at,
          'updated_at', target.updated_at
        )
        ORDER BY target.id
      )
        FROM public.presets_v2 target
       WHERE target.id = ANY(target_ids)
         AND target.deleted_at IS NULL
         AND (
           target.visibility IN ('public', 'featured')
           OR target.owner_key = 'public'
           OR target.owner_user_id = caller_id
         )
    ), '[]'::jsonb),
    'payloads', COALESCE((
      SELECT jsonb_agg(to_jsonb(payload) ORDER BY payload.hash)
        FROM public.preset_payloads_v2 payload
       WHERE payload.hash = ANY(payload_hashes)
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kessho_get_preset_detail_v2(UUID, TEXT, TEXT, TEXT[], INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kessho_get_preset_detail_v2(UUID, TEXT, TEXT, TEXT[], INTEGER) TO authenticated;

COMMENT ON FUNCTION public.kessho_get_preset_detail_v2(UUID, TEXT, TEXT, TEXT[], INTEGER) IS
  'Authenticated narrow detail API for V2 presets. Replaces browser reads of presets_v2, preset_versions_v2, preset_version_refs_v2, and preset_payloads_v2 for preset load paths.';

CREATE OR REPLACE FUNCTION public.kessho_get_legacy_preset_detail(
  target_preset_id UUID DEFAULT NULL,
  target_type TEXT DEFAULT NULL,
  target_name TEXT DEFAULT NULL,
  target_scopes TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  result_row JSONB;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to load legacy preset details';
  END IF;

  IF target_preset_id IS NULL AND (target_type IS NULL OR NULLIF(target_name, '') IS NULL) THEN
    RAISE EXCEPTION 'target_preset_id or target_type/target_name is required';
  END IF;

  SELECT to_jsonb(p)
    INTO result_row
    FROM public.presets p
   WHERE COALESCE(p.archived, FALSE) = FALSE
     AND p.deleted_at IS NULL
     AND (
       (target_preset_id IS NOT NULL AND p.id = target_preset_id)
       OR (
         target_preset_id IS NULL
         AND p.type = target_type
         AND lower(btrim(p.name)) = lower(btrim(target_name))
         AND (
           (target_scopes IS NULL AND p.scope IS NULL)
           OR (target_scopes IS NOT NULL AND p.scope = ANY(target_scopes))
         )
       )
     )
     AND (
       COALESCE(p.visibility, 'public') IN ('public', 'featured')
       OR p.user_id = caller_id
     )
   ORDER BY
     CASE WHEN p.user_id = caller_id THEN 0 ELSE 1 END,
     CASE WHEN COALESCE(p.visibility, '') = 'featured' THEN 0 ELSE 1 END,
     p.updated_at DESC,
     COALESCE(p.current_version, 0) DESC,
     p.created_at DESC
   LIMIT 1;

  RETURN result_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kessho_get_legacy_preset_detail(UUID, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kessho_get_legacy_preset_detail(UUID, TEXT, TEXT, TEXT[]) TO authenticated;

COMMENT ON FUNCTION public.kessho_get_legacy_preset_detail(UUID, TEXT, TEXT, TEXT[]) IS
  'Authenticated narrow detail API for legacy presets. Replaces browser reads of public.presets rows containing inline data or versions.';

-- Planned after this RPC is applied and verified in production:
-- REVOKE SELECT ON public.presets_v2 FROM anon, authenticated;
-- REVOKE SELECT ON public.preset_versions_v2 FROM anon, authenticated;
-- REVOKE SELECT ON public.preset_version_refs_v2 FROM anon, authenticated;
-- REVOKE SELECT ON public.preset_payloads_v2 FROM anon, authenticated;
-- REVOKE SELECT ON public.presets FROM anon, authenticated;

COMMIT;
