#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const forbiddenPayloadTokens = [
  'decodedLoopStartFrame',
  'AudioBuffer',
  'sampleCacheHitCount',
  'sampleCacheMissCount',
  'sampleDecodedBytesEstimate',
  'asset bytes',
];
const forbiddenManifestBlobPatterns = [
  /full manifest JSON/i,
  /sample.*manifest.*payload/i,
  /payload.*sample.*manifest/i,
];
const allowedStableTokens = [
  'sample1Enabled',
  'sample1LibraryKey',
  'sample1Role',
  'sample1Articulation',
  'sample1SelectionMode',
  'sample1DynamicMode',
  'sample1FixedDynamic',
  'sample1Level',
  'sample1AttackMs',
  'sample1DecayMs',
  'sample1Sustain',
  'sample1HoldMs',
  'sample1ReleaseMs',
  'sample1LoopEnabled',
  'sample1MaxVoices',
  'sample2Enabled',
  'sample2LibraryKey',
  'sample2Role',
  'sample2Articulation',
  'sample2SelectionMode',
  'sample2DynamicMode',
  'sample2FixedDynamic',
  'sample2Level',
  'sample2AttackMs',
  'sample2DecayMs',
  'sample2Sustain',
  'sample2HoldMs',
  'sample2ReleaseMs',
  'sample2LoopEnabled',
  'sample2MaxVoices',
];
const scanRoots = [
  'src/presets',
  'src/ui/state.ts',
  'src/audio/sampleLibraries/sampleSlotState.ts',
  'src/audio/coreProductSnapshot.ts',
  'src/audio/coreProductSnapshotDefaults.ts',
  'src/audio/coreProductSnapshotTypes.ts',
];
const allowedFiles = new Set([
  'src/presets/presetSoftDeleteRegression.test.ts',
]);

function filesUnder(target) {
  const abs = path.join(root, target);
  if (!fs.existsSync(abs)) return [];
  const stat = fs.statSync(abs);
  if (stat.isFile()) return [target];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(target, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(rel));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const files = [...new Set(scanRoots.flatMap(filesUnder))];
for (const file of files) {
  if (allowedFiles.has(file)) continue;
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  for (const token of forbiddenPayloadTokens) {
    if (text.includes(token)) failures.push(`${file}: preset/sample payload code must not store ${token}`);
  }
  if (text.includes('Float32Array') && /preset|payload|sample/i.test(text)) {
    failures.push(`${file}: preset/sample payload code must not store Float32Array`);
  }
  for (const pattern of forbiddenManifestBlobPatterns) {
    if (pattern.test(text)) failures.push(`${file}: preset payload must not store sample manifest blobs`);
  }
}

const stateText = fs.readFileSync(path.join(root, 'src/ui/state.ts'), 'utf8');
for (const token of allowedStableTokens) {
  if (!stateText.includes(token)) failures.push(`src/ui/state.ts: missing stable sampler field ${token}`);
}

if (failures.length) {
  console.error('Sampler preset payload guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Sampler preset payload guard passed.');
