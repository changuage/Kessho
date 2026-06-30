import {
  SAMPLE_DYNAMIC_KEYS,
  SAMPLE_DYNAMIC_MODES,
  SAMPLE_LIBRARY_KEYS,
  SAMPLE_SELECTION_MODES,
  SAMPLE_VARIANT_MODES,
  type SampleDynamicKey,
  type SampleDynamicMode,
  type SampleLibraryKey,
  type SampleSelectionMode,
  type SampleSlotId,
  type SampleSlotState,
  type SampleVariantMode,
} from './SampleLibraryTypes';

const DEFAULT_SAMPLE_SLOT_STATE: SampleSlotState = Object.freeze({
  enabled: false,
  libraryKey: 'piano',
  role: '',
  articulation: '',
  selectionMode: 'nearest',
  dynamicMode: 'legacy-piano-parity',
  fixedDynamic: 'regular',
  variantMode: 'stable',
  level: 1,
  attackMs: 5,
  decayMs: 650,
  sustain: 0.72,
  holdMs: 200,
  releaseMs: 120,
  loopEnabled: true,
  maxVoices: 16,
});

const DEFAULT_SAMPLE2_SLOT_STATE: SampleSlotState = Object.freeze({
  ...DEFAULT_SAMPLE_SLOT_STATE,
  libraryKey: 'soft-string-spurs',
  selectionMode: 'mapped',
  dynamicMode: 'velocity',
  fixedDynamic: 'level-2',
  level: 0.75,
  attackMs: 25,
  releaseMs: 350,
  maxVoices: 12,
});

function fieldKey(slotId: SampleSlotId, suffix: string): string {
  return `${slotId}${suffix}`;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(clampNumber(value, fallback, min, max));
}

function secondsToMilliseconds(value: unknown, fallbackSeconds: number, minSeconds: number, maxSeconds: number): number {
  return clampNumber(value, fallbackSeconds, minSeconds, maxSeconds) * 1000;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function enumValue<const T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && values.includes(value) ? value : fallback;
}

export function getDefaultSampleSlotState(overrides: Partial<SampleSlotState> = {}): SampleSlotState {
  return {
    ...DEFAULT_SAMPLE_SLOT_STATE,
    ...overrides,
  };
}

export function getDefaultSampleSlotStateForSlot(
  slotId: SampleSlotId,
  overrides: Partial<SampleSlotState> = {},
): SampleSlotState {
  return {
    ...(slotId === 'sample2' ? DEFAULT_SAMPLE2_SLOT_STATE : DEFAULT_SAMPLE_SLOT_STATE),
    ...overrides,
  };
}

export function readSampleSlotState(
  state: Record<string, unknown> | null | undefined,
  slotId: SampleSlotId,
  fallback: SampleSlotState = getDefaultSampleSlotStateForSlot(slotId),
): SampleSlotState {
  const record = state ?? {};
  return {
    enabled: record[fieldKey(slotId, 'Enabled')] === true,
    libraryKey: enumValue(record[fieldKey(slotId, 'LibraryKey')], SAMPLE_LIBRARY_KEYS, fallback.libraryKey) as SampleLibraryKey,
    role: stringValue(record[fieldKey(slotId, 'Role')], fallback.role).trim(),
    articulation: stringValue(record[fieldKey(slotId, 'Articulation')], fallback.articulation).trim(),
    selectionMode: enumValue(record[fieldKey(slotId, 'SelectionMode')], SAMPLE_SELECTION_MODES, fallback.selectionMode) as SampleSelectionMode,
    dynamicMode: enumValue(record[fieldKey(slotId, 'DynamicMode')], SAMPLE_DYNAMIC_MODES, fallback.dynamicMode) as SampleDynamicMode,
    fixedDynamic: enumValue(record[fieldKey(slotId, 'FixedDynamic')], SAMPLE_DYNAMIC_KEYS, fallback.fixedDynamic) as SampleDynamicKey,
    variantMode: enumValue(record[fieldKey(slotId, 'VariantMode')], SAMPLE_VARIANT_MODES, fallback.variantMode) as SampleVariantMode,
    level: clampNumber(record[fieldKey(slotId, 'Level')], fallback.level, 0, 2),
    attackMs: clampNumber(record[fieldKey(slotId, 'AttackMs')], fallback.attackMs, 1, 16000),
    decayMs: clampNumber(record[fieldKey(slotId, 'DecayMs')], fallback.decayMs, 10, 8000),
    sustain: clampNumber(record[fieldKey(slotId, 'Sustain')], fallback.sustain, 0, 1),
    holdMs: clampNumber(record[fieldKey(slotId, 'HoldMs')], fallback.holdMs, 0, 20000),
    releaseMs: clampNumber(record[fieldKey(slotId, 'ReleaseMs')], fallback.releaseMs, 10, 30000),
    loopEnabled: record[fieldKey(slotId, 'LoopEnabled')] !== false,
    maxVoices: clampInteger(record[fieldKey(slotId, 'MaxVoices')], fallback.maxVoices, 1, 64),
  };
}

export function writeSampleSlotStateToFlatState(
  slotId: SampleSlotId,
  slot: SampleSlotState,
  state: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...state,
    [fieldKey(slotId, 'Enabled')]: slot.enabled,
    [fieldKey(slotId, 'LibraryKey')]: slot.libraryKey,
    [fieldKey(slotId, 'Role')]: slot.role,
    [fieldKey(slotId, 'Articulation')]: slot.articulation,
    [fieldKey(slotId, 'SelectionMode')]: slot.selectionMode,
    [fieldKey(slotId, 'DynamicMode')]: slot.dynamicMode,
    [fieldKey(slotId, 'FixedDynamic')]: slot.fixedDynamic,
    [fieldKey(slotId, 'VariantMode')]: slot.variantMode,
    [fieldKey(slotId, 'Level')]: slot.level,
    [fieldKey(slotId, 'AttackMs')]: slot.attackMs,
    [fieldKey(slotId, 'DecayMs')]: slot.decayMs,
    [fieldKey(slotId, 'Sustain')]: slot.sustain,
    [fieldKey(slotId, 'HoldMs')]: slot.holdMs,
    [fieldKey(slotId, 'ReleaseMs')]: slot.releaseMs,
    [fieldKey(slotId, 'LoopEnabled')]: slot.loopEnabled,
    [fieldKey(slotId, 'MaxVoices')]: slot.maxVoices,
  };
}

export function createLegacyPianoSample1State(
  state: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const record = state ?? {};
  const legacyPianoEnabled = record.pianoEnabled === true;
  if (Object.prototype.hasOwnProperty.call(record, fieldKey('sample1', 'LibraryKey'))) {
    const next = { ...record };
    if (legacyPianoEnabled && next.sample1Enabled !== true) {
      next.sample1Enabled = true;
      if (!Object.prototype.hasOwnProperty.call(next, 'sample1Level')) {
        next.sample1Level = clampNumber(record.pianoLevel, 1, 0, 2);
      }
      if (!Object.prototype.hasOwnProperty.call(next, 'sample1AttackMs')) {
        next.sample1AttackMs = secondsToMilliseconds(record.pianoAttack, 0.005, 0, 5);
      }
      if (!Object.prototype.hasOwnProperty.call(next, 'sample1DecayMs')) {
        next.sample1DecayMs = secondsToMilliseconds(record.pianoDecay, 0.65, 0.01, 4);
      }
      if (!Object.prototype.hasOwnProperty.call(next, 'sample1Sustain')) {
        next.sample1Sustain = clampNumber(record.pianoSustain, 0.72, 0, 1);
      }
      if (!Object.prototype.hasOwnProperty.call(next, 'sample1HoldMs')) {
        next.sample1HoldMs = secondsToMilliseconds(record.pianoHold, 0.2, 0, 4);
      }
      if (!Object.prototype.hasOwnProperty.call(next, 'sample1ReleaseMs')) {
        next.sample1ReleaseMs = secondsToMilliseconds(record.pianoRelease, 0.12, 0, 10);
      }
    }
    return next;
  }
  return writeSampleSlotStateToFlatState('sample1', getDefaultSampleSlotState({
    enabled: legacyPianoEnabled,
    libraryKey: 'piano',
    role: '',
    articulation: '',
    selectionMode: 'nearest',
    dynamicMode: 'legacy-piano-parity',
    fixedDynamic: 'regular',
    variantMode: 'stable',
    level: clampNumber(record.pianoLevel, 1, 0, 2),
    attackMs: secondsToMilliseconds(record.pianoAttack, 0.005, 0, 5),
    decayMs: secondsToMilliseconds(record.pianoDecay, 0.65, 0.01, 4),
    sustain: clampNumber(record.pianoSustain, 0.72, 0, 1),
    holdMs: secondsToMilliseconds(record.pianoHold, 0.2, 0, 4),
    releaseMs: secondsToMilliseconds(record.pianoRelease, 0.12, 0, 10),
    loopEnabled: false,
    maxVoices: 16,
  }), { ...record });
}
