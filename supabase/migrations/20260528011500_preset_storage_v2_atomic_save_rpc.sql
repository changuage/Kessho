-- Atomic V2 preset save RPC.
--
-- This makes payload insertion, logical preset upsert, version insert, ref
-- insert, and latest rollup one transaction. If any ref insert fails, the
-- version row and latest pointer roll back with it.

BEGIN;

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
  target_preset_id UUID := NULLIF(identity_payload->>'id', '')::UUID;
  target_scope TEXT := NULLIF(identity_payload->>'scope', '');
  target_owner_key TEXT := COALESCE(NULLIF(identity_payload->>'owner_key', ''), 'public');
  target_type public.preset_level_v2 := (identity_payload->>'type')::public.preset_level_v2;
  target_name TEXT := NULLIF(identity_payload->>'name', '');
  preset_row public.presets_v2%ROWTYPE;
  version_row public.preset_versions_v2%ROWTYPE;
  payload_row JSONB;
  ref_row JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to save presets';
  END IF;

  IF target_name IS NULL THEN
    RAISE EXCEPTION 'Preset name is required';
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
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Preset % does not exist or is recycled', target_preset_id;
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
           owner_user_id = COALESCE(NULLIF(identity_payload->>'owner_user_id', '')::UUID, owner_user_id),
           type = target_type,
           scope = target_scope,
           name = target_name,
           author = COALESCE(NULLIF(identity_payload->>'author', ''), author),
           library = COALESCE(NULLIF(identity_payload->>'library', '')::public.preset_library_v2, library),
           creator = identity_payload->>'creator',
           description = identity_payload->>'description',
           tags = COALESCE(
             ARRAY(SELECT jsonb_array_elements_text(identity_payload->'tags')),
             tags
           ),
           visibility = COALESCE(NULLIF(identity_payload->>'visibility', '')::public.preset_visibility_v2, visibility),
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
      NULLIF(identity_payload->>'owner_user_id', '')::UUID,
      target_type,
      target_scope,
      target_name,
      COALESCE(NULLIF(identity_payload->>'author', ''), 'user'),
      COALESCE(NULLIF(identity_payload->>'library', '')::public.preset_library_v2, 'cloud'::public.preset_library_v2),
      identity_payload->>'creator',
      identity_payload->>'description',
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(identity_payload->'tags')), '{}'::TEXT[]),
      COALESCE(NULLIF(identity_payload->>'visibility', '')::public.preset_visibility_v2, 'private'::public.preset_visibility_v2),
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
    (version_payload->>'version_no')::INTEGER,
    NULLIF(version_payload->>'created_by', '')::UUID,
    NULLIF(version_payload->>'parent_version_id', '')::UUID,
    COALESCE(NULLIF(version_payload->>'storage_mode', '')::public.preset_storage_mode_v2, 'patch'::public.preset_storage_mode_v2),
    COALESCE(version_payload->>'note', ''),
    NULLIF(version_payload->>'override_hash', ''),
    NULLIF(version_payload->>'metadata_hash', ''),
    NULLIF(version_payload->>'patch_from_prev_hash', ''),
    NULLIF(version_payload->>'resolved_hash', ''),
    COALESCE((version_payload->>'is_checkpoint')::BOOLEAN, FALSE),
    COALESCE(NULLIF(version_payload->>'created_at', '')::TIMESTAMPTZ, now())
  )
  RETURNING * INTO version_row;

  FOR ref_row IN SELECT value FROM jsonb_array_elements(refs_payload)
  LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM public.presets_v2 target
       WHERE target.id = NULLIF(ref_row->>'target_preset_id', '')::UUID
         AND target.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Preset ref target % does not exist or is recycled', ref_row->>'target_preset_id';
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
      NULLIF(ref_row->>'target_preset_id', '')::UUID,
      NULL,
      TRUE,
      NULLIF(ref_row->>'override_hash', ''),
      COALESCE(NULLIF(ref_row->>'created_at', '')::TIMESTAMPTZ, version_row.created_at)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'preset', to_jsonb(preset_row),
    'version', to_jsonb(version_row)
  );
END;
$$;

COMMIT;
