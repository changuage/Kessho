import type { ManualSynthNoteOptions } from './engineSharedTypes';
import { CORE_PRODUCT_SOURCE_IDS, type CoreProductRangeTarget, type CoreProductRangeValueContext } from './coreProductEvents';
import { KESSHO_PRODUCT_DRUM_VOICE_COUNT, KESSHO_PRODUCT_DRUM_VOICES } from './generated/kesshoProductSchema';
import type { ProductEngineState } from './product/ProductEngineTypes';
export type RuntimeWalkConfig = { speed: number; mode: 'localBrownian' | 'globalWalk' };
export function runtimeWalkConfigFromState(state: Record<string, unknown> | null): RuntimeWalkConfig {
  const speed = state?.randomWalkSpeed;
  const mode = state?.randomWalkMode;
  return {
    speed: typeof speed === 'number' && Number.isFinite(speed) ? speed : 1,
    mode: mode === 'globalWalk' ? 'globalWalk' : 'localBrownian',
  };
}
export function runtimeWalkConfigChanged(left: RuntimeWalkConfig, right: RuntimeWalkConfig): boolean {
  return Math.abs(left.speed - right.speed) > 0.0005 || left.mode !== right.mode;
}
export function coreProductRangeValueContext(
  snapshotBpm: unknown,
  state: Record<string, unknown> | null,
): CoreProductRangeValueContext {
  const walk = runtimeWalkConfigFromState(state);
  return { bpm: typeof snapshotBpm === 'number' && Number.isFinite(snapshotBpm) ? snapshotBpm : 120, ...walk, randomWalkSpeed: walk.speed, randomWalkMode: walk.mode, state };
}
export function mappedCoreProductRange(
  target: CoreProductRangeTarget,
  range: { min: number; max: number },
  context: CoreProductRangeValueContext,
): { min: number; max: number } {
  const mapValue = target.mapValue ?? ((value: number) => value);
  const mappedMin = mapValue(Math.min(range.min, range.max), context);
  const mappedMax = mapValue(Math.max(range.min, range.max), context);
  return { min: Math.min(mappedMin, mappedMax), max: Math.max(mappedMin, mappedMax) };
}
export function normalizeCoreProductRuntimeWalkValue(
  value: number,
  range?: { min: number; max: number },
): number {
  return Math.max(0, Math.min(1, range && range.max > range.min ? (value - range.min) / (range.max - range.min) : value));
}
export function runtimeWalkPositionsFromTelemetry(
  values: Record<number, number> | undefined,
  controlNames: Map<number, string>,
  controlRanges: Map<number, { min: number; max: number }>,
): Record<string, number> | null {
  if (!values) return null;
  const next: Record<string, number> = {};
  for (const [idText, value] of Object.entries(values)) {
    const controlId = Number(idText);
    const key = controlNames.get(controlId);
    if (!key || typeof value !== 'number') continue;
    next[key] = normalizeCoreProductRuntimeWalkValue(value, controlRanges.get(controlId));
  }
  return next;
}
export function createCoreProductEngineState(isRunning: boolean): ProductEngineState {
  return {
    isRunning,
    harmonyState: null,
    currentSeed: 0,
    currentBucket: '',
    currentFilterFreq: 1000,
    currentLfoValue: 0,
    currentLfo2Value: 0,
    cofCurrentStep: 0,
    fxOwners: {
      delayA: { owner: null, strength: 0, lastOrigin: null, active: false },
      delayB: { owner: null, strength: 0, lastOrigin: null, active: false },
      granular: { owner: null, strength: 0, lastOrigin: null, active: false },
      reverb: { owner: null, strength: 0, lastOrigin: null, active: false },
    },
    transportDebug: null,
  };
}
export function drumVoiceIndex(voice: unknown): number {
  if (typeof voice === 'number' && Number.isInteger(voice) && voice >= 0 && voice < KESSHO_PRODUCT_DRUM_VOICE_COUNT) {
    return voice;
  }
  const text = typeof voice === 'string' ? voice.toLowerCase() : '';
  const generatedVoice = KESSHO_PRODUCT_DRUM_VOICES.find((candidate) => candidate.name.toLowerCase() === text);
  if (generatedVoice) {
    return generatedVoice.index;
  }
  const legacyAliases: Record<string, number> = {
    snare: 2,
    clap: 2,
    hat: 5,
    hihat: 5,
    perc: 6,
    tom: 6,
  };
  const index = legacyAliases[text];
  if (index === undefined) {
    throw new Error(`Unknown Core Product drum voice: ${String(voice)}`);
  }
  return index;
}
export function sourceId(source: ManualSynthNoteOptions['source']): number {
  switch (source) {
    case 'pad1':
      return CORE_PRODUCT_SOURCE_IDS.pad1;
    case 'pad2':
      return CORE_PRODUCT_SOURCE_IDS.pad2;
    case 'lead1':
      return CORE_PRODUCT_SOURCE_IDS.lead1;
    case 'lead2':
      return CORE_PRODUCT_SOURCE_IDS.lead2;
    case 'sample1':
    case 'piano':
      return CORE_PRODUCT_SOURCE_IDS.sample1;
    case 'sample2':
      return CORE_PRODUCT_SOURCE_IDS.sample2;
    default:
      throw new Error(`Unknown Core Product synth source: ${String(source)}`);
  }
}
export function midiFromFrequency(frequency: number): number {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    throw new Error(`Core Product synth trigger frequency must be positive and finite: ${String(frequency)}`);
  }
  return Math.max(0, Math.min(127, 69 + 12 * Math.log2(frequency / 440)));
}
export type RequiredManualSynthNote = Required<Omit<ManualSynthNoteOptions, 'voiceIndex'>> & Pick<ManualSynthNoteOptions, 'voiceIndex'>;
export function requireFiniteRange(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Core Product ${label} must be a finite number in [${min}, ${max}]`);
  }
  return value;
}
export function requirePositive(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Core Product ${label} must be a positive finite number`);
  }
  return value;
}
export function requireManualNote(note: ManualSynthNoteOptions): RequiredManualSynthNote {
  const source = note.source;
  sourceId(source);
  const voiceIndex = note.voiceIndex;
  if (voiceIndex !== undefined && (!Number.isInteger(voiceIndex) || voiceIndex < 0 || voiceIndex > 7)) {
    throw new Error(`Core Product manual note voiceIndex must be an integer in [0, 7]: ${String(voiceIndex)}`);
  }
  return { source, midi: requireFiniteRange(note.midi, 'manual note midi', 0, 127), velocity: requireFiniteRange(note.velocity, 'manual note velocity', 0.000001, 1), durationMs: requirePositive(note.durationMs, 'manual note durationMs'), ...(voiceIndex !== undefined ? { voiceIndex } : {}) };
}
export function manualAuditionState(
  source: ManualSynthNoteOptions['source'],
  state?: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...(state ?? {}) };
  switch (source) {
    case 'pad1': next.padEnabled = true; break;
    case 'pad2': next.pad2Enabled = true; break;
    case 'lead1': next.leadEnabled = true; break;
    case 'lead2': next.lead2Enabled = true; break;
    case 'sample1': next.sample1Enabled = true; break;
    case 'piano':
      next.pianoEnabled = true;
      next.sample1Enabled = true;
      break;
    case 'sample2': next.sample2Enabled = true; break;
    default:
      sourceId(source);
  }
  return next;
}
export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(0.000001, Math.abs(gain)));
}
