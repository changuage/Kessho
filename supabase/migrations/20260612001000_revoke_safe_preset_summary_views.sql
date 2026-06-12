-- Revoke-safe summary views for preset list screens.
--
-- The earlier summary views used security_invoker=true so table RLS remained
-- the row-visibility authority. That also means revoking base-table SELECT
-- would break the views. These views intentionally use owner-permission reads
-- with explicit visibility predicates so the browser can keep reading narrow
-- summaries after direct base-table SELECT is removed.

BEGIN;

CREATE OR REPLACE VIEW public.preset_summaries_v2
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  p.id,
  p.owner_user_id,
  p.type,
  p.scope,
  p.name,
  p.author,
  p.library,
  p.creator,
  p.description,
  p.tags,
  COALESCE(p.visibility, 'public') AS visibility,
  p.family_name,
  p.variant_name,
  p.variant_rank,
  p.latest_version_no,
  p.latest_metadata_hash,
  p.play_count,
  p.rating,
  p.deleted_at,
  p.created_at,
  p.updated_at
FROM public.presets_v2 p
WHERE p.deleted_at IS NULL
  AND p.name NOT LIKE '__derived__/%'
  AND NOT ('internal-derived' = ANY(COALESCE(p.tags, ARRAY[]::TEXT[])))
  AND (
    p.visibility IN ('public', 'featured')
    OR ((SELECT auth.uid()) IS NOT NULL AND p.owner_key = 'public')
    OR p.owner_user_id = (SELECT auth.uid())
  );

CREATE OR REPLACE VIEW public.legacy_preset_summaries
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  p.id,
  p.user_id,
  p.type,
  p.scope,
  p.name,
  p.author,
  p.library,
  p.creator,
  p.description,
  p.tags,
  p.visibility,
  p.family_name,
  p.variant_name,
  p.variant_rank,
  p.plays,
  p.current_version,
  p.created_at,
  p.updated_at,
  p.rating
FROM public.presets p
WHERE COALESCE(p.archived, FALSE) = FALSE
  AND p.deleted_at IS NULL
  AND (
    COALESCE(p.visibility, 'public') IN ('public', 'featured')
    OR p.user_id = (SELECT auth.uid())
  );

GRANT SELECT ON public.preset_summaries_v2 TO anon, authenticated;
GRANT SELECT ON public.legacy_preset_summaries TO anon, authenticated;

COMMENT ON VIEW public.preset_summaries_v2 IS
  'Revoke-safe summary-only V2 preset API. Uses explicit visibility predicates so base tables can lose browser SELECT grants.';

COMMENT ON VIEW public.legacy_preset_summaries IS
  'Revoke-safe summary-only legacy preset API. Excludes inline versions/data payloads and applies explicit visibility predicates.';

-- Planned after detail RPCs and summary views are applied and verified:
-- REVOKE SELECT ON public.presets_v2 FROM anon, authenticated;
-- REVOKE SELECT ON public.preset_versions_v2 FROM anon, authenticated;
-- REVOKE SELECT ON public.preset_version_refs_v2 FROM anon, authenticated;
-- REVOKE SELECT ON public.preset_payloads_v2 FROM anon, authenticated;
-- REVOKE SELECT ON public.presets FROM anon, authenticated;

COMMIT;
