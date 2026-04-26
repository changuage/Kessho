import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../cloud/supabase';
import { getVersionData } from './codec';
import { loadFactoryPresetV2Phases } from './factoryPresets';
import { getPresetChildSpecs } from './presetStorageV2';
import { SupabasePresetStore } from './SupabasePresetStore';
import {
  extractPresetVersionMetadata,
  getPresetScope,
  normalizePresetEntry,
} from './presetUtils';
import type { PresetEntry, PresetLevel } from './types';

type MigrationPhase =
  | 'stock-l1'
  | 'stock-l2'
  | 'stock-l3'
  | 'legacy-l1-l3'
  | 'string-waves';

interface LegacyPresetRow {
  id: string;
  user_id: string | null;
  type: string;
  scope: string | null;
  name: string;
  author: string;
  library: string;
  creator: string | null;
  description: string | null;
  tags: string[] | null;
  visibility: string;
  family_name: string | null;
  variant_name: string | null;
  variant_rank: number | null;
  plays: number | null;
  versions: unknown;
  current_version: number;
  created_at: string;
  updated_at: string;
  rating: number | null;
}

export interface PresetV2MigrationOptions {
  dryRun?: boolean;
  confirm?: 'MIGRATE_PRESETS_V2';
  includeStock?: boolean;
  includeLegacyL1L3?: boolean;
  includeStringWaves?: boolean;
}

interface MigrationPhaseReport {
  phase: MigrationPhase;
  candidates: number;
  wouldWrite: number;
  inserted: number;
  skippedExisting: number;
  skippedInvalid: number;
  errors: Array<{ name: string; message: string }>;
}

export interface PresetV2MigrationReport {
  dryRun: boolean;
  canWrite: boolean;
  userId: string | null;
  phases: MigrationPhaseReport[];
}

export interface StringWavesOptimizationReport {
  dryRun: boolean;
  canWrite: boolean;
  userId: string | null;
  childPresets: Array<{
    slot: string;
    type: PresetLevel;
    scope: string;
    name: string;
    version: number;
    written: boolean;
  }>;
  stringWavesVersion: number;
  stringWavesWritten: boolean;
  latestRefCount: number;
}

interface V2ExistingRow {
  type: string;
  scope: string | null;
  name: string;
  latest_version_no: number;
}

function createPhaseReport(phase: MigrationPhase, candidates: number): MigrationPhaseReport {
  return {
    phase,
    candidates,
    wouldWrite: 0,
    inserted: 0,
    skippedExisting: 0,
    skippedInvalid: 0,
    errors: [],
  };
}

function normalizeLegacyRow(row: LegacyPresetRow): PresetEntry | null {
  return normalizePresetEntry({
    id: row.id,
    type: row.type as PresetLevel,
    scope: row.scope ?? undefined,
    engine: row.type === 'engine' ? (row.scope ?? undefined) : undefined,
    source: row.type !== 'engine' ? (row.scope ?? undefined) : undefined,
    name: row.name,
    author: row.author,
    library: row.library,
    creator: row.creator ?? undefined,
    description: row.description ?? undefined,
    visibility: row.visibility,
    familyName: row.family_name ?? row.name,
    variantName: row.variant_name ?? row.name,
    variantRank: row.variant_rank ?? undefined,
    tags: row.tags ?? [],
    versions: Array.isArray(row.versions) ? row.versions : [],
    currentVersion: row.current_version,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    playCount: row.plays ?? undefined,
    rating: row.rating ?? undefined,
  });
}

function getLogicalKey(entry: PresetEntry): string {
  return [
    entry.type,
    getPresetScope(entry, entry.type) ?? '',
    entry.name.trim().toLowerCase(),
  ].join(':');
}

function getLogicalKeyFromParts(type: string, scope: string | null | undefined, name: string): string {
  return [
    type,
    scope ?? '',
    name.trim().toLowerCase(),
  ].join(':');
}

function dedupeEntriesByLogicalKey(entries: PresetEntry[]): PresetEntry[] {
  const byKey = new Map<string, PresetEntry>();
  for (const entry of entries) {
    const key = getLogicalKey(entry);
    const existing = byKey.get(key);
    if (!existing || existing.updatedAt < entry.updatedAt || existing.currentVersion < entry.currentVersion) {
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()];
}

function makeLatestOnlyEntry(entry: PresetEntry, notePrefix: string): PresetEntry | null {
  const normalized = normalizePresetEntry(entry);
  if (!normalized) return null;

  const latestData = getVersionData(normalized);
  if (!latestData) return null;

  const currentVersion = normalized.versions.find(version => version.v === normalized.currentVersion)
    ?? normalized.versions[normalized.versions.length - 1];
  const metadata = extractPresetVersionMetadata(currentVersion);
  const timestamp = Date.now();
  const scope = normalized.type === 'state'
    ? 'global'
    : getPresetScope(normalized, normalized.type);

  return {
    ...normalized,
    id: undefined,
    remoteId: undefined,
    scope,
    engine: normalized.type === 'engine' ? scope : undefined,
    source: normalized.type === 'kit' || normalized.type === 'source' ? scope : undefined,
    visibility: 'public',
    versions: [{
      v: 1,
      note: `${notePrefix}: ${normalized.name}`,
      timestamp,
      data: latestData,
      ...(metadata || {}),
    }],
    currentVersion: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function makePresetEntry(
  type: PresetLevel,
  scope: string,
  name: string,
  data: Record<string, unknown>,
  note: string,
  version: number,
  timestamp: number,
): PresetEntry {
  return {
    type,
    scope,
    engine: type === 'engine' ? scope : undefined,
    source: type === 'kit' || type === 'source' ? scope : undefined,
    name,
    author: 'user',
    library: 'cloud',
    creator: 'Kessho Migration',
    visibility: 'public',
    familyName: name,
    variantName: name,
    tags: ['migration', 'string-waves'],
    versions: [{
      v: version,
      note,
      timestamp,
      data,
    }],
    currentVersion: version,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function saveAsNextVersion(
  store: SupabasePresetStore,
  type: PresetLevel,
  scope: string,
  name: string,
  data: Record<string, unknown>,
  note: string,
): Promise<number> {
  const timestamp = Date.now();
  const existing = await store.load(type, name, scope);
  if (!existing) {
    await store.save(makePresetEntry(type, scope, name, data, note, 1, timestamp));
    return 1;
  }

  const maxVersion = Math.max(0, ...existing.versions.map(version => version.v));
  existing.versions.push({
    v: maxVersion + 1,
    note,
    timestamp,
    data,
  });
  existing.currentVersion = maxVersion + 1;
  existing.updatedAt = timestamp;
  existing.visibility = 'public';
  existing.library = existing.library === 'stock' ? 'cloud' : existing.library;
  await store.save(existing);
  return existing.currentVersion;
}

async function countLatestRefsForPreset(
  client: SupabaseClient,
  type: PresetLevel,
  scope: string,
  name: string,
): Promise<number> {
  const { data: presetRows, error: presetError } = await client
    .from('presets_v2')
    .select('latest_version_id')
    .eq('type', type)
    .eq('scope', scope)
    .eq('name', name)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (presetError) {
    throw new Error(`String Waves ref lookup failed: ${presetError.message}`);
  }

  const latestVersionId = (presetRows?.[0] as { latest_version_id?: string | null } | undefined)?.latest_version_id;
  if (!latestVersionId) return 0;

  const { count, error: refError } = await client
    .from('preset_version_refs_v2')
    .select('*', { count: 'exact', head: true })
    .eq('version_id', latestVersionId);

  if (refError) {
    throw new Error(`String Waves latest-ref count failed: ${refError.message}`);
  }

  return count ?? 0;
}

async function ensureAnonymousAuth(client: SupabaseClient, store: SupabasePresetStore): Promise<string | null> {
  const { data: { session } } = await client.auth.getSession();
  if (session?.user) {
    store.setUserId(session.user.id, session.user.is_anonymous ?? false);
    return session.user.id;
  }

  const { data, error } = await client.auth.signInAnonymously();
  if (error) {
    throw new Error(`Anonymous auth failed: ${error.message}`);
  }
  if (data.user) {
    store.setUserId(data.user.id, true);
    return data.user.id;
  }
  return null;
}

async function assertV2Schema(client: SupabaseClient): Promise<void> {
  const { error } = await client
    .from('presets_v2')
    .select('id')
    .limit(1);

  if (error) {
    throw new Error(`V2 schema is not available: ${error.message}`);
  }
}

async function fetchExistingV2Keys(client: SupabaseClient): Promise<Set<string>> {
  const keys = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from('presets_v2')
      .select('type, scope, name, latest_version_no')
      .range(from, to);

    if (error) {
      throw new Error(`V2 existing-key fetch failed: ${error.message}`);
    }

    const page = (data ?? []) as V2ExistingRow[];
    for (const row of page) {
      if (row.latest_version_no > 0) {
        keys.add(getLogicalKeyFromParts(row.type, row.scope, row.name));
      }
    }
    if (page.length < pageSize) break;
  }

  return keys;
}

async function migrateEntries(
  store: SupabasePresetStore,
  phase: MigrationPhase,
  candidates: PresetEntry[],
  canWrite: boolean,
  notePrefix: string,
  existingKeys: Set<string>,
): Promise<MigrationPhaseReport> {
  const entries = dedupeEntriesByLogicalKey(candidates);
  const report = createPhaseReport(phase, entries.length);
  console.info(`[Preset V2 Migration] ${phase} started (${entries.length} candidates).`);

  for (const candidate of entries) {
    const entry = makeLatestOnlyEntry(candidate, notePrefix);
    if (!entry) {
      report.skippedInvalid += 1;
      continue;
    }

    try {
      const logicalKey = getLogicalKey(entry);
      if (existingKeys.has(logicalKey)) {
        report.skippedExisting += 1;
        continue;
      }

      report.wouldWrite += 1;
      if (canWrite) {
        await store.save(entry);
        report.inserted += 1;
        if (report.inserted % 25 === 0 || report.inserted === report.wouldWrite) {
          console.info(`[Preset V2 Migration] ${phase} write progress.`, {
            inserted: report.inserted,
            candidates: report.candidates,
            skippedExisting: report.skippedExisting,
            skippedInvalid: report.skippedInvalid,
            errors: report.errors.length,
          });
        }
      }
      existingKeys.add(logicalKey);
    } catch (error) {
      report.errors.push({
        name: candidate.name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.info(`[Preset V2 Migration] ${phase} complete.`, {
    candidates: report.candidates,
    wouldWrite: report.wouldWrite,
    inserted: report.inserted,
    skippedExisting: report.skippedExisting,
    skippedInvalid: report.skippedInvalid,
    errors: report.errors.length,
  });
  return report;
}

async function fetchLegacyL1L3(client: SupabaseClient): Promise<PresetEntry[]> {
  const rows: LegacyPresetRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await client
      .from('presets')
      .select('*')
      .in('type', ['engine', 'kit', 'source'])
      .range(from, to)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Legacy L1-L3 fetch failed: ${error.message}`);
    }

    const page = (data ?? []) as LegacyPresetRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows
    .map(normalizeLegacyRow)
    .filter((entry): entry is PresetEntry => Boolean(entry));
}

async function fetchLegacyStringWaves(client: SupabaseClient): Promise<PresetEntry | null> {
  const { data, error } = await client
    .from('presets')
    .select('*')
    .eq('type', 'state')
    .ilike('name', 'String Waves')
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    throw new Error(`Legacy String Waves fetch failed: ${error.message}`);
  }

  const entries = ((data ?? []) as LegacyPresetRow[])
    .map(normalizeLegacyRow)
    .filter((entry): entry is PresetEntry => Boolean(entry))
    .filter(entry => entry.name.trim().toLowerCase() === 'string waves');

  return dedupeEntriesByLogicalKey(entries)[0] ?? null;
}

export async function runPresetV2Migration(
  options: PresetV2MigrationOptions = {},
): Promise<PresetV2MigrationReport> {
  const dryRun = options.dryRun !== false;
  const canWrite = !dryRun && options.confirm === 'MIGRATE_PRESETS_V2';
  const client = getSupabase();
  if (!client) {
    throw new Error('Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  const store = new SupabasePresetStore(client);
  const userId = await ensureAnonymousAuth(client, store);
  await assertV2Schema(client);
  const existingKeys = await fetchExistingV2Keys(client);

  const includeStock = options.includeStock !== false;
  const includeLegacyL1L3 = options.includeLegacyL1L3 !== false;
  const includeStringWaves = options.includeStringWaves !== false;
  const phases: MigrationPhaseReport[] = [];
  console.info(`[Preset V2 Migration] Loaded ${existingKeys.size} existing V2 preset keys.`);
  const factory = await loadFactoryPresetV2Phases();

  if (includeStock) {
    phases.push(await migrateEntries(store, 'stock-l1', factory.l1, canWrite, 'stock L1 seed', existingKeys));
    phases.push(await migrateEntries(store, 'stock-l2', factory.l2, canWrite, 'stock L2 seed', existingKeys));
    phases.push(await migrateEntries(store, 'stock-l3', factory.l3, canWrite, 'stock L3 seed', existingKeys));
  }

  if (includeLegacyL1L3) {
    const legacyEntries = await fetchLegacyL1L3(client);
    phases.push(await migrateEntries(store, 'legacy-l1-l3', legacyEntries, canWrite, 'legacy latest migration', existingKeys));
  }

  if (includeStringWaves) {
    const legacyStringWaves = await fetchLegacyStringWaves(client);
    const stockStringWaves = factory.l4.find(entry => entry.name.trim().toLowerCase() === 'string waves') ?? null;
    const stringWaves = legacyStringWaves ?? stockStringWaves;
    phases.push(await migrateEntries(
      store,
      'string-waves',
      stringWaves ? [{ ...stringWaves, scope: 'global' }] : [],
      canWrite,
      'canonical L4 migration',
      existingKeys,
    ));
  }

  return {
    dryRun,
    canWrite,
    userId,
    phases,
  };
}

export async function verifyPresetV2Migration(): Promise<{
  presets: number;
  versions: number;
  refs: number;
  payloads: number;
}> {
  const client = getSupabase();
  if (!client) {
    throw new Error('Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  const [
    presets,
    versions,
    refs,
    payloads,
  ] = await Promise.all([
    client.from('presets_v2').select('*', { count: 'exact', head: true }),
    client.from('preset_versions_v2').select('*', { count: 'exact', head: true }),
    client.from('preset_version_refs_v2').select('*', { count: 'exact', head: true }),
    client.from('preset_payloads_v2').select('*', { count: 'exact', head: true }),
  ]);

  for (const result of [presets, versions, refs, payloads]) {
    if (result.error) {
      throw new Error(`V2 verification failed: ${result.error.message}`);
    }
  }

  return {
    presets: presets.count ?? 0,
    versions: versions.count ?? 0,
    refs: refs.count ?? 0,
    payloads: payloads.count ?? 0,
  };
}

export async function optimizeStringWavesV2(
  options: Pick<PresetV2MigrationOptions, 'dryRun' | 'confirm'> = {},
): Promise<StringWavesOptimizationReport> {
  const dryRun = options.dryRun !== false;
  const canWrite = !dryRun && options.confirm === 'MIGRATE_PRESETS_V2';
  const client = getSupabase();
  if (!client) {
    throw new Error('Supabase is not configured. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  const store = new SupabasePresetStore(client);
  const userId = await ensureAnonymousAuth(client, store);
  await assertV2Schema(client);

  const stringWaves = await store.load('state', 'String Waves', 'global');
  const stateData = stringWaves ? getVersionData(stringWaves) : null;
  if (!stringWaves || !stateData) {
    throw new Error('String Waves was not found in V2. Run the V2 migration first.');
  }

  const timestamp = Date.now();
  const childPresets: StringWavesOptimizationReport['childPresets'] = [];
  for (const spec of getPresetChildSpecs('state', 'global')) {
    const childData = spec.extract(stateData as never);
    if (!Object.keys(childData).length) continue;

    const childName = `String Waves ${spec.slot[0]?.toUpperCase() ?? ''}${spec.slot.slice(1)}`;
    const existing = await store.load(spec.type, childName, spec.scope);
    const nextVersion = existing
      ? Math.max(0, ...existing.versions.map(version => version.v)) + 1
      : 1;

    if (canWrite) {
      await saveAsNextVersion(
        store,
        spec.type,
        spec.scope,
        childName,
        childData,
        'String Waves child extraction',
      );
    }

    childPresets.push({
      slot: spec.slot,
      type: spec.type,
      scope: spec.scope,
      name: childName,
      version: nextVersion,
      written: canWrite,
    });
  }

  const currentVersion = stringWaves.versions.find(version => version.v === stringWaves.currentVersion)
    ?? stringWaves.versions[stringWaves.versions.length - 1];
  const metadata = extractPresetVersionMetadata(currentVersion);
  const nextStringWavesVersion = Math.max(0, ...stringWaves.versions.map(version => version.v)) + 1;
  if (canWrite) {
    stringWaves.versions.push({
      v: nextStringWavesVersion,
      note: 'String Waves V2 ref optimization',
      timestamp,
      data: stateData,
      ...(metadata || {}),
    });
    stringWaves.currentVersion = nextStringWavesVersion;
    stringWaves.updatedAt = timestamp;
    stringWaves.visibility = 'public';
    await store.save(stringWaves);
  }

  const latestRefCount = canWrite
    ? await countLatestRefsForPreset(client, 'state', 'global', 'String Waves')
    : 0;

  const report: StringWavesOptimizationReport = {
    dryRun,
    canWrite,
    userId,
    childPresets,
    stringWavesVersion: nextStringWavesVersion,
    stringWavesWritten: canWrite,
    latestRefCount,
  };
  console.info(`[Preset V2 Migration] String Waves optimization ${dryRun ? 'dry run' : 'write run'} complete.`, report);
  return report;
}
