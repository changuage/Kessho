import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const standaloneWasmPath = resolve(root, 'public/worklets/kessho_soundscapes.wasm');
const coreWasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const sampleRate = 48000;
const blockSize = 128;
const moduleTypeSoundscapes = 9;

const paramWaterActive = 0;
const paramWaterPreset = paramWaterActive + 1;
const paramWaterParams = paramWaterPreset + 1;
const paramWaterLayerDetail = paramWaterParams + 14;
const paramWaterLayerMix = paramWaterLayerDetail + 7;
const paramWaterLayerDensity = paramWaterLayerMix + 6;
const paramWaterDensityLoop = paramWaterLayerDensity + 6;
const paramWaterSurf = paramWaterDensityLoop + 7;
const paramWaterChannels = paramWaterSurf + 16;
const paramWaterSeed = paramWaterChannels + 2;
const paramInsectsActive = paramWaterSeed + 1;
const paramInsectsEngine = paramInsectsActive + 1;
const paramInsectsParams = paramInsectsEngine + 1;
const paramInsectsSeed = paramInsectsParams + 14;
const paramInsects2Active = paramInsectsSeed + 1;
const paramInsects2Engine = paramInsects2Active + 1;
const paramInsects2Params = paramInsects2Engine + 1;
const paramInsects2Seed = paramInsects2Params + 14;
const paramOutputSelect = paramInsects2Seed + 1;
const paramCount = paramOutputSelect + 1;
const seedNoChange = -1;

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

function makeDefaultParams() {
  const params = new Float32Array(paramCount);

  params[paramWaterActive] = 0;
  params[paramWaterPreset] = 0;

  params[paramWaterParams + 0] = 0.5;
  params[paramWaterParams + 1] = 0.5;
  params[paramWaterParams + 2] = 0.3;
  params[paramWaterParams + 3] = 0.3;
  params[paramWaterParams + 4] = 2500;
  params[paramWaterParams + 5] = 2500;
  params[paramWaterParams + 6] = 2500;
  params[paramWaterParams + 7] = 2500;
  params[paramWaterParams + 8] = 0.5;
  params[paramWaterParams + 9] = 0.5;
  params[paramWaterParams + 10] = 0.5;
  params[paramWaterParams + 11] = 0.5;
  params[paramWaterParams + 12] = 0.5;
  params[paramWaterParams + 13] = 0.5;

  params[paramWaterLayerDetail + 0] = 1;
  params[paramWaterLayerDetail + 1] = 12000;
  params[paramWaterLayerDetail + 2] = 1;
  params[paramWaterLayerDetail + 3] = 1;
  params[paramWaterLayerDetail + 4] = 16000;
  params[paramWaterLayerDetail + 5] = 1;
  params[paramWaterLayerDetail + 6] = 1500;

  params[paramWaterLayerMix + 0] = 0.7;
  params[paramWaterLayerMix + 1] = 0.5;
  params[paramWaterLayerMix + 2] = 0.3;
  params[paramWaterLayerMix + 3] = 0;
  params[paramWaterLayerMix + 4] = 0;
  params[paramWaterLayerMix + 5] = 0;

  for (let i = 0; i < 6; i += 1) {
    params[paramWaterLayerDensity + i] = 0.5;
  }

  params[paramWaterDensityLoop + 0] = 0.22;
  params[paramWaterDensityLoop + 1] = 0.36;
  params[paramWaterDensityLoop + 2] = 0.48;
  params[paramWaterDensityLoop + 3] = 0.64;
  params[paramWaterDensityLoop + 4] = 1050;
  params[paramWaterDensityLoop + 5] = 1;
  params[paramWaterDensityLoop + 6] = 0.34;

  params[paramWaterSurf + 0] = 4;
  params[paramWaterSurf + 1] = 12;
  params[paramWaterSurf + 2] = 5;
  params[paramWaterSurf + 3] = 14;
  params[paramWaterSurf + 4] = 0.2;
  params[paramWaterSurf + 5] = 0.5;
  params[paramWaterSurf + 6] = 0.7;
  params[paramWaterSurf + 7] = 0.7;
  params[paramWaterSurf + 8] = 0.3;
  params[paramWaterSurf + 9] = 0.7;
  params[paramWaterSurf + 10] = 300;
  params[paramWaterSurf + 11] = 300;
  params[paramWaterSurf + 12] = 4000;
  params[paramWaterSurf + 13] = 4000;
  params[paramWaterSurf + 14] = 0.4;
  params[paramWaterSurf + 15] = 0.4;

  params[paramWaterChannels + 0] = 0;
  params[paramWaterChannels + 1] = 0.5;
  params[paramWaterSeed] = seedNoChange;

  params[paramInsectsActive] = 0;
  params[paramInsectsEngine] = 0;
  params[paramInsectsSeed] = seedNoChange;
  params[paramInsects2Active] = 0;
  params[paramInsects2Engine] = 1;
  params[paramInsects2Seed] = seedNoChange;

  for (const base of [paramInsectsParams, paramInsects2Params]) {
    params[base + 0] = 0.5;
    params[base + 1] = 0.5;
    params[base + 2] = 0.5;
    params[base + 3] = 0.5;
    params[base + 4] = 0.3;
    params[base + 5] = 0.3;
    params[base + 6] = 0.5;
    params[base + 7] = 0.5;
    params[base + 8] = 0.3;
    params[base + 9] = 0.3;
    params[base + 10] = 0.3;
    params[base + 11] = 0.3;
    params[base + 12] = 0.5;
    params[base + 13] = 0.5;
  }

  params[paramOutputSelect] = 0;
  return params;
}

function withParams(configure) {
  const params = makeDefaultParams();
  configure(params);
  return params;
}

function writeCoreParams(heap, ptr, params) {
  heap.set(params, ptr >> 2);
}

function applyStandaloneParams(exports, params) {
  const call = (name, ...args) => requireExport(exports, name)(...args);

  if (params[paramWaterSeed] >= 0) {
    call('water_set_seed', Math.round(params[paramWaterSeed]));
  }
  call(params[paramWaterActive] > 0.5 ? 'water_start' : 'water_stop');
  call('water_set_preset', Math.max(0, Math.min(7, Math.round(params[paramWaterPreset]))));
  call(
    'water_set_params',
    params[paramWaterParams + 0],
    params[paramWaterParams + 1],
    params[paramWaterParams + 2],
    params[paramWaterParams + 3],
    params[paramWaterParams + 4],
    params[paramWaterParams + 5],
    params[paramWaterParams + 6],
    params[paramWaterParams + 7],
    params[paramWaterParams + 8],
    params[paramWaterParams + 9],
    params[paramWaterParams + 10],
    params[paramWaterParams + 11],
    params[paramWaterParams + 12],
    params[paramWaterParams + 13],
  );
  call(
    'water_set_layer_detail_params',
    params[paramWaterLayerDetail + 0],
    params[paramWaterLayerDetail + 1],
    params[paramWaterLayerDetail + 2],
    params[paramWaterLayerDetail + 3],
    params[paramWaterLayerDetail + 4],
    params[paramWaterLayerDetail + 5],
    params[paramWaterLayerDetail + 6],
  );
  call(
    'water_set_layer_mix',
    params[paramWaterLayerMix + 0],
    params[paramWaterLayerMix + 1],
    params[paramWaterLayerMix + 2],
    params[paramWaterLayerMix + 3],
    params[paramWaterLayerMix + 4],
    params[paramWaterLayerMix + 5],
  );
  call(
    'water_set_layer_density',
    params[paramWaterLayerDensity + 0],
    params[paramWaterLayerDensity + 1],
    params[paramWaterLayerDensity + 2],
    params[paramWaterLayerDensity + 3],
    params[paramWaterLayerDensity + 4],
    params[paramWaterLayerDensity + 5],
  );
  call(
    'water_set_surf_params',
    params[paramWaterSurf + 0],
    params[paramWaterSurf + 1],
    params[paramWaterSurf + 2],
    params[paramWaterSurf + 3],
    params[paramWaterSurf + 4],
    params[paramWaterSurf + 5],
    params[paramWaterSurf + 6],
    params[paramWaterSurf + 7],
    params[paramWaterSurf + 8],
    params[paramWaterSurf + 9],
    params[paramWaterSurf + 10],
    params[paramWaterSurf + 11],
    params[paramWaterSurf + 12],
    params[paramWaterSurf + 13],
    params[paramWaterSurf + 14],
    params[paramWaterSurf + 15],
  );
  call('water_set_channels_params', params[paramWaterChannels + 0], params[paramWaterChannels + 1]);
  call(
    'water_set_density_loop_params',
    params[paramWaterDensityLoop + 0],
    params[paramWaterDensityLoop + 1],
    params[paramWaterDensityLoop + 2],
    params[paramWaterDensityLoop + 3],
    params[paramWaterDensityLoop + 4],
    params[paramWaterDensityLoop + 5],
    params[paramWaterDensityLoop + 6],
  );

  if (params[paramInsectsSeed] >= 0) {
    call('insects_set_seed', Math.round(params[paramInsectsSeed]));
  }
  call(params[paramInsectsActive] > 0.5 ? 'insects_start' : 'insects_stop');
  call('insects_set_engine', Math.max(0, Math.min(6, Math.round(params[paramInsectsEngine]))));
  call(
    'insects_set_params',
    params[paramInsectsParams + 0],
    params[paramInsectsParams + 1],
    params[paramInsectsParams + 2],
    params[paramInsectsParams + 3],
    params[paramInsectsParams + 4],
    params[paramInsectsParams + 5],
    params[paramInsectsParams + 6],
    params[paramInsectsParams + 7],
    params[paramInsectsParams + 8],
    params[paramInsectsParams + 9],
    params[paramInsectsParams + 10],
    params[paramInsectsParams + 11],
    params[paramInsectsParams + 12],
    params[paramInsectsParams + 13],
  );

  if (params[paramInsects2Seed] >= 0) {
    call('insects2_set_seed', Math.round(params[paramInsects2Seed]));
  }
  call(params[paramInsects2Active] > 0.5 ? 'insects2_start' : 'insects2_stop');
  call('insects2_set_engine', Math.max(0, Math.min(6, Math.round(params[paramInsects2Engine]))));
  call(
    'insects2_set_params',
    params[paramInsects2Params + 0],
    params[paramInsects2Params + 1],
    params[paramInsects2Params + 2],
    params[paramInsects2Params + 3],
    params[paramInsects2Params + 4],
    params[paramInsects2Params + 5],
    params[paramInsects2Params + 6],
    params[paramInsects2Params + 7],
    params[paramInsects2Params + 8],
    params[paramInsects2Params + 9],
    params[paramInsects2Params + 10],
    params[paramInsects2Params + 11],
    params[paramInsects2Params + 12],
    params[paramInsects2Params + 13],
  );
}

function copySelected(heap, ptrs, output, outputOffset, frames, select) {
  const outputSelect = Math.max(0, Math.min(3, Math.round(select)));
  if (outputSelect === 3) {
    const waterOffset = ptrs[0] >> 2;
    const insectsOffset = ptrs[1] >> 2;
    const insects2Offset = ptrs[2] >> 2;
    for (let i = 0; i < frames * 2; i += 1) {
      output[outputOffset + i] =
        heap[waterOffset + i] + heap[insectsOffset + i] + heap[insects2Offset + i];
    }
    return;
  }
  const sourceOffset = ptrs[outputSelect] >> 2;
  output.set(heap.subarray(sourceOffset, sourceOffset + frames * 2), outputOffset);
}

async function renderStandalone(params, blocks) {
  const { exports } = await instantiateWasm(standaloneWasmPath);
  assert(requireExport(exports, 'water_init')(sampleRate) === 0, 'standalone water init failed');
  assert(requireExport(exports, 'insects_init')(sampleRate) === 0, 'standalone insects init failed');
  assert(requireExport(exports, 'insects2_init')(sampleRate) === 0, 'standalone insects2 init failed');

  applyStandaloneParams(exports, params);

  const processWater = requireExport(exports, 'water_process_block');
  const processInsects = requireExport(exports, 'insects_process_block');
  const processInsects2 = requireExport(exports, 'insects2_process_block');
  const ptrs = [
    requireExport(exports, 'water_get_output_ptr')(),
    requireExport(exports, 'insects_get_output_ptr')(),
    requireExport(exports, 'insects2_get_output_ptr')(),
  ];

  const output = new Float32Array(blocks * blockSize * 2);
  for (let block = 0; block < blocks; block += 1) {
    processWater(blockSize);
    processInsects(blockSize);
    processInsects2(blockSize);
    const heap = new Float32Array(exports.memory.buffer);
    copySelected(heap, ptrs, output, block * blockSize * 2, blockSize, params[paramOutputSelect]);
  }

  const finalActiveCount =
    requireExport(exports, 'water_get_active_voices')() +
    requireExport(exports, 'insects_get_active_voices')() +
    requireExport(exports, 'insects2_get_active_voices')();
  requireExport(exports, 'water_destroy')();
  requireExport(exports, 'insects_destroy')();
  requireExport(exports, 'insects2_destroy')();
  return { output, finalActiveCount };
}

async function renderCoreModule(params, blocks) {
  const { exports } = await instantiateWasm(coreWasmPath);
  const malloc = requireExport(exports, 'malloc');
  const free = requireExport(exports, 'free');
  const moduleCreate = requireExport(exports, 'kessho_module_create');
  const moduleDestroy = requireExport(exports, 'kessho_module_destroy');
  const moduleGetParamCount = requireExport(exports, 'kessho_module_get_param_count');
  const moduleGetParamsPtr = requireExport(exports, 'kessho_module_get_params_ptr');
  const moduleCommitParams = requireExport(exports, 'kessho_module_commit_params');
  const moduleGetActiveVoiceCount = requireExport(exports, 'kessho_module_get_active_voice_count');
  const moduleProcessInterleaved = requireExport(exports, 'kessho_module_process_interleaved');

  const module = moduleCreate(moduleTypeSoundscapes, sampleRate, blockSize);
  assert(module !== 0, 'core soundscapes module setup failed');
  assert(moduleGetParamCount(module) === paramCount, 'core soundscapes param count mismatch');

  let heap = new Float32Array(exports.memory.buffer);
  writeCoreParams(heap, moduleGetParamsPtr(module), params);
  moduleCommitParams(module);

  const inputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  const outputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  assert(inputPtr !== 0 && outputPtr !== 0, 'core soundscapes module allocation failed');
  heap = new Float32Array(exports.memory.buffer);
  const inputOffset = inputPtr >> 2;
  const outputOffset = outputPtr >> 2;
  heap.fill(0, inputOffset, inputOffset + blockSize * 2);

  const output = new Float32Array(blocks * blockSize * 2);
  for (let block = 0; block < blocks; block += 1) {
    heap = new Float32Array(exports.memory.buffer);
    heap.fill(0, outputOffset, outputOffset + blockSize * 2);
    assert(
      moduleProcessInterleaved(module, inputPtr, outputPtr, blockSize) === 1,
      'core soundscapes module process failed',
    );
    output.set(heap.subarray(outputOffset, outputOffset + blockSize * 2), block * blockSize * 2);
  }

  const finalActiveCount = moduleGetActiveVoiceCount(module);
  moduleDestroy(module);
  free(inputPtr);
  free(outputPtr);
  return { output, finalActiveCount };
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

function setWaterfall(params) {
  params[paramWaterActive] = 1;
  params[paramWaterPreset] = 2;
  params[paramWaterLayerMix + 0] = 0.2;
  params[paramWaterLayerMix + 1] = 0.4;
  params[paramWaterLayerMix + 2] = 0.8;
  params[paramWaterLayerMix + 3] = 0.5;
  params[paramWaterLayerMix + 4] = 1;
  for (let i = 0; i < 6; i += 1) {
    params[paramWaterLayerDensity + i] = 1;
  }
}

const cases = [
  {
    name: 'water-waterfall',
    params: withParams((params) => {
      setWaterfall(params);
      params[paramOutputSelect] = 0;
    }),
    blocks: 384,
  },
  {
    name: 'water-waterfall-seeded',
    params: withParams((params) => {
      setWaterfall(params);
      params[paramWaterSeed] = 12345;
      params[paramOutputSelect] = 0;
    }),
    blocks: 384,
  },
  {
    name: 'insects-cicada',
    params: withParams((params) => {
      params[paramInsectsActive] = 1;
      params[paramInsectsEngine] = 3;
      params[paramInsectsParams + 0] = 0.7;
      params[paramInsectsParams + 1] = 0.7;
      params[paramOutputSelect] = 1;
    }),
    blocks: 256,
  },
  {
    name: 'insects2-tree-cricket',
    params: withParams((params) => {
      params[paramInsects2Active] = 1;
      params[paramInsects2Engine] = 1;
      params[paramInsects2Params + 0] = 0.65;
      params[paramInsects2Params + 1] = 0.65;
      params[paramOutputSelect] = 2;
    }),
    blocks: 256,
  },
  {
    name: 'ocean-surf-surrogate',
    params: withParams((params) => {
      params[paramWaterActive] = 1;
      params[paramWaterPreset] = 4;
      params[paramWaterLayerMix + 0] = 0;
      params[paramWaterLayerMix + 1] = 0;
      params[paramWaterLayerMix + 2] = 0;
      params[paramWaterLayerMix + 3] = 0;
      params[paramWaterLayerMix + 4] = 1;
      params[paramWaterLayerMix + 5] = 0;
      params[paramOutputSelect] = 0;
    }),
    blocks: 384,
  },
  {
    name: 'nature-texture-surrogate',
    params: withParams((params) => {
      params[paramInsectsActive] = 1;
      params[paramInsectsEngine] = 6;
      params[paramInsectsParams + 0] = 0.62;
      params[paramInsectsParams + 1] = 0.62;
      params[paramInsects2Active] = 1;
      params[paramInsects2Engine] = 5;
      params[paramInsects2Params + 0] = 0.58;
      params[paramInsects2Params + 1] = 0.58;
      params[paramOutputSelect] = 3;
    }),
    blocks: 256,
  },
  {
    name: 'mixed-water-insects',
    params: withParams((params) => {
      setWaterfall(params);
      params[paramInsectsActive] = 1;
      params[paramInsectsEngine] = 0;
      params[paramInsects2Active] = 1;
      params[paramInsects2Engine] = 1;
      params[paramOutputSelect] = 3;
    }),
    blocks: 384,
  },
];

const results = [];
for (const testCase of cases) {
  const standalone = await renderStandalone(testCase.params, testCase.blocks);
  const core = await renderCoreModule(testCase.params, testCase.blocks);
  const residual = diffStats(standalone.output, core.output);
  assert(
    residual.rms <= 1.0e-7 && residual.peak <= 1.0e-6,
    `${testCase.name} soundscapes module parity drift too high: RMS ${residual.rms}, peak ${residual.peak}`,
  );
  assert(residual.signalPeak > 1.0e-5, `${testCase.name} produced no soundscapes signal`);
  assert(
    standalone.finalActiveCount === core.finalActiveCount,
    `${testCase.name} active count mismatch: standalone ${standalone.finalActiveCount}, core ${core.finalActiveCount}`,
  );
  results.push(
    `${testCase.name}: RMS ${residual.rms.toExponential(3)}, peak ${residual.peak.toExponential(3)}`,
  );
}

console.log(`KesshoCore soundscapes module parity passed: ${results.join('; ')}`);
