import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  kesshoCoreIncludeArgs,
  kesshoCoreWasmExportedFunctions,
  resolveKesshoCoreSources,
} from './kessho-core-build-manifest.mjs';

const root = process.cwd();
const buildDir = resolve(root, 'build/kessho-core/tests');
const sources = resolveKesshoCoreSources(root);
const testSource = resolve(root, 'cpp/KesshoCore/tests/kessho_core_smoke.cpp');
const testBinary = resolve(buildDir, 'kessho_core_smoke');
const wasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const coreAbiVersion = 2;
const leadFmParamCount = 112;
const leadFmParamRelease = 46;
const leadFmParamOutputSelect = 79;
const padParamCount = 118;
const padParamRelease = 35;
const padParamLevel = 57;
const padParamReverbSend = 116;
const padParamOutputSelect = 117;
const padOutputTapCount = 6;
const dynamicsDriftParamCount = 99;
const granularParamCount = 199;

function run(command, args) {
  console.log(`> ${[command, ...args].join(' ')}`);
  execFileSync(command, args, { cwd: root, stdio: 'inherit' });
}

function requireWasmExport(exports, name) {
  if (typeof exports[name] === 'function' || typeof exports[`_${name}`] === 'function') {
    return;
  }

  throw new Error(`Missing WASM export: ${name}`);
}

function resolveWasmExport(exports, name) {
  const fn = exports[name] || exports[`_${name}`];
  if (typeof fn !== 'function') {
    throw new Error(`Missing WASM export: ${name}`);
  }

  return fn;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function maxAbs(heap, offset, frames) {
  let peak = 0;
  for (let i = 0; i < frames; i += 1) {
    const value = heap[offset + i];
    assert(Number.isFinite(value), 'WASM render produced a non-finite sample');
    peak = Math.max(peak, Math.abs(value));
  }

  return peak;
}

function diffRms(heap, leftOffset, rightOffset, frames) {
  let sum = 0;
  for (let i = 0; i < frames; i += 1) {
    const diff = heap[leftOffset + i] - heap[rightOffset + i];
    sum += diff * diff;
  }

  return Math.sqrt(sum / Math.max(1, frames));
}

async function checkWasmExports() {
  if (!existsSync(wasmPath)) {
    console.log('Skipping WASM export smoke check; public/worklets/kessho_core.wasm has not been built yet.');
    return;
  }

  const module = await WebAssembly.compile(readFileSync(wasmPath));
  const instance = await WebAssembly.instantiate(module, {
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
  });

  for (const name of kesshoCoreWasmExportedFunctions) {
    requireWasmExport(instance.exports, name);
  }

  const wasm = instance.exports;
  const malloc = resolveWasmExport(wasm, 'malloc');
  const free = resolveWasmExport(wasm, 'free');
  const getAbiVersion = resolveWasmExport(wasm, 'kessho_get_abi_version');
  const create = resolveWasmExport(wasm, 'kessho_create');
  const destroy = resolveWasmExport(wasm, 'kessho_destroy');
  const reset = resolveWasmExport(wasm, 'kessho_reset');
  const start = resolveWasmExport(wasm, 'kessho_start');
  const isRunning = resolveWasmExport(wasm, 'kessho_is_running');
  const render = resolveWasmExport(wasm, 'kessho_render');
  const setRenderMode = resolveWasmExport(wasm, 'kessho_set_render_mode');
  const setSmokeTone = resolveWasmExport(wasm, 'kessho_set_smoke_tone');
  const applySnapshot = resolveWasmExport(wasm, 'kessho_apply_snapshot_v1');
  const setTransportSignature = resolveWasmExport(wasm, 'kessho_set_transport_signature');
  const pushParamEvent = resolveWasmExport(wasm, 'kessho_push_param_event');
  const pushMidiEvent = resolveWasmExport(wasm, 'kessho_push_midi_event');
  const pushTransportEvent = resolveWasmExport(wasm, 'kessho_push_transport_event');
  const getEventQueueDepth = resolveWasmExport(wasm, 'kessho_get_event_queue_depth');
  const getMidiEventsProcessed = resolveWasmExport(wasm, 'kessho_get_midi_events_processed');
  const setSeed = resolveWasmExport(wasm, 'kessho_set_seed');
  const getSeed = resolveWasmExport(wasm, 'kessho_get_seed');
  const nextRandomFloat = resolveWasmExport(wasm, 'kessho_next_random_float');
  const getSampleFrame = resolveWasmExport(wasm, 'kessho_get_sample_frame');
  const getTransportInfo = resolveWasmExport(wasm, 'kessho_get_transport_info');
  const moduleCreate = resolveWasmExport(wasm, 'kessho_module_create');
  const moduleDestroy = resolveWasmExport(wasm, 'kessho_module_destroy');
  const moduleGetParamCount = resolveWasmExport(wasm, 'kessho_module_get_param_count');
  const moduleGetParamsPtr = resolveWasmExport(wasm, 'kessho_module_get_params_ptr');
  const moduleCommitParams = resolveWasmExport(wasm, 'kessho_module_commit_params');
  const moduleNoteOn = resolveWasmExport(wasm, 'kessho_module_note_on');
  const moduleAllNotesOff = resolveWasmExport(wasm, 'kessho_module_all_notes_off');
  const moduleGetActiveVoiceCount = resolveWasmExport(wasm, 'kessho_module_get_active_voice_count');
  const moduleGetOutputTapCount = resolveWasmExport(wasm, 'kessho_module_get_output_tap_count');
  const moduleProcessInterleaved = resolveWasmExport(wasm, 'kessho_module_process_interleaved');
  const moduleProcessPlanarStereo = resolveWasmExport(wasm, 'kessho_module_process_planar_stereo');
  const moduleProcessPlanarStereoTaps = resolveWasmExport(wasm, 'kessho_module_process_planar_stereo_taps');
  const mixerCreate = resolveWasmExport(wasm, 'kessho_mixer_create');
  const mixerDestroy = resolveWasmExport(wasm, 'kessho_mixer_destroy');
  const mixerClearRoutes = resolveWasmExport(wasm, 'kessho_mixer_clear_routes');
  const mixerSetRoute = resolveWasmExport(wasm, 'kessho_mixer_set_route');
  const mixerGetStats = resolveWasmExport(wasm, 'kessho_mixer_get_stats');
  const mixerProcessPlanarStereo = resolveWasmExport(wasm, 'kessho_mixer_process_planar_stereo');

  const frames = 128;
  const leftPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
  const rightPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
  const moduleInputPtr = malloc(frames * 2 * Float32Array.BYTES_PER_ELEMENT);
  const moduleOutputPtr = malloc(frames * 2 * Float32Array.BYTES_PER_ELEMENT);
  const mixerInput0LPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
  const mixerInput0RPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
  const mixerInput1LPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
  const mixerInput1RPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
  const mixerOutput0LPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
  const mixerOutput0RPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
  const mixerOutput1LPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
  const mixerOutput1RPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
  const moduleTapMainLPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
  const moduleTapMainRPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
  const moduleTapReverbLPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
  const moduleTapReverbRPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
  const mixerInputLPtrsPtr = malloc(2 * 4);
  const mixerInputRPtrsPtr = malloc(2 * 4);
  const mixerOutputLPtrsPtr = malloc(2 * 4);
  const mixerOutputRPtrsPtr = malloc(2 * 4);
  const moduleTapOutputLPtrsPtr = malloc(2 * 4);
  const moduleTapOutputRPtrsPtr = malloc(2 * 4);
  const mixerRoutePtr = malloc(20);
  const mixerStatsPtr = malloc(8);
  const snapshotPtr = malloc(48);
  const paramEventPtr = malloc(16);
  const midiEventPtr = malloc(36);
  const transportEventPtr = malloc(8);
  const transportInfoPtr = malloc(96);
  const engine = create(48000, frames);
  const mixer = mixerCreate();
  assert(
      leftPtr !== 0 &&
      rightPtr !== 0 &&
      moduleInputPtr !== 0 &&
      moduleOutputPtr !== 0 &&
      mixerInput0LPtr !== 0 &&
      mixerInput0RPtr !== 0 &&
      mixerInput1LPtr !== 0 &&
      mixerInput1RPtr !== 0 &&
      mixerOutput0LPtr !== 0 &&
      mixerOutput0RPtr !== 0 &&
      mixerOutput1LPtr !== 0 &&
      mixerOutput1RPtr !== 0 &&
      moduleTapMainLPtr !== 0 &&
      moduleTapMainRPtr !== 0 &&
      moduleTapReverbLPtr !== 0 &&
      moduleTapReverbRPtr !== 0 &&
      mixerInputLPtrsPtr !== 0 &&
      mixerInputRPtrsPtr !== 0 &&
      mixerOutputLPtrsPtr !== 0 &&
      mixerOutputRPtrsPtr !== 0 &&
      moduleTapOutputLPtrsPtr !== 0 &&
      moduleTapOutputRPtrsPtr !== 0 &&
      mixerRoutePtr !== 0 &&
      mixerStatsPtr !== 0 &&
      snapshotPtr !== 0 &&
      paramEventPtr !== 0 &&
      midiEventPtr !== 0 &&
      transportEventPtr !== 0 &&
      transportInfoPtr !== 0 &&
      engine !== 0 &&
      mixer !== 0,
    'WASM setup allocation failed',
  );

  let heap = new Float32Array(wasm.memory.buffer);
  let view = new DataView(wasm.memory.buffer);
  const refreshMemoryViews = () => {
    heap = new Float32Array(wasm.memory.buffer);
    view = new DataView(wasm.memory.buffer);
  };
  const leftOffset = leftPtr >> 2;
  const rightOffset = rightPtr >> 2;
  const moduleInputOffset = moduleInputPtr >> 2;
  const moduleOutputOffset = moduleOutputPtr >> 2;
  const mixerInput0LOffset = mixerInput0LPtr >> 2;
  const mixerInput0ROffset = mixerInput0RPtr >> 2;
  const mixerInput1LOffset = mixerInput1LPtr >> 2;
  const mixerInput1ROffset = mixerInput1RPtr >> 2;
  const mixerOutput0LOffset = mixerOutput0LPtr >> 2;
  const mixerOutput0ROffset = mixerOutput0RPtr >> 2;
  const mixerOutput1LOffset = mixerOutput1LPtr >> 2;
  const mixerOutput1ROffset = mixerOutput1RPtr >> 2;
  const moduleTapMainLOffset = moduleTapMainLPtr >> 2;
  const moduleTapMainROffset = moduleTapMainRPtr >> 2;
  const moduleTapReverbLOffset = moduleTapReverbLPtr >> 2;
  const moduleTapReverbROffset = moduleTapReverbRPtr >> 2;
  assert(getAbiVersion() === coreAbiVersion, 'WASM ABI version mismatch');
  const writeParamEvent = (sampleOffset, paramId, value, rampFrames = 0) => {
    view.setUint32(paramEventPtr, sampleOffset, true);
    view.setUint32(paramEventPtr + 4, paramId, true);
    view.setFloat32(paramEventPtr + 8, value, true);
    view.setUint32(paramEventPtr + 12, rampFrames, true);
  };
  const writeMidiEvent = (sampleOffset) => {
    view.setUint32(midiEventPtr, sampleOffset, true);
    view.setUint32(midiEventPtr + 4, 7, true);
    view.setUint8(midiEventPtr + 8, 0x90);
    view.setUint8(midiEventPtr + 9, 1);
    view.setUint8(midiEventPtr + 10, 60);
    view.setUint8(midiEventPtr + 11, 100);
    view.setFloat32(midiEventPtr + 12, 100 / 127, true);
    view.setUint8(midiEventPtr + 16, 3);
    view.setUint8(midiEventPtr + 17, 0x90);
    view.setUint8(midiEventPtr + 18, 60);
    view.setUint8(midiEventPtr + 19, 100);
  };
  const writeTransportEvent = (sampleOffset, command) => {
    view.setUint32(transportEventPtr, sampleOffset, true);
    view.setUint32(transportEventPtr + 4, command, true);
  };
  const writeMixerRoute = (sourceBus, targetBus, gainL, gainR, enabled) => {
    view.setUint32(mixerRoutePtr, sourceBus, true);
    view.setUint32(mixerRoutePtr + 4, targetBus, true);
    view.setFloat32(mixerRoutePtr + 8, gainL, true);
    view.setFloat32(mixerRoutePtr + 12, gainR, true);
    view.setUint32(mixerRoutePtr + 16, enabled, true);
  };

  start(engine);
  render(engine, leftPtr, rightPtr, frames);
  assert(maxAbs(heap, leftOffset, frames) === 0, 'WASM default render should be silent');
  assert(Number(getSampleFrame(engine)) === frames, 'WASM running silence should advance transport');

  assert(setRenderMode(engine, 1) === 1, 'WASM failed to enable smoke render mode');
  setSmokeTone(engine, 440, 0.2);
  view.setUint32(snapshotPtr, 1, true);
  view.setUint32(snapshotPtr + 4, 0x4b435632, true);
  view.setFloat32(snapshotPtr + 8, 120, true);
  view.setFloat32(snapshotPtr + 12, 1, true);
  view.setInt32(snapshotPtr + 16, 1, true);
  view.setFloat32(snapshotPtr + 20, 440, true);
  view.setFloat32(snapshotPtr + 24, 0.2, true);
  view.setUint32(snapshotPtr + 28, 0, true);
  view.setUint32(snapshotPtr + 32, 4, true);
  view.setUint32(snapshotPtr + 36, 4, true);
  view.setUint32(snapshotPtr + 40, 42, true);
  view.setUint32(snapshotPtr + 44, 0, true);
  assert(applySnapshot(engine, snapshotPtr) === 1, 'WASM failed to apply valid snapshot');
  assert(getSeed(engine) === 42, 'WASM snapshot seed did not apply');
  view.setUint32(snapshotPtr, 999, true);
  assert(applySnapshot(engine, snapshotPtr) === 0, 'WASM accepted an invalid snapshot version');
  assert(setTransportSignature(engine, 3, 2) === 1, 'WASM failed to set transport signature');
  assert(getTransportInfo(engine, transportInfoPtr) === 1, 'WASM failed to read transport info');
  assert(view.getUint32(transportInfoPtr + 24, true) === 3, 'WASM transport beats-per-bar mismatch');
  assert(view.getUint32(transportInfoPtr + 28, true) === 2, 'WASM transport bars-per-phrase mismatch');
  setSeed(engine, 12345);
  const randomA = nextRandomFloat(engine);
  const randomB = nextRandomFloat(engine);
  setSeed(engine, 12345);
  assert(randomA >= 0 && randomA < 1 && randomB >= 0 && randomB < 1, 'WASM random values out of range');
  assert(nextRandomFloat(engine) === randomA, 'WASM seeded RNG first value did not repeat');
  assert(nextRandomFloat(engine) === randomB, 'WASM seeded RNG second value did not repeat');
  reset(engine);
  start(engine);
  render(engine, leftPtr, rightPtr, frames);
  const peak = maxAbs(heap, leftOffset, frames);
  assert(peak > 0.05 && peak <= 0.201, `WASM smoke render peak out of range: ${peak}`);
  assert(diffRms(heap, leftOffset, rightOffset, frames) < 1.0e-8, 'WASM smoke render should be stereo-identical');

  reset(engine);
  start(engine);
  writeParamEvent(frames / 2, 4, 0);
  assert(pushParamEvent(engine, paramEventPtr) === 1, 'WASM failed to push sample-offset param event');
  assert(getEventQueueDepth(engine) === 1, 'WASM param event queue depth mismatch');
  render(engine, leftPtr, rightPtr, frames);
  assert(getEventQueueDepth(engine) === 0, 'WASM param event should be consumed');
  assert(maxAbs(heap, leftOffset, frames / 2) > 0.05, 'WASM param event fired too early');
  assert(maxAbs(heap, leftOffset + frames / 2, frames / 2) === 0, 'WASM sample-offset mute did not apply');

  writeParamEvent(frames + 8, 4, 0.2);
  assert(pushParamEvent(engine, paramEventPtr) === 1, 'WASM failed to push future param event');
  render(engine, leftPtr, rightPtr, frames);
  assert(getEventQueueDepth(engine) === 1, 'WASM future param event should remain queued');
  render(engine, leftPtr, rightPtr, 9);
  assert(getEventQueueDepth(engine) === 0, 'WASM future param event should fire in the next block');
  assert(maxAbs(heap, leftOffset, 9) > 0, 'WASM future param event did not restore amplitude');

  writeMidiEvent(4);
  const midiBefore = getMidiEventsProcessed(engine);
  assert(pushMidiEvent(engine, midiEventPtr) === 1, 'WASM failed to push MIDI event');
  render(engine, leftPtr, rightPtr, frames);
  assert(getMidiEventsProcessed(engine) === midiBefore + 1, 'WASM MIDI event was not processed');

  writeTransportEvent(0, 0);
  assert(pushTransportEvent(engine, transportEventPtr) === 1, 'WASM failed to push transport stop event');
  render(engine, leftPtr, rightPtr, frames);
  assert(isRunning(engine) === 0, 'WASM transport stop event did not stop the engine');

  view.setUint32(mixerInputLPtrsPtr, mixerInput0LPtr, true);
  view.setUint32(mixerInputLPtrsPtr + 4, mixerInput1LPtr, true);
  view.setUint32(mixerInputRPtrsPtr, mixerInput0RPtr, true);
  view.setUint32(mixerInputRPtrsPtr + 4, mixerInput1RPtr, true);
  view.setUint32(mixerOutputLPtrsPtr, mixerOutput0LPtr, true);
  view.setUint32(mixerOutputLPtrsPtr + 4, mixerOutput1LPtr, true);
  view.setUint32(mixerOutputRPtrsPtr, mixerOutput0RPtr, true);
  view.setUint32(mixerOutputRPtrsPtr + 4, mixerOutput1RPtr, true);
  heap.set([1, 2, 3, 4], mixerInput0LOffset);
  heap.set([10, 20, 30, 40], mixerInput0ROffset);
  heap.set([0.5, -0.5, 1.5, -1.5], mixerInput1LOffset);
  heap.set([2, 4, 6, 8], mixerInput1ROffset);
  heap.fill(99, mixerOutput0LOffset, mixerOutput0LOffset + 4);
  heap.fill(99, mixerOutput0ROffset, mixerOutput0ROffset + 4);
  heap.fill(99, mixerOutput1LOffset, mixerOutput1LOffset + 4);
  heap.fill(99, mixerOutput1ROffset, mixerOutput1ROffset + 4);
  writeMixerRoute(0, 0, 0.5, 0.25, 1);
  assert(mixerSetRoute(mixer, 0, mixerRoutePtr) === 1, 'WASM mixer route 0 should be accepted');
  writeMixerRoute(1, 0, 2.0, -0.5, 1);
  assert(mixerSetRoute(mixer, 1, mixerRoutePtr) === 1, 'WASM mixer route 1 should be accepted');
  writeMixerRoute(0, 1, -0.25, 0.1, 1);
  assert(mixerSetRoute(mixer, 2, mixerRoutePtr) === 1, 'WASM mixer route 2 should be accepted');
  assert(mixerGetStats(mixer, mixerStatsPtr) === 1, 'WASM mixer stats call failed');
  assert(view.getUint32(mixerStatsPtr, true) === 3, 'WASM mixer route slots mismatch');
  assert(view.getUint32(mixerStatsPtr + 4, true) === 3, 'WASM mixer active route count mismatch');
  assert(
    mixerProcessPlanarStereo(
      mixer,
      mixerInputLPtrsPtr,
      mixerInputRPtrsPtr,
      2,
      mixerOutputLPtrsPtr,
      mixerOutputRPtrsPtr,
      2,
      4,
    ) === 1,
    'WASM mixer planar process failed',
  );
  for (let i = 0; i < 4; i += 1) {
    assert(
      Math.abs(heap[mixerOutput0LOffset + i] - (heap[mixerInput0LOffset + i] * 0.5 + heap[mixerInput1LOffset + i] * 2.0)) < 1.0e-6,
      'WASM mixer main left mix mismatch',
    );
    assert(
      Math.abs(heap[mixerOutput0ROffset + i] - (heap[mixerInput0ROffset + i] * 0.25 + heap[mixerInput1ROffset + i] * -0.5)) < 1.0e-6,
      'WASM mixer main right mix mismatch',
    );
    assert(Math.abs(heap[mixerOutput1LOffset + i] - heap[mixerInput0LOffset + i] * -0.25) < 1.0e-6, 'WASM mixer send left mismatch');
    assert(Math.abs(heap[mixerOutput1ROffset + i] - heap[mixerInput0ROffset + i] * 0.1) < 1.0e-6, 'WASM mixer send right mismatch');
  }
  view.setUint32(mixerOutputLPtrsPtr, mixerInput0LPtr, true);
  assert(
    mixerProcessPlanarStereo(
      mixer,
      mixerInputLPtrsPtr,
      mixerInputRPtrsPtr,
      2,
      mixerOutputLPtrsPtr,
      mixerOutputRPtrsPtr,
      1,
      4,
    ) === 0,
    'WASM mixer should reject input/output aliasing',
  );
  view.setUint32(mixerOutputLPtrsPtr, mixerOutput0LPtr, true);
  mixerClearRoutes(mixer);
  assert(mixerGetStats(mixer, mixerStatsPtr) === 1, 'WASM mixer stats after clear failed');
  assert(view.getUint32(mixerStatsPtr, true) === 0, 'WASM mixer route slots should clear');
  assert(view.getUint32(mixerStatsPtr + 4, true) === 0, 'WASM mixer active route count should clear');

  const dynamicsModule = moduleCreate(1, 48000, frames);
  const dynamicsModuleB = moduleCreate(1, 48000, frames);
  assert(dynamicsModule !== 0, 'WASM failed to create dynamics drift module');
  assert(dynamicsModuleB !== 0, 'WASM failed to create second dynamics drift module');
  assert(
    moduleGetParamCount(dynamicsModule) === dynamicsDriftParamCount,
    'WASM dynamics module param count mismatch',
  );
  assert(
    moduleGetParamCount(dynamicsModuleB) === dynamicsDriftParamCount,
    'WASM second dynamics module param count mismatch',
  );
  const dynamicsParamsPtr = moduleGetParamsPtr(dynamicsModule);
  const dynamicsParamsPtrB = moduleGetParamsPtr(dynamicsModuleB);
  assert(dynamicsParamsPtr !== 0, 'WASM dynamics module params pointer was null');
  assert(dynamicsParamsPtrB !== 0, 'WASM second dynamics module params pointer was null');
  assert(dynamicsParamsPtr !== dynamicsParamsPtrB, 'WASM dynamics module params should be instance-owned');
  heap[dynamicsParamsPtr >> 2] = 1;
  heap[(dynamicsParamsPtr >> 2) + 2] = 1;
  heap[(dynamicsParamsPtr >> 2) + 3] = 0;
  moduleCommitParams(dynamicsModule);
  heap[dynamicsParamsPtrB >> 2] = 1;
  heap[(dynamicsParamsPtrB >> 2) + 2] = 0;
  heap[(dynamicsParamsPtrB >> 2) + 3] = 0;
  moduleCommitParams(dynamicsModuleB);
  for (let i = 0; i < frames; i += 1) {
    const sample = Math.sin(i * 0.05) * 0.2;
    heap[moduleInputOffset + i * 2] = sample;
    heap[moduleInputOffset + i * 2 + 1] = sample * 0.5;
    heap[moduleOutputOffset + i * 2] = 0;
    heap[moduleOutputOffset + i * 2 + 1] = 0;
  }
  assert(
    moduleProcessInterleaved(dynamicsModule, moduleInputPtr, moduleOutputPtr, frames) === 1,
    'WASM dynamics module process failed',
  );
  assert(
    diffRms(heap, moduleInputOffset, moduleOutputOffset, frames * 2) < 1.0e-7,
    'WASM dynamics dry module path should pass input',
  );
  for (let i = 0; i < frames; i += 1) {
    heap[leftOffset + i] = Math.sin(i * 0.05) * 0.2;
    heap[rightOffset + i] = Math.cos(i * 0.04) * 0.1;
  }
  assert(
    moduleProcessPlanarStereo(dynamicsModule, leftPtr, rightPtr, leftPtr, rightPtr, frames) === 1,
    'WASM dynamics planar module process failed',
  );
  for (let i = 0; i < frames; i += 1) {
    assert(Math.abs(heap[leftOffset + i] - Math.sin(i * 0.05) * 0.2) < 1.0e-7, 'WASM planar dry left drifted');
    assert(Math.abs(heap[rightOffset + i] - Math.cos(i * 0.04) * 0.1) < 1.0e-7, 'WASM planar dry right drifted');
  }
  heap.fill(1, moduleOutputOffset, moduleOutputOffset + frames * 2);
  assert(
    moduleProcessInterleaved(dynamicsModuleB, moduleInputPtr, moduleOutputPtr, frames) === 1,
    'WASM second dynamics module process failed',
  );
  assert(
    maxAbs(heap, moduleOutputOffset, frames * 2) === 0,
    'WASM second dynamics module params should not affect first module state',
  );
  heap.fill(1, leftOffset, leftOffset + frames);
  heap.fill(1, rightOffset, rightOffset + frames);
  assert(
    moduleProcessPlanarStereo(dynamicsModuleB, leftPtr, rightPtr, leftPtr, rightPtr, frames) === 1,
    'WASM second dynamics planar module process failed',
  );
  assert(maxAbs(heap, leftOffset, frames) === 0, 'WASM second planar module left should be silent');
  assert(maxAbs(heap, rightOffset, frames) === 0, 'WASM second planar module right should be silent');
  moduleDestroy(dynamicsModuleB);
  moduleDestroy(dynamicsModule);

  const degradeModule = moduleCreate(2, 48000, frames);
  const degradeModuleB = moduleCreate(2, 48000, frames);
  assert(degradeModule !== 0, 'WASM failed to create dynamics degrade module');
  assert(degradeModuleB !== 0, 'WASM failed to create second dynamics degrade module');
  assert(moduleGetParamCount(degradeModule) === 6, 'WASM dynamics degrade module param count mismatch');
  assert(moduleGetParamCount(degradeModuleB) === 6, 'WASM second dynamics degrade module param count mismatch');
  const degradeParamsPtr = moduleGetParamsPtr(degradeModule);
  const degradeParamsPtrB = moduleGetParamsPtr(degradeModuleB);
  assert(degradeParamsPtr !== 0, 'WASM dynamics degrade params pointer was null');
  assert(degradeParamsPtrB !== 0, 'WASM second dynamics degrade params pointer was null');
  assert(degradeParamsPtr !== degradeParamsPtrB, 'WASM dynamics degrade params should be instance-owned');
  heap[degradeParamsPtr >> 2] = 1;
  heap[(degradeParamsPtr >> 2) + 1] = 0;
  moduleCommitParams(degradeModule);
  heap[degradeParamsPtrB >> 2] = 1;
  heap[(degradeParamsPtrB >> 2) + 1] = 0.8;
  heap[(degradeParamsPtrB >> 2) + 2] = 0.58;
  heap[(degradeParamsPtrB >> 2) + 3] = 0.34;
  heap[(degradeParamsPtrB >> 2) + 4] = 0.3;
  heap[(degradeParamsPtrB >> 2) + 5] = 0.25;
  moduleCommitParams(degradeModuleB);
  for (let i = 0; i < frames; i += 1) {
    const sample = Math.sin(i * 0.05) * 0.2;
    heap[moduleInputOffset + i * 2] = sample;
    heap[moduleInputOffset + i * 2 + 1] = sample * 0.5;
    heap[moduleOutputOffset + i * 2] = 0;
    heap[moduleOutputOffset + i * 2 + 1] = 0;
  }
  assert(
    moduleProcessInterleaved(degradeModule, moduleInputPtr, moduleOutputPtr, frames) === 1,
    'WASM dynamics degrade dry module process failed',
  );
  assert(
    diffRms(heap, moduleInputOffset, moduleOutputOffset, frames * 2) < 1.0e-7,
    'WASM dynamics degrade dry module path should pass input',
  );
  heap.fill(0, moduleOutputOffset, moduleOutputOffset + frames * 2);
  assert(
    moduleProcessInterleaved(degradeModuleB, moduleInputPtr, moduleOutputPtr, frames) === 1,
    'WASM dynamics degrade colored module process failed',
  );
  assert(
    diffRms(heap, moduleInputOffset, moduleOutputOffset, frames * 2) > 1.0e-5,
    'WASM dynamics degrade colored module path should alter input',
  );
  for (let i = 0; i < frames; i += 1) {
    heap[leftOffset + i] = Math.sin(i * 0.05) * 0.2;
    heap[rightOffset + i] = Math.cos(i * 0.04) * 0.1;
  }
  assert(
    moduleProcessPlanarStereo(degradeModule, leftPtr, rightPtr, leftPtr, rightPtr, frames) === 1,
    'WASM dynamics degrade planar dry module process failed',
  );
  for (let i = 0; i < frames; i += 1) {
    assert(Math.abs(heap[leftOffset + i] - Math.sin(i * 0.05) * 0.2) < 1.0e-7, 'WASM degrade planar dry left drifted');
    assert(Math.abs(heap[rightOffset + i] - Math.cos(i * 0.04) * 0.1) < 1.0e-7, 'WASM degrade planar dry right drifted');
  }
  moduleDestroy(degradeModuleB);
  moduleDestroy(degradeModule);

  const reverbModule = moduleCreate(3, 48000, frames);
  const reverbModuleB = moduleCreate(3, 48000, frames);
  refreshMemoryViews();
  assert(reverbModule !== 0, 'WASM failed to create reverb module');
  assert(reverbModuleB !== 0, 'WASM failed to create second reverb module');
  assert(moduleGetParamCount(reverbModule) === 31, 'WASM reverb module param count mismatch');
  assert(moduleGetParamCount(reverbModuleB) === 31, 'WASM second reverb module param count mismatch');
  const reverbParamsPtr = moduleGetParamsPtr(reverbModule);
  const reverbParamsPtrB = moduleGetParamsPtr(reverbModuleB);
  assert(reverbParamsPtr !== 0, 'WASM reverb module params pointer was null');
  assert(reverbParamsPtrB !== 0, 'WASM second reverb module params pointer was null');
  assert(reverbParamsPtr !== reverbParamsPtrB, 'WASM reverb module params should be instance-owned');
  const reverbParamsOffset = reverbParamsPtr >> 2;
  heap[reverbParamsOffset] = 1; // hall
  heap[reverbParamsOffset + 1] = 2; // lite
  heap[reverbParamsOffset + 2] = 0.45; // decay
  heap[reverbParamsOffset + 3] = 0.85; // size
  heap[reverbParamsOffset + 5] = 0.62; // diffusion
  heap[reverbParamsOffset + 6] = 0.12; // modulation
  heap[reverbParamsOffset + 7] = 0; // predelay
  heap[reverbParamsOffset + 8] = 0.7; // width
  heap[reverbParamsOffset + 15] = 0.24; // chorus rate
  heap[reverbParamsOffset + 16] = 4; // chorus depth
  heap[reverbParamsOffset + 18] = 0.08; // low damping
  heap[reverbParamsOffset + 19] = 0.34; // high damping
  heap[reverbParamsOffset + 20] = 900; // crossover
  heap[reverbParamsOffset + 25] = 0.45; // early reflections
  moduleCommitParams(reverbModule);
  moduleDestroy(reverbModuleB);

  let reverbPeak = 0;
  for (let block = 0; block < 64; block += 1) {
    heap.fill(0, moduleInputOffset, moduleInputOffset + frames * 2);
    heap.fill(0, moduleOutputOffset, moduleOutputOffset + frames * 2);
    if (block === 0) {
      heap[moduleInputOffset] = 0.8;
      heap[moduleInputOffset + 1] = 0.45;
    }
    assert(
      moduleProcessInterleaved(reverbModule, moduleInputPtr, moduleOutputPtr, frames) === 1,
      'WASM reverb interleaved module process failed',
    );
    reverbPeak = Math.max(reverbPeak, maxAbs(heap, moduleOutputOffset, frames * 2));
  }
  assert(reverbPeak > 1.0e-5, 'WASM reverb interleaved module should produce a non-zero tail');

  const moduleReset = resolveWasmExport(wasm, 'kessho_module_reset');
  moduleReset(reverbModule);
  let reverbPlanarPeak = 0;
  for (let block = 0; block < 64; block += 1) {
    heap.fill(0, leftOffset, leftOffset + frames);
    heap.fill(0, rightOffset, rightOffset + frames);
    if (block === 0) {
      heap[leftOffset] = 0.7;
      heap[rightOffset] = 0.35;
    }
    assert(
      moduleProcessPlanarStereo(reverbModule, leftPtr, rightPtr, leftPtr, rightPtr, frames) === 1,
      'WASM reverb planar module process failed',
    );
    reverbPlanarPeak = Math.max(reverbPlanarPeak, maxAbs(heap, leftOffset, frames));
    reverbPlanarPeak = Math.max(reverbPlanarPeak, maxAbs(heap, rightOffset, frames));
  }
  assert(reverbPlanarPeak > 1.0e-5, 'WASM reverb planar module should produce a non-zero tail');
  moduleDestroy(reverbModule);

  const granularModule = moduleCreate(4, 48000, frames);
  const granularModuleB = moduleCreate(4, 48000, frames);
  refreshMemoryViews();
  assert(granularModule !== 0, 'WASM failed to create granular module');
  assert(granularModuleB !== 0, 'WASM failed to create second granular module');
  assert(moduleGetParamCount(granularModule) === granularParamCount, 'WASM granular module param count mismatch');
  assert(
    moduleGetParamCount(granularModuleB) === granularParamCount,
    'WASM second granular module param count mismatch',
  );
  const granularParamsPtr = moduleGetParamsPtr(granularModule);
  const granularParamsPtrB = moduleGetParamsPtr(granularModuleB);
  assert(granularParamsPtr !== 0, 'WASM granular module params pointer was null');
  assert(granularParamsPtrB !== 0, 'WASM second granular module params pointer was null');
  assert(granularParamsPtr !== granularParamsPtrB, 'WASM granular module params should be instance-owned');
  heap[granularParamsPtr >> 2] = 0;
  moduleCommitParams(granularModule);
  const granularParamsOffsetB = granularParamsPtrB >> 2;
  heap[granularParamsOffsetB] = 1;
  heap[granularParamsOffsetB + 3] = 1;
  heap[granularParamsOffsetB + 11] = 0;
  heap[granularParamsOffsetB + 24] = 1;
  moduleCommitParams(granularModuleB);
  for (let i = 0; i < frames; i += 1) {
    const sample = Math.sin(i * 0.05) * 0.2;
    heap[moduleInputOffset + i * 2] = sample;
    heap[moduleInputOffset + i * 2 + 1] = sample * 0.5;
    heap[moduleOutputOffset + i * 2] = 0;
    heap[moduleOutputOffset + i * 2 + 1] = 0;
  }
  assert(
    moduleProcessInterleaved(granularModule, moduleInputPtr, moduleOutputPtr, frames) === 1,
    'WASM granular disabled module process failed',
  );
  assert(
    diffRms(heap, moduleInputOffset, moduleOutputOffset, frames * 2) < 1.0e-7,
    'WASM granular disabled module should pass input',
  );
  for (let i = 0; i < frames; i += 1) {
    heap[leftOffset + i] = Math.sin(i * 0.05) * 0.2;
    heap[rightOffset + i] = Math.cos(i * 0.04) * 0.1;
  }
  assert(
    moduleProcessPlanarStereo(granularModule, leftPtr, rightPtr, leftPtr, rightPtr, frames) === 1,
    'WASM granular disabled planar module process failed',
  );
  for (let i = 0; i < frames; i += 1) {
    assert(Math.abs(heap[leftOffset + i] - Math.sin(i * 0.05) * 0.2) < 1.0e-7, 'WASM granular planar dry left drifted');
    assert(Math.abs(heap[rightOffset + i] - Math.cos(i * 0.04) * 0.1) < 1.0e-7, 'WASM granular planar dry right drifted');
  }
  let granularPeak = 0;
  for (let block = 0; block < 8; block += 1) {
    for (let i = 0; i < frames; i += 1) {
      const t = (block * frames + i) / 48000;
      heap[moduleInputOffset + i * 2] = Math.sin(2 * Math.PI * 220 * t) * 0.35;
      heap[moduleInputOffset + i * 2 + 1] = Math.sin(2 * Math.PI * 330 * t) * 0.22;
      heap[moduleOutputOffset + i * 2] = 0;
      heap[moduleOutputOffset + i * 2 + 1] = 0;
    }
    assert(
      moduleProcessInterleaved(granularModuleB, moduleInputPtr, moduleOutputPtr, frames) === 1,
      'WASM granular active module process failed',
    );
    granularPeak = Math.max(granularPeak, maxAbs(heap, moduleOutputOffset, frames * 2));
  }
  assert(granularPeak > 1.0e-5, 'WASM granular active module should produce non-zero output');
  moduleDestroy(granularModuleB);
  moduleDestroy(granularModule);

  const spectralModule = moduleCreate(5, 48000, frames);
  const spectralModuleB = moduleCreate(5, 48000, frames);
  refreshMemoryViews();
  assert(spectralModule !== 0, 'WASM failed to create spectral freeze module');
  assert(spectralModuleB !== 0, 'WASM failed to create second spectral freeze module');
  assert(moduleGetParamCount(spectralModule) === 14, 'WASM spectral freeze module param count mismatch');
  assert(moduleGetParamCount(spectralModuleB) === 14, 'WASM second spectral freeze module param count mismatch');
  const spectralParamsPtr = moduleGetParamsPtr(spectralModule);
  const spectralParamsPtrB = moduleGetParamsPtr(spectralModuleB);
  assert(spectralParamsPtr !== 0, 'WASM spectral freeze params pointer was null');
  assert(spectralParamsPtrB !== 0, 'WASM second spectral freeze params pointer was null');
  assert(spectralParamsPtr !== spectralParamsPtrB, 'WASM spectral freeze params should be instance-owned');
  heap[(spectralParamsPtr >> 2) + 12] = 0;
  moduleCommitParams(spectralModule);
  const spectralParamsOffsetB = spectralParamsPtrB >> 2;
  heap[spectralParamsOffsetB] = 1;
  heap[spectralParamsOffsetB + 1] = 2;
  heap[spectralParamsOffsetB + 2] = 1;
  heap[spectralParamsOffsetB + 3] = 0.35;
  heap[spectralParamsOffsetB + 4] = 2;
  heap[spectralParamsOffsetB + 5] = 0.1;
  heap[spectralParamsOffsetB + 6] = 0.15;
  heap[spectralParamsOffsetB + 7] = 0.5;
  heap[spectralParamsOffsetB + 8] = 0.55;
  heap[spectralParamsOffsetB + 9] = -0.15;
  heap[spectralParamsOffsetB + 10] = 0.85;
  heap[spectralParamsOffsetB + 11] = 1;
  heap[spectralParamsOffsetB + 12] = 1;
  heap[spectralParamsOffsetB + 13] = 0.1;
  moduleCommitParams(spectralModuleB);
  for (let i = 0; i < frames; i += 1) {
    const sample = Math.sin(i * 0.05) * 0.2;
    heap[moduleInputOffset + i * 2] = sample;
    heap[moduleInputOffset + i * 2 + 1] = sample * 0.5;
    heap[moduleOutputOffset + i * 2] = 0;
    heap[moduleOutputOffset + i * 2 + 1] = 0;
  }
  assert(
    moduleProcessInterleaved(spectralModule, moduleInputPtr, moduleOutputPtr, frames) === 1,
    'WASM spectral freeze dry module process failed',
  );
  assert(maxAbs(heap, moduleOutputOffset, frames * 2) < 1.0e-7, 'WASM inactive spectral return should be silent');
  for (let i = 0; i < frames; i += 1) {
    heap[leftOffset + i] = Math.sin(i * 0.05) * 0.2;
    heap[rightOffset + i] = Math.cos(i * 0.04) * 0.1;
  }
  assert(
    moduleProcessPlanarStereo(spectralModule, leftPtr, rightPtr, leftPtr, rightPtr, frames) === 1,
    'WASM spectral freeze dry planar module process failed',
  );
  assert(maxAbs(heap, leftOffset, frames) < 1.0e-7, 'WASM inactive spectral planar left return should be silent');
  assert(maxAbs(heap, rightOffset, frames) < 1.0e-7, 'WASM inactive spectral planar right return should be silent');
  let spectralPeak = 0;
  for (let block = 0; block < 400; block += 1) {
    for (let i = 0; i < frames; i += 1) {
      const t = (block * frames + i) / 48000;
      heap[moduleInputOffset + i * 2] = Math.sin(2 * Math.PI * 196 * t) * 0.28;
      heap[moduleInputOffset + i * 2 + 1] = Math.sin(2 * Math.PI * 247 * t) * 0.22;
      heap[moduleOutputOffset + i * 2] = 0;
      heap[moduleOutputOffset + i * 2 + 1] = 0;
    }
    assert(
      moduleProcessInterleaved(spectralModuleB, moduleInputPtr, moduleOutputPtr, frames) === 1,
      'WASM spectral freeze active module process failed',
    );
    spectralPeak = Math.max(spectralPeak, maxAbs(heap, moduleOutputOffset, frames * 2));
  }
  assert(spectralPeak > 1.0e-5, 'WASM spectral freeze active module should produce non-zero output');
  moduleDestroy(spectralModuleB);
  moduleDestroy(spectralModule);

  const leadFmModule = moduleCreate(6, 48000, frames);
  const leadFmModuleB = moduleCreate(6, 48000, frames);
  refreshMemoryViews();
  assert(leadFmModule !== 0, 'WASM failed to create lead-fm module');
  assert(leadFmModuleB !== 0, 'WASM failed to create second lead-fm module');
  assert(moduleGetParamCount(leadFmModule) === leadFmParamCount, 'WASM lead-fm module param count mismatch');
  assert(moduleGetParamCount(leadFmModuleB) === leadFmParamCount, 'WASM second lead-fm module param count mismatch');
  const leadFmParamsPtr = moduleGetParamsPtr(leadFmModule);
  const leadFmParamsPtrB = moduleGetParamsPtr(leadFmModuleB);
  assert(leadFmParamsPtr !== 0, 'WASM lead-fm params pointer was null');
  assert(leadFmParamsPtrB !== 0, 'WASM second lead-fm params pointer was null');
  assert(leadFmParamsPtr !== leadFmParamsPtrB, 'WASM lead-fm params should be instance-owned');
  const leadFmParamsOffset = leadFmParamsPtr >> 2;
  const leadFmParamsOffsetB = leadFmParamsPtrB >> 2;
  heap[leadFmParamsOffset + leadFmParamRelease] = 0.01;
  heap[leadFmParamsOffset + leadFmParamOutputSelect] = 0;
  moduleCommitParams(leadFmModule);
  heap[leadFmParamsOffsetB + leadFmParamRelease] = 0.01;
  heap[leadFmParamsOffsetB + leadFmParamOutputSelect] = 1;
  moduleCommitParams(leadFmModuleB);
  assert(moduleNoteOn(leadFmModule, 440, 0.8, 0.02, 0) === 1, 'WASM lead-fm module note-on failed');
  assert(moduleGetActiveVoiceCount(leadFmModule) === 1, 'WASM lead-fm active voice count mismatch');
  heap.fill(0, moduleInputOffset, moduleInputOffset + frames * 2);
  let leadFmPeak = 0;
  for (let block = 0; block < 48; block += 1) {
    heap.fill(0, moduleOutputOffset, moduleOutputOffset + frames * 2);
    assert(
      moduleProcessInterleaved(leadFmModule, moduleInputPtr, moduleOutputPtr, frames) === 1,
      'WASM lead-fm module process failed',
    );
    leadFmPeak = Math.max(leadFmPeak, maxAbs(heap, moduleOutputOffset, frames * 2));
  }
  assert(leadFmPeak > 1.0e-5, 'WASM lead-fm module should produce non-zero output after note-on');
  assert(moduleGetActiveVoiceCount(leadFmModule) === 0, 'WASM lead-fm hold/release should expire');
  assert(moduleNoteOn(leadFmModuleB, 330, 0.75, 0.05, 1) === 1, 'WASM second lead-fm module note-on failed');
  heap.fill(0, moduleOutputOffset, moduleOutputOffset + frames * 2);
  assert(
    moduleProcessInterleaved(leadFmModuleB, moduleInputPtr, moduleOutputPtr, frames) === 1,
    'WASM lead-fm lead2 module process failed',
  );
  assert(maxAbs(heap, moduleOutputOffset, frames * 2) > 1.0e-5, 'WASM lead-fm lead2 output should produce signal');
  moduleAllNotesOff(leadFmModuleB);
  moduleDestroy(leadFmModuleB);
  moduleDestroy(leadFmModule);

  const padModule = moduleCreate(7, 48000, frames);
  refreshMemoryViews();
  assert(padModule !== 0, 'WASM failed to create pad module');
  assert(moduleGetParamCount(padModule) === padParamCount, 'WASM pad module param count mismatch');
  assert(moduleGetOutputTapCount(0) === 0, 'WASM null module tap count should be zero');
  const padTapCount = moduleGetOutputTapCount(padModule);
  assert(padTapCount === padOutputTapCount, `WASM pad module tap count mismatch: ${padTapCount}`);

  const padParamsPtr = moduleGetParamsPtr(padModule);
  assert(padParamsPtr !== 0, 'WASM pad params pointer was null');
  const padParamsOffset = padParamsPtr >> 2;
  heap[padParamsOffset + padParamRelease] = 0.01;
  heap[padParamsOffset + padParamLevel] = 0.65;
  heap[padParamsOffset + padParamReverbSend] = 0.45;
  heap[padParamsOffset + padParamOutputSelect] = 0;
  moduleCommitParams(padModule);

  view.setUint32(moduleTapOutputLPtrsPtr, moduleTapMainLPtr, true);
  view.setUint32(moduleTapOutputLPtrsPtr + 4, moduleTapReverbLPtr, true);
  view.setUint32(moduleTapOutputRPtrsPtr, moduleTapMainRPtr, true);
  view.setUint32(moduleTapOutputRPtrsPtr + 4, moduleTapReverbRPtr, true);
  assert(
    moduleProcessPlanarStereoTaps(padModule, leftPtr, rightPtr, 0, moduleTapOutputRPtrsPtr, 2, frames) === 0,
    'WASM pad tap process should reject null output-left pointer array',
  );
  assert(
    moduleProcessPlanarStereoTaps(padModule, leftPtr, rightPtr, moduleTapOutputLPtrsPtr, moduleTapOutputRPtrsPtr, 0, frames) === 0,
    'WASM pad tap process should reject zero output bus count',
  );
  view.setUint32(moduleTapOutputRPtrsPtr + 4, 0, true);
  assert(
    moduleProcessPlanarStereoTaps(padModule, leftPtr, rightPtr, moduleTapOutputLPtrsPtr, moduleTapOutputRPtrsPtr, 2, frames) === 0,
    'WASM pad tap process should reject null output channel pointer',
  );
  view.setUint32(moduleTapOutputRPtrsPtr + 4, moduleTapReverbRPtr, true);
  assert(
    moduleProcessPlanarStereoTaps(
      padModule,
      leftPtr,
      rightPtr,
      moduleTapOutputLPtrsPtr,
      moduleTapOutputRPtrsPtr,
      padTapCount + 1,
      frames,
    ) === 0,
    'WASM pad tap process should reject output bus counts above the module tap count',
  );

  assert(moduleNoteOn(padModule, 220, 0.85, 0, 0) === 1, 'WASM pad module note-on failed');
  assert(moduleGetActiveVoiceCount(padModule) === 1, 'WASM pad active voice count mismatch');
  heap.fill(0, leftOffset, leftOffset + frames);
  heap.fill(0, rightOffset, rightOffset + frames);
  let padMainPeak = 0;
  let padReverbPeak = 0;
  for (let block = 0; block < 8; block += 1) {
    heap.fill(0, moduleTapMainLOffset, moduleTapMainLOffset + frames);
    heap.fill(0, moduleTapMainROffset, moduleTapMainROffset + frames);
    heap.fill(0, moduleTapReverbLOffset, moduleTapReverbLOffset + frames);
    heap.fill(0, moduleTapReverbROffset, moduleTapReverbROffset + frames);
    assert(
      moduleProcessPlanarStereoTaps(
        padModule,
        leftPtr,
        rightPtr,
        moduleTapOutputLPtrsPtr,
        moduleTapOutputRPtrsPtr,
        2,
        frames,
      ) === 1,
      'WASM pad tap process failed',
    );
    padMainPeak = Math.max(
      padMainPeak,
      maxAbs(heap, moduleTapMainLOffset, frames),
      maxAbs(heap, moduleTapMainROffset, frames),
    );
    padReverbPeak = Math.max(
      padReverbPeak,
      maxAbs(heap, moduleTapReverbLOffset, frames),
      maxAbs(heap, moduleTapReverbROffset, frames),
    );
  }
  assert(padMainPeak > 1.0e-5, 'WASM pad main tap should produce non-zero output after note-on');
  assert(padReverbPeak > 1.0e-5, 'WASM pad reverb-send tap should produce non-zero output after note-on');
  moduleAllNotesOff(padModule);
  moduleDestroy(padModule);

  mixerDestroy(mixer);
  destroy(engine);
  free(leftPtr);
  free(rightPtr);
  free(moduleInputPtr);
  free(moduleOutputPtr);
  free(mixerInput0LPtr);
  free(mixerInput0RPtr);
  free(mixerInput1LPtr);
  free(mixerInput1RPtr);
  free(mixerOutput0LPtr);
  free(mixerOutput0RPtr);
  free(mixerOutput1LPtr);
  free(mixerOutput1RPtr);
  free(moduleTapMainLPtr);
  free(moduleTapMainRPtr);
  free(moduleTapReverbLPtr);
  free(moduleTapReverbRPtr);
  free(mixerInputLPtrsPtr);
  free(mixerInputRPtrsPtr);
  free(mixerOutputLPtrsPtr);
  free(mixerOutputRPtrsPtr);
  free(moduleTapOutputLPtrsPtr);
  free(moduleTapOutputRPtrsPtr);
  free(mixerRoutePtr);
  free(mixerStatsPtr);
  free(snapshotPtr);
  free(paramEventPtr);
  free(midiEventPtr);
  free(transportEventPtr);
  free(transportInfoPtr);
  console.log('KesshoCore WASM render smoke check passed');
}

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

run('/usr/bin/clang++', [
  '-std=c++17',
  '-O2',
  '-Wall',
  '-Wextra',
  '-Werror',
  ...kesshoCoreIncludeArgs(root),
  ...sources,
  testSource,
  '-o',
  testBinary,
]);
run(testBinary, []);
await checkWasmExports();
