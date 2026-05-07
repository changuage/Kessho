import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const standaloneWasmPath = resolve(root, 'public/worklets/kessho_dynamics_character.wasm');
const degradeStandaloneWasmPath = resolve(root, 'public/worklets/kessho_dynamics_degrade.wasm');
const coreWasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const workletPath = resolve(root, 'public/worklets/dynamics-character.worklet.js');
const sampleRate = 48000;
const blockSize = 128;

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

function readParamOrder() {
  const source = readFileSync(workletPath, 'utf8');
  const orderMatch = source.match(/const PARAM_ORDER = \[([\s\S]*?)\];/);
  if (!orderMatch) throw new Error('Could not read PARAM_ORDER from dynamics-character.worklet.js');
  return [...orderMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

const paramOrder = readParamOrder();

function baseParams(overrides = {}) {
  return {
    active: 1,
    allpassActive: 1,
    dry: 0.58,
    wet: 0.42,
    degradeMix: 0,
    workletAlias: 0,
    rawDegradeGeneration: 0,
    rawCorrosion: 0,
    rawMediaWear: 0.08,
    noiseGain: 0.0008,
    jitterDepth: 0.00001,
    randomDriftFilterHz: 0.14,
    randomDriftDepth: 0.00018,
    baseDelay: 0.0045,
    spreadBaseDelay: 0.013,
    randomDrift: 0.38,
    randomHoldRateHz: 0.18,
    randomHoldLag: 0.85,
    randomDelayDepth: 0.0018,
    randomSpreadDelayDepth: 0.0024,
    randomFilterDepth: 80,
    randomSpreadFilterDepth: 50,
    depth: 0.52,
    rate: 0.18,
    shallowFlavor: 1,
    abyssFlavor: 0,
    stereo: 0.72,
    damage: 0.05,
    mainPan: -0.28,
    spreadPan: 0.62,
    mainDelayGain: 0.9,
    spreadDelayGain: 0.38,
    wowFrequency: 0.16,
    flutterFrequency: 5.5,
    flutterRandomDepth: 0.00008,
    wowDepth: 0.0012,
    flutterDepth: 0.00012,
    highpassHz: 42,
    highpassQ: 0.9,
    allpassAFrequency: 950,
    allpassAQ: 0.8,
    allpassBFrequency: 2500,
    allpassBQ: 1.0,
    headBumpFrequency: 96,
    headBumpQ: 0.8,
    headBumpGain: 0.5,
    dropoutFilterHz: 3,
    dropoutDepth: 0.01,
    dropoutGain: 0.98,
    envFilterHz: 7,
    envToLowpassGain: 120,
    envToResonanceGain: 0.08,
    envToWetGain: 0.02,
    lowpassHz: 11500,
    lowpassQ: 1.1,
    lowpassStage2Hz: 9800,
    lowpassStage2Q: 0.9,
    compressorThreshold: -18,
    compressorKnee: 14,
    compressorRatio: 1.7,
    compressorAttack: 0.01,
    compressorRelease: 0.2,
    compressorMakeup: 1.04,
    saturation: 0.08,
    corrosion: 0.02,
    masterSatActive: 0,
    masterSatMode: 0,
    masterSatDrive: 0,
    masterSatTone: 0.5,
    masterSatBias: 0.5,
    endCompActive: 0,
    endCompThreshold: -18,
    endCompKnee: 12,
    endCompRatio: 2,
    endCompAttack: 0.01,
    endCompRelease: 0.2,
    endCompMakeup: 1,
    endCompMix: 0,
    endCompDetectorHpHz: 90,
    endCompDetectorTilt: 0,
    endCompAutoMakeup: 0,
    endCompProgramRelease: 0,
    ...overrides,
  };
}

function writeParams(heap, ptr, params) {
  const offset = ptr >> 2;
  for (let i = 0; i < paramOrder.length; i += 1) {
    heap[offset + i] = Number(params[paramOrder[i]] ?? 0);
  }
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
  const init = requireExport(exports, 'dynamics_character_init');
  const getInputPtr = requireExport(exports, 'dynamics_character_get_input_ptr');
  const getOutputPtr = requireExport(exports, 'dynamics_character_get_output_ptr');
  const getParamsPtr = requireExport(exports, 'dynamics_character_get_params_ptr');
  const commitParams = requireExport(exports, 'dynamics_character_commit_params');
  const processBlock = requireExport(exports, 'dynamics_character_process_block');
  const destroy = requireExport(exports, 'dynamics_character_destroy');

  assert(init(sampleRate) === 0, 'standalone dynamics init failed');
  const heap = new Float32Array(exports.memory.buffer);
  writeParams(heap, getParamsPtr(), params);
  commitParams();

  const inputPtr = getInputPtr() >> 2;
  const outputPtr = getOutputPtr() >> 2;
  const output = new Float32Array(input.length);

  for (let block = 0; block < blocks; block += 1) {
    const blockOffset = block * blockSize * 2;
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
  const moduleGetParamsPtr = requireExport(exports, 'kessho_module_get_params_ptr');
  const moduleCommitParams = requireExport(exports, 'kessho_module_commit_params');
  const moduleProcessInterleaved = requireExport(exports, 'kessho_module_process_interleaved');

  const inputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  const outputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  const module = moduleCreate(1, sampleRate, blockSize);
  assert(inputPtr !== 0 && outputPtr !== 0 && module !== 0, 'core dynamics module setup failed');

  const heap = new Float32Array(exports.memory.buffer);
  writeParams(heap, moduleGetParamsPtr(module), params);
  moduleCommitParams(module);

  const inputOffset = inputPtr >> 2;
  const outputOffset = outputPtr >> 2;
  const output = new Float32Array(input.length);

  for (let block = 0; block < blocks; block += 1) {
    const blockOffset = block * blockSize * 2;
    heap.set(input.subarray(blockOffset, blockOffset + blockSize * 2), inputOffset);
    assert(
      moduleProcessInterleaved(module, inputPtr, outputPtr, blockSize) === 1,
      'core dynamics module process failed',
    );
    output.set(heap.subarray(outputOffset, outputOffset + blockSize * 2), blockOffset);
  }

  moduleDestroy(module);
  free(inputPtr);
  free(outputPtr);
  return output;
}

async function renderDegradeStandalone(params, input, blocks) {
  const { exports } = await instantiateWasm(degradeStandaloneWasmPath);
  const init = requireExport(exports, 'dynamics_degrade_init');
  const getInputPtr = requireExport(exports, 'dynamics_degrade_get_input_ptr');
  const getOutputPtr = requireExport(exports, 'dynamics_degrade_get_output_ptr');
  const setParams = requireExport(exports, 'dynamics_degrade_set_params');
  const processBlock = requireExport(exports, 'dynamics_degrade_process_block');
  const destroy = requireExport(exports, 'dynamics_degrade_destroy');

  assert(init(sampleRate) === 0, 'standalone dynamics degrade init failed');
  setParams(
    params.enabled ? 1 : 0,
    params.mix ?? 0,
    params.alias ?? 0,
    params.generation ?? 0,
    params.corrosion ?? 0,
    params.wear ?? 0,
  );

  const heap = new Float32Array(exports.memory.buffer);
  const inputPtr = getInputPtr() >> 2;
  const outputPtr = getOutputPtr() >> 2;
  const output = new Float32Array(input.length);

  for (let block = 0; block < blocks; block += 1) {
    const blockOffset = block * blockSize * 2;
    heap.set(input.subarray(blockOffset, blockOffset + blockSize * 2), inputPtr);
    processBlock(blockSize);
    output.set(heap.subarray(outputPtr, outputPtr + blockSize * 2), blockOffset);
  }

  destroy();
  return output;
}

async function renderDegradeCoreModule(params, input, blocks) {
  const { exports } = await instantiateWasm(coreWasmPath);
  const malloc = requireExport(exports, 'malloc');
  const free = requireExport(exports, 'free');
  const moduleCreate = requireExport(exports, 'kessho_module_create');
  const moduleDestroy = requireExport(exports, 'kessho_module_destroy');
  const moduleGetParamsPtr = requireExport(exports, 'kessho_module_get_params_ptr');
  const moduleCommitParams = requireExport(exports, 'kessho_module_commit_params');
  const moduleProcessInterleaved = requireExport(exports, 'kessho_module_process_interleaved');

  const inputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  const outputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  const module = moduleCreate(2, sampleRate, blockSize);
  assert(inputPtr !== 0 && outputPtr !== 0 && module !== 0, 'core dynamics degrade module setup failed');

  const heap = new Float32Array(exports.memory.buffer);
  const paramsPtr = moduleGetParamsPtr(module) >> 2;
  heap[paramsPtr] = params.enabled ? 1 : 0;
  heap[paramsPtr + 1] = params.mix ?? 0;
  heap[paramsPtr + 2] = params.alias ?? 0;
  heap[paramsPtr + 3] = params.generation ?? 0;
  heap[paramsPtr + 4] = params.corrosion ?? 0;
  heap[paramsPtr + 5] = params.wear ?? 0;
  moduleCommitParams(module);

  const inputOffset = inputPtr >> 2;
  const outputOffset = outputPtr >> 2;
  const output = new Float32Array(input.length);

  for (let block = 0; block < blocks; block += 1) {
    const blockOffset = block * blockSize * 2;
    heap.set(input.subarray(blockOffset, blockOffset + blockSize * 2), inputOffset);
    assert(
      moduleProcessInterleaved(module, inputPtr, outputPtr, blockSize) === 1,
      'core dynamics degrade module process failed',
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
  for (let i = 0; i < a.length; i += 1) {
    const diff = a[i] - b[i];
    assert(Number.isFinite(a[i]) && Number.isFinite(b[i]), 'render produced non-finite samples');
    sumSq += diff * diff;
    peak = Math.max(peak, Math.abs(diff));
  }
  return { rms: Math.sqrt(sumSq / Math.max(1, a.length)), peak };
}

const cases = [
  {
    name: 'bypass',
    params: baseParams({ active: 0, dry: 1, wet: 0 }),
    blocks: 8,
    input: generateInput(8, (_block, i) => {
      const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2;
      return [sample, sample * 0.75];
    }),
  },
  {
    name: 'clean-character',
    params: baseParams(),
    blocks: 80,
    input: generateInput(80, (block, i) => {
      const t = (block * blockSize + i) / sampleRate;
      const sample = Math.sin(2 * Math.PI * 220 * t) * 0.18 + Math.sin(2 * Math.PI * 1760 * t) * 0.04;
      return [sample, sample];
    }),
  },
  {
    name: 'harsh-degrade',
    params: baseParams({
      dry: 0.25,
      wet: 0.75,
      degradeMix: 0.9,
      workletAlias: 0.85,
      rawDegradeGeneration: 0.72,
      rawCorrosion: 0.55,
      rawMediaWear: 0.88,
      saturation: 0.62,
      corrosion: 0.48,
      lowpassHz: 5200,
      lowpassStage2Hz: 4200,
    }),
    blocks: 80,
    input: generateInput(80, (_block, i) => {
      const t = i / sampleRate;
      const sample = Math.sin(2 * Math.PI * 900 * t) * 0.25 + Math.sin(2 * Math.PI * 9000 * t) * 0.08;
      return [sample, sample];
    }),
  },
];

const results = [];
for (const testCase of cases) {
  const standalone = await renderStandalone(testCase.params, testCase.input, testCase.blocks);
  const core = await renderCoreModule(testCase.params, testCase.input, testCase.blocks);
  const residual = diffStats(standalone, core);
  assert(
    residual.rms <= 1.0e-7 && residual.peak <= 1.0e-6,
    `${testCase.name} dynamics module parity drift too high: RMS ${residual.rms}, peak ${residual.peak}`,
  );
  results.push(`${testCase.name}: RMS ${residual.rms.toExponential(3)}, peak ${residual.peak.toExponential(3)}`);
}

const degradeCases = [
  {
    name: 'degrade-bypass',
    params: { enabled: 0, mix: 1, alias: 1, generation: 1, corrosion: 1, wear: 1 },
    blocks: 8,
    input: generateInput(8, (_block, i) => {
      const sample = Math.sin((2 * Math.PI * 330 * i) / sampleRate) * 0.18;
      return [sample, sample * 0.4];
    }),
  },
  {
    name: 'degrade-wear',
    params: { enabled: 1, mix: 0.55, alias: 0, generation: 0.28, corrosion: 0.08, wear: 0.64 },
    blocks: 80,
    input: generateInput(80, (block, i) => {
      const t = (block * blockSize + i) / sampleRate;
      const sample = Math.sin(2 * Math.PI * 180 * t) * 0.2 + Math.sin(2 * Math.PI * 1450 * t) * 0.05;
      return [sample, sample * 0.85];
    }),
  },
  {
    name: 'degrade-alias',
    params: { enabled: 1, mix: 0.86, alias: 0.82, generation: 0.68, corrosion: 0.48, wear: 0.32 },
    blocks: 80,
    input: generateInput(80, (block, i) => {
      const t = (block * blockSize + i) / sampleRate;
      const sample = Math.sin(2 * Math.PI * 950 * t) * 0.22 + Math.sin(2 * Math.PI * 7600 * t) * 0.08;
      return [sample, sample];
    }),
  },
];

const degradeResults = [];
for (const testCase of degradeCases) {
  const standalone = await renderDegradeStandalone(testCase.params, testCase.input, testCase.blocks);
  const core = await renderDegradeCoreModule(testCase.params, testCase.input, testCase.blocks);
  const residual = diffStats(standalone, core);
  assert(
    residual.rms <= 1.0e-7 && residual.peak <= 1.0e-6,
    `${testCase.name} dynamics degrade module parity drift too high: RMS ${residual.rms}, peak ${residual.peak}`,
  );
  degradeResults.push(`${testCase.name}: RMS ${residual.rms.toExponential(3)}, peak ${residual.peak.toExponential(3)}`);
}

console.log(`KesshoCore dynamics module parity passed: ${results.join('; ')}; ${degradeResults.join('; ')}`);
