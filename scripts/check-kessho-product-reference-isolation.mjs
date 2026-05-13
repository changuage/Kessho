import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

const productFiles = [
  'src/audio/CoreProductAssetAdapter.ts',
  'src/audio/coreProductAssets.ts',
  'src/audio/CoreProductFallbackDiagnostics.ts',
  'src/audio/CoreProductLegacyPresetCompat.ts',
  'src/audio/CoreProductRuntimeAdapter.ts',
  'src/audio/coreProductEngineHost.ts',
  'src/audio/coreProductEvents.ts',
  'src/audio/coreProductRuntime.ts',
  'src/audio/coreProductSnapshot.ts',
  'src/audio/coreProductTelemetry.ts',
];

const forbiddenAudioModules = new Set([
  './coreEngineHost',
  './drumMorph',
  './drumPresets',
  './drumSeqEvolve',
  './drumSeqTypes',
  './drumSequencer',
  './drumSynth',
  './dynamicsModel',
  './earthTexturePlayer',
  './engine',
  './euclidean',
  './granularMacroModel',
  './granularSeqEvolve',
  './harmony',
  './morphUtils',
  './padPresets',
  './padRandomize',
  './rng',
  './scales',
  './seqEvolveCore',
  './seqEvolveTypes',
  './sequencerVisualSync',
  './sonicParityHarness',
  './synthSeqEvolve',
  './waterPresets',
]);

const classifiedRuntimeAllowlist = new Map([
  ['./coreProductAssets', 'product module'],
  ['./coreProductAssetManifest.json', 'versioned Product asset manifest'],
  ['./CoreProductAssetAdapter', 'product host asset adapter'],
  ['./CoreProductLegacyPresetCompat', 'temporary Product snapshot compatibility bridge'],
  ['./CoreProductRuntimeAdapter', 'product host snapshot dirty-diff adapter'],
  ['./coreProductEvents', 'product module'],
  ['./CoreProductFallbackDiagnostics', 'product runtime fallback diagnostics'],
  ['./coreProductRuntime', 'product module'],
  ['./coreProductSnapshot', 'product module'],
  ['./coreProductTelemetry', 'product module'],
  ['./coreMidiEvents', 'product MIDI event packing'],
  ['./delayBuses', 'unit conversion for generated Product params'],
  ['./generated/kesshoProductEvents', 'generated Product ABI'],
  ['./generated/kesshoProductParams', 'generated Product ABI'],
  ['./generated/kesshoProductSchema', 'generated Product ABI'],
  ['./lead4opfm', 'temporary Lead exact-patch compatibility bridge'],
  ['./outputTrims', 'serialization default/trim constants'],
  ['./pianoSamples', 'asset manifest helper'],
  ['./transport', 'transport serialization metrics'],
  ['../native/capacitorMidiRouting', 'type-only MIDI message interface'],
  ['../ui/state', 'UI serialization defaults only'],
]);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function importDeclarations(source) {
  return Array.from(source.matchAll(/import\s+(type\s+)?[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g), (match) => ({
    typeOnly: Boolean(match[1]),
    specifier: match[2],
    declaration: match[0],
  }));
}

for (const file of productFiles) {
  const source = readFileSync(resolve(root, file), 'utf8');
  for (const imported of importDeclarations(source)) {
    const specifier = imported.specifier;
    if (specifier === './engine' && imported.typeOnly) {
      continue;
    }
    if (specifier === './lead4opfm' && file === 'src/audio/CoreProductLegacyPresetCompat.ts') {
      assert(source.includes('SNAPSHOT_AUTHORITY: TEMP_COMPAT_WEB_REFERENCE'), 'lead4opfm bridge import must stay labeled as TEMP_COMPAT_WEB_REFERENCE');
      continue;
    }
    assert(
      !forbiddenAudioModules.has(specifier),
      `${file} imports forbidden old TypeScript musical-brain module ${specifier}`,
    );
    assert(
      classifiedRuntimeAllowlist.has(specifier) || !specifier.startsWith('.'),
      `${file} import is not reference-isolation classified: ${specifier}`,
    );
  }
}

const legacyCompat = readFileSync(resolve(root, 'src/audio/CoreProductLegacyPresetCompat.ts'), 'utf8');
const bridgePolicy = readFileSync(resolve(root, 'docs/kessho-product-patch-bridge-policy.md'), 'utf8');
const doc = readFileSync(resolve(root, 'docs/kessho-product-reference-isolation.md'), 'utf8');

assert(legacyCompat.includes("from './lead4opfm'"), 'Lead exact patch bridge import must remain visible until retired');
assert(bridgePolicy.includes('TEMP_COMPAT_WEB_REFERENCE'), 'temporary web reference bridge must have a documented policy');
assert(doc.includes('Forbidden Production Imports'), 'reference isolation doc must classify forbidden imports');
assert(doc.includes('lead4opfm'), 'reference isolation doc must classify the temporary Lead bridge import');
for (const token of [
  '| Import path | Current reason | Owner | Classification | Replacement C++ Product Core owner | Retirement condition | Target removal phase |',
  'CANONICAL_GENERATED_SCHEMA_HELPER',
  'TEMP_COMPAT_WEB_REFERENCE',
  'TEMP_COMPAT_NATIVE_REFERENCE',
  'TEST_ONLY_REFERENCE',
  'DEPRECATED_BRIDGE_FIELD',
  'FORBIDDEN_FOR_CORE_PRODUCT',
  './CoreProductFallbackDiagnostics',
]) {
  assert(doc.includes(token), `reference isolation doc is missing ${token}`);
}
for (const specifier of classifiedRuntimeAllowlist.keys()) {
  assert(doc.includes(`\`${specifier}\``), `reference isolation doc does not classify allowlisted import ${specifier}`);
}

console.log('Kessho Product reference isolation checks passed');
