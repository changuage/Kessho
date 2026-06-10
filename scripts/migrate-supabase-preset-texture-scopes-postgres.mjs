#!/usr/bin/env node
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const write = args.has('--write');
const outputJson = args.has('--json');

function argValue(name, fallback) {
  const prefix = `${name}=`;
  return rawArgs.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function readEnvFile(filePath) {
  try {
    return Object.fromEntries(
      require('node:fs')
        .readFileSync(filePath, 'utf8')
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
  } catch {
    return {};
  }
}

const env = {
  ...readEnvFile(path.join(process.cwd(), '.env')),
  ...readEnvFile(path.join(process.cwd(), '.env.local')),
  ...process.env,
};

const databaseUrl = env.DATABASE_URL ?? env.SUPABASE_DATABASE_URL ?? env.SUPABASE_DB_URL;
if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL, SUPABASE_DATABASE_URL, or SUPABASE_DB_URL.');
}

const backupDir = argValue('--backup-dir', path.join(tmpdir(), 'kessho-supabase-backups'));
const scopeAliases = [
  { from: 'dynamicsDrift', to: 'degradeDrift' },
  { from: 'dynamicsErosion', to: 'degradeErosion' },
];
const legacyScopes = new Set(scopeAliases.map((alias) => alias.from));
const canonicalScopes = new Set(scopeAliases.map((alias) => alias.to));
const canonicalByScope = new Map([
  ...scopeAliases.map((alias) => [alias.from, alias.to]),
  ...scopeAliases.map((alias) => [alias.to, alias.to]),
]);

function canonicalScope(scope) {
  return canonicalByScope.get(scope) ?? scope;
}

function active(row) {
  return row.deleted_at == null && row.archived !== true;
}

function rowLabel(row) {
  return `${row.type}:${row.scope ?? ''}:${row.name}`;
}

function isInternalDerived(row) {
  return String(row.name ?? '').startsWith('__derived__/')
    || (Array.isArray(row.tags) && row.tags.includes('internal-derived'));
}

function comparePreferred(left, right) {
  const leftVersion = left.latest_version_no ?? 0;
  const rightVersion = right.latest_version_no ?? 0;
  if (leftVersion !== rightVersion) return rightVersion - leftVersion;

  const leftUpdated = new Date(left.updated_at).getTime();
  const rightUpdated = new Date(right.updated_at).getTime();
  if (leftUpdated !== rightUpdated) return rightUpdated - leftUpdated;

  const leftCanonical = canonicalScopes.has(left.scope);
  const rightCanonical = canonicalScopes.has(right.scope);
  if (leftCanonical !== rightCanonical) return leftCanonical ? -1 : 1;

  const leftInternal = isInternalDerived(left);
  const rightInternal = isInternalDerived(right);
  if (leftInternal !== rightInternal) return leftInternal ? 1 : -1;

  return String(left.id).localeCompare(String(right.id));
}

function migrateTags(tags, from, to) {
  if (!Array.isArray(tags)) return [];
  return tags.map((tag) => tag === `scope:${from}` ? `scope:${to}` : tag);
}

function migrateFamilyName(familyName, from, to) {
  return familyName === `__derived__/${from}` ? `__derived__/${to}` : familyName;
}

async function queryRows(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

async function writeBackup(client) {
  await fs.mkdir(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(backupDir, `preset-v2-texture-scope-migration-${timestamp}.json`);
  const tables = [
    'presets_v2',
    'preset_versions_v2',
    'preset_version_refs_v2',
    'preset_payloads_v2',
  ];
  const data = {};
  for (const table of tables) {
    data[table] = await queryRows(client, `select * from public.${table} order by 1`);
  }
  await fs.writeFile(
    filePath,
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      migration: 'texture-degrade-drift-erosion-scope',
      data,
    }, null, 2),
    'utf8',
  );
  return filePath;
}

function buildPlan(rows) {
  const activeRows = rows.filter(active);
  const groups = new Map();
  for (const row of activeRows) {
    if (!legacyScopes.has(row.scope) && !canonicalScopes.has(row.scope)) continue;
    const key = [
      row.owner_key,
      row.type,
      canonicalScope(row.scope),
      row.name_key,
    ].join('\u001f');
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const actions = [];
  for (const group of groups.values()) {
    if (!group.some((row) => legacyScopes.has(row.scope))) continue;
    const canonical = canonicalScope(group[0].scope);
    const ordered = [...group].sort(comparePreferred);
    const keeper = ordered[0];
    const losers = ordered.slice(1);
    for (const loser of losers) {
      actions.push({
        kind: 'archive-duplicate',
        id: loser.id,
        label: rowLabel(loser),
        rewireToId: keeper.id,
        rewireToLabel: rowLabel(keeper),
      });
    }
    if (keeper.scope !== canonical) {
      actions.push({
        kind: 'update-scope',
        id: keeper.id,
        label: rowLabel(keeper),
        from: keeper.scope,
        to: canonical,
      });
    }
  }
  return actions;
}

async function applyPlan(client, rows, actions) {
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const applied = [];
  await client.query('begin');
  try {
    for (const action of actions.filter((item) => item.kind === 'archive-duplicate')) {
      const refResult = await client.query(
        'update public.preset_version_refs_v2 set target_preset_id = $1 where target_preset_id = $2',
        [action.rewireToId, action.id],
      );
      await client.query(
        "update public.presets_v2 set archived = true, deleted_at = coalesce(deleted_at, now()), updated_at = now() where id = $1",
        [action.id],
      );
      applied.push({ ...action, rewiredRefs: refResult.rowCount ?? 0 });
    }

    for (const action of actions.filter((item) => item.kind === 'update-scope')) {
      const row = rowsById.get(action.id);
      const tags = migrateTags(row?.tags, action.from, action.to);
      const familyName = migrateFamilyName(row?.family_name ?? null, action.from, action.to);
      await client.query(
        'update public.presets_v2 set scope = $2, tags = $3::text[], family_name = $4, updated_at = now() where id = $1',
        [action.id, action.to, tags, familyName],
      );
      applied.push(action);
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
  return applied;
}

async function verify(client) {
  const legacyCounts = await queryRows(
    client,
    `select type::text as type, scope, count(*)::int as count
       from public.presets_v2
      where deleted_at is null
        and archived is distinct from true
        and type::text = 'kit'
        and scope = any($1::text[])
      group by type, scope
      order by type, scope`,
    [[...legacyScopes]],
  );
  const duplicateCanonical = await queryRows(
    client,
    `select owner_key, type::text as type, scope, name_key, count(*)::int as count
       from public.presets_v2
      where deleted_at is null
        and archived is distinct from true
        and type::text = 'kit'
        and scope = any($1::text[])
      group by owner_key, type, scope, name_key
     having count(*) > 1
      order by count desc, scope, name_key`,
    [[...canonicalScopes]],
  );
  return {
    activeLegacyScopeCount: legacyCounts.reduce((sum, row) => sum + Number(row.count ?? 0), 0),
    legacyCounts,
    duplicateCanonical,
  };
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const rows = await queryRows(
    client,
    `select id, owner_key, type::text as type, scope, name, name_key, latest_version_no,
            latest_version_id, latest_resolved_hash, updated_at, archived, deleted_at,
            tags, family_name, visibility::text as visibility
       from public.presets_v2
      where type::text = 'kit'
        and scope = any($1::text[])
      order by updated_at desc, id`,
    [[...legacyScopes, ...canonicalScopes]],
  );
  const actions = buildPlan(rows);
  const backupPath = write ? await writeBackup(client) : null;
  const applied = write ? await applyPlan(client, rows, actions) : [];
  const verification = await verify(client);
  const report = {
    dryRun: !write,
    backupPath,
    scannedRows: rows.length,
    plannedActionCount: actions.length,
    plannedActions: actions.slice(0, 100),
    appliedActionCount: applied.length,
    appliedActions: applied.slice(0, 100),
    verification,
  };

  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('Supabase preset V2 Texture scope migration ' + (write ? 'write' : 'dry run'));
    if (backupPath) console.log('Backup: ' + backupPath);
    console.log('Scanned rows: ' + rows.length);
    console.log('Planned actions: ' + actions.length);
    console.log('Applied actions: ' + applied.length);
    console.log('Active legacy scope rows after run: ' + verification.activeLegacyScopeCount);
    console.log('Duplicate canonical groups after run: ' + verification.duplicateCanonical.length);
    for (const action of actions.slice(0, 12)) {
      console.log('- ' + JSON.stringify(action));
    }
  }

  if (write && (verification.activeLegacyScopeCount > 0 || verification.duplicateCanonical.length > 0)) {
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
