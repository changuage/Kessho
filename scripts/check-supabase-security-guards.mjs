#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const PENDING_DIR = path.join(ROOT, 'supabase', 'pending');
const HARDENING_MIGRATION = '20260608003000_harden_preset_shared_permissions.sql';
const DETAIL_RPC_MIGRATION = '20260612000000_preset_detail_read_rpc.sql';
const SUMMARY_VIEW_REVOKE_SAFE_MIGRATION = '20260612001000_revoke_safe_preset_summary_views.sql';
const RUNTIME_READ_RPC_MIGRATION = '20260612001500_preset_runtime_read_rpcs.sql';
const OPTIMIZATION_MIGRATION = '20260627123656_preset_egress_optimization.sql';
const PENDING_BASE_TABLE_REVOKE_SQL = '20260612002000_revoke_preset_base_table_select.sql';
const API_SURFACE_AUDIT = 'scripts/audit-supabase-api-surface.mjs';
const REVOKE_READINESS_AUDIT = 'scripts/check-supabase-revoke-readiness.mjs';
const APPLY_HARDENING_SCRIPT = 'scripts/apply-supabase-api-hardening.mjs';
const OPTIMIZATION_DB_PROOF_SCRIPT = 'scripts/audit-supabase-optimization-db-proof.mjs';
const PACKAGE_JSON = 'package.json';
const LEAD4OPFM_UPSERT_SCRIPT = 'scripts/upsert-lead4opfm-v2-cloud-presets.mjs';
const PRESET_V2_MAINTENANCE_SCRIPT = 'scripts/maintain-supabase-presets-v2.mjs';
const TEXTURE_REPAIR_SCRIPT = 'scripts/repair-supabase-preset-texture-v2.mjs';
const REQUIRE_BASE_TABLE_SELECT_REVOKES = false;

const FORBIDDEN_PATTERNS = [
  {
    name: 'broad function execute grant to public API roles',
    pattern: /GRANT\s+EXECUTE\s+ON\s+ALL\s+FUNCTIONS\s+IN\s+SCHEMA\s+public\s+TO\s+(?:PUBLIC|anon|authenticated)\b/gi,
  },
  {
    name: 'direct V2 table write grant to public API roles',
    pattern: /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)(?:\s*,\s*(?:INSERT|UPDATE|DELETE))*\s+ON(?:\s+TABLE)?\s+public\.(?:presets_v2|preset_versions_v2|preset_version_refs_v2|preset_version_content_refs_v2|preset_payloads_v2)\s+TO\s+(?:anon|authenticated)\b/gi,
  },
];

const REQUIRED_HARDENING_SNIPPETS = [
  'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC',
  'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated',
  'DROP POLICY IF EXISTS "presets_v2_insert_shared_or_own" ON public.presets_v2',
  'DROP POLICY IF EXISTS "preset_payloads_v2_insert_testing" ON public.preset_payloads_v2',
  'REVOKE INSERT, UPDATE, DELETE ON TABLE public.presets_v2 FROM anon, authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_save_preset_v2(JSONB, JSONB, JSONB, JSONB) TO authenticated',
];

const REQUIRED_BASE_TABLE_SELECT_REVOKES = [
  'REVOKE SELECT ON public.presets_v2 FROM anon, authenticated',
  'REVOKE SELECT ON public.preset_versions_v2 FROM anon, authenticated',
  'REVOKE SELECT ON public.preset_version_refs_v2 FROM anon, authenticated',
  'REVOKE SELECT ON public.preset_payloads_v2 FROM anon, authenticated',
  'REVOKE SELECT ON public.presets FROM anon, authenticated',
];

const REQUIRED_DETAIL_RPC_SNIPPETS = [
  'CREATE OR REPLACE FUNCTION public.kessho_get_preset_detail_v2',
  'CREATE OR REPLACE FUNCTION public.kessho_get_legacy_preset_detail',
  'SECURITY DEFINER',
  "IF caller_id IS NULL THEN\n    RAISE EXCEPTION 'Authentication is required to load preset details'",
  "IF caller_id IS NULL THEN\n    RAISE EXCEPTION 'Authentication is required to load legacy preset details'",
  'REVOKE EXECUTE ON FUNCTION public.kessho_get_preset_detail_v2(UUID, TEXT, TEXT, TEXT[], INTEGER) FROM PUBLIC, anon',
  'GRANT EXECUTE ON FUNCTION public.kessho_get_preset_detail_v2(UUID, TEXT, TEXT, TEXT[], INTEGER) TO authenticated',
  'REVOKE EXECUTE ON FUNCTION public.kessho_get_legacy_preset_detail(UUID, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon',
  'GRANT EXECUTE ON FUNCTION public.kessho_get_legacy_preset_detail(UUID, TEXT, TEXT, TEXT[]) TO authenticated',
  '-- REVOKE SELECT ON public.presets_v2 FROM anon, authenticated',
  '-- REVOKE SELECT ON public.preset_versions_v2 FROM anon, authenticated',
  '-- REVOKE SELECT ON public.preset_version_refs_v2 FROM anon, authenticated',
  '-- REVOKE SELECT ON public.preset_payloads_v2 FROM anon, authenticated',
  '-- REVOKE SELECT ON public.presets FROM anon, authenticated',
];

const REQUIRED_SUMMARY_VIEW_REVOKE_SAFE_SNIPPETS = [
  'CREATE OR REPLACE VIEW public.preset_summaries_v2',
  'CREATE OR REPLACE VIEW public.legacy_preset_summaries',
  'WITH (security_barrier = true, security_invoker = false)',
  "p.visibility IN ('public', 'featured')",
  "OR ((SELECT auth.uid()) IS NOT NULL AND p.owner_key = 'public')",
  'OR p.owner_user_id = (SELECT auth.uid())',
  "COALESCE(p.visibility, 'public') IN ('public', 'featured')",
  'OR p.user_id = (SELECT auth.uid())',
  'GRANT SELECT ON public.preset_summaries_v2 TO anon, authenticated',
  'GRANT SELECT ON public.legacy_preset_summaries TO anon, authenticated',
  'base tables can lose browser SELECT grants',
  '-- REVOKE SELECT ON public.presets_v2 FROM anon, authenticated',
  '-- REVOKE SELECT ON public.preset_payloads_v2 FROM anon, authenticated',
  '-- REVOKE SELECT ON public.presets FROM anon, authenticated',
];

const REQUIRED_RUNTIME_READ_RPC_SNIPPETS = [
  'CREATE OR REPLACE FUNCTION public.kessho_lookup_preset_rows_v2',
  'CREATE OR REPLACE FUNCTION public.kessho_get_preset_versions_v2',
  'CREATE OR REPLACE FUNCTION public.kessho_get_preset_version_ref_keys_v2',
  'CREATE OR REPLACE FUNCTION public.kessho_get_latest_ref_targets_v2',
  'CREATE OR REPLACE FUNCTION public.kessho_get_preset_payloads_v2',
  'CREATE OR REPLACE FUNCTION public.kessho_find_preset_references_v2',
  'CREATE OR REPLACE FUNCTION public.kessho_get_preset_storage_stats_v2',
  'CREATE OR REPLACE FUNCTION public.kessho_save_legacy_preset',
  'SECURITY DEFINER',
  "IF caller_id IS NULL THEN\n    RAISE EXCEPTION 'Authentication is required to look up preset rows'",
  "RAISE EXCEPTION 'A constrained preset lookup filter is required'",
  'page_offset INTEGER DEFAULT 0',
  'OFFSET safe_offset',
  "'version_count', version_count",
  "'ref_count', ref_count",
  "'payload_count', payload_count",
  'REVOKE EXECUTE ON FUNCTION public.kessho_lookup_preset_rows_v2(UUID, TEXT, TEXT, TEXT[], BOOLEAN, TEXT, UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC, anon',
  'GRANT EXECUTE ON FUNCTION public.kessho_lookup_preset_rows_v2(UUID, TEXT, TEXT, TEXT[], BOOLEAN, TEXT, UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, INTEGER) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_save_legacy_preset(JSONB) TO authenticated',
];

const REQUIRED_OPTIMIZATION_SNIPPETS = [
  'CREATE TRIGGER preset_payloads_v2_hash_kind_consistency',
  'CREATE OR REPLACE FUNCTION public.kessho_canonical_jsonb_text',
  'CREATE OR REPLACE FUNCTION public.kessho_assert_payload_hash_matches',
  'CREATE OR REPLACE FUNCTION public.kessho_assert_preset_payload_hashes_exist',
  'CREATE OR REPLACE FUNCTION public.kessho_get_preset_latest_manifest_v2',
  'CREATE OR REPLACE FUNCTION public.kessho_get_missing_preset_payloads_v2',
  'CREATE OR REPLACE FUNCTION public.kessho_lookup_preset_id_v2',
  'CREATE OR REPLACE FUNCTION public.kessho_get_preset_card_v2',
  'CREATE OR REPLACE FUNCTION public.kessho_exists_preset_logical_key_v2',
  'CREATE OR REPLACE FUNCTION public.kessho_rename_preset_v2',
  'CREATE OR REPLACE FUNCTION public.kessho_rename_legacy_preset',
  'CREATE OR REPLACE FUNCTION public.kessho_purge_deleted_presets_v2',
  "floor(((input_value #>> '{}')::NUMERIC * 1000000) + 0.5) / 1000000",
  'preset JSON canonicalizer negative rounding self-test failed',
  '4508c786ddc6d8aa1619da1a2b6235eb2c548ca7e47b3b41e51c5f575e7b5b6b',
  'preset payload hash mismatch self-test unexpectedly passed',
  'preset payload missing-hash self-test unexpectedly passed',
  "SQLERRM NOT LIKE 'Preset payload hash mismatch:%'",
  "SQLERRM NOT LIKE 'Preset payload hash references missing payload rows:%'",
  'PERFORM public.kessho_assert_payload_hash_matches',
  'PERFORM public.kessho_assert_preset_payload_hashes_exist',
  "ON CONFLICT (hash) DO UPDATE\n      SET last_seen_at = now()\n      WHERE public.preset_payloads_v2.last_seen_at < now() - INTERVAL '7 days'",
  'pg_try_advisory_xact_lock',
  'dry_run_mode BOOLEAN DEFAULT TRUE',
  'REVOKE EXECUTE ON FUNCTION public.kessho_canonical_jsonb_text(JSONB) FROM PUBLIC, anon, authenticated',
  'REVOKE EXECUTE ON FUNCTION public.kessho_assert_payload_hash_matches(TEXT, JSONB) FROM PUBLIC, anon, authenticated',
  'REVOKE EXECUTE ON FUNCTION public.kessho_assert_preset_payload_hashes_exist(TEXT[]) FROM PUBLIC, anon, authenticated',
  'REVOKE EXECUTE ON FUNCTION public.kessho_put_payload_v2(TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated',
  'REVOKE EXECUTE ON FUNCTION public.kessho_save_preset_v2(JSONB, JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated',
  'REVOKE EXECUTE ON FUNCTION public.kessho_lookup_preset_id_v2(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated',
  'REVOKE EXECUTE ON FUNCTION public.kessho_get_preset_card_v2(UUID) FROM PUBLIC, anon, authenticated',
  'REVOKE EXECUTE ON FUNCTION public.kessho_exists_preset_logical_key_v2(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_save_preset_v2(JSONB, JSONB, JSONB, JSONB) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_lookup_preset_id_v2(TEXT, TEXT, TEXT, TEXT) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_get_preset_card_v2(UUID) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_exists_preset_logical_key_v2(TEXT, TEXT, TEXT) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_get_preset_latest_manifest_v2(UUID) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_get_missing_preset_payloads_v2(TEXT[]) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_rename_preset_v2(UUID, JSONB) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_rename_legacy_preset(UUID, JSONB) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_purge_deleted_presets_v2(BOOLEAN, INTERVAL, INTERVAL, INTEGER) TO service_role',
  'REVOKE EXECUTE ON FUNCTION public.kessho_get_missing_preset_payloads_v2(TEXT[]) FROM PUBLIC, anon, authenticated',
  'REVOKE EXECUTE ON FUNCTION public.kessho_get_preset_latest_manifest_v2(UUID) FROM PUBLIC, anon, authenticated',
  'REVOKE EXECUTE ON FUNCTION public.kessho_lookup_preset_id_v2(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated',
  'REVOKE EXECUTE ON FUNCTION public.kessho_get_preset_card_v2(UUID) FROM PUBLIC, anon, authenticated',
  'REVOKE EXECUTE ON FUNCTION public.kessho_exists_preset_logical_key_v2(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated',
  'REVOKE EXECUTE ON FUNCTION public.kessho_rename_legacy_preset(UUID, JSONB) FROM PUBLIC, anon, authenticated',
  'REVOKE EXECUTE ON FUNCTION public.kessho_rename_preset_v2(UUID, JSONB) FROM PUBLIC, anon, authenticated',
  'REVOKE EXECUTE ON FUNCTION public.kessho_purge_deleted_presets_v2(BOOLEAN, INTERVAL, INTERVAL, INTEGER) FROM PUBLIC, anon, authenticated',
  'REVOKE EXECUTE ON FUNCTION public.increment_plays(UUID) FROM PUBLIC, anon, authenticated',
  "NOTIFY pgrst, 'reload schema'",
];

const REQUIRED_PENDING_REVOKE_SNIPPETS = [
  'GRANT SELECT ON public.preset_summaries_v2 TO anon, authenticated',
  'GRANT SELECT ON public.legacy_preset_summaries TO anon, authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_get_preset_detail_v2(UUID, TEXT, TEXT, TEXT[], INTEGER) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_get_legacy_preset_detail(UUID, TEXT, TEXT, TEXT[]) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_lookup_preset_rows_v2(UUID, TEXT, TEXT, TEXT[], BOOLEAN, TEXT, UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER, INTEGER) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_get_preset_versions_v2(UUID) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_get_preset_payloads_v2(TEXT[]) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_lookup_preset_id_v2(TEXT, TEXT, TEXT, TEXT) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_get_preset_card_v2(UUID) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_exists_preset_logical_key_v2(TEXT, TEXT, TEXT) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_save_legacy_preset(JSONB) TO authenticated',
  'GRANT EXECUTE ON FUNCTION public.kessho_save_preset_v2(JSONB, JSONB, JSONB, JSONB) TO authenticated',
  'REVOKE SELECT ON public.presets_v2 FROM anon, authenticated',
  'REVOKE SELECT ON public.preset_versions_v2 FROM anon, authenticated',
  'REVOKE SELECT ON public.preset_version_refs_v2 FROM anon, authenticated',
  'REVOKE SELECT ON public.preset_payloads_v2 FROM anon, authenticated',
  'REVOKE SELECT ON public.presets FROM anon, authenticated',
  "NOTIFY pgrst, 'reload schema'",
  'node scripts/audit-supabase-api-surface.mjs --require-detail-rpcs',
  'node scripts/audit-supabase-api-surface.mjs --require-runtime-rpcs',
  'node scripts/audit-supabase-api-surface.mjs --fail-open-base-tables',
  'node scripts/audit-supabase-api-surface.mjs --require-summary-views',
  'npm run audit:supabase-revoke-readiness -- --fail-runtime-base-tables',
  'npm run audit:supabase-revoke-readiness -- --fail-browser-maintenance-base-tables',
  'npm run audit:supabase-egress:runtime:detail:strict',
];

const REQUIRED_API_SURFACE_AUDIT_SNIPPETS = [
  "import { createClient } from '@supabase/supabase-js'",
  'const DETAIL_RPC_CHECKS = [',
  'const RUNTIME_RPC_CHECKS = [',
  "name: 'kessho_get_preset_detail_v2'",
  "name: 'kessho_get_legacy_preset_detail'",
  "name: 'kessho_get_preset_latest_manifest_v2'",
  "name: 'kessho_lookup_preset_rows_v2'",
  "name: 'kessho_get_missing_preset_payloads_v2'",
  "name: 'kessho_lookup_preset_id_v2'",
  "name: 'kessho_get_preset_card_v2'",
  "name: 'kessho_exists_preset_logical_key_v2'",
  "name: 'kessho_rename_preset_v2'",
  "name: 'kessho_rename_legacy_preset'",
  'page_offset: 0',
  "name: 'kessho_get_preset_storage_stats_v2'",
  'client.auth.signInAnonymously()',
  'authenticatedRest',
  'Anonymous-auth base REST',
  'Base tables are directly readable through the anonymous-authenticated REST API.',
  'viewOptions',
  'Summary view options',
  '--require-summary-views',
  'Summary views are not readable through the anonymous-authenticated REST API.',
  '--require-detail-rpcs',
  'Detail RPCs are missing or blocked for an app-style anonymous Auth session.',
  '--require-runtime-rpcs',
  'Runtime RPCs are missing or blocked for an app-style anonymous Auth session.',
];

const REQUIRED_REVOKE_READINESS_AUDIT_SNIPPETS = [
  'const BASE_TABLES = new Set',
  'src/cloud/supabase.ts',
  'src/presets/SupabasePresetStore.ts',
  'src/presets/presetV2Migration.ts',
  '--fail-runtime-base-tables',
  '--fail-browser-maintenance-base-tables',
  'Runtime code still touches preset base tables directly.',
  'Browser maintenance code still touches preset base tables directly.',
  'const fetchAllPattern =',
  'Browser maintenance direct base-table touchpoints',
  'Final strict state: runtime and browser-maintenance counts must be 0',
];

const REQUIRED_APPLY_HARDENING_SNIPPETS = [
  '20260612000000_preset_detail_read_rpc.sql',
  '20260612001000_revoke_safe_preset_summary_views.sql',
  '20260612001500_preset_runtime_read_rpcs.sql',
  '20260612002000_revoke_preset_base_table_select.sql',
  '--confirm=APPLY_SUPABASE_API_HARDENING',
  'SUPABASE_DB_URL',
  'scripts/audit-supabase-api-surface.mjs',
  '--require-detail-rpcs',
  '--require-runtime-rpcs',
  '--require-summary-views',
  '--fail-open-base-tables',
  'scripts/check-supabase-revoke-readiness.mjs',
  '--fail-runtime-base-tables',
  '--fail-browser-maintenance-base-tables',
  'audit:supabase-egress:runtime:detail:strict',
];

const REQUIRED_PACKAGE_JSON_SNIPPETS = [
  '"audit:supabase-egress:runtime:detail:strict": "node scripts/check-supabase-egress-budget.mjs --open-presets --load-first-preset --require-supabase-calls --fail-supabase-errors"',
  '"audit:supabase-optimization-db-proof": "node scripts/audit-supabase-optimization-db-proof.mjs"',
];

const REQUIRED_OPTIMIZATION_DB_PROOF_SNIPPETS = [
  'DATABASE_URL',
  'SUPABASE_DATABASE_URL',
  'SUPABASE_DB_URL',
  'transactionRolledBack: true',
  'kessho_save_preset_v2',
  'kessho_get_preset_latest_manifest_v2',
  'kessho_get_missing_preset_payloads_v2',
  'kessho_lookup_preset_id_v2',
  'kessho_get_preset_card_v2',
  'kessho_exists_preset_logical_key_v2',
  'kessho_rename_preset_v2',
  'kessho_purge_deleted_presets_v2',
  'narrow id/card/existence/rename RPCs passed',
  'Narrow preset id lookup did not return the saved preset id',
  'Narrow logical-key existence check did not find the saved preset',
  'Narrow rename RPC did not return the renamed preset row',
  'Preset payload hash mismatch',
  'Preset payload hash references missing payload rows',
  'last_seen_at changed on immediate duplicate save',
  'Expected zero active legacy rows',
  'Purge dry-run mutated row counts',
  'rollback',
];

const REQUIRED_LEAD4OPFM_UPSERT_SNIPPETS = [
  "client.rpc('kessho_lookup_preset_rows_v2'",
  'page_offset: params.page_offset ?? 0',
  'const backupClient = serviceKey',
  'Write/backup mode requires SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, or SUPABASE_SECRET_KEY for wide-table backup reads.',
  'Anonymous Supabase auth is required for preset RPC access',
];

const REQUIRED_PRESET_V2_MAINTENANCE_SNIPPETS = [
  'Preset V2 maintenance reads and mutates wide base tables; set SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, or SUPABASE_SECRET_KEY.',
  'const client = createClient(supabaseUrl, serviceKey',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
];

const REQUIRED_TEXTURE_REPAIR_SNIPPETS = [
  'Texture repair scans wide preset base tables and must use a service key for those reads; remove --anon/--allow-anon-write.',
  'const adminClient = createClient(supabaseUrl, serviceRoleKey',
  'const appClient = createClient(supabaseUrl, anonKey',
  'await appClient.auth.signInAnonymously()',
  'Texture repair scans wide preset base tables; set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY.',
  'Texture repair loads/saves presets through authenticated app RPCs; set VITE_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.',
  "adminClient\n            .from('presets_v2')",
  "adminClient\n            .from('preset_version_refs_v2')",
];

function walkSqlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkSqlFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.sql') ? [fullPath] : [];
  });
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

const failures = [];

for (const filePath of walkSqlFiles(MIGRATIONS_DIR)) {
  const text = fs.readFileSync(filePath, 'utf8');
  for (const forbidden of FORBIDDEN_PATTERNS) {
    forbidden.pattern.lastIndex = 0;
    for (let match = forbidden.pattern.exec(text); match; match = forbidden.pattern.exec(text)) {
      failures.push(`${path.relative(ROOT, filePath)}:${lineNumberForIndex(text, match.index)} ${forbidden.name}`);
    }
  }
}

const hardeningPath = path.join(MIGRATIONS_DIR, HARDENING_MIGRATION);
if (!fs.existsSync(hardeningPath)) {
  failures.push(`Missing required hardening migration: ${path.relative(ROOT, hardeningPath)}`);
} else {
  const hardeningText = fs.readFileSync(hardeningPath, 'utf8');
  for (const snippet of REQUIRED_HARDENING_SNIPPETS) {
    if (!hardeningText.includes(snippet)) {
      failures.push(`${path.relative(ROOT, hardeningPath)} missing required snippet: ${snippet}`);
    }
  }
  if (REQUIRE_BASE_TABLE_SELECT_REVOKES) {
    for (const snippet of REQUIRED_BASE_TABLE_SELECT_REVOKES) {
      if (!hardeningText.includes(snippet)) {
        failures.push(`${path.relative(ROOT, hardeningPath)} missing base-table SELECT revoke: ${snippet}`);
      }
    }
  }
}

const detailRpcPath = path.join(MIGRATIONS_DIR, DETAIL_RPC_MIGRATION);
if (!fs.existsSync(detailRpcPath)) {
  failures.push(`Missing required detail RPC migration: ${path.relative(ROOT, detailRpcPath)}`);
} else {
  const detailRpcText = fs.readFileSync(detailRpcPath, 'utf8');
  for (const snippet of REQUIRED_DETAIL_RPC_SNIPPETS) {
    if (!detailRpcText.includes(snippet)) {
      failures.push(`${path.relative(ROOT, detailRpcPath)} missing required snippet: ${snippet}`);
    }
  }
}

const summaryViewRevokeSafePath = path.join(MIGRATIONS_DIR, SUMMARY_VIEW_REVOKE_SAFE_MIGRATION);
if (!fs.existsSync(summaryViewRevokeSafePath)) {
  failures.push(`Missing required revoke-safe summary view migration: ${path.relative(ROOT, summaryViewRevokeSafePath)}`);
} else {
  const summaryViewRevokeSafeText = fs.readFileSync(summaryViewRevokeSafePath, 'utf8');
  for (const snippet of REQUIRED_SUMMARY_VIEW_REVOKE_SAFE_SNIPPETS) {
    if (!summaryViewRevokeSafeText.includes(snippet)) {
      failures.push(`${path.relative(ROOT, summaryViewRevokeSafePath)} missing required snippet: ${snippet}`);
    }
  }
}

const runtimeReadRpcPath = path.join(MIGRATIONS_DIR, RUNTIME_READ_RPC_MIGRATION);
if (!fs.existsSync(runtimeReadRpcPath)) {
  failures.push(`Missing required runtime read RPC migration: ${path.relative(ROOT, runtimeReadRpcPath)}`);
} else {
  const runtimeReadRpcText = fs.readFileSync(runtimeReadRpcPath, 'utf8');
  for (const snippet of REQUIRED_RUNTIME_READ_RPC_SNIPPETS) {
    if (!runtimeReadRpcText.includes(snippet)) {
      failures.push(`${path.relative(ROOT, runtimeReadRpcPath)} missing required snippet: ${snippet}`);
    }
  }
}

const optimizationPath = path.join(MIGRATIONS_DIR, OPTIMIZATION_MIGRATION);
if (!fs.existsSync(optimizationPath)) {
  failures.push(`Missing required optimization migration: ${path.relative(ROOT, optimizationPath)}`);
} else {
  const optimizationText = fs.readFileSync(optimizationPath, 'utf8');
  for (const snippet of REQUIRED_OPTIMIZATION_SNIPPETS) {
    if (!optimizationText.includes(snippet)) {
      failures.push(`${path.relative(ROOT, optimizationPath)} missing required snippet: ${snippet}`);
    }
  }
}

const pendingBaseTableRevokePath = path.join(PENDING_DIR, PENDING_BASE_TABLE_REVOKE_SQL);
if (!fs.existsSync(pendingBaseTableRevokePath)) {
  failures.push(`Missing pending base-table revoke SQL: ${path.relative(ROOT, pendingBaseTableRevokePath)}`);
} else {
  const pendingBaseTableRevokeText = fs.readFileSync(pendingBaseTableRevokePath, 'utf8');
  for (const snippet of REQUIRED_PENDING_REVOKE_SNIPPETS) {
    if (!pendingBaseTableRevokeText.includes(snippet)) {
      failures.push(`${path.relative(ROOT, pendingBaseTableRevokePath)} missing required snippet: ${snippet}`);
    }
  }
}

const apiSurfaceAuditPath = path.join(ROOT, API_SURFACE_AUDIT);
if (!fs.existsSync(apiSurfaceAuditPath)) {
  failures.push(`Missing required API surface audit script: ${API_SURFACE_AUDIT}`);
} else {
  const apiSurfaceAuditText = fs.readFileSync(apiSurfaceAuditPath, 'utf8');
  for (const snippet of REQUIRED_API_SURFACE_AUDIT_SNIPPETS) {
    if (!apiSurfaceAuditText.includes(snippet)) {
      failures.push(`${API_SURFACE_AUDIT} missing required snippet: ${snippet}`);
    }
  }
}

const packageJsonPath = path.join(ROOT, PACKAGE_JSON);
if (!fs.existsSync(packageJsonPath)) {
  failures.push(`Missing package manifest: ${PACKAGE_JSON}`);
} else {
  const packageJsonText = fs.readFileSync(packageJsonPath, 'utf8');
  for (const snippet of REQUIRED_PACKAGE_JSON_SNIPPETS) {
    if (!packageJsonText.includes(snippet)) {
      failures.push(`${PACKAGE_JSON} missing required snippet: ${snippet}`);
    }
  }
}

const revokeReadinessAuditPath = path.join(ROOT, REVOKE_READINESS_AUDIT);
if (!fs.existsSync(revokeReadinessAuditPath)) {
  failures.push(`Missing required revoke-readiness audit script: ${REVOKE_READINESS_AUDIT}`);
} else {
  const revokeReadinessAuditText = fs.readFileSync(revokeReadinessAuditPath, 'utf8');
  for (const snippet of REQUIRED_REVOKE_READINESS_AUDIT_SNIPPETS) {
    if (!revokeReadinessAuditText.includes(snippet)) {
      failures.push(`${REVOKE_READINESS_AUDIT} missing required snippet: ${snippet}`);
    }
  }
}

const applyHardeningPath = path.join(ROOT, APPLY_HARDENING_SCRIPT);
if (!fs.existsSync(applyHardeningPath)) {
  failures.push(`Missing required apply-hardening script: ${APPLY_HARDENING_SCRIPT}`);
} else {
  const applyHardeningText = fs.readFileSync(applyHardeningPath, 'utf8');
  for (const snippet of REQUIRED_APPLY_HARDENING_SNIPPETS) {
    if (!applyHardeningText.includes(snippet)) {
      failures.push(`${APPLY_HARDENING_SCRIPT} missing required snippet: ${snippet}`);
    }
  }
}

const optimizationDbProofPath = path.join(ROOT, OPTIMIZATION_DB_PROOF_SCRIPT);
if (!fs.existsSync(optimizationDbProofPath)) {
  failures.push(`Missing required optimization DB proof script: ${OPTIMIZATION_DB_PROOF_SCRIPT}`);
} else {
  const optimizationDbProofText = fs.readFileSync(optimizationDbProofPath, 'utf8');
  for (const snippet of REQUIRED_OPTIMIZATION_DB_PROOF_SNIPPETS) {
    if (!optimizationDbProofText.includes(snippet)) {
      failures.push(`${OPTIMIZATION_DB_PROOF_SCRIPT} missing required snippet: ${snippet}`);
    }
  }
}

const lead4opfmUpsertPath = path.join(ROOT, LEAD4OPFM_UPSERT_SCRIPT);
if (!fs.existsSync(lead4opfmUpsertPath)) {
  failures.push(`Missing required Lead4opFM upsert script: ${LEAD4OPFM_UPSERT_SCRIPT}`);
} else {
  const lead4opfmUpsertText = fs.readFileSync(lead4opfmUpsertPath, 'utf8');
  for (const snippet of REQUIRED_LEAD4OPFM_UPSERT_SNIPPETS) {
    if (!lead4opfmUpsertText.includes(snippet)) {
      failures.push(`${LEAD4OPFM_UPSERT_SCRIPT} missing required snippet: ${snippet}`);
    }
  }
}

const presetV2MaintenancePath = path.join(ROOT, PRESET_V2_MAINTENANCE_SCRIPT);
if (!fs.existsSync(presetV2MaintenancePath)) {
  failures.push(`Missing required preset V2 maintenance script: ${PRESET_V2_MAINTENANCE_SCRIPT}`);
} else {
  const presetV2MaintenanceText = fs.readFileSync(presetV2MaintenancePath, 'utf8');
  for (const snippet of REQUIRED_PRESET_V2_MAINTENANCE_SNIPPETS) {
    if (!presetV2MaintenanceText.includes(snippet)) {
      failures.push(`${PRESET_V2_MAINTENANCE_SCRIPT} missing required snippet: ${snippet}`);
    }
  }
}

const textureRepairPath = path.join(ROOT, TEXTURE_REPAIR_SCRIPT);
if (!fs.existsSync(textureRepairPath)) {
  failures.push(`Missing required texture repair script: ${TEXTURE_REPAIR_SCRIPT}`);
} else {
  const textureRepairText = fs.readFileSync(textureRepairPath, 'utf8');
  for (const snippet of REQUIRED_TEXTURE_REPAIR_SNIPPETS) {
    if (!textureRepairText.includes(snippet)) {
      failures.push(`${TEXTURE_REPAIR_SCRIPT} missing required snippet: ${snippet}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Supabase security guard failed.');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Supabase security guard passed.');
