BEGIN;

CREATE OR REPLACE FUNCTION public.kessho_update_preset_metadata_v2(
  target_preset_id UUID,
  metadata_payload JSONB,
  expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id UUID := auth.uid();
  target_row public.presets_v2%ROWTYPE;
  target_tags TEXT[];
  unsupported_key TEXT;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to update preset metadata';
  END IF;

  IF jsonb_typeof(metadata_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Preset metadata payload must be an object';
  END IF;

  SELECT key
    INTO unsupported_key
    FROM jsonb_object_keys(metadata_payload) AS key
   WHERE key NOT IN (
     'creator',
     'description',
     'visibility',
     'family_name',
     'variant_name',
     'variant_rank',
     'rating',
     'tags'
   )
   LIMIT 1;

  IF unsupported_key IS NOT NULL THEN
    RAISE EXCEPTION 'Unsupported preset metadata key: %', unsupported_key;
  END IF;

  IF metadata_payload ? 'tags'
     AND jsonb_typeof(metadata_payload->'tags') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Preset tags must be an array';
  END IF;

  IF metadata_payload ? 'tags' THEN
    target_tags := ARRAY(
      SELECT jsonb_array_elements_text(metadata_payload->'tags')
    );
  END IF;

  SELECT *
    INTO target_row
    FROM public.presets_v2 preset
   WHERE preset.id = target_preset_id
     AND preset.deleted_at IS NULL
     AND (
       preset.owner_key = 'public'
       OR preset.owner_user_id = caller_id
     )
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF expected_updated_at IS NOT NULL
     AND target_row.updated_at IS DISTINCT FROM expected_updated_at THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = format(
        'Preset metadata changed concurrently (expected %s, found %s)',
        expected_updated_at,
        target_row.updated_at
      );
  END IF;

  UPDATE public.presets_v2 preset
     SET creator = CASE
           WHEN metadata_payload ? 'creator'
             THEN NULLIF(metadata_payload->>'creator', '')
           ELSE preset.creator
         END,
         description = CASE
           WHEN metadata_payload ? 'description'
             THEN NULLIF(metadata_payload->>'description', '')
           ELSE preset.description
         END,
         visibility = CASE
           WHEN metadata_payload ? 'visibility'
             AND jsonb_typeof(metadata_payload->'visibility') <> 'null'
             THEN (metadata_payload->>'visibility')::public.preset_visibility_v2
           ELSE preset.visibility
         END,
         family_name = CASE
           WHEN metadata_payload ? 'family_name'
             THEN NULLIF(metadata_payload->>'family_name', '')
           ELSE preset.family_name
         END,
         variant_name = CASE
           WHEN metadata_payload ? 'variant_name'
             THEN NULLIF(metadata_payload->>'variant_name', '')
           ELSE preset.variant_name
         END,
         variant_rank = CASE
           WHEN metadata_payload ? 'variant_rank'
             THEN NULLIF(metadata_payload->>'variant_rank', '')::INTEGER
           ELSE preset.variant_rank
         END,
         rating = CASE
           WHEN metadata_payload ? 'rating'
             THEN NULLIF(metadata_payload->>'rating', '')::SMALLINT
           ELSE preset.rating
         END,
         tags = CASE
           WHEN metadata_payload ? 'tags'
             THEN COALESCE(target_tags, ARRAY[]::TEXT[])
           ELSE preset.tags
         END,
         updated_at = now()
   WHERE preset.id = target_row.id
   RETURNING * INTO target_row;

  RETURN to_jsonb(target_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kessho_update_preset_metadata_v2(UUID, JSONB, TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kessho_update_preset_metadata_v2(UUID, JSONB, TIMESTAMPTZ)
  TO authenticated;

COMMENT ON FUNCTION public.kessho_update_preset_metadata_v2(UUID, JSONB, TIMESTAMPTZ) IS
  'Atomically updates the allowlisted identity metadata of an active preset without creating a preset version.';

COMMIT;
