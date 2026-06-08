-- Summary-only views for preset list screens.
--
-- These views are intentionally security invoker views so underlying table
-- RLS remains the authority for row visibility. Base table SELECT grants are
-- intentionally left in place until detail RPCs replace direct detail reads.

BEGIN;

CREATE OR REPLACE VIEW public.preset_summaries_v2
WITH (security_invoker = true)
AS
SELECT
  id,
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
  latest_version_no,
  latest_metadata_hash,
  play_count,
  rating,
  deleted_at,
  created_at,
  updated_at
FROM public.presets_v2
WHERE deleted_at IS NULL
  AND name NOT LIKE '__derived__/%'
  AND NOT ('internal-derived' = ANY(COALESCE(tags, ARRAY[]::TEXT[])));

CREATE OR REPLACE VIEW public.legacy_preset_summaries
WITH (security_invoker = true)
AS
SELECT
  id,
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
  current_version,
  created_at,
  updated_at,
  rating
FROM public.presets
WHERE COALESCE(archived, FALSE) = FALSE
  AND deleted_at IS NULL;

GRANT SELECT ON public.preset_summaries_v2 TO anon, authenticated;
GRANT SELECT ON public.legacy_preset_summaries TO anon, authenticated;

COMMENT ON VIEW public.preset_summaries_v2 IS
  'Summary-only preset V2 rows for list/search screens. Full preset payloads stay behind explicit detail reads.';

COMMENT ON VIEW public.legacy_preset_summaries IS
  'Summary-only legacy preset rows for list/search screens. Excludes inline versions/data payloads.';

-- Planned after detail RPCs are live and verified:
-- REVOKE SELECT ON public.presets_v2 FROM anon, authenticated;
-- REVOKE SELECT ON public.preset_versions_v2 FROM anon, authenticated;
-- REVOKE SELECT ON public.preset_version_refs_v2 FROM anon, authenticated;
-- REVOKE SELECT ON public.preset_payloads_v2 FROM anon, authenticated;
-- REVOKE SELECT ON public.presets FROM anon, authenticated;

COMMIT;
