import type { SliderState } from '../state';
import { PARAM_REGISTRY } from '../../presets/ParamRegistry';
import {
  getRoutingSourceDef,
  ROUTING_SOURCE_REGISTRY,
  ROUTING_SOURCE_IDS,
  type RoutingRowId,
  type RoutingSourceDef,
} from './routingSourceRegistry';

export const ROUTING_MUTE_GROUP_STORAGE_KEY = 'kessho:routing-mute-groups:v1';
export const ROUTING_MUTE_GROUP_SCHEMA_VERSION = 4;
export const ROUTING_MUTE_GROUP_SCENE_SCHEMA_VERSION = 1;
export const ROUTING_MUTE_GROUP_SLOT_COUNT = 8;
export const ROUTING_MUTE_GROUP_FADE_DOWN_MS = 96;
export const ROUTING_MUTE_GROUP_FADE_UP_MS = 120;
export const ROUTING_MUTE_GROUP_ENABLE_SETTLE_MS = 16;
export const ROUTING_MUTE_GROUP_MIN_PHRASES = 0.25;
export const ROUTING_MUTE_GROUP_MAX_PHRASES = 100;
export const ROUTING_MUTE_GROUP_DEFAULT_MIN_PHRASES = 2;
export const ROUTING_MUTE_GROUP_DEFAULT_MAX_PHRASES = 6;
export const ROUTING_MUTE_GROUP_DEFAULT_TRANSITION_PHRASES = 1;
export const ROUTING_MUTE_GROUP_PHRASE_STEP = 0.25;
export const ROUTING_MUTE_GROUP_RAMP_STEP_MS = 125;
export const ROUTING_MUTE_GROUP_MAX_RAMP_STEPS = 96;
export const ROUTING_MUTE_GROUP_SLOT_COLORS = [
  '#E07A84',
  '#D4A520',
  '#8EB6D8',
  '#A870E8',
  '#6F9AB1',
  '#7B9A6D',
  '#E8B44A',
  '#A5C4D4',
] as const;

export const ROUTING_MUTE_GROUP_SOURCE_IDS = ROUTING_SOURCE_IDS;
export const DEFAULT_ROUTING_MUTE_GROUP_SOURCE_IDS = ROUTING_MUTE_GROUP_SOURCE_IDS;
export type RoutingMuteGroupSourceId = RoutingRowId;

const SEQUENCER_BOOLEAN_PREFIXES = ['drumEuclid', 'synthEuclid', 'granularV'] as const;
const SEQUENCER_BOOLEAN_SUFFIXES = ['Enabled', 'Solo'] as const;

export const ROUTING_MUTE_GROUP_EARTH_BOOLEAN_KEYS = [
  'oceanSampleEnabled',
  'waterEnabled',
  'birdsEnabled',
  'birds2Enabled',
  'frogsEnabled',
  'insectsEnabled',
  'insects2Enabled',
] as const satisfies readonly (keyof SliderState)[];

function uniqueStateKeys(keys: readonly (keyof SliderState)[]): (keyof SliderState)[] {
  return [...new Set(keys)];
}

export const ROUTING_MUTE_GROUP_SOURCE_BOOLEAN_KEYS: readonly (keyof SliderState)[] = uniqueStateKeys(
  ROUTING_MUTE_GROUP_SOURCE_IDS.flatMap((sourceId) => getRoutingSourceDef(sourceId)?.enabledKeys ?? []),
);

export type RoutingMuteGroupEarthBooleanKey = (typeof ROUTING_MUTE_GROUP_EARTH_BOOLEAN_KEYS)[number];
export type RoutingMuteGroupSourceBooleanKey = keyof SliderState;
export const ROUTING_MUTE_GROUP_BOOLEAN_STATE_KEYS: readonly (keyof SliderState)[] = uniqueStateKeys([
  ...ROUTING_MUTE_GROUP_SOURCE_BOOLEAN_KEYS,
  ...ROUTING_MUTE_GROUP_EARTH_BOOLEAN_KEYS,
]);
export type RoutingMuteGroupBooleanStateKey = keyof SliderState;
export type RoutingMuteGroupStatePatchKey = RoutingMuteGroupBooleanStateKey;
export type RoutingMuteGroupStatePatch = Partial<Record<RoutingMuteGroupBooleanStateKey, boolean>>;
export type RoutingMuteGroupRuntimeLevelPatch = Partial<Record<keyof SliderState, number | null>>;
export type RoutingMuteGroupRuntimeLevelPatchOptions = {
  immediate?: boolean;
};

export interface RoutingMuteGroupPhraseRange {
  min: number;
  max: number;
}

export interface RoutingMuteGroupRandomSettings {
  enabled: boolean;
  defaultMinPhrases: number;
  defaultMaxPhrases: number;
  transitionPhrases: number;
  avoidRepeat: boolean;
  eligibleSlotIndexes?: number[];
}

export type RoutingMuteGroupRuntimePhase = 'off' | 'holding' | 'transitioning' | 'paused' | 'empty';

export interface RoutingMuteGroupRuntimeSnapshot {
  randomEnabled: boolean;
  phase: RoutingMuteGroupRuntimePhase;
  activeSlotIndex: number | null;
  activeSlotColor: string | null;
  selectedSlotIndex: number;
  nextSlotIndex: number | null;
  nextSlotColor: string | null;
  secondsToNextChange: number | null;
  transitionProgress: number;
  holdPhrases: number | null;
  transitionPhrases: number;
  currentMutedSourceIds: RoutingMuteGroupSourceId[];
  nextMutedSourceIds: RoutingMuteGroupSourceId[];
}

export interface RoutingMuteGroupScenePayload {
  schemaVersion?: typeof ROUTING_MUTE_GROUP_SCENE_SCHEMA_VERSION;
  mutedSourceIds: RoutingMuteGroupSourceId[];
  statePatch?: RoutingMuteGroupStatePatch;
}

export interface RoutingMuteGroupSlot {
  mutedSourceIds: RoutingMuteGroupSourceId[];
  statePatch?: RoutingMuteGroupStatePatch;
  phraseRange?: RoutingMuteGroupPhraseRange;
}

export interface RoutingMuteGroupSceneRefSlot {
  sceneHash: string;
  phraseRange?: RoutingMuteGroupPhraseRange;
}

export interface RoutingMuteGroupsStorageState {
  schemaVersion?: 4;
  slots: (RoutingMuteGroupSceneRefSlot | null)[];
  random?: RoutingMuteGroupRandomSettings;
}

export interface RoutingMuteGroupsState {
  schemaVersion?: 2 | 3 | 4;
  slots: (RoutingMuteGroupSlot | null)[];
  random?: RoutingMuteGroupRandomSettings;
}

type EnabledSnapshot = Partial<Record<keyof SliderState, boolean>>;

type RoutingMuteGroupSceneSnapshot = RoutingMuteGroupStatePatch;

type TimeoutHandle = ReturnType<typeof setTimeout>;
type RampStep = {
  delayMs: number;
  value: number;
};

type ResolvedRoutingMuteGroupTransition = {
  fadeDownMs: number;
  fadeUpMs: number;
};

export type RoutingMuteGroupScheduler = {
  setTimeout: (callback: () => void, delayMs: number) => TimeoutHandle;
  clearTimeout: (handle: TimeoutHandle) => void;
};

export type RoutingMuteGroupTransitionControllerOptions = {
  getState: () => SliderState;
  onRuntimeLevelPatchChange: (
    patch: RoutingMuteGroupRuntimeLevelPatch,
    options?: RoutingMuteGroupRuntimeLevelPatchOptions,
  ) => void;
  onBooleanParamChange: (key: keyof SliderState, value: boolean) => void;
  onActiveSlotChange?: (slotIndex: number | null) => void;
  eligibleSourceIds?: readonly RoutingRowId[];
  fadeDownMs?: number;
  fadeUpMs?: number;
  enableSettleMs?: number;
  scheduler?: RoutingMuteGroupScheduler;
};

export type RoutingMuteGroupTransitionController = {
  recall: (slot: RoutingMuteGroupSlot, slotIndex: number, options?: RoutingMuteGroupTransitionOptions) => void;
  release: (options?: RoutingMuteGroupTransitionOptions) => void;
  cancel: () => void;
  getActiveSlotIndex: () => number | null;
  getEffectiveMutedSourceIds: () => readonly RoutingMuteGroupSourceId[];
};

export type RoutingMuteGroupTransitionOptions = {
  transitionMs?: number;
  fadeDownMs?: number;
  fadeUpMs?: number;
};

export type SaveSlotResult = {
  slotIndex: number;
  wasStored: boolean;
};

export type RoutingMuteGroupsController = {
  activeSlotIndex: number | null;
  selectedSlotIndex: number;
  runtimeSnapshot: RoutingMuteGroupRuntimeSnapshot;
  selectSlot: (slotIndex: number) => void;
  pressSlot: (slotIndex: number) => void;
  saveSlot: (slotIndex: number) => SaveSlotResult;
  saveSelectedSlot: () => SaveSlotResult;
  clearSlot: (slotIndex: number) => void;
  clearSelectedSlot: () => void;
  updateSlotPhraseRange: (slotIndex: number, range: RoutingMuteGroupPhraseRange) => void;
  updateRandomSettings: (patch: Partial<RoutingMuteGroupRandomSettings>) => void;
};

const DEFAULT_SCHEDULER: RoutingMuteGroupScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

const ELIGIBLE_SOURCE_ID_SET = new Set<RoutingRowId>(ROUTING_MUTE_GROUP_SOURCE_IDS);

const SOURCE_ORDER = new Map<RoutingRowId, number>(
  ROUTING_SOURCE_REGISTRY.map((source, index) => [source.id, index]),
);
const ROUTING_MUTE_GROUP_BOOLEAN_STATE_KEY_SET = new Set<keyof SliderState>(ROUTING_MUTE_GROUP_BOOLEAN_STATE_KEYS);

export function isEligibleRoutingMuteGroupSourceId(value: unknown): value is RoutingMuteGroupSourceId {
  return typeof value === 'string' && ELIGIBLE_SOURCE_ID_SET.has(value as RoutingRowId);
}

function isRoutingMuteGroupBooleanStateKey(value: string): value is RoutingMuteGroupBooleanStateKey {
  return ROUTING_MUTE_GROUP_BOOLEAN_STATE_KEY_SET.has(value as keyof SliderState) || isSequencerMuteBooleanKey(value);
}

function isKnownPresetStateKey(value: string): value is keyof SliderState {
  return hasOwnValue(PARAM_REGISTRY, value);
}

function isSequencerMuteBooleanKey(value: string): value is keyof SliderState {
  const matchesSequencerMuteName = (
    SEQUENCER_BOOLEAN_PREFIXES.some((prefix) => value.startsWith(prefix))
    && SEQUENCER_BOOLEAN_SUFFIXES.some((suffix) => value.endsWith(suffix))
  );
  return (
    matchesSequencerMuteName
    && (isKnownPresetStateKey(value) || /^(?:drumEuclid|synthEuclid)\d+Solo$/.test(value))
  );
}

export function collectSequencerMuteBooleanKeys(state: SliderState): (keyof SliderState)[] {
  return Object.keys(state)
    .filter((key) => isSequencerMuteBooleanKey(key) && typeof state[key as keyof SliderState] === 'boolean')
    .sort() as (keyof SliderState)[];
}

export function getRoutingMuteGroupBooleanStateKeys(state: SliderState): readonly (keyof SliderState)[] {
  return uniqueStateKeys([
    ...ROUTING_MUTE_GROUP_SOURCE_BOOLEAN_KEYS,
    ...collectSequencerMuteBooleanKeys(state),
    ...ROUTING_MUTE_GROUP_EARTH_BOOLEAN_KEYS,
  ]);
}

function eligibleSourceDefs(sourceIds: readonly RoutingRowId[] = ROUTING_MUTE_GROUP_SOURCE_IDS): RoutingSourceDef[] {
  return sourceIds
    .filter((id): id is RoutingMuteGroupSourceId => isEligibleRoutingMuteGroupSourceId(id))
    .map((id) => getRoutingSourceDef(id))
    .filter((source): source is RoutingSourceDef => !!source);
}

function hasOwnValue(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function assignStatePatchValue(
  patch: RoutingMuteGroupStatePatch,
  key: RoutingMuteGroupStatePatchKey,
  value: boolean,
): void {
  (patch as Record<string, boolean>)[String(key)] = value;
}

function mergeNormalizedStatePatchRecord(patch: RoutingMuteGroupStatePatch, value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  for (const [key, raw] of Object.entries(record)) {
    if (isRoutingMuteGroupBooleanStateKey(key)) {
      if (typeof raw === 'boolean') {
        assignStatePatchValue(patch, key, raw);
      }
    }
  }
}

function normalizeRoutingMuteGroupStatePatchFromSlot(value: unknown): RoutingMuteGroupStatePatch | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<RoutingMuteGroupSlot> & {
    sequencers?: unknown;
    earth?: unknown;
  };
  const patch: RoutingMuteGroupStatePatch = {};

  const sequencerPatch = raw.sequencers && typeof raw.sequencers === 'object' && hasOwnValue(raw.sequencers, 'booleans')
    ? (raw.sequencers as { booleans?: unknown }).booleans
    : raw.sequencers;
  mergeNormalizedStatePatchRecord(patch, sequencerPatch);

  if (raw.earth && typeof raw.earth === 'object') {
    const earth = raw.earth as { booleans?: unknown; levels?: unknown };
    mergeNormalizedStatePatchRecord(patch, earth.booleans);
    mergeNormalizedStatePatchRecord(patch, earth.levels);
  }

  mergeNormalizedStatePatchRecord(patch, raw.statePatch);
  return sceneHasEntries(patch) ? patch : undefined;
}

function sceneHasEntries(scene: object): boolean {
  return Object.keys(scene).length > 0;
}

function captureRoutingMuteGroupScene(state: SliderState): RoutingMuteGroupSceneSnapshot {
  const patch: RoutingMuteGroupStatePatch = {};
  for (const key of getRoutingMuteGroupBooleanStateKeys(state)) {
    assignStatePatchValue(patch, key, Boolean(state[key]));
  }
  return patch;
}

function mergeRoutingMuteGroupScenes(
  base: RoutingMuteGroupSceneSnapshot,
  slot: Pick<RoutingMuteGroupSlot, 'statePatch'>,
): RoutingMuteGroupSceneSnapshot {
  return {
    ...base,
    ...(slot.statePatch ?? {}),
  };
}

function clampPhraseCount(value: number, fallback: number): number {
  const source = Number.isFinite(value) ? value : fallback;
  const quantized = Math.round(source / ROUTING_MUTE_GROUP_PHRASE_STEP) * ROUTING_MUTE_GROUP_PHRASE_STEP;
  return Math.max(ROUTING_MUTE_GROUP_MIN_PHRASES, Math.min(ROUTING_MUTE_GROUP_MAX_PHRASES, quantized));
}

export function routingMuteGroupSlotColor(slotIndex: number, _slot?: RoutingMuteGroupSlot | null): string {
  return ROUTING_MUTE_GROUP_SLOT_COLORS[
    Math.max(0, Math.min(ROUTING_MUTE_GROUP_SLOT_COLORS.length - 1, slotIndex))
  ] ?? ROUTING_MUTE_GROUP_SLOT_COLORS[0];
}

export function normalizeRoutingMuteGroupPhraseRange(
  value: unknown,
  fallback: RoutingMuteGroupPhraseRange = {
    min: ROUTING_MUTE_GROUP_DEFAULT_MIN_PHRASES,
    max: ROUTING_MUTE_GROUP_DEFAULT_MAX_PHRASES,
  },
): RoutingMuteGroupPhraseRange {
  const raw = value && typeof value === 'object'
    ? value as Partial<RoutingMuteGroupPhraseRange>
    : {};
  const min = clampPhraseCount(Number(raw.min), fallback.min);
  const max = clampPhraseCount(Number(raw.max), fallback.max);
  return min <= max ? { min, max } : { min: max, max: min };
}

function normalizeEligibleSlotIndexes(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = [...new Set(value
    .filter((index): index is number => Number.isInteger(index))
    .map((index) => Math.max(0, Math.min(ROUTING_MUTE_GROUP_SLOT_COUNT - 1, index))))];
  normalized.sort((left, right) => left - right);
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeRoutingMuteGroupRandomSettings(value: unknown): RoutingMuteGroupRandomSettings {
  const raw = value && typeof value === 'object'
    ? value as Partial<RoutingMuteGroupRandomSettings>
    : {};
  const defaultRange = normalizeRoutingMuteGroupPhraseRange({
    min: raw.defaultMinPhrases,
    max: raw.defaultMaxPhrases,
  });
  const eligibleSlotIndexes = normalizeEligibleSlotIndexes(raw.eligibleSlotIndexes);
  return {
    enabled: raw.enabled === true,
    defaultMinPhrases: defaultRange.min,
    defaultMaxPhrases: defaultRange.max,
    transitionPhrases: clampPhraseCount(Number(raw.transitionPhrases), ROUTING_MUTE_GROUP_DEFAULT_TRANSITION_PHRASES),
    avoidRepeat: raw.avoidRepeat !== false,
    ...(eligibleSlotIndexes ? { eligibleSlotIndexes } : {}),
  };
}

export function routingMuteGroupSlotPhraseRange(
  slot: RoutingMuteGroupSlot | null | undefined,
  randomSettings: RoutingMuteGroupRandomSettings,
): RoutingMuteGroupPhraseRange {
  return normalizeRoutingMuteGroupPhraseRange(slot?.phraseRange, {
    min: randomSettings.defaultMinPhrases,
    max: randomSettings.defaultMaxPhrases,
  });
}

export function createEmptyRoutingMuteGroupsState(): RoutingMuteGroupsState {
  return {
    schemaVersion: ROUTING_MUTE_GROUP_SCHEMA_VERSION,
    slots: Array.from({ length: ROUTING_MUTE_GROUP_SLOT_COUNT }, () => null),
    random: normalizeRoutingMuteGroupRandomSettings(undefined),
  };
}

export function normalizeRoutingMuteGroupSlot(value: unknown): RoutingMuteGroupSlot | null {
  if (!value || typeof value !== 'object') return null;
  const rawIds = (value as Partial<RoutingMuteGroupSlot>).mutedSourceIds;
  const deduped = [...new Set((Array.isArray(rawIds) ? rawIds : []).filter(isEligibleRoutingMuteGroupSourceId))];
  deduped.sort((left, right) => (SOURCE_ORDER.get(left) ?? 0) - (SOURCE_ORDER.get(right) ?? 0));

  const statePatch = normalizeRoutingMuteGroupStatePatchFromSlot(value);
  if (!Array.isArray(rawIds) && !statePatch) return null;

  const raw = value as Partial<RoutingMuteGroupSlot>;
  const phraseRange = raw.phraseRange ? normalizeRoutingMuteGroupPhraseRange(raw.phraseRange) : undefined;

  return {
    mutedSourceIds: deduped,
    ...(statePatch ? { statePatch } : {}),
    ...(phraseRange ? { phraseRange } : {}),
  };
}

export function normalizeRoutingMuteGroupScenePayload(value: unknown): RoutingMuteGroupScenePayload | null {
  const slot = normalizeRoutingMuteGroupSlot(value);
  if (!slot) return null;
  return {
    schemaVersion: ROUTING_MUTE_GROUP_SCENE_SCHEMA_VERSION,
    mutedSourceIds: slot.mutedSourceIds,
    ...(slot.statePatch ? { statePatch: slot.statePatch } : {}),
  };
}

export function routingMuteGroupSlotScenePayload(
  slot: RoutingMuteGroupSlot | null | undefined,
): RoutingMuteGroupScenePayload | null {
  return normalizeRoutingMuteGroupScenePayload(slot);
}

export function routingMuteGroupSlotFromScenePayload(
  scene: RoutingMuteGroupScenePayload | null | undefined,
  options: { phraseRange?: RoutingMuteGroupPhraseRange } = {},
): RoutingMuteGroupSlot | null {
  const normalizedScene = normalizeRoutingMuteGroupScenePayload(scene);
  if (!normalizedScene) return null;
  return normalizeRoutingMuteGroupSlot({
    mutedSourceIds: normalizedScene.mutedSourceIds,
    ...(normalizedScene.statePatch ? { statePatch: normalizedScene.statePatch } : {}),
    ...(options.phraseRange ? { phraseRange: options.phraseRange } : {}),
  });
}

export function normalizeRoutingMuteGroupSceneRefSlot(value: unknown): RoutingMuteGroupSceneRefSlot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<RoutingMuteGroupSceneRefSlot>;
  const sceneHash = typeof raw.sceneHash === 'string' ? raw.sceneHash.trim() : '';
  if (!sceneHash) return null;
  const phraseRange = raw.phraseRange ? normalizeRoutingMuteGroupPhraseRange(raw.phraseRange) : undefined;
  return {
    sceneHash,
    ...(phraseRange ? { phraseRange } : {}),
  };
}

export function isRoutingMuteGroupSceneRefSlot(value: unknown): value is RoutingMuteGroupSceneRefSlot {
  return normalizeRoutingMuteGroupSceneRefSlot(value) !== null;
}

export function normalizeRoutingMuteGroupsStorageState(value: unknown): RoutingMuteGroupsStorageState {
  const rawSlots: unknown[] = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as Partial<RoutingMuteGroupsStorageState>).slots)
      ? (value as Partial<RoutingMuteGroupsStorageState>).slots ?? []
      : [];

  const slots = Array.from({ length: ROUTING_MUTE_GROUP_SLOT_COUNT }, (_, index) => (
    normalizeRoutingMuteGroupSceneRefSlot(rawSlots[index])
  ));

  const random = value && typeof value === 'object' && !Array.isArray(value)
    ? normalizeRoutingMuteGroupRandomSettings((value as Partial<RoutingMuteGroupsStorageState>).random)
    : normalizeRoutingMuteGroupRandomSettings(undefined);

  return { schemaVersion: ROUTING_MUTE_GROUP_SCHEMA_VERSION, slots, random };
}

export function normalizeRoutingMuteGroupsState(value: unknown): RoutingMuteGroupsState {
  const rawSlots: unknown[] = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as Partial<RoutingMuteGroupsState>).slots)
      ? (value as Partial<RoutingMuteGroupsState>).slots ?? []
      : [];

  const slots = Array.from({ length: ROUTING_MUTE_GROUP_SLOT_COUNT }, (_, index) => (
    normalizeRoutingMuteGroupSlot(rawSlots[index])
  ));

  const random = value && typeof value === 'object' && !Array.isArray(value)
    ? normalizeRoutingMuteGroupRandomSettings((value as Partial<RoutingMuteGroupsState>).random)
    : normalizeRoutingMuteGroupRandomSettings(undefined);

  return { schemaVersion: ROUTING_MUTE_GROUP_SCHEMA_VERSION, slots, random };
}

export type CaptureRoutingMuteGroupSlotOptions = {
  sourceIds?: readonly RoutingRowId[];
  effectiveMutedSourceIds?: readonly RoutingMuteGroupSourceId[];
  phraseRange?: RoutingMuteGroupPhraseRange;
};

export function captureRoutingMuteGroupSlot(
  state: SliderState,
  optionsOrSourceIds: CaptureRoutingMuteGroupSlotOptions | readonly RoutingRowId[] = {},
): RoutingMuteGroupSlot {
  const options: CaptureRoutingMuteGroupSlotOptions = Array.isArray(optionsOrSourceIds)
    ? { sourceIds: optionsOrSourceIds as readonly RoutingRowId[] }
    : optionsOrSourceIds as CaptureRoutingMuteGroupSlotOptions;
  const sourceIds = options.sourceIds ?? ROUTING_MUTE_GROUP_SOURCE_IDS;
  const effectiveMuted = new Set<RoutingMuteGroupSourceId>(options.effectiveMutedSourceIds ?? []);
  const slot = normalizeRoutingMuteGroupSlot({
    mutedSourceIds: eligibleSourceDefs(sourceIds)
      .filter((source) => effectiveMuted.has(source.id as RoutingMuteGroupSourceId) || !source.isAudible(state))
      .map((source) => source.id as RoutingMuteGroupSourceId),
    statePatch: captureRoutingMuteGroupScene(state),
    ...(options.phraseRange ? { phraseRange: options.phraseRange } : {}),
  });
  return slot ?? { mutedSourceIds: [], statePatch: captureRoutingMuteGroupScene(state) };
}

export function setRoutingMuteGroupSlot(
  state: RoutingMuteGroupsState,
  slotIndex: number,
  slot: RoutingMuteGroupSlot | null,
): RoutingMuteGroupsState {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= ROUTING_MUTE_GROUP_SLOT_COUNT) {
    return normalizeRoutingMuteGroupsState(state);
  }
  const normalized = normalizeRoutingMuteGroupsState(state);
  const slots = [...normalized.slots];
  slots[slotIndex] = normalizeRoutingMuteGroupSlot(slot);
  return { ...normalized, slots };
}

export function setRoutingMuteGroupSlotPhraseRange(
  state: RoutingMuteGroupsState,
  slotIndex: number,
  range: RoutingMuteGroupPhraseRange,
): RoutingMuteGroupsState {
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= ROUTING_MUTE_GROUP_SLOT_COUNT) {
    return normalizeRoutingMuteGroupsState(state);
  }
  const normalized = normalizeRoutingMuteGroupsState(state);
  const slot = normalized.slots[slotIndex];
  if (!slot) return normalized;
  const slots = [...normalized.slots];
  slots[slotIndex] = normalizeRoutingMuteGroupSlot({
    ...slot,
    phraseRange: normalizeRoutingMuteGroupPhraseRange(range, routingMuteGroupSlotPhraseRange(slot, normalized.random ?? normalizeRoutingMuteGroupRandomSettings(undefined))),
  });
  return { ...normalized, slots };
}

export function setRoutingMuteGroupRandomSettings(
  state: RoutingMuteGroupsState,
  patch: Partial<RoutingMuteGroupRandomSettings>,
): RoutingMuteGroupsState {
  const normalized = normalizeRoutingMuteGroupsState(state);
  return {
    ...normalized,
    random: normalizeRoutingMuteGroupRandomSettings({
      ...(normalized.random ?? normalizeRoutingMuteGroupRandomSettings(undefined)),
      ...patch,
    }),
  };
}

export function isRoutingMuteGroupSlotStored(slot: RoutingMuteGroupSlot | null | undefined): slot is RoutingMuteGroupSlot {
  return !!slot;
}

export function routingMuteGroupSlotMuteCount(slot: RoutingMuteGroupSlot | null | undefined): number {
  if (!slot) return 0;
  let stateMuted = 0;
  const mutedSourceIds = new Set<RoutingMuteGroupSourceId>(slot.mutedSourceIds);
  const sourceKeysCoveredByMutedRows = new Set<keyof SliderState>();
  for (const sourceId of mutedSourceIds) {
    for (const key of getRoutingSourceDef(sourceId)?.enabledKeys ?? []) {
      sourceKeysCoveredByMutedRows.add(key);
    }
  }
  for (const [key, value] of Object.entries(slot.statePatch ?? {})) {
    if (isRoutingMuteGroupBooleanStateKey(key)) {
      if (sourceKeysCoveredByMutedRows.has(key as keyof SliderState)) continue;
      if (key.endsWith('Solo') ? value === true : value === false) stateMuted += 1;
    }
  }
  return slot.mutedSourceIds.length + stateMuted;
}

export function routingMuteGroupSlotTotalCount(slot: RoutingMuteGroupSlot | null | undefined): number {
  if (!slot) return ROUTING_MUTE_GROUP_SOURCE_IDS.length;
  const mutedSourceIds = new Set<RoutingMuteGroupSourceId>(slot.mutedSourceIds);
  const sourceKeysCoveredByMutedRows = new Set<keyof SliderState>();
  for (const sourceId of mutedSourceIds) {
    for (const key of getRoutingSourceDef(sourceId)?.enabledKeys ?? []) {
      sourceKeysCoveredByMutedRows.add(key);
    }
  }
  let independentBooleanCount = 0;
  for (const key of Object.keys(slot.statePatch ?? {})) {
    if (isRoutingMuteGroupBooleanStateKey(key)) {
      if (!sourceKeysCoveredByMutedRows.has(key as keyof SliderState)) {
        independentBooleanCount += 1;
      }
    }
  }
  return ROUTING_MUTE_GROUP_SOURCE_IDS.length + independentBooleanCount;
}

export function routingMuteGroupSlotActiveCount(slot: RoutingMuteGroupSlot | null | undefined): number {
  if (!slot) return 0;
  return routingMuteGroupSlotTotalCount(slot) - routingMuteGroupSlotMuteCount(slot);
}

export interface RoutingMuteGroupSlotSeqSummary {
  prefix: string;
  label: string;
  on: number;
  total: number;
}

export function routingMuteGroupSlotSeqSummaries(slot: RoutingMuteGroupSlot | null | undefined): RoutingMuteGroupSlotSeqSummary[] {
  if (!slot?.statePatch) return [];
  const groups: Record<string, { on: number; total: number; label: string }> = {};
  for (const [key, value] of Object.entries(slot.statePatch)) {
    let prefix: string | null = null;
    let label: string | null = null;
    if (key.startsWith('drumEuclid') && key.endsWith('Enabled')) {
      prefix = 'drumEuclid';
      label = 'Dr';
    } else if (key.startsWith('synthEuclid') && key.endsWith('Enabled')) {
      prefix = 'synthEuclid';
      label = 'Syn';
    } else if (key.startsWith('granularV') && key.endsWith('Enabled')) {
      prefix = 'granularV';
      label = 'Gr';
    }
    if (!prefix || !label) continue;
    const group = groups[prefix] ?? (groups[prefix] = { on: 0, total: 0, label });
    group.total += 1;
    if (value === true) group.on += 1;
  }
  return Object.entries(groups).map(([prefix, data]) => ({
    prefix,
    label: data.label,
    on: data.on,
    total: data.total,
  }));
}

function restoreEnabledSnapshot(
  snapshot: EnabledSnapshot,
  onBooleanParamChange: (key: keyof SliderState, value: boolean) => void,
): void {
  for (const [key, value] of Object.entries(snapshot)) {
    onBooleanParamChange(key as keyof SliderState, Boolean(value));
  }
}

function desiredSourceEnabledSnapshot(
  source: RoutingSourceDef,
  scene: RoutingMuteGroupSceneSnapshot,
  fallbackState: SliderState,
): EnabledSnapshot {
  const snapshot: EnabledSnapshot = {};
  for (const key of source.enabledKeys ?? []) {
    const value = scene[key];
    snapshot[key] = typeof value === 'boolean' ? value : Boolean(fallbackState[key]);
  }
  return snapshot;
}

function enabledSnapshotMatches(state: SliderState, snapshot: EnabledSnapshot): boolean {
  for (const [key, value] of Object.entries(snapshot)) {
    if (Boolean(state[key as keyof SliderState]) !== Boolean(value)) return false;
  }
  return true;
}

function snapshotAnyEnabled(snapshot: EnabledSnapshot): boolean {
  return Object.values(snapshot).some(Boolean);
}

function numericLevel(state: SliderState, key: keyof SliderState): number {
  const value = state[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function sourceBooleanKeys(sourceDefs: readonly RoutingSourceDef[]): Set<keyof SliderState> {
  const keys = new Set<keyof SliderState>();
  for (const source of sourceDefs) {
    for (const key of source.enabledKeys ?? []) {
      keys.add(key);
    }
  }
  return keys;
}

function runtimeLevelPatch(
  key: keyof SliderState,
  value: number | null,
): RoutingMuteGroupRuntimeLevelPatch {
  return { [key]: value } as RoutingMuteGroupRuntimeLevelPatch;
}

function levelRampSteps(
  from: number,
  to: number,
  durationMs: number,
): RampStep[] {
  if (durationMs <= 0 || from === to) {
    return [{ delayMs: 0, value: to }];
  }

  const stepCount = Math.max(1, Math.min(
    ROUTING_MUTE_GROUP_MAX_RAMP_STEPS,
    Math.ceil(durationMs / ROUTING_MUTE_GROUP_RAMP_STEP_MS),
  ));
  const steps: RampStep[] = [];
  for (let step = 1; step <= stepCount; step++) {
    const progress = step / stepCount;
    const easedProgress = progress * progress * (3 - 2 * progress);
    steps.push({
      delayMs: Math.round(durationMs * progress),
      value: from + (to - from) * easedProgress,
    });
  }
  return steps;
}

export function createRoutingMuteGroupTransitionController({
  getState,
  onRuntimeLevelPatchChange,
  onBooleanParamChange,
  onActiveSlotChange,
  eligibleSourceIds = DEFAULT_ROUTING_MUTE_GROUP_SOURCE_IDS,
  fadeDownMs = ROUTING_MUTE_GROUP_FADE_DOWN_MS,
  fadeUpMs = ROUTING_MUTE_GROUP_FADE_UP_MS,
  enableSettleMs = ROUTING_MUTE_GROUP_ENABLE_SETTLE_MS,
  scheduler = DEFAULT_SCHEDULER,
}: RoutingMuteGroupTransitionControllerOptions): RoutingMuteGroupTransitionController {
  let generation = 0;
  let activeSlotIndex: number | null = null;
  const pendingTimeouts = new Set<TimeoutHandle>();
  const scheduledRuntimeLevelPatches = new Map<number, RoutingMuteGroupRuntimeLevelPatch>();
  const groupControlledSources = new Set<RoutingRowId>();
  const targetMutedSourceIds = new Set<RoutingMuteGroupSourceId>();
  let rememberedScene: RoutingMuteGroupSceneSnapshot | null = null;

  const sourceDefs = eligibleSourceDefs(eligibleSourceIds);
  const sourceSceneKeys = sourceBooleanKeys(sourceDefs);

  const isCurrentGeneration = (token: number) => token === generation;
  const resolveTransition = (options?: RoutingMuteGroupTransitionOptions): ResolvedRoutingMuteGroupTransition => {
    const transitionMs = typeof options?.transitionMs === 'number' && Number.isFinite(options.transitionMs)
      ? Math.max(0, options.transitionMs)
      : undefined;
    const resolvedFadeDownMs = typeof options?.fadeDownMs === 'number' && Number.isFinite(options.fadeDownMs)
      ? Math.max(0, options.fadeDownMs)
      : transitionMs ?? fadeDownMs;
    const resolvedFadeUpMs = typeof options?.fadeUpMs === 'number' && Number.isFinite(options.fadeUpMs)
      ? Math.max(0, options.fadeUpMs)
      : transitionMs ?? fadeUpMs;
    return {
      fadeDownMs: resolvedFadeDownMs,
      fadeUpMs: resolvedFadeUpMs,
    };
  };

  const clearPendingTimeouts = () => {
    for (const timeout of pendingTimeouts) {
      scheduler.clearTimeout(timeout);
    }
    pendingTimeouts.clear();
    scheduledRuntimeLevelPatches.clear();
  };

  const schedule = (token: number, delayMs: number, callback: () => void) => {
    const handle = scheduler.setTimeout(() => {
      pendingTimeouts.delete(handle);
      if (!isCurrentGeneration(token)) return;
      callback();
    }, Math.max(0, delayMs));
    pendingTimeouts.add(handle);
  };

  const applyRuntimeLevelPatch = (
    patch: RoutingMuteGroupRuntimeLevelPatch,
    options?: RoutingMuteGroupRuntimeLevelPatchOptions,
  ) => {
    if (Object.keys(patch).length > 0) {
      onRuntimeLevelPatchChange(patch, options);
    }
  };

  const scheduleRuntimeLevelPatch = (
    token: number,
    delayMs: number,
    patch: RoutingMuteGroupRuntimeLevelPatch,
    options?: RoutingMuteGroupRuntimeLevelPatchOptions,
  ) => {
    const normalizedDelayMs = Math.max(0, Math.round(delayMs));
    const existingPatch = scheduledRuntimeLevelPatches.get(normalizedDelayMs);
    if (existingPatch) {
      Object.assign(existingPatch, patch);
      return;
    }

    const scheduledPatch = { ...patch };
    scheduledRuntimeLevelPatches.set(normalizedDelayMs, scheduledPatch);
    schedule(token, normalizedDelayMs, () => {
      scheduledRuntimeLevelPatches.delete(normalizedDelayMs);
      applyRuntimeLevelPatch(scheduledPatch, options);
    });
  };

  const applyScene = (scene: RoutingMuteGroupSceneSnapshot) => {
    const liveState = getState();
    const applyBooleanValue = (key: RoutingMuteGroupBooleanStateKey, value: boolean) => {
      if (Boolean(liveState[key]) !== value) {
        onBooleanParamChange(key, value);
      }
    };

    const entries = Object.entries(scene).filter(([key, value]) => (
      typeof value === 'boolean'
      && isRoutingMuteGroupBooleanStateKey(key)
      && !sourceSceneKeys.has(key as keyof SliderState)
    )) as [RoutingMuteGroupBooleanStateKey, boolean][];

    for (const [key, value] of entries) {
      if (value === false) applyBooleanValue(key, value);
    }

    for (const [key, value] of entries) {
      if (value === true) applyBooleanValue(key, value);
    }
  };

  const muteSource = (
    source: RoutingSourceDef,
    token: number,
    transition: ResolvedRoutingMuteGroupTransition,
  ) => {
    const liveState = getState();
    groupControlledSources.add(source.id);
    targetMutedSourceIds.add(source.id as RoutingMuteGroupSourceId);

    for (const step of levelRampSteps(numericLevel(liveState, source.levelKey), 0, transition.fadeDownMs)) {
      scheduleRuntimeLevelPatch(token, step.delayMs, runtimeLevelPatch(source.levelKey, step.value));
    }

    schedule(token, transition.fadeDownMs, () => {
      for (const key of source.enabledKeys ?? []) {
        if (Boolean(getState()[key])) onBooleanParamChange(key, false);
      }
    });
  };

  const restoreSourceToScene = (
    source: RoutingSourceDef,
    scene: RoutingMuteGroupSceneSnapshot,
    token: number,
    transition: ResolvedRoutingMuteGroupTransition,
  ) => {
    const liveState = getState();
    const enabledSnapshot = desiredSourceEnabledSnapshot(source, scene, liveState);
    const enabledChanged = !enabledSnapshotMatches(liveState, enabledSnapshot);
    const wasGroupControlled = groupControlledSources.has(source.id);
    const shouldEnableFromZero = snapshotAnyEnabled(enabledSnapshot) && (wasGroupControlled || enabledChanged);

    if (!wasGroupControlled && !enabledChanged) return;
    if (!shouldEnableFromZero) {
      if (enabledChanged) {
        restoreEnabledSnapshot(enabledSnapshot, onBooleanParamChange);
      }
      if (wasGroupControlled) {
        applyRuntimeLevelPatch(runtimeLevelPatch(source.levelKey, null), { immediate: true });
        groupControlledSources.delete(source.id);
        targetMutedSourceIds.delete(source.id as RoutingMuteGroupSourceId);
      }
      return;
    }

    applyRuntimeLevelPatch(runtimeLevelPatch(source.levelKey, 0), { immediate: true });
    if (enabledChanged) {
      restoreEnabledSnapshot(enabledSnapshot, onBooleanParamChange);
    }

    const targetLevel = numericLevel(liveState, source.levelKey);
    for (const step of levelRampSteps(0, targetLevel, transition.fadeUpMs)) {
      scheduleRuntimeLevelPatch(token, enableSettleMs + step.delayMs, runtimeLevelPatch(source.levelKey, step.value));
    }

    schedule(token, enableSettleMs + transition.fadeUpMs + 1, () => {
      applyRuntimeLevelPatch(runtimeLevelPatch(source.levelKey, null), { immediate: true });
      groupControlledSources.delete(source.id);
      targetMutedSourceIds.delete(source.id as RoutingMuteGroupSourceId);
    });
  };

  const applyPattern = (
    slot: RoutingMuteGroupSlot | null,
    nextActiveSlotIndex: number | null,
    options?: RoutingMuteGroupTransitionOptions,
  ) => {
    clearPendingTimeouts();
    generation += 1;
    const token = generation;
    const transition = resolveTransition(options);
    if (nextActiveSlotIndex !== null && rememberedScene === null) {
      rememberedScene = captureRoutingMuteGroupScene(getState());
    }
    const sceneBase = rememberedScene ?? captureRoutingMuteGroupScene(getState());
    const scene = slot ? mergeRoutingMuteGroupScenes(sceneBase, slot) : sceneBase;
    applyScene(scene);

    const mutedSourceIds = slot?.mutedSourceIds ?? [];
    const mutedSourceIdSet = new Set<RoutingRowId>(mutedSourceIds);
    targetMutedSourceIds.clear();
    for (const sourceId of mutedSourceIds) {
      targetMutedSourceIds.add(sourceId);
    }

    for (const source of sourceDefs) {
      if (mutedSourceIdSet.has(source.id)) {
        muteSource(source, token, transition);
      } else {
        restoreSourceToScene(source, scene, token, transition);
      }
    }

    activeSlotIndex = nextActiveSlotIndex;
    onActiveSlotChange?.(activeSlotIndex);
    if (nextActiveSlotIndex === null) {
      rememberedScene = null;
    }
  };

  return {
    recall(slot, slotIndex, options) {
      const normalized = normalizeRoutingMuteGroupSlot(slot);
      if (!normalized) return;
      applyPattern(normalized, slotIndex, options);
    },
    release(options) {
      applyPattern(null, null, options);
    },
    cancel() {
      clearPendingTimeouts();
      generation += 1;
      const clearedRuntimeLevels: RoutingMuteGroupRuntimeLevelPatch = {};
      for (const source of sourceDefs) {
        if (groupControlledSources.has(source.id)) {
          clearedRuntimeLevels[source.levelKey] = null;
        }
      }
      applyRuntimeLevelPatch(clearedRuntimeLevels, { immediate: true });
      groupControlledSources.clear();
      targetMutedSourceIds.clear();
    },
    getActiveSlotIndex() {
      return activeSlotIndex;
    },
    getEffectiveMutedSourceIds() {
      return [...targetMutedSourceIds];
    },
  };
}
