-- Pending final preset API-surface hardening.
--
-- Apply this after:
-- 1. 20260612000000_preset_detail_read_rpc.sql is deployed and verified.
-- 2. 20260612001000_revoke_safe_preset_summary_views.sql is deployed and verified.
-- 3. The intended public access model is confirmed:
--    - anon/authenticated can SELECT summary views.
--    - authenticated can EXECUTE narrow detail/save/delete RPCs.
--    - anon/authenticated cannot SELECT wide preset base tables directly.

BEGIN;

GRANT SELECT ON public.preset_summaries_v2 TO anon, authenticated;
GRANT SELECT ON public.legacy_preset_summaries TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.kessho_get_preset_detail_v2(UUID, TEXT, TEXT, TEXT[], INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_get_legacy_preset_detail(UUID, TEXT, TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_lookup_preset_rows_v2(UUID, TEXT, TEXT, TEXT[], BOOLEAN, TEXT, UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_get_preset_versions_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_get_preset_version_ref_keys_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_get_latest_ref_targets_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_get_preset_payloads_v2(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_lookup_preset_id_v2(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_get_preset_card_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_exists_preset_logical_key_v2(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_find_preset_references_v2(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_get_preset_storage_stats_v2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_save_legacy_preset(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_save_preset_v2(JSONB, JSONB, JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_soft_delete_preset_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kessho_soft_delete_legacy_preset(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_plays(UUID) TO authenticated;

REVOKE SELECT ON public.presets_v2 FROM anon, authenticated;
REVOKE SELECT ON public.preset_versions_v2 FROM anon, authenticated;
REVOKE SELECT ON public.preset_version_refs_v2 FROM anon, authenticated;
REVOKE SELECT ON public.preset_payloads_v2 FROM anon, authenticated;
REVOKE SELECT ON public.presets FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Expected post-apply checks:
--
-- node scripts/audit-supabase-api-surface.mjs --require-detail-rpcs
-- node scripts/audit-supabase-api-surface.mjs --require-runtime-rpcs
-- node scripts/audit-supabase-api-surface.mjs --require-summary-views
-- node scripts/audit-supabase-api-surface.mjs --fail-open-base-tables
-- npm run audit:supabase-revoke-readiness -- --fail-runtime-base-tables
-- npm run audit:supabase-revoke-readiness -- --fail-browser-maintenance-base-tables
-- npm run audit:supabase-egress:runtime:detail:strict
--
-- The API-surface strict command should pass only when raw anon and
-- anonymous-authenticated REST cannot read base tables while summary views
-- remain readable. The revoke-readiness strict commands should pass only when
-- browser/runtime code no longer directly touches preset base tables. The
-- egress strict command should pass only when the app loads preset details
-- without Supabase HTTP errors and within budget.
