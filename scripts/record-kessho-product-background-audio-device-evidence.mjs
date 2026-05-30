import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  backgroundAudioDeviceEvidencePath,
  updateBackgroundAudioDeviceEvidenceMarkdown,
  validateBackgroundAudioDeviceEvidenceResult,
} from './lib/kesshoBackgroundAudioDeviceEvidence.mjs';

const root = process.cwd();
const evidencePath = backgroundAudioDeviceEvidencePath;

function parseArgs(argv) {
  const args = new Map();
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      args.set('help', 'true');
      continue;
    }
    if (arg === '--dry-run') {
      args.set('dry-run', 'true');
      continue;
    }
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) {
      throw new Error(`Unsupported argument ${arg}. Use --key=value form.`);
    }
    args.set(match[1], match[2]);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node scripts/record-kessho-product-background-audio-device-evidence.mjs \\
    --id=ios-native-foreground \\
    --status=pass \\
    --evidence="build=...; peak=...; rms=...; audible=yes" \\
    --tester="Name" \\
    --date=YYYY-MM-DD

Options:
  --dry-run      Validate and print the updated row without writing the ledger.
  --help         Show this help.

Statuses:
  pending, manual-pending, pass, fail
`);
}

const args = parseArgs(process.argv.slice(2));
if (args.has('help')) {
  usage();
  process.exit(0);
}

const id = args.get('id') ?? '';
const status = args.get('status') ?? '';
const evidence = args.get('evidence') ?? '-';
const tester = args.get('tester') ?? '-';
const date = args.get('date') ?? '-';
const dryRun = args.get('dry-run') === 'true';

validateBackgroundAudioDeviceEvidenceResult({ id, status, evidence, tester, date });

const absoluteEvidencePath = resolve(root, evidencePath);
const currentEvidence = readFileSync(absoluteEvidencePath, 'utf8');
const { markdown, updatedRow } = updateBackgroundAudioDeviceEvidenceMarkdown(currentEvidence, {
  id,
  status,
  evidence,
  tester,
  date,
});

if (dryRun) {
  console.log(updatedRow);
  process.exit(0);
}

writeFileSync(absoluteEvidencePath, markdown);
execFileSync(process.execPath, ['scripts/check-kessho-product-background-audio-device-evidence.mjs'], {
  cwd: root,
  stdio: 'inherit',
});
console.log(`Recorded ${id} as ${status}`);
