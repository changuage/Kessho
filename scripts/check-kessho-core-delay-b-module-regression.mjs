import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const coreWasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const sampleRate = 48000;
const blockSize = 128;
const moduleTypeDelayB = 11;
const paramCount = 16;
const outputTapCount = 4;

const params = {
  enabled: 0,
  activity: 1,
  repeats: 2,
  baseTimeMs: 3,
  tone: 4,
  vibrato: 5,
  mix: 6,
  reverbSend: 7,
  granularSend: 8,
  toDelayA: 9,
  spaceMode: 10,
  pattern: 11,
  warp: 12,
  warpIntensity: 13,
  spread: 14,
  reserved: 15,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

async function instantiateWasm(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}; run npm run core:build:wasm first.`);
  }
  const module = await WebAssembly.compile(readFileSync(path));
  const result = await WebAssembly.instantiate(module, wasmImports());
  return result.instance ?? result;
}

function requireExport(exports, name) {
  const fn = exports[name] || exports[`_${name}`];
  if (typeof fn !== 'function') throw new Error(`Missing WASM export: ${name}`);
  return fn;
}

function peak(values) {
  let max = 0;
  for (const value of values) max = Math.max(max, Math.abs(value));
  return max;
}

function stereoPeak(left, right) {
  return Math.max(peak(left), peak(right));
}

function writeParams(paramsPtr, overrides = {}) {
  const offset = paramsPtr >> 2;
  const values = new Float32Array(paramCount);
  values[params.enabled] = 1;
  values[params.activity] = 0.8;
  values[params.repeats] = 0.32;
  values[params.baseTimeMs] = 24;
  values[params.tone] = 0.55;
  values[params.vibrato] = 0.12;
  values[params.mix] = 0.7;
  values[params.reverbSend] = 0.25;
  values[params.granularSend] = 0.2;
  values[params.toDelayA] = 0.15;
  values[params.spaceMode] = 0;
  values[params.pattern] = 1;
  values[params.warp] = 2;
  values[params.warpIntensity] = 0.5;
  values[params.spread] = 0.8;
  values[params.reserved] = 0;
  for (const [key, value] of Object.entries(overrides)) {
    values[params[key]] = value;
  }
  heapView().set(values, offset);
}

function outputArray(ptr, frames) {
  return heapView().slice(ptr >> 2, (ptr >> 2) + frames);
}

const instance = await instantiateWasm(coreWasmPath);
const exports = instance.exports;
const memory = exports.memory;
const heapView = () => new Float32Array(memory.buffer);
const dataView = () => new DataView(memory.buffer);
const malloc = requireExport(exports, 'malloc');
const moduleCreate = requireExport(exports, 'kessho_module_create');
const moduleDestroy = requireExport(exports, 'kessho_module_destroy');
const moduleReset = requireExport(exports, 'kessho_module_reset');
const moduleSelfCheck = requireExport(exports, 'kessho_module_self_check');
const moduleGetParamCount = requireExport(exports, 'kessho_module_get_param_count');
const moduleGetOutputTapCount = requireExport(exports, 'kessho_module_get_output_tap_count');
const moduleGetParamsPtr = requireExport(exports, 'kessho_module_get_params_ptr');
const moduleCommitParams = requireExport(exports, 'kessho_module_commit_params');
const processTaps = requireExport(exports, 'kessho_module_process_planar_stereo_taps');

assert(moduleSelfCheck(moduleTypeDelayB, sampleRate, blockSize) === 1, 'Delay B module self-check failed');

const module = moduleCreate(moduleTypeDelayB, sampleRate, blockSize);
const moduleB = moduleCreate(moduleTypeDelayB, sampleRate, blockSize);
assert(module, 'Delay B module create failed');
assert(moduleB, 'Second Delay B module create failed');
assert(moduleGetParamCount(module) === paramCount, 'Delay B param count mismatch');
assert(moduleGetOutputTapCount(module) === outputTapCount, 'Delay B output tap count mismatch');
assert(moduleGetParamsPtr(module) !== moduleGetParamsPtr(moduleB), 'Delay B params should be instance-owned');
moduleDestroy(moduleB);

const inputLPtr = malloc(blockSize * Float32Array.BYTES_PER_ELEMENT);
const inputRPtr = malloc(blockSize * Float32Array.BYTES_PER_ELEMENT);
const tapLPtrsPtr = malloc(outputTapCount * Uint32Array.BYTES_PER_ELEMENT);
const tapRPtrsPtr = malloc(outputTapCount * Uint32Array.BYTES_PER_ELEMENT);
const tapLPtrs = [];
const tapRPtrs = [];
for (let tap = 0; tap < outputTapCount; tap += 1) {
  tapLPtrs[tap] = malloc(blockSize * Float32Array.BYTES_PER_ELEMENT);
  tapRPtrs[tap] = malloc(blockSize * Float32Array.BYTES_PER_ELEMENT);
}
{
  const view = dataView();
  for (let tap = 0; tap < outputTapCount; tap += 1) {
    view.setUint32(tapLPtrsPtr + tap * Uint32Array.BYTES_PER_ELEMENT, tapLPtrs[tap], true);
    view.setUint32(tapRPtrsPtr + tap * Uint32Array.BYTES_PER_ELEMENT, tapRPtrs[tap], true);
  }
}

const paramsPtr = moduleGetParamsPtr(module);
writeParams(paramsPtr);
moduleCommitParams(module);

let mainPeak = 0;
let reverbPeak = 0;
let delayAPeak = 0;
let granularPeak = 0;
for (let block = 0; block < 32; block += 1) {
  const heap = heapView();
  heap.fill(0, inputLPtr >> 2, (inputLPtr >> 2) + blockSize);
  heap.fill(0, inputRPtr >> 2, (inputRPtr >> 2) + blockSize);
  for (const ptr of [...tapLPtrs, ...tapRPtrs]) {
    heap.fill(0, ptr >> 2, (ptr >> 2) + blockSize);
  }
  if (block === 0) {
    heap[inputLPtr >> 2] = 0.8;
    heap[inputRPtr >> 2] = -0.3;
  }
  assert(
    processTaps(module, inputLPtr, inputRPtr, tapLPtrsPtr, tapRPtrsPtr, outputTapCount, blockSize) === 1,
    'Delay B tap processing failed',
  );
  mainPeak = Math.max(mainPeak, stereoPeak(outputArray(tapLPtrs[0], blockSize), outputArray(tapRPtrs[0], blockSize)));
  reverbPeak = Math.max(reverbPeak, stereoPeak(outputArray(tapLPtrs[1], blockSize), outputArray(tapRPtrs[1], blockSize)));
  delayAPeak = Math.max(delayAPeak, stereoPeak(outputArray(tapLPtrs[2], blockSize), outputArray(tapRPtrs[2], blockSize)));
  granularPeak = Math.max(granularPeak, stereoPeak(outputArray(tapLPtrs[3], blockSize), outputArray(tapRPtrs[3], blockSize)));
}

assert(mainPeak > 1e-5, 'Delay B main tap stayed silent');
assert(reverbPeak > 1e-6, 'Delay B reverb tap stayed silent');
assert(delayAPeak > 1e-6, 'Delay B Delay A cross-feed tap stayed silent');
assert(granularPeak > 1e-6, 'Delay B granular tap stayed silent');

moduleReset(module);
writeParams(paramsPtr, { enabled: 0 });
moduleCommitParams(module);
for (let block = 0; block < 2; block += 1) {
  const heap = heapView();
  heap.fill(0.25, inputLPtr >> 2, (inputLPtr >> 2) + blockSize);
  heap.fill(-0.25, inputRPtr >> 2, (inputRPtr >> 2) + blockSize);
  for (const ptr of [...tapLPtrs, ...tapRPtrs]) {
    heap.fill(0, ptr >> 2, (ptr >> 2) + blockSize);
  }
  assert(
    processTaps(module, inputLPtr, inputRPtr, tapLPtrsPtr, tapRPtrsPtr, outputTapCount, blockSize) === 1,
    'Disabled Delay B tap processing failed',
  );
  assert(stereoPeak(outputArray(tapLPtrs[0], blockSize), outputArray(tapRPtrs[0], blockSize)) === 0, 'Disabled Delay B emitted output');
}

moduleDestroy(module);

console.log(
  `KesshoCore Delay B module regression passed: main=${mainPeak.toExponential(3)}, reverb=${reverbPeak.toExponential(3)}, delayA=${delayAPeak.toExponential(3)}, granular=${granularPeak.toExponential(3)}`,
);
