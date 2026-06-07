#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const hotSwapReportPath = resolve(root, 'docs/reports/kessho-product-running-preset-hot-swap-debug-latest.json');
const reportJsonPath = resolve(root, 'docs/reports/kessho-product-voice-revision-hot-swap-latest.json');
const reportMarkdownPath = resolve(root, 'docs/reports/kessho-product-voice-revision-hot-swap-latest.md');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

execFileSync(
  process.execPath,
  [resolve(root, 'scripts/check-kessho-product-running-preset-hot-swap-debug.mjs'), ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit' },
);

const hotSwapReport = JSON.parse(readFileSync(hotSwapReportPath, 'utf8'));
assert(hotSwapReport.status === 'pass', 'hot-swap debug report did not pass');

for (const source of ['pad', 'lead']) {
  const before = hotSwapReport[source]?.before;
  const after = hotSwapReport[source]?.after;
  const spawn = hotSwapReport[source]?.spawn;
  assert(before && after && spawn, `${source} source or voice-spawn debug data was missing`);
  assert(
    before.sourceStateHash !== after.sourceStateHash ||
      before.compiledSourceHash !== after.compiledSourceHash,
    `${source} active source hash did not change after preset hot-swap`,
  );
  assert(spawn.sourceRevision === after.sourceRevision, `${source} spawned voice revision did not match active source revision`);
  assert(spawn.sourceStateHash === after.sourceStateHash, `${source} spawned voice source hash did not match active source hash`);
  assert(spawn.compiledSourceHash === after.compiledSourceHash, `${source} spawned voice compiled hash did not match active source hash`);
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: 'pass',
  pad: hotSwapReport.pad,
  lead: hotSwapReport.lead,
};

writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(
  reportMarkdownPath,
  [
    '# Kessho Product Voice Revision Hot-Swap',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `Status: **${report.status.toUpperCase()}**`,
    '',
    `Pad voice revision/hash: ${report.pad.spawn.sourceRevision} ${report.pad.spawn.sourceStateHash}/${report.pad.spawn.compiledSourceHash}`,
    `Lead voice revision/hash: ${report.lead.spawn.sourceRevision} ${report.lead.spawn.sourceStateHash}/${report.lead.spawn.compiledSourceHash}`,
    '',
  ].join('\n'),
);

console.log('Kessho Product voice revision hot-swap checks passed');
