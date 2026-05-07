import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const standaloneWasmPath = resolve(root, 'public/worklets/kessho_spectral_freeze.wasm');
const coreWasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const sampleRate = 48000;
const blockSize = 128;
const moduleTypeSpectralFreeze = 5;

const paramOrder = ['freeze', 'slushy', 'speed', 'mix', 'decay', 'phaseJitter'];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
    throw new Error(`Missing ${path}`);
  }
  const module = await WebAssembly.compile(readFileSync(path));
  return WebAssembly.instantiate(module, wasmImports());
}

function requireExport(exports, name) {
  const fn = exports[name] || exports[`_${name}`];
  if (typeof fn !== 'function') {
    throw new Error(`Missing WASM export: ${name}`);
  }
  return fn;
}

function baseParams(overrides = {}) {
  return {
    freeze: 0,
    slushy: 0,
    speed: 0,
    mix: 1,
    decay: 0,
    phaseJitter: 0,
    ...overrides,
  };
}

function writeCoreParams(heap, ptr, params) {
  const offset = ptr >> 2;
  for (let i = 0; i < paramOrder.length; i += 1) {
    heap[offset + i] = Number(params[paramOrder[i]] ?? 0);
  }
}

function applyStandaloneParams(exports, params) {
  requireExport(exports, 'spectral_freeze_set_freeze')(params.freeze ? 1 : 0);
  requireExport(exports, 'spectral_freeze_set_slushy')(params.slushy ? 1 : 0);
  requireExport(exports, 'spectral_freeze_set_speed')(params.speed);
  requireExport(exports, 'spectral_freeze_set_mix')(params.mix);
  requireExport(exports, 'spectral_freeze_set_decay')(params.decay);
  requireExport(exports, 'spectral_freeze_set_phase_jitter')(params.phaseJitter);
}

function generateInput(blocks, fillInput) {
  const input = new Float32Array(blocks * blockSize * 2);
  for (let block = 0; block < blocks; block += 1) {
    for (let i = 0; i < blockSize; i += 1) {
      const [left, right] = fillInput(block, i);
      const sampleIndex = (block * blockSize + i) * 2;
      input[sampleIndex] = left;
      input[sampleIndex + 1] = right;
    }
  }
  return input;
}

async function renderStandalone(params, input, blocks) {
  const { exports } = await instantiateWasm(standaloneWasmPath);
  const init = requireExport(exports, 'spectral_freeze_init');
  const getInputPtr = requireExport(exports, 'spectral_freeze_get_input_ptr');
  const getOutputPtr = requireExport(exports, 'spectral_freeze_get_output_ptr');
  const processBlock = requireExport(exports, 'spectral_freeze_process_block');
  const destroy = requireExport(exports, 'spectral_freeze_destroy');

  assert(init(sampleRate) === 0, 'standalone spectral freeze init failed');
  applyStandaloneParams(exports, params);

  const inputPtr = getInputPtr() >> 2;
  const outputPtr = getOutputPtr() >> 2;
  const output = new Float32Array(input.length);

  for (let block = 0; block < blocks; block += 1) {
    const blockOffset = block * blockSize * 2;
    const heap = new Float32Array(exports.memory.buffer);
    heap.set(input.subarray(blockOffset, blockOffset + blockSize * 2), inputPtr);
    processBlock(blockSize);
    output.set(heap.subarray(outputPtr, outputPtr + blockSize * 2), blockOffset);
  }

  destroy();
  return output;
}

async function renderCoreModule(params, input, blocks) {
  const { exports } = await instantiateWasm(coreWasmPath);
  const malloc = requireExport(exports, 'malloc');
  const free = requireExport(exports, 'free');
  const moduleCreate = requireExport(exports, 'kessho_module_create');
  const moduleDestroy = requireExport(exports, 'kessho_module_destroy');
  const moduleGetParamCount = requireExport(exports, 'kessho_module_get_param_count');
  const moduleGetParamsPtr = requireExport(exports, 'kessho_module_get_params_ptr');
  const moduleCommitParams = requireExport(exports, 'kessho_module_commit_params');
  const moduleProcessInterleaved = requireExport(exports, 'kessho_module_process_interleaved');

  const module = moduleCreate(moduleTypeSpectralFreeze, sampleRate, blockSize);
  assert(module !== 0, 'core spectral freeze module setup failed');
  assert(moduleGetParamCount(module) === paramOrder.length, 'core spectral freeze param count mismatch');

  let heap = new Float32Array(exports.memory.buffer);
  writeCoreParams(heap, moduleGetParamsPtr(module), params);
  moduleCommitParams(module);

  const inputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  const outputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  assert(inputPtr !== 0 && outputPtr !== 0, 'core spectral freeze module allocation failed');
  heap = new Float32Array(exports.memory.buffer);

  const inputOffset = inputPtr >> 2;
  const outputOffset = outputPtr >> 2;
  const output = new Float32Array(input.length);

  for (let block = 0; block < blocks; block += 1) {
    const blockOffset = block * blockSize * 2;
    heap = new Float32Array(exports.memory.buffer);
    heap.set(input.subarray(blockOffset, blockOffset + blockSize * 2), inputOffset);
    assert(
      moduleProcessInterleaved(module, inputPtr, outputPtr, blockSize) === 1,
      'core spectral freeze module process failed',
    );
    output.set(heap.subarray(outputOffset, outputOffset + blockSize * 2), blockOffset);
  }

  moduleDestroy(module);
  free(inputPtr);
  free(outputPtr);
  return output;
}

function diffStats(a, b) {
  assert(a.length === b.length, 'render lengths differ');
  let sumSq = 0;
  let peak = 0;
  let signalPeak = 0;
  for (let i = 0; i < a.length; i += 1) {
    assert(Number.isFinite(a[i]) && Number.isFinite(b[i]), 'render produced non-finite samples');
    const diff = a[i] - b[i];
    sumSq += diff * diff;
    peak = Math.max(peak, Math.abs(diff));
    signalPeak = Math.max(signalPeak, Math.abs(a[i]), Math.abs(b[i]));
  }
  return { rms: Math.sqrt(sumSq / Math.max(1, a.length)), peak, signalPeak };
}

function assertPassthrough(output, input, name) {
  const residual = diffStats(output, input);
  assert(
    residual.rms <= 1.0e-8 && residual.peak <= 1.0e-7,
    `${name} did not pass through cleanly: RMS ${residual.rms}, peak ${residual.peak}`,
  );
}

const harmonicInput = (blocks, activeBlocks = blocks) => generateInput(blocks, (block, i) => {
  if (block >= activeBlocks) return [0, 0];
  const t = (block * blockSize + i) / sampleRate;
  const env = Math.min(1, (block * blockSize + i) / (sampleRate * 0.02));
  const left = env * (Math.sin(2 * Math.PI * 196 * t) * 0.22 + Math.sin(2 * Math.PI * 392 * t) * 0.07);
  const right = env * (Math.sin(2 * Math.PI * 247 * t) * 0.18 + Math.sin(2 * Math.PI * 494 * t) * 0.05);
  return [left, right];
});

const cases = [
  {
    name: 'dry-passthrough',
    params: baseParams({ mix: 0, freeze: 1, slushy: 1, speed: 0.45, decay: 0.2, phaseJitter: 0.05 }),
    blocks: 12,
    passthrough: true,
    input: harmonicInput(12),
  },
  {
    name: 'live-resynthesis',
    params: baseParams({ mix: 1, freeze: 0, slushy: 0 }),
    blocks: 48,
    input: harmonicInput(48),
  },
  {
    name: 'solid-freeze',
    params: baseParams({ mix: 1, freeze: 1, slushy: 0, decay: 0.08, phaseJitter: 0.02 }),
    blocks: 64,
    input: harmonicInput(64, 28),
  },
  {
    name: 'slushy-freeze',
    params: baseParams({ mix: 1, freeze: 1, slushy: 1, speed: 0.38, decay: 0.12, phaseJitter: 0.04 }),
    blocks: 64,
    input: harmonicInput(64, 36),
  },
];

const results = [];
for (const testCase of cases) {
  const standalone = await renderStandalone(testCase.params, testCase.input, testCase.blocks);
  const core = await renderCoreModule(testCase.params, testCase.input, testCase.blocks);
  const residual = diffStats(standalone, core);
  assert(
    residual.rms <= 1.0e-7 && residual.peak <= 1.0e-6,
    `${testCase.name} spectral freeze module parity drift too high: RMS ${residual.rms}, peak ${residual.peak}`,
  );
  assert(residual.signalPeak > 1.0e-5, `${testCase.name} produced no spectral freeze signal`);
  if (testCase.passthrough) {
    assertPassthrough(standalone, testCase.input, `${testCase.name} standalone`);
    assertPassthrough(core, testCase.input, `${testCase.name} core`);
  }
  results.push(
    `${testCase.name}: RMS ${residual.rms.toExponential(3)}, peak ${residual.peak.toExponential(3)}`,
  );
}

console.log(`KesshoCore spectral freeze module parity passed: ${results.join('; ')}`);
