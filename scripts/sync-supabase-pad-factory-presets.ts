#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { getPadPreset, PAD_PRESETS } from '../src/audio/padPresets';
import { canonicalizeRecord, hashCanonicalJson } from '../src/presets/presetStorageV2';

const write = process.argv.includes('--write');
const outputJson = process.argv.includes('--json');

const OLD_NAMES_BY_ID: Record<string, string[]> = {
  init: ['Init'],
  saturated_drift: ['Saturated Drift'],
  saturated_drift_ii: [],
  deep_sub_drone: ['Deep Sub Drone'],
  glass_shimmer: ['Glass Shimmer'],
  warm_analog: ['Warm Analog'],
  digital_ice: ['Digital Ice'],
  breath: ['Breath'],
  cathedral_organ: ['Cathedral Organ'],
  pluck_bell: ['Pluck Bell'],
  soft_pluck: ['Soft Pluck'],
  harsh_pluck: ['Harsh Pluck'],
  metal_tine: ['Metal Tine'],
  poly_lead: ['Poly Lead'],
  acid_stab: ['Acid Stab'],
  muted_key: ['Muted Key'],
  glass_marimba: ['Glass Marimba'],
  sub_pluck: ['Sub Pluck'],
  classic_moog_bass: ['Classic Moog Bass'],
  sync_lead: ['Sync Lead'],
  buchla_pluck: ['Buchla Pluck'],
  sine_fold_key: ['Sine Fold Key'],
  serge_stab: ['Serge Stab'],
  folded_drift: ['Folded Drift'],
  harmonic_bloom: ['Harmonic Bloom'],
  serge_swarm: ['Serge Swarm'],
};

type PresetRow = {
  id: string;
  name: string;
  latest_version_no: number;
  latest_version_id: string | null;
  latest_resolved_hash: string | null;
  author: string;
  library: string;
};

type DesiredPreset = {
  id: string;
  name: string;
  aliases: string[];
  tags: string[];
  params: Record<string, unknown>;
  hash: string;
};

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
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

function pgClientConfig(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  const normalized = url.toString();
  const local = /(?:localhost|127\.0\.0\.1|\[::1\])/.test(normalized);
  return {
    connectionString: normalized,
    ssl: local ? false : { rejectUnauthorized: false },
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function desiredPresets(): Promise<DesiredPreset[]> {
  return Promise.all(Object.keys(PAD_PRESETS).map(async (id) => {
    const preset = getPadPreset(id);
    if (!preset) throw new Error(`Missing factory Pad preset ${id}`);
    const params = canonicalizeRecord(preset.params as Record<string, unknown>);
    return {
      id,
      name: preset.name,
      aliases: unique([preset.name, ...(OLD_NAMES_BY_ID[id] ?? [])]),
      tags: preset.tags,
      params,
      hash: await hashCanonicalJson(params),
    };
  }));
}

function sha256(body: string): string {
  return crypto.createHash('sha256').update(body).digest('hex');
}

function writeJsonFile(dir: string, name: string, rows: unknown) {
  const body = `${JSON.stringify(rows, null, 2)}\n`;
  const file = `${name}.json`;
  fs.writeFileSync(path.join(dir, file), body, 'utf8');
  return { file, bytes: Buffer.byteLength(body), sha256: sha256(body) };
}

async function backupTargetRows(client: pg.Client, targetNames: string[]) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(process.cwd(), 'backups', `supabase-pad-factory-${timestamp}`);
  fs.mkdirSync(dir, { recursive: true });

  const presets = (await client.query(
    `select * from public.presets_v2
      where owner_key = 'public' and type::text = 'engine' and scope = 'pad1'
        and deleted_at is null and lower(name) = any($1::text[])
      order by id`,
    [targetNames],
  )).rows;
  const presetIds = presets.map((row) => row.id);
  const versions = presetIds.length === 0 ? [] : (await client.query(
    'select * from public.preset_versions_v2 where preset_id = any($1::uuid[]) order by preset_id, version_no, id',
    [presetIds],
  )).rows;
  const versionIds = versions.map((row) => row.id);
  const refs = versionIds.length === 0 ? [] : (await client.query(
    `select * from public.preset_version_refs_v2
      where version_id = any($1::uuid[]) or target_preset_id = any($2::uuid[])
      order by version_id, ref_slot`,
    [versionIds, presetIds],
  )).rows;
  const hasContentRefs = (await client.query(
    "select to_regclass('public.preset_version_content_refs_v2') is not null present",
  )).rows[0]?.present === true;
  const contentRefs = !hasContentRefs || versionIds.length === 0 ? [] : (await client.query(
    'select * from public.preset_version_content_refs_v2 where version_id = any($1::uuid[]) order by version_id, ref_slot',
    [versionIds],
  )).rows;
  const hashes = unique([
    ...versions.flatMap((row) => [row.override_hash, row.metadata_hash, row.patch_from_prev_hash, row.resolved_hash]),
    ...refs.map((row) => row.override_hash),
    ...contentRefs.map((row) => row.content_hash),
  ].filter((hash): hash is string => typeof hash === 'string'));
  const payloads = hashes.length === 0 ? [] : (await client.query(
    'select * from public.preset_payloads_v2 where hash = any($1::text[]) order by hash',
    [hashes],
  )).rows;
  const legacy = (await client.query(
    `select * from public.presets
      where type = 'engine' and scope = 'pad1' and deleted_at is null
        and lower(name) = any($1::text[])
      order by id`,
    [targetNames],
  )).rows;

  const files = [
    writeJsonFile(dir, 'presets_v2', presets),
    writeJsonFile(dir, 'preset_versions_v2', versions),
    writeJsonFile(dir, 'preset_version_refs_v2', refs),
    writeJsonFile(dir, 'preset_version_content_refs_v2', contentRefs),
    writeJsonFile(dir, 'preset_payloads_v2', payloads),
    writeJsonFile(dir, 'legacy_presets', legacy),
  ];
  const manifest = {
    createdAt: new Date().toISOString(),
    kind: 'supabase-pad-factory-preset-sync-backup',
    target: { type: 'engine', scope: 'pad1', names: targetNames },
    files,
  };
  const manifestFile = writeJsonFile(dir, 'manifest', manifest);
  return { dir, manifest: manifestFile, rows: { presets: presets.length, versions: versions.length, legacy: legacy.length } };
}

async function fetchManagedRows(client: pg.Client, targetNames: string[], lock = false): Promise<PresetRow[]> {
  const result = await client.query(
    `select id, name, latest_version_no, latest_version_id, latest_resolved_hash,
            author, library::text
       from public.presets_v2
      where owner_key = 'public' and type::text = 'engine' and scope = 'pad1'
        and deleted_at is null and lower(name) = any($1::text[])
      order by id${lock ? ' for update' : ''}`,
    [targetNames],
  );
  return result.rows;
}

async function verifyDatabase(client: pg.Client, desired: DesiredPreset[], legacyOldNames: string[]) {
  const desiredNames = desired.map((preset) => preset.name.toLowerCase());
  const rows = await fetchManagedRows(client, desiredNames);
  const rowByName = new Map(rows.map((row) => [row.name.toLowerCase(), row]));
  const failures: string[] = [];

  if (rows.length !== desired.length) failures.push(`expected ${desired.length} active V2 rows, found ${rows.length}`);
  for (const preset of desired) {
    const row = rowByName.get(preset.name.toLowerCase());
    if (!row) failures.push(`missing V2 preset ${preset.name}`);
    else if (row.latest_resolved_hash !== preset.hash) failures.push(`${preset.name} has stale payload hash`);
  }

  const oldActive = (await client.query(
    `select name from public.presets_v2
      where owner_key = 'public' and type::text = 'engine' and scope = 'pad1'
        and deleted_at is null and lower(name) = any($1::text[])
        and not (lower(name) = any($2::text[]))`,
    [legacyOldNames, desiredNames],
  )).rows;
  if (oldActive.length > 0) failures.push(`old V2 rows still active: ${oldActive.map((row) => row.name).join(', ')}`);

  const legacyActive = (await client.query(
    `select name from public.presets
      where type = 'engine' and scope = 'pad1' and deleted_at is null
        and lower(name) = any($1::text[])`,
    [legacyOldNames],
  )).rows;
  if (legacyActive.length > 0) failures.push(`old legacy rows still active: ${legacyActive.map((row) => row.name).join(', ')}`);

  if (failures.length > 0) throw new Error(`Pad factory verification failed: ${failures.join('; ')}`);
  return { activeV2: rows.length, activeLegacyOld: legacyActive.length };
}

async function main() {
  const env = {
    ...readEnvFile(path.join(process.cwd(), '.env')),
    ...readEnvFile(path.join(process.cwd(), '.env.local')),
    ...process.env,
  };
  const databaseUrl = env.DATABASE_URL ?? env.SUPABASE_DATABASE_URL ?? env.SUPABASE_DB_URL;
  if (!databaseUrl) throw new Error('Missing DATABASE_URL, SUPABASE_DATABASE_URL, or SUPABASE_DB_URL');

  const desired = await desiredPresets();
  const desiredById = new Map(desired.map((preset) => [preset.id, preset]));
  const allAliases = unique(desired.flatMap((preset) => preset.aliases.map((name) => name.toLowerCase())));
  const desiredNames = desired.map((preset) => preset.name.toLowerCase());
  const legacyOldNames = unique(Object.values(OLD_NAMES_BY_ID).flat().map((name) => name.toLowerCase()));
  const client = new pg.Client(pgClientConfig(databaseUrl));
  await client.connect();

  let backup = null;
  const report = {
    dryRun: !write,
    desired: desired.length,
    existing: 0,
    create: [] as string[],
    update: [] as string[],
    unchanged: [] as string[],
    legacyArchive: [] as string[],
    backup: null as null | Awaited<ReturnType<typeof backupTargetRows>>,
    verification: null as null | Awaited<ReturnType<typeof verifyDatabase>>,
  };

  try {
    const initialRows = await fetchManagedRows(client, allAliases);
    report.existing = initialRows.length;
    const initialByName = new Map(initialRows.map((row) => [row.name.toLowerCase(), row]));

    for (const [id, preset] of desiredById) {
      const matches = preset.aliases
        .map((name) => initialByName.get(name.toLowerCase()))
        .filter((row): row is PresetRow => Boolean(row));
      if (matches.length > 1) throw new Error(`${id} has multiple active cloud rows: ${matches.map((row) => row.name).join(', ')}`);
      const row = matches[0];
      if (!row) report.create.push(preset.name);
      else if (
        row.name !== preset.name
        || row.latest_resolved_hash !== preset.hash
        || row.author !== 'factory'
        || row.library !== 'stock'
      ) report.update.push(`${row.name} → ${preset.name}`);
      else report.unchanged.push(preset.name);
    }

    const legacyRows = (await client.query(
      `select name from public.presets
        where type = 'engine' and scope = 'pad1' and deleted_at is null
          and lower(name) = any($1::text[])
        order by name`,
      [legacyOldNames],
    )).rows;
    report.legacyArchive = legacyRows.map((row) => row.name);

    if (!write) {
      if (outputJson) console.log(JSON.stringify(report, null, 2));
      else {
        console.log(`Pad cloud preset dry run: ${report.existing} existing, ${report.update.length} updates, ${report.create.length} creates, ${report.unchanged.length} unchanged`);
        console.log(`Legacy Pad rows to archive: ${report.legacyArchive.length}`);
        for (const action of [...report.update, ...report.create.map((name) => `create ${name}`)]) console.log(`- ${action}`);
      }
      return;
    }

    backup = await backupTargetRows(client, allAliases);
    report.backup = backup;

    await client.query('begin');
    try {
      await client.query("set local statement_timeout = '30s'");
      await client.query("set local lock_timeout = '5s'");
      await client.query("select pg_advisory_xact_lock(hashtext('kessho-pad-factory-preset-sync-v1'))");
      await client.query("select set_config('app.kessho_allow_preset_recycle_update', 'on', true)");

      const lockedRows = await fetchManagedRows(client, allAliases, true);
      const lockedByName = new Map(lockedRows.map((row) => [row.name.toLowerCase(), row]));

      for (const preset of desired) {
        const matches = preset.aliases
          .map((name) => lockedByName.get(name.toLowerCase()))
          .filter((row): row is PresetRow => Boolean(row));
        if (matches.length > 1) throw new Error(`${preset.id} has multiple active rows during write`);
        let row = matches[0] ?? null;

        if (!row) {
          row = (await client.query(
            `insert into public.presets_v2(
               owner_key, owner_user_id, type, scope, name, author, library, creator,
               description, tags, visibility, family_name, variant_name, archived
             ) values ('public', null, 'engine', 'pad1', $1, 'factory', 'stock', 'Kessho',
               $2, $3::text[], 'public', $1, $1, false)
             returning id, name, latest_version_no, latest_version_id, latest_resolved_hash,
                       author, library::text`,
            [preset.name, `Factory Pad preset: ${preset.tags.join(', ')}`, preset.tags],
          )).rows[0];
        } else {
          row = (await client.query(
            `update public.presets_v2
                set name = $2, author = 'factory', library = 'stock', creator = 'Kessho',
                    description = $3, tags = $4::text[], visibility = 'public',
                    family_name = $2, variant_name = $2, archived = false
              where id = $1
              returning id, name, latest_version_no, latest_version_id, latest_resolved_hash,
                        author, library::text`,
            [row.id, preset.name, `Factory Pad preset: ${preset.tags.join(', ')}`, preset.tags],
          )).rows[0];
        }

        if (row.latest_resolved_hash === preset.hash) continue;
        await client.query('select public.kessho_assert_payload_hash_matches($1, $2::jsonb)', [preset.hash, preset.params]);
        await client.query(
          `insert into public.preset_payloads_v2(hash, payload_kind, payload)
           values ($1, 'resolved', $2::jsonb)
           on conflict (hash) do update set last_seen_at = now()`,
          [preset.hash, preset.params],
        );
        await client.query(
          `insert into public.preset_versions_v2(
             preset_id, version_no, created_by, parent_version_id, storage_mode, note,
             override_hash, metadata_hash, patch_from_prev_hash, resolved_hash, is_checkpoint, created_at
           ) values ($1, $2, null, $3, $4, 'Pad synth showcase factory bank update',
             $5, null, null, $5, true, now())`,
          [row.id, Number(row.latest_version_no ?? 0) + 1, row.latest_version_id, row.latest_version_no ? 'checkpoint' : 'snapshot', preset.hash],
        );
      }

      await client.query(
        `update public.presets
            set deleted_at = coalesce(deleted_at, now()), archived = true
          where type = 'engine' and scope = 'pad1' and deleted_at is null
            and lower(name) = any($1::text[])`,
        [legacyOldNames],
      );

      report.verification = await verifyDatabase(client, desired, legacyOldNames);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }

    if (outputJson) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Pad cloud preset sync complete: ${desired.length} active V2 factory presets`);
      console.log(`Archived ${report.legacyArchive.length} legacy Pad rows`);
      console.log(`Backup: ${backup.dir}`);
    }
  } finally {
    await client.end();
  }
}

await main();
