#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;

const args = new Set(process.argv.slice(2));
const outputJson = args.has('--json');
const failOnIssues = args.has('--fail-on-issues');
const skipAuth = args.has('--no-auth');

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        const key = line.slice(0, index);
        let value = line.slice(index + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"'))
          || (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [key, value];
      }),
  );
}

const cwd = process.cwd();
const env = {
  ...readEnvFile(path.join(cwd, '.env')),
  ...readEnvFile(path.join(cwd, '.env.local')),
  ...process.env,
};

const supabaseUrl = env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
  || env.SUPABASE_SERVICE_KEY
  || env.SUPABASE_SECRET_KEY
  || null;
const supabaseKey = serviceRoleKey || env.VITE_SUPABASE_ANON_KEY;
const usesPrivilegedKey = Boolean(serviceRoleKey);
const databaseUrl = env.DATABASE_URL ?? env.SUPABASE_DATABASE_URL ?? env.SUPABASE_DB_URL;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Add them to .env/.env.local or the process env.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

async function fetchAll(table, select, query = (builder) => builder, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await query(supabase.from(table).select(select).range(from, to));
    if (error) throw new Error(`${table} fetch failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchOptionalTable(table, select, query) {
  try {
    return await fetchAll(table, select, query);
  } catch (error) {
    const text = String(error?.message ?? error).toLowerCase();
    if (text.includes('does not exist') || text.includes('schema cache') || text.includes('pgrst205')) return [];
    throw error;
  }
}

function isPermissionDenied(error) {
  const text = String(error?.message ?? error ?? '').toLowerCase();
  return text.includes('permission denied') || text.includes('42501');
}

function pgClientConfig(connectionString) {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  const normalizedConnectionString = url.toString();
  const isLocal = /(?:localhost|127\.0\.0\.1|\[::1\])/.test(normalizedConnectionString);
  return {
    connectionString: normalizedConnectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  };
}

async function fetchRowsFromPostgres() {
  const client = new Client(pgClientConfig(databaseUrl));
  await client.connect();
  try {
    const presetsResult = await client.query(`
        select id, owner_key, type, scope, name, family_name, variant_name, variant_rank,
               latest_version_no, latest_version_id, latest_resolved_hash, latest_metadata_hash,
               updated_at, archived, deleted_at, tags
          from public.presets_v2
         order by id asc
      `);
    const versionsResult = await client.query(`
        select id, preset_id, version_no, parent_version_id, storage_mode, override_hash,
               metadata_hash, patch_from_prev_hash, resolved_hash, is_checkpoint, created_at
          from public.preset_versions_v2
         order by preset_id asc, version_no asc, id asc
      `);
    const refsResult = await client.query(`
        select version_id, ref_slot, target_preset_id, target_version_no, follow_latest,
               override_hash, created_at
          from public.preset_version_refs_v2
         order by version_id asc, ref_slot asc
      `);
    const hasContentRefs = (await client.query(
      "select to_regclass('public.preset_version_content_refs_v2') is not null present",
    )).rows[0]?.present === true;
    const contentRefsResult = hasContentRefs
      ? await client.query(`
          select version_id, ref_slot, content_hash, content_type, created_at
            from public.preset_version_content_refs_v2
           order by version_id asc, ref_slot asc
        `)
      : { rows: [] };
    const payloadsResult = await client.query(`
        select hash, payload_kind, payload, payload_bytes, created_at, last_seen_at
          from public.preset_payloads_v2
         order by hash asc
      `);
    const lifecycleResult = await client.query(`
      select
        exists (
          select 1 from cron.job
           where jobname = 'kessho-v2-lifecycle-maintenance'
             and active
             and command = 'select public.kessho_run_preset_lifecycle_maintenance_v2();'
        ) lifecycle_cron_installed,
        coalesce(
          pg_get_functiondef(to_regprocedure('public.kessho_run_preset_storage_maintenance_v2(boolean,integer)'))
            like '%preset_version_content_refs_v2%',
          false
        ) maintenance_counts_content_refs,
        coalesce(
          pg_get_functiondef(to_regprocedure('public.kessho_purge_recycled_presets_v2(boolean,interval,integer)'))
            not like '%historical_versions_to_prune%',
          false
        ) purge_preserves_historical_versions,
        coalesce(
          has_function_privilege(
            'authenticated',
            to_regprocedure('public.kessho_restore_preset_v2(uuid)'),
            'EXECUTE'
          ),
          false
        ) authenticated_restore_enabled
    `);
    return {
      presets: presetsResult.rows,
      versions: versionsResult.rows,
      refs: refsResult.rows,
      contentRefs: contentRefsResult.rows,
      payloads: payloadsResult.rows,
      lifecycle: lifecycleResult.rows[0] ?? null,
    };
  } finally {
    await client.end();
  }
}

async function runLimitedHardenedAudit(reason) {
  const [
    summaryRows,
    legacyRows,
    storageStatsResult,
    lookupResult,
    payloadResult,
    lookupIdResult,
    cardResult,
    existsResult,
  ] = await Promise.all([
    fetchAll(
      'preset_summaries_v2',
      'id,type,scope,name,latest_version_no,latest_metadata_hash,play_count,deleted_at,updated_at',
      (builder) => builder.order('updated_at', { ascending: false }).limit(50),
      50,
    ),
    fetchAll(
      'legacy_preset_summaries',
      'id,type,scope,name,current_version,plays,updated_at',
      (builder) => builder.order('updated_at', { ascending: false }).limit(50),
      50,
    ),
    supabase.rpc('kessho_get_preset_storage_stats_v2', {}),
    supabase.rpc('kessho_lookup_preset_rows_v2', {
      target_preset_id: null,
      target_type: null,
      target_name: '__audit_missing__',
      target_scopes: null,
      target_scope_is_null: false,
      target_resolved_hash: null,
      exclude_preset_id: null,
      include_deleted: false,
      deleted_only: false,
      include_internal_derived: false,
      internal_derived_only: false,
      max_rows: 1,
      page_offset: 0,
    }),
    supabase.rpc('kessho_get_preset_payloads_v2', { target_hashes: [] }),
    supabase.rpc('kessho_lookup_preset_id_v2', {
      target_type: 'state',
      target_name: '__audit_missing__',
      target_scope: 'global',
      target_resolved_hash: null,
    }),
    supabase.rpc('kessho_get_preset_card_v2', { target_preset_id: '00000000-0000-4000-8000-000000000000' }),
    supabase.rpc('kessho_exists_preset_logical_key_v2', {
      target_type: 'state',
      target_name: '__audit_missing__',
      target_scope: 'global',
    }),
  ]);

  const rpcFailures = [];
  for (const [label, result] of [
    ['kessho_get_preset_storage_stats_v2', storageStatsResult],
    ['kessho_lookup_preset_rows_v2', lookupResult],
    ['kessho_get_preset_payloads_v2', payloadResult],
    ['kessho_lookup_preset_id_v2', lookupIdResult],
    ['kessho_get_preset_card_v2', cardResult],
    ['kessho_exists_preset_logical_key_v2', existsResult],
  ]) {
    if (result.error) rpcFailures.push(`${label}: ${result.error.message}`);
  }

  const report = {
    mode: 'limited-hardened-api',
    reason,
    counts: {
      visibleV2Summaries: summaryRows.length,
      visibleLegacySummaries: legacyRows.length,
    },
    storageStats: storageStatsResult.data ?? null,
    rpcFailures,
    fullAuditRequires: 'SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, SUPABASE_SECRET_KEY, or direct database access',
  };

  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('Supabase preset V2 audit');
    console.log('Mode: limited hardened API');
    console.log(`Reason: ${reason}`);
    console.log(`Visible summaries: ${summaryRows.length} V2, ${legacyRows.length} legacy`);
    if (storageStatsResult.data) {
      console.log(`Storage stats RPC: ${JSON.stringify(storageStatsResult.data)}`);
    }
    if (rpcFailures.length > 0) {
      console.log('RPC issues:');
      for (const failure of rpcFailures) console.log(`- ${failure}`);
    } else {
      console.log('Narrow runtime RPCs: callable');
    }
    console.log('Full table-level integrity, hash, duplicate, and orphan-byte checks require service-role or DB credentials.');
  }

  if (failOnIssues && rpcFailures.length > 0) {
    process.exit(1);
  }
}

function roundNumber(value) {
  if (!Number.isFinite(value)) return value;
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function canonicalize(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') return roundNumber(value);
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entryValue]) => [key, canonicalize(entryValue)]),
    );
  }
  return value;
}

function hashPayload(payload) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex');
}

function shortHash(value) {
  return value ? String(value).slice(0, 12) : null;
}

function key(...parts) {
  return parts.map((part) => part ?? '').join('\u001f');
}

function payloadBytes(hash, payloadByHash) {
  return payloadByHash.get(hash)?.payload_bytes ?? 0;
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

function timestampKey(value) {
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}

if (!skipAuth && !usesPrivilegedKey && !databaseUrl) {
  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(`Anonymous Supabase auth failed: ${error.message}`);
  }
}

let presets;
let versions;
let refs;
let contentRefs;
let payloads;
let lifecycle = null;
let auditMode = usesPrivilegedKey ? 'service-role-rest' : databaseUrl ? 'direct-postgres' : 'authenticated-rest';
try {
  if (!usesPrivilegedKey && databaseUrl) {
    ({ presets, versions, refs, contentRefs, payloads, lifecycle } = await fetchRowsFromPostgres());
  } else {
    [presets, versions, refs, contentRefs, payloads] = await Promise.all([
      fetchAll(
        'presets_v2',
        'id,owner_key,type,scope,name,family_name,variant_name,variant_rank,latest_version_no,latest_version_id,latest_resolved_hash,latest_metadata_hash,updated_at,archived,deleted_at,tags',
        (builder) => builder.order('id', { ascending: true }),
      ),
      fetchAll(
        'preset_versions_v2',
        'id,preset_id,version_no,parent_version_id,storage_mode,override_hash,metadata_hash,patch_from_prev_hash,resolved_hash,is_checkpoint,created_at',
        (builder) => builder.order('preset_id', { ascending: true }).order('version_no', { ascending: true }).order('id', { ascending: true }),
      ),
      fetchAll(
        'preset_version_refs_v2',
        'version_id,ref_slot,target_preset_id,target_version_no,follow_latest,override_hash,created_at',
        (builder) => builder.order('version_id', { ascending: true }).order('ref_slot', { ascending: true }),
      ),
      fetchOptionalTable(
        'preset_version_content_refs_v2',
        'version_id,ref_slot,content_hash,content_type,created_at',
        (builder) => builder.order('version_id', { ascending: true }).order('ref_slot', { ascending: true }),
      ),
      fetchAll(
        'preset_payloads_v2',
        'hash,payload_kind,payload,payload_bytes,created_at,last_seen_at',
        (builder) => builder.order('hash', { ascending: true }),
      ),
    ]);
  }
} catch (error) {
  if (!usesPrivilegedKey && isPermissionDenied(error)) {
    await runLimitedHardenedAudit(error.message);
    process.exit(0);
  }
  throw error;
}

const presetById = new Map(presets.map((row) => [row.id, row]));
const versionById = new Map(versions.map((row) => [row.id, row]));
const versionByPresetAndNo = new Map(versions.map((row) => [key(row.preset_id, row.version_no), row]));
const payloadByHash = new Map(payloads.map((row) => [row.hash, row]));
const refsByVersionId = new Map();
for (const ref of refs) {
  const bucket = refsByVersionId.get(ref.version_id) ?? [];
  bucket.push(ref);
  refsByVersionId.set(ref.version_id, bucket);
}

function isInternalDerivedPreset(preset) {
  return String(preset?.name ?? '').startsWith('__derived__/')
    || (Array.isArray(preset?.tags) && preset.tags.includes('internal-derived'));
}

/**
 * A recycled visible preset remains a restore root until it is hard-purged.
 * Its latest graph therefore retains internal descendants just like an active
 * visible preset does. This deliberately does not include internal rows as
 * roots: an internal row must be retained by a visible/root preset.
 */
function isRetainedVisibleRoot(preset) {
  return Boolean(preset?.latest_version_id) && !isInternalDerivedPreset(preset);
}

function reachablePresetIdsFrom(roots) {
  const reachable = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const preset = queue.shift();
    if (!preset || reachable.has(preset.id)) continue;
    reachable.add(preset.id);
    for (const ref of refsByVersionId.get(preset.latest_version_id) ?? []) {
      const child = presetById.get(ref.target_preset_id);
      if (child?.latest_version_id) queue.push(child);
    }
  }
  return reachable;
}

const uses = [];
for (const version of versions) {
  const preset = presetById.get(version.preset_id);
  const context = `${preset?.type}:${preset?.scope ?? ''}:${preset?.name}:v${version.version_no}`;
  if (version.override_hash) uses.push({ hash: version.override_hash, role: 'override', context });
  if (version.metadata_hash) uses.push({ hash: version.metadata_hash, role: 'metadata', context });
  if (version.patch_from_prev_hash) uses.push({ hash: version.patch_from_prev_hash, role: 'patch', context });
  if (version.resolved_hash) uses.push({ hash: version.resolved_hash, role: 'resolved', context });
}
for (const ref of refs) {
  const ownerVersion = versionById.get(ref.version_id);
  const ownerPreset = ownerVersion ? presetById.get(ownerVersion.preset_id) : null;
  const context = `${ownerPreset?.type}:${ownerPreset?.scope ?? ''}:${ownerPreset?.name}:v${ownerVersion?.version_no}:${ref.ref_slot}`;
  if (ref.override_hash) uses.push({ hash: ref.override_hash, role: 'refs_override', context });
}
for (const ref of contentRefs) {
  const ownerVersion = versionById.get(ref.version_id);
  const ownerPreset = ownerVersion ? presetById.get(ownerVersion.preset_id) : null;
  const context = `${ownerPreset?.type}:${ownerPreset?.scope ?? ''}:${ownerPreset?.name}:v${ownerVersion?.version_no}:${ref.ref_slot}`;
  uses.push({ hash: ref.content_hash, role: 'content', context });
}

const missingPayloadUses = uses.filter((use) => !payloadByHash.has(use.hash));
const roleByHash = new Map();
for (const use of uses) {
  if (!roleByHash.has(use.hash)) roleByHash.set(use.hash, new Set());
  roleByHash.get(use.hash).add(use.role);
}

const expectedKindByRole = {
  content: 'content',
  override: 'override',
  metadata: 'metadata',
  patch: 'patch',
  resolved: 'resolved',
  refs_override: 'refs_override',
};

const payloadKindReuse = [];
for (const [payloadHash, roles] of roleByHash.entries()) {
  const payload = payloadByHash.get(payloadHash);
  if (!payload) continue;
  const expectedKinds = [...roles].map((role) => expectedKindByRole[role]);
  if (!expectedKinds.includes(payload.payload_kind)) {
    payloadKindReuse.push({
      hash: shortHash(payloadHash),
      payloadKind: payload.payload_kind,
      usedAs: [...roles].sort(),
    });
  }
}

const referencedHashes = new Set(uses.map((use) => use.hash));
const unreferencedPayloads = payloads.filter((payload) => !referencedHashes.has(payload.hash));

const latestRollupIssues = [];
const recycledLatestRollupIssues = [];
for (const preset of presets) {
  const issueBucket = preset.deleted_at == null ? latestRollupIssues : recycledLatestRollupIssues;
  const latest = preset.latest_version_id ? versionById.get(preset.latest_version_id) : null;
  if (!latest && preset.latest_version_no > 0) {
    issueBucket.push({ name: preset.name, issue: 'missing latest_version_id row', latestVersionNo: preset.latest_version_no });
    continue;
  }
  if (!latest) continue;
  if (latest.preset_id !== preset.id) issueBucket.push({ name: preset.name, issue: 'latest_version_id points to another preset' });
  if (latest.version_no !== preset.latest_version_no) {
    issueBucket.push({
      name: preset.name,
      issue: 'latest version number mismatch',
      presetLatest: preset.latest_version_no,
      versionNo: latest.version_no,
    });
  }
  if (latest.resolved_hash !== preset.latest_resolved_hash) {
    issueBucket.push({
      name: preset.name,
      issue: 'latest resolved hash mismatch',
      presetHash: shortHash(preset.latest_resolved_hash),
      versionHash: shortHash(latest.resolved_hash),
    });
  }
  if (latest.metadata_hash !== preset.latest_metadata_hash) {
    issueBucket.push({
      name: preset.name,
      issue: 'latest metadata hash mismatch',
      presetHash: shortHash(preset.latest_metadata_hash),
      versionHash: shortHash(latest.metadata_hash),
    });
  }
}

const versionStorageIssues = [];
for (const version of versions) {
  const preset = presetById.get(version.preset_id);
  const context = `${preset?.type}:${preset?.scope ?? ''}:${preset?.name}:v${version.version_no}`;
  if (!version.resolved_hash) versionStorageIssues.push({ context, issue: 'missing resolved_hash' });
  if (version.storage_mode === 'patch' && version.version_no !== 1 && !version.patch_from_prev_hash) {
    versionStorageIssues.push({ context, issue: 'patch version has no patch_from_prev_hash' });
  }
  if (version.storage_mode !== 'patch' && version.patch_from_prev_hash) {
    versionStorageIssues.push({ context, issue: 'checkpoint/snapshot unexpectedly has patch hash' });
  }
  if (version.version_no > 1 && !version.parent_version_id) {
    versionStorageIssues.push({ context, issue: 'non-v1 version has no parent_version_id' });
  }
  if (version.parent_version_id && !versionById.has(version.parent_version_id)) {
    versionStorageIssues.push({ context, issue: 'parent_version_id missing' });
  }
}

const refIssues = [];
const fixedRefPolicyIssues = [];
const activeLatestRefsToRecycled = [];
for (const ref of refs) {
  const owner = versionById.get(ref.version_id);
  const target = presetById.get(ref.target_preset_id);
  const ownerPreset = owner ? presetById.get(owner.preset_id) : null;
  const context = `${ownerPreset?.type}:${ownerPreset?.scope ?? ''}:${ownerPreset?.name}:v${owner?.version_no}:${ref.ref_slot}`;
  if (!owner) refIssues.push({ context, issue: 'owner version missing' });
  if (!target) {
    refIssues.push({ context, issue: 'target preset missing' });
    continue;
  }
  if (ref.follow_latest && ref.target_version_no != null) refIssues.push({ context, issue: 'follow_latest ref has target_version_no' });
  if (!ref.follow_latest && ref.target_version_no == null) refIssues.push({ context, issue: 'fixed ref missing target_version_no' });
  if (!ref.follow_latest || ref.target_version_no != null) {
    fixedRefPolicyIssues.push({
      context,
      issue: 'ref violates latest-only policy',
      followLatest: ref.follow_latest,
      targetVersionNo: ref.target_version_no,
    });
  }
  if (!ref.follow_latest && !versionByPresetAndNo.has(key(ref.target_preset_id, ref.target_version_no))) {
    refIssues.push({
      context,
      issue: 'target version row missing',
      target: `${target.type}:${target.scope ?? ''}:${target.name}:v${ref.target_version_no}`,
    });
  }
  if (ref.override_hash && !payloadByHash.has(ref.override_hash)) {
    refIssues.push({ context, issue: 'ref override payload missing', hash: shortHash(ref.override_hash) });
  }
  if (
    ownerPreset
    && target
    && ownerPreset.deleted_at == null
    && ownerPreset.latest_version_id === ref.version_id
    && target.deleted_at != null
  ) {
    activeLatestRefsToRecycled.push({
      context,
      target: `${target.type}:${target.scope ?? ''}:${target.name}`,
      deletedAt: target.deleted_at,
    });
  }
}

const activeVisibleRoots = presets.filter(preset => (
  preset.deleted_at == null && isRetainedVisibleRoot(preset)
));
const retainedVisibleRoots = presets.filter(isRetainedVisibleRoot);
const activeVisibleReachableIds = reachablePresetIdsFrom(activeVisibleRoots);
const retainedVisibleReachableIds = reachablePresetIdsFrom(retainedVisibleRoots);
// Lifecycle parity: only an active internal row unreachable from every active
// or recycled retained root is garbage. Recycled-root-only descendants are
// expected and remain a nonblocking restore-retention measurement below.
const activeUnreachableInternalDerived = presets
  .filter((preset) => (
    preset.deleted_at == null
    && isInternalDerivedPreset(preset)
    && !retainedVisibleReachableIds.has(preset.id)
  ))
  .map((preset) => ({
    type: preset.type,
    scope: preset.scope,
    name: preset.name,
    updatedAt: preset.updated_at,
  }))
  .sort((left, right) => timestampKey(left.updatedAt).localeCompare(timestampKey(right.updatedAt)));

const activeInternalRetainedOnly = presets
  .filter((preset) => (
    preset.deleted_at == null
    && isInternalDerivedPreset(preset)
    && retainedVisibleReachableIds.has(preset.id)
    && !activeVisibleReachableIds.has(preset.id)
  ))
  .map((preset) => ({ type: preset.type, scope: preset.scope, name: preset.name }));

const recycledRootsWithDeletedInternalDescendants = [];
for (const root of retainedVisibleRoots.filter(preset => preset.deleted_at != null)) {
  const graphIds = reachablePresetIdsFrom([root]);
  const deletedInternal = [...graphIds]
    .map(id => presetById.get(id))
    .filter(preset => preset && preset.id !== root.id && preset.deleted_at != null && isInternalDerivedPreset(preset));
  if (deletedInternal.length > 0) {
    recycledRootsWithDeletedInternalDescendants.push({
      type: root.type,
      scope: root.scope,
      name: root.name,
      deletedInternalDescendants: deletedInternal.length,
      descendants: deletedInternal.slice(0, 5).map(preset => preset.name),
    });
  }
}
recycledRootsWithDeletedInternalDescendants.sort((left, right) => (
  right.deletedInternalDescendants - left.deletedInternalDescendants || left.name.localeCompare(right.name)
));

const orphanedPatchRoots = versions
  .filter(version => (
    version.version_no > 1
    && version.storage_mode === 'patch'
    && !version.parent_version_id
  ))
  .map((version) => {
    const preset = presetById.get(version.preset_id);
    return {
      context: `${preset?.type}:${preset?.scope ?? ''}:${preset?.name}:v${version.version_no}`,
      hasResolved: Boolean(version.resolved_hash),
    };
  });

const activeFamilyGroups = new Map();
for (const preset of presets.filter(row => row.deleted_at == null && !isInternalDerivedPreset(row))) {
  const familyName = String(preset.family_name ?? preset.name ?? '').trim();
  const familyKey = key(preset.owner_key, preset.type, preset.scope, familyName.toLowerCase());
  const group = activeFamilyGroups.get(familyKey) ?? { familyName, rows: [] };
  group.rows.push(preset);
  activeFamilyGroups.set(familyKey, group);
}
const activeFamiliesWithoutParent = [...activeFamilyGroups.values()]
  .filter(group => !group.rows.some(preset => (
    preset.name === group.familyName
    || preset.variant_name === group.familyName
    || preset.variant_rank === 0
  )))
  .map(group => ({
    familyName: group.familyName,
    type: group.rows[0]?.type,
    scope: group.rows[0]?.scope,
    variants: group.rows.map(preset => preset.name).sort(),
  }));

const hashMismatches = [];
for (const payload of payloads) {
  const computed = hashPayload(payload.payload);
  if (computed !== payload.hash) {
    hashMismatches.push({
      hash: shortHash(payload.hash),
      computed: shortHash(computed),
      kind: payload.payload_kind,
      bytes: payload.payload_bytes,
    });
  }
}

const logicalReferencedBytes = uses.reduce((sum, use) => sum + payloadBytes(use.hash, payloadByHash), 0);
const uniqueReferencedBytes = [...referencedHashes].reduce((sum, payloadHash) => sum + payloadBytes(payloadHash, payloadByHash), 0);
const allPayloadBytes = payloads.reduce((sum, row) => sum + (row.payload_bytes ?? 0), 0);

const activePresets = presets.filter((preset) => preset.deleted_at == null);
const latestVersionIds = new Set(activePresets.map((preset) => preset.latest_version_id).filter(Boolean));
const latestResolvedCacheByType = {};
for (const preset of activePresets) {
  if (!preset.latest_resolved_hash) continue;
  const bucket = latestResolvedCacheByType[preset.type] ?? {
    activePresets: 0,
    uniqueLatestResolvedPayloads: new Set(),
    latestResolvedCacheBytes: 0,
  };
  bucket.activePresets += 1;
  bucket.uniqueLatestResolvedPayloads.add(preset.latest_resolved_hash);
  bucket.latestResolvedCacheBytes += payloadBytes(preset.latest_resolved_hash, payloadByHash);
  latestResolvedCacheByType[preset.type] = bucket;
}

const latestResolvedCacheMetrics = Object.fromEntries(
  Object.entries(latestResolvedCacheByType).map(([type, bucket]) => [type, {
    activePresets: bucket.activePresets,
    uniqueLatestResolvedPayloads: bucket.uniqueLatestResolvedPayloads.size,
    latestResolvedCacheBytes: bucket.latestResolvedCacheBytes,
  }]),
);

const nonHistoricalRefs = new Set();
for (const preset of presets) {
  if (preset.latest_resolved_hash) nonHistoricalRefs.add(preset.latest_resolved_hash);
  if (preset.latest_metadata_hash) nonHistoricalRefs.add(preset.latest_metadata_hash);
}
for (const version of versions) {
  if (version.override_hash) nonHistoricalRefs.add(version.override_hash);
  if (version.metadata_hash) nonHistoricalRefs.add(version.metadata_hash);
  if (version.patch_from_prev_hash) nonHistoricalRefs.add(version.patch_from_prev_hash);
}
for (const ref of refs) {
  if (ref.override_hash) nonHistoricalRefs.add(ref.override_hash);
}
const removableHistoricalResolvedHashes = new Set();
for (const version of versions) {
  if (!version.resolved_hash || latestVersionIds.has(version.id)) continue;
  if (!nonHistoricalRefs.has(version.resolved_hash)) {
    removableHistoricalResolvedHashes.add(version.resolved_hash);
  }
}
const removableHistoricalResolvedBytes = [...removableHistoricalResolvedHashes]
  .reduce((sum, payloadHash) => sum + payloadBytes(payloadHash, payloadByHash), 0);

const useCountsByRole = {};
const uniqueCountsByRole = {};
for (const role of ['override', 'metadata', 'patch', 'resolved', 'refs_override']) {
  const roleUses = uses.filter((use) => use.role === role);
  useCountsByRole[role] = roleUses.length;
  uniqueCountsByRole[role] = new Set(roleUses.map((use) => use.hash)).size;
}

const payloadBytesByKind = {};
const payloadCountByKind = {};
for (const payload of payloads) {
  payloadBytesByKind[payload.payload_kind] = (payloadBytesByKind[payload.payload_kind] ?? 0) + (payload.payload_bytes ?? 0);
  payloadCountByKind[payload.payload_kind] = (payloadCountByKind[payload.payload_kind] ?? 0) + 1;
}

const topPayloadReuse = [...roleByHash.entries()]
  .map(([payloadHash, roles]) => ({
    hash: shortHash(payloadHash),
    payloadKind: payloadByHash.get(payloadHash)?.payload_kind,
    uses: uses.filter((use) => use.hash === payloadHash).length,
    roles: [...roles].sort(),
    bytes: payloadBytes(payloadHash, payloadByHash),
  }))
  .sort((left, right) => right.uses - left.uses || right.bytes - left.bytes)
  .slice(0, 12);

const groupsByResolved = new Map();
const groupsByResolvedMetadata = new Map();
const groupsByActiveLogicalIdentity = new Map();
for (const preset of activePresets) {
  const logicalKey = key(preset.owner_key, preset.type, preset.scope, String(preset.name ?? '').trim().toLowerCase());
  if (!groupsByActiveLogicalIdentity.has(logicalKey)) groupsByActiveLogicalIdentity.set(logicalKey, []);
  groupsByActiveLogicalIdentity.get(logicalKey).push(preset);
}

const duplicateActiveLogicalIdentities = [...groupsByActiveLogicalIdentity.values()]
  .filter((group) => group.length > 1)
  .map((group) => ({
    ownerKey: group[0].owner_key,
    type: group[0].type,
    scope: group[0].scope,
    nameKey: String(group[0].name ?? '').trim().toLowerCase(),
    activeRows: group.length,
    ids: group.map((row) => row.id),
    names: group.map((row) => row.name),
  }))
  .sort((left, right) => right.activeRows - left.activeRows || left.type.localeCompare(right.type))
  .slice(0, 20);

for (const preset of presets.filter((row) => row.latest_resolved_hash && !row.archived)) {
  const resolvedKey = key(preset.type, preset.scope, preset.latest_resolved_hash);
  if (!groupsByResolved.has(resolvedKey)) groupsByResolved.set(resolvedKey, []);
  groupsByResolved.get(resolvedKey).push(preset);

  const exactKey = key(preset.type, preset.scope, preset.latest_resolved_hash, preset.latest_metadata_hash);
  if (!groupsByResolvedMetadata.has(exactKey)) groupsByResolvedMetadata.set(exactKey, []);
  groupsByResolvedMetadata.get(exactKey).push(preset);
}

function duplicateGroupsFrom(map, includeMetadata) {
  return [...map.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      type: group[0].type,
      scope: group[0].scope,
      resolvedHash: shortHash(group[0].latest_resolved_hash),
      ...(includeMetadata ? { metadataHash: shortHash(group[0].latest_metadata_hash) } : {}),
      count: group.length,
      names: group.map((row) => `${row.name} (v${row.latest_version_no}${includeMetadata ? '' : `, meta ${shortHash(row.latest_metadata_hash)}`})`).sort(),
    }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type))
    .slice(0, 20);
}

const lifecycleConfigurationIssues = lifecycle
  ? Object.entries({
      lifecycle_cron_installed: lifecycle.lifecycle_cron_installed,
      maintenance_counts_content_refs: lifecycle.maintenance_counts_content_refs,
      purge_preserves_historical_versions: lifecycle.purge_preserves_historical_versions,
      authenticated_restore_enabled: lifecycle.authenticated_restore_enabled,
    })
      .filter(([, enabled]) => enabled !== true)
      .map(([check]) => check)
  : [];

const report = {
  mode: auditMode,
  counts: {
    presets: presets.length,
    versions: versions.length,
    refs: refs.length,
    contentRefs: contentRefs.length,
    payloads: payloads.length,
  },
  integrity: {
    missingPayloadUseCount: missingPayloadUses.length,
    missingPayloadUses: missingPayloadUses.slice(0, 20).map((use) => ({ ...use, hash: shortHash(use.hash) })),
    hashMismatchCount: hashMismatches.length,
    hashMismatches: hashMismatches.slice(0, 20),
    latestRollupIssueCount: latestRollupIssues.length,
    latestRollupIssues: latestRollupIssues.slice(0, 20),
    recycledLatestRollupIssueCount: recycledLatestRollupIssues.length,
    recycledLatestRollupIssues: recycledLatestRollupIssues.slice(0, 20),
    versionStorageIssueCount: versionStorageIssues.length,
    versionStorageIssues: versionStorageIssues.slice(0, 20),
    refIssueCount: refIssues.length,
    refIssues: refIssues.slice(0, 20),
    fixedRefPolicyIssueCount: fixedRefPolicyIssues.length,
    fixedRefPolicyIssues: fixedRefPolicyIssues.slice(0, 20),
    activeLatestRefToRecycledCount: activeLatestRefsToRecycled.length,
    activeLatestRefsToRecycled: activeLatestRefsToRecycled.slice(0, 20),
    activeUnreachableInternalDerivedCount: activeUnreachableInternalDerived.length,
    activeUnreachableInternalDerived: activeUnreachableInternalDerived.slice(0, 20),
    activeInternalRetainedOnlyCount: activeInternalRetainedOnly.length,
    activeInternalRetainedOnly: activeInternalRetainedOnly.slice(0, 20),
    recycledRootRestoreHazardCount: recycledRootsWithDeletedInternalDescendants.length,
    recycledRootRestoreHazards: recycledRootsWithDeletedInternalDescendants.slice(0, 20),
    orphanedPatchRootCount: orphanedPatchRoots.length,
    orphanedPatchRoots: orphanedPatchRoots.slice(0, 20),
    activeFamilyWithoutParentCount: activeFamiliesWithoutParent.length,
    activeFamiliesWithoutParent: activeFamiliesWithoutParent.slice(0, 20),
    lifecycleConfigurationIssueCount: lifecycleConfigurationIssues.length,
    lifecycleConfigurationIssues,
    kindMismatchCount: 0,
    kindMismatches: [],
    payloadKindReuseCount: payloadKindReuse.length,
    payloadKindReuse: payloadKindReuse.slice(0, 20),
    unreferencedPayloadCount: unreferencedPayloads.length,
    unreferencedPayloadBytes: unreferencedPayloads.reduce((sum, row) => sum + (row.payload_bytes ?? 0), 0),
  },
  dedupe: {
    useCountsByRole,
    uniqueCountsByRole,
    logicalReferencedBytes,
    uniqueReferencedBytes,
    allPayloadBytes,
    latestResolvedCacheByType: latestResolvedCacheMetrics,
    removableHistoricalResolvedPayloads: removableHistoricalResolvedHashes.size,
    removableHistoricalResolvedBytes,
    estimatedSavingsPercent: logicalReferencedBytes
      ? Math.round((1 - uniqueReferencedBytes / logicalReferencedBytes) * 1000) / 10
      : 0,
    payloadCountByKind,
    payloadBytesByKind,
    topPayloadReuse,
  },
  duplicateLatestGroups: {
    sameResolvedHash: duplicateGroupsFrom(groupsByResolved, false),
    sameResolvedAndMetadataHash: duplicateGroupsFrom(groupsByResolvedMetadata, true),
  },
  duplicateActiveLogicalIdentities,
  lifecycle,
};

const blockingIssueCount =
  report.integrity.missingPayloadUseCount
  + report.integrity.hashMismatchCount
  + report.integrity.latestRollupIssueCount
  + report.integrity.refIssueCount
  + report.integrity.fixedRefPolicyIssueCount
  + report.integrity.activeLatestRefToRecycledCount
  + report.integrity.activeUnreachableInternalDerivedCount
  + report.integrity.recycledRootRestoreHazardCount
  + report.integrity.orphanedPatchRootCount
  + report.integrity.activeFamilyWithoutParentCount
  + report.integrity.lifecycleConfigurationIssueCount
  + report.integrity.unreferencedPayloadCount
  + report.duplicateActiveLogicalIdentities.length;

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Supabase preset V2 audit');
  console.log(`Mode: ${auditMode}`);
  console.log(`Rows: ${report.counts.presets} presets, ${report.counts.versions} versions, ${report.counts.refs} refs, ${report.counts.contentRefs} content refs, ${report.counts.payloads} payloads`);
  console.log(`Dedupe: ${formatBytes(logicalReferencedBytes)} logical -> ${formatBytes(uniqueReferencedBytes)} unique referenced (${report.dedupe.estimatedSavingsPercent}% saved)`);
  console.log(`Payload storage: ${formatBytes(allPayloadBytes)} total, ${formatBytes(report.integrity.unreferencedPayloadBytes)} unreferenced`);
  console.log(`Removable historical resolved cache: ${formatBytes(report.dedupe.removableHistoricalResolvedBytes)} across ${report.dedupe.removableHistoricalResolvedPayloads} payloads`);
  console.log('');
  console.log(`Blocking integrity issues: ${blockingIssueCount}`);
  console.log(`Recycled latest rollup tombstones: ${report.integrity.recycledLatestRollupIssueCount}`);
  console.log(`Fixed ref policy issues: ${report.integrity.fixedRefPolicyIssueCount}`);
  console.log(`Duplicate active logical identities: ${report.duplicateActiveLogicalIdentities.length}`);
  console.log(`Active unreachable internal-derived presets: ${report.integrity.activeUnreachableInternalDerivedCount}`);
  console.log(`Active internal-derived retained only by recycled roots (nonblocking): ${report.integrity.activeInternalRetainedOnlyCount}`);
  console.log(`Recycled-root restore hazards: ${report.integrity.recycledRootRestoreHazardCount}`);
  console.log(`Orphaned patch roots: ${report.integrity.orphanedPatchRootCount}`);
  console.log(`Active families without a parent: ${report.integrity.activeFamilyWithoutParentCount}`);
  console.log(`Lifecycle configuration issues: ${report.integrity.lifecycleConfigurationIssueCount}`);
  console.log(`Unreferenced payloads: ${report.integrity.unreferencedPayloadCount}`);
  console.log(`Version storage warnings: ${report.integrity.versionStorageIssueCount}`);
  console.log(`Payload-kind reuse allowed: ${report.integrity.payloadKindReuseCount}`);
  if (report.integrity.versionStorageIssueCount > 0) {
    for (const issue of report.integrity.versionStorageIssues.slice(0, 5)) {
      console.log(`- ${issue.context}: ${issue.issue}`);
    }
  }
  console.log('');
  console.log('Top reused payloads:');
  for (const payload of topPayloadReuse.slice(0, 6)) {
    console.log(`- ${payload.hash} ${payload.payloadKind} ${payload.uses} uses (${formatBytes(payload.bytes)})`);
  }
  console.log('');
  console.log(`Duplicate latest groups: ${report.duplicateLatestGroups.sameResolvedHash.length} same resolved, ${report.duplicateLatestGroups.sameResolvedAndMetadataHash.length} exact`);
}

if (failOnIssues && blockingIssueCount > 0) {
  process.exit(1);
}
