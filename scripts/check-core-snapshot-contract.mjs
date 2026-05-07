import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const buildDir = resolve(root, 'build/kessho-core/snapshot');
const sourcePath = resolve(root, 'src/audio/coreSnapshot.ts');
const outputPath = resolve(buildDir, 'coreSnapshot.mjs');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertFiniteTree(value, path = '') {
  if (typeof value === 'number') {
    assert(Number.isFinite(value), `${path || 'value'} must be finite`);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteTree(item, `${path}[${index}]`));
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assertFiniteTree(child, path ? `${path}.${key}` : key);
    }
  }
}

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

const transpiled = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
  },
  fileName: sourcePath,
});
writeFileSync(outputPath, transpiled.outputText);

const {
  KESSHO_CORE_SCHEMA,
  KESSHO_CORE_SCHEMA_HASH,
  createKesshoEngineSnapshot,
  stableStringifyKesshoSnapshot,
  toKesshoCorePresetPreviewScalarsV1,
  toKesshoCoreSnapshotScalarsV1,
  validateKesshoEngineSnapshot,
} = await import(pathToFileURL(outputPath).href);

const baseState = {
  transportPrimaryClock: 'bpm',
  transportBarsPerPhrase: 4,
  transportBeatsPerBar: 4,
  phraseLength: 8,
  sequencerMasterBPM: 120,
  masterVolume: 0.82,
  reverbEnabled: true,
  padEnabled: true,
  synthLevel: 0.44,
  padPresetA: 'soft_pad',
  padPresetB: 'bright_pad',
  padMorph: 0.25,
  pad2Enabled: false,
  pad2Level: 0,
  leadEnabled: true,
  lead1Level: 0.35,
  lead1PresetA: 'soft_rhodes',
  lead1PresetB: 'gamelan',
  lead1Morph: 0.4,
  lead2Enabled: false,
  granularEnabled: true,
  granularLevel: 0.2,
  density: 22,
  feedback: 0.1,
  maxGrains: 64,
  drumEuclidMasterEnabled: true,
  drumLevel: 0.7,
  earthLevel: 0.8,
  oceanSampleEnabled: true,
  oceanSampleLevel: 0.5,
  reverbLevel: 0.3,
  reverbDecay: 0.5,
  reverbQuality: 'balanced',
  reverbType: 'plate',
  width: 0.9,
  delayAMix: 0.2,
  delayAFeedback: 0.3,
  delayATime: 375,
  delayBMix: 0.1,
  delayBFeedback: 0.2,
  dynamicsEnabled: true,
  dynamicsSaturationDrive: 0.1,
  sidechainAmount: 0.2,
  spectralFreezeEnabled: false,
};

const snapshotA = createKesshoEngineSnapshot(baseState, {
  presetId: 'golden-a',
  presetName: 'Golden A',
  seed: 42,
});
const snapshotB = createKesshoEngineSnapshot({ ...baseState }, {
  presetId: 'golden-a',
  presetName: 'Golden A',
  seed: 42,
});

assert(snapshotA.version === 1, 'snapshot version mismatch');
assert(snapshotA.engineSchema === KESSHO_CORE_SCHEMA, 'snapshot schema mismatch');
assert(snapshotA.voices.length >= 5, 'snapshot should include representative voices');
assert(snapshotA.fx.length >= 4, 'snapshot should include representative effects');
assert(validateKesshoEngineSnapshot(snapshotA).length === 0, 'valid snapshot should pass validation');
assert(stableStringifyKesshoSnapshot(snapshotA) === stableStringifyKesshoSnapshot(snapshotB), 'same preset should serialize identically');
assertFiniteTree(snapshotA);

const dirtyState = {
  ...baseState,
  masterVolume: Number.NaN,
  sequencerMasterBPM: Number.POSITIVE_INFINITY,
  delayAMix: Number.NaN,
};
const sanitized = createKesshoEngineSnapshot(dirtyState);
assertFiniteTree(sanitized);
assert(!stableStringifyKesshoSnapshot(sanitized).includes('NaN'), 'stable snapshot must not contain NaN');

const invalidErrors = validateKesshoEngineSnapshot({
  version: 999,
  engineSchema: 'wrong',
});
assert(invalidErrors.includes('version must be 1'), 'validator should reject bad version');
assert(invalidErrors.some((error) => error.includes('engineSchema')), 'validator should reject bad schema');
assert(invalidErrors.includes('transport is required'), 'validator should require transport');
assert(invalidErrors.includes('routing is required'), 'validator should require routing');

const scalars = toKesshoCoreSnapshotScalarsV1(snapshotA);
assert(scalars.version === 1, 'scalar version mismatch');
assert(scalars.schemaHash === KESSHO_CORE_SCHEMA_HASH, 'scalar schema hash mismatch');
assert(scalars.bpm === 120, 'scalar BPM mismatch');
assert(scalars.masterGain === 0.82, 'scalar master gain mismatch');
assert(scalars.beatsPerBar === 4, 'scalar beats-per-bar mismatch');
assert(scalars.barsPerPhrase === 4, 'scalar bars-per-phrase mismatch');
assert(scalars.seed === 42, 'scalar seed mismatch');
assertFiniteTree(scalars);

const previewScalars = toKesshoCorePresetPreviewScalarsV1(snapshotA);
const previewScalarsRepeat = toKesshoCorePresetPreviewScalarsV1(snapshotB);
assert(previewScalars.renderMode === 1, 'selected preset preview should enable render mode');
assert(previewScalars.smokeFrequencyHz >= 80 && previewScalars.smokeFrequencyHz <= 880, 'preview frequency out of range');
assert(previewScalars.smokeAmplitude > 0 && previewScalars.smokeAmplitude <= 0.22, 'preview amplitude out of range');
assert(previewScalars.seed === 42, 'explicit preview seed should be preserved');
assert(
  JSON.stringify(previewScalars) === JSON.stringify(previewScalarsRepeat),
  'same selected preset preview should produce identical scalars',
);
assertFiniteTree(previewScalars);

const silentPreview = toKesshoCorePresetPreviewScalarsV1(createKesshoEngineSnapshot({
  ...baseState,
  reverbEnabled: false,
  padEnabled: false,
  synthLevel: 0,
  leadEnabled: false,
  lead1Level: 0,
  granularEnabled: false,
  granularLevel: 0,
  drumEuclidMasterEnabled: false,
  drumLevel: 0,
  oceanSampleEnabled: false,
  natureEnabled: false,
  earthLevel: 0,
  reverbLevel: 0,
  delayAMix: 0,
  delayBMix: 0,
  dynamicsEnabled: false,
  spectralFreezeEnabled: false,
}));
assert(silentPreview.renderMode === 0, 'silent selected preset preview should disable render mode');
assert(silentPreview.smokeAmplitude === 0, 'silent selected preset preview should mute');
assertFiniteTree(silentPreview);

console.log('KesshoCore snapshot contract checks passed');
