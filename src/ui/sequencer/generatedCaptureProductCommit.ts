import {
  createCoreProductSequencerLaneParamEvent,
  createCoreProductSequencerLanePitchSettingEvents,
} from '../../audio/coreProductEvents';
import type { LaneDirection, PitchBindingMode, TrigCondition } from '../../audio/drumSeqTypes';
import { KESSHO_PRODUCT_PARAM_IDS } from '../../audio/generated/kesshoProductParams';
import { createCoreProductSynthSequencerLaneStepOverrideEvents } from '../../audio/product/ProductSequencerStepOverrideEvents';
import type { ProductEvent } from '../../audio/product/ProductEngineTypes';
import { normalizeSequencerPitchSettings } from '../../audio/sequencerPitchSettings';
import { sequencerPitchBindingModeToEventId, sequencerPitchBindingModeToProductId } from '../../audio/sequencerPitchBinding';
import type { SerializedStepToggle, SliderState } from '../state';
import { normalizeSynthSequencerFaceState } from './sequencerModeTypes';
import type { GeneratedCaptureStepCommit } from './commitGeneratedCaptureToEuclid';
import {
  deserializeTriggerClip,
  serializeTriggerClip,
  type SerializedTriggerClip,
  type TriggerClip,
} from './triggerClip';

type GeneratedCaptureProductStepOverrides = {
  triggerClips: (TriggerClip | null)[];
  triggerToggles: Map<number, boolean>[];
  probability: (number[] | null)[];
  ratchet: (number[] | null)[];
  trigCondition: ([number, number][] | null)[];
  expression: (number[] | null)[];
  pitch: (number[] | null)[];
  morph: (number[] | null)[];
  distance: (number[] | null)[];
  nudge: (number[] | null)[];
  slice: (number[] | null)[];
  reverse: (number[] | null)[];
  expressionDirection: (LaneDirection | null)[];
  pitchDirection: (LaneDirection | null)[];
  morphDirection: (LaneDirection | null)[];
  distanceDirection: (LaneDirection | null)[];
  nudgeDirection: (LaneDirection | null)[];
  sliceDirection: (LaneDirection | null)[];
  reverseDirection: (LaneDirection | null)[];
  expressionRanges: ({ min: number; max: number } | null)[];
  morphRanges: ({ min: number; max: number } | null)[];
  distanceRanges: ({ min: number; max: number } | null)[];
};

type GeneratedCaptureProductSubLaneState = {
  pitch?: { enabled: boolean; steps: number; direction: string };
  expression?: { enabled: boolean; steps: number; direction: string };
  nudge?: { enabled: boolean; steps: number; direction: string; followTriggerHits?: boolean };
};

function laneArray<T>(laneIndex: number, value: T, empty: () => T): T[] {
  const laneCount = Math.max(4, laneIndex + 1);
  return Array.from({ length: laneCount }, (_, index) => (index === laneIndex ? value : empty()));
}

function generatedCapturePitchSettingsPatchForState(
  state: SliderState,
  commit: GeneratedCaptureStepCommit,
) {
  const laneIndex = Math.max(0, Math.min(15, Math.round(commit.targetLaneIndex)));
  const stateRecord = state as unknown as Record<string, unknown>;
  const currentPitchSettings = Array.isArray(stateRecord.synthPitchSettings)
    ? stateRecord.synthPitchSettings
    : [];
  const laneCount = Math.max(4, Math.min(16, Math.max(currentPitchSettings.length, laneIndex + 1)));
  const next = Array.from({ length: laneCount }, (_, index) => normalizeSequencerPitchSettings(currentPitchSettings[index]));
  next[laneIndex] = normalizeSequencerPitchSettings(commit.pitchSettings);
  return next;
}

type GeneratedCaptureStepOverridesStatePatch = {
  triggerClips: (SerializedTriggerClip | null | undefined)[];
  triggerToggles: (SerializedStepToggle[] | null | undefined)[];
  probability: (number[] | null | undefined)[];
  ratchet: (number[] | null | undefined)[];
  trigCondition: (TrigCondition[] | null | undefined)[];
  expression: (number[] | null | undefined)[];
  pitch: (number[] | null | undefined)[];
  morph: (number[] | null | undefined)[];
  distance: (number[] | null | undefined)[];
  nudge: (number[] | null | undefined)[];
  slice: (number[] | null | undefined)[];
  reverse: (number[] | null | undefined)[];
  expressionDirection: (LaneDirection | null | undefined)[];
  pitchDirection: (LaneDirection | null | undefined)[];
  morphDirection: (LaneDirection | null | undefined)[];
  distanceDirection: (LaneDirection | null | undefined)[];
  nudgeDirection: (LaneDirection | null | undefined)[];
  sliceDirection: (LaneDirection | null | undefined)[];
  reverseDirection: (LaneDirection | null | undefined)[];
  expressionRanges: ({ min: number; max: number } | null | undefined)[];
  morphRanges: ({ min: number; max: number } | null | undefined)[];
  distanceRanges: ({ min: number; max: number } | null | undefined)[];
};

const STEP_OVERRIDE_LANE_ARRAY_KEYS = [
  'triggerClips',
  'triggerToggles',
  'probability',
  'ratchet',
  'trigCondition',
  'expression',
  'pitch',
  'morph',
  'distance',
  'nudge',
  'slice',
  'reverse',
  'expressionDirection',
  'pitchDirection',
  'morphDirection',
  'distanceDirection',
  'nudgeDirection',
  'sliceDirection',
  'reverseDirection',
  'expressionRanges',
  'morphRanges',
  'distanceRanges',
] as const;

function stepOverrideLaneCount(source: unknown, laneIndex: number): number {
  const record = source && typeof source === 'object' && !Array.isArray(source)
    ? source as Record<string, unknown>
    : {};
  let laneCount = Math.max(4, laneIndex + 1);
  for (const key of STEP_OVERRIDE_LANE_ARRAY_KEYS) {
    const value = record[key];
    if (Array.isArray(value)) laneCount = Math.max(laneCount, value.length);
  }
  return Math.min(16, laneCount);
}

function cloneNumericLane(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const lane = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  return lane.length > 0 ? lane : null;
}

function cloneTrigConditionLane(value: unknown): TrigCondition[] | null {
  if (!Array.isArray(value)) return null;
  const lane: TrigCondition[] = [];
  for (const item of value) {
    if (!Array.isArray(item)) continue;
    const numerator = typeof item[0] === 'number' && Number.isFinite(item[0])
      ? Math.max(1, Math.min(16, Math.round(item[0])))
      : 1;
    const denominator = typeof item[1] === 'number' && Number.isFinite(item[1])
      ? Math.max(1, Math.min(16, Math.round(item[1])))
      : 1;
    lane.push([Math.min(numerator, denominator), denominator]);
  }
  return lane.length > 0 ? lane : null;
}

function normalizeDirection(value: unknown): LaneDirection | null {
  return value === 'forward' || value === 'reverse' || value === 'pingpong'
    ? value
    : null;
}

function cloneRangeLane(value: unknown): { min: number; max: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const range = value as { min?: unknown; max?: unknown };
  if (typeof range.min !== 'number' || typeof range.max !== 'number') return null;
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max)) return null;
  const min = Math.max(0, Math.min(1, range.min));
  const max = Math.max(0, Math.min(1, range.max));
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function cloneTriggerClipForPatch(value: unknown): SerializedTriggerClip | null {
  if (!value || typeof value !== 'object') return null;
  const runtimeClip = value as Partial<TriggerClip>;
  if (runtimeClip.edits instanceof Map) {
    return serializeTriggerClip(runtimeClip as TriggerClip);
  }
  return serializeTriggerClip(deserializeTriggerClip(value as SerializedTriggerClip));
}

function cloneTriggerTogglesForPatch(value: unknown): SerializedStepToggle[] {
  const toggles = new Map<number, boolean>();
  const add = (stepValue: unknown, enabledValue: unknown) => {
    if (typeof stepValue !== 'number' || !Number.isFinite(stepValue)) return;
    const step = Math.round(stepValue);
    if (step < 0 || step > 63) return;
    toggles.set(step, Boolean(enabledValue));
  };

  if (value instanceof Map) {
    for (const [step, enabled] of value.entries()) add(step, enabled);
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      if (Array.isArray(entry)) {
        add(entry[0], entry[1]);
        return;
      }
      if (entry && typeof entry === 'object') {
        const record = entry as Partial<SerializedStepToggle>;
        add(record.step, record.value);
        return;
      }
      if (typeof entry === 'boolean' || typeof entry === 'number') {
        add(index, entry);
      }
    });
  } else if (value && typeof value === 'object') {
    for (const [step, enabled] of Object.entries(value as Record<string, unknown>)) {
      add(Number(step), enabled);
    }
  }

  return [...toggles.entries()]
    .sort(([left], [right]) => left - right)
    .map(([step, value]) => ({ step, value }));
}

function generatedCaptureStepOverridesPatchForState(
  state: SliderState,
  commit: GeneratedCaptureStepCommit,
): GeneratedCaptureStepOverridesStatePatch {
  const laneIndex = Math.max(0, Math.min(15, Math.round(commit.targetLaneIndex)));
  const stateRecord = state as unknown as Record<string, unknown>;
  const source = stateRecord.synthStepOverrides && typeof stateRecord.synthStepOverrides === 'object'
    ? stateRecord.synthStepOverrides as Record<string, unknown>
    : {};
  const laneCount = stepOverrideLaneCount(source, laneIndex);
  const laneValues = <T>(key: string, clone: (value: unknown) => T | null): (T | null | undefined)[] => {
    const lanes = Array.isArray(source[key]) ? source[key] as unknown[] : [];
    return Array.from({ length: laneCount }, (_, index) => (
      Object.prototype.hasOwnProperty.call(lanes, index) ? clone(lanes[index]) : undefined
    ));
  };

  const next: GeneratedCaptureStepOverridesStatePatch = {
    triggerClips: laneValues('triggerClips', cloneTriggerClipForPatch),
    triggerToggles: laneValues('triggerToggles', cloneTriggerTogglesForPatch),
    probability: laneValues('probability', cloneNumericLane),
    ratchet: laneValues('ratchet', cloneNumericLane),
    trigCondition: laneValues('trigCondition', cloneTrigConditionLane),
    expression: laneValues('expression', cloneNumericLane),
    pitch: laneValues('pitch', cloneNumericLane),
    morph: laneValues('morph', cloneNumericLane),
    distance: laneValues('distance', cloneNumericLane),
    nudge: laneValues('nudge', cloneNumericLane),
    slice: laneValues('slice', cloneNumericLane),
    reverse: laneValues('reverse', cloneNumericLane),
    expressionDirection: laneValues('expressionDirection', normalizeDirection),
    pitchDirection: laneValues('pitchDirection', normalizeDirection),
    morphDirection: laneValues('morphDirection', normalizeDirection),
    distanceDirection: laneValues('distanceDirection', normalizeDirection),
    nudgeDirection: laneValues('nudgeDirection', normalizeDirection),
    sliceDirection: laneValues('sliceDirection', normalizeDirection),
    reverseDirection: laneValues('reverseDirection', normalizeDirection),
    expressionRanges: laneValues('expressionRanges', cloneRangeLane),
    morphRanges: laneValues('morphRanges', cloneRangeLane),
    distanceRanges: laneValues('distanceRanges', cloneRangeLane),
  };

  next.triggerClips[laneIndex] = serializeTriggerClip(commit.triggerClip);
  next.triggerToggles[laneIndex] = [...commit.triggerToggles.entries()]
    .sort(([left], [right]) => left - right)
    .map(([step, value]) => ({ step, value }));
  next.probability[laneIndex] = new Array(commit.stepCount).fill(1);
  next.ratchet[laneIndex] = null;
  next.trigCondition[laneIndex] = Array.from({ length: commit.stepCount }, () => [1, 1] as TrigCondition);
  next.expression[laneIndex] = [...commit.expressionValues];
  next.pitch[laneIndex] = [...commit.pitchValues];
  next.morph[laneIndex] = null;
  next.distance[laneIndex] = null;
  next.nudge[laneIndex] = commit.hasNudge ? [...commit.nudgeValues] : null;
  next.slice[laneIndex] = null;
  next.reverse[laneIndex] = null;
  next.expressionDirection[laneIndex] = 'forward';
  next.pitchDirection[laneIndex] = 'forward';
  next.morphDirection[laneIndex] = null;
  next.distanceDirection[laneIndex] = null;
  next.nudgeDirection[laneIndex] = commit.hasNudge ? 'forward' : null;
  next.sliceDirection[laneIndex] = null;
  next.reverseDirection[laneIndex] = null;
  next.expressionRanges[laneIndex] = null;
  next.morphRanges[laneIndex] = null;
  next.distanceRanges[laneIndex] = null;

  return next;
}

export function generatedCaptureStepOverridesForProduct(
  commit: GeneratedCaptureStepCommit,
): GeneratedCaptureProductStepOverrides {
  const laneIndex = Math.max(0, Math.min(15, Math.round(commit.targetLaneIndex)));
  return {
    triggerClips: laneArray(laneIndex, commit.triggerClip, () => null),
    triggerToggles: laneArray(laneIndex, new Map(commit.triggerToggles), () => new Map<number, boolean>()),
    probability: laneArray(laneIndex, new Array(commit.stepCount).fill(1), () => null),
    ratchet: laneArray(laneIndex, null, () => null),
    trigCondition: laneArray(
      laneIndex,
      Array.from({ length: commit.stepCount }, () => [1, 1] as [number, number]),
      () => null,
    ),
    expression: laneArray(laneIndex, [...commit.expressionValues], () => null),
    pitch: laneArray(laneIndex, [...commit.pitchMidiValues], () => null),
    morph: laneArray(laneIndex, null, () => null),
    distance: laneArray(laneIndex, null, () => null),
    nudge: laneArray(laneIndex, commit.hasNudge ? [...commit.nudgeValues] : null, () => null),
    slice: laneArray(laneIndex, null, () => null),
    reverse: laneArray(laneIndex, null, () => null),
    expressionDirection: laneArray(laneIndex, 'forward', () => null),
    pitchDirection: laneArray(laneIndex, 'forward', () => null),
    morphDirection: laneArray(laneIndex, null, () => null),
    distanceDirection: laneArray(laneIndex, null, () => null),
    nudgeDirection: laneArray(laneIndex, commit.hasNudge ? 'forward' : null, () => null),
    sliceDirection: laneArray(laneIndex, null, () => null),
    reverseDirection: laneArray(laneIndex, null, () => null),
    expressionRanges: laneArray(laneIndex, null, () => null),
    morphRanges: laneArray(laneIndex, null, () => null),
    distanceRanges: laneArray(laneIndex, null, () => null),
  };
}

export function generatedCaptureSubLaneStatesForProduct(
  commit: GeneratedCaptureStepCommit,
): GeneratedCaptureProductSubLaneState[] {
  const laneIndex = Math.max(0, Math.min(15, Math.round(commit.targetLaneIndex)));
  const capturedSteps = Math.max(1, commit.pitchMidiValues.length);
  return laneArray(
    laneIndex,
    {
      pitch: { enabled: true, steps: capturedSteps, direction: 'forward' },
      expression: { enabled: true, steps: capturedSteps, direction: 'forward' },
      nudge: {
        enabled: commit.hasNudge,
        steps: capturedSteps,
        direction: 'forward',
        followTriggerHits: true,
      },
    },
    () => ({}),
  );
}

function createPitchBindingModeEvent(
  laneIndex: number,
  mode: PitchBindingMode,
): ProductEvent {
  return {
    ...createCoreProductSequencerLaneParamEvent(
      'synth',
      laneIndex,
      KESSHO_PRODUCT_PARAM_IDS.SequencerLanePitchBindingMode,
      sequencerPitchBindingModeToProductId(mode),
    ),
    value2: sequencerPitchBindingModeToEventId(mode),
  };
}

function createPitchSettingEvents(
  laneIndex: number,
  commit: GeneratedCaptureStepCommit,
): ProductEvent[] {
  return createCoreProductSequencerLanePitchSettingEvents('synth', laneIndex, commit.pitchSettings);
}

export function buildProductGeneratedCaptureStepCommitEvents(
  commit: GeneratedCaptureStepCommit,
): ProductEvent[] {
  const laneIndex = Math.max(0, Math.min(15, Math.round(commit.targetLaneIndex)));
  const overrides = generatedCaptureStepOverridesForProduct(commit);
  const subLaneStates = generatedCaptureSubLaneStatesForProduct(commit);
  return [
    createCoreProductSequencerLaneParamEvent('synth', laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneStepCount, commit.stepCount),
    createCoreProductSequencerLaneParamEvent('synth', laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneFillCount, commit.hits),
    createCoreProductSequencerLaneParamEvent('synth', laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneRotation, 0),
    ...createPitchSettingEvents(laneIndex, commit),
    createPitchBindingModeEvent(laneIndex, commit.pitchBindingMode),
    ...createCoreProductSynthSequencerLaneStepOverrideEvents(laneIndex, overrides, subLaneStates),
    createCoreProductSequencerLaneParamEvent('synth', laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMode, 0),
  ];
}

export function generatedCaptureStepPatchForState(
  state: SliderState,
  commit: GeneratedCaptureStepCommit,
): Readonly<Record<string, unknown>> {
  const laneIndex = Math.max(0, Math.min(15, Math.round(commit.targetLaneIndex)));
  const laneNumber = laneIndex + 1;
  const faces = normalizeSynthSequencerFaceState(state.synthSequencerFaces);
  const stateRecord = state as unknown as Record<string, unknown>;
  const currentPitchBindingModes = stateRecord.synthPitchBindingModes;
  const synthPitchBindingModes = Array.isArray(currentPitchBindingModes)
    ? [...currentPitchBindingModes] as PitchBindingMode[]
    : Array.from({ length: 4 }, () => 'polyrhythmic' as PitchBindingMode);
  while (synthPitchBindingModes.length <= laneIndex) {
    synthPitchBindingModes.push('polyrhythmic');
  }
  synthPitchBindingModes[laneIndex] = commit.pitchBindingMode;
  return {
    synthSequencerFaces: {
      ...faces,
      slots: faces.slots.map((slot, index) => (
        index === laneIndex ? { ...slot, mode: 'euclid' as const } : slot
      )),
    },
    synthPitchSettings: generatedCapturePitchSettingsPatchForState(state, commit),
    synthPitchBindingModes,
    synthStepOverrides: generatedCaptureStepOverridesPatchForState(state, commit),
    [`synthEuclid${laneNumber}Preset`]: 'custom',
    [`synthEuclid${laneNumber}Steps`]: commit.stepCount,
    [`synthEuclid${laneNumber}Hits`]: commit.hits,
    [`synthEuclid${laneNumber}Rotation`]: 0,
  };
}
