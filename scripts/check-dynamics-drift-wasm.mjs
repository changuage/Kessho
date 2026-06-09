import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const wasmPath = resolve(root, 'public/worklets/kessho_dynamics_drift.wasm');
const workletPath = resolve(root, 'public/worklets/dynamics-drift.worklet.js');

const workletSource = readFileSync(workletPath, 'utf8');
const orderMatch = workletSource.match(/const PARAM_ORDER = \[([\s\S]*?)\];/);
if (!orderMatch) throw new Error('Could not read PARAM_ORDER from dynamics-drift.worklet.js');
const paramOrder = [...orderMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);

const wasmBinary = readFileSync(wasmPath);
const module = await WebAssembly.compile(wasmBinary);
const instance = await WebAssembly.instantiate(module, {
  wasi_snapshot_preview1: {
    fd_write: () => 0,
    fd_seek: () => 0,
    fd_close: () => 0,
    proc_exit: () => {},
    environ_get: () => 0,
    environ_sizes_get: () => 0,
    clock_time_get: () => 0,
  },
  env: {
    emscripten_notify_memory_growth: () => {},
  },
});

const wasm = instance.exports;
const sampleRate = 48000;
const blockSize = 128;

function init() {
  const result = wasm.dynamics_drift_init(sampleRate);
  if (result !== 0) throw new Error(`dynamics_drift_init failed: ${result}`);
}

function heapF32() {
  return new Float32Array(wasm.memory.buffer);
}

function writeParams(params) {
  const heap = heapF32();
  const offset = wasm.dynamics_drift_get_params_ptr() >> 2;
  for (let i = 0; i < paramOrder.length; i++) {
    heap[offset + i] = Number(params[paramOrder[i]] ?? 0);
  }
  wasm.dynamics_drift_commit_params();
}

function baseParams(overrides = {}) {
  return {
    active: 1,
    allpassActive: 1,
    dry: 0.58,
    wet: 0.42,
    erosionMix: 0,
    workletAlias: 0,
    rawErosionGeneration: 0,
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
    ...overrides,
  };
}

function processBlocks(params, fillInput, blocks = 80) {
  init();
  writeParams(params);
  const inputPtr = wasm.dynamics_drift_get_input_ptr() >> 2;
  const outputPtr = wasm.dynamics_drift_get_output_ptr() >> 2;
  const rendered = [];
  for (let block = 0; block < blocks; block++) {
    const heap = heapF32();
    for (let i = 0; i < blockSize; i++) {
      const [left, right] = fillInput(block, i);
      heap[inputPtr + i * 2] = left;
      heap[inputPtr + i * 2 + 1] = right;
    }
    wasm.dynamics_drift_process_block(blockSize);
    for (let i = 0; i < blockSize; i++) {
      rendered.push(heap[outputPtr + i * 2], heap[outputPtr + i * 2 + 1]);
    }
  }
  return rendered;
}

function stats(signal) {
  let sumSq = 0;
  let maxAbs = 0;
  let finite = true;
  for (const sample of signal) {
    finite = finite && Number.isFinite(sample);
    const abs = Math.abs(sample);
    maxAbs = Math.max(maxAbs, abs);
    sumSq += sample * sample;
  }
  return { finite, maxAbs, rms: Math.sqrt(sumSq / Math.max(1, signal.length)) };
}

function diffRms(a, b) {
  let sumSq = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const diff = a[i] - b[i];
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / Math.max(1, Math.min(a.length, b.length)));
}

function stereoRms(signal) {
  let sumSq = 0;
  let count = 0;
  for (let i = 0; i < signal.length; i += 2) {
    const diff = signal[i] - signal[i + 1];
    sumSq += diff * diff;
    count++;
  }
  return Math.sqrt(sumSq / Math.max(1, count));
}

function blockRms(signal, framesPerBlock = blockSize) {
  const values = [];
  const samplesPerBlock = framesPerBlock * 2;
  for (let offset = 0; offset < signal.length; offset += samplesPerBlock) {
    let sumSq = 0;
    let count = 0;
    for (let i = offset; i < Math.min(signal.length, offset + samplesPerBlock); i++) {
      sumSq += signal[i] * signal[i];
      count++;
    }
    values.push(Math.sqrt(sumSq / Math.max(1, count)));
  }
  return values;
}

function longestRun(values, predicate) {
  let current = 0;
  let longest = 0;
  for (const value of values) {
    current = predicate(value) ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const dryInput = [];
const bypass = processBlocks(
  baseParams({ active: 0, dry: 1, wet: 0 }),
  (_block, i) => {
    const sample = Math.sin((2 * Math.PI * 440 * dryInput.length) / sampleRate) * 0.2;
    dryInput.push(sample, sample);
    return [sample, sample];
  },
  8,
);
assert(diffRms(bypass, dryInput) < 1e-8, 'Bypass path is not effectively pass-through');

const impulse = processBlocks(
  baseParams(),
  (block, i) => (block === 0 && i === 0 ? [0.8, 0.8] : [0, 0]),
  120,
);
const impulseStats = stats(impulse);
const tail = impulse.slice(blockSize * 2);
assert(impulseStats.finite, 'Impulse render produced non-finite samples');
assert(impulseStats.maxAbs < 2, `Impulse render clipped unexpectedly: ${impulseStats.maxAbs}`);
assert(stats(tail).rms > 0.00001, 'Impulse render did not produce a Drift delay/filter tail');
assert(stereoRms(impulse) > 0.00001, 'Impulse render did not create measurable stereo spread');

const cleanInput = [];
const clean = processBlocks(
  baseParams(),
  (_block, i) => {
    const t = cleanInput.length / 2 / sampleRate;
    const sample = Math.sin(2 * Math.PI * 220 * t) * 0.18 + Math.sin(2 * Math.PI * 1760 * t) * 0.04;
    cleanInput.push(sample, sample);
    return [sample, sample];
  },
  80,
);
const cleanStats = stats(clean);
assert(cleanStats.finite, 'Clean Drift render produced non-finite samples');
assert(cleanStats.rms > 0.01 && cleanStats.rms < 0.6, `Clean Drift RMS is out of range: ${cleanStats.rms}`);
assert(diffRms(clean, cleanInput) > 0.001, 'Clean Drift render is too close to dry input');

const abyss = processBlocks(
  baseParams({
    dry: 0,
    wet: 1,
    shallowFlavor: 0,
    abyssFlavor: 1,
    depth: 0.72,
    rate: 0.38,
    stereo: 0.88,
    randomDrift: 0.92,
    randomHoldRateHz: 2.2,
    randomHoldLag: 1.55,
    randomDelayDepth: 0.00032,
    randomSpreadDelayDepth: 0.00046,
    randomFilterDepth: 300,
    randomSpreadFilterDepth: 210,
    lowpassHz: 760,
    lowpassStage2Hz: 720,
    lowpassQ: 2.1,
    lowpassStage2Q: 1.35,
    envToLowpassGain: 1200,
    envToResonanceGain: 0.55,
    envToWetGain: 0.12,
    dropoutDepth: 0,
    dropoutGain: 1,
  }),
  (block, i) => {
    const t = (block * blockSize + i) / sampleRate;
    const sample = Math.sin(2 * Math.PI * 196 * t) * 0.16 + Math.sin(2 * Math.PI * 588 * t) * 0.035;
    return [sample, sample];
  },
  520,
);
const abyssStats = stats(abyss);
const abyssBlocks = blockRms(abyss).slice(40);
const abyssMinBlockRms = Math.min(...abyssBlocks);
const abyssSilentRun = longestRun(abyssBlocks, (value) => value < 0.00012);
assert(abyssStats.finite, 'Abyss render produced non-finite samples');
assert(abyssStats.maxAbs < 2, `Abyss render clipped unexpectedly: ${abyssStats.maxAbs}`);
assert(abyssStats.rms > 0.006, `Abyss render collapsed to near silence: ${abyssStats.rms}`);
assert(abyssMinBlockRms > 0.00012, `Abyss wet path produced a near-silent block after warmup: ${abyssMinBlockRms}`);
assert(abyssSilentRun === 0, `Abyss wet path produced repeated near-silent blocks: ${abyssSilentRun}`);

const abyssSpreadOnlyParams = baseParams({
  dry: 0,
  wet: 1,
  shallowFlavor: 0,
  abyssFlavor: 1,
  depth: 0.52,
  rate: 0.34,
  stereo: 0.72,
  randomDrift: 0.84,
  randomHoldRateHz: 0.34,
  randomHoldLag: 1.1,
  randomDelayDepth: 0,
  randomSpreadDelayDepth: 0,
  randomFilterDepth: 0,
  randomSpreadFilterDepth: 0,
  randomDriftDepth: 0,
  wowDepth: 0,
  flutterDepth: 0,
  lowpassHz: 1200,
  lowpassStage2Hz: 1200,
  envToLowpassGain: 900,
  envToWetGain: 0,
  dropoutDepth: 0,
  dropoutGain: 1,
});
const abyssSpreadOnlyInput = (block, i) => {
  const t = (block * blockSize + i) / sampleRate;
  const sample = Math.sin(2 * Math.PI * 174 * t) * 0.14 + Math.sin(2 * Math.PI * 522 * t) * 0.03;
  return [sample, sample];
};
const abyssSpreadOnly = processBlocks(abyssSpreadOnlyParams, abyssSpreadOnlyInput, 180);
const abyssExtremeModulated = processBlocks({
  ...abyssSpreadOnlyParams,
  randomDelayDepth: 0.03,
  randomSpreadDelayDepth: 0.03,
  randomFilterDepth: 5000,
  randomSpreadFilterDepth: 5000,
  randomDriftDepth: 0.03,
  wowDepth: 0.03,
  flutterDepth: 0.03,
}, abyssSpreadOnlyInput, 180);
const abyssModDiff = diffRms(abyssSpreadOnly, abyssExtremeModulated);
assert(abyssModDiff > 0.01, `Abyss delay/filter/pitch CV destinations are still too subtle: ${abyssModDiff}`);

const harsh = processBlocks(
  baseParams({
    dry: 0.25,
    wet: 0.75,
    erosionMix: 0.9,
    workletAlias: 0.85,
    rawErosionGeneration: 0.72,
    rawCorrosion: 0.55,
    rawMediaWear: 0.88,
    saturation: 0.62,
    corrosion: 0.48,
    lowpassHz: 5200,
    lowpassStage2Hz: 4200,
  }),
  (_block, i) => {
    const t = i / sampleRate;
    return [
      Math.sin(2 * Math.PI * 900 * t) * 0.25 + Math.sin(2 * Math.PI * 9000 * t) * 0.08,
      Math.sin(2 * Math.PI * 900 * t) * 0.25 + Math.sin(2 * Math.PI * 9000 * t) * 0.08,
    ];
  },
  80,
);
const harshStats = stats(harsh);
assert(harshStats.finite, 'Harsh degrade render produced non-finite samples');
assert(harshStats.maxAbs < 2, `Harsh degrade clipped unexpectedly: ${harshStats.maxAbs}`);
assert(harshStats.rms > 0.005, 'Harsh degrade render collapsed to near silence');

console.log(JSON.stringify({
  ok: true,
  checks: {
    bypassDiffRms: diffRms(bypass, dryInput),
    impulse: impulseStats,
    impulseTailRms: stats(tail).rms,
    impulseStereoRms: stereoRms(impulse),
    clean: cleanStats,
    cleanDiffRms: diffRms(clean, cleanInput),
    abyss: {
      ...abyssStats,
      minBlockRms: abyssMinBlockRms,
      silentRun: abyssSilentRun,
      modulatedDelayFilterPitchDiffRms: abyssModDiff,
    },
    harsh: harshStats,
  },
}, null, 2));
