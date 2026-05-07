import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const standaloneWasmPath = resolve(root, 'public/worklets/kessho_granular.wasm');
const coreWasmPath = resolve(root, 'public/worklets/kessho_core.wasm');
const sampleRate = 48000;
const blockSize = 128;
const moduleTypeGranular = 4;

const numVoices = 4;
const maxScaleIntervals = 12;
const maxChordPitches = 7;
const modeClean = 0;
const modeGranular = 1;
const modeLegacy = 2;
const pitchHarmonic = 1;
const grainShapeTriangle = 0;

const globalParamCount = 10;
const voiceParamCount = 25;
const voiceParamStart = globalParamCount;
const scaleCountParam = voiceParamStart + numVoices * voiceParamCount;
const scaleIntervalsParam = scaleCountParam + 1;
const chordCountParam = scaleIntervalsParam + maxScaleIntervals;
const chordPitchesParam = chordCountParam + 1;
const chordBiasParam = chordPitchesParam + maxChordPitches;
const legacyParamStart = chordBiasParam + 1;
const paramCount = legacyParamStart + 6;

const paramEnabled = 0;
const paramFreeze = 1;
const paramFreezeWithFeedback = 2;
const paramDryWet = 3;
const paramFeedback = 4;
const paramFeedbackLpf = 5;
const paramBufferSeconds = 6;
const paramGrainShape = 7;
const paramBusDiffusion = 8;
const paramTimingRandomness = 9;

const voiceEnabled = 0;
const voiceMode = 1;
const voiceSlice = 2;
const voiceSpeed = 3;
const voiceScanRate = 4;
const voiceReverse = 5;
const voicePitch = 6;
const voiceWriteFollow = 7;
const voiceDensity = 8;
const voiceGrainSize = 9;
const voiceSpray = 10;
const voiceGrainOct = 11;
const voiceAttack = 12;
const voiceDecay = 13;
const voiceGain = 14;
const voicePan = 15;
const voiceBlur = 16;
const voiceStereoSpread = 17;
const voicePosLfoRate = 18;
const voicePosLfoDepth = 19;
const voicePanLfoRate = 20;
const voiceReverseLfoRate = 21;
const voiceRecordLfoRate = 22;
const voiceEuclidGated = 23;
const voiceEuclidMuted = 24;

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

function voiceBase(voice) {
  return voiceParamStart + voice * voiceParamCount;
}

function makeDefaultParams() {
  const params = new Float32Array(paramCount);
  params[paramEnabled] = 1;
  params[paramFreeze] = 0;
  params[paramFreezeWithFeedback] = 0;
  params[paramDryWet] = 0.3;
  params[paramFeedback] = 0.1;
  params[paramFeedbackLpf] = 8000;
  params[paramBufferSeconds] = 16;
  params[paramGrainShape] = grainShapeTriangle;
  params[paramBusDiffusion] = 0;
  params[paramTimingRandomness] = 0.35;

  for (let voice = 0; voice < numVoices; voice += 1) {
    const base = voiceBase(voice);
    params[base + voiceEnabled] = voice === 0 ? 1 : 0;
    params[base + voiceMode] = modeGranular;
    params[base + voiceSlice] = voice * 4;
    params[base + voiceSpeed] = 1;
    params[base + voiceScanRate] = 1;
    params[base + voiceReverse] = 0;
    params[base + voicePitch] = 0;
    params[base + voiceWriteFollow] = 0;
    params[base + voiceDensity] = 20;
    params[base + voiceGrainSize] = 80;
    params[base + voiceSpray] = 0.3;
    params[base + voiceGrainOct] = 0;
    params[base + voiceAttack] = 0.003;
    params[base + voiceDecay] = 0.5;
    params[base + voiceGain] = 0.5;
    params[base + voicePan] = 0;
    params[base + voiceBlur] = 0;
    params[base + voiceStereoSpread] = 0.5;
    params[base + voicePosLfoRate] = 0;
    params[base + voicePosLfoDepth] = 0;
    params[base + voicePanLfoRate] = 0;
    params[base + voiceReverseLfoRate] = 0;
    params[base + voiceRecordLfoRate] = 0;
    params[base + voiceEuclidGated] = 0;
    params[base + voiceEuclidMuted] = 0;
  }

  params[scaleCountParam] = 0;
  params[chordCountParam] = 0;
  params[chordBiasParam] = 0;
  params[legacyParamStart] = 10;
  params[legacyParamStart + 1] = 0.8;
  params[legacyParamStart + 2] = pitchHarmonic;
  params[legacyParamStart + 3] = 2;
  params[legacyParamStart + 4] = 64;
  params[legacyParamStart + 5] = 0.1;
  return params;
}

function withParams(configure) {
  const params = makeDefaultParams();
  configure(params);
  return params;
}

function setVoice(params, voice, values) {
  const base = voiceBase(voice);
  for (const [offset, value] of Object.entries(values)) {
    params[base + Number(offset)] = value;
  }
}

function setScale(params, intervals) {
  params[scaleCountParam] = Math.min(intervals.length, maxScaleIntervals);
  for (let i = 0; i < Math.min(intervals.length, maxScaleIntervals); i += 1) {
    params[scaleIntervalsParam + i] = intervals[i];
  }
}

function setChord(params, pitches, bias) {
  params[chordCountParam] = Math.min(pitches.length, maxChordPitches);
  for (let i = 0; i < Math.min(pitches.length, maxChordPitches); i += 1) {
    params[chordPitchesParam + i] = pitches[i];
  }
  params[chordBiasParam] = bias;
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

function writeStandaloneIntArray(exports, values) {
  if (values.length === 0) {
    return 0;
  }
  const malloc = requireExport(exports, 'malloc');
  const ptr = malloc(values.length * Int32Array.BYTES_PER_ELEMENT);
  assert(ptr !== 0, 'standalone granular integer array allocation failed');
  const heap = new Int32Array(exports.memory.buffer);
  heap.set(values, ptr >> 2);
  return ptr;
}

function collectRoundedParams(params, start, count) {
  const values = [];
  for (let i = 0; i < count; i += 1) {
    values.push(Math.round(params[start + i]));
  }
  return values;
}

function applyStandaloneParams(exports, params) {
  const free = requireExport(exports, 'free');

  requireExport(exports, 'granular_set_enabled')(params[paramEnabled] > 0.5 ? 1 : 0);
  requireExport(exports, 'granular_set_freeze')(
    params[paramFreeze] > 0.5 ? 1 : 0,
    params[paramFreezeWithFeedback] > 0.5 ? 1 : 0,
  );
  requireExport(exports, 'granular_set_dry_wet')(params[paramDryWet]);
  requireExport(exports, 'granular_set_feedback')(params[paramFeedback], params[paramFeedbackLpf]);
  requireExport(exports, 'granular_set_buffer_size')(params[paramBufferSeconds]);
  requireExport(exports, 'granular_set_grain_shape')(Math.round(params[paramGrainShape]));
  requireExport(exports, 'granular_set_bus_diffusion')(params[paramBusDiffusion]);
  requireExport(exports, 'granular_set_timing_randomness')(params[paramTimingRandomness]);

  for (let voice = 0; voice < numVoices; voice += 1) {
    const base = voiceBase(voice);
    requireExport(exports, 'granular_set_voice_mode')(
      voice,
      params[base + voiceEnabled] > 0.5 ? 1 : 0,
      Math.round(params[base + voiceMode]),
    );
    requireExport(exports, 'granular_set_voice_position')(
      voice,
      Math.round(params[base + voiceSlice]),
      params[base + voiceSpeed],
      params[base + voiceScanRate],
      params[base + voiceReverse] > 0.5 ? 1 : 0,
      params[base + voicePitch],
      params[base + voiceWriteFollow],
    );
    requireExport(exports, 'granular_set_voice_grain')(
      voice,
      params[base + voiceDensity],
      params[base + voiceGrainSize],
      params[base + voiceSpray],
      params[base + voiceGrainOct],
      params[base + voiceAttack],
      params[base + voiceDecay],
    );
    requireExport(exports, 'granular_set_voice_output')(
      voice,
      params[base + voiceGain],
      params[base + voicePan],
      params[base + voiceBlur],
      params[base + voiceStereoSpread],
    );
    requireExport(exports, 'granular_set_voice_lfo')(
      voice,
      params[base + voicePosLfoRate],
      params[base + voicePosLfoDepth],
      params[base + voicePanLfoRate],
      params[base + voiceReverseLfoRate],
      params[base + voiceRecordLfoRate],
    );
    requireExport(exports, 'granular_set_voice_euclid_gated')(
      voice,
      params[base + voiceEuclidGated] > 0.5 ? 1 : 0,
    );
    requireExport(exports, 'granular_set_voice_euclid_muted')(
      voice,
      params[base + voiceEuclidMuted] > 0.5 ? 1 : 0,
    );
  }

  const scaleCount = Math.max(0, Math.min(Math.round(params[scaleCountParam]), maxScaleIntervals));
  const scaleValues = collectRoundedParams(params, scaleIntervalsParam, scaleCount);
  const scalePtr = writeStandaloneIntArray(exports, scaleValues);
  requireExport(exports, 'granular_set_scale')(scalePtr, scaleCount);
  if (scalePtr !== 0) free(scalePtr);

  const chordCount = Math.max(0, Math.min(Math.round(params[chordCountParam]), maxChordPitches));
  const chordValues = collectRoundedParams(params, chordPitchesParam, chordCount);
  const chordPtr = writeStandaloneIntArray(exports, chordValues);
  requireExport(exports, 'granular_set_chord_bias')(chordPtr, chordCount, params[chordBiasParam]);
  if (chordPtr !== 0) free(chordPtr);

  requireExport(exports, 'granular_set_legacy_params')(
    params[legacyParamStart],
    params[legacyParamStart + 1],
    Math.round(params[legacyParamStart + 2]),
    params[legacyParamStart + 3],
    Math.round(params[legacyParamStart + 4]),
    params[legacyParamStart + 5],
  );
}

async function renderStandalone(params, input, blocks) {
  const { exports } = await instantiateWasm(standaloneWasmPath);
  const init = requireExport(exports, 'granular_init');
  const getInputPtr = requireExport(exports, 'granular_get_input_ptr');
  const getOutputPtr = requireExport(exports, 'granular_get_output_ptr');
  const processBlock = requireExport(exports, 'granular_process_block');
  const destroy = requireExport(exports, 'granular_destroy');

  assert(init(sampleRate, params[paramBufferSeconds]) === 0, 'standalone granular init failed');
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

  const module = moduleCreate(moduleTypeGranular, sampleRate, blockSize);
  assert(module !== 0, 'core granular module setup failed');
  assert(moduleGetParamCount(module) === paramCount, 'core granular param count mismatch');

  let heap = new Float32Array(exports.memory.buffer);
  heap.set(params, moduleGetParamsPtr(module) >> 2);
  moduleCommitParams(module);

  const inputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  const outputPtr = malloc(blockSize * 2 * Float32Array.BYTES_PER_ELEMENT);
  assert(inputPtr !== 0 && outputPtr !== 0, 'core granular module allocation failed');
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
      'core granular module process failed',
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

const cases = [
  {
    name: 'disabled-passthrough',
    params: withParams((params) => {
      params[paramEnabled] = 0;
      params[paramDryWet] = 1;
      params[paramFeedback] = 0;
    }),
    blocks: 12,
    passthrough: true,
    input: generateInput(12, (block, i) => {
      const t = (block * blockSize + i) / sampleRate;
      return [
        Math.sin(2 * Math.PI * 137 * t) * 0.31,
        Math.sin(2 * Math.PI * 251 * t) * 0.21,
      ];
    }),
  },
  {
    name: 'clean-voice-follow',
    params: withParams((params) => {
      params[paramDryWet] = 1;
      params[paramFeedback] = 0;
      params[paramTimingRandomness] = 0;
      setVoice(params, 0, {
        [voiceMode]: modeClean,
        [voiceGain]: 1,
        [voiceWriteFollow]: 1,
        [voiceStereoSpread]: 0,
      });
    }),
    blocks: 48,
    input: generateInput(48, (block, i) => {
      const t = (block * blockSize + i) / sampleRate;
      const tone = Math.sin(2 * Math.PI * 196 * t) * 0.2 + Math.sin(2 * Math.PI * 392 * t) * 0.08;
      return [tone, tone * 0.72];
    }),
  },
  {
    name: 'granular-cloud',
    params: withParams((params) => {
      params[paramDryWet] = 1;
      params[paramFeedback] = 0;
      params[paramBusDiffusion] = 0.18;
      params[paramTimingRandomness] = 0.22;
      setScale(params, [0, 2, 3, 5, 7, 8, 10]);
      setChord(params, [0, 3, 7], 0.4);
      setVoice(params, 0, {
        [voiceMode]: modeGranular,
        [voiceDensity]: 38,
        [voiceGrainSize]: 72,
        [voiceSpray]: 0.24,
        [voiceGrainOct]: 0.08,
        [voicePitch]: 5.5,
        [voiceGain]: 0.9,
        [voicePan]: -0.2,
        [voiceBlur]: 0.16,
        [voiceStereoSpread]: 0.4,
      });
      setVoice(params, 1, {
        [voiceEnabled]: 1,
        [voiceMode]: modeGranular,
        [voiceSlice]: 6,
        [voiceDensity]: 24,
        [voiceGrainSize]: 105,
        [voiceSpray]: 0.18,
        [voicePitch]: -7,
        [voiceGain]: 0.58,
        [voicePan]: 0.34,
        [voiceBlur]: 0.1,
        [voiceStereoSpread]: 0.5,
      });
    }),
    blocks: 96,
    input: generateInput(96, (block, i) => {
      if (block > 42) return [0, 0];
      const t = (block * blockSize + i) / sampleRate;
      const left = Math.sin(2 * Math.PI * 110 * t) * 0.18 + Math.sin(2 * Math.PI * 330 * t) * 0.06;
      const right = Math.sin(2 * Math.PI * 165 * t) * 0.14 + Math.sin(2 * Math.PI * 495 * t) * 0.04;
      return [left, right];
    }),
  },
  {
    name: 'legacy-grains',
    params: withParams((params) => {
      params[paramDryWet] = 1;
      params[paramFeedback] = 0;
      params[paramTimingRandomness] = 0.1;
      setVoice(params, 0, {
        [voiceMode]: modeLegacy,
        [voiceDensity]: 28,
        [voiceGrainSize]: 60,
        [voiceSpray]: 0.16,
        [voiceGain]: 0.85,
        [voiceStereoSpread]: 0.25,
      });
      params[legacyParamStart] = 6;
      params[legacyParamStart + 1] = 0.7;
      params[legacyParamStart + 2] = pitchHarmonic;
      params[legacyParamStart + 3] = 3;
      params[legacyParamStart + 4] = 64;
      params[legacyParamStart + 5] = 0;
    }),
    blocks: 96,
    input: generateInput(96, (block, i) => {
      if (block > 36) return [0, 0];
      const t = (block * blockSize + i) / sampleRate;
      const impulse = i === 0 && block % 8 === 0 ? 0.25 : 0;
      return [
        impulse + Math.sin(2 * Math.PI * 247 * t) * 0.12,
        impulse * 0.6 + Math.sin(2 * Math.PI * 311 * t) * 0.1,
      ];
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
    `${testCase.name} granular module parity drift too high: RMS ${residual.rms}, peak ${residual.peak}`,
  );
  assert(residual.signalPeak > 1.0e-5, `${testCase.name} produced no granular signal`);
  if (testCase.passthrough) {
    assertPassthrough(standalone, testCase.input, `${testCase.name} standalone`);
    assertPassthrough(core, testCase.input, `${testCase.name} core`);
  }
  results.push(
    `${testCase.name}: RMS ${residual.rms.toExponential(3)}, peak ${residual.peak.toExponential(3)}`,
  );
}

console.log(`KesshoCore granular module parity passed: ${results.join('; ')}`);
