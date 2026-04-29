#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

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
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

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
        .sort(([left], [right]) => left.localeCompare(right))
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

if (!skipAuth) {
  const { error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw new Error(`Anonymous Supabase auth failed: ${error.message}`);
  }
}

const [presets, versions, refs, payloads] = await Promise.all([
  fetchAll('presets_v2', 'id,type,scope,name,latest_version_no,latest_version_id,latest_resolved_hash,latest_metadata_hash,updated_at,archived'),
  fetchAll('preset_versions_v2', 'id,preset_id,version_no,parent_version_id,storage_mode,override_hash,metadata_hash,patch_from_prev_hash,resolved_hash,is_checkpoint,created_at'),
  fetchAll('preset_version_refs_v2', 'version_id,ref_slot,target_preset_id,target_version_no,follow_latest,override_hash,created_at'),
  fetchAll('preset_payloads_v2', 'hash,payload_kind,payload,payload_bytes,created_at,last_seen_at'),
]);

const presetById = new Map(presets.map((row) => [row.id, row]));
const versionById = new Map(versions.map((row) => [row.id, row]));
const versionByPresetAndNo = new Map(versions.map((row) => [key(row.preset_id, row.version_no), row]));
const payloadByHash = new Map(payloads.map((row) => [row.hash, row]));

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

const missingPayloadUses = uses.filter((use) => !payloadByHash.has(use.hash));
const roleByHash = new Map();
for (const use of uses) {
  if (!roleByHash.has(use.hash)) roleByHash.set(use.hash, new Set());
  roleByHash.get(use.hash).add(use.role);
}

const expectedKindByRole = {
  override: 'override',
  metadata: 'metadata',
  patch: 'patch',
  resolved: 'resolved',
  refs_override: 'refs_override',
};

const kindMismatches = [];
for (const [payloadHash, roles] of roleByHash.entries()) {
  const payload = payloadByHash.get(payloadHash);
  if (!payload) continue;
  const expectedKinds = [...roles].map((role) => expectedKindByRole[role]);
  if (!expectedKinds.includes(payload.payload_kind)) {
    kindMismatches.push({
      hash: shortHash(payloadHash),
      payloadKind: payload.payload_kind,
      usedAs: [...roles].sort(),
    });
  }
}

const referencedHashes = new Set(uses.map((use) => use.hash));
const unreferencedPayloads = payloads.filter((payload) => !referencedHashes.has(payload.hash));

const latestRollupIssues = [];
for (const preset of presets) {
  const latest = preset.latest_version_id ? versionById.get(preset.latest_version_id) : null;
  if (!latest && preset.latest_version_no > 0) {
    latestRollupIssues.push({ name: preset.name, issue: 'missing latest_version_id row', latestVersionNo: preset.latest_version_no });
    continue;
  }
  if (!latest) continue;
  if (latest.preset_id !== preset.id) latestRollupIssues.push({ name: preset.name, issue: 'latest_version_id points to another preset' });
  if (latest.version_no !== preset.latest_version_no) {
    latestRollupIssues.push({
      name: preset.name,
      issue: 'latest version number mismatch',
      presetLatest: preset.latest_version_no,
      versionNo: latest.version_no,
    });
  }
  if (latest.resolved_hash !== preset.latest_resolved_hash) {
    latestRollupIssues.push({
      name: preset.name,
      issue: 'latest resolved hash mismatch',
      presetHash: shortHash(preset.latest_resolved_hash),
      versionHash: shortHash(latest.resolved_hash),
    });
  }
  if (latest.metadata_hash !== preset.latest_metadata_hash) {
    latestRollupIssues.push({
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
}

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

const report = {
  counts: {
    presets: presets.length,
    versions: versions.length,
    refs: refs.length,
    payloads: payloads.length,
  },
  integrity: {
    missingPayloadUseCount: missingPayloadUses.length,
    missingPayloadUses: missingPayloadUses.slice(0, 20).map((use) => ({ ...use, hash: shortHash(use.hash) })),
    hashMismatchCount: hashMismatches.length,
    hashMismatches: hashMismatches.slice(0, 20),
    latestRollupIssueCount: latestRollupIssues.length,
    latestRollupIssues: latestRollupIssues.slice(0, 20),
    versionStorageIssueCount: versionStorageIssues.length,
    versionStorageIssues: versionStorageIssues.slice(0, 20),
    refIssueCount: refIssues.length,
    refIssues: refIssues.slice(0, 20),
    kindMismatchCount: kindMismatches.length,
    kindMismatches: kindMismatches.slice(0, 20),
    unreferencedPayloadCount: unreferencedPayloads.length,
    unreferencedPayloadBytes: unreferencedPayloads.reduce((sum, row) => sum + (row.payload_bytes ?? 0), 0),
  },
  dedupe: {
    useCountsByRole,
    uniqueCountsByRole,
    logicalReferencedBytes,
    uniqueReferencedBytes,
    allPayloadBytes,
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
};

const blockingIssueCount =
  report.integrity.missingPayloadUseCount
  + report.integrity.hashMismatchCount
  + report.integrity.latestRollupIssueCount
  + report.integrity.refIssueCount
  + report.integrity.kindMismatchCount;

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Supabase preset V2 audit');
  console.log(`Rows: ${report.counts.presets} presets, ${report.counts.versions} versions, ${report.counts.refs} refs, ${report.counts.payloads} payloads`);
  console.log(`Dedupe: ${formatBytes(logicalReferencedBytes)} logical -> ${formatBytes(uniqueReferencedBytes)} unique referenced (${report.dedupe.estimatedSavingsPercent}% saved)`);
  console.log(`Payload storage: ${formatBytes(allPayloadBytes)} total, ${formatBytes(report.integrity.unreferencedPayloadBytes)} unreferenced`);
  console.log('');
  console.log(`Blocking integrity issues: ${blockingIssueCount}`);
  console.log(`Version storage warnings: ${report.integrity.versionStorageIssueCount}`);
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
