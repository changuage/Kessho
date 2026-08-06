#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;

const cwd = process.cwd();
const args = process.argv.slice(2);
const outputJson = args.includes('--json');
const outputArg = args.find((arg) => arg.startsWith('--output='));
const outputPath = outputArg ? path.resolve(cwd, outputArg.slice('--output='.length)) : null;

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator);
        let value = line.slice(separator + 1).trim();
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

function postgresConfig(connectionString) {
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  const normalized = url.toString();
  const local = /(?:localhost|127\.0\.0\.1|\[::1\])/.test(normalized);
  return {
    connectionString: normalized,
    ssl: local ? false : { rejectUnauthorized: false },
  };
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

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function hashCanonical(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function jsonBytes(value) {
  return Buffer.byteLength(canonicalJson(value), 'utf8');
}

function lowerFirst(value) {
  return value ? `${value[0].toLowerCase()}${value.slice(1)}` : value;
}

function stripPrefix(key, pattern) {
  const match = key.match(pattern);
  return match ? lowerFirst(match[1]) : `__unmapped__${key}`;
}

function parseParamRegistry() {
  const source = fs.readFileSync(path.join(cwd, 'src/presets/ParamRegistry.ts'), 'utf8');
  const entries = [];
  const pattern = /^\s*([A-Za-z0-9_]+):\s*\{\s*level:\s*([1-4]),\s*scope:\s*'([^']+)'\s*\}/gm;
  for (const match of source.matchAll(pattern)) {
    entries.push({ key: match[1], level: Number(match[2]), scope: match[3] });
  }
  return entries;
}

function parsePadKeyMaps() {
  const source = fs.readFileSync(path.join(cwd, 'src/audio/padPresets.ts'), 'utf8');
  const start = source.indexOf('export const PAD1_TO_PAD2_KEY');
  const end = source.indexOf('\n};', start);
  if (start < 0 || end < 0) throw new Error('Could not locate PAD1_TO_PAD2_KEY');
  const block = source.slice(start, end);
  const pad1ToPad2 = new Map();
  for (const match of block.matchAll(/([A-Za-z0-9_]+):\s*'([A-Za-z0-9_]+)'/g)) {
    pad1ToPad2.set(match[1], match[2]);
  }
  return {
    pad1ToPad2,
    pad2ToPad1: new Map([...pad1ToPad2].map(([left, right]) => [right, left])),
  };
}

const { pad1ToPad2, pad2ToPad1 } = parsePadKeyMaps();

const candidateDefinitions = [
  {
    id: 'granularVoice',
    scopes: ['granularVoice1', 'granularVoice2', 'granularVoice3', 'granularVoice4'],
    normalizeKey: (key) => stripPrefix(key, /^granularV[1-4](.+)$/),
  },
  {
    id: 'dynamicsEq',
    scopes: ['dynamicsEq1', 'dynamicsEq2'],
    normalizeKey: (key) => stripPrefix(key, /^dynamicsEq[12](.+)$/),
  },
  {
    id: 'insectsVoice',
    scopes: ['insects1', 'insects2'],
    normalizeKey: (key, scope) => scope === 'insects1'
      ? stripPrefix(key, /^insects(.+)$/)
      : stripPrefix(key, /^insects2(.+)$/),
  },
  {
    id: 'padVoice',
    scopes: ['pad1', 'pad2'],
    normalizeKey: (key, scope) => {
      if (scope === 'pad1') return pad1ToPad2.has(key) ? key : `__pad1_extension__${key}`;
      return pad2ToPad1.get(key) ?? `__pad2_extension__${key}`;
    },
  },
  {
    id: 'leadVoiceSettings',
    scopes: ['lead1', 'lead2'],
    normalizeKey: (key) => stripPrefix(key, /^lead[12](.+)$/),
  },
];

function normalizeRecord(record, definition, scope) {
  return Object.fromEntries(
    Object.entries(record ?? {})
      .map(([key, value]) => [definition.normalizeKey(key, scope), value])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function structuralReport(registryEntries, definition) {
  const byScope = Object.fromEntries(definition.scopes.map((scope) => [scope, []]));
  for (const entry of registryEntries) {
    if (!definition.scopes.includes(entry.scope)) continue;
    byScope[entry.scope].push(definition.normalizeKey(entry.key, entry.scope));
  }
  for (const keys of Object.values(byScope)) keys.sort();
  const sets = Object.values(byScope).map((keys) => new Set(keys));
  const intersection = sets.length === 0
    ? []
    : [...sets[0]].filter((key) => sets.every((set) => set.has(key))).sort();
  const union = [...new Set(Object.values(byScope).flat())].sort();
  return {
    id: definition.id,
    fieldCounts: Object.fromEntries(Object.entries(byScope).map(([scope, keys]) => [scope, keys.length])),
    sharedFieldCount: intersection.length,
    unionFieldCount: union.length,
    exactSchemaMatch: Object.values(byScope).every((keys) => (
      keys.length === union.length && keys.every((key, index) => key === union[index])
    )),
    scopeOnlyFields: Object.fromEntries(
      Object.entries(byScope).map(([scope, keys]) => [scope, keys.filter((key) => !intersection.includes(key))]),
    ),
  };
}

function contentReuseReport(items) {
  const hashes = new Map();
  let logicalBytes = 0;
  for (const item of items) {
    const bytes = jsonBytes(item.content);
    logicalBytes += bytes;
    const hash = hashCanonical(item.content);
    if (!hashes.has(hash)) hashes.set(hash, bytes);
  }
  const uniqueBytes = [...hashes.values()].reduce((sum, bytes) => sum + bytes, 0);
  return {
    references: items.length,
    uniqueHashes: hashes.size,
    logicalCanonicalBytes: logicalBytes,
    uniqueCanonicalBytes: uniqueBytes,
    duplicateCanonicalBytes: logicalBytes - uniqueBytes,
    contentByteSavingsPercent: logicalBytes === 0
      ? 0
      : roundNumber(((logicalBytes - uniqueBytes) / logicalBytes) * 100),
  };
}

function extractSampleItems(rows) {
  const bindingSuffixes = new Set([
    'Enabled',
    'Level',
    'DelayASend',
    'DelayBSend',
    'DiffuseSend',
    'ReverbSend',
  ]);
  const items = [];
  for (const row of rows.filter((candidate) => candidate.type === 'source' && candidate.scope === 'synth')) {
    for (const slot of [1, 2]) {
      const prefix = `sample${slot}`;
      const content = {};
      for (const [key, value] of Object.entries(row.payload ?? {})) {
        if (!key.startsWith(prefix)) continue;
        const suffix = key.slice(prefix.length);
        if (!suffix || bindingSuffixes.has(suffix)) continue;
        content[lowerFirst(suffix)] = value;
      }
      if (Object.keys(content).length > 0) items.push({ scope: prefix, content });
    }
  }
  return items;
}

function extractHarmonyItems(rows) {
  const itemsByType = {
    harmonyChordBank: [],
    harmonySequenceBank: [],
    harmonyContext: [],
  };
  for (const row of rows.filter((candidate) => candidate.type === 'state')) {
    const payload = row.payload ?? {};
    for (const key of ['harmonyChordSlots', 'harmonyChordSlotsA', 'harmonyChordSlotsB']) {
      if (Array.isArray(payload[key]) && payload[key].length > 0) {
        itemsByType.harmonyChordBank.push({ scope: key, content: { slots: payload[key] } });
      }
    }
    for (const key of ['harmonyProgression', 'harmonyProgressionA', 'harmonyProgressionB']) {
      if (payload[key] && typeof payload[key] === 'object') {
        itemsByType.harmonySequenceBank.push({ scope: key, content: { progression: payload[key] } });
      }
    }
    const context = {
      root: payload.rootNote,
      scale: payload.scaleMode,
      tension: payload.tension,
      voicing: payload.voicingSpread,
    };
    if (Object.values(context).some((value) => value !== undefined)) {
      itemsByType.harmonyContext.push({ scope: 'harmonyContext', content: context });
    }
  }
  return itemsByType;
}

async function fetchLatestResolvedRows(databaseUrl) {
  const client = new Client(postgresConfig(databaseUrl));
  await client.connect();
  try {
    const result = await client.query(`
      select p.id, p.type, p.scope, p.name, p.latest_resolved_hash, payload.payload
        from public.presets_v2 p
        join public.preset_payloads_v2 payload on payload.hash = p.latest_resolved_hash
       where p.deleted_at is null
         and p.latest_resolved_hash is not null
       order by p.type asc, p.scope asc nulls first, p.id asc
    `);
    let persistedContentRefs = {
      available: true,
      byType: {},
    };
    try {
      const contentRefResult = await client.query(`
        WITH latest_refs AS (
          SELECT ref.content_type, ref.content_hash
            FROM public.preset_version_content_refs_v2 ref
            JOIN public.preset_versions_v2 version ON version.id = ref.version_id
            JOIN public.presets_v2 preset ON preset.latest_version_id = version.id
           WHERE preset.deleted_at IS NULL
        ),
        per_type AS (
          SELECT ref.content_type,
                 count(*) AS reference_count,
                 count(DISTINCT ref.content_hash) AS unique_hash_count,
                 sum(payload.payload_bytes) AS bytes_if_unbatched
            FROM latest_refs ref
            JOIN public.preset_payloads_v2 payload ON payload.hash = ref.content_hash
           GROUP BY ref.content_type
        ),
        unique_nodes AS (
          SELECT DISTINCT content_type, content_hash FROM latest_refs
        ),
        physical_bytes AS (
          SELECT node.content_type, sum(payload.payload_bytes) AS unique_payload_bytes
            FROM unique_nodes node
            JOIN public.preset_payloads_v2 payload ON payload.hash = node.content_hash
           GROUP BY node.content_type
        )
        SELECT per_type.content_type,
               per_type.reference_count,
               per_type.unique_hash_count,
               per_type.bytes_if_unbatched,
               physical_bytes.unique_payload_bytes
          FROM per_type
          JOIN physical_bytes USING (content_type)
         ORDER BY per_type.content_type
      `);
      persistedContentRefs = {
        available: true,
        byType: Object.fromEntries(contentRefResult.rows.map((row) => [row.content_type, {
          references: Number(row.reference_count),
          uniqueHashes: Number(row.unique_hash_count),
          bytesIfUnbatched: Number(row.bytes_if_unbatched),
          uniquePayloadBytes: Number(row.unique_payload_bytes),
          duplicatePayloadBytes: Number(row.bytes_if_unbatched) - Number(row.unique_payload_bytes),
        }])),
      };
    } catch (error) {
      // A pre-content-node deployment is still useful for logical candidate
      // analysis; report the absent physical graph explicitly instead of
      // mislabelling the candidate bytes as persisted storage.
      persistedContentRefs = { available: false, reason: String(error?.message ?? error) };
    }

    return { rows: result.rows, persistedContentRefs };
  } finally {
    await client.end();
  }
}

function buildDatabaseReport(rows) {
  const pools = {};
  const rowsByTypeScope = {};
  for (const row of rows) {
    const key = `${row.type}:${row.scope ?? '<null>'}`;
    rowsByTypeScope[key] = (rowsByTypeScope[key] ?? 0) + 1;
  }
  for (const definition of candidateDefinitions) {
    const items = rows
      .filter((row) => definition.scopes.includes(row.scope))
      .map((row) => ({
        scope: row.scope,
        content: normalizeRecord(row.payload, definition, row.scope),
      }));
    pools[definition.id] = contentReuseReport(items);
  }
  pools.sampleVoice = contentReuseReport(extractSampleItems(rows));
  const harmonyItems = extractHarmonyItems(rows);
  for (const [id, items] of Object.entries(harmonyItems)) pools[id] = contentReuseReport(items);
  return {
    latestResolvedRows: rows.length,
    rowsByTypeScope: Object.fromEntries(Object.entries(rowsByTypeScope).sort(([left], [right]) => left.localeCompare(right))),
    pools,
  };
}

const registryEntries = parseParamRegistry();
const structural = candidateDefinitions.map((definition) => structuralReport(registryEntries, definition));
const env = {
  ...readEnvFile(path.join(cwd, '.env')),
  ...readEnvFile(path.join(cwd, '.env.local')),
  ...process.env,
};
const databaseUrl = env.DATABASE_URL ?? env.SUPABASE_DATABASE_URL ?? env.SUPABASE_DB_URL;

let database = {
  available: false,
  reason: 'Missing DATABASE_URL, SUPABASE_DATABASE_URL, or SUPABASE_DB_URL.',
};
if (databaseUrl) {
  try {
    const { rows, persistedContentRefs } = await fetchLatestResolvedRows(databaseUrl);
    database = { available: true, ...buildDatabaseReport(rows), persistedContentRefs };
  } catch (error) {
    database = { available: false, reason: String(error?.message ?? error) };
  }
}

const report = {
  schemaVersion: 1,
  registry: {
    parameterCount: registryEntries.length,
    candidates: structural,
  },
  database,
  caveats: [
    'Resolved-field candidate bytes are logical duplication estimates, not proof that content nodes are physically duplicated. Compare them with persistedContentRefs.',
    'Persisted content-node bytes include canonical envelopes but exclude ref rows, indexes, authorization, and reconstruction CPU.',
    'Latest resolved rows are a current corpus sample, not a projection of historical-version migration.',
    'Sequencer component savings require the canonical component implementation and are not estimated here.',
  ],
};

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

if (outputJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Preset content-pool opportunity audit');
  console.log(`Registry parameters: ${report.registry.parameterCount}`);
  for (const candidate of structural) {
    console.log(
      `- ${candidate.id}: ${candidate.sharedFieldCount}/${candidate.unionFieldCount} shared fields, exact=${candidate.exactSchemaMatch}`,
    );
  }
  if (database.available) {
    console.log(`Latest resolved database rows: ${database.latestResolvedRows}`);
    for (const [id, result] of Object.entries(database.pools)) {
      console.log(
      `- ${id}: ${result.references} logical occurrences, ${result.uniqueHashes} unique, ${result.duplicateCanonicalBytes} duplicate candidate bytes (${result.contentByteSavingsPercent}%)`,
    );
  }
    if (database.persistedContentRefs?.available) {
      console.log('Latest persisted content-node refs:');
      for (const [id, result] of Object.entries(database.persistedContentRefs.byType)) {
        console.log(
          `- ${id}: ${result.references} refs, ${result.uniqueHashes} nodes, ${result.uniquePayloadBytes} physical bytes (${result.duplicatePayloadBytes} bytes deduplicated)`,
        );
      }
    } else if (database.persistedContentRefs) {
      console.log(`Persisted content-node graph unavailable: ${database.persistedContentRefs.reason}`);
    }
  } else {
    console.log(`Database corpus unavailable: ${database.reason}`);
  }
  if (outputPath) console.log(`Wrote ${outputPath}`);
}
