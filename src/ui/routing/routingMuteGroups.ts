import type { SliderState } from '../state';
import {
  getRoutingSourceDef,
  ROUTING_SOURCE_REGISTRY,
  type RoutingRowId,
  type RoutingSourceDef,
} from './routingSourceRegistry';

export const ROUTING_MUTE_GROUP_STORAGE_KEY = 'kessho:routing-mute-groups:v1';
export const ROUTING_MUTE_GROUP_SLOT_COUNT = 8;
export const ROUTING_MUTE_GROUP_FADE_DOWN_MS = 96;
export const ROUTING_MUTE_GROUP_FADE_UP_MS = 120;
export const ROUTING_MUTE_GROUP_ENABLE_SETTLE_MS = 16;

export const DEFAULT_ROUTING_MUTE_GROUP_SOURCE_IDS = [
  'pad1',
  'pad2',
  'lead1',
  'lead2',
  'piano',
  'drums',
  'granular',
  'waves',
  'water',
  'insects',
  'nature',
] as const satisfies readonly RoutingRowId[];

export type RoutingMuteGroupSourceId = (typeof DEFAULT_ROUTING_MUTE_GROUP_SOURCE_IDS)[number];

export const ROUTING_MUTE_GROUP_SEQUENCER_BOOLEAN_KEYS = [
  'drumEuclid1Enabled',
  'drumEuclid1Solo',
  'drumEuclid2Enabled',
  'drumEuclid2Solo',
  'drumEuclid3Enabled',
  'drumEuclid3Solo',
  'drumEuclid4Enabled',
  'drumEuclid4Solo',
  'drumEuclid5Enabled',
  'drumEuclid5Solo',
  'drumEuclid6Enabled',
  'drumEuclid6Solo',
  'synthEuclid1Enabled',
  'synthEuclid1Solo',
  'synthEuclid2Enabled',
  'synthEuclid2Solo',
  'synthEuclid3Enabled',
  'synthEuclid3Solo',
  'synthEuclid4Enabled',
  'synthEuclid4Solo',
  'granularV1Enabled',
  'granularV2Enabled',
  'granularV3Enabled',
  'granularV4Enabled',
] as const satisfies readonly (keyof SliderState)[];

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
  DEFAULT_ROUTING_MUTE_GROUP_SOURCE_IDS.flatMap((sourceId) => getRoutingSourceDef(sourceId)?.enabledKeys ?? []),
);

export type RoutingMuteGroupSequencerBooleanKey = (typeof ROUTING_MUTE_GROUP_SEQUENCER_BOOLEAN_KEYS)[number];
export type RoutingMuteGroupEarthBooleanKey = (typeof ROUTING_MUTE_GROUP_EARTH_BOOLEAN_KEYS)[number];
export type RoutingMuteGroupSourceBooleanKey = keyof SliderState;
export const ROUTING_MUTE_GROUP_BOOLEAN_STATE_KEYS: readonly (keyof SliderState)[] = uniqueStateKeys([
  ...ROUTING_MUTE_GROUP_SOURCE_BOOLEAN_KEYS,
  ...ROUTING_MUTE_GROUP_SEQUENCER_BOOLEAN_KEYS,
  ...ROUTING_MUTE_GROUP_EARTH_BOOLEAN_KEYS,
]);
export type RoutingMuteGroupBooleanStateKey = keyof SliderState;
export type RoutingMuteGroupStatePatchKey = keyof SliderState;
export type RoutingMuteGroupStatePatch = Partial<SliderState>;

export interface RoutingMuteGroupSlot {
  mutedSourceIds: RoutingMuteGroupSourceId[];
  statePatch?: RoutingMuteGroupStatePatch;
}

export interface RoutingMuteGroupsState {
  slots: (RoutingMuteGroupSlot | null)[];
}

type EnabledSnapshot = Partial<Record<keyof SliderState, boolean>>;

type RoutingMuteGroupSceneSnapshot = RoutingMuteGroupStatePatch;

type TimeoutHandle = ReturnType<typeof setTimeout>;

export type RoutingMuteGroupScheduler = {
  setTimeout: (callback: () => void, delayMs: number) => TimeoutHandle;
  clearTimeout: (handle: TimeoutHandle) => void;
};

export type RoutingMuteGroupTransitionControllerOptions = {
  getState: () => SliderState;
  onRuntimeLevelChange: (key: keyof SliderState, value: number | null) => void;
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
};

const DEFAULT_SCHEDULER: RoutingMuteGroupScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

const ELIGIBLE_SOURCE_ID_SET = new Set<RoutingRowId>(DEFAULT_ROUTING_MUTE_GROUP_SOURCE_IDS);

const SOURCE_ORDER = new Map<RoutingRowId, number>(
  ROUTING_SOURCE_REGISTRY.map((source, index) => [source.id, index]),
);
const ROUTING_MUTE_GROUP_BOOLEAN_STATE_KEY_SET = new Set<keyof SliderState>(ROUTING_MUTE_GROUP_BOOLEAN_STATE_KEYS);

function isEligibleRoutingMuteGroupSourceId(value: unknown): value is RoutingMuteGroupSourceId {
  return typeof value === 'string' && ELIGIBLE_SOURCE_ID_SET.has(value as RoutingRowId);
}

function isRoutingMuteGroupBooleanStateKey(value: string): value is RoutingMuteGroupBooleanStateKey {
  return ROUTING_MUTE_GROUP_BOOLEAN_STATE_KEY_SET.has(value as keyof SliderState);
}

function eligibleSourceDefs(sourceIds: readonly RoutingRowId[] = DEFAULT_ROUTING_MUTE_GROUP_SOURCE_IDS): RoutingSourceDef[] {
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
  for (const key of ROUTING_MUTE_GROUP_BOOLEAN_STATE_KEYS) {
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

  return {
    mutedSourceIds: deduped,
    ...(statePatch ? { statePatch } : {}),
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

  return { slots };
}

export function captureRoutingMuteGroupSlot(
  state: SliderState,
  sourceIds: readonly RoutingRowId[] = DEFAULT_ROUTING_MUTE_GROUP_SOURCE_IDS,
): RoutingMuteGroupSlot {
  return {
    mutedSourceIds: eligibleSourceDefs(sourceIds)
      .filter((source) => !source.isAudible(state))
      .map((source) => source.id as RoutingMuteGroupSourceId),
    statePatch: captureRoutingMuteGroupScene(state),
  };
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
  return { slots };
}

export function isRoutingMuteGroupSlotStored(slot: RoutingMuteGroupSlot | null | undefined): slot is RoutingMuteGroupSlot {
  return !!slot;
}

export function routingMuteGroupSlotMuteCount(slot: RoutingMuteGroupSlot | null | undefined): number {
  if (!slot) return 0;
  let stateMuted = 0;
  for (const [key, value] of Object.entries(slot.statePatch ?? {})) {
    if (isRoutingMuteGroupBooleanStateKey(key)) {
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

function scheduleLevelRamp(
  from: number,
  to: number,
  durationMs: number,
  generation: number,
  schedule: (delayMs: number, callback: () => void) => void,
  isCurrentGeneration: (generation: number) => boolean,
  onValue: (value: number) => void,
): void {
  if (durationMs <= 0 || from === to) {
    onValue(to);
    return;
  }

  const stepCount = Math.max(1, Math.min(6, Math.ceil(durationMs / 24)));
  for (let step = 1; step <= stepCount; step++) {
    const progress = step / stepCount;
    const delayMs = Math.round(durationMs * progress);
    schedule(delayMs, () => {
      if (!isCurrentGeneration(generation)) return;
      onValue(from + (to - from) * progress);
    });
  }
}

export function createRoutingMuteGroupTransitionController({
  getState,
  onRuntimeLevelChange,
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
  const groupControlledSources = new Set<RoutingRowId>();
  let rememberedScene: RoutingMuteGroupSceneSnapshot | null = null;

  const sourceDefs = eligibleSourceDefs(eligibleSourceIds);
  const sourceSceneKeys = sourceBooleanKeys(sourceDefs);

  const isCurrentGeneration = (token: number) => token === generation;

  const clearPendingTimeouts = () => {
    for (const timeout of pendingTimeouts) {
      scheduler.clearTimeout(timeout);
    }
    pendingTimeouts.clear();
  };

  const schedule = (token: number, delayMs: number, callback: () => void) => {
    const handle = scheduler.setTimeout(() => {
      pendingTimeouts.delete(handle);
      if (!isCurrentGeneration(token)) return;
      callback();
    }, Math.max(0, delayMs));
    pendingTimeouts.add(handle);
  };

  const applyScene = (scene: RoutingMuteGroupSceneSnapshot) => {
    const liveState = getState();
    const applyBooleanValue = (key: RoutingMuteGroupBooleanStateKey, value: boolean) => {
      if (Boolean(liveState[key]) !== value) {
        onBooleanParamChange(key, value);
      }
    };

    for (const key of ROUTING_MUTE_GROUP_BOOLEAN_STATE_KEYS) {
      if (sourceSceneKeys.has(key)) continue;
      const value = scene[key];
      if (value === false) applyBooleanValue(key, value);
    }

    for (const key of ROUTING_MUTE_GROUP_BOOLEAN_STATE_KEYS) {
      if (sourceSceneKeys.has(key)) continue;
      const value = scene[key];
      if (value === true) applyBooleanValue(key, value);
    }
  };

  const muteSource = (source: RoutingSourceDef, token: number) => {
    const liveState = getState();
    groupControlledSources.add(source.id);

    scheduleLevelRamp(
      numericLevel(liveState, source.levelKey),
      0,
      fadeDownMs,
      token,
      (delayMs, callback) => schedule(token, delayMs, callback),
      isCurrentGeneration,
      (value) => onRuntimeLevelChange(source.levelKey, value),
    );

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
        onRuntimeLevelChange(source.levelKey, null);
        groupControlledSources.delete(source.id);
      }
      return;
    }

    onRuntimeLevelChange(source.levelKey, 0);
    if (enabledChanged) {
      restoreEnabledSnapshot(enabledSnapshot, onBooleanParamChange);
    }

    const targetLevel = numericLevel(liveState, source.levelKey);
    schedule(token, enableSettleMs, () => {
      scheduleLevelRamp(
        0,
        targetLevel,
        fadeUpMs,
        token,
        (delayMs, callback) => schedule(token, delayMs, callback),
        isCurrentGeneration,
        (value) => onRuntimeLevelChange(source.levelKey, value),
      );
    });

    schedule(token, enableSettleMs + fadeUpMs + 1, () => {
      onRuntimeLevelChange(source.levelKey, null);
      groupControlledSources.delete(source.id);
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
      for (const source of sourceDefs) {
        if (groupControlledSources.has(source.id)) {
          onRuntimeLevelChange(source.levelKey, null);
        }
      }
      groupControlledSources.clear();
    },
    getActiveSlotIndex() {
      return activeSlotIndex;
    },
  };
}
