BEGIN;

CREATE OR REPLACE FUNCTION public.kessho_find_journey_state_referrers_v2(
  target_preset_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id UUID := auth.uid();
  requested_state_preset_id UUID := $1;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to inspect journey references';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.presets_v2 target
     WHERE target.id = requested_state_preset_id
       AND target.type::TEXT = 'state'
       AND target.deleted_at IS NULL
       AND (
         target.visibility IN ('public', 'featured')
         OR target.owner_key = 'public'
         OR target.owner_user_id = caller_id
       )
  ) THEN
    RETURN '[]'::JSONB;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', parent.id,
        'name', parent.name,
        'currentVersion', parent.latest_version_no,
        'updatedAtRevision', parent.updated_at::TEXT
      )
      ORDER BY parent.name_key, parent.id
    )
      FROM public.preset_version_refs_v2 ref
      JOIN public.preset_versions_v2 parent_version
        ON parent_version.id = ref.version_id
      JOIN public.presets_v2 parent
        ON parent.id = parent_version.preset_id
       AND parent.latest_version_id = parent_version.id
     WHERE ref.target_preset_id = requested_state_preset_id
       AND parent.type::TEXT = 'journey'
       AND parent.deleted_at IS NULL
       AND (
         parent.visibility IN ('public', 'featured')
         OR parent.owner_key = 'public'
         OR parent.owner_user_id = caller_id
       )
  ), '[]'::JSONB);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kessho_find_journey_state_referrers_v2(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kessho_find_journey_state_referrers_v2(UUID)
  TO authenticated;

COMMENT ON FUNCTION public.kessho_find_journey_state_referrers_v2(UUID) IS
  'Returns visible active journey presets whose current version references the requested active state preset.';

COMMIT;
