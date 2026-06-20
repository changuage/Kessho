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
import { DRUM_VOICE_ORDER, DRUM_VOICES, type DrumParamDef } from './drumVoiceConfig';
import { KESSHO_PRODUCT_DRUM_PARAM_SPECS } from './generated/kesshoProductSchema';
import {
  DEFAULT_STATE,
  decodeStateFromUrl,
  encodeStateToUrl,
  quantize,
  serializeState,
  type SliderState,
} from '../ui/state';

const SAMPLE_RATE = 48000;
const FRAMES_PER_BLOCK = 128;
const RENDER_BLOCKS = 160;
const EVENT_BYTES = 40;
const MIN_RENDER_RMS = 0.000005;
const MIN_VISIBLE_PARAM_DIFF = 0.006;
const MIN_GENERATED_PARAM_DIFF = 0.02;

type DrumVoice = (typeof DRUM_VOICE_ORDER)[number];
type WasmFn = (...args: number[]) => number;
type ParamValue = string | number | boolean;
type ParamRecord = Map<string, ParamValue>;
type AuditCase = {
  key: string;
  voice: DrumVoice;
  voiceIndex: number;
  low: ParamValue;
  high: ParamValue;
  setup?: Record<string, ParamValue>;
  generatedOnly?: boolean;
  minDiff?: number;
};
type AuditResult = AuditCase & {
  normalizedRms: number;
  correlation: number;
  lowRms: number;
  highRms: number;
};
type WaveformDifference = {
  normalizedRms: number;
  correlation: number;
};

const wasmPath = resolve(process.cwd(), 'public/worklets/kessho_core.wasm');
assert.ok(existsSync(wasmPath), 'Missing public/worklets/kessho_core.wasm; run npm run core:build:wasm first.');

const specByKey = new Map<string, (typeof KESSHO_PRODUCT_DRUM_PARAM_SPECS)[number]>(
  KESSHO_PRODUCT_DRUM_PARAM_SPECS.map((spec) => [spec.key, spec]),
);

const voicePrefixes = [
  { voice: 'sub', voiceIndex: 0, prefix: 'drumSub' },
  { voice: 'kick', voiceIndex: 1, prefix: 'drumKick' },
  { voice: 'click', voiceIndex: 2, prefix: 'drumClick' },
  { voice: 'beepHi', voiceIndex: 3, prefix: 'drumBeepHi' },
  { voice: 'beepLo', voiceIndex: 4, prefix: 'drumBeepLo' },
  { voice: 'noise', voiceIndex: 5, prefix: 'drumNoise' },
  { voice: 'membrane', voiceIndex: 6, prefix: 'drumMembrane' },
] as const;

const voiceParamDefs = new Map<DrumVoice, DrumParamDef[]>(
  DRUM_VOICE_ORDER.map((voice) => [voice, Object.values(DRUM_VOICES[voice].sections).flat()]),
);

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
assert.ok(leftPtr && rightPtr && eventPtr && engine, 'WASM product drum parameter audit allocation failed');

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

function paramValue(key: string, value: ParamValue): number {
  const spec = specByKey.get(key);
  assert.ok(spec, `No generated Product Core drum parameter for ${key}`);
  if (typeof value === 'string') {
    const enumMap = spec.enumMap as Record<string, number> | null;
    assert.ok(enumMap && Object.prototype.hasOwnProperty.call(enumMap, value), `${key} has no enum value ${value}`);
    return enumMap[value]!;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  assert.ok(Number.isFinite(value), `${key} value must be finite`);
  return value;
}

function overrideEvents(values: ParamRecord): CoreProductEvent[] {
  const events: CoreProductEvent[] = [];
  let slotIndex = 0;
  for (const [key, value] of values) {
    events.push(
      createCoreProductSourceOverrideSlotEvent(
        CORE_PRODUCT_SOURCE_IDS.drum,
        slotIndex,
        drumParamIndex(key),
        paramValue(key, value),
      ),
    );
    slotIndex += 1;
  }
  events.push(createCoreProductSourceOverrideCommitEvent(CORE_PRODUCT_SOURCE_IDS.drum, slotIndex));
  return events;
}

function defaultVoiceValues(voice: DrumVoice): ParamRecord {
  const values: ParamRecord = new Map();
  for (const def of voiceParamDefs.get(voice) ?? []) {
    if (!specByKey.has(def.key)) continue;
    const value = DEFAULT_STATE[def.key as keyof SliderState];
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      values.set(def.key, value);
    }
  }
  return values;
}

function caseEvents(auditCase: AuditCase, value: ParamValue): CoreProductEvent[] {
  const values = defaultVoiceValues(auditCase.voice);
  for (const [key, setupValue] of Object.entries(auditCase.setup ?? {})) {
    values.set(key, setupValue);
  }
  values.set(auditCase.key, value);
  return overrideEvents(values);
}

function renderDrumVoice(voiceIndex: number, setupEvents: readonly CoreProductEvent[]): Float32Array {
  reset(engine);
  for (const event of setupEvents) {
    enqueueProductEvent(event, `WASM product drum setup event failed for voice ${voiceIndex}`);
  }
  enqueueProductEvent(
    createCoreProductDrumTriggerEvent(voiceIndex, 0.92),
    `WASM product drum trigger enqueue failed for voice ${voiceIndex}`,
  );

  const samples = new Float32Array(RENDER_BLOCKS * FRAMES_PER_BLOCK * 2);
  for (let block = 0; block < RENDER_BLOCKS; block += 1) {
    render(engine, leftPtr, rightPtr, FRAMES_PER_BLOCK);
    refreshMemoryViews();
    const leftOffset = leftPtr >> 2;
    const rightOffset = rightPtr >> 2;
    const sampleOffset = block * FRAMES_PER_BLOCK * 2;
    for (let index = 0; index < FRAMES_PER_BLOCK; index += 1) {
      const left = heap[leftOffset + index] ?? 0;
      const right = heap[rightOffset + index] ?? 0;
      assert.ok(Number.isFinite(left) && Number.isFinite(right), 'WASM product drum render produced non-finite output');
      samples[sampleOffset + index * 2] = left;
      samples[sampleOffset + index * 2 + 1] = right;
    }
  }
  return samples;
}

function rms(samples: Float32Array): number {
  let sumSquares = 0;
  for (const sample of samples) {
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / Math.max(1, samples.length));
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

function valuesForDef(def: DrumParamDef): [ParamValue, ParamValue] {
  if (def.key === 'drumMembraneExcPos') return [0.5, 0];
  if (def.type === 'select') {
    const options = def.options ?? [];
    assert.ok(options.length >= 2, `${def.key} select audit requires at least two options`);
    return [options[0]!, options[options.length - 1]!];
  }
  const min = def.min ?? 0;
  const max = def.max ?? 1;
  if (def.key.endsWith('Attack')) return [min, Math.min(max, 120)];
  if (def.key.endsWith('Level')) return [Math.max(min, 0.05), max];
  return [min, max];
}

function visibleSetupForKey(key: string): Record<string, ParamValue> {
  if (key === 'drumSubPitchDecay') return { drumSubPitchEnv: 24 };
  if (key === 'drumClickMode') return { drumClickGrainCount: 5, drumClickGrainSpread: 30 };
  if (key === 'drumClickPitch' || key === 'drumClickPitchEnv') return { drumClickMode: 'tonal' };
  if (key === 'drumClickGrainCount' || key === 'drumClickStereoWidth') {
    return { drumClickMode: 'granular', drumClickDecay: 80, drumClickLevel: 1, drumClickGrainCount: 4, drumClickGrainSpread: 0 };
  }
  if (key === 'drumClickGrainSpread') {
    return { drumClickMode: 'granular', drumClickDecay: 80, drumClickLevel: 1, drumClickGrainCount: 4 };
  }
  if (key === 'drumBeepLoPitchDecay') return { drumBeepLoPitchEnv: 18 };
  if (key === 'drumBeepLoPluckDamp') return { drumBeepLoPluck: 1 };
  if (
    key === 'drumBeepLoModalQ' ||
    key === 'drumBeepLoModalInharmonic' ||
    key === 'drumBeepLoModalSpread' ||
    key === 'drumBeepLoModalCut' ||
    key === 'drumBeepLoModalGain'
  ) {
    return { drumBeepLoModal: 0.9 };
  }
  if (key === 'drumNoiseFilterEnvDecay') return { drumNoiseFilterEnv: 1 };
  if (key === 'drumNoiseParticleSize' || key === 'drumNoiseParticleRandomRate') {
    return { drumNoiseParticleRandom: 1 };
  }
  if (key === 'drumNoiseRatchetTime') return { drumNoiseRatchetCount: 5 };
  if (key === 'drumBeepHiInharmonic') return { drumBeepHiPartials: 6 };
  if (key === 'drumBeepHiShimmerRate') return { drumBeepHiShimmer: 1 };
  if (
    key === 'drumBeepHiModRatio' ||
    key === 'drumBeepHiModRatioFine' ||
    key === 'drumBeepHiModPhase' ||
    key === 'drumBeepHiFeedback' ||
    key === 'drumBeepHiModEnvDecay' ||
    key === 'drumBeepHiModEnvEnd'
  ) {
    return { drumBeepHiTone: 1.5, drumBeepHiModEnvDecay: 1 };
  }
  if (key === 'drumBeepHiNoiseDecay') return { drumBeepHiNoiseInMod: 1 };
  if (key === 'drumMembraneWireDensity' || key === 'drumMembraneWireTone' || key === 'drumMembraneWireDecay') {
    return { drumMembraneWireMix: 0.9 };
  }
  if (key === 'drumMembranePitchDecay') return { drumMembranePitchEnv: 18 };
  if (key === 'drumMembraneScaleBlend') {
    return { drumMembraneMaterial: 'metal', drumMembraneOvertones: 8, drumMembraneRing: 0.8 };
  }
  return {};
}

function visibleAuditCases(): AuditCase[] {
  const cases: AuditCase[] = [];
  for (const [voiceIndex, voice] of DRUM_VOICE_ORDER.entries()) {
    for (const def of voiceParamDefs.get(voice) ?? []) {
      assert.ok(specByKey.has(def.key), `${voice}.${def.key} is visible in the drum UI but missing from Product Core schema`);
      const [low, high] = valuesForDef(def);
      cases.push({
        key: def.key,
        voice,
        voiceIndex,
        low,
        high,
        setup: visibleSetupForKey(def.key),
    });
    }
  }
  return cases;
}

function voiceForGeneratedKey(key: string): { voice: DrumVoice; voiceIndex: number; prefix: string } | null {
  return voicePrefixes.find((candidate) => key.startsWith(candidate.prefix)) ?? null;
}

function generatedValuesForKey(key: string): [ParamValue, ParamValue] | null {
  if (key.endsWith('FmTransientMix')) return [0, 1];
  if (key.endsWith('FmTransientRatio')) return [0.5, 9];
  if (key.endsWith('FmTransientAmount')) return [0, 1];
  if (key.endsWith('FmTransientDecay')) return [5, 220];
  if (key.endsWith('FmTransientFeedback')) return [0, 1];
  if (key.endsWith('FmTransientNoise')) return [0, 1];
  if (key.endsWith('FmTransientClip')) return [0, 1];
  if (key.endsWith('DamageMix')) return [0, 1];
  if (key.endsWith('DamageBits')) return [16, 4];
  if (key.endsWith('DamageSampleHold')) return [1, 48];
  if (key.endsWith('DamageFold')) return [0, 1];
  if (key.endsWith('DamageClip')) return [0, 1];
  if (key.endsWith('MetallicMix')) return [0, 1];
  if (key.endsWith('MetallicTune')) return [-18, 18];
  if (key.endsWith('MetallicSpread')) return [0, 1.6];
  if (key.endsWith('MetallicDecay')) return [8, 600];
  if (key.endsWith('MetallicPhaseRandom')) return [0, 1];
  return null;
}

function generatedSetupForKey(key: string): Record<string, ParamValue> {
  const voice = voiceForGeneratedKey(key);
  assert.ok(voice, `Cannot determine drum voice for generated key ${key}`);
  const setup: Record<string, ParamValue> = {};
  if (key.includes('FmTransient')) {
    setup[`${voice.prefix}FmTransientMix`] = 0.95;
    setup[`${voice.prefix}FmTransientRatio`] = 3;
    setup[`${voice.prefix}FmTransientAmount`] = 0.85;
    setup[`${voice.prefix}FmTransientDecay`] = 90;
  }
  if (key.includes('Damage')) {
    setup[`${voice.prefix}DamageMix`] = 0.95;
    setup[`${voice.prefix}DamageBits`] = 7;
    setup[`${voice.prefix}DamageSampleHold`] = 12;
    setup[`${voice.prefix}DamageFold`] = 0.35;
    setup[`${voice.prefix}DamageClip`] = 0.35;
  }
  if (key.includes('Metallic')) {
    setup[`${voice.prefix}MetallicMix`] = 0.8;
    setup[`${voice.prefix}MetallicTune`] = 0;
    setup[`${voice.prefix}MetallicSpread`] = 0.6;
    setup[`${voice.prefix}MetallicDecay`] = 160;
  }
  delete setup[key];
  if (voice.voice === 'click') {
    setup.drumClickMode = 'tonal';
    setup.drumClickDecay = 90;
  }
  if (voice.voice === 'membrane') {
    setup.drumMembraneOvertones = 8;
    setup.drumMembraneRing = 0.8;
  }
  return setup;
}

function generatedAuditCases(): AuditCase[] {
  const visibleKeys = new Set(visibleAuditCases().map((auditCase) => auditCase.key));
  const cases: AuditCase[] = [];
  for (const spec of KESSHO_PRODUCT_DRUM_PARAM_SPECS) {
    if (visibleKeys.has(spec.key)) continue;
    if (!/(FmTransient|Damage|Metallic)/.test(spec.key)) continue;
    const values = generatedValuesForKey(spec.key);
    const voice = voiceForGeneratedKey(spec.key);
    if (!values || !voice) continue;
    cases.push({
      key: spec.key,
      voice: voice.voice,
      voiceIndex: voice.voiceIndex,
      low: values[0],
      high: values[1],
      setup: generatedSetupForKey(spec.key),
      generatedOnly: true,
      minDiff: MIN_GENERATED_PARAM_DIFF,
    });
  }
  return cases;
}

function assertVisibleStateRoundTrip(): void {
  const visible = visibleAuditCases();
  for (const auditCase of visible) {
    const state = { ...DEFAULT_STATE, [auditCase.key]: auditCase.high } as SliderState;
    const serialized = JSON.parse(serializeState(state)) as Record<string, unknown>;
    assert.ok(
      Object.prototype.hasOwnProperty.call(serialized, auditCase.key),
      `${auditCase.key} is visible in the drum UI but missing from STATE_KEYS serialization`,
    );
    const decoded = decodeStateFromUrl(encodeStateToUrl(state));
    assert.ok(decoded, `${auditCase.key} state URL decode returned null`);
    const stateKey = auditCase.key as keyof SliderState;
    const expected = typeof state[stateKey] === 'number'
      ? quantize(stateKey, state[stateKey] as number)
      : state[stateKey];
    assert.equal(decoded[stateKey], expected, `${auditCase.key} did not survive state URL round-trip`);
  }
}

function runAuditCase(auditCase: AuditCase): AuditResult {
  let lowSamples: Float32Array;
  let highSamples: Float32Array;
  try {
    lowSamples = renderDrumVoice(auditCase.voiceIndex, caseEvents(auditCase, auditCase.low));
    highSamples = renderDrumVoice(auditCase.voiceIndex, caseEvents(auditCase, auditCase.high));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Drum parameter audit crashed while rendering ${auditCase.voice}.${auditCase.key} low=${String(auditCase.low)} high=${String(auditCase.high)}: ${detail}`);
  }
  const difference = waveformDifference(lowSamples, highSamples);
  return {
    ...auditCase,
    normalizedRms: difference.normalizedRms,
    correlation: difference.correlation,
    lowRms: rms(lowSamples),
    highRms: rms(highSamples),
  };
}

function formatFailure(result: AuditResult): string {
  return `${result.voice}.${result.key} diff=${result.normalizedRms.toFixed(5)} corr=${result.correlation.toFixed(5)} rms=${result.lowRms.toFixed(6)}/${result.highRms.toFixed(6)} low=${String(result.low)} high=${String(result.high)}`;
}

try {
  assertVisibleStateRoundTrip();

  const cases = [...visibleAuditCases(), ...generatedAuditCases()];
  const results = cases.map(runAuditCase);
  const failures = results.filter((result) => {
    const threshold = result.minDiff ?? MIN_VISIBLE_PARAM_DIFF;
    const audible = Math.max(result.lowRms, result.highRms) > MIN_RENDER_RMS;
    return !audible || result.normalizedRms < threshold;
  });

  const visibleResults = results.filter((result) => !result.generatedOnly);
  const generatedResults = results.filter((result) => result.generatedOnly);
  const weakestVisible = [...visibleResults].sort((a, b) => a.normalizedRms - b.normalizedRms).slice(0, 8);
  const weakestGenerated = [...generatedResults].sort((a, b) => a.normalizedRms - b.normalizedRms).slice(0, 8);
  console.log(`[drum-param-audit] visible=${visibleResults.length} generated=${generatedResults.length}`);
  console.log(`[drum-param-audit] weakest visible: ${weakestVisible.map(formatFailure).join(' | ')}`);
  console.log(`[drum-param-audit] weakest generated: ${weakestGenerated.map(formatFailure).join(' | ')}`);

  assert.deepEqual(failures.map(formatFailure), [], 'Drum parameter audit found non-audible or disconnected parameters');
} finally {
  destroy(engine);
  free(eventPtr);
  free(rightPtr);
  free(leftPtr);
}
