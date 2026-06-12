#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const BASE_TABLES = new Set([
  'presets',
  'presets_v2',
  'preset_versions_v2',
  'preset_version_refs_v2',
  'preset_payloads_v2',
]);

const RUNTIME_SCAN_FILES = [
  'src/cloud/supabase.ts',
  'src/presets/SupabasePresetStore.ts',
];

const BROWSER_MAINTENANCE_SCAN_FILES = [
  'src/presets/presetV2Migration.ts',
];

const MAINTENANCE_SCAN_FILES = [
  'scripts/maintain-supabase-presets-v2.mjs',
  'scripts/repair-supabase-preset-texture-v2.mjs',
  'scripts/upsert-lead4opfm-v2-cloud-presets.mjs',
];

function parseArgs(argv) {
  const args = {
    json: false,
    failRuntimeBaseTables: false,
    failBrowserMaintenanceBaseTables: false,
  };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--fail-runtime-base-tables') args.failRuntimeBaseTables = true;
    else if (arg === '--fail-browser-maintenance-base-tables') args.failBrowserMaintenanceBaseTables = true;
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: node scripts/check-supabase-revoke-readiness.mjs [options]',
        '',
        'Reports direct runtime base-table Supabase calls that must be removed',
        'or moved behind RPCs before applying the final base-table SELECT revokes.',
        '',
        'Options:',
        '  --json                        Emit JSON report.',
        '  --fail-runtime-base-tables    Exit non-zero if normal runtime source still touches preset base tables.',
        '  --fail-browser-maintenance-base-tables',
        '                                Exit non-zero if browser maintenance source still touches preset base tables.',
      ].join('\n'));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function lineNumberForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function classifySurface(relativePath) {
  if (relativePath === 'src/cloud/supabase.ts') return 'legacy cloud helper';
  if (relativePath === 'src/presets/SupabasePresetStore.ts') return 'cloud preset store runtime';
  if (relativePath === 'src/presets/presetV2Migration.ts') return 'browser maintenance/migration';
  return relativePath.startsWith('scripts/') ? 'node maintenance script' : 'unknown';
}

function classifyIntent(relativePath, table, operation, context) {
  if (relativePath.startsWith('scripts/')) return 'service-role/maintenance only; keep out of public browser bundles';
  if (relativePath === 'src/presets/presetV2Migration.ts') return 'maintenance UI; run before final revoke or move to service-role tooling';
  if (relativePath === 'src/cloud/supabase.ts' && table === 'presets') {
    if (operation === 'select') return 'legacy share/detail fallback; covered by kessho_get_legacy_preset_detail once deployed';
    if (operation === 'insert') return 'legacy share writer; remove old UI path or move behind a legacy save RPC before revoking public.presets writes/reads';
  }
  if (relativePath === 'src/presets/SupabasePresetStore.ts') {
    if (table === 'presets') return 'legacy fallback path; safe only until legacy RPC/list coverage is deployed';
    if (context.includes('fetchDirectDetailBundleV2')) return 'V2 detail fallback; covered by kessho_get_preset_detail_v2 once deployed';
    if (context.includes('saveV2') || context.includes('findMatchingPresetV2') || context.includes('resolveExplicitVersionRefsV2')) {
      return 'V2 save/ref resolution; needs RPC-backed lookup or confirmed write flow before base-table SELECT revoke';
    }
    if (context.includes('exportAll') || context.includes('getStorageUsed') || context.includes('findReferences')) {
      return 'management/export/stat path; move behind RPC or disable for cloud after revoke';
    }
    return 'runtime fallback; verify an RPC/view replacement before revoke';
  }
  return 'unclassified direct base-table access';
}

function inferOperation(lines, lineIndex) {
  const context = lines.slice(lineIndex, Math.min(lines.length, lineIndex + 10)).join('\n');
  if (/\.select\s*\(/.test(context)) return 'select';
  if (/\.insert\s*\(/.test(context)) return 'insert';
  if (/\.update\s*\(/.test(context)) return 'update';
  if (/\.delete\s*\(/.test(context)) return 'delete';
  if (/\.upsert\s*\(/.test(context)) return 'upsert';
  return 'unknown';
}

function enclosingFunction(lines, lineIndex) {
  for (let index = lineIndex; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.trimStart().startsWith('.')) continue;

    const match = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/)
      ?? line.match(/^\s*(?:private\s+|public\s+|protected\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::|{|$)/)
      ?? line.match(/^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/);
    if (match && !['if', 'for', 'while', 'switch', 'catch'].includes(match[1])) {
      return match[1];
    }
  }
  return '(top level)';
}

function scanFile(relativePath, runtime) {
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const results = [];
  const pushFinding = (table, index, operation) => {
    if (!BASE_TABLES.has(table)) return;
    const line = lineNumberForIndex(text, index);
    const lineIndex = line - 1;
    const functionName = enclosingFunction(lines, lineIndex);
    const context = lines.slice(Math.max(0, lineIndex - 2), Math.min(lines.length, lineIndex + 12)).join('\n');
    results.push({
      relativePath,
      line,
      table,
      operation,
      runtime,
      surface: classifySurface(relativePath),
      functionName,
      intent: classifyIntent(relativePath, table, operation, context),
    });
  };

  const fromPattern = /\.from\(\s*(['"`])([^'"`]+)\1\s*\)/g;
  for (let match = fromPattern.exec(text); match; match = fromPattern.exec(text)) {
    pushFinding(match[2], match.index, inferOperation(lines, lineNumberForIndex(text, match.index) - 1));
  }

  const fetchAllPattern = /\bfetchAll\(\s*(?:(['"`])([^'"`]+)\1|[A-Za-z_$][\w$]*\s*,\s*(['"`])([^'"`]+)\3)/g;
  for (let match = fetchAllPattern.exec(text); match; match = fetchAllPattern.exec(text)) {
    pushFinding(match[2] ?? match[4], match.index, 'select');
  }
  return results;
}

const args = parseArgs(process.argv.slice(2));
const runtimeFindings = RUNTIME_SCAN_FILES.flatMap((relativePath) => scanFile(relativePath, true));
const browserMaintenanceFindings = BROWSER_MAINTENANCE_SCAN_FILES.flatMap((relativePath) => scanFile(relativePath, false));
const maintenanceFindings = MAINTENANCE_SCAN_FILES.flatMap((relativePath) => scanFile(relativePath, false));
const report = {
  generatedAt: new Date().toISOString(),
  runtimeFindings,
  browserMaintenanceFindings,
  maintenanceFindings,
  runtimeFindingCount: runtimeFindings.length,
  browserMaintenanceFindingCount: browserMaintenanceFindings.length,
  maintenanceFindingCount: maintenanceFindings.length,
};

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('Supabase base-table revoke readiness');
  console.log(`- Runtime direct base-table touchpoints: ${runtimeFindings.length}`);
  for (const finding of runtimeFindings) {
    console.log(`  ${finding.relativePath}:${finding.line} ${finding.functionName} ${finding.operation} ${finding.table}`);
    console.log(`    ${finding.intent}`);
  }
  console.log(`- Browser maintenance direct base-table touchpoints: ${browserMaintenanceFindings.length}`);
  for (const finding of browserMaintenanceFindings) {
    console.log(`  ${finding.relativePath}:${finding.line} ${finding.functionName} ${finding.operation} ${finding.table}`);
    console.log(`    ${finding.intent}`);
  }
  console.log(`- Node maintenance direct base-table touchpoints: ${maintenanceFindings.length}`);
  for (const finding of maintenanceFindings) {
    console.log(`  ${finding.relativePath}:${finding.line} ${finding.operation} ${finding.table}`);
  }
  console.log('- Final strict state: runtime and browser-maintenance counts must be 0 before applying base-table SELECT revokes as a normal migration.');
}

if (args.failRuntimeBaseTables && runtimeFindings.length > 0) {
  console.error('Runtime code still touches preset base tables directly.');
  process.exit(1);
}

if (args.failBrowserMaintenanceBaseTables && browserMaintenanceFindings.length > 0) {
  console.error('Browser maintenance code still touches preset base tables directly.');
  process.exit(1);
}
