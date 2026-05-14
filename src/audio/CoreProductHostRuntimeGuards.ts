import type { EngineState, ManualSynthNoteOptions } from './engine';
import { CORE_PRODUCT_SOURCE_IDS } from './coreProductEvents';
import { KESSHO_PRODUCT_DRUM_VOICE_COUNT } from './generated/kesshoProductSchema';

export function createCoreProductEngineState(isRunning: boolean): EngineState {
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
  const known: Record<string, number> = {
    sub: 0,
    kick: 1,
    snare: 2,
    click: 2,
    clap: 2,
    beephi: 3,
    beeplo: 4,
    noise: 5,
    hat: 5,
    hihat: 5,
    membrane: 6,
    perc: 6,
    tom: 6,
  };
  const index = known[text];
  if (index === undefined) {
    throw new Error(`Unknown Core Product drum voice: ${String(voice)}`);
  }
  return index;
}

export function sourceId(source: ManualSynthNoteOptions['source']): number {
  const id = CORE_PRODUCT_SOURCE_IDS[source];
  if (id === undefined) {
    throw new Error(`Unknown Core Product synth source: ${String(source)}`);
  }
  return id;
}

export function midiFromFrequency(frequency: number): number {
  if (!Number.isFinite(frequency) || frequency <= 0) {
    throw new Error(`Core Product synth trigger frequency must be positive and finite: ${String(frequency)}`);
  }
  return Math.max(0, Math.min(127, 69 + 12 * Math.log2(frequency / 440)));
}

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

export function requireManualNote(note: ManualSynthNoteOptions): Required<ManualSynthNoteOptions> {
  const source = note.source;
  sourceId(source);
  return {
    source,
    midi: requireFiniteRange(note.midi, 'manual note midi', 0, 127),
    velocity: requireFiniteRange(note.velocity, 'manual note velocity', 0.000001, 1),
    durationMs: requirePositive(note.durationMs, 'manual note durationMs'),
  };
}

export function manualAuditionState(
  source: ManualSynthNoteOptions['source'],
  state?: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...(state ?? {}) };
  switch (source) {
    case 'pad1':
      next.padEnabled = true;
      break;
    case 'pad2':
      next.pad2Enabled = true;
      break;
    case 'lead1':
      next.leadEnabled = true;
      break;
    case 'lead2':
      next.lead2Enabled = true;
      break;
    case 'piano':
      next.pianoEnabled = true;
      break;
    default:
      sourceId(source);
  }
  return next;
}

export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(0.000001, Math.abs(gain)));
}
