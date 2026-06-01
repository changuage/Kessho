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
    assert(source.includes(token), `${path} is missing granular artifact token: ${token}`);
  }
}

const packageJson = JSON.parse(read('package.json'));

requireTokens('cpp/KesshoCore/src/product/fx/ProductGranularRuntime.cpp', [
  'kGranularControlSmoothSeconds',
  'smoothedGranularControl',
  'std::isfinite(target)',
  'granularSendGainForFrame',
  'advanceGranularReturnGains',
  'advanceGranularPhraseReseed',
  'granular_module->setRandomSeed(rng_state)',
]);

requireTokens('cpp/KesshoCore/src/product/fx/ProductGranular.cpp', [
  'renderGranular',
  'fx.granular_enabled',
  'configureGranularLowpass(granular_output_lpf',
  'configureGranularLowpass(granular_reverb_lpf',
  'const float attack_coeff',
  'const float release_coeff',
  'advanceGranularReturnGains(transport.sample_frame + i)',
  'sidechainGain(kSidechainGranular, frame)',
]);

requireTokens('cpp/KesshoCore/src/product/fx/ProductGranularFilters.cpp', [
  'clampFloat(cutoff_hz',
  'std::isfinite(y) ? y : 0.0f',
]);

requireTokens('cpp/KesshoCore/src/product/fx/ProductFxModules.cpp', [
  'params[1] = fx.granular_freeze ? 1.0f : 0.0f',
  'params[2] = fx.granular_freeze_with_feedback ? 1.0f : 0.0f',
  'clampFloat(fx.granular_feedback, 0.0f, 0.85f)',
  'clampFloat(fx.granular_buffer_seconds, 1.0f, 32.0f)',
  'clampFloat(voice.density, 1.0f, 64.0f)',
  'clampFloat(voice.grain_size_ms, 10.0f, 500.0f)',
  'clampFloat(voice.attack_seconds, 0.001f, 0.5f)',
  'clampFloat(voice.decay_seconds, 0.01f, 4.0f)',
]);

requireTokens('scripts/test-kessho-core.mjs', [
  'WASM granular disabled module should pass input',
  'WASM granular disabled planar module process failed',
  'WASM granular active module should produce non-zero output',
  'moduleGetParamCount(granularModule) === 138',
  'granularParamsPtr !== granularParamsPtrB',
]);

requireTokens('scripts/lib/kesshoProductWebGraphSmokeCases.mjs', [
  'manual-pad-granular-output-clean-direct',
  'manual-pad-granular-output-two-voice-clean',
  'manual-pad-granular-output-modulated-clean',
  'manual-pad-granular-output-feedback-clean',
  'manual-pad-granular-output-delayed-freeze-clean',
  'granularFreeze: true',
  'manual-pad-granular-reverb-send-clean',
  'manual-pad-granular-to-delay-a-send-clean',
  'manual-pad-granular-to-delay-b-send-clean',
]);

requireTokens('src/audio/coreProductTelemetry.ts', [
  'activeGrains',
  'granularWriteHeadPosition',
  'granularVoicePositions',
  'granularBufferWaveform',
]);

requireTokens('public/worklets/kessho-core-product.worklet.js', [
  'GRANULAR_WAVEFORM_BINS',
  "this.resolve('kessho_product_copy_granular_waveform')",
  'readGranularWaveform(includeGranularWaveform)',
  'telemetry.granularBufferWaveform = granularBufferWaveform',
]);

requireTokens('cpp/KesshoCore/src/modules/KesshoGranularModule.cpp', [
  'copyGranularWaveform',
  'granular_instance_get_buffer_ptr_l',
  'kSamplesPerBin',
]);

requireTokens('cpp/KesshoCore/src/product/KesshoProductApi.cpp', [
  'kessho_product_copy_granular_waveform',
]);

requireTokens('scripts/check-kessho-product-page-cpu-comparison.mjs', [
  'granularPatch()',
  "'granular'",
  "'4 granular voices'",
  "'legacy voice'",
  "'clean voice'",
]);

assert(
  packageJson.scripts?.['core:product:granular-artifacts'] === 'node scripts/check-kessho-product-granular-artifacts.mjs',
  'package.json must expose core:product:granular-artifacts',
);

console.log('Kessho Product granular artifact checks passed');
