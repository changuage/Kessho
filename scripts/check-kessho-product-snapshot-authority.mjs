import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const snapshotPath = 'src/audio/coreProductSnapshot.ts';
const snapshot = read(snapshotPath);
const soundscapesSnapshotPath = 'src/audio/coreProductSoundscapesSnapshot.ts';
const soundscapesSnapshot = read(soundscapesSnapshotPath);
const snapshotEncoderPath = 'src/audio/coreProductSnapshotEncoder.ts';
const snapshotEncoder = read(snapshotEncoderPath);
const legacyCompatPath = 'src/audio/CoreProductLegacyPresetCompat.ts';
const legacyCompat = read(legacyCompatPath);
const snapshotAuthoritySurface = `${snapshot}\n${soundscapesSnapshot}\n${snapshotEncoder}\n${legacyCompat}`;

const allowedImports = new Set([
  './generated/kesshoProductSchema',
  '../ui/state',
  './CoreProductLegacyPresetCompat',
  './coreProductEvents',
  './coreProductAssets',
  './coreProductSoundscapesSnapshot',
  './coreProductSnapshotEncoder',
  './coreProductSnapshotTypes',
  './distanceMacro',
  './granularMacroCore',
  './harmony',
  './outputTrims',
  '../platform',
  './rng',
  './transport',
]);

const imports = Array.from(snapshot.matchAll(/from '([^']+)'/g), (match) => match[1]);
for (const source of imports) {
  assert(allowedImports.has(source), `${snapshotPath} imports unclassified dependency: ${source}`);
}
for (const source of allowedImports) {
  assert(imports.includes(source), `${snapshotPath} import allowlist drifted; missing expected dependency: ${source}`);
}

const soundscapesAllowedImports = new Set([
  './generated/kesshoProductSchema',
  './waterPresets',
]);
const soundscapesImports = Array.from(soundscapesSnapshot.matchAll(/from '([^']+)'/g), (match) => match[1]);
for (const source of soundscapesImports) {
  assert(soundscapesAllowedImports.has(source), `${soundscapesSnapshotPath} imports unclassified dependency: ${source}`);
}
for (const source of soundscapesAllowedImports) {
  assert(soundscapesImports.includes(source), `${soundscapesSnapshotPath} import allowlist drifted; missing expected dependency: ${source}`);
}

const encoderAllowedImports = new Set([
  './generated/kesshoProductSchema',
  './coreProductEvents',
  './CoreProductLegacyPresetCompat',
  './coreProductSnapshot',
]);
const encoderImports = Array.from(snapshotEncoder.matchAll(/from '([^']+)'/g), (match) => match[1]);
for (const source of encoderImports) {
  assert(encoderAllowedImports.has(source), `${snapshotEncoderPath} imports unclassified dependency: ${source}`);
}
for (const source of encoderAllowedImports) {
  assert(encoderImports.includes(source), `${snapshotEncoderPath} import allowlist drifted; missing expected dependency: ${source}`);
}

for (const token of [
  'SNAPSHOT_AUTHORITY: GENERATED_SCHEMA_SERIALIZATION',
  'SNAPSHOT_AUTHORITY: LEGACY_PRESET_KEY_TO_GENERATED_ID',
  'SNAPSHOT_AUTHORITY: TEMP_COMPAT_WEB_REFERENCE',
  'SNAPSHOT_AUTHORITY: INITIAL_RNG_SEED_ONLY',
  'SNAPSHOT_AUTHORITY: SERIALIZE_PRODUCT_STATE',
  'SNAPSHOT_AUTHORITY: PACK_GENERATED_SNAPSHOT_BYTES',
]) {
  assert(snapshotAuthoritySurface.includes(token), `${snapshotPath}/${legacyCompatPath} missing authority label: ${token}`);
}

for (const forbidden of [
  'Math.random',
  'Date.now',
  'performance.now',
  'setTimeout',
  'setInterval',
  'new AudioContext',
  'AudioWorklet',
  'fetch(',
  'XMLHttpRequest',
  'localStorage',
  'sessionStorage',
]) {
  assert(!snapshotAuthoritySurface.includes(forbidden), `${snapshotPath}/${legacyCompatPath} must not own runtime or hidden state via ${forbidden}`);
}

function assertCallInside(source, sourcePath, callToken, startToken, endToken, message) {
  const startIndex = source.indexOf(startToken);
  const endIndex = source.indexOf(endToken);
  const callIndex = source.indexOf(callToken, startIndex);
  assert(callIndex >= 0, `${sourcePath} missing call token ${callToken}`);
  assert(startIndex >= 0 && endIndex > startIndex, `${sourcePath} missing bounded region for ${callToken}`);
  assert(callIndex > startIndex && callIndex < endIndex, message);
}

assertCallInside(
  legacyCompat,
  legacyCompatPath,
  'KESSHO_PRODUCT_PAD_PARAM_SPECS',
  'function exactPadParamsFromState',
  'function leadPresetFromKey',
  'Pad exact param specs must stay inside the labeled temporary Pad bridge',
);
assertCallInside(
  legacyCompat,
  legacyCompatPath,
  'morphPresets(',
  'function exactLeadParamsFromState',
  'function exactDrumParamsFromState',
  'Lead preset morphing must stay inside the labeled temporary Lead bridge',
);
assertCallInside(
  legacyCompat,
  legacyCompatPath,
  'KESSHO_PRODUCT_DRUM_PARAM_SPECS',
  'function exactDrumParamsFromState',
  'function drumVoicePresetId',
  'Drum exact params must stay inside the labeled temporary Drum bridge',
);

for (const forbiddenImportUsage of [
  'writePadParams',
  'writeLeadParams',
  'writeDrumParams',
  'advanceCorePreviewHarmonyState',
  'getCoreHarmonyPreviewTickCount',
]) {
  assert(!snapshotAuthoritySurface.includes(forbiddenImportUsage), `${snapshotPath}/${legacyCompatPath} contains musical-brain helper usage: ${forbiddenImportUsage}`);
}

assert(
  snapshot.includes('source.presetId = endpointPresetId') &&
    snapshot.includes('source.presetId = sourcePresetId') &&
    snapshot.includes('drumVoicePresetAIds') &&
    snapshot.includes('drumVoicePresetBIds') &&
    snapshot.includes('drumVoiceMorphs'),
  `${snapshotPath} must preserve canonical Product Core preset ID and Drum voice bridge fields`,
);

console.log('Kessho Product snapshot authority checks passed');
