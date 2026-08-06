import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audit-supabase-presets-v2.mjs');
const source = fs.readFileSync(scriptPath, 'utf8');

test('audit keeps recycled visible-root descendants nonblocking while retaining true active-orphan detection', () => {
  assert.match(
    source,
    /function isRetainedVisibleRoot\(preset\)\s*\{[\s\S]*?latest_version_id[\s\S]*?!isInternalDerivedPreset\(preset\)/,
    'retained roots must include every non-internal latest graph, regardless of deleted_at',
  );
  assert.match(
    source,
    /const retainedVisibleRoots = presets\.filter\(isRetainedVisibleRoot\);/,
    'recycled roots must participate in the retained reachability graph',
  );
  assert.match(
    source,
    /const activeUnreachableInternalDerived = presets[\s\S]*?!retainedVisibleReachableIds\.has\(preset\.id\)/,
    'only rows unreachable from both active and recycled retained roots may be blockers',
  );
  assert.match(
    source,
    /activeInternalRetainedOnlyCount: activeInternalRetainedOnly\.length,[\s\S]*?activeInternalRetainedOnly: activeInternalRetainedOnly\.slice\(0, 20\)/,
    'recycled-root-only descendants must be measured without truncating their count',
  );
  const blockingStart = source.indexOf('const blockingIssueCount =');
  const blockingEnd = source.indexOf('\nif (outputJson)', blockingStart);
  assert.notEqual(blockingStart, -1, 'audit must expose a blocking issue aggregate');
  assert.notEqual(blockingEnd, -1, 'blocking aggregate must end before report output');
  const blockingExpression = source.slice(blockingStart, blockingEnd);
  assert.match(blockingExpression, /activeUnreachableInternalDerivedCount/);
  assert.doesNotMatch(blockingExpression, /activeInternalRetainedOnlyCount/);
});
