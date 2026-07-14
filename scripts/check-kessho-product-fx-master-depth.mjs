import { execFileSync } from 'node:child_process';
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

const fxTest = read('cpp/KesshoCore/tests/ProductFxRoutingTests.cpp');
const cpuTest = read('cpp/KesshoCore/tests/ProductCpuBudgetTests.cpp');
const render = read('cpp/KesshoCore/src/product/KesshoProductRender.cpp');
const telemetryHeader = read('cpp/KesshoCore/include/KesshoCore/KesshoProductTelemetry.h');
const telemetryTs = read('src/audio/coreProductTelemetry.ts');
const worklet = read('public/worklets/kessho-core-product.worklet.js');
const abiTest = read('cpp/KesshoCore/tests/ProductAbiLayoutTests.cpp');
const statusDoc = read('docs/kessho-product-core-migration-status.md');
const depthDoc = read('docs/kessho-product-fx-master-depth.md');

for (const token of [
  'requireMasterGainStagingScalesBeforeLimiter',
  'requireMasterTelemetryReportsLimiterSaturationAndLoudness',
  'requireDisabledFxBypassKeepsDryAndSilencesFxStem',
  'requireProductResetClearsFxTails',
  'direct.applyDynamicsModParamEvent(event)',
  'direct.sidechainGain(kSidechainPad1, 127u) > 0.99f',
]) {
  assert(fxTest.includes(token), `FX routing depth test is missing ${token}`);
}

for (const token of [
  'disableAllFx(disabled_snapshot)',
  'enableFxStress(active_snapshot)',
  'disabled_stats.average_percent < 25.0',
  'active_stats.average_percent < 35.0',
  'disabled_stats.p95_ms < quantum_ms * 0.5',
  'active_stats.p99_ms < quantum_ms',
  'max_allowed_missed_quantums',
  'missed_quantum_count <= max_allowed_missed_quantums',
]) {
  assert(cpuTest.includes(token), `CPU depth gate is missing ${token}`);
}

for (const token of [
  'telemetry.master_input_peak = master_input_peak;',
  'telemetry.master_output_peak = master_output_peak;',
  'telemetry.master_output_rms =',
  'telemetry.master_true_peak = master_true_peak;',
  'telemetry.master_true_peak_dbtp = gainToDb(master_true_peak);',
  'telemetry.master_integrated_lufs =',
  'telemetry.master_limiter_gain_reduction_db = limiter_gain_reduction_db;',
  'telemetry.dynamics_saturation_drive = fx.dynamics_saturation_drive;',
]) {
  assert(render.includes(token), `Product render telemetry is missing ${token}`);
}

for (const token of [
  'float master_input_peak;',
  'float master_output_peak;',
  'float master_output_rms;',
  'float master_true_peak;',
  'float master_true_peak_dbtp;',
  'float master_integrated_lufs;',
  'float granular_write_head;',
  'float granular_voice_positions[4];',
  'float pad1_filter_freq;',
  'float pad1_lfo1_value;',
  'float pad2_filter_freq;',
  'float pad2_lfo1_value;',
  'float master_limiter_gain_reduction_db;',
  'float dynamics_saturation_drive;',
]) {
  assert(telemetryHeader.includes(token), `C telemetry ABI is missing ${token}`);
}

for (const token of [
  'masterInputPeak?: number;',
  'masterOutputPeak?: number;',
  'masterOutputRms?: number;',
  'masterTruePeak?: number;',
  'masterTruePeakDbtp?: number;',
  'masterIntegratedLufs?: number;',
  'granularWriteHeadPosition?: number;',
  'granularVoicePositions?: [number, number, number, number];',
  'pad1FilterFreq?: number;',
  'pad1Lfo1Value?: number;',
  'pad2FilterFreq?: number;',
  'pad2Lfo1Value?: number;',
  'masterLimiterGainReductionDb?: number;',
  'dynamicsSaturationDrive?: number;',
]) {
  assert(telemetryTs.includes(token), `TS telemetry type is missing ${token}`);
}

for (const token of [
  'const TELEMETRY_BYTES = 15168;',
  'masterInputPeak: this.view.getFloat32(ptr + 968, true)',
  'masterOutputPeak: this.view.getFloat32(ptr + 972, true)',
  'masterOutputRms: this.view.getFloat32(ptr + 976, true)',
  'masterLimiterGainReductionDb: this.view.getFloat32(ptr + 980, true)',
  'dynamicsSaturationDrive: this.view.getFloat32(ptr + 984, true)',
  'masterTruePeak: this.view.getFloat32(ptr + 992, true)',
  'masterTruePeakDbtp: this.view.getFloat32(ptr + 996, true)',
  'masterIntegratedLufs: this.view.getFloat32(ptr + 1000, true)',
  'granularWriteHeadPosition: this.view.getFloat32(ptr + 1004, true)',
  'granularVoicePositions: [',
  'pad1FilterFreq: this.view.getFloat32(ptr + 1024, true)',
  'pad1Lfo1Value: this.view.getFloat32(ptr + 1028, true)',
  'pad2FilterFreq: this.view.getFloat32(ptr + 1032, true)',
  'pad2Lfo1Value: this.view.getFloat32(ptr + 1036, true)',
  'synthSequencerHitCounts.push(this.view.getUint32(ptr + 1040 + index * 4, true));',
  'drumSequencerHitCounts.push(this.view.getUint32(ptr + 1104 + index * 4, true));',
  'synthSequencerCurrentSteps.push(this.view.getUint32(ptr + 1168 + index * 4, true));',
  'drumSequencerCurrentSteps.push(this.view.getUint32(ptr + 1232 + index * 4, true));',
]) {
  assert(worklet.includes(token), `worklet telemetry reader is missing ${token}`);
}

for (const token of [
  'sizeof(KesshoProductTelemetry) == 15168',
  'offsetof(KesshoProductTelemetry, master_input_peak) == 968',
  'offsetof(KesshoProductTelemetry, dynamics_saturation_drive) == 984',
  'offsetof(KesshoProductTelemetry, master_true_peak) == 992',
  'offsetof(KesshoProductTelemetry, master_integrated_lufs) == 1000',
  'offsetof(KesshoProductTelemetry, granular_write_head) == 1004',
  'offsetof(KesshoProductTelemetry, granular_voice_positions) == 1008',
  'offsetof(KesshoProductTelemetry, pad1_filter_freq) == 1024',
  'offsetof(KesshoProductTelemetry, pad1_lfo1_value) == 1028',
  'offsetof(KesshoProductTelemetry, pad2_filter_freq) == 1032',
  'offsetof(KesshoProductTelemetry, pad2_lfo1_value) == 1036',
  'offsetof(KesshoProductTelemetry, synth_sequencer_hit_counts) == 1040',
  'offsetof(KesshoProductTelemetry, drum_sequencer_hit_counts) == 1104',
  'offsetof(KesshoProductTelemetry, synth_sequencer_current_steps) == 1168',
  'offsetof(KesshoProductTelemetry, drum_sequencer_current_steps) == 1232',
  'offsetof(KesshoProductTelemetry, granular_visual_event_count) == 7736',
  'offsetof(KesshoProductTelemetry, granular_visual_events) == 7740',
]) {
  assert(abiTest.includes(token), `ABI layout test is missing ${token}`);
}

for (const token of [
  'FX/dynamics/master depth',
  'disabled-FX CPU',
  'limiter/saturation/loudness telemetry',
  'integrated LUFS',
  'true-peak',
]) {
  assert(depthDoc.includes(token), `FX depth doc is missing ${token}`);
  assert(statusDoc.includes(token), `migration status doc is missing ${token}`);
}

execFileSync(process.execPath, ['scripts/run-kessho-product-cpp-test.mjs', 'ProductFxRoutingTests'], {
  cwd: root,
  stdio: 'inherit',
});
execFileSync(process.execPath, ['scripts/run-kessho-product-cpp-test.mjs', 'ProductCpuBudgetTests'], {
  cwd: root,
  stdio: 'inherit',
});

console.log('Kessho Product FX/master depth checks passed');
