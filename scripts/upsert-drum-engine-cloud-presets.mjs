#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path, { resolve } from 'node:path';
import process from 'node:process';

const root = resolve(new URL('..', import.meta.url).pathname);
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs.filter(arg => !arg.includes('=')));
const write = args.has('--write');
const outputJson = args.has('--json');
const backupRequested = args.has('--backup');

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const match = rawArgs.find(arg => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const sourcePath = resolve(root, argValue('--source', 'public/presets/drum-engine-presets.json'));
const pageSize = Number(argValue('--page-size', '1000'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(filePath) {
  assert(existsSync(filePath), `Missing file: ${filePath}`);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const index = line.indexOf('=');
        const key = line.slice(0, index).trim();
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

function roundNumber(value) {
  if (!Number.isFinite(value)) return value;
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function canonicalizeJson(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') return roundNumber(value);
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(item => canonicalizeJson(item));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, entryValue]) => [key, canonicalizeJson(entryValue)]),
    );
  }
  return value;
}

function stableStringifyCanonical(value) {
  return JSON.stringify(canonicalizeJson(value));
}

function hashCanonicalJson(value) {
  return createHash('sha256').update(stableStringifyCanonical(value)).digest('hex');
}

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

function normalizeNameKey(name) {
  return String(name ?? '').trim().toLowerCase();
}

function localKey(entry) {
  return `${entry.type ?? 'engine'}:${entry.scope ?? ''}:${normalizeNameKey(entry.name)}`;
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeTags(tags) {
  return Array.isArray(tags)
    ? tags.map(tag => String(tag).trim()).filter(Boolean)
    : [];
}

function sortedTags(tags) {
  return normalizeTags(tags).sort((left, right) => left.localeCompare(right));
}

function tagsEqual(left, right) {
  const leftTags = sortedTags(left);
  const rightTags = sortedTags(right);
  return leftTags.length === rightTags.length
    && leftTags.every((tag, index) => tag === rightTags[index]);
}

function nullable(value) {
  return value === undefined ? null : value;
}

function latestPresetVersion(entry) {
  const versions = Array.isArray(entry.versions)
    ? [...entry.versions].sort((left, right) => Number(left.v ?? 0) - Number(right.v ?? 0))
    : [];
  const currentVersion = Number(entry.currentVersion ?? 0);
  const exact = versions.find(version => Number(version.v ?? 0) === currentVersion);
  const latest = exact ?? versions.at(-1);
  assert(latest && latest.data && typeof latest.data === 'object' && !Array.isArray(latest.data), `${localKey(entry)} has no latest data`);
  return latest;
}

function desiredIdentity(entry) {
  return {
    owner_key: 'public',
    owner_user_id: null,
    type: entry.type || 'engine',
    scope: entry.scope ?? null,
    name: entry.name,
    author: entry.author || 'factory',
    library: entry.library || 'stock',
    creator: entry.creator ?? 'Kessho',
    description: entry.description ?? null,
    tags: normalizeTags(entry.tags),
    visibility: entry.visibility || (entry.featured ? 'featured' : 'public'),
    family_name: entry.familyName ?? entry.familyId ?? entry.name,
    variant_name: entry.variantName ?? entry.variantId ?? entry.name,
    variant_rank: Number.isFinite(entry.variantRank) ? entry.variantRank : null,
    forked_from: null,
    rating: Number.isFinite(entry.rating) ? entry.rating : null,
  };
}

function identityDiffers(row, identity) {
  if (!row) return true;
  return row.type !== identity.type
    || nullable(row.scope) !== identity.scope
    || row.name !== identity.name
    || row.author !== identity.author
    || row.library !== identity.library
    || nullable(row.creator) !== identity.creator
    || nullable(row.description) !== identity.description
    || !tagsEqual(row.tags, identity.tags)
    || row.visibility !== identity.visibility
    || nullable(row.family_name) !== identity.family_name
    || nullable(row.variant_name) !== identity.variant_name
    || nullable(row.variant_rank) !== identity.variant_rank
    || nullable(row.rating) !== identity.rating;
}

function summarizeAction(action) {
  return {
    action: action.action,
    key: action.key,
    rowId: action.row?.id ?? null,
    nextVersion: action.nextVersion,
    resolvedHash: action.resolvedHash.slice(0, 12),
    identityChanged: action.identityChanged,
    versionChanged: action.versionChanged,
  };
}

async function lookupPresetRowsV2(client, params, label) {
  const { data, error } = await client.rpc('kessho_lookup_preset_rows_v2', {
    target_preset_id: params.target_preset_id ?? null,
    target_type: params.target_type ?? null,
    target_name: params.target_name ?? null,
    target_scopes: params.target_scopes ?? null,
    target_scope_is_null: params.target_scope_is_null ?? false,
    target_resolved_hash: params.target_resolved_hash ?? null,
    exclude_preset_id: params.exclude_preset_id ?? null,
    include_deleted: params.include_deleted ?? false,
    deleted_only: params.deleted_only ?? false,
    include_internal_derived: params.include_internal_derived ?? true,
    internal_derived_only: params.internal_derived_only ?? false,
    max_rows: params.max_rows ?? 20,
    page_offset: params.page_offset ?? 0,
  });
  if (error) throw new Error(`${label} failed: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

async function lookupById(client, id) {
  if (!isUuid(id)) return null;
  const rows = await lookupPresetRowsV2(
    client,
    { target_preset_id: id, max_rows: 1 },
    `Preset lookup for ${id}`,
  );
  return rows[0] ?? null;
}

async function lookupByKey(client, entry) {
  const rows = await lookupPresetRowsV2(
    client,
    {
      target_type: entry.type || 'engine',
      target_name: entry.name,
      target_scopes: entry.scope ? [entry.scope] : null,
      target_scope_is_null: !entry.scope,
      max_rows: 20,
    },
    `Preset lookup for ${localKey(entry)}`,
  );
  return rows.find(row => row.owner_key === 'public' && row.deleted_at == null) ?? rows[0] ?? null;
}

async function findRemoteRow(client, entry) {
  const id = entry.remoteId ?? entry.id;
  const byId = await lookupById(client, id);
  if (byId) {
    assert(
      localKey(byId) === localKey(entry),
      `Remote id ${id} resolves to ${localKey(byId)}, not ${localKey(entry)}`,
    );
    return byId;
  }
  return lookupByKey(client, entry);
}

async function fetchRemoteScopeRows(client, scopes) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await lookupPresetRowsV2(
      client,
      {
        target_type: 'engine',
        target_scopes: scopes,
        include_internal_derived: false,
        max_rows: pageSize,
        page_offset: offset,
      },
      'Drum engine scope lookup',
    );
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function fetchDetailBundle(client, rowId) {
  const { data, error } = await client.rpc('kessho_get_preset_detail_v2', {
    target_preset_id: rowId,
    target_type: null,
    target_name: null,
    target_scopes: null,
    target_version_no: null,
  });
  if (error) throw new Error(`Detail backup failed for ${rowId}: ${error.message}`);
  return data;
}

function writeJsonFile(filePath, value) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(filePath, body, 'utf8');
  return {
    file: path.basename(filePath),
    rows: Array.isArray(value) ? value.length : undefined,
    bytes: Buffer.byteLength(body),
    sha256: sha256Text(body),
  };
}

async function writeAffectedBackup(client, actions, source, sourceSha256) {
  const uniqueRows = new Map();
  for (const action of actions) {
    if (action.row?.id) uniqueRows.set(action.row.id, action.row);
  }

  const detailBundles = [];
  for (const row of uniqueRows.values()) {
    detailBundles.push(await fetchDetailBundle(client, row.id));
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(root, 'backups', `supabase-drum-engine-presets-${timestamp}`);
  mkdirSync(dir, { recursive: true });
  const files = [
    writeJsonFile(path.join(dir, 'remote-detail-bundles.json'), detailBundles),
    writeJsonFile(path.join(dir, 'planned-actions.json'), actions.map(summarizeAction)),
    writeJsonFile(path.join(dir, 'source-summary.json'), source),
  ];
  const manifest = {
    createdAt: new Date().toISOString(),
    kind: 'supabase-drum-engine-preset-upsert-backup',
    dryRun: !write,
    sourcePath,
    sourceSha256,
    remoteDetailBundles: detailBundles.length,
    files,
  };
  const manifestFile = writeJsonFile(path.join(dir, 'manifest.json'), manifest);
  return {
    dir,
    manifest: path.join(dir, 'manifest.json'),
    files: [...files, manifestFile],
    manifestSha256: manifestFile.sha256,
  };
}

async function savePresetVersion(client, action) {
  const now = new Date().toISOString();
  const { row, identity, resolvedData, resolvedHash, nextVersion } = action;
  const { data, error } = await client.rpc('kessho_save_preset_v2', {
    identity_payload: {
      ...identity,
      id: row?.id ?? null,
    },
    version_payload: {
      version_no: nextVersion,
      created_by: null,
      parent_version_id: row?.latest_version_id ?? null,
      storage_mode: row ? 'checkpoint' : 'snapshot',
      note: action.versionNote,
      override_hash: resolvedHash,
      metadata_hash: null,
      patch_from_prev_hash: null,
      resolved_hash: resolvedHash,
      is_checkpoint: true,
      created_at: now,
    },
    payloads_payload: [{
      hash: resolvedHash,
      payload_kind: 'resolved',
      payload: resolvedData,
    }],
    refs_payload: [],
  });
  if (error) throw new Error(`Save failed for ${action.key}: ${error.message}`);
  return data;
}

async function verifyRemoteState(client, entries, localHashes, scopes) {
  const remoteRows = await fetchRemoteScopeRows(client, scopes);
  const bestByKey = new Map();
  for (const row of remoteRows) {
    const key = localKey(row);
    if (!bestByKey.has(key)) bestByKey.set(key, row);
  }

  const missing = [];
  const hashMismatches = [];
  for (const entry of entries) {
    const key = localKey(entry);
    const row = bestByKey.get(key);
    if (!row) {
      missing.push({ key });
      continue;
    }
    const expectedHash = localHashes.get(key);
    if (row.latest_resolved_hash !== expectedHash) {
      hashMismatches.push({
        key,
        rowId: row.id,
        expectedHash: expectedHash?.slice(0, 12) ?? null,
        actualHash: row.latest_resolved_hash?.slice(0, 12) ?? null,
      });
    }
  }

  return {
    remoteRows: remoteRows.length,
    localEntries: entries.length,
    matchedKeys: entries.length - missing.length,
    hashMatches: entries.length - missing.length - hashMismatches.length,
    missing,
    hashMismatches,
  };
}

const env = {
  ...readEnvFile(path.join(root, '.env')),
  ...readEnvFile(path.join(root, '.env.local')),
  ...process.env,
};
const supabaseUrl = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY;
assert(supabaseUrl, 'Missing VITE_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_URL.');
assert(anonKey, 'Missing VITE_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY, or SUPABASE_ANON_KEY.');

const sourceBody = readFileSync(sourcePath, 'utf8');
const sourceSha256 = sha256Text(sourceBody);
const backup = JSON.parse(sourceBody);
assert(backup.kesshoBackup === true, 'Expected a kessho backup export.');
assert(backup.exportKind === 'drum-engine-presets', 'Expected drum-engine-presets exportKind.');
assert(Array.isArray(backup.entries), 'Expected entries array.');
assert(Array.isArray(backup.failures) && backup.failures.length === 0, 'Source export has preset failures.');

const entries = backup.entries.filter(entry => entry.type === 'engine' && String(entry.scope ?? '').startsWith('drum'));
assert(entries.length === backup.entries.length, 'Source contains non-drum engine entries.');

const client = createClient(supabaseUrl, anonKey, {
  auth: {
    persistSession: false,
    storageKey: `kessho-drum-upload-${randomUUID()}`,
  },
});
const { data: authData, error: authError } = await client.auth.signInAnonymously();
if (authError) throw new Error(`Anonymous Supabase auth failed: ${authError.message}`);
assert(authData?.user?.id, 'Anonymous Supabase auth did not return a user.');

const scopes = [...new Set(entries.map(entry => entry.scope).filter(Boolean))].sort();
const localHashes = new Map();
const actions = [];
const skipped = [];
const failures = [];

const remoteBeforeRows = await fetchRemoteScopeRows(client, scopes);
for (const entry of entries) {
  try {
    const version = latestPresetVersion(entry);
    const resolvedData = canonicalizeJson(version.data);
    const resolvedHash = hashCanonicalJson(resolvedData);
    const identity = desiredIdentity(entry);
    const row = await findRemoteRow(client, entry);
    const identityChanged = identityDiffers(row, identity);
    const versionChanged = !row || row.latest_resolved_hash !== resolvedHash;
    localHashes.set(localKey(entry), resolvedHash);

    if (!identityChanged && !versionChanged) {
      skipped.push({
        key: localKey(entry),
        rowId: row.id,
        reason: 'already-current',
        resolvedHash: resolvedHash.slice(0, 12),
      });
      continue;
    }

    actions.push({
      action: row ? 'update' : 'create',
      key: localKey(entry),
      entry,
      row,
      identity,
      resolvedData,
      resolvedHash,
      versionNote: version.note || 'Drum engine preset update',
      nextVersion: row ? Number(row.latest_version_no ?? 0) + 1 : 1,
      identityChanged,
      versionChanged,
    });
  } catch (error) {
    failures.push({
      key: localKey(entry),
      reason: error.message,
    });
  }
}

const sourceSummary = {
  sourcePath,
  sourceSha256,
  exportedAt: backup.exportedAt,
  source: backup.source,
  productCore: backup.productCore,
  count: backup.count,
  entries: entries.length,
  countsByScope: backup.countsByScope,
};

let backupManifest = null;
if ((write || backupRequested) && failures.length === 0) {
  backupManifest = await writeAffectedBackup(client, actions, sourceSummary, sourceSha256);
}

const applied = [];
if (write && failures.length === 0) {
  for (const action of actions) {
    try {
      const result = await savePresetVersion(client, action);
      const rowId = result?.preset?.id ?? action.row?.id ?? null;
      const updated = (rowId ? await lookupById(client, rowId) : null) ?? await lookupByKey(client, action.entry);
      assert(updated?.latest_resolved_hash === action.resolvedHash, `${action.key} latest_resolved_hash did not update.`);
      applied.push({
        ...summarizeAction(action),
        rowId: updated.id,
        latestVersionNo: updated.latest_version_no,
      });
    } catch (error) {
      failures.push({
        key: action.key,
        reason: error.message,
      });
      break;
    }
  }
}

const verification = write && failures.length === 0
  ? await verifyRemoteState(client, entries, localHashes, scopes)
  : null;
if (verification && (verification.missing.length > 0 || verification.hashMismatches.length > 0)) {
  failures.push({
    key: 'verification',
    reason: `Remote verification failed: ${verification.missing.length} missing, ${verification.hashMismatches.length} hash mismatches.`,
  });
}

const report = {
  dryRun: !write,
  authenticated: true,
  sourcePath,
  sourceSha256,
  backup: backupManifest,
  counts: {
    sourceEntries: entries.length,
    remoteBeforeRows: remoteBeforeRows.length,
    plannedActions: actions.length,
    plannedCreates: actions.filter(action => action.action === 'create').length,
    plannedUpdates: actions.filter(action => action.action === 'update').length,
    skippedAlreadyCurrent: skipped.length,
    applied: applied.length,
    failures: failures.length,
  },
  planned: actions.map(summarizeAction),
  applied,
  skipped: skipped.slice(0, 40),
  failures,
  verification,
};

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Drum engine cloud preset ${write ? 'upload' : 'dry run'} ${failures.length ? 'failed' : 'passed'}`);
  console.log(`Source entries: ${report.counts.sourceEntries}`);
  console.log(`Remote rows before: ${report.counts.remoteBeforeRows}`);
  console.log(`Planned actions: ${report.counts.plannedActions} (${report.counts.plannedCreates} creates, ${report.counts.plannedUpdates} updates)`);
  console.log(`Skipped already current: ${report.counts.skippedAlreadyCurrent}`);
  if (backupManifest) console.log(`Backup: ${backupManifest.dir}`);
  if (write) console.log(`Applied: ${report.counts.applied}`);
  if (verification) console.log(`Verification: ${verification.hashMatches}/${verification.localEntries} hashes matched`);
  if (failures.length) {
    console.error('Failures:');
    for (const failure of failures.slice(0, 20)) {
      console.error(`- ${failure.key}: ${failure.reason}`);
    }
  }
}

if (failures.length > 0) process.exit(1);
