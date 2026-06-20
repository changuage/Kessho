import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { generatedProductParamIndex } from './CoreProductGeneratedParamMetadata';
import {
  CORE_PRODUCT_SOURCE_IDS,
  createCoreProductDrumTriggerEvent,
  createCoreProductSourceOverrideCommitEvent,
  createCoreProductSourceOverrideSlotEvent,
  type CoreProductEvent,
} from './coreProductEvents';
import {
  KESSHO_PRODUCT_DRUM_PARAM_SPECS,
  KESSHO_PRODUCT_DRUM_VOICE_PRESETS,
} from './generated/kesshoProductSchema';

const SAMPLE_RATE = 48000;
const FRAMES_PER_BLOCK = 128;
const RENDER_BLOCKS = 128;
const EVENT_BYTES = 40;
const MIN_RENDER_RMS = 0.00001;
const MIN_CLICK_PRESET_RMS = 0.001;
const MIN_CLICK_PRESET_PEAK = 0.05;
const MIN_METAL_FM_PRESET_DIFF = 0.02;
const MIN_ENGINE_DISTANCE = 0.08;
const MIN_SLIDER_NORMALIZED_DIFF = 0.04;

type WasmFn = (...args: number[]) => number;
type RenderedDrum = {
  voice: string;
  samples: Float32Array;
  stats: SonicStats;
};
type SonicStats = {
  rms: number;
  peak: number;
  derivativeRms: number;
  zeroCrossingRate: number;
  envelopeCentroid: number;
  attackFrame: number;
  tailRatio: number;
};
type WaveformDifference = {
  normalizedRms: number;
  correlation: number;
};

const drumVoices = [
  { name: 'sub', index: 0 },
  { name: 'kick', index: 1 },
  { name: 'click', index: 2 },
  { name: 'beepHi', index: 3 },
  { name: 'beepLo', index: 4 },
  { name: 'noise', index: 5 },
  { name: 'membrane', index: 6 },
] as const;

const sliderCases = [
  { voice: 'sub', voiceIndex: 0, paramKey: 'drumSubFreq', low: 30, high: 95 },
  { voice: 'kick', voiceIndex: 1, paramKey: 'drumKickFreq', low: 35, high: 115 },
  { voice: 'click', voiceIndex: 2, paramKey: 'drumClickDecay', low: 2, high: 120 },
  { voice: 'beepHi', voiceIndex: 3, paramKey: 'drumBeepHiFreq', low: 300, high: 10000 },
  { voice: 'beepLo', voiceIndex: 4, paramKey: 'drumBeepLoFreq', low: 60, high: 700 },
  { voice: 'noise', voiceIndex: 5, paramKey: 'drumNoiseFilterFreq', low: 250, high: 18000 },
  { voice: 'membrane', voiceIndex: 6, paramKey: 'drumMembraneSize', low: 60, high: 440 },
] as const;

const wasmPath = resolve(process.cwd(), 'public/worklets/kessho_core.wasm');
assert.ok(existsSync(wasmPath), 'Missing public/worklets/kessho_core.wasm; run npm run core:build:wasm first.');

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
const exportedMemory = wasm.memory;
assert.ok(exportedMemory instanceof WebAssembly.Memory, 'WASM product module did not export memory');
const memory = exportedMemory;

function resolveExport(name: string): WasmFn {
  const exported = wasm[name] ?? wasm[`_${name}`];
  assert.equal(typeof exported, 'function', `Missing WASM export: ${name}`);
  return exported as WasmFn;
}

const malloc = resolveExport('malloc');
const free = resolveExport('free');
const create = resolveExport('kessho_product_create');
const destroy = resolveExport('kessho_product_destroy');
const reset = resolveExport('kessho_product_reset');
const enqueueEvent = resolveExport('kessho_product_enqueue_event');
const render = resolveExport('kessho_product_render');

const leftPtr = malloc(FRAMES_PER_BLOCK * Float32Array.BYTES_PER_ELEMENT);
const rightPtr = malloc(FRAMES_PER_BLOCK * Float32Array.BYTES_PER_ELEMENT);
const eventPtr = malloc(EVENT_BYTES);
const engine = create(SAMPLE_RATE, FRAMES_PER_BLOCK, 0);
assert.ok(leftPtr && rightPtr && eventPtr && engine, 'WASM product drum sonic test allocation failed');

let view = new DataView(memory.buffer);
let heap = new Float32Array(memory.buffer);

function refreshMemoryViews(): void {
  if (view.buffer === memory.buffer) return;
  view = new DataView(memory.buffer);
  heap = new Float32Array(memory.buffer);
}

function writeEvent(event: CoreProductEvent): void {
  refreshMemoryViews();
  view.setUint32(eventPtr, event.sampleOffset ?? 0, true);
  view.setUint32(eventPtr + 4, event.eventKind, true);
  view.setUint32(eventPtr + 8, event.targetId ?? 0, true);
  view.setUint32(eventPtr + 12, event.index ?? 0, true);
  view.setUint32(eventPtr + 16, event.paramId ?? 0, true);
  view.setFloat32(eventPtr + 20, event.value ?? 0, true);
  view.setFloat32(eventPtr + 24, event.value2 ?? 0, true);
  view.setFloat32(eventPtr + 28, event.value3 ?? 0, true);
  view.setFloat32(eventPtr + 32, event.value4 ?? 0, true);
  view.setUint32(eventPtr + 36, (event.flags ?? 0) >>> 0, true);
}

function enqueueProductEvent(event: CoreProductEvent, message: string): void {
  writeEvent(event);
  assert.equal(enqueueEvent(engine, eventPtr), 1, message);
}

function drumParamIndex(paramKey: string): number {
  return generatedProductParamIndex(KESSHO_PRODUCT_DRUM_PARAM_SPECS, paramKey);
}

function drumOverrideEvents(paramKey: string, value: number): CoreProductEvent[] {
  return [
    createCoreProductSourceOverrideSlotEvent(CORE_PRODUCT_SOURCE_IDS.drum, 0, drumParamIndex(paramKey), value),
    createCoreProductSourceOverrideCommitEvent(CORE_PRODUCT_SOURCE_IDS.drum, 1),
  ];
}

type ProductDrumVoicePreset = (typeof KESSHO_PRODUCT_DRUM_VOICE_PRESETS)[number];

function drumPresetVectorOverrideEvents(params: readonly number[]): CoreProductEvent[] {
  const events = params.map((value, index) => (
    createCoreProductSourceOverrideSlotEvent(CORE_PRODUCT_SOURCE_IDS.drum, index, index, value)
  ));
  events.push(createCoreProductSourceOverrideCommitEvent(CORE_PRODUCT_SOURCE_IDS.drum, params.length));
  return events;
}

function drumPresetOverrideEvents(preset: ProductDrumVoicePreset): CoreProductEvent[] {
  return drumPresetVectorOverrideEvents(preset.params);
}

function drumPresetParamOverrideEvents(
  preset: ProductDrumVoicePreset,
  paramKey: string,
  value: number,
): CoreProductEvent[] {
  const params: number[] = [...preset.params];
  params[drumParamIndex(paramKey)] = value;
  return drumPresetVectorOverrideEvents(params);
}

function renderDrumVoice(voiceIndex: number, setupEvents: readonly CoreProductEvent[] = []): Float32Array {
  reset(engine);
  for (const event of setupEvents) {
    enqueueProductEvent(event, `WASM product drum setup event failed for voice ${voiceIndex}`);
  }
  enqueueProductEvent(
    createCoreProductDrumTriggerEvent(voiceIndex, 0.92),
    `WASM product drum trigger enqueue failed for voice ${voiceIndex}`,
  );

  const samples = new Float32Array(RENDER_BLOCKS * FRAMES_PER_BLOCK);
  for (let block = 0; block < RENDER_BLOCKS; block += 1) {
    render(engine, leftPtr, rightPtr, FRAMES_PER_BLOCK);
    refreshMemoryViews();
    const leftOffset = leftPtr >> 2;
    const rightOffset = rightPtr >> 2;
    const sampleOffset = block * FRAMES_PER_BLOCK;
    for (let index = 0; index < FRAMES_PER_BLOCK; index += 1) {
      const left = heap[leftOffset + index] ?? 0;
      const right = heap[rightOffset + index] ?? 0;
      assert.ok(Number.isFinite(left) && Number.isFinite(right), 'WASM product drum render produced non-finite output');
      samples[sampleOffset + index] = (left + right) * 0.5;
    }
  }
  return samples;
}

function analyze(samples: Float32Array): SonicStats {
  let sumSquares = 0;
  let derivativeSquares = 0;
  let absSum = 0;
  let weightedAbsSum = 0;
  let peak = 0;
  let attackFrame = 0;
  let zeroCrossings = 0;
  let previous = samples[0] ?? 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    const abs = Math.abs(sample);
    sumSquares += sample * sample;
    absSum += abs;
    weightedAbsSum += abs * index;
    if (abs > peak) {
      peak = abs;
      attackFrame = index;
    }
    if (index > 0) {
      const derivative = sample - previous;
      derivativeSquares += derivative * derivative;
      if (Math.abs(sample) > 0.000001 && Math.abs(previous) > 0.000001 && Math.sign(sample) !== Math.sign(previous)) {
        zeroCrossings += 1;
      }
    }
    previous = sample;
  }
  const tailStart = Math.floor(samples.length * 0.65);
  let tailSquares = 0;
  for (let index = tailStart; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    tailSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  const tailRms = Math.sqrt(tailSquares / Math.max(1, samples.length - tailStart));
  return {
    rms,
    peak,
    derivativeRms: Math.sqrt(derivativeSquares / Math.max(1, samples.length - 1)),
    zeroCrossingRate: zeroCrossings / Math.max(1, samples.length - 1),
    envelopeCentroid: absSum > 0 ? weightedAbsSum / (absSum * samples.length) : 0,
    attackFrame,
    tailRatio: tailRms / Math.max(rms, 0.000000001),
  };
}

function waveformDifference(a: Float32Array, b: Float32Array): WaveformDifference {
  const count = Math.min(a.length, b.length);
  let diffSquares = 0;
  let aSquares = 0;
  let bSquares = 0;
  let dot = 0;
  for (let index = 0; index < count; index += 1) {
    const sampleA = a[index] ?? 0;
    const sampleB = b[index] ?? 0;
    const diff = sampleA - sampleB;
    diffSquares += diff * diff;
    aSquares += sampleA * sampleA;
    bSquares += sampleB * sampleB;
    dot += sampleA * sampleB;
  }
  const rmsDiff = Math.sqrt(diffSquares / Math.max(1, count));
  const aRms = Math.sqrt(aSquares / Math.max(1, count));
  const bRms = Math.sqrt(bSquares / Math.max(1, count));
  const correlationDenominator = Math.sqrt(aSquares * bSquares);
  return {
    normalizedRms: rmsDiff / Math.max(aRms, bRms, 0.000000001),
    correlation: correlationDenominator > 0 ? dot / correlationDenominator : 0,
  };
}

function sonicDistance(a: RenderedDrum, b: RenderedDrum): number {
  const difference = waveformDifference(a.samples, b.samples);
  const statsA = a.stats;
  const statsB = b.stats;
  return difference.normalizedRms * 0.65
    + (1 - Math.abs(difference.correlation)) * 0.35
    + Math.abs(Math.log((statsA.derivativeRms + 0.000000001) / (statsB.derivativeRms + 0.000000001))) * 0.08
    + Math.abs(statsA.zeroCrossingRate - statsB.zeroCrossingRate) * 1.5
    + Math.abs(statsA.envelopeCentroid - statsB.envelopeCentroid) * 0.25
    + Math.abs(statsA.tailRatio - statsB.tailRatio) * 0.05;
}

function statsSummary(stats: SonicStats): string {
  return `rms=${stats.rms.toFixed(6)} peak=${stats.peak.toFixed(6)} zcr=${stats.zeroCrossingRate.toFixed(4)} deriv=${stats.derivativeRms.toFixed(6)}`;
}

try {
  const repeatedA = renderDrumVoice(1);
  const repeatedB = renderDrumVoice(1);
  const repeatDifference = waveformDifference(repeatedA, repeatedB);
  assert.ok(
    repeatDifference.normalizedRms < 0.000001,
    `WASM product drum render should be deterministic for identical kick triggers; normalized diff=${repeatDifference.normalizedRms}`,
  );

  const renderedVoices: RenderedDrum[] = drumVoices.map((voice) => {
    const samples = renderDrumVoice(voice.index);
    const stats = analyze(samples);
    assert.ok(
      stats.rms > MIN_RENDER_RMS,
      `${voice.name} drum trigger rendered too quiet to validate sonic routing: ${statsSummary(stats)}`,
    );
    return { voice: voice.name, samples, stats };
  });

  for (let leftIndex = 0; leftIndex < renderedVoices.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < renderedVoices.length; rightIndex += 1) {
      const left = renderedVoices[leftIndex]!;
      const right = renderedVoices[rightIndex]!;
      const distance = sonicDistance(left, right);
      assert.ok(
        distance > MIN_ENGINE_DISTANCE,
        `${left.voice} and ${right.voice} drum triggers rendered too similarly; distance=${distance.toFixed(5)} ${left.voice}(${statsSummary(left.stats)}) ${right.voice}(${statsSummary(right.stats)})`,
      );
    }
  }

  for (const sliderCase of sliderCases) {
    const lowSamples = renderDrumVoice(sliderCase.voiceIndex, drumOverrideEvents(sliderCase.paramKey, sliderCase.low));
    const highSamples = renderDrumVoice(sliderCase.voiceIndex, drumOverrideEvents(sliderCase.paramKey, sliderCase.high));
    const lowStats = analyze(lowSamples);
    const highStats = analyze(highSamples);
    const difference = waveformDifference(lowSamples, highSamples);
    assert.ok(
      lowStats.rms > MIN_RENDER_RMS && highStats.rms > MIN_RENDER_RMS,
      `${sliderCase.voice} slider validation rendered too quiet: low(${statsSummary(lowStats)}) high(${statsSummary(highStats)})`,
    );
    assert.ok(
      difference.normalizedRms > MIN_SLIDER_NORMALIZED_DIFF,
      `${sliderCase.paramKey} did not produce a meaningful sonic change for ${sliderCase.voice}; normalized diff=${difference.normalizedRms.toFixed(5)} correlation=${difference.correlation.toFixed(5)} low(${statsSummary(lowStats)}) high(${statsSummary(highStats)})`,
    );
  }

  const clickModeIndex = drumParamIndex('drumClickMode');
  const granularClickPresets = KESSHO_PRODUCT_DRUM_VOICE_PRESETS.filter((preset) => (
    preset.voice === 'click' && preset.params[clickModeIndex] === 3
  ));
  assert.ok(
    granularClickPresets.some((preset) => preset.name === 'Seed Pod') &&
      granularClickPresets.some((preset) => preset.name === 'Wood Dex Tick'),
    'Granular click preset regression must include Seed Pod and Wood Dex Tick',
  );
  for (const preset of granularClickPresets) {
    const samples = renderDrumVoice(2, drumPresetOverrideEvents(preset));
    const stats = analyze(samples);
    assert.ok(
      stats.rms > MIN_CLICK_PRESET_RMS && stats.peak > MIN_CLICK_PRESET_PEAK,
      `${preset.name} granular click preset rendered too quiet: ${statsSummary(stats)}`,
    );
  }

  const metalPreset = KESSHO_PRODUCT_DRUM_VOICE_PRESETS.find((preset) => (
    preset.voice === 'beepHi' && preset.name === 'Metallic'
  ));
  assert.ok(metalPreset, 'Metal FM regression requires the Metallic beepHi preset');
  const metalFmCases = [
    { key: 'drumBeepHiTone', low: 0, high: 1.5 },
    { key: 'drumBeepHiModRatio', low: 0.5, high: 12 },
    { key: 'drumBeepHiModRatioFine', low: -0.5, high: 0.5 },
    { key: 'drumBeepHiModPhase', low: 0, high: 1 },
    { key: 'drumBeepHiFeedback', low: -1, high: 1 },
    { key: 'drumBeepHiModEnvDecay', low: 0, high: 1 },
    { key: 'drumBeepHiModEnvEnd', low: 0, high: 1 },
    { key: 'drumBeepHiNoiseInMod', low: 0, high: 1 },
    { key: 'drumBeepHiNoiseDecay', low: 0, high: 1 },
  ] as const;
  for (const fmCase of metalFmCases) {
    const lowSamples = renderDrumVoice(3, drumPresetParamOverrideEvents(metalPreset, fmCase.key, fmCase.low));
    const highSamples = renderDrumVoice(3, drumPresetParamOverrideEvents(metalPreset, fmCase.key, fmCase.high));
    const lowStats = analyze(lowSamples);
    const highStats = analyze(highSamples);
    const difference = waveformDifference(lowSamples, highSamples);
    assert.ok(
      lowStats.rms > MIN_RENDER_RMS && highStats.rms > MIN_RENDER_RMS,
      `${fmCase.key} Metal preset validation rendered too quiet: low(${statsSummary(lowStats)}) high(${statsSummary(highStats)})`,
    );
    assert.ok(
      difference.normalizedRms > MIN_METAL_FM_PRESET_DIFF,
      `${fmCase.key} did not produce a meaningful sonic change in the Metallic preset; normalized diff=${difference.normalizedRms.toFixed(5)} correlation=${difference.correlation.toFixed(5)} low(${statsSummary(lowStats)}) high(${statsSummary(highStats)})`,
    );
  }
} finally {
  destroy(engine);
  free(eventPtr);
  free(rightPtr);
  free(leftPtr);
}
