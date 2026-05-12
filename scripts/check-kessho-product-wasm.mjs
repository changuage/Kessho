import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { kesshoCoreWasmExportedFunctions } from './kessho-core-build-manifest.mjs';

const root = process.cwd();
const wasmPath = resolve(root, 'public/worklets/kessho_core.wasm');

if (!existsSync(wasmPath)) {
  throw new Error('Missing public/worklets/kessho_core.wasm; run npm run core:build:wasm first.');
}

function resolveExport(exports, name) {
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

const wasm = instance.exports;
for (const exportedFunction of kesshoCoreWasmExportedFunctions) {
  if (!exportedFunction.startsWith('kessho_product_')) {
    continue;
  }
  resolveExport(wasm, exportedFunction);
}
const malloc = resolveExport(wasm, 'malloc');
const free = resolveExport(wasm, 'free');
const create = resolveExport(wasm, 'kessho_product_create');
const destroy = resolveExport(wasm, 'kessho_product_destroy');
const enqueueEvent = resolveExport(wasm, 'kessho_product_enqueue_event');
const render = resolveExport(wasm, 'kessho_product_render');
const copyTelemetry = resolveExport(wasm, 'kessho_product_copy_telemetry');
const copySequencerUiState = resolveExport(wasm, 'kessho_product_copy_sequencer_ui_state');

const frames = 128;
const leftPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
const rightPtr = malloc(frames * Float32Array.BYTES_PER_ELEMENT);
const eventPtr = malloc(40);
const telemetryPtr = malloc(368);
const sequencerUiStatePtr = malloc(70948);
const engine = create(48000, frames, 0);
assert(leftPtr && rightPtr && eventPtr && telemetryPtr && sequencerUiStatePtr && engine, 'WASM product smoke allocation failed');

const view = new DataView(wasm.memory.buffer);
view.setUint32(eventPtr + 4, 17, true);
view.setFloat32(eventPtr + 20, 0.9, true);
assert(enqueueEvent(engine, eventPtr) === 1, 'WASM product drum trigger enqueue failed');
render(engine, leftPtr, rightPtr, frames);

const heap = new Float32Array(wasm.memory.buffer);
let peak = 0;
for (let i = 0; i < frames; i += 1) {
  const sample = heap[(leftPtr >> 2) + i];
  assert(Number.isFinite(sample), 'WASM product render produced non-finite output');
  peak = Math.max(peak, Math.abs(sample));
}
assert(peak > 0.001, 'WASM product render stayed silent after drum trigger');
assert(copyTelemetry(engine, telemetryPtr) === 1, 'WASM product telemetry copy failed');
assert(view.getUint32(telemetryPtr + 60, true) > 0, 'WASM product telemetry did not report active voices');
assert(view.getUint32(telemetryPtr + 288, true) > 0, 'WASM product telemetry did not expose RNG seed');
assert(view.getUint32(telemetryPtr + 292, true) > 0, 'WASM product telemetry did not expose RNG state');
assert(view.getUint32(telemetryPtr + 296 + 4 * 4, true) > 0, 'WASM product telemetry did not expose source preset IDs');
assert(view.getFloat32(telemetryPtr + 328, true) > 0, 'WASM product telemetry did not expose master output peak');
assert(view.getFloat32(telemetryPtr + 332, true) > 0, 'WASM product telemetry did not expose master output RMS');
assert(view.getFloat32(telemetryPtr + 352, true) >= view.getFloat32(telemetryPtr + 328, true), 'WASM product telemetry did not expose master true peak');
assert(Number.isFinite(view.getFloat32(telemetryPtr + 356, true)), 'WASM product telemetry did not expose master true peak dBTP');
assert(view.getFloat32(telemetryPtr + 360, true) > -100, 'WASM product telemetry did not expose integrated LUFS');
view.setUint32(eventPtr, 0, true);
view.setUint32(eventPtr + 4, 29, true);
view.setUint32(eventPtr + 8, 1, true);
view.setUint32(eventPtr + 12, 0, true);
view.setUint32(eventPtr + 16, 0, true);
view.setFloat32(eventPtr + 20, 1, true);
view.setFloat32(eventPtr + 24, 4242, true);
view.setFloat32(eventPtr + 28, 0, true);
view.setFloat32(eventPtr + 32, 0, true);
view.setUint32(eventPtr + 36, 0, true);
assert(enqueueEvent(engine, eventPtr) === 1, 'WASM product sequencer dice enqueue failed');
render(engine, leftPtr, rightPtr, frames);
assert(copyTelemetry(engine, telemetryPtr) === 1, 'WASM product post-dice telemetry copy failed');
assert(view.getUint32(telemetryPtr + 348, true) > 0, 'WASM product telemetry did not expose sequencer UI revision');
assert(copySequencerUiState(engine, sequencerUiStatePtr) === 1, 'WASM product sequencer UI state copy failed');
assert(view.getUint32(sequencerUiStatePtr + 4, true) === view.getUint32(telemetryPtr + 348, true), 'WASM product sequencer UI revision mismatch');
assert(view.getUint32(sequencerUiStatePtr + 24, true) === 1, 'WASM product sequencer UI state did not report latest synth target');
assert(view.getUint32(sequencerUiStatePtr + 32, true) === 3, 'WASM product sequencer UI state did not classify dice');
assert((view.getUint32(sequencerUiStatePtr + 36 + 24, true) & 1) !== 0, 'WASM product sequencer UI lane did not expose diced override state');

destroy(engine);
free(leftPtr);
free(rightPtr);
free(eventPtr);
free(telemetryPtr);
free(sequencerUiStatePtr);
console.log('Kessho Product WASM smoke passed');
