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
export const ROUTING_MUTE_GROUP_SLOT_COUNT = 8;
export const ROUTING_MUTE_GROUP_FADE_DOWN_MS = 96;
export const ROUTING_MUTE_GROUP_FADE_UP_MS = 120;
export const ROUTING_MUTE_GROUP_ENABLE_SETTLE_MS = 16;

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

export interface RoutingMuteGroupSlot {
  mutedSourceIds: RoutingMuteGroupSourceId[];
  statePatch?: RoutingMuteGroupStatePatch;
  savedAt?: string;
  revision?: number;
}

export interface RoutingMuteGroupsState {
  schemaVersion?: 2;
  slots: (RoutingMuteGroupSlot | null)[];
}

type EnabledSnapshot = Partial<Record<keyof SliderState, boolean>>;

type RoutingMuteGroupSceneSnapshot = RoutingMuteGroupStatePatch;

type TimeoutHandle = ReturnType<typeof setTimeout>;
type RampStep = {
  delayMs: number;
  value: number;
};

export type RoutingMuteGroupScheduler = {
  setTimeout: (callback: () => void, delayMs: number) => TimeoutHandle;
  clearTimeout: (handle: TimeoutHandle) => void;
};

export type RoutingMuteGroupTransitionControllerOptions = {
  getState: () => SliderState;
  onRuntimeLevelPatchChange: (patch: RoutingMuteGroupRuntimeLevelPatch) => void;
  onBooleanParamChange: (key: keyof SliderState, value: boolean) => void;
  onActiveSlotChange?: (slotIndex: number | null) => void;
  eligibleSourceIds?: readonly RoutingRowId[];
  fadeDownMs?: number;
  fadeUpMs?: number;
  enableSettleMs?: number;
  scheduler?: RoutingMuteGroupScheduler;
};

export type RoutingMuteGroupTransitionController = {
  recall: (slot: RoutingMuteGroupSlot, slotIndex: number) => void;
  release: () => void;
  cancel: () => void;
  getActiveSlotIndex: () => number | null;
  getEffectiveMutedSourceIds: () => readonly RoutingMuteGroupSourceId[];
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

export function createEmptyRoutingMuteGroupsState(): RoutingMuteGroupsState {
  return {
    schemaVersion: 2,
    slots: Array.from({ length: ROUTING_MUTE_GROUP_SLOT_COUNT }, () => null),
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
  const savedAt = typeof raw.savedAt === 'string' && raw.savedAt.trim().length > 0 ? raw.savedAt : undefined;
  const revision = Number.isInteger(raw.revision) && Number(raw.revision) >= 0 ? Number(raw.revision) : undefined;

  return {
    mutedSourceIds: deduped,
    ...(statePatch ? { statePatch } : {}),
    ...(savedAt ? { savedAt } : {}),
    ...(revision !== undefined ? { revision } : {}),
  };
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

  return { schemaVersion: 2, slots };
}

export type CaptureRoutingMuteGroupSlotOptions = {
  sourceIds?: readonly RoutingRowId[];
  effectiveMutedSourceIds?: readonly RoutingMuteGroupSourceId[];
  savedAt?: string;
  revision?: number;
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
    savedAt: options.savedAt ?? new Date().toISOString(),
    revision: options.revision ?? 1,
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
  return { schemaVersion: 2, slots };
}

export function incrementSlotRevision(previous: RoutingMuteGroupSlot | null | undefined): number {
  return Number.isInteger(previous?.revision) && Number(previous?.revision) >= 0
    ? Number(previous?.revision) + 1
    : 1;
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

  const stepCount = Math.max(1, Math.min(6, Math.ceil(durationMs / 24)));
  const steps: RampStep[] = [];
  for (let step = 1; step <= stepCount; step++) {
    const progress = step / stepCount;
    steps.push({
      delayMs: Math.round(durationMs * progress),
      value: from + (to - from) * progress,
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

  const applyRuntimeLevelPatch = (patch: RoutingMuteGroupRuntimeLevelPatch) => {
    if (Object.keys(patch).length > 0) {
      onRuntimeLevelPatchChange(patch);
    }
  };

  const scheduleRuntimeLevelPatch = (
    token: number,
    delayMs: number,
    patch: RoutingMuteGroupRuntimeLevelPatch,
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
      applyRuntimeLevelPatch(scheduledPatch);
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

  const muteSource = (source: RoutingSourceDef, token: number) => {
    const liveState = getState();
    groupControlledSources.add(source.id);
    targetMutedSourceIds.add(source.id as RoutingMuteGroupSourceId);

    for (const step of levelRampSteps(numericLevel(liveState, source.levelKey), 0, fadeDownMs)) {
      scheduleRuntimeLevelPatch(token, step.delayMs, runtimeLevelPatch(source.levelKey, step.value));
    }

    schedule(token, fadeDownMs, () => {
      for (const key of source.enabledKeys ?? []) {
        if (Boolean(getState()[key])) onBooleanParamChange(key, false);
      }
    });
  };

  const restoreSourceToScene = (
    source: RoutingSourceDef,
    scene: RoutingMuteGroupSceneSnapshot,
    token: number,
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
        applyRuntimeLevelPatch(runtimeLevelPatch(source.levelKey, null));
        groupControlledSources.delete(source.id);
        targetMutedSourceIds.delete(source.id as RoutingMuteGroupSourceId);
      }
      return;
    }

    applyRuntimeLevelPatch(runtimeLevelPatch(source.levelKey, 0));
    if (enabledChanged) {
      restoreEnabledSnapshot(enabledSnapshot, onBooleanParamChange);
    }

    const targetLevel = numericLevel(liveState, source.levelKey);
    for (const step of levelRampSteps(0, targetLevel, fadeUpMs)) {
      scheduleRuntimeLevelPatch(token, enableSettleMs + step.delayMs, runtimeLevelPatch(source.levelKey, step.value));
    }

    schedule(token, enableSettleMs + fadeUpMs + 1, () => {
      applyRuntimeLevelPatch(runtimeLevelPatch(source.levelKey, null));
      groupControlledSources.delete(source.id);
      targetMutedSourceIds.delete(source.id as RoutingMuteGroupSourceId);
    });
  };

  const applyPattern = (slot: RoutingMuteGroupSlot | null, nextActiveSlotIndex: number | null) => {
    clearPendingTimeouts();
    generation += 1;
    const token = generation;
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
        muteSource(source, token);
      } else {
        restoreSourceToScene(source, scene, token);
      }
    }

    activeSlotIndex = nextActiveSlotIndex;
    onActiveSlotChange?.(activeSlotIndex);
    if (nextActiveSlotIndex === null) {
      rememberedScene = null;
    }
  };

  return {
    recall(slot, slotIndex) {
      const normalized = normalizeRoutingMuteGroupSlot(slot);
      if (!normalized) return;
      applyPattern(normalized, slotIndex);
    },
    release() {
      applyPattern(null, null);
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
      applyRuntimeLevelPatch(clearedRuntimeLevels);
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
