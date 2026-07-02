import { createCoreProductSequencerLaneParamEvent } from '../../audio/coreProductEvents';
import type { PitchBindingMode } from '../../audio/drumSeqTypes';
import { KESSHO_PRODUCT_PARAM_IDS } from '../../audio/generated/kesshoProductParams';
import { createCoreProductSynthSequencerLaneStepOverrideEvents } from '../../audio/product/ProductSequencerStepOverrideEvents';
import type { ProductEvent } from '../../audio/product/ProductEngineTypes';
import { sequencerPitchBindingModeToEventId, sequencerPitchBindingModeToProductId } from '../../audio/sequencerPitchBinding';
import type { SliderState } from '../state';
import { normalizeSynthSequencerFaceState } from './sequencerModeTypes';
import type { GeneratedCaptureStepCommit } from './commitGeneratedCaptureToEuclid';

type GeneratedCaptureProductStepOverrides = {
  triggerToggles: Map<number, boolean>[];
  probability: (number[] | null)[];
  trigCondition: ([number, number][] | null)[];
  expression: (number[] | null)[];
  pitch: (number[] | null)[];
  nudge: (number[] | null)[];
  expressionDirection: (string | null)[];
  pitchDirection: (string | null)[];
  nudgeDirection: (string | null)[];
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

export function generatedCaptureStepOverridesForProduct(
  commit: GeneratedCaptureStepCommit,
): GeneratedCaptureProductStepOverrides {
  const laneIndex = Math.max(0, Math.min(15, Math.round(commit.targetLaneIndex)));
  return {
    triggerToggles: laneArray(laneIndex, new Map(commit.triggerToggles), () => new Map<number, boolean>()),
    probability: laneArray(laneIndex, new Array(commit.stepCount).fill(1), () => null),
    trigCondition: laneArray(
      laneIndex,
      Array.from({ length: commit.stepCount }, () => [1, 1] as [number, number]),
      () => null,
    ),
    expression: laneArray(laneIndex, [...commit.expressionValues], () => null),
    pitch: laneArray(laneIndex, [...commit.pitchMidiValues], () => null),
    nudge: laneArray(laneIndex, commit.hasNudge ? [...commit.nudgeValues] : null, () => null),
    expressionDirection: laneArray(laneIndex, 'forward', () => null),
    pitchDirection: laneArray(laneIndex, 'forward', () => null),
    nudgeDirection: laneArray(laneIndex, commit.hasNudge ? 'forward' : null, () => null),
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
    synthPitchBindingModes,
    [`synthEuclid${laneNumber}Preset`]: 'custom',
    [`synthEuclid${laneNumber}Steps`]: commit.stepCount,
    [`synthEuclid${laneNumber}Hits`]: commit.hits,
    [`synthEuclid${laneNumber}Rotation`]: 0,
  };
}
