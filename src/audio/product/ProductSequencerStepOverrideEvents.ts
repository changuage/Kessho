import {
  CORE_PRODUCT_STEP_TOGGLE_FLAGS,
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  createCoreProductSynthArpCommitEvent,
  createCoreProductSynthArpConfigEvent,
  createCoreProductSynthArpStepEvent,
  createCoreProductSequencerClearStepsEvent,
  createCoreProductSequencerStepEvent,
  createCoreProductSequencerStepOverrideCommitEvent,
  createCoreProductSequencerExtendedStepValueEvent,
  createCoreProductSequencerStepValueEvent,
  createCoreProductSequencerSubLaneConfigEvent,
  type CoreProductEvent,
} from '../coreProductEvents';
import {
  normalizeDrumSequencerStepOffsetOverrides,
  normalizeSequencerStepToggleOverrides,
  normalizeSequencerStepValueConfigs,
  normalizeSequencerStepValueOverrides,
  type SequencerKind,
  type SequencerSubLaneConfigState,
  type SequencerStepToggleOverride,
  type SequencerStepValueConfig,
  type SequencerStepValueOverride,
} from '../CoreProductHostSequencerAdapter';

function emptyLaneState<T>(): T[][] {
  return [[], [], [], []];
}

const PRODUCT_PLAY_MAX_STEPS = 16;

const SYNTH_STEP_OVERRIDE_KEYS = new Set([
  'triggerToggles',
  'probability',
  'ratchet',
  'trigCondition',
  'expression',
  'pitch',
  'morph',
  'distance',
  'nudge',
  'expressionRanges',
  'morphRanges',
  'distanceRanges',
  'expressionDirection',
  'pitchDirection',
  'morphDirection',
  'distanceDirection',
  'nudgeDirection',
  'playNotes',
]);

type ProductArpEngineLane = {
  enabled: boolean;
  mode: 'arp' | 'chord';
  length: number;
  rate: number;
  pulseMask: number;
  resetMask: number;
  flow: 'up' | 'down' | 'upDown' | 'downUp' | 'randomLiveTone' | 'diceHold';
  contourMode: 'pool' | 'semitone';
  boundaryMode: 'fold' | 'wrap' | 'clamp';
  contour: number[];
  slotLane: number[];
  midiPattern: number[];
};

export function createCoreProductSynthSequencerStepOverrideEvents(
  overrides: unknown,
  subLaneStates?: readonly (SequencerSubLaneConfigState | null | undefined)[],
): CoreProductEvent[] {
  const hasStepOverrides = hasSynthSequencerStepOverridePayload(overrides, subLaneStates);
  const stepEvents = hasStepOverrides
    ? createCoreProductSequencerStepOverrideEvents(
        'synth',
        normalizeSequencerStepToggleOverrides(overrides, emptyLaneState()),
        normalizeSequencerStepValueOverrides(overrides, emptyLaneState(), true),
        normalizeSequencerStepValueConfigs(overrides, emptyLaneState(), true, subLaneStates),
      )
    : [];
  return [
    ...stepEvents,
    ...createCoreProductSynthArpEvents(overrides),
  ];
}

export function createCoreProductSynthSequencerLaneStepOverrideEvents(
  laneIndex: number,
  overrides: unknown,
  subLaneStates?: readonly (SequencerSubLaneConfigState | null | undefined)[],
): CoreProductEvent[] {
  const safeLaneIndex = Math.max(0, Math.min(15, Math.round(laneIndex)));
  const hasStepOverrides = hasSynthSequencerStepOverridePayload(overrides, subLaneStates);
  let stepEvents: CoreProductEvent[] = [];
  if (hasStepOverrides) {
    const toggles = normalizeSequencerStepToggleOverrides(overrides, emptyLaneState());
    const values = normalizeSequencerStepValueOverrides(overrides, emptyLaneState(), true);
    const configs = normalizeSequencerStepValueConfigs(overrides, emptyLaneState(), true, subLaneStates);
    stepEvents = createCoreProductSequencerLaneStepOverrideEvents(
      'synth',
      safeLaneIndex,
      toggles[safeLaneIndex] ?? [],
      values[safeLaneIndex] ?? [],
      configs[safeLaneIndex] ?? [],
    );
  }
  return stepEvents.concat(createCoreProductSynthArpEvents(overrides, safeLaneIndex));
}

function hasSynthSequencerStepOverridePayload(
  overrides: unknown,
  subLaneStates?: readonly (SequencerSubLaneConfigState | null | undefined)[],
): boolean {
  if (subLaneStates !== undefined) return true;
  if (Array.isArray(overrides) || overrides instanceof Map) return true;
  if (!overrides || typeof overrides !== 'object') return false;
  return Object.keys(overrides as Record<string, unknown>).some((key) => SYNTH_STEP_OVERRIDE_KEYS.has(key));
}

export function createCoreProductDrumSequencerStepOverrideEvents(
  overrides: unknown,
  subLaneStates?: readonly (SequencerSubLaneConfigState | null | undefined)[],
): CoreProductEvent[] {
  const toggles = normalizeSequencerStepToggleOverrides(overrides, emptyLaneState());
  const values = normalizeDrumSequencerStepOffsetOverrides(overrides, emptyLaneState());
  const configs = normalizeSequencerStepValueConfigs(overrides, emptyLaneState(), true, subLaneStates);
  return createCoreProductSequencerStepOverrideEvents(
    'drum',
    toggles,
    values,
    configs,
    CORE_PRODUCT_STEP_TOGGLE_FLAGS.stepOverrideState,
    true,
  );
}

function createCoreProductSequencerStepOverrideEvents(
  sequencer: SequencerKind,
  toggles: SequencerStepToggleOverride[][],
  values: SequencerStepValueOverride[][],
  configs: SequencerStepValueConfig[][],
  stateFlags = 0,
  commitBatch = false,
): CoreProductEvent[] {
  const laneCount = Math.max(toggles.length, values.length, configs.length);
  const events: CoreProductEvent[] = [];

  for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
    events.push(withExtraFlags(createCoreProductSequencerClearStepsEvent(sequencer, laneIndex), stateFlags));
    for (const config of configs[laneIndex] ?? []) {
      events.push(createCoreProductSequencerSubLaneConfigEvent(sequencer, laneIndex, config.field, config.steps, config.direction, true, stateFlags));
    }
    for (const toggle of toggles[laneIndex] ?? []) {
      events.push(withExtraFlags(createCoreProductSequencerStepEvent(sequencer, laneIndex, toggle.step, toggle.value), stateFlags));
    }
    for (const value of values[laneIndex] ?? []) {
      events.push(createStepValueEvent(sequencer, laneIndex, value, stateFlags));
    }
  }

  if (commitBatch) {
    events.push(createCoreProductSequencerStepOverrideCommitEvent(sequencer, 0, stateFlags));
  }

  return events;
}

function createCoreProductSequencerLaneStepOverrideEvents(
  sequencer: SequencerKind,
  laneIndex: number,
  toggles: readonly SequencerStepToggleOverride[],
  values: readonly SequencerStepValueOverride[],
  configs: readonly SequencerStepValueConfig[],
  stateFlags = 0,
): CoreProductEvent[] {
  const events: CoreProductEvent[] = [withExtraFlags(createCoreProductSequencerClearStepsEvent(sequencer, laneIndex), stateFlags)];
  for (const config of configs) {
    events.push(createCoreProductSequencerSubLaneConfigEvent(sequencer, laneIndex, config.field, config.steps, config.direction, true, stateFlags));
  }
  for (const toggle of toggles) {
    events.push(withExtraFlags(createCoreProductSequencerStepEvent(sequencer, laneIndex, toggle.step, toggle.value), stateFlags));
  }
  for (const value of values) {
    events.push(createStepValueEvent(sequencer, laneIndex, value, stateFlags));
  }
  return events;
}

function createStepValueEvent(
  sequencer: SequencerKind,
  laneIndex: number,
  value: SequencerStepValueOverride,
  stateFlags: number,
): CoreProductEvent {
  if (value.value3 !== undefined || value.value4 !== undefined) {
    return createCoreProductSequencerExtendedStepValueEvent(
      sequencer,
      laneIndex,
      value.step,
      value.field,
      value.value,
      value.value2 ?? 0,
      value.value3 ?? 0,
      value.value4 ?? 0,
      valueFlags(value, stateFlags),
    );
  }
  return createCoreProductSequencerStepValueEvent(
    sequencer,
    laneIndex,
    value.step,
    value.field,
    value.value,
    value.value2 ?? 0,
    valueFlags(value, stateFlags),
  );
}

function valueFlags(value: SequencerStepValueOverride, stateFlags: number): number {
  let flags = stateFlags;
  if (value.range) flags |= CORE_PRODUCT_STEP_TOGGLE_FLAGS.rangeValue;
  if (stateFlags !== 0 && value.field === CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote) {
    flags |= CORE_PRODUCT_STEP_TOGGLE_FLAGS.drumPitchOffsetValue;
  }
  return flags;
}

function withExtraFlags(event: CoreProductEvent, extraFlags: number): CoreProductEvent {
  return extraFlags === 0 ? event : { ...event, flags: (event.flags ?? 0) | extraFlags };
}

function createCoreProductSynthArpEvents(overrides: unknown, onlyLaneIndex?: number): CoreProductEvent[] {
  const lanes = extractProductArpEngineLanes(overrides);
  if (!lanes) return [];
  const events: CoreProductEvent[] = [];
  const start = onlyLaneIndex ?? 0;
  const end = onlyLaneIndex === undefined ? lanes.length : Math.min(lanes.length, onlyLaneIndex + 1);
  for (let laneIndex = start; laneIndex < end; laneIndex += 1) {
    const lane = lanes[laneIndex] ?? emptyProductArpEngineLane();
    const arpEnabled = lane.enabled && lane.mode === 'arp';
    events.push(createCoreProductSynthArpConfigEvent(laneIndex, {
      enabled: arpEnabled,
      length: lane.length,
      rate: lane.rate,
      pulseMask: lane.pulseMask,
      resetMask: lane.resetMask,
      flow: lane.flow,
      contourMode: lane.contourMode,
      boundaryMode: lane.boundaryMode,
    }));
    if (arpEnabled) {
      for (let step = 0; step < PRODUCT_PLAY_MAX_STEPS; step += 1) {
        const midi = finiteNumber(lane.midiPattern[step], -1);
        const active = (lane.pulseMask & (1 << step)) !== 0 && midi >= 0;
        events.push(createCoreProductSynthArpStepEvent(laneIndex, step, {
          midi,
          active,
          contour: lane.contour[step] ?? 0,
          slot: lane.slotLane[step] ?? -1,
          reset: (lane.resetMask & (1 << step)) !== 0,
        }));
      }
    }
    events.push(createCoreProductSynthArpCommitEvent(laneIndex));
  }
  return events;
}

function extractProductArpEngineLanes(overrides: unknown): ProductArpEngineLane[] | null {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return null;
  const source = overrides as Record<string, unknown>;
  const rawLanes = source.playArps;
  if (!Array.isArray(rawLanes)) return null;
  const laneCount = Math.max(4, Math.min(16, rawLanes.length));
  return Array.from({ length: laneCount }, (_, laneIndex) => normalizeProductArpEngineLane(rawLanes[laneIndex]));
}

function normalizeProductArpEngineLane(value: unknown): ProductArpEngineLane {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyProductArpEngineLane();
  const record = value as Record<string, unknown>;
  const arpRecord = record.arp && typeof record.arp === 'object' && !Array.isArray(record.arp)
    ? record.arp as Record<string, unknown>
    : record;
  const midiPatternSource = Array.isArray(record.midiPattern)
    ? record.midiPattern
    : Array.isArray(arpRecord.midiPattern)
      ? arpRecord.midiPattern
      : [];
  return {
    enabled: record.enabled === true || arpRecord.enabled === true,
    mode: record.mode === 'chord' ? 'chord' : 'arp',
    length: clampInteger(arpRecord.length, 1, PRODUCT_PLAY_MAX_STEPS, 1),
    rate: clampNumber(arpRecord.rate, 0.25, 4, 1),
    pulseMask: clampInteger(arpRecord.pulseMask, 0, 0xffff, 0),
    resetMask: clampInteger(arpRecord.resetMask, 0, 0xffff, 0),
    flow: arpRecord.flow === 'down' || arpRecord.flow === 'upDown' || arpRecord.flow === 'downUp' ||
      arpRecord.flow === 'randomLiveTone' || arpRecord.flow === 'diceHold'
      ? arpRecord.flow
      : 'up',
    contourMode: arpRecord.contourMode === 'semitone' ? 'semitone' : 'pool',
    boundaryMode: arpRecord.boundaryMode === 'wrap' || arpRecord.boundaryMode === 'clamp'
      ? arpRecord.boundaryMode
      : 'fold',
    contour: Array.from({ length: PRODUCT_PLAY_MAX_STEPS }, (_, step) =>
      clampInteger(Array.isArray(arpRecord.contour) ? arpRecord.contour[step] : 0, -12, 12, 0)
    ),
    slotLane: Array.from({ length: PRODUCT_PLAY_MAX_STEPS }, (_, step) =>
      clampInteger(Array.isArray(arpRecord.slotLane) ? arpRecord.slotLane[step] : -1, -1, 7, -1)
    ),
    midiPattern: Array.from({ length: PRODUCT_PLAY_MAX_STEPS }, (_, step) =>
      clampNumber(midiPatternSource[step], -1, 127, -1)
    ),
  };
}

function emptyProductArpEngineLane(): ProductArpEngineLane {
  return {
    enabled: false,
    mode: 'arp',
    length: 1,
    rate: 1,
    pulseMask: 0,
    resetMask: 0,
    flow: 'up',
    contourMode: 'pool',
    boundaryMode: 'fold',
    contour: Array.from({ length: PRODUCT_PLAY_MAX_STEPS }, () => 0),
    slotLane: Array.from({ length: PRODUCT_PLAY_MAX_STEPS }, () => -1),
    midiPattern: Array.from({ length: PRODUCT_PLAY_MAX_STEPS }, () => -1),
  };
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, finiteNumber(value, fallback)));
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNumber(value, min, max, fallback));
}
