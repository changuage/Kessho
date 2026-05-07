import { existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';

const root = process.cwd();
const wasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const sampleRate = 48000;
const blockSize = 128;
const totalFrames = 65536;
const realtimeBlockBudgetMs = (blockSize / sampleRate) * 1000;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requireExport(exports, name) {
  const fn = exports[name] || exports[`_${name}`];
  if (typeof fn !== 'function') {
    throw new Error(`Missing WASM export: ${name}`);
  }
  return fn;
}

function wasmImports() {
  return {
    env: {
      emscripten_notify_memory_growth: () => {},
      abort: () => {},
    },
    wasi_snapshot_preview1: {
      fd_write: () => 0,
      fd_seek: () => 0,
      fd_close: () => 0,
      proc_exit: () => {},
      environ_get: () => 0,
      environ_sizes_get: () => 0,
      clock_time_get: () => 0,
    },
  };
}

async function instantiateCore() {
  if (!existsSync(wasmPath)) {
    throw new Error('Missing public/worklets/kessho_core.wasm. Run `npm run core:build:wasm` first.');
  }

  const module = await WebAssembly.compile(readFileSync(wasmPath));
  return WebAssembly.instantiate(module, wasmImports());
}

function writeSnapshot(view, ptr) {
  view.setUint32(ptr, 1, true);
  view.setUint32(ptr + 4, 0x4b435632, true);
  view.setFloat32(ptr + 8, 126, true);
  view.setFloat32(ptr + 12, 1, true);
  view.setInt32(ptr + 16, 1, true);
  view.setFloat32(ptr + 20, 336.52, true);
  view.setFloat32(ptr + 24, 0.1375, true);
  view.setUint32(ptr + 28, 1, true);
  view.setUint32(ptr + 32, 4, true);
  view.setUint32(ptr + 36, 4, true);
  view.setUint32(ptr + 40, 123456, true);
  view.setUint32(ptr + 44, 0, true);
}

function makeDryDynamicsParams() {
  const params = new Float32Array(82);
  params[0] = 1; // active
  params[1] = 0; // allpassActive
  params[2] = 1; // dry
  params[3] = 0; // wet
  return params;
}

function makeColoredDynamicsParams() {
  const params = makeDryDynamicsParams();
  params[2] = 0.35; // dry
  params[3] = 0.65; // wet
  params[4] = 0.72; // degradeMix
  params[5] = 0.42; // workletAlias
  params[6] = 0.38; // rawDegradeGeneration
  params[7] = 0.2; // rawCorrosion
  params[8] = 0.55; // rawMediaWear
  params[13] = 0.0035; // baseDelay
  params[14] = 0.009; // spreadBaseDelay
  params[15] = 0.28; // randomDrift
  params[16] = 0.16; // randomHoldRateHz
  params[17] = 0.9; // randomHoldLag
  params[18] = 0.0009; // randomDelayDepth
  params[19] = 0.0014; // randomSpreadDelayDepth
  params[20] = 35; // randomFilterDepth
  params[21] = 18; // randomSpreadFilterDepth
  params[22] = 0.28; // depth
  params[23] = 0.16; // rate
  params[26] = 0.45; // stereo
  params[27] = 0.1; // damage
  params[30] = 0.92; // mainDelayGain
  params[31] = 0.16; // spreadDelayGain
  params[32] = 0.12; // wowFrequency
  params[33] = 4.8; // flutterFrequency
  params[35] = 0.0008; // wowDepth
  params[36] = 0.00008; // flutterDepth
  params[37] = 60; // highpassHz
  params[38] = 0.9; // highpassQ
  params[53] = 8200; // lowpassHz
  params[54] = 0.9; // lowpassQ
  params[55] = 7600; // lowpassStage2Hz
  params[56] = 0.8; // lowpassStage2Q
  params[57] = -18; // compressorThreshold
  params[58] = 12; // compressorKnee
  params[59] = 1.6; // compressorRatio
  params[60] = 0.01; // compressorAttack
  params[61] = 0.18; // compressorRelease
  params[62] = 1.02; // compressorMakeup
  params[63] = 0.12; // saturation
  params[64] = 0.08; // corrosion
  return params;
}

function configureDynamicsModule(api, heap, module, params) {
  const paramsPtr = api.moduleGetParamsPtr(module);
  assert(paramsPtr !== 0, 'dynamics module params pointer was null');
  const offset = paramsPtr >> 2;
  heap.set(params, offset);
  api.moduleCommitParams(module);
}

function configureMixerIdentityRoute(api, view, mixer, routePtr, inputLPtrsPtr, inputRPtrsPtr, outputLPtrsPtr, outputRPtrsPtr, leftPtr, rightPtr, mixLeftPtr, mixRightPtr) {
  view.setUint32(inputLPtrsPtr, leftPtr, true);
  view.setUint32(inputRPtrsPtr, rightPtr, true);
  view.setUint32(outputLPtrsPtr, mixLeftPtr, true);
  view.setUint32(outputRPtrsPtr, mixRightPtr, true);
  view.setUint32(routePtr, 0, true);
  view.setUint32(routePtr + 4, 0, true);
  view.setFloat32(routePtr + 8, 1.0, true);
  view.setFloat32(routePtr + 12, 1.0, true);
  view.setUint32(routePtr + 16, 1, true);
  assert(api.mixerSetRoute(mixer, 0, routePtr) === 1, 'failed to configure core preview identity mixer route');
}

async function renderPreview({ dynamicsParams, mixerRoute = false }) {
  const { exports: wasm } = await instantiateCore();
  const api = {
    malloc: requireExport(wasm, 'malloc'),
    free: requireExport(wasm, 'free'),
    create: requireExport(wasm, 'kessho_create'),
    destroy: requireExport(wasm, 'kessho_destroy'),
    start: requireExport(wasm, 'kessho_start'),
    render: requireExport(wasm, 'kessho_render'),
    applySnapshot: requireExport(wasm, 'kessho_apply_snapshot_v1'),
    moduleCreate: requireExport(wasm, 'kessho_module_create'),
    moduleDestroy: requireExport(wasm, 'kessho_module_destroy'),
    moduleGetParamsPtr: requireExport(wasm, 'kessho_module_get_params_ptr'),
    moduleCommitParams: requireExport(wasm, 'kessho_module_commit_params'),
    moduleProcessPlanarStereo: requireExport(wasm, 'kessho_module_process_planar_stereo'),
    mixerCreate: requireExport(wasm, 'kessho_mixer_create'),
    mixerDestroy: requireExport(wasm, 'kessho_mixer_destroy'),
    mixerSetRoute: requireExport(wasm, 'kessho_mixer_set_route'),
    mixerProcessPlanarStereo: requireExport(wasm, 'kessho_mixer_process_planar_stereo'),
  };

  const leftPtr = api.malloc(blockSize * Float32Array.BYTES_PER_ELEMENT);
  const rightPtr = api.malloc(blockSize * Float32Array.BYTES_PER_ELEMENT);
  const mixLeftPtr = mixerRoute ? api.malloc(blockSize * Float32Array.BYTES_PER_ELEMENT) : 0;
  const mixRightPtr = mixerRoute ? api.malloc(blockSize * Float32Array.BYTES_PER_ELEMENT) : 0;
  const mixerInputLPtrsPtr = mixerRoute ? api.malloc(4) : 0;
  const mixerInputRPtrsPtr = mixerRoute ? api.malloc(4) : 0;
  const mixerOutputLPtrsPtr = mixerRoute ? api.malloc(4) : 0;
  const mixerOutputRPtrsPtr = mixerRoute ? api.malloc(4) : 0;
  const mixerRoutePtr = mixerRoute ? api.malloc(20) : 0;
  const snapshotPtr = api.malloc(48);
  const engine = api.create(sampleRate, blockSize);
  const mixer = mixerRoute ? api.mixerCreate() : 0;
  assert(
    leftPtr !== 0 &&
      rightPtr !== 0 &&
      snapshotPtr !== 0 &&
      engine !== 0 &&
      (!mixerRoute ||
        (mixLeftPtr !== 0 &&
          mixRightPtr !== 0 &&
          mixerInputLPtrsPtr !== 0 &&
          mixerInputRPtrsPtr !== 0 &&
          mixerOutputLPtrsPtr !== 0 &&
          mixerOutputRPtrsPtr !== 0 &&
          mixerRoutePtr !== 0 &&
          mixer !== 0)),
    'core preview setup failed',
  );

  const heap = new Float32Array(wasm.memory.buffer);
  const view = new DataView(wasm.memory.buffer);
  const leftOffset = leftPtr >> 2;
  const rightOffset = rightPtr >> 2;
  const outputLeftOffset = (mixerRoute ? mixLeftPtr : leftPtr) >> 2;
  const outputRightOffset = (mixerRoute ? mixRightPtr : rightPtr) >> 2;
  let dynamicsModule = 0;

  if (dynamicsParams) {
    dynamicsModule = api.moduleCreate(1, sampleRate, blockSize);
    assert(dynamicsModule !== 0, 'failed to create dynamics module for core preview');
    configureDynamicsModule(api, heap, dynamicsModule, dynamicsParams);
  }

  if (mixerRoute) {
    configureMixerIdentityRoute(
      api,
      view,
      mixer,
      mixerRoutePtr,
      mixerInputLPtrsPtr,
      mixerInputRPtrsPtr,
      mixerOutputLPtrsPtr,
      mixerOutputRPtrsPtr,
      leftPtr,
      rightPtr,
      mixLeftPtr,
      mixRightPtr,
    );
  }

  writeSnapshot(view, snapshotPtr);
  assert(api.applySnapshot(engine, snapshotPtr) === 1, 'failed to apply core preview snapshot');
  api.start(engine);

  const output = new Float32Array(totalFrames * 2);
  let written = 0;
  let elapsedMs = 0;
  let peakBlockMs = 0;
  let blocks = 0;
  while (written < totalFrames) {
    const frames = Math.min(blockSize, totalFrames - written);
    const start = performance.now();
    api.render(engine, leftPtr, rightPtr, frames);

    if (dynamicsModule) {
      assert(
        api.moduleProcessPlanarStereo(dynamicsModule, leftPtr, rightPtr, leftPtr, rightPtr, frames) === 1,
        'failed to process dynamics module in core preview path',
      );
    }

    if (mixerRoute) {
      assert(
        api.mixerProcessPlanarStereo(
          mixer,
          mixerInputLPtrsPtr,
          mixerInputRPtrsPtr,
          1,
          mixerOutputLPtrsPtr,
          mixerOutputRPtrsPtr,
          1,
          frames,
        ) === 1,
        'failed to process identity mixer route in core preview path',
      );
    }

    for (let i = 0; i < frames; i += 1) {
      output[(written + i) * 2] = heap[outputLeftOffset + i];
      output[(written + i) * 2 + 1] = heap[outputRightOffset + i];
    }

    const blockElapsedMs = performance.now() - start;
    elapsedMs += blockElapsedMs;
    peakBlockMs = Math.max(peakBlockMs, blockElapsedMs);
    blocks += 1;
    written += frames;
  }

  if (dynamicsModule) api.moduleDestroy(dynamicsModule);
  if (mixerRoute) api.mixerDestroy(mixer);
  api.destroy(engine);
  api.free(leftPtr);
  api.free(rightPtr);
  if (mixerRoute) {
    api.free(mixLeftPtr);
    api.free(mixRightPtr);
    api.free(mixerInputLPtrsPtr);
    api.free(mixerInputRPtrsPtr);
    api.free(mixerOutputLPtrsPtr);
    api.free(mixerOutputRPtrsPtr);
    api.free(mixerRoutePtr);
  }
  api.free(snapshotPtr);
  return {
    output,
    cpu: {
      avgPercent: ((elapsedMs / Math.max(1, blocks)) / realtimeBlockBudgetMs) * 100,
      peakPercent: (peakBlockMs / realtimeBlockBudgetMs) * 100,
      blocks,
    },
  };
}

function signalStats(signal) {
  let peak = 0;
  let sumSq = 0;
  for (const sample of signal) {
    assert(Number.isFinite(sample), 'core preview produced a non-finite sample');
    peak = Math.max(peak, Math.abs(sample));
    sumSq += sample * sample;
  }
  return { peak, rms: Math.sqrt(sumSq / Math.max(1, signal.length)) };
}

function diffStats(a, b) {
  assert(a.length === b.length, 'core preview output lengths differ');
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = a[i] - b[i];
    peak = Math.max(peak, Math.abs(diff));
    sumSq += diff * diff;
  }
  return { peak, rms: Math.sqrt(sumSq / Math.max(1, a.length)) };
}

const direct = await renderPreview({});
const withDryDynamics = await renderPreview({ dynamicsParams: makeDryDynamicsParams() });
const withColoredDynamics = await renderPreview({ dynamicsParams: makeColoredDynamicsParams() });
const mixerRouted = await renderPreview({ mixerRoute: true });
const mixerRoutedWithDryDynamics = await renderPreview({ dynamicsParams: makeDryDynamicsParams(), mixerRoute: true });
const directStats = signalStats(direct.output);
const residual = diffStats(direct.output, withDryDynamics.output);
const mixerResidual = diffStats(direct.output, mixerRouted.output);
const mixerDryResidual = diffStats(withDryDynamics.output, mixerRoutedWithDryDynamics.output);
const coloredResidual = diffStats(direct.output, withColoredDynamics.output);
const dryModuleOverheadAvg = withDryDynamics.cpu.avgPercent - direct.cpu.avgPercent;
const coloredModuleOverheadAvg = withColoredDynamics.cpu.avgPercent - direct.cpu.avgPercent;
const mixerOverheadAvg = mixerRouted.cpu.avgPercent - direct.cpu.avgPercent;
const mixerDryOverheadAvg = mixerRoutedWithDryDynamics.cpu.avgPercent - withDryDynamics.cpu.avgPercent;

assert(directStats.peak > 0.02, 'core selected-preset preview render was unexpectedly quiet');
assert(directStats.peak <= 0.138, `core selected-preset preview exceeded expected amplitude: ${directStats.peak}`);
assert(
  residual.rms <= 1.0e-7 && residual.peak <= 1.0e-6,
  `core selected-preset dry module path changed samples: RMS ${residual.rms}, peak ${residual.peak}`,
);
assert(
  mixerResidual.rms <= 1.0e-7 && mixerResidual.peak <= 1.0e-6,
  `core selected-preset identity mixer route changed direct samples: RMS ${mixerResidual.rms}, peak ${mixerResidual.peak}`,
);
assert(
  mixerDryResidual.rms <= 1.0e-7 && mixerDryResidual.peak <= 1.0e-6,
  `core selected-preset identity mixer route changed dry dynamics samples: RMS ${mixerDryResidual.rms}, peak ${mixerDryResidual.peak}`,
);
assert(
  coloredResidual.rms > 1.0e-5 && coloredResidual.peak > 1.0e-4,
  `core selected-preset colored module path was unexpectedly transparent: RMS ${coloredResidual.rms}, peak ${coloredResidual.peak}`,
);
assert(direct.cpu.blocks >= 512, 'core preview CPU check did not render enough blocks');
assert(withDryDynamics.cpu.blocks === direct.cpu.blocks, 'core preview CPU comparison block counts differ');
assert(withColoredDynamics.cpu.blocks === direct.cpu.blocks, 'core colored preview CPU comparison block counts differ');
assert(mixerRouted.cpu.blocks === direct.cpu.blocks, 'core mixer preview CPU comparison block counts differ');
assert(mixerRoutedWithDryDynamics.cpu.blocks === direct.cpu.blocks, 'core mixer dry preview CPU comparison block counts differ');
assert(direct.cpu.avgPercent < 20, `core preview direct render average CPU too high: ${direct.cpu.avgPercent}%`);
assert(
  withDryDynamics.cpu.avgPercent < 45,
  `core preview dry module render average CPU too high: ${withDryDynamics.cpu.avgPercent}%`,
);
assert(
  dryModuleOverheadAvg < 30,
  `core preview dry module average CPU overhead too high: ${dryModuleOverheadAvg}%`,
);
assert(
  withColoredDynamics.cpu.avgPercent < 45,
  `core preview colored module render average CPU too high: ${withColoredDynamics.cpu.avgPercent}%`,
);
assert(
  coloredModuleOverheadAvg < 30,
  `core preview colored module average CPU overhead too high: ${coloredModuleOverheadAvg}%`,
);
assert(
  mixerRouted.cpu.avgPercent < 45,
  `core preview identity mixer render average CPU too high: ${mixerRouted.cpu.avgPercent}%`,
);
assert(
  mixerRoutedWithDryDynamics.cpu.avgPercent < 60,
  `core preview identity mixer dry module render average CPU too high: ${mixerRoutedWithDryDynamics.cpu.avgPercent}%`,
);
assert(
  mixerOverheadAvg < 30,
  `core preview identity mixer average CPU overhead too high: ${mixerOverheadAvg}%`,
);
assert(
  mixerDryOverheadAvg < 30,
  `core preview identity mixer dry module average CPU overhead too high: ${mixerDryOverheadAvg}%`,
);

console.log(
  `KesshoCore web module preview parity passed: RMS ${residual.rms.toExponential(3)}, peak ${residual.peak.toExponential(3)}; ` +
  `identity mixer RMS ${mixerResidual.rms.toExponential(3)}, peak ${mixerResidual.peak.toExponential(3)}, ` +
  `identity mixer dry RMS ${mixerDryResidual.rms.toExponential(3)}, peak ${mixerDryResidual.peak.toExponential(3)}; ` +
  `CPU avg direct ${direct.cpu.avgPercent.toFixed(2)}%, dry module ${withDryDynamics.cpu.avgPercent.toFixed(2)}%, ` +
  `identity mixer ${mixerRouted.cpu.avgPercent.toFixed(2)}%, identity mixer dry ${mixerRoutedWithDryDynamics.cpu.avgPercent.toFixed(2)}%, ` +
  `colored module ${withColoredDynamics.cpu.avgPercent.toFixed(2)}%, overhead ${dryModuleOverheadAvg.toFixed(2)}% dry / ` +
  `${mixerOverheadAvg.toFixed(2)}% mixer / ${mixerDryOverheadAvg.toFixed(2)}% mixer dry / ` +
  `${coloredModuleOverheadAvg.toFixed(2)}% colored; colored residual RMS ${coloredResidual.rms.toExponential(3)}, ` +
  `peak ${coloredResidual.peak.toExponential(3)}`,
);
