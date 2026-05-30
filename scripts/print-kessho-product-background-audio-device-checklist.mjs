import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  backgroundAudioDeviceEvidenceIds,
  backgroundAudioDeviceEvidencePath,
  backgroundAudioDevicePassEvidenceRequirements,
  parseBackgroundAudioDeviceEvidenceRows,
} from './lib/kesshoBackgroundAudioDeviceEvidence.mjs';

const root = process.cwd();
const reportPath = 'docs/reports/kessho-product-background-audio-device-checklist.md';

function parseArgs(argv) {
  return {
    check: argv.includes('--check'),
    write: argv.includes('--write'),
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function recorderCommand(id, status, evidence, tester = 'YOUR_NAME', date = 'YYYY-MM-DD') {
  return [
    'npm run core:product:background-audio-device-evidence:record --',
    `--id=${id}`,
    `--status=${status}`,
    `--evidence="${evidence}"`,
    `--tester="${tester}"`,
    `--date=${date}`,
  ].join(' ');
}

function buildChecklist() {
  const evidence = readFileSync(resolve(root, backgroundAudioDeviceEvidencePath), 'utf8');
  const rows = parseBackgroundAudioDeviceEvidenceRows(evidence);
  const lines = [
    '# Kessho Product Core Native Background Audio Device Checklist',
    '',
    'Run each physical native row once. If a row is expensive or flaky after the first failure, record `manual-pending` or `fail` instead of rerunning loops.',
    '',
    'Use `?audioSession=debug&nativeProduct=diagnostic` for app-based native diagnostics. `supports_native_bridge` must remain `0` until every row below is recorded as `pass`.',
    '',
  ];

  for (const id of backgroundAudioDeviceEvidenceIds) {
    const row = rows.get(id);
    assert(row, `${backgroundAudioDeviceEvidencePath} missing row ${id}`);
    const passEvidence = (backgroundAudioDevicePassEvidenceRequirements.get(id) ?? [])
      .map((token) => (token.endsWith('=') ? `${token}...` : token))
      .join('; ');
    lines.push(
      `## ${id}`,
      '',
      `- Platform: ${row.platform}`,
      `- Scenario: ${row.scenario}`,
      `- Required evidence: ${row.requiredEvidence}`,
      `- Current status: ${row.status}`,
      `- Pass evidence tokens: ${passEvidence}`,
      '',
      'Dry-run pass row:',
      '',
      '```bash',
      `${recorderCommand(id, 'pass', passEvidence)} --dry-run`,
      '```',
      '',
      'Record pass row after the physical test:',
      '',
      '```bash',
      recorderCommand(id, 'pass', passEvidence),
      '```',
      '',
      'Record manual-pending/fail row after one expensive or flaky failed attempt:',
      '',
      '```bash',
      recorderCommand(id, 'manual-pending', 'build=...; reason=...; firstAttemptOnly=yes'),
      '```',
      '',
    );
  }

  return `${lines.join('\n')}\n`;
}

const args = parseArgs(process.argv.slice(2));
const checklist = buildChecklist();

if (args.check) {
  for (const id of backgroundAudioDeviceEvidenceIds) {
    assert(checklist.includes(`## ${id}`), `checklist missing ${id}`);
    for (const token of backgroundAudioDevicePassEvidenceRequirements.get(id) ?? []) {
      assert(checklist.includes(token), `checklist missing ${id} token ${token}`);
    }
  }
}

if (args.write) {
  mkdirSync(resolve(root, 'docs/reports'), { recursive: true });
  writeFileSync(resolve(root, reportPath), checklist);
  console.log(`Wrote ${reportPath}`);
} else if (!args.check) {
  process.stdout.write(checklist);
}
