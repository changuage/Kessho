#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

for (const file of [
  'src/ui/harmony/HarmonyEnginePanel.tsx',
  'src/ui/SnowflakePrototypePage.tsx',
  'src/ui/routing/routingSourceRegistry.ts',
  'src/ui/synth/SynthPage.tsx',
  'src/ui/global/GlobalPage.tsx',
]) {
  const text = read(file);
  if (/label:\s*['"]Piano['"]/.test(text) || />\s*Piano\s*</.test(text) || /Piano sampler/.test(text)) {
    failures.push(`${file}: visible source UI must expose Sample 1 / Sample 2 instead of Piano`);
  }
}

const sourceMapping = read('src/audio/coreProductSourceMapping.ts');
if (sourceMapping.includes("'piano'") || sourceMapping.includes('"piano"')) {
  failures.push('src/audio/coreProductSourceMapping.ts: Product Core runtime source mapping must not accept piano');
}

const sampleSlotState = read('src/audio/sampleLibraries/sampleSlotState.ts');
if (!sampleSlotState.includes('createLegacyPianoSample1State') || !sampleSlotState.includes('sample1Enabled')) {
  failures.push('src/audio/sampleLibraries/sampleSlotState.ts: old Piano preset compatibility must map into sample1 fields');
}

const productRuntimeFiles = [
  'src/audio/coreProductArrangementSchedulerUtils.ts',
  'src/audio/coreProductChordVoices.ts',
  'src/audio/coreProductEvents.ts',
  'src/audio/coreProductSampleSequencerTargets.ts',
  'src/audio/coreProductSequencerFaceSnapshot.ts',
  'src/audio/coreProductSnapshot.ts',
  'src/audio/coreProductSnapshotPadVoiceRouting.ts',
  'src/audio/coreProductSourceMapping.ts',
  'src/audio/coreProductSourcePlayability.ts',
  'src/audio/product/host/CoreProductManualAuditionBridge.ts',
  'src/audio/product/host/CoreProductSampleAssetResolver.ts',
];
for (const file of productRuntimeFiles) {
  const text = read(file);
  const hasMarkedLegacyAlias = text.includes('ALLOW_PIANO_ALIAS_MIGRATION');
  if (!hasMarkedLegacyAlias && (text.includes("source === 'piano'") || text.includes('CORE_PRODUCT_SOURCE_IDS.piano') || text.includes('pianoEnabled'))) {
    failures.push(`${file}: Product Core runtime must not retain piano source aliases or enable fallbacks`);
  }
}

const pianoManifest = read('src/audio/sampleLibraries/pianoVirtualSampleLibrary.ts');
if (!pianoManifest.includes("displayName: 'Legacy Keys'") || !pianoManifest.includes('getCoreProductPianoAssetIdForMidiVariant')) {
  failures.push('src/audio/sampleLibraries/pianoVirtualSampleLibrary.ts: legacy key sample library must preserve compatibility asset IDs');
}

const canonicalFiles = [
  'src/ui/routing/routingSourceRegistry.ts',
  'src/audio/dawOutputRouting.ts',
  'src/ui/global/RoutingMatrix.tsx',
];
for (const file of canonicalFiles) {
  const text = read(file);
  if (/id:\s*['"]piano['"]/.test(text) || /source:\s*['"]piano['"]/.test(text)) {
    failures.push(`${file}: canonical routing sources must not include piano`);
  }
}

if (failures.length) {
  console.error('Piano source cleanup guard failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Piano source cleanup guard passed.');
