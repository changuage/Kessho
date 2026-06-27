import {
  SAMPLE_DYNAMIC_KEYS,
  SAMPLE_DYNAMIC_MODES,
  SAMPLE_LIBRARY_KEYS,
  SAMPLE_SELECTION_MODES,
  type SampleDynamicKey,
  type SampleDynamicMode,
  type SampleLibraryKey,
  type SampleSelectionMode,
  type SampleSlotId,
  type SampleSlotState,
} from './SampleLibraryTypes';

const DEFAULT_SAMPLE_SLOT_STATE: SampleSlotState = Object.freeze({
  enabled: false,
  libraryKey: 'piano',
  role: '',
  articulation: '',
  selectionMode: 'nearest',
  dynamicMode: 'legacy-piano-parity',
  fixedDynamic: 'regular',
  level: 1,
  attackMs: 5,
  releaseMs: 120,
  loopEnabled: true,
  maxVoices: 16,
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

export function readSampleSlotState(
  state: Record<string, unknown> | null | undefined,
  slotId: SampleSlotId,
  fallback: SampleSlotState = DEFAULT_SAMPLE_SLOT_STATE,
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
    level: clampNumber(record[fieldKey(slotId, 'Level')], fallback.level, 0, 2),
    attackMs: clampNumber(record[fieldKey(slotId, 'AttackMs')], fallback.attackMs, 0, 5000),
    releaseMs: clampNumber(record[fieldKey(slotId, 'ReleaseMs')], fallback.releaseMs, 0, 10000),
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
    [fieldKey(slotId, 'Level')]: slot.level,
    [fieldKey(slotId, 'AttackMs')]: slot.attackMs,
    [fieldKey(slotId, 'ReleaseMs')]: slot.releaseMs,
    [fieldKey(slotId, 'LoopEnabled')]: slot.loopEnabled,
    [fieldKey(slotId, 'MaxVoices')]: slot.maxVoices,
  };
}

export function createLegacyPianoSample1State(
  state: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const record = state ?? {};
  return writeSampleSlotStateToFlatState('sample1', getDefaultSampleSlotState({
    enabled: record.pianoEnabled === true,
    libraryKey: 'piano',
    role: '',
    articulation: '',
    selectionMode: 'nearest',
    dynamicMode: 'legacy-piano-parity',
    fixedDynamic: 'regular',
    level: clampNumber(record.pianoLevel, 1, 0, 2),
    attackMs: clampNumber(record.pianoAttack, 5, 0, 5000),
    releaseMs: clampNumber(record.pianoRelease, 120, 0, 10000),
    loopEnabled: false,
    maxVoices: 16,
  }), { ...record });
}
