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

function requireTokens(path, tokens) {
  const source = read(path);
  for (const token of tokens) {
    assert(source.includes(token), `${path} must include Product Core source parity token: ${token}`);
  }
  return source;
}

const sourceWrapperPath = 'cpp/KesshoCore/tests/ProductSourceWrapperTests.cpp';
const sourceWrapper = requireTokens(sourceWrapperPath, [
  'requireGeneratedSourcePresetFamilyCoverage',
  'requireBroadPadPresetFamiliesRender',
  'requireBroadLeadPresetFamiliesRender',
  'requireGeneratedDrumPresetRenders',
  'requireGeneratedAssetPresetTelemetryCoverage',
  'requireRepresentativeFullArrangementProbe',
  'KESSHO_PRODUCT_SOURCE_PRESET_PAD_DEEP_SUB_DRONE',
  'KESSHO_PRODUCT_SOURCE_PRESET_PAD_GLASS_SHIMMER',
  'KESSHO_PRODUCT_SOURCE_PRESET_PAD_PLUCK_BELL',
  'KESSHO_PRODUCT_SOURCE_PRESET_PAD_SYNC_LEAD',
  'KESSHO_PRODUCT_SOURCE_PRESET_PAD_SERGE_SWARM',
  'KESSHO_PRODUCT_SOURCE_PRESET_LEAD_SOFT_RHODES',
  'KESSHO_PRODUCT_SOURCE_PRESET_LEAD_GAMELAN',
  'KESSHO_PRODUCT_SOURCE_PRESET_DRUM_DEFAULT',
  'KESSHO_PRODUCT_SOURCE_PRESET_PIANO_DEFAULT',
  'KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_WATER3',
  'KESSHO_PRODUCT_SOURCE_PRESET_SOUNDSCAPE_INSECTS2',
  'KESSHO_PRODUCT_SOURCE_PAD2',
  'KESSHO_PRODUCT_SOURCE_LEAD2',
  'KESSHO_PRODUCT_STEM_PIANO',
  'KESSHO_PRODUCT_STEM_SOUNDSCAPE',
  'kessho_product_register_asset_buffer',
]);

assert(
  /pad_count\s*==\s*25u/.test(sourceWrapper),
  `${sourceWrapperPath} must assert the full generated Pad preset family count`,
);
assert(
  /soundscape_count\s*==\s*14u/.test(sourceWrapper),
  `${sourceWrapperPath} must assert the full generated Soundscape preset family count`,
);
assert(
  /water_soundscape_count\s*==\s*8u/.test(sourceWrapper),
  `${sourceWrapperPath} must assert the generated water soundscape preset family count`,
);

requireTokens('cpp/KesshoCore/tests/ProductAssetTests.cpp', [
  'missing piano asset should not fake host playback',
  'registered asset did not render',
  'piano did not select nearest registered sample',
  'registered soundscape loop did not render',
  'soundscape loop did not continue rendering',
  'layered soundscape assets did not mix',
  'soundscape loop seam was not crossfaded toward loop start',
  'soundscape layer did not start at the deterministic randomized asset offset',
  'normal soundscape texture mode did not schedule 20 slices',
  'soundscape texture recent-offset avoidance did not keep distinct offsets',
  'soundscape texture sequence did not continue after unrelated param patch',
  'soundscape parity fixture telemetry did not label parity mode',
  'short soundscape texture telemetry did not report no-offset-variation reason',
  'birds soundscape policy should keep a wider C++-owned spread range than water',
]);

requireTokens('src/audio/coreProductSoundscapesSnapshot.ts', [
  "booleanFromState(state, 'soundscapeParityFixture', false)",
  'soundscapeParityFixture === true ? 0 : config.fadeTime',
  'SOUNDSCAPE_TEXTURE_PARAM_COUNT',
  'SOUNDSCAPE_PARITY_FIXTURE_PARAM',
]);

requireTokens('docs/kessho-product-source-parity-broadening.md', [
  'Product Core Source Parity Broadening',
  'Pad preset family probes',
  'Pad 2 probes',
  'Broader Lead preset probes',
  'Drum source probes',
  'Piano asset probes',
  'Soundscape asset probes',
  'Representative full-arrangement probe',
]);

const packageJson = read('package.json');
const productCiRunner = read('scripts/run-kessho-product-ci.mjs');
assert(
  packageJson.includes('"core:product:source-parity"'),
  'package.json must expose core:product:source-parity',
);
assert(
  productCiRunner.includes("'core:product:source-parity'"),
  'core:product:ci must run the source parity broadening gate',
);

console.log('Kessho Product source parity broadening checks passed');
