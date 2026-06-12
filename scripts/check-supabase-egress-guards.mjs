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
  const freeFunction = text.indexOf(`function ${name}`);
  const methodMatch = freeFunction < 0
    ? new RegExp(`(?:private\\s+)?(?:async\\s+)?${name}\\s*\\(`).exec(text)
    : null;
  const start = freeFunction >= 0 ? freeFunction : methodMatch?.index ?? -1;
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
  assertSummarySelectExcludesPayload(filePath, text, 'PRESET_V2_SUMMARY_SELECT');
  assertSummarySelectExcludesPayload(filePath, text, 'LEGACY_PRESET_SUMMARY_SELECT');
}

{
  const { filePath, text } = readRepoFile('src/cloud/supabase.ts');
  for (const name of ['fetchCloudPresets', 'fetchFeaturedPresets', 'searchCloudPresets']) {
    assertFunctionUsesOnlySummarySelect(filePath, text, name, 'LEGACY_PRESET_SUMMARY_SELECT');
  }
  for (const token of [
    'const CLOUD_PRESET_LIST_MEMORY_CACHE_TTL_MS = 10 * 60_000',
    'const CLOUD_PRESET_LIST_SESSION_CACHE_TTL_MS = 45 * 60_000',
    "const functionName = 'kessho_get_legacy_preset_detail'",
    'legacySummaryToCloudPresetSummary',
    ".from('legacy_preset_summaries')",
    'fetchPresetByIdRpc(client, id)',
    'await ensureCloudAnonymousSession(client)',
    'readCloudPresetListCache(cacheKey)',
    'writeCloudPresetListCache(cacheKey, summaries)',
    'clearCloudPresetListCache()',
  ]) {
    assertTextIncludes(filePath, text, token);
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
    'readPresetListSessionCache(key, now)',
    'writePresetListSessionCache(key, summaries)',
  ]) {
    assertTextIncludes(filePath, text, token);
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
    'load-first-preset: ${formatBytes(detail.summary.totalBytes)} exceeds budget',
    'localStorage.setItem(\'kessho:supabaseEgressDebug\', \'1\')',
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
