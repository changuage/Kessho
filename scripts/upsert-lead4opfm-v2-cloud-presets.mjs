#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path, { join, resolve } from 'node:path';
import process from 'node:process';

const root = resolve(new URL('..', import.meta.url).pathname);

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs.filter((arg) => !arg.includes('=')));
const write = args.has('--write');
const outputJson = args.has('--json');
const backupRequested = args.has('--backup');

function argValue(name, fallback) {
  const prefix = `${name}=`;
  const match = rawArgs.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const assetDir = argValue('--asset-dir', process.env.LEAD4OPFM_V2_ASSET_DIR || join(homedir(), 'Downloads'));
const cloudPayloadPath = join(assetDir, 'kessho-lead4opfm-v2-cloud-upsert-payload.json');
const localBackupPath = join(assetDir, 'kessho-lead4opfm-v2-local-import-backup.json');

const PRESET_ROW_SELECT = [
  'id',
  'owner_key',
  'type',
  'scope',
  'name',
  'name_key',
  'author',
  'library',
  'creator',
  'description',
  'tags',
  'visibility',
  'family_name',
  'variant_name',
  'variant_rank',
  'latest_version_no',
  'latest_version_id',
  'latest_resolved_hash',
  'latest_metadata_hash',
  'archived',
  'deleted_at',
  'created_at',
  'updated_at',
].join(',');

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
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
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
  if (Array.isArray(value)) return value.map((item) => canonicalizeJson(item));
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

function keyForAction(action) {
  return action.renameTo || action.name || action.payload?.name || action.match?.currentName || action.rowId;
}

function normalizeTags(tags) {
  return Array.isArray(tags)
    ? tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];
}

function rowIsActive(row) {
  return Boolean(row && row.deleted_at == null && row.archived !== true);
}

function tagsEqual(left, right) {
  const leftTags = normalizeTags(left).sort();
  const rightTags = normalizeTags(right).sort();
  return leftTags.length === rightTags.length && leftTags.every((tag, index) => tag === rightTags[index]);
}

function desiredIdentity(action, backupEntry) {
  const preset = action.payload;
  return {
    owner_key: 'public',
    owner_user_id: null,
    type: 'engine',
    scope: 'lead4opfm',
    name: action.renameTo || action.name || preset.name,
    author: action.author || 'factory',
    library: action.library || 'cloud',
    creator: backupEntry?.creator ?? 'Kessho Lead4opFM v2 architecture audit',
    description: backupEntry?.description ?? 'Lead4opFM v2 preset',
    tags: normalizeTags(action.tags ?? backupEntry?.tags ?? ['lead4opfm', 'fm', 'v2']),
    visibility: action.visibility || 'public',
    family_name: backupEntry?.familyName ?? preset.name,
    variant_name: backupEntry?.variantName ?? preset.name,
    variant_rank: backupEntry?.variantRank ?? null,
    forked_from: null,
    rating: null,
  };
}

function identityDiffers(row, identity) {
  if (!row) return true;
  return row.name !== identity.name
    || row.author !== identity.author
    || row.library !== identity.library
    || row.visibility !== identity.visibility
    || row.creator !== identity.creator
    || row.description !== identity.description
    || row.family_name !== identity.family_name
    || row.variant_name !== identity.variant_name
    || (row.variant_rank ?? null) !== (identity.variant_rank ?? null)
    || !tagsEqual(row.tags, identity.tags);
}

async function fetchAll(client, table, select, query = (builder) => builder, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await query(client.from(table).select(select).range(from, to));
    if (error) throw new Error(`${table} fetch failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function fetchPresetById(client, rowId) {
  const { data, error } = await client
    .from('presets_v2')
    .select(PRESET_ROW_SELECT)
    .eq('id', rowId)
    .limit(1);
  if (error) throw new Error(`Preset lookup failed for ${rowId}: ${error.message}`);
  return data?.[0] ?? null;
}

function databaseNameKey(name) {
  return String(name ?? '').trim().toLowerCase();
}

async function fetchPresetByName(client, name) {
  const { data, error } = await client
    .from('presets_v2')
    .select(PRESET_ROW_SELECT)
    .eq('owner_key', 'public')
    .eq('type', 'engine')
    .eq('scope', 'lead4opfm')
    .eq('name_key', databaseNameKey(name))
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`Preset lookup failed for ${name}: ${error.message}`);
  return data?.[0] ?? null;
}

async function writeBackup(client) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(root, 'backups', `lead4opfm-v2-cloud-upsert-${timestamp}`);
  mkdirSync(dir, { recursive: true });

  const tables = {
    presets_v2: await fetchAll(client, 'presets_v2', '*', (builder) => builder.order('id', { ascending: true })),
    preset_versions_v2: await fetchAll(client, 'preset_versions_v2', '*', (builder) => builder.order('preset_id', { ascending: true }).order('version_no', { ascending: true })),
    preset_version_refs_v2: await fetchAll(client, 'preset_version_refs_v2', '*', (builder) => builder.order('version_id', { ascending: true }).order('ref_slot', { ascending: true })),
    preset_payloads_v2: await fetchAll(client, 'preset_payloads_v2', '*', (builder) => builder.order('hash', { ascending: true })),
  };

  const files = [];
  for (const [name, rows] of Object.entries(tables)) {
    const body = `${JSON.stringify(rows, null, 2)}\n`;
    const filePath = join(dir, `${name}.json`);
    writeFileSync(filePath, body, 'utf8');
    files.push({
      file: `${name}.json`,
      rows: rows.length,
      bytes: Buffer.byteLength(body),
      sha256: createHash('sha256').update(body).digest('hex'),
    });
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    dryRun: !write,
    kind: 'lead4opfm-v2-cloud-upsert-backup',
    files,
  };
  const manifestBody = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(join(dir, 'manifest.json'), manifestBody, 'utf8');
  return {
    dir,
    manifest: join(dir, 'manifest.json'),
    files,
    manifestSha256: createHash('sha256').update(manifestBody).digest('hex'),
  };
}

async function savePresetVersion(client, action, row, identity, resolvedData, resolvedHash) {
  const nextVersion = row ? Number(row.latest_version_no ?? 0) + 1 : 1;
  const now = new Date().toISOString();
  const payload = {
    hash: resolvedHash,
    payload_kind: 'resolved',
    payload: canonicalizeJson(resolvedData),
  };
  const { data, error } = await client.rpc('kessho_save_preset_v2', {
    identity_payload: {
      ...identity,
      id: row?.id ?? null,
    },
    version_payload: {
      version_no: nextVersion,
      parent_version_id: row?.latest_version_id ?? null,
      storage_mode: nextVersion === 1 ? 'snapshot' : 'checkpoint',
      note: action.versionNote || 'Lead4opFM v2 preset update',
      override_hash: resolvedHash,
      metadata_hash: null,
      patch_from_prev_hash: null,
      resolved_hash: resolvedHash,
      is_checkpoint: true,
      created_at: now,
    },
    payloads_payload: [payload],
    refs_payload: [],
  });
  if (error) throw new Error(`V2 save failed for ${identity.name}: ${error.message}`);
  return data;
}

async function archivePreset(client, rowId) {
  const { data, error } = await client.rpc('kessho_soft_delete_preset_v2', {
    target_preset_id: rowId,
  });
  if (error) throw new Error(`Archive failed for ${rowId}: ${error.message}`);
  return data === true;
}

const env = {
  ...readEnvFile(join(root, '.env')),
  ...readEnvFile(join(root, '.env.local')),
  ...process.env,
};
const supabaseUrl = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert(supabaseUrl, 'Missing VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
assert(anonKey, 'Missing VITE_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');

const cloudPayload = readJson(cloudPayloadPath);
const localBackup = readJson(localBackupPath);
assert(cloudPayload.schema === 'kessho-lead4opfm-v2-cloud-upsert-payload-v1', 'Unexpected Lead4opFM v2 cloud payload schema');
assert(localBackup.kesshoBackup === true && Array.isArray(localBackup.entries), 'Invalid Lead4opFM v2 local backup');

const backupEntryByPresetName = new Map(
  localBackup.entries.map((entry) => [entry.versions?.[0]?.data?.name ?? entry.name, entry]),
);
const client = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false },
});

let authUser = null;
try {
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  authUser = data.user ?? null;
} catch (error) {
  if (write) throw new Error(`Anonymous Supabase auth is required for write mode: ${error.message}`);
}

const backup = (write || backupRequested) ? await writeBackup(client) : null;
const report = {
  dryRun: !write,
  authenticated: Boolean(authUser),
  backup,
  counts: {
    actions: cloudPayload.actions.length,
    upsertVersion: 0,
    createPreset: 0,
    archiveOrMerge: 0,
    skippedAlreadyCurrent: 0,
    missingTargets: 0,
    alreadyArchived: 0,
  },
  applied: [],
  skipped: [],
  failures: [],
};

for (const action of cloudPayload.actions) {
  try {
    if (action.action === 'archive_or_merge') {
      report.counts.archiveOrMerge += 1;
      const row = await fetchPresetById(client, action.rowId);
      if (!row) {
        report.counts.missingTargets += 1;
        report.skipped.push({ action: action.action, name: action.name, rowId: action.rowId, reason: 'missing' });
        continue;
      }
      if (!rowIsActive(row)) {
        report.counts.alreadyArchived += 1;
        report.skipped.push({ action: action.action, name: action.name, rowId: action.rowId, reason: 'already-archived' });
        continue;
      }
      if (write) {
        const archived = await archivePreset(client, action.rowId);
        assert(archived, `Archive RPC returned false for ${action.rowId}`);
      }
      report.applied.push({ action: action.action, name: action.name, rowId: action.rowId });
      continue;
    }

    assert(action.payload && typeof action.payload === 'object', `${keyForAction(action)} missing payload`);
    const backupEntry = backupEntryByPresetName.get(action.payload.name);
    const identity = desiredIdentity(action, backupEntry);
    const resolvedData = canonicalizeJson(action.payload);
    const resolvedHash = hashCanonicalJson(resolvedData);
    const row = action.match?.rowId
      ? await fetchPresetById(client, action.match.rowId)
      : await fetchPresetByName(client, action.name || action.payload.name);
    const existingByTargetName = row ? null : await fetchPresetByName(client, identity.name);
    const targetRow = row ?? existingByTargetName;
    const needsIdentity = identityDiffers(targetRow, identity);
    const needsVersion = !targetRow || targetRow.latest_resolved_hash !== resolvedHash;

    if (action.action === 'upsert_version') report.counts.upsertVersion += 1;
    if (action.action === 'create_preset') report.counts.createPreset += 1;

    if (!needsIdentity && !needsVersion) {
      report.counts.skippedAlreadyCurrent += 1;
      report.skipped.push({
        action: action.action,
        name: identity.name,
        rowId: targetRow.id,
        resolvedHash: resolvedHash.slice(0, 12),
        reason: 'already-current',
      });
      continue;
    }

    if (action.action === 'upsert_version' && !targetRow) {
      report.counts.missingTargets += 1;
      report.failures.push({
        action: action.action,
        name: identity.name,
        rowId: action.match?.rowId ?? null,
        reason: 'target-row-missing',
      });
      continue;
    }

    if (write) {
      await savePresetVersion(client, action, targetRow, identity, resolvedData, resolvedHash);
      const updated = targetRow?.id
        ? await fetchPresetById(client, targetRow.id)
        : await fetchPresetByName(client, identity.name);
      assert(updated?.latest_resolved_hash === resolvedHash, `${identity.name} latest_resolved_hash did not update after save`);
    }

    report.applied.push({
      action: action.action,
      name: identity.name,
      rowId: targetRow?.id ?? null,
      nextVersion: targetRow ? Number(targetRow.latest_version_no ?? 0) + 1 : 1,
      resolvedHash: resolvedHash.slice(0, 12),
      identityChanged: needsIdentity,
      versionChanged: needsVersion,
    });
  } catch (error) {
    report.failures.push({
      action: action.action,
      name: keyForAction(action),
      reason: error.message,
    });
  }
}

if (report.failures.length > 0) {
  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.error(`Lead4opFM v2 cloud upsert ${write ? 'write' : 'dry run'} failed with ${report.failures.length} failure(s).`);
    for (const failure of report.failures.slice(0, 20)) {
      console.error(`- ${failure.action} ${failure.name}: ${failure.reason}`);
    }
  }
  process.exit(1);
}

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Lead4opFM v2 cloud upsert ${write ? 'write' : 'dry run'} passed`);
  console.log(`Authenticated: ${report.authenticated ? 'yes' : 'no'}`);
  if (backup) console.log(`Backup: ${backup.dir}`);
  console.log(`Actions ready/applied: ${report.applied.length}; skipped current: ${report.counts.skippedAlreadyCurrent}; already archived: ${report.counts.alreadyArchived}`);
}
