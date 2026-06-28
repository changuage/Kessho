-- Scope new public user cloud saves by authenticated owner identity while
-- preserving legacy public rows for reads.

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
  target_owner_user_id UUID;
  target_owner_key TEXT;
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

  target_owner_user_id := COALESCE(NULLIF(identity_payload->>'owner_user_id', '')::UUID, caller_id);
  target_owner_key := COALESCE(NULLIF(identity_payload->>'owner_key', ''), 'public:' || target_owner_user_id::TEXT);

  IF target_owner_user_id <> caller_id THEN
    RAISE EXCEPTION 'Preset owner_user_id must match the authenticated user';
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

    PERFORM public.kessho_assert_payload_hash_matches(
      payload_row->>'hash',
      COALESCE(payload_row->'payload', '{}'::jsonb)
    );

    INSERT INTO public.preset_payloads_v2(hash, payload_kind, payload)
    VALUES (
      payload_row->>'hash',
      payload_row->>'payload_kind',
      COALESCE(payload_row->'payload', '{}'::jsonb)
    )
    ON CONFLICT (hash) DO UPDATE
      SET last_seen_at = now()
      WHERE public.preset_payloads_v2.last_seen_at < now() - INTERVAL '7 days';
  END LOOP;

  IF target_preset_id IS NOT NULL THEN
    SELECT *
      INTO preset_row
      FROM public.presets_v2
     WHERE id = target_preset_id
       AND deleted_at IS NULL
       AND owner_key = target_owner_key
       AND owner_user_id = target_owner_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Preset % does not exist, is recycled, or is not owned by the authenticated user', target_preset_id;
    END IF;
  ELSE
    SELECT *
      INTO preset_row
      FROM public.presets_v2
     WHERE deleted_at IS NULL
       AND owner_key = target_owner_key
       AND owner_user_id = target_owner_user_id
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
           owner_user_id = target_owner_user_id,
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
      target_owner_user_id,
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

  PERFORM public.kessho_assert_preset_payload_hashes_exist(ARRAY[
    NULLIF(version_payload->>'override_hash', ''),
    NULLIF(version_payload->>'metadata_hash', ''),
    NULLIF(version_payload->>'patch_from_prev_hash', ''),
    NULLIF(version_payload->>'resolved_hash', '')
  ]);

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
         AND target.owner_user_id = target_owner_user_id
    ) THEN
      RAISE EXCEPTION 'Preset ref target % does not exist, is recycled, or is not owned by the authenticated user', ref_row->>'target_preset_id';
    END IF;

    PERFORM public.kessho_assert_preset_payload_hashes_exist(ARRAY[
      NULLIF(ref_row->>'override_hash', '')
    ]);

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

CREATE OR REPLACE FUNCTION public.kessho_get_preset_card_v2(target_preset_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  preset_row public.presets_v2%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to load preset cards';
  END IF;

  SELECT *
    INTO preset_row
    FROM public.presets_v2 p
   WHERE p.id = target_preset_id
     AND p.deleted_at IS NULL
     AND (
       p.visibility IN ('public', 'featured')
       OR p.owner_key = 'public'
       OR p.owner_user_id = caller_id
     );

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', preset_row.id,
    'owner_key', preset_row.owner_key,
    'owner_user_id', preset_row.owner_user_id,
    'type', preset_row.type,
    'scope', preset_row.scope,
    'name', preset_row.name,
    'author', preset_row.author,
    'library', preset_row.library,
    'creator', preset_row.creator,
    'description', preset_row.description,
    'visibility', preset_row.visibility,
    'latest_version_no', preset_row.latest_version_no,
    'latest_resolved_hash', preset_row.latest_resolved_hash,
    'latest_metadata_hash', preset_row.latest_metadata_hash,
    'play_count', preset_row.play_count,
    'created_at', preset_row.created_at,
    'updated_at', preset_row.updated_at
  );
END;
$$;
