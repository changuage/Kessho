#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireTokens(path, tokens) {
  const source = read(path);
  for (const token of tokens) {
    assert(source.includes(token), `${path} is missing reverb tail-quality token: ${token}`);
  }
}

const packageJson = JSON.parse(read('package.json'));

requireTokens('cpp/KesshoCore/src/product/fx/ProductReverb.cpp', [
  'resetReverbHarmonyCoupling',
  'advanceReverbHarmonyCoupling',
  'reverb_wash_boost',
  'reverb_bloom_boost',
  'configureReverbModule()',
  'reverbPreCompressorGainDbForLevel',
  'reverbPreconditionerSoftLimit',
  'processReverbPreconditioner',
  'spectral_freeze_active',
  'spectral_freeze_reverb_crossfade',
  'reverb_module->processPlanarStereo',
  'mixFxBuffer(module_l, module_r, out_l, out_r, start, frames, return_gain, kSidechainReverb)',
]);

requireTokens('cpp/KesshoCore/src/product/fx/ProductFxModules.cpp', [
  'params[0] = static_cast<float>(clampU32(fx.reverb_type, 0u, 5u))',
  'params[1] = static_cast<float>(clampU32(fx.reverb_quality, 0u, 2u))',
  'params[2] = effective_decay',
  'params[3] = clampFloat(fx.reverb_size, 0.5f, 10.0f)',
  'params[4] = clampFloat(fx.reverb_damping, 0.0f, 1.0f)',
  'params[6] = clampFloat(fx.reverb_modulation, 0.0f, 1.0f)',
  'params[9] = effective_shimmer',
  'params[13] = clampFloat(fx.reverb_reverse_amount, 0.0f, 1.0f)',
  'params[22] = clampFloat(fx.reverb_shimmer_feedback, 0.0f, 1.0f)',
  'params[28] = clampFloat(fx.reverb_transient_smooth, 0.0f, 1.0f)',
]);

requireTokens('cpp/KesshoCore/src/modules/KesshoReverbModule.cpp', [
  'reverb_instance_set_quality',
  'reverb_instance_set_shimmer',
  'reverb_instance_set_reverse',
  'reverb_instance_set_shimmer_feedback',
  'reverb_instance_set_transient_smooth',
]);

requireTokens('scripts/test-kessho-core.mjs', [
  'WASM reverb interleaved module should produce a non-zero tail',
  'WASM reverb planar module should produce a non-zero tail',
  'moduleGetParamCount(reverbModule) === 30',
  'reverbParamsPtr !== reverbParamsPtrB',
]);

requireTokens('scripts/lib/kesshoProductWebGraphSmokeCases.mjs', [
  'manual-pad-delay-a-reverb-send',
  'manual-pad-delay-b-reverb-send',
  'manual-drum-reverb-send',
  'manual-pad-sidechain-reverb-output',
  'spectral-freeze-reverb-return',
]);

requireTokens('scripts/check-kessho-product-page-cpu-comparison.mjs', [
  'reverbPatch()',
  "'reverb'",
  "'algorithmic reverb'",
  "'shimmer'",
  "'reverse'",
  "'spectral freeze'",
]);

assert(
  packageJson.scripts?.['core:product:reverb-tail-quality'] === 'node scripts/check-kessho-product-reverb-tail-quality.mjs',
  'package.json must expose core:product:reverb-tail-quality',
);

console.log('Kessho Product reverb tail-quality checks passed');
