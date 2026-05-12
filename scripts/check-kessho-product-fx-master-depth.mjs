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
const nativeHeader = read('KesshoNativeSwift/CoreBridge/include/KesshoProductCoreBridge/KesshoProductCoreBridge.h');
const nativeBridge = read('KesshoNativeSwift/CoreBridge/KesshoProductCoreBridge.mm');
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
  'telemetry.master_saturation_drive = master_saturation_drive;',
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
  'float master_limiter_gain_reduction_db;',
  'float master_saturation_drive;',
  'float dynamics_saturation_drive;',
]) {
  assert(telemetryHeader.includes(token), `C telemetry ABI is missing ${token}`);
  assert(nativeHeader.includes(token), `native telemetry ABI is missing ${token}`);
}

for (const token of [
  'masterInputPeak?: number;',
  'masterOutputPeak?: number;',
  'masterOutputRms?: number;',
  'masterTruePeak?: number;',
  'masterTruePeakDbtp?: number;',
  'masterIntegratedLufs?: number;',
  'masterLimiterGainReductionDb?: number;',
  'masterSaturationDrive?: number;',
  'dynamicsSaturationDrive?: number;',
]) {
  assert(telemetryTs.includes(token), `TS telemetry type is missing ${token}`);
}

for (const token of [
  'const TELEMETRY_BYTES = 368;',
  'masterInputPeak: this.view.getFloat32(ptr + 324, true)',
  'masterOutputPeak: this.view.getFloat32(ptr + 328, true)',
  'masterOutputRms: this.view.getFloat32(ptr + 332, true)',
  'masterLimiterGainReductionDb: this.view.getFloat32(ptr + 336, true)',
  'masterSaturationDrive: this.view.getFloat32(ptr + 340, true)',
  'dynamicsSaturationDrive: this.view.getFloat32(ptr + 344, true)',
  'masterTruePeak: this.view.getFloat32(ptr + 352, true)',
  'masterTruePeakDbtp: this.view.getFloat32(ptr + 356, true)',
  'masterIntegratedLufs: this.view.getFloat32(ptr + 360, true)',
]) {
  assert(worklet.includes(token), `worklet telemetry reader is missing ${token}`);
}

for (const token of [
  'native.master_input_peak = telemetry.master_input_peak;',
  'native.master_output_peak = telemetry.master_output_peak;',
  'native.master_output_rms = telemetry.master_output_rms;',
  'native.master_limiter_gain_reduction_db = telemetry.master_limiter_gain_reduction_db;',
  'native.master_saturation_drive = telemetry.master_saturation_drive;',
  'native.dynamics_saturation_drive = telemetry.dynamics_saturation_drive;',
  'native.master_true_peak = telemetry.master_true_peak;',
  'native.master_true_peak_dbtp = telemetry.master_true_peak_dbtp;',
  'native.master_integrated_lufs = telemetry.master_integrated_lufs;',
]) {
  assert(nativeBridge.includes(token), `native telemetry bridge is missing ${token}`);
}

for (const token of [
  'sizeof(KesshoProductTelemetry) == 368',
  'offsetof(KesshoProductTelemetry, master_input_peak) == 324',
  'offsetof(KesshoProductTelemetry, dynamics_saturation_drive) == 344',
  'offsetof(KesshoProductTelemetry, master_true_peak) == 352',
  'offsetof(KesshoProductTelemetry, master_integrated_lufs) == 360',
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
