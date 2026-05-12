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

const allowedImports = new Set([
  './generated/kesshoProductSchema',
  '../ui/state',
  './lead4opfm',
  './coreProductEvents',
  './coreProductAssets',
  './delayBuses',
  './outputTrims',
  './transport',
]);

const imports = Array.from(snapshot.matchAll(/from '([^']+)'/g), (match) => match[1]);
for (const source of imports) {
  assert(allowedImports.has(source), `${snapshotPath} imports unclassified dependency: ${source}`);
}
for (const source of allowedImports) {
  assert(imports.includes(source), `${snapshotPath} import allowlist drifted; missing expected dependency: ${source}`);
}

for (const token of [
  'SNAPSHOT_AUTHORITY: GENERATED_SCHEMA_SERIALIZATION',
  'SNAPSHOT_AUTHORITY: LEGACY_PRESET_KEY_TO_GENERATED_ID',
  'SNAPSHOT_AUTHORITY: TEMP_COMPAT_WEB_REFERENCE',
  'SNAPSHOT_AUTHORITY: INITIAL_RNG_SEED_ONLY',
  'SNAPSHOT_AUTHORITY: SERIALIZE_PRODUCT_STATE',
  'SNAPSHOT_AUTHORITY: PACK_GENERATED_SNAPSHOT_BYTES',
]) {
  assert(snapshot.includes(token), `${snapshotPath} missing authority label: ${token}`);
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
  assert(!snapshot.includes(forbidden), `${snapshotPath} must not own runtime or hidden state via ${forbidden}`);
}

function assertCallInside(callToken, startToken, endToken, message) {
  const startIndex = snapshot.indexOf(startToken);
  const endIndex = snapshot.indexOf(endToken);
  const callIndex = snapshot.indexOf(callToken, startIndex);
  assert(callIndex >= 0, `${snapshotPath} missing call token ${callToken}`);
  assert(startIndex >= 0 && endIndex > startIndex, `${snapshotPath} missing bounded region for ${callToken}`);
  assert(callIndex > startIndex && callIndex < endIndex, message);
}

assertCallInside(
  'KESSHO_PRODUCT_PAD_PARAM_SPECS',
  'function exactPadParamsFromState',
  'function leadPresetFromKey',
  'Pad exact param specs must stay inside the labeled temporary Pad bridge',
);
assertCallInside(
  'morphPresets(',
  'function exactLeadParamsFromState',
  'function emptyDrumParams',
  'Lead preset morphing must stay inside the labeled temporary Lead bridge',
);
assertCallInside(
  'KESSHO_PRODUCT_DRUM_DEFAULT_PARAMS',
  'function emptyDrumParams',
  'function drumVoicePresetId',
  'Drum exact params must stay as the labeled temporary default filler',
);

for (const forbiddenImportUsage of [
  'writePadParams',
  'writeLeadParams',
  'writeDrumParams',
  'advanceCorePreviewHarmonyState',
  'getCoreHarmonyPreviewTickCount',
]) {
  assert(!snapshot.includes(forbiddenImportUsage), `${snapshotPath} contains musical-brain helper usage: ${forbiddenImportUsage}`);
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
