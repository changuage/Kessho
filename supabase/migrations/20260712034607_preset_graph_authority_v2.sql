BEGIN;

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
      FROM public.preset_versions_v2 version
      JOIN public.presets_v2 preset ON preset.id = version.preset_id
     WHERE version.id = target_version_id
       AND preset.deleted_at IS NULL
       AND (
         preset.visibility IN ('public', 'featured')
         OR preset.owner_key = 'public'
         OR preset.owner_user_id = caller_id
       )
  ) THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  RETURN COALESCE((
    SELECT array_agg(signature ORDER BY signature)
      FROM (
        SELECT concat_ws(
          ':',
          ref.ref_slot,
          ref.target_preset_id::TEXT,
          COALESCE(ref.target_version_no::TEXT, 'latest'),
          COALESCE(ref.override_hash, '')
        ) AS signature
          FROM public.preset_version_refs_v2 ref
         WHERE ref.version_id = target_version_id
        UNION ALL
        SELECT concat_ws(
          ':',
          'content',
          content_ref.ref_slot,
          content_ref.content_type,
          content_ref.content_hash
        )
          FROM public.preset_version_content_refs_v2 content_ref
         WHERE content_ref.version_id = target_version_id
      ) signatures
  ), ARRAY[]::TEXT[]);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kessho_get_preset_version_ref_keys_v2(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kessho_get_preset_version_ref_keys_v2(UUID)
  TO authenticated;

COMMIT;
