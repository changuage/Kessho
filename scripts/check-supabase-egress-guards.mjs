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

{
  const { filePath, text } = readRepoFile('src/cloud/presetSelects.ts');
  assertSummarySelectExcludesPayload(filePath, text, 'CLOUD_PRESET_SUMMARY_SELECT');
  assertSummarySelectExcludesPayload(filePath, text, 'PRESET_V2_SUMMARY_SELECT');
  assertSummarySelectExcludesPayload(filePath, text, 'LEGACY_PRESET_SUMMARY_SELECT');
}

{
  const { filePath, text } = readRepoFile('src/cloud/supabase.ts');
  for (const name of ['fetchCloudPresets', 'fetchFeaturedPresets', 'searchCloudPresets']) {
    assertFunctionUsesOnlySummarySelect(filePath, text, name, 'CLOUD_PRESET_SUMMARY_SELECT');
  }
}

{
  const { filePath, text } = readRepoFile('src/presets/SupabasePresetStore.ts');
  assertFunctionUsesOnlySummarySelect(filePath, text, 'listV2', 'PRESET_V2_SUMMARY_SELECT');
  assertFunctionUsesOnlySummarySelect(filePath, text, 'listLegacy', 'LEGACY_PRESET_SUMMARY_SELECT');
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
