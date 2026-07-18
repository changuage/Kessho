import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import {
  MOBILE_WEB_AUDIO_EVIDENCE_SCHEMA,
  validateMobileWebAudioAcceptanceEvidence,
  validateMobileWebAudioEvidence,
} from './lib/kesshoMobileWebAudioEvidence.mjs';

const root = process.cwd();

function parseArgs(argv) {
  const args = new Map();
  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '--help' || arg === '-h') {
      args.set(arg.replace(/^-+/, ''), 'true');
      continue;
    }
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (!match) throw new Error(`Unsupported argument ${arg}; use --key=value form`);
    args.set(match[1], match[2]);
  }
  return args;
}

function usage() {
  console.log(`Usage:
  npm run core:product:mobile-web-evidence:record -- \\
    --input=/path/to/device-capture.json \\
    [--output=docs/reports/kessho-mobile-web-audio-evidence-iphone11-safari-lock.json] \\
    [--dry-run]

The input must use schema ${MOBILE_WEB_AUDIO_EVIDENCE_SCHEMA}. The recorder
validates the complete capture before atomically writing it under docs/reports.
`);
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const args = parseArgs(process.argv.slice(2));
if (args.has('help') || args.has('h')) {
  usage();
  process.exit(0);
}

const inputArg = args.get('input');
if (!inputArg) throw new Error('--input is required');
const inputPath = resolve(root, inputArg);
const parsedEvidence = JSON.parse(readFileSync(inputPath, 'utf8'));
const evidence = parsedEvidence.acceptance === undefined
  ? validateMobileWebAudioEvidence(parsedEvidence, inputPath)
  : validateMobileWebAudioAcceptanceEvidence(parsedEvidence, inputPath);

const defaultName = [
  'kessho-mobile-web-audio-evidence',
  slug(evidence.device.model),
  evidence.device.browser,
  evidence.scenario.kind,
  evidence.scenario.output,
  evidence.acceptance?.milestone ?? 'baseline',
  ...(evidence.acceptance === undefined
    ? [slug(evidence.scenario.presetId)]
    : evidence.scenario.bundles.map(slug).sort()),
].join('-') + '.json';
const outputPath = resolve(root, args.get('output') ?? `docs/reports/${defaultName}`);
const reportsRoot = resolve(root, 'docs/reports');
if (outputPath !== reportsRoot && !outputPath.startsWith(`${reportsRoot}/`)) {
  throw new Error(`--output must be inside ${reportsRoot}`);
}

const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
if (args.get('dry-run') === 'true') {
  console.log(serialized.trimEnd());
  process.exit(0);
}

mkdirSync(dirname(outputPath), { recursive: true });
if (existsSync(outputPath)) {
  throw new Error(`Refusing to overwrite existing evidence capture: ${outputPath}`);
}
const temporaryPath = resolve(dirname(outputPath), `.${basename(outputPath)}.${process.pid}.tmp`);
writeFileSync(temporaryPath, serialized, { flag: 'wx' });
renameSync(temporaryPath, outputPath);
console.log(`Recorded validated mobile web audio evidence: ${outputPath}`);
