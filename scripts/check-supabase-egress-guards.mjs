#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SCAN_DIRS = [
  path.join(ROOT, 'src'),
  path.join(ROOT, 'scripts'),
];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts']);
const FORBIDDEN_PATTERNS = [
  {
    name: "Supabase select('*')",
    pattern: /\.select\(\s*(['"])\*\1/g,
  },
  {
    name: 'bare Supabase select()',
    pattern: /\.select\(\s*\)/g,
  },
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    if (!entry.isFile() || !EXTENSIONS.has(path.extname(entry.name))) return [];
    return [fullPath];
  });
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function isSupabaseLikeSource(text) {
  return /(?:^|[^\w$])\.from\(\s*['"`]/.test(text) || text.includes('@supabase/supabase-js');
}

const failures = [];
function scanForbiddenSelects(filePath, text) {
  const matches = [];
  for (const forbidden of FORBIDDEN_PATTERNS) {
    forbidden.pattern.lastIndex = 0;
    for (let match = forbidden.pattern.exec(text); match; match = forbidden.pattern.exec(text)) {
      matches.push({
        filePath,
        line: lineNumberForIndex(text, match.index),
        name: forbidden.name,
      });
    }
  }
  return matches;
}

for (const filePath of SCAN_DIRS.flatMap(walk)) {
  const text = fs.readFileSync(filePath, 'utf8');
  if (!isSupabaseLikeSource(text)) continue;

  failures.push(...scanForbiddenSelects(filePath, text));
}

function fail(filePath, line, name) {
  failures.push({ filePath, line, name });
}

{
  const syntheticScriptPath = path.join(ROOT, 'scripts/__synthetic_supabase_egress_guard__.mjs');
  const syntheticFailures = scanForbiddenSelects(
    syntheticScriptPath,
    "createClient().from('presets')." + "select(" + "'*'" + ");",
  );
  if (!syntheticFailures.some((failure) => failure.name === "Supabase select('*')")) {
    fail(path.join(ROOT, 'scripts/check-supabase-egress-guards.mjs'), 1, 'synthetic scripts select guard did not catch select(*)');
  }
}

function readRepoFile(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  return {
    filePath,
    text: fs.readFileSync(filePath, 'utf8'),
  };
}

function findLine(text, token) {
  const index = text.indexOf(token);
  return index >= 0 ? lineNumberForIndex(text, index) : 1;
}

function extractConstArraySelect(text, name) {
  const match = text.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\.join\\('\\,'\\);`));
  if (!match) return null;
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

function extractConstStringSelect(text, name) {
  const match = text.match(new RegExp(`const\\s+${name}\\s*=\\s*'([^']+)'`));
  if (!match) return null;
  return match[1].split(',').map((column) => column.trim()).filter(Boolean);
}

function assertColumnsExcludePayload(filePath, line, name, columns) {
  const forbiddenColumns = columns.filter((column) => ['data', 'payload', 'payload_bytes', 'versions'].includes(column));
  if (forbiddenColumns.length > 0) {
    fail(filePath, line, `${name} includes payload columns: ${forbiddenColumns.join(',')}`);
  }
}

function assertSummarySelectExcludesPayload(filePath, text, name) {
  const columns = extractConstArraySelect(text, name) ?? extractConstStringSelect(text, name);
  if (!columns) {
    fail(filePath, findLine(text, name), `${name} is missing or not a literal select column list`);
    return;
  }
  assertColumnsExcludePayload(filePath, findLine(text, name), name, columns);
}

function functionBody(text, name) {
  const freeFunctionMatch = new RegExp(`\\bfunction\\s+${name}\\s*\\(`).exec(text);
  const methodMatch = !freeFunctionMatch
    ? new RegExp(`(?:private\\s+)?(?:async\\s+)?${name}\\s*\\(`).exec(text)
    : null;
  const start = freeFunctionMatch?.index ?? methodMatch?.index ?? -1;
  if (start < 0) return null;
  const bodyStart = text.indexOf('{', start);
  if (bodyStart < 0) return null;
  let depth = 0;
  for (let index = bodyStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(bodyStart, index + 1);
    }
  }
  return null;
}

function assertFunctionUsesOnlySummarySelect(filePath, text, name, summarySelectName) {
  const body = functionBody(text, name);
  if (!body) {
    fail(filePath, findLine(text, name), `${name} body not found for egress summary guard`);
    return;
  }
  if (!body.includes(`.select(${summarySelectName})`)) {
    fail(filePath, findLine(text, name), `${name} must select ${summarySelectName}`);
  }
  if (/\.select\(\s*[^)]*(?:DETAIL|PAYLOAD|ROW|VERSION|LEGACY_PRESET_ROW_SELECT|CLOUD_PRESET_DETAIL_SELECT)/.test(body)) {
    fail(filePath, findLine(text, name), `${name} must not select detail, payload, row, or version columns`);
  }
}

function assertTextIncludes(filePath, text, token, message = `missing required egress guard token: ${token}`) {
  if (!text.includes(token)) {
    fail(filePath, findLine(text, token), message);
  }
}

{
  const { filePath, text } = readRepoFile('src/cloud/presetSelects.ts');
  assertSummarySelectExcludesPayload(filePath, text, 'CLOUD_PRESET_SUMMARY_SELECT');
  assertSummarySelectExcludesPayload(filePath, text, 'LEGACY_CLOUD_CARD_SELECT');
  assertSummarySelectExcludesPayload(filePath, text, 'PRESET_V2_CLOUD_CARD_SELECT');
  assertSummarySelectExcludesPayload(filePath, text, 'PRESET_V2_SUMMARY_SELECT');
  assertSummarySelectExcludesPayload(filePath, text, 'LEGACY_PRESET_SUMMARY_SELECT');
}

{
  const { filePath, text } = readRepoFile('src/presets/presetStorageV2.ts');
  for (const token of [
    'const PRESET_TEXT_ENCODER = new TextEncoder()',
    'const HEX_BYTE_LOOKUP = Array.from({ length: 256 }',
    'export async function hashCanonicalJsonText(canonicalJson: string)',
    'const PRESET_PAYLOAD_CACHE_TOUCH_THROTTLE_MS = 5 * 60_000',
    'const PRESET_PAYLOAD_CACHE_PRUNE_THROTTLE_MS = 60_000',
    'let presetPayloadPersistentCacheLastPrunedAt = 0',
    'const PRESET_PAYLOAD_HASH_PATTERN = /^[0-9a-f]{64}$/',
    'export function collectPresetPayloadHashesV2(hashes: readonly unknown[], maxHashes = 100): string[]',
    'PRESET_TEXT_ENCODER.encode(canonicalJson)',
    'return hashCanonicalJsonText(stableStringifyCanonical(value))',
    'export function readPresetPayloadCacheV2(hash: string): unknown | undefined',
    'export async function readVerifiedPresetPayloadCacheV2(hash: string): Promise<unknown | undefined>',
    'const presetPayloadSessionVerifiedHashes = new Set<string>()',
    'interface PresetPayloadCacheWriteOptions',
    'options?: PresetPayloadCacheWriteOptions',
    'const payloadJson = options?.verifiedCanonicalJson ?? stableStringifyCanonical(payload)',
    'if (options?.verifiedCanonicalJson === undefined)',
    'const computedHash = await hashCanonicalJsonText(payloadJson)',
    'PRESET_TEXT_ENCODER.encode(payloadJson).byteLength',
    'const keys = Object.keys(value).sort(compareCanonicalKeys)',
    'const normalized: Record<string, unknown> = {}',
  ]) {
    assertTextIncludes(filePath, text, token);
  }

  const hashBody = functionBody(text, 'hashCanonicalJson');
  if (!hashBody) {
    fail(filePath, findLine(text, 'hashCanonicalJson'), 'hashCanonicalJson body not found for CPU guard');
  } else {
    for (const token of [
      'new TextEncoder()',
      'Array.from(new Uint8Array(digest))',
      'PRESET_TEXT_ENCODER.encode(',
    ]) {
      if (hashBody.includes(token)) {
        fail(filePath, findLine(text, 'hashCanonicalJson'), `hashCanonicalJson must avoid per-call allocation pattern: ${token}`);
      }
    }
  }

  const hashTextBody = functionBody(text, 'hashCanonicalJsonText');
  if (!hashTextBody) {
    fail(filePath, findLine(text, 'hashCanonicalJsonText'), 'hashCanonicalJsonText body not found for CPU guard');
  } else if (hashTextBody.includes('Array.from(new Uint8Array(digest))')) {
    fail(filePath, findLine(text, 'hashCanonicalJsonText'), 'hashCanonicalJsonText must use the hex lookup loop instead of Array.from/map/join');
  }

  const cacheWriteBody = functionBody(text, 'writePresetPayloadCacheV2');
  if (!cacheWriteBody) {
    fail(filePath, findLine(text, 'writePresetPayloadCacheV2'), 'writePresetPayloadCacheV2 body not found for cache CPU guard');
  } else {
    const stringifyIndex = cacheWriteBody.indexOf('const payloadJson = options?.verifiedCanonicalJson ?? stableStringifyCanonical(payload)');
    const verifiedBranchIndex = cacheWriteBody.indexOf('if (options?.verifiedCanonicalJson === undefined)');
    const hashIndex = cacheWriteBody.indexOf('const computedHash = await hashCanonicalJsonText(payloadJson)');
    const bytesIndex = cacheWriteBody.indexOf('const bytes = getPayloadCacheBytes(payloadJson)');
    if (!(stringifyIndex >= 0 && stringifyIndex < verifiedBranchIndex && verifiedBranchIndex < hashIndex && hashIndex < bytesIndex)) {
      fail(filePath, findLine(text, 'writePresetPayloadCacheV2'), 'writePresetPayloadCacheV2 must reuse verified canonical text or hash one canonical string before byte accounting');
    }
    if (cacheWriteBody.includes('hashCanonicalJson(payload)')) {
      fail(filePath, findLine(text, 'writePresetPayloadCacheV2'), 'writePresetPayloadCacheV2 must not recanonicalize payloads during hash verification');
    }
  }

  const cacheReadBody = functionBody(text, 'readVerifiedPresetPayloadCacheV2');
  if (!cacheReadBody) {
    fail(filePath, findLine(text, 'readVerifiedPresetPayloadCacheV2'), 'readVerifiedPresetPayloadCacheV2 body not found for verified cache read guard');
  } else {
    for (const token of [
      'const computedHash = await hashCanonicalJsonText(canonicalJson)',
      'if (computedHash !== hash)',
      'parsed.lastAccess + PRESET_PAYLOAD_CACHE_TOUCH_THROTTLE_MS > now',
      'return entry.payload',
    ]) {
      if (!cacheReadBody.includes(token)) {
        fail(filePath, findLine(text, 'readVerifiedPresetPayloadCacheV2'), `readVerifiedPresetPayloadCacheV2 missing verified-cache token: ${token}`);
      }
    }
    const throttleIndex = cacheReadBody.indexOf('parsed.lastAccess + PRESET_PAYLOAD_CACHE_TOUCH_THROTTLE_MS > now');
    const writeIndex = cacheReadBody.indexOf('localStorage.setItem(storageKey, JSON.stringify(entry))');
    if (!(throttleIndex >= 0 && writeIndex >= 0 && throttleIndex < writeIndex)) {
      fail(filePath, findLine(text, 'readVerifiedPresetPayloadCacheV2'), 'readVerifiedPresetPayloadCacheV2 must skip localStorage touch writes before rewriting persistent cache metadata');
    }
  }

  const persistentPruneBody = functionBody(text, 'prunePresetPayloadPersistentCache');
  if (!persistentPruneBody) {
    fail(filePath, findLine(text, 'prunePresetPayloadPersistentCache'), 'prunePresetPayloadPersistentCache body not found for persistent-cache CPU guard');
  } else {
    for (const token of [
      'presetPayloadPersistentCacheLastPrunedAt + PRESET_PAYLOAD_CACHE_PRUNE_THROTTLE_MS > now',
      'presetPayloadPersistentCacheLastPrunedAt = now',
      'const activeEntries: Array<{ key: string; bytes: number; lastAccess: number }> = []',
      'let activeCount = activeEntries.length',
      'activeCount -= 1',
    ]) {
      if (!persistentPruneBody.includes(token)) {
        fail(filePath, findLine(text, 'prunePresetPayloadPersistentCache'), `prunePresetPayloadPersistentCache missing CPU guard token: ${token}`);
      }
    }
    for (const token of ['.filter(', '.shift()']) {
      if (persistentPruneBody.includes(token)) {
        fail(filePath, findLine(text, 'prunePresetPayloadPersistentCache'), `prunePresetPayloadPersistentCache must avoid ${token} in persistent cache pruning`);
      }
    }
  }

  const canonicalizeBody = functionBody(text, 'canonicalizeJson');
  if (!canonicalizeBody) {
    fail(filePath, findLine(text, 'canonicalizeJson'), 'canonicalizeJson body not found for CPU guard');
  } else if (canonicalizeBody.includes('Object.fromEntries') || canonicalizeBody.includes('Object.entries(value)')) {
    fail(filePath, findLine(text, 'canonicalizeJson'), 'canonicalizeJson must avoid entry tuple allocation in the storage hash hot path');
  }

  const collectHashesBody = functionBody(text, 'collectPresetPayloadHashesV2');
  if (!collectHashesBody) {
    fail(filePath, findLine(text, 'collectPresetPayloadHashesV2'), 'collectPresetPayloadHashesV2 body not found for hash collection CPU guard');
  } else {
    for (const token of [
      'new Set<string>()',
      'if (unique.size >= maxHashes) break',
      'return [...unique]',
    ]) {
      if (!collectHashesBody.includes(token)) {
        fail(filePath, findLine(text, 'collectPresetPayloadHashesV2'), `collectPresetPayloadHashesV2 missing bounded collection token: ${token}`);
      }
    }
    if (collectHashesBody.includes('.filter(') || collectHashesBody.includes('.slice(')) {
      fail(filePath, findLine(text, 'collectPresetPayloadHashesV2'), 'collectPresetPayloadHashesV2 must avoid filter/slice allocation before hash fetches');
    }
  }
}

{
  const { filePath, text } = readRepoFile('src/cloud/supabase.ts');
  for (const name of ['fetchCloudPresetPage', 'fetchFeaturedPresetPage', 'searchCloudPresetPage']) {
    assertFunctionUsesOnlySummarySelect(filePath, text, name, 'LEGACY_CLOUD_CARD_SELECT');
  }
  for (const token of [
    'export const CLOUD_PRESET_PAGE_SIZE = 24',
    'export const CLOUD_SEARCH_PAGE_SIZE = 20',
    'export const CLOUD_FEATURED_PAGE_SIZE = 10',
    'const CLOUD_PRESET_LIST_MEMORY_CACHE_TTL_MS = 10 * 60_000',
    'const CLOUD_PRESET_LIST_SESSION_CACHE_TTL_MS = 45 * 60_000',
    "const functionName = 'kessho_get_legacy_preset_detail'",
    "const functionName = 'kessho_get_preset_latest_manifest_v2'",
    "client.rpc('kessho_lookup_preset_id_v2'",
    "client.rpc('kessho_get_preset_card_v2'",
    'findExistingCloudPresetV2ViaRows(client, name, ownerUserId)',
    'collectPresetPayloadHashesV2(hashes)',
    'const resolvedPayloadJson = JSON.stringify(resolvedPayload)',
    'const metadataPayloadJson = JSON.stringify(metadataPayload)',
    'hashCanonicalJsonText(resolvedPayloadJson)',
    'hashCanonicalJsonText(metadataPayloadJson)',
    'writePresetPayloadCacheV2(resolvedHash, resolvedPayload, { verifiedCanonicalJson: resolvedPayloadJson })',
    'writePresetPayloadCacheV2(metadataHash, metadataPayload, { verifiedCanonicalJson: metadataPayloadJson })',
    'const ownerKey = `public:${session.id}`',
    'owner_key: ownerKey',
    'owner_user_id: session.id',
    'legacySummaryToCloudPresetSummary',
    ".from('legacy_preset_summaries')",
    "client.rpc('kessho_save_preset_v2'",
    'fetchPresetByIdRpc(client, id)',
    'fetchPresetByIdLatestV2Rpc(client, id)',
    'await ensureCloudAnonymousSession(client)',
    'readCloudPresetListCache(cacheKey)',
    'writeCloudPresetListCache(cacheKey, page)',
    'getCloudPresetPlaysCursorFilter(cursor)',
    'plays.is.null',
    'clearCloudPresetListCache()',
  ]) {
    assertTextIncludes(filePath, text, token);
  }

  const fetchByIdBody = functionBody(text, 'fetchPresetById');
  if (!fetchByIdBody) {
    fail(filePath, findLine(text, 'fetchPresetById'), 'fetchPresetById body not found for read compatibility guard');
  } else {
    const ensureIndex = fetchByIdBody.indexOf('await ensureCloudAnonymousSession(client)');
    const v2Index = fetchByIdBody.indexOf('fetchPresetByIdLatestV2Rpc(client, id)');
    const legacyIndex = fetchByIdBody.indexOf('fetchPresetByIdRpc(client, id)');
    if (ensureIndex < 0 || v2Index < 0 || legacyIndex < 0) {
      fail(filePath, findLine(text, 'fetchPresetById'), 'fetchPresetById must authenticate and include V2-first plus legacy fallback reads');
    } else if (!(ensureIndex < v2Index && v2Index < legacyIndex)) {
      fail(filePath, findLine(text, 'fetchPresetById'), 'fetchPresetById must authenticate, try latest V2 manifest, then fall back to legacy detail');
    }
  }

  const fetchLatestV2Body = functionBody(text, 'fetchPresetByIdLatestV2Rpc');
  if (!fetchLatestV2Body) {
    fail(filePath, findLine(text, 'fetchPresetByIdLatestV2Rpc'), 'fetchPresetByIdLatestV2Rpc body not found for latest-only guard');
  } else {
    for (const token of [
      "const functionName = 'kessho_get_preset_latest_manifest_v2'",
      'fetchMissingPresetPayloadsV2(client, requiredHashes)',
      'readVerifiedPresetPayloadCacheV2(hash)',
      'writePresetPayloadCacheV2(row.hash, row.payload)',
    ]) {
      if (!fetchLatestV2Body.includes(token) && !text.includes(token)) {
        fail(filePath, findLine(text, 'fetchPresetByIdLatestV2Rpc'), `latest V2 read path missing ${token}`);
      }
    }
    if (fetchLatestV2Body.includes('kessho_get_preset_detail_v2')) {
      fail(filePath, findLine(text, 'kessho_get_preset_detail_v2'), 'latest V2 share/open path must not call the full-history detail RPC');
    }
  }

  const fetchLegacyBody = functionBody(text, 'fetchPresetByIdRpc');
  if (!fetchLegacyBody) {
    fail(filePath, findLine(text, 'fetchPresetByIdRpc'), 'fetchPresetByIdRpc body not found for legacy compatibility guard');
  } else if (fetchLegacyBody.includes(".from('presets')") || fetchLegacyBody.includes('CLOUD_PRESET_DETAIL_SELECT')) {
    fail(filePath, findLine(text, 'fetchPresetByIdRpc'), 'legacy share/open fallback must use the narrow legacy detail RPC, not direct table/detail selects');
  }

  const saveCloudBody = functionBody(text, 'saveCloudPreset');
  if (!saveCloudBody) {
    fail(filePath, findLine(text, 'saveCloudPreset'), 'saveCloudPreset body not found for V2 save CPU guard');
  } else {
    if (saveCloudBody.includes('hashCanonicalJson(resolvedPayload)') || saveCloudBody.includes('hashCanonicalJson(metadataPayload)')) {
      fail(filePath, findLine(text, 'saveCloudPreset'), 'saveCloudPreset must hash already-built canonical JSON text for V2 payloads');
    }
  }
}

{
  const { filePath, text } = readRepoFile('src/presets/SupabasePresetStore.ts');
  assertFunctionUsesOnlySummarySelect(filePath, text, 'listV2', 'PRESET_V2_SUMMARY_SELECT');
  assertFunctionUsesOnlySummarySelect(filePath, text, 'listLegacy', 'LEGACY_PRESET_SUMMARY_SELECT');

  const listV2Body = functionBody(text, 'listV2');
  if (!listV2Body) {
    fail(filePath, findLine(text, 'listV2'), 'listV2 body not found for payload hydration guard');
  } else if (listV2Body.includes('fetchPayloadMapV2')) {
    fail(filePath, findLine(text, 'fetchPayloadMapV2'), 'listV2 must not hydrate payload metadata during summary reads');
  } else if (listV2Body.includes('data?.length')) {
    fail(filePath, findLine(text, 'data?.length'), 'listV2 must not fall back to base-table reads when summary views are empty');
  }

  const listLegacyBody = functionBody(text, 'listLegacy');
  if (!listLegacyBody) {
    fail(filePath, findLine(text, 'listLegacy'), 'listLegacy body not found for summary fallback guard');
  } else if (listLegacyBody.includes('data?.length')) {
    fail(filePath, findLine(text, 'data?.length'), 'listLegacy must not fall back to base-table reads when summary views are empty');
  }

  for (const token of [
    'const PRESET_LIST_MEMORY_CACHE_TTL_MS = 10 * 60_000',
    'const PRESET_LIST_SESSION_CACHE_TTL_MS = 45 * 60_000',
    'const PRESET_LIST_SESSION_CACHE_PREFIX =',
    ".from('preset_summaries_v2')",
    "const functionName = 'kessho_get_preset_detail_v2'",
    "const functionName = 'kessho_get_legacy_preset_detail'",
    'fetchDetailBundleRpcV2({ type, name, scope, version })',
    'fetchLegacyDetailRpc(type, name, scope)',
    'materializeDetailBundleV2(rpcBundle, version)',
    "this.client.rpc('kessho_lookup_preset_id_v2'",
    "this.client.rpc('kessho_exists_preset_logical_key_v2'",
    'private buildRenamePayload(',
    'private async existsLogicalKeyV2(',
    'preloadedPayloadMap?: Map<string, unknown>',
    'const payloadMap = preloadedPayloadMap ?? await this.payloadRowsToMapV2(bundle.payloads)',
    'return hashCanonicalJsonText(JSON.stringify(normalized))',
    'hash: await hashCanonicalJsonText(JSON.stringify(normalized))',
    'const payloadJson = JSON.stringify(payload)',
    'await writePresetPayloadCacheV2(hash, payload, { verifiedCanonicalJson: payloadJson })',
    'rename_payload: this.buildRenamePayload(nextName, identity)',
    'readPresetListSessionCache(key, now)',
    'writePresetListSessionCache(key, summaries)',
  ]) {
    assertTextIncludes(filePath, text, token);
  }

  const renameV2Body = functionBody(text, 'renameV2');
  if (!renameV2Body) {
    fail(filePath, findLine(text, 'renameV2'), 'renameV2 body not found for narrow rename guard');
  } else {
    for (const token of [
      'this.lookupPresetIdV2(type, name, scope)',
      'rename_payload: this.buildRenamePayload(nextName, identity)',
    ]) {
      if (!renameV2Body.includes(token)) {
        fail(filePath, findLine(text, 'renameV2'), `renameV2 missing narrow rename token: ${token}`);
      }
    }
    if (renameV2Body.includes('conflictRows') || renameV2Body.includes('queryPresetRowsV2(type, nextName')) {
      fail(filePath, findLine(text, 'renameV2'), 'renameV2 must not perform broad conflict row lookup before the narrow rename RPC');
    }
  }

  const existsV2Body = functionBody(text, 'existsV2');
  if (!existsV2Body) {
    fail(filePath, findLine(text, 'existsV2'), 'existsV2 body not found for narrow existence guard');
  } else {
    for (const token of [
      'this.existsLogicalKeyV2(type, name, scope)',
      'if (exists !== undefined) return exists',
    ]) {
      if (!existsV2Body.includes(token)) {
        fail(filePath, findLine(text, 'existsV2'), `existsV2 missing narrow existence token: ${token}`);
      }
    }

    const narrowLookupIndex = existsV2Body.indexOf('this.existsLogicalKeyV2(type, name, scope)');
    const wideLookupIndex = existsV2Body.indexOf('this.queryPresetRowsV2');
    if (narrowLookupIndex < 0 || wideLookupIndex < 0 || narrowLookupIndex > wideLookupIndex) {
      fail(filePath, findLine(text, 'existsV2'), 'existsV2 must attempt the narrow logical-key RPC before broad row lookup fallback');
    }
  }

  const materializeLatestBody = functionBody(text, 'materializeLatestManifestV2');
  if (!materializeLatestBody) {
    fail(filePath, findLine(text, 'materializeLatestManifestV2'), 'materializeLatestManifestV2 body not found for payload-map CPU guard');
  } else {
    for (const token of [
      'const payloadMap = await this.fetchPayloadMapV2(requiredHashes)',
      '}, undefined, payloadMap)',
    ]) {
      if (!materializeLatestBody.includes(token)) {
        fail(filePath, findLine(text, 'materializeLatestManifestV2'), `latest manifest materialization missing direct payload-map token: ${token}`);
      }
    }
    if (materializeLatestBody.includes('[...payloadMap.entries()]')) {
      fail(filePath, findLine(text, 'materializeLatestManifestV2'), 'latest manifest materialization must not convert payload maps into synthetic payload rows');
    }
  }

  const fetchPayloadMapBody = functionBody(text, 'fetchPayloadMapV2');
  if (!fetchPayloadMapBody) {
    fail(filePath, findLine(text, 'fetchPayloadMapV2'), 'fetchPayloadMapV2 body not found for payload-cache CPU guard');
  } else if (!fetchPayloadMapBody.includes('await readVerifiedPresetPayloadCacheV2(hash)')) {
    fail(filePath, findLine(text, 'fetchPayloadMapV2'), 'fetchPayloadMapV2 must verify persistent payload cache entries before issuing missing-hash RPCs');
  } else if (!fetchPayloadMapBody.includes('collectPresetPayloadHashesV2(hashes)')) {
    fail(filePath, findLine(text, 'fetchPayloadMapV2'), 'fetchPayloadMapV2 must use bounded hash collection before cache/RPC lookup');
  } else if (fetchPayloadMapBody.includes('hashes.filter') || fetchPayloadMapBody.includes('new Set(hashes')) {
    fail(filePath, findLine(text, 'fetchPayloadMapV2'), 'fetchPayloadMapV2 must not allocate filter/set/slice hash lists inline');
  } else if (fetchPayloadMapBody.includes('const hash = await hashCanonicalJson(payload)')) {
    fail(filePath, findLine(text, 'fetchPayloadMapV2'), 'fetchPayloadMapV2 must reuse canonical payload JSON when hashing fallback payload rows');
  }

  const payloadRowsToMapBody = functionBody(text, 'payloadRowsToMapV2');
  if (!payloadRowsToMapBody) {
    fail(filePath, findLine(text, 'payloadRowsToMapV2'), 'payloadRowsToMapV2 body not found for payload-cache CPU guard');
  } else if (payloadRowsToMapBody.includes('const hash = await hashCanonicalJson(payload)')) {
    fail(filePath, findLine(text, 'payloadRowsToMapV2'), 'payloadRowsToMapV2 must reuse canonical payload JSON when hashing compact payload rows');
  }
}

{
  const { filePath, text } = readRepoFile('src/cloud/supabaseEgressDiagnostics.ts');
  for (const token of [
    'const WARNING_THRESHOLD_BYTES = 256 * 1024',
    'const LIST_REFRESH_PAUSE_THRESHOLD_BYTES = 1024 * 1024',
    'status === 402 || status === 429',
    'getContentLengthBytes(response)',
    'measureResponseBody(response, diagnosticsEnabled)',
    'window.__kesshoSupabaseEgress = getSupabaseEgressTripwireSnapshot',
  ]) {
    assertTextIncludes(filePath, text, token);
  }
}

{
  const { filePath, text } = readRepoFile('scripts/check-supabase-egress-budget.mjs');
  for (const token of [
    'freshBudgetBytes: DEFAULT_FRESH_BUDGET_BYTES',
    'detailBudgetBytes: DEFAULT_DETAIL_BUDGET_BYTES',
    'assertNoForbiddenCalls(calls, id)',
    'assertNoSupabaseErrors(calls, id)',
    'decodeURIComponent(call.url).includes(\'select=*\')',
    'call.url.includes(\'/rest/v1/preset_payloads_v2\')',
    '--load-first-preset',
    '--fail-supabase-errors',
    'found Supabase HTTP ${call.status} response',
    'clickFirstPresetLoadButton(page, args.loadPresetSelector)',
    'page.waitForFunction(clickVisibleLoadButton',
    'load-first-preset: ${formatBytes(detail.summary.totalBytes)} exceeds budget',
    'With --load-first-preset, reload and load the first preset each time.',
    'reload-load-first-preset-average',
    'const budgetBytes = args.loadFirstPreset ? args.detailBudgetBytes : args.freshBudgetBytes',
    'localStorage.setItem(\'kessho:supabaseEgressDebug\', \'1\')',
  ]) {
    assertTextIncludes(filePath, text, token);
  }
}

{
  const { filePath, text } = readRepoFile('package.json');
  for (const token of [
    '"audit:supabase-egress:runtime:detail:repeat"',
    '--open-presets --load-first-preset --reload-count=2 --require-supabase-calls --fail-supabase-errors --detail-budget-kb=128',
  ]) {
    assertTextIncludes(filePath, text, token);
  }
}

{
  const { filePath, text } = readRepoFile('scripts/repair-supabase-preset-texture-v2.mjs');
  for (const token of [
    "const write = args.has('--write')",
    'TEXTURE_REPAIR_ACTIVE_ROW_SELECT',
    'TEXTURE_REPAIR_REF_SLOT_SELECT',
    "parseEnumArg('--type'",
    "parseEnumArg('--scope'",
    '.range(activeRowOffset, activeRowOffset + activeRowLimit - 1)',
    'Selected columns: active rows',
  ]) {
    if (!text.includes(token)) {
      fail(filePath, findLine(text, token), `Texture repair script missing methodology guard: ${token}`);
    }
  }
  const activeColumns = extractConstStringSelect(text, 'TEXTURE_REPAIR_ACTIVE_ROW_SELECT');
  if (!activeColumns) {
    fail(filePath, findLine(text, 'TEXTURE_REPAIR_ACTIVE_ROW_SELECT'), 'Texture repair active-row select must be a literal compact select');
  } else {
    assertColumnsExcludePayload(
      filePath,
      findLine(text, 'TEXTURE_REPAIR_ACTIVE_ROW_SELECT'),
      'TEXTURE_REPAIR_ACTIVE_ROW_SELECT',
      activeColumns,
    );
  }
}

if (failures.length > 0) {
  console.error('Supabase egress guard failed. Use explicit summary/detail column selects.');
  for (const failure of failures) {
    console.error(`- ${path.relative(ROOT, failure.filePath)}:${failure.line} ${failure.name}`);
  }
  process.exit(1);
}

console.log('Supabase egress guard passed.');
