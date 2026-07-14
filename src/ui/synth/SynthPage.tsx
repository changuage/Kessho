/**
 * SynthPage — Combined Pad + Lead synth page
 * Two-column layout matching DrumPage:
 *   Left  = Collapsible panels for Pad Synth ADSR, Pad Timbre, Lead Synth
 *   Right = Sequencer with Simple / Detail / Overview view modes
 *
 * Simple  = Probability-based controls (chords per phrase, voicing spread, etc.)
 * Detail  = Euclidean sequencer per-lane (reuses useEuclideanSequencer hook)
 * Overview = All 4 trigger lanes at once
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatIndexedDelayDivision, getSliderNumericValue, type SerializedStepOverrides, type SliderMode, type SliderState } from '../state';
import { useEuclideanSequencer, type EvolveConfig, type SequencerViewMode, type StepOverrides, type SubLaneKind, type SubLaneState, type PitchSettings } from '../sequencer/useEuclideanSequencer';
import {
  MANUAL_SYNTH_SOURCE_ENABLED_KEYS,
  SYNTH_LANE_ENABLED_KEYS,
  SYNTH_LANE_SOURCE_KEYS,
  applySequencerTransportPlan,
  manualSynthSourceForLaneSource,
  manualSynthSourcesForLaneSource,
  planSynthSequencerTransportToggle,
  type SequencerManualSynthSource,
} from '../sequencer/sequencerTransportPolicy';
import SequencerChainRail, {
  createSequencerChainUiRuntimeState,
  sequencerChainBadgeLabel,
  useSequencerChainUiPosition,
} from '../sequencer/SequencerChainRail';
import { liveOverdubTargetStep, useLiveOverdubRecorder } from '../sequencer/useLiveOverdubRecorder';
import { stepOverridesForEngineSubLaneState } from '../sequencer/engineStepOverrides';
import { NUDGE_EPSILON, clampNudge, computeNudgeFromContinuousStep } from '../sequencer/nudgeTiming';
import { serializeStepOverrides } from '../sequencer/stepOverrideSerialization';
import { shouldShowTriggerSourceBadge, triggerSourceDisplayLabel } from '../sequencer/triggerSourceLabel';
import AnchorWalkerSequencerBody from '../sequencer/AnchorWalkerSequencerBody';
import OrbitSequencerBody from '../sequencer/OrbitSequencerBody';
import SequencerCapturePreviewOverlay from '../sequencer/SequencerCapturePreviewOverlay';
import { useGeneratedSequenceCapture } from '../sequencer/useGeneratedSequenceCapture';
import type { CapturedPitchReference } from '../sequencer/generatedSequencerCapturePitch';
import {
  normalizeSynthSequencerFaceState,
  type SequencerMode,
  type SequencerSlotModeState,
} from '../sequencer/sequencerModeTypes';
import {
  applyAnchorWalkerLayerPreset,
  normalizeAnchorWalkerConfig,
  type AnchorWalkerPerformanceEvent,
  type AnchorWalkerConfig,
  type AnchorWalkerRuntimeViewState,
} from '../sequencer/anchorWalkerTypes';
import {
  applySequencePresetClockDivs,
  applySequencePresetEvolveConfigs,
  applySequencePresetLinked,
  applySequencePresetOverrides,
  applySequencePresetPitchBindingModes,
  applySequencePresetPitchSettings,
  applySequencePresetSubLaneStates,
  applySequencePresetSwings,
  copySequenceLaneForPreset,
  copySequenceLaneStateForPreset,
  type SerializedSequenceLanePresetState,
} from '../sequencer/sequencePresetLane';
import {
  clampEuclideanSubLaneSteps,
  clampEuclideanTriggerSteps,
  EUCLIDEAN_STEP_MAX,
  sequencerGridCellCount,
  sequencerGridColumnCount,
} from '../sequencer/sequencerLimits';
import { seqEuclidean } from '../../audio/euclideanPatterns';
// DrumStepOverrides no longer needed — SynthPage uses StepOverrides from the shared hook
import DragNumber from '../drums/DragNumber';
import SeqLane from '../drums/SeqLane';
import SeqSparkline from '../drums/SeqSparkline';
import SeqMiniOverview from '../drums/SeqMiniOverview';
import {
  SCALES,
  clampMidiNote,
  normalizeNoteDegreeOffset,
  scaleDegreeToSemitone,
  semitoneToScaleDegree,
} from '../../audio/drumSeqTypes';
import type { ClockDivision, PitchBindingMode, SequencerState } from '../../audio/drumSeqTypes';
import { sequencerClockDivisionToSeconds } from '../../audio/sequencerClockDivisions';
import {
  HARMONY_POOL_MAX_NOTES,
  formatHarmonyIntentChordLabel,
  recognizeHarmonyIntentFromMidiPool,
  resolvePresetMorphContext,
  resolveHarmonyIntentToNotePool,
  sanitizeHarmonyChordSlots,
  type HarmonyChordSlot,
  type HarmonyIntent,
} from '../../audio/CoreProductHarmonyControl';
import {
  normalizeSequencerPitchBindingMode,
  normalizeSequencerPitchBindingModes,
} from '../../audio/sequencerPitchBinding';
import { normalizeSequencerPitchSettings } from '../../audio/sequencerPitchSettings';
import { SYNTH_EUCLIDEAN_LANE_COUNT } from '../../audio/sequencerLaneCounts';
import type { HarmonyState } from '../../audio/harmony';
import type {
  ProductSimpleSequencerVisualPlanActive,
  ProductSynthAnchorWalkerVisualLaneState,
  ProductSynthOrbitVisualLaneState,
} from '../../audio/product/ProductEngineTypes';
import { useSliderHelp } from '../SliderHelpOverlay';
import { SliderPrimitive } from '../sliderSystem';
import { isEditableShortcutTarget } from '../keyboard/keyboardTargets';
import { useLiveNoteInput } from '../keyboard/liveNoteInput';
import { useKeyboardScope } from '../keyboard/useKeyboardScope';
import { useVisibleInterval } from '../hooks/useVisibleInterval';
import { useVisualFeatureToggle } from '../hooks/useVisualFeatureToggle';
import { OptionalVisualizerGate } from '../components/OptionalVisualizerGate';
import { removeRuntimeValues, useRuntimeValue } from '../runtimeValueState';
import { useRuntimeSliderPosition } from '../runtimeSliderState';
import { blurSelectAfterChange } from '../shared/selectFocus';
import './synth.css';
import SynthPresetManager from './SynthPresetManager';
import SynthKeyboardKeys, { type SynthKeyboardKeysHandle, type SynthKeyboardKeyView } from './SynthKeyboardKeys';
import { ratePadPreset } from './padPresetRating';
import { usePresets } from '../../presets/usePresets';
import { PresetDropdown } from '../../presets/PresetDropdown';
import { PresetRatingStars } from '../../presets/PresetRatingStars';
import { PresetPoolPopup } from '../../presets/PresetPoolPopup';
import { usePresetPoolCandidates } from '../../presets/PresetPoolContext';
import { PRESET_POOL_ICON, getPresetPoolLabel, type PresetPoolCandidate } from '../../presets/presetPool';
import {
  EUCLIDEAN_PATTERN_SEQUENCE_STATE_KEY,
  EUCLIDEAN_PATTERN_STEP_OVERRIDES_KEY,
  applyEuclideanPatternToSynthLaneState,
  extractEuclideanPatternLaneDataFromSynthState,
} from '../../presets/euclideanPatternBank';
import type { PresetEntry, PresetSummary } from '../../presets/types';
import type { UsePresetsOptions } from '../../presets/usePresets';
import {
  PAD1_TO_PAD2_KEY,
  getFactoryPadPresetIdByName,
  getPadPresetOptions,
  upsertUserPadPreset,
  setUserPadPresets,
  type PadPreset,
  type PadPresetOption,
} from '../../audio/padPresets';
import {
  applyPadScopeState,
  blendPadScopeState,
  createPadRandomGoal,
  extractPadScopeState,
  type PadRandomScope,
  type PadScopeSnapshot,
} from '../../audio/padRandomize';
import {
  getLead4opFMPresetList,
  loadLead4opFMPresetVerified,
  morphPresets,
  overwriteLead4opFMPreset,
  saveUserLead4opFMPreset,
  setUserLead4opFMPresets,
  upsertUserLead4opFMPreset,
  type Lead4opFMPreset,
} from '../../audio/lead4opfm';
import type { ManualSynthNoteOptions, ManualSynthSource } from '../../audio/engineSharedTypes';
import { isProductManualSynthSource } from '../../audio/product/manualSynthSources';
import type { TransportDebugSnapshot } from '../../audio/transport';
import { getEffectiveSequencerBpm, getPhraseDurationForClockSource } from '../../audio/transport';
import { chordIntervalSecondsFromState } from '../../audio/chordPhraseTiming';
import {
  applyLeadDistanceEnvelope,
  applyPadDistanceToState,
  getLeadDistancePreview,
  getPadDistancePreview,
} from '../../audio/distanceMacro';
import FilterLfoViz from './FilterLfoViz';
import WaveFoldViz from './WaveFoldViz';
import LeadAdsrViz from './LeadAdsrViz';
import { LFO_PRESETS, LFO_PRESET_CATEGORIES } from './lfoPresets';
import {
  Lead4opFMEditorOverlay,
  type Lead4opFMEditorApplyRequest,
} from './Lead4opFMEditorOverlay';
import { SimplePhraseVisualizer } from './SimplePhraseVisualizer';
import { SEQUENCER_LANE_COLORS, SEQUENCER_SUB_LANE_COLORS, SOURCE_COLORS } from '../../designSystem/colors';
import {
  createProductArpHarmonyContext,
  normalizeProductArpConfig,
  resolveProductArpMidiPattern,
  resolveProductArpPatternDetails,
  type ProductArpBoundaryMode,
  type ProductArpConfig,
  type ProductArpContourMode,
  type ProductArpFlow,
  type ProductArpRate,
  type ProductArpResolvedStep,
  type ProductArpSlotChoice,
} from '../../audio/productArpeggiator';
import {
  defaultProductPlayConfig,
  normalizeProductPlayConfig,
  normalizeProductPlayConfigs,
  productPlayLiveLength,
  productPlayPulseValues,
  resolveProductChordPlayPatternDetails,
  resolveProductPlayEnginePattern,
  type ProductChordFlow,
  type ProductChordPlayConfig,
  type ProductChordResolvedStep,
  type ProductChordStyle,
  type ProductPlayConfig,
  type ProductPlayMode,
} from '../../audio/productPlaySequencer';
import {
  SYNTH_CHORD_ARP_SPEEDS,
  SYNTH_CHORD_ARP_RANGES,
  SYNTH_CHORD_SUB_LANE_NAMES_V2,
  sanitizeSynthChordSequencerConfig,
  synthChordArpPatternForShape,
  synthChordSequencerTriggerOrdinalForTick,
  type SynthChordSequencerArpPatternLength,
  type SynthChordSequencerArpRange,
  type SynthChordSequencerArpShape,
  type SynthChordSequencerArpSpeed,
  type SynthChordSequencerConfig,
  type SynthChordSequencerMelodyStep,
  type SynthChordSequencerMelodyStepMode,
  type SynthChordSequencerMelodyTrack,
  type SynthChordSequencerPlaybackMode,
  type SynthChordSequencerSubLaneConfig,
  type SynthChordSequencerSubLaneDirection,
  type SynthChordSequencerSubLaneName,
  type SynthChordSequencerStrumDirection,
} from '../../audio/synthChordSequencer';
import { normalizeSynthEuclidSource } from '../../audio/coreProductSourceMapping';
import {
  SAMPLE_DYNAMIC_KEYS,
  SAMPLE_DYNAMIC_MODES,
  SAMPLE_SELECTION_MODES,
  SAMPLE_VARIANT_MODES,
  isSampleLibraryKey,
  type SampleLibraryKey,
  type SampleSlotId,
} from '../../audio/sampleLibraries/SampleLibraryTypes';
import { SAMPLE_LIBRARY_REGISTRY_GENERATED } from '../../audio/sampleLibraries/generated/sampleLibraryRegistry.generated';
import { applySampleLibrarySelectionDefaultsToFlatState } from '../../audio/sampleLibraries/sampleLibrarySelectionDefaults';
import { readSampleSlotState } from '../../audio/sampleLibraries/sampleSlotState';
import {
  copyTriggerStamp,
  pasteTriggerStamp,
  type SubLaneLike,
  type TriggerStamp,
} from '../sequencer/sequencerTriggerStamp';
import type {
  ProductGeneratedSequencerCaptureRequest,
  ProductRuntimeSynthPageEvents,
} from '../useProductRuntimeSynthPageEvents';

function currentWallSeconds(): number {
  return typeof performance !== 'undefined' ? performance.now() / 1000 : Date.now() / 1000;
}

function chordSequencerUiBeatSeconds(state: SliderState): number {
  const bpm = Number.isFinite(state.sequencerMasterBPM)
    ? state.sequencerMasterBPM
    : Number.isFinite(state.synthEuclidBaseBPM)
      ? state.synthEuclidBaseBPM
      : Number.isFinite(state.drumEuclidBaseBPM)
        ? state.drumEuclidBaseBPM
        : 120;
  return 60 / Math.max(1, bpm);
}

function chordSequencerUiStepSeconds(state: SliderState, clockDivision: ClockDivision): number {
  return Math.max(0.001, sequencerClockDivisionToSeconds(clockDivision, chordSequencerUiBeatSeconds(state), '1/4'));
}

const OV_PROB_DRAG_PX = 80;

type RuntimeSliderProps = {
  mode?: SliderMode;
  dualRange?: { min: number; max: number };
  walkPosition?: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function resolveRuntimeSliderValue(
  value: number,
  runtimeProps: RuntimeSliderProps,
  runtimePosition?: number,
): number {
  const mode = runtimeProps.mode ?? 'single';
  const range = runtimeProps.dualRange;
  if (mode === 'single' || !range) return value;
  const position = runtimePosition ?? runtimeProps.walkPosition ?? 0.5;
  return range.min + clamp01(position) * (range.max - range.min);
}

const formatEnvelopeSeconds = (value: number): string => {
  const safeValue = Math.max(0, value);
  if (safeValue < 1) return `${Math.round(safeValue * 1000)}ms`;
  if (safeValue < 10) return `${safeValue.toFixed(2)}s`;
  return `${safeValue.toFixed(1)}s`;
};

const formatEnvelopeSustain = (value: number): string => `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;

function getPadEnvelopeTimelineSeconds(state: SliderState): number {
  const phraseLength = Math.max(
    0.25,
    getPhraseDurationForClockSource(state, state.harmonyClockSource ?? 'globalPhrase'),
  );
  return chordIntervalSecondsFromState(state.chordRate, phraseLength);
}

const LANE_CONFIGS = [
  { color: SEQUENCER_LANE_COLORS[0], name: 'Seq 1' },
  { color: SEQUENCER_LANE_COLORS[1], name: 'Seq 2' },
  { color: SEQUENCER_LANE_COLORS[2], name: 'Seq 3' },
  { color: SEQUENCER_LANE_COLORS[3], name: 'Seq 4' },
];
const CHORD_SEQUENCER_LANE_NAME = 'Seq 5 · Chord/Arp';
const CHORD_SEQUENCER_LANE_COLOR = SEQUENCER_LANE_COLORS[4] ?? '#22d3ee';
const CHORD_SEQUENCER_STEP_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

type WalkerEnsemblePreset = 'off' | 'wide' | 'roll' | 'diatonic' | 'counter';

const WALKER_ENSEMBLE_LABELS: Record<WalkerEnsemblePreset, string> = {
  off: 'Off',
  wide: 'Wide',
  roll: 'Roll',
  diatonic: 'Diatonic',
  counter: 'Counter',
};

type WalkerEnsembleSlotPatch = {
  transposeSemitones: number;
  diatonicOffset: number;
  tuning: AnchorWalkerConfig['layerTuning'];
  motion: AnchorWalkerConfig['layers'][number]['motion'];
  delayMs: number;
  gesturePattern?: number[];
  triggerMode?: AnchorWalkerConfig['triggerMode'];
};

function walkerEnsembleSlotPatches(preset: WalkerEnsemblePreset): WalkerEnsembleSlotPatch[] {
  switch (preset) {
    case 'wide':
      return [
        { transposeSemitones: 0, diatonicOffset: 0, tuning: 'rawTranspose', motion: 'linked', delayMs: 0 },
        { transposeSemitones: 7, diatonicOffset: 0, tuning: 'rawTranspose', motion: 'linked', delayMs: 0 },
        { transposeSemitones: 15, diatonicOffset: 0, tuning: 'rawTranspose', motion: 'linked', delayMs: 0 },
        { transposeSemitones: 19, diatonicOffset: 0, tuning: 'rawTranspose', motion: 'linked', delayMs: 0 },
      ];
    case 'roll':
      return [
        { transposeSemitones: 0, diatonicOffset: 0, tuning: 'rawTranspose', motion: 'linked', delayMs: 0 },
        { transposeSemitones: 7, diatonicOffset: 0, tuning: 'rawTranspose', motion: 'linked', delayMs: 25 },
        { transposeSemitones: 15, diatonicOffset: 0, tuning: 'rawTranspose', motion: 'linked', delayMs: 55 },
        { transposeSemitones: 19, diatonicOffset: 0, tuning: 'rawTranspose', motion: 'linked', delayMs: 90 },
      ];
    case 'diatonic':
      return [
        { transposeSemitones: 0, diatonicOffset: 0, tuning: 'diatonicOffset', motion: 'linked', delayMs: 0 },
        { transposeSemitones: 0, diatonicOffset: 2, tuning: 'diatonicOffset', motion: 'linked', delayMs: 25 },
        { transposeSemitones: 0, diatonicOffset: 4, tuning: 'diatonicOffset', motion: 'linked', delayMs: 50 },
        { transposeSemitones: 0, diatonicOffset: 6, tuning: 'diatonicOffset', motion: 'linked', delayMs: 75 },
      ];
    case 'counter':
      return [
        { transposeSemitones: 0, diatonicOffset: 0, tuning: 'rawTranspose', motion: 'linked', delayMs: 0 },
        { transposeSemitones: 12, diatonicOffset: 0, tuning: 'rawTranspose', motion: 'inverted', delayMs: 0 },
        { transposeSemitones: 7, diatonicOffset: 0, tuning: 'rawTranspose', motion: 'linked', delayMs: 45 },
        { transposeSemitones: 0, diatonicOffset: 0, tuning: 'diatonicOffset', motion: 'linked', delayMs: 75, gesturePattern: [-1, 2, -1, 1] },
      ];
    case 'off':
    default:
      return [];
  }
}

function walkerEnsembleConfig(
  base: AnchorWalkerConfig,
  slotIndex: number,
  patch: WalkerEnsembleSlotPatch,
): AnchorWalkerConfig {
  const solo = applyAnchorWalkerLayerPreset({
    ...base,
    enabled: true,
    mode: 'hybrid',
    playMode: 'hybridPlay',
    triggerMode: patch.triggerMode ?? 'gestureHold',
    boundaryMode: 'fold',
    autoRate: base.autoRate,
    leadMode: false,
    layerPreset: 'solo',
    spreadMs: 0,
    activePadDelta: 0,
    gesturePattern: patch.gesturePattern ?? base.gesturePattern,
    gesturePatternLength: patch.gesturePattern?.length ?? base.gesturePatternLength,
  }, 'solo');
  const layers = solo.layers.map((layer, index) => ({
    ...layer,
    enabled: index === 0,
    label: index === 0 ? `Seq ${slotIndex + 1}` : layer.label,
    transposeSemitones: index === 0 ? patch.transposeSemitones : 0,
    diatonicOffset: index === 0 ? patch.diatonicOffset : 0,
    tuning: index === 0 ? patch.tuning : layer.tuning,
    motion: index === 0 ? patch.motion : layer.motion,
    delayMs: index === 0 ? patch.delayMs : 0,
  }));
  return normalizeAnchorWalkerConfig({
    ...solo,
    layers,
    layerTuning: patch.tuning,
    spreadMs: 0,
    seed: Math.max(1, Math.round(base.seed + slotIndex * 97)),
  }, slotIndex);
}

type EvolvedSequencerPatch = {
  laneIndex: number;
  version: number;
  data: Partial<StepOverrides> & { pitchSettings?: (PitchSettings | null)[]; manualDiceHome?: boolean };
  swing?: number;
  subLaneStates?: Partial<Record<SubLaneKind, Partial<SubLaneState>>>;
};

type SynthLiveOverdubCaptureEvent = {
  targetStepIndex: number;
  targetStepFloat: number;
  pitchValue: number;
  eventOrder: number;
};

type SynthLiveOverdubCaptureSession = {
  laneIndex: number;
  events: SynthLiveOverdubCaptureEvent[];
  nextEventOrder: number;
  pitchSettings: PitchSettings;
};

type GeneratedCaptureStartArm = {
  sourceLaneIndex: number;
  targetLaneIndex: number;
  sourceMode: 'anchorWalker' | 'orbit';
  phase: 'waitingForStart';
  waitingForBoundary: boolean;
  previousStep: number | null;
};

const STEP_OVERRIDE_VALUE_KEYS = ['expression', 'morph', 'distance', 'probability', 'ratchet', 'trigCondition', 'pitch', 'nudge'] as const;
const STEP_OVERRIDE_RANGE_KEYS = ['expressionRanges', 'morphRanges', 'distanceRanges'] as const;
const STEP_OVERRIDE_DIRECTION_KEYS = ['expressionDirection', 'pitchDirection', 'morphDirection', 'distanceDirection', 'nudgeDirection'] as const;
const SYNTH_DICE_SYNC_SUPPRESSION_MS = 4000;

function sortedToggleEntries(value: Map<number, boolean> | null | undefined): [number, boolean][] {
  return Array.from(value?.entries() ?? []).sort(([left], [right]) => left - right);
}

function stepOverrideLaneSignature(overrides: StepOverrides, laneIndex: number): string {
  return JSON.stringify({
    triggerToggles: sortedToggleEntries(overrides.triggerToggles[laneIndex]),
    expression: overrides.expression[laneIndex] ?? null,
    morph: overrides.morph[laneIndex] ?? null,
    distance: overrides.distance[laneIndex] ?? null,
    probability: overrides.probability[laneIndex] ?? null,
    ratchet: overrides.ratchet[laneIndex] ?? null,
    trigCondition: overrides.trigCondition[laneIndex] ?? null,
    pitch: overrides.pitch[laneIndex] ?? null,
    nudge: overrides.nudge[laneIndex] ?? null,
    expressionRanges: overrides.expressionRanges?.[laneIndex] ?? null,
    morphRanges: overrides.morphRanges?.[laneIndex] ?? null,
    distanceRanges: overrides.distanceRanges?.[laneIndex] ?? null,
    expressionDirection: overrides.expressionDirection[laneIndex] ?? null,
    pitchDirection: overrides.pitchDirection[laneIndex] ?? null,
    nudgeDirection: overrides.nudgeDirection[laneIndex] ?? null,
    morphDirection: overrides.morphDirection[laneIndex] ?? null,
    distanceDirection: overrides.distanceDirection[laneIndex] ?? null,
  });
}

function canPreserveSynthLiveCaptureTriggerSteps(
  events: readonly SynthLiveOverdubCaptureEvent[],
  stepCount: number,
): boolean {
  const eventSteps = events.map((event) => event.targetStepIndex);
  const uniqueSteps = new Set(eventSteps);
  return events.length > 0 && events.length <= stepCount && uniqueSteps.size === events.length;
}

function synthLiveCaptureTriggerPattern(
  events: readonly SynthLiveOverdubCaptureEvent[],
  stepCount: number,
): boolean[] {
  if (canPreserveSynthLiveCaptureTriggerSteps(events, stepCount)) {
    const pattern = new Array(stepCount).fill(false);
    for (const event of events) {
      if (event.targetStepIndex >= 0 && event.targetStepIndex < stepCount) {
        pattern[event.targetStepIndex] = true;
      }
    }
    return pattern;
  }

  return seqEuclidean(stepCount, Math.min(stepCount, events.length), 0);
}

function synthLiveTriggerSteps(pattern: readonly boolean[]): number[] {
  const steps: number[] = [];
  pattern.forEach((enabled, step) => {
    if (enabled) steps.push(step);
  });
  return steps;
}

function synthLiveAdjacentTriggerSteps(
  triggerSteps: readonly number[],
  currentStep: number,
  stepCount: number,
): { previous: number; next: number } {
  if (triggerSteps.length <= 1) {
    return {
      previous: currentStep - stepCount,
      next: currentStep + stepCount,
    };
  }
  let previous = triggerSteps[triggerSteps.length - 1]! - stepCount;
  let next = triggerSteps[0]! + stepCount;
  for (const step of triggerSteps) {
    if (step < currentStep) previous = step;
    if (step > currentStep) {
      next = step;
      break;
    }
  }
  return { previous, next };
}

function nearestContinuousStep(targetStepFloat: number, currentStep: number, stepCount: number): number {
  let target = Number.isFinite(targetStepFloat) ? targetStepFloat : currentStep;
  const halfCycle = Math.max(1, stepCount) * 0.5;
  while (target - currentStep > halfCycle) target -= stepCount;
  while (currentStep - target > halfCycle) target += stepCount;
  return target;
}

function synthLiveNudgeValues(
  events: readonly SynthLiveOverdubCaptureEvent[],
  triggerPattern: readonly boolean[],
  preserveTriggerSteps: boolean,
): number[] {
  if (!preserveTriggerSteps) return new Array(events.length).fill(0);
  const stepCount = Math.max(1, triggerPattern.length);
  const triggerSteps = synthLiveTriggerSteps(triggerPattern);
  return events.map((event) => {
    const currentStep = event.targetStepIndex;
    const { previous, next } = synthLiveAdjacentTriggerSteps(triggerSteps, currentStep, stepCount);
    return computeNudgeFromContinuousStep(
      nearestContinuousStep(event.targetStepFloat, currentStep, stepCount),
      previous,
      currentStep,
      next,
    );
  });
}

function normalizedRecorderStep(playheadStep: number | undefined, stepCount: number): number {
  const safeStepCount = Math.max(1, Math.round(stepCount));
  const source = typeof playheadStep === 'number' && Number.isFinite(playheadStep)
    ? Math.floor(playheadStep)
    : 0;
  return ((source % safeStepCount) + safeStepCount) % safeStepCount;
}

function applyEvolvedStepOverridePatch(
  previous: StepOverrides,
  laneIndex: number,
  data: EvolvedSequencerPatch['data'],
): StepOverrides {
  const next = { ...previous };
  if (data.triggerToggles?.[laneIndex] != null) {
    const arr = [...previous.triggerToggles];
    arr[laneIndex] = new Map(data.triggerToggles[laneIndex]);
    next.triggerToggles = arr;
  }
  for (const key of STEP_OVERRIDE_VALUE_KEYS) {
    if (data[key] && data[key]![laneIndex] != null) {
      const arr = [...previous[key]];
      arr[laneIndex] = data[key]![laneIndex];
      (next as Record<string, unknown>)[key] = arr;
    }
  }
  for (const key of STEP_OVERRIDE_RANGE_KEYS) {
    if (data[key]?.[laneIndex] != null) {
      const arr = [...(previous[key] ?? [null, null, null, null])];
      arr[laneIndex] = data[key]![laneIndex];
      (next as Record<string, unknown>)[key] = arr;
    }
  }
  for (const key of STEP_OVERRIDE_DIRECTION_KEYS) {
    if (data[key]?.[laneIndex] != null) {
      const arr = [...previous[key]];
      arr[laneIndex] = data[key]![laneIndex] ?? null;
      next[key] = arr;
    }
  }
  return next;
}

const SYNTH_SOURCES = [
  { value: 'pad1', label: 'Pad 1', color: SOURCE_COLORS.pad1 },
  { value: 'pad2', label: 'Pad 2', color: SOURCE_COLORS.pad2 },
  { value: 'lead1', label: 'Lead 1', color: SOURCE_COLORS.lead1 },
  { value: 'lead2', label: 'Lead 2', color: SOURCE_COLORS.lead2 },
  { value: 'sample1', label: 'Sample 1', color: SOURCE_COLORS.sample1 },
  { value: 'sample2', label: 'Sample 2', color: SOURCE_COLORS.sample2 },
];

const SIMPLE_SEQUENCER_SOURCES = [
  { value: 'pad1', label: 'Pad 1', color: SOURCE_COLORS.pad1 },
  { value: 'pad2', label: 'Pad 2', color: SOURCE_COLORS.pad2 },
  { value: 'lead1', label: 'Lead 1', color: SOURCE_COLORS.lead1 },
  { value: 'lead2', label: 'Lead 2', color: SOURCE_COLORS.lead2 },
  { value: 'sample1', label: 'Sample 1', color: SOURCE_COLORS.sample1 },
  { value: 'sample2', label: 'Sample 2', color: SOURCE_COLORS.sample2 },
] as const;

const CHORD_GENERATOR_SOURCES = SIMPLE_SEQUENCER_SOURCES;

const CHORD_SEQUENCER_SOURCES = [
  { value: 'sample1', label: 'Sample 1', color: SOURCE_COLORS.sample1 },
  { value: 'sample2', label: 'Sample 2', color: SOURCE_COLORS.sample2 },
  { value: 'lead1', label: 'Lead 1', color: SOURCE_COLORS.lead1 },
  { value: 'lead2', label: 'Lead 2', color: SOURCE_COLORS.lead2 },
  { value: 'pad1', label: 'Pad 1', color: SOURCE_COLORS.pad1 },
  { value: 'pad2', label: 'Pad 2', color: SOURCE_COLORS.pad2 },
  { value: 'both', label: 'Pad 1+2', color: SOURCE_COLORS.pad1 },
] as const;

const CHORD_PLAYBACK_MODES: Array<{ value: SynthChordSequencerPlaybackMode; label: string }> = [
  { value: 'chord', label: 'Chord' },
  { value: 'arp', label: 'Arp' },
  { value: 'strum', label: 'Strum' },
];

const CHORD_ARP_SHAPES: Array<{ value: SynthChordSequencerArpShape; label: string }> = [
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'upDown', label: 'Up/Down' },
  { value: 'skip', label: 'Skip' },
  { value: 'octave', label: 'Octave' },
  { value: 'custom', label: 'Custom' },
];

const CHORD_ARP_PATTERN_LENGTHS: SynthChordSequencerArpPatternLength[] = [1, 2, 3, 4, 5, 6, 7, 8];
const CHORD_SEQUENCER_HOLD_CYCLE_LIMIT = 4;

function clampChordSequencerInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function formatChordSequencerHoldSteps(holdSteps: number, stepCount: number): string {
  const safeStepCount = Math.max(1, Math.round(stepCount));
  const safeHold = clampChordSequencerInt(holdSteps, 1, safeStepCount);
  return safeHold >= safeStepCount && safeStepCount > CHORD_SEQUENCER_HOLD_CYCLE_LIMIT ? '∞' : String(safeHold);
}

function nextChordSequencerHoldSteps(currentHoldSteps: number, stepCount: number): number {
  const safeStepCount = Math.max(1, Math.round(stepCount));
  const finiteLimit = Math.min(CHORD_SEQUENCER_HOLD_CYCLE_LIMIT, safeStepCount);
  const current = clampChordSequencerInt(currentHoldSteps, 1, safeStepCount);
  if (current < finiteLimit) return current + 1;
  if (safeStepCount > finiteLimit && current < safeStepCount) return safeStepCount;
  return 1;
}

function snapChordArpPatternLength(value: number): SynthChordSequencerArpPatternLength {
  const safe = Math.round(value);
  return CHORD_ARP_PATTERN_LENGTHS.reduce((closest, length) => (
    Math.abs(length - safe) < Math.abs(closest - safe) ? length : closest
  ), 4 as SynthChordSequencerArpPatternLength);
}

const CHORD_STRUM_DIRECTIONS: Array<{ value: SynthChordSequencerStrumDirection; label: string }> = [
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'upDown', label: 'Up/Down' },
  { value: 'downUp', label: 'Down/Up' },
  { value: 'random', label: 'Random' },
];

const CHORD_SUB_LANE_DIRECTIONS: Array<{ value: SynthChordSequencerSubLaneDirection; label: string }> = [
  { value: 'forward', label: 'Fwd' },
  { value: 'reverse', label: 'Rev' },
  { value: 'pingpong', label: 'Ping' },
];

const CHORD_SUB_LANE_META: Record<SynthChordSequencerSubLaneName, {
  label: string;
  color: string;
}> = {
  chord: {
    label: 'Voicing',
    color: CHORD_SEQUENCER_LANE_COLOR,
  },
  pitch: {
    label: 'Pitch',
    color: SEQUENCER_SUB_LANE_COLORS.pitch,
  },
  expression: {
    label: 'Expression',
    color: SEQUENCER_SUB_LANE_COLORS.expression,
  },
  morph: {
    label: 'Morph',
    color: SEQUENCER_SUB_LANE_COLORS.morph,
  },
  distance: {
    label: 'Distance',
    color: SEQUENCER_SUB_LANE_COLORS.distance,
  },
  nudge: {
    label: 'Nudge',
    color: SEQUENCER_SUB_LANE_COLORS.nudge,
  },
};

const PAD_VOICE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const PAD_VOICE_MASK_ALL = 0xff;
const PAD_VOICE_DEFAULT_MASK = 1 << 7;

const RANDOM_TIMING_SOURCES = SIMPLE_SEQUENCER_SOURCES;

const MANUAL_KEYBOARD_SOURCES: Array<{ value: ManualSynthSource; label: string; color: string }> = [
  { value: 'pad1', label: 'Pad 1', color: SOURCE_COLORS.pad1 },
  { value: 'pad2', label: 'Pad 2', color: SOURCE_COLORS.pad2 },
  { value: 'lead1', label: 'Lead 1', color: SOURCE_COLORS.lead1 },
  { value: 'lead2', label: 'Lead 2', color: SOURCE_COLORS.lead2 },
  { value: 'sample1', label: 'Sample 1', color: SOURCE_COLORS.sample1 },
  { value: 'sample2', label: 'Sample 2', color: SOURCE_COLORS.sample2 },
];

type SampleSlotUiConfig = {
  label: string;
  color: string;
  enabledKey: keyof SliderState;
  libraryKey: keyof SliderState;
  roleKey: keyof SliderState;
  articulationKey: keyof SliderState;
  selectionModeKey: keyof SliderState;
  dynamicModeKey: keyof SliderState;
  fixedDynamicKey: keyof SliderState;
  variantModeKey: keyof SliderState;
  loopEnabledKey: keyof SliderState;
  maxVoicesKey: keyof SliderState;
  levelKey: keyof SliderState;
  attackMsKey: keyof SliderState;
  decayMsKey: keyof SliderState;
  sustainKey: keyof SliderState;
  holdMsKey: keyof SliderState;
  releaseMsKey: keyof SliderState;
  distanceKey: keyof SliderState;
  postLpfKey: keyof SliderState;
  stereoWidthKey: keyof SliderState;
  diffuseSendKey: keyof SliderState;
  reverbSendKey: keyof SliderState;
  delayASendKey: keyof SliderState;
  delayBSendKey: keyof SliderState;
  granularSendKey: keyof SliderState;
  degradeSendKey: keyof SliderState;
};

const SAMPLE_SLOT_UI: Record<SampleSlotId, SampleSlotUiConfig> = {
  sample1: {
    label: 'Sample 1',
    color: SOURCE_COLORS.sample1,
    enabledKey: 'sample1Enabled',
    libraryKey: 'sample1LibraryKey',
    roleKey: 'sample1Role',
    articulationKey: 'sample1Articulation',
    selectionModeKey: 'sample1SelectionMode',
    dynamicModeKey: 'sample1DynamicMode',
    fixedDynamicKey: 'sample1FixedDynamic',
    variantModeKey: 'sample1VariantMode',
    loopEnabledKey: 'sample1LoopEnabled',
    maxVoicesKey: 'sample1MaxVoices',
    levelKey: 'sample1Level',
    attackMsKey: 'sample1AttackMs',
    decayMsKey: 'sample1DecayMs',
    sustainKey: 'sample1Sustain',
    holdMsKey: 'sample1HoldMs',
    releaseMsKey: 'sample1ReleaseMs',
    distanceKey: 'sample1Distance',
    postLpfKey: 'sample1PostLPF',
    stereoWidthKey: 'sample1StereoWidth',
    diffuseSendKey: 'sample1DiffuseSend',
    reverbSendKey: 'sample1ReverbSend',
    delayASendKey: 'sample1DelayASend',
    delayBSendKey: 'sample1DelayBSend',
    granularSendKey: 'granularSample1Send',
    degradeSendKey: 'degradeSample1Send',
  },
  sample2: {
    label: 'Sample 2',
    color: SOURCE_COLORS.sample2,
    enabledKey: 'sample2Enabled',
    libraryKey: 'sample2LibraryKey',
    roleKey: 'sample2Role',
    articulationKey: 'sample2Articulation',
    selectionModeKey: 'sample2SelectionMode',
    dynamicModeKey: 'sample2DynamicMode',
    fixedDynamicKey: 'sample2FixedDynamic',
    variantModeKey: 'sample2VariantMode',
    loopEnabledKey: 'sample2LoopEnabled',
    maxVoicesKey: 'sample2MaxVoices',
    levelKey: 'sample2Level',
    attackMsKey: 'sample2AttackMs',
    decayMsKey: 'sample2DecayMs',
    sustainKey: 'sample2Sustain',
    holdMsKey: 'sample2HoldMs',
    releaseMsKey: 'sample2ReleaseMs',
    distanceKey: 'sample2Distance',
    postLpfKey: 'sample2PostLPF',
    stereoWidthKey: 'sample2StereoWidth',
    diffuseSendKey: 'sample2DiffuseSend',
    reverbSendKey: 'sample2ReverbSend',
    delayASendKey: 'sample2DelayASend',
    delayBSendKey: 'sample2DelayBSend',
    granularSendKey: 'granularSample2Send',
    degradeSendKey: 'degradeSample2Send',
  },
};

function sampleOptionLabel(value: string): string {
  if (value === '') return 'Default';
  return value
    .split('-')
    .map((part) => part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join(' ');
}

const MANUAL_KEYBOARD_LAYOUT = [
  { code: 'KeyA', shortcut: 'A', semitone: 0, accidental: false },
  { code: 'KeyW', shortcut: 'W', semitone: 1, accidental: true },
  { code: 'KeyS', shortcut: 'S', semitone: 2, accidental: false },
  { code: 'KeyE', shortcut: 'E', semitone: 3, accidental: true },
  { code: 'KeyD', shortcut: 'D', semitone: 4, accidental: false },
  { code: 'KeyF', shortcut: 'F', semitone: 5, accidental: false },
  { code: 'KeyT', shortcut: 'T', semitone: 6, accidental: true },
  { code: 'KeyG', shortcut: 'G', semitone: 7, accidental: false },
  { code: 'KeyY', shortcut: 'Y', semitone: 8, accidental: true },
  { code: 'KeyH', shortcut: 'H', semitone: 9, accidental: false },
  { code: 'KeyU', shortcut: 'U', semitone: 10, accidental: true },
  { code: 'KeyJ', shortcut: 'J', semitone: 11, accidental: false },
  { code: 'KeyK', shortcut: 'K', semitone: 12, accidental: false },
  { code: 'KeyO', shortcut: 'O', semitone: 13, accidental: true },
  { code: 'KeyL', shortcut: 'L', semitone: 14, accidental: false },
  { code: 'KeyP', shortcut: 'P', semitone: 15, accidental: true },
  { code: 'Semicolon', shortcut: ';', semitone: 16, accidental: false },
  { code: 'Quote', shortcut: '\'', semitone: 17, accidental: false },
] as const;
const MANUAL_KEYBOARD_INDEX_BY_CODE = new Map<string, number>(
  MANUAL_KEYBOARD_LAYOUT.map((key, index) => [key.code, index]),
);
const MANUAL_KEYBOARD_VISIBLE_LAYOUT = MANUAL_KEYBOARD_LAYOUT.slice(0, 13);

const MANUAL_KEYBOARD_VELOCITY = 0.82;
const MANUAL_KEYBOARD_MIN_OCTAVE = 1;
const MANUAL_KEYBOARD_MAX_OCTAVE = 6;
const MAX_SUBLANE_STEPS = 16;
const CHROMATIC_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const HARMONY_PITCH_SCALE = 'Harmony' as const;
const HARMONY_PITCH_ROOT_OCTAVE_MIDI = 60;
const DEFAULT_SCALE_INTERVALS = SCALES.Major ?? [0, 2, 4, 5, 7, 9, 11];
const SYNTH_DEFAULT_PITCH_SETTINGS: PitchSettings = {
  mode: 'semitones',
  root: 60,
  scale: HARMONY_PITCH_SCALE,
};
const PITCH_BINDING_MODE_OPTIONS: Array<{ value: PitchBindingMode; label: string }> = [
  { value: 'polyrhythmic', label: 'Polyrhythmic' },
  { value: 'linked', label: 'Linked' },
  { value: 'sequence', label: 'Sequence' },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace('#', '');
  const full = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const value = Number.parseInt(full, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
    .join('')}`;
}

function getComplementaryHex(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';
  return rgbToHex(255 - rgb.r, 255 - rgb.g, 255 - rgb.b);
}

function getKeyboardCursorMarkerStyle(color: string): React.CSSProperties {
  return {
    '--cursor-color': color,
    '--cursor-accent': getComplementaryHex(color),
  } as React.CSSProperties;
}

type KeyboardInputMode = 'play' | 'sequence';
type KeyboardHarmonyStatus = 'root' | 'chord' | 'scale' | 'outside';
type KeyboardSequenceCursorTarget = 'trigger' | 'pitch';
type SynthKeyboardEditLane = 'trigger' | 'pitch' | 'expression' | 'morph' | 'distance' | 'nudge';
type SynthDetailOpenLane = SubLaneKind | 'trigger' | 'arp';
type LeadPresetSlotKey = 'lead1PresetA' | 'lead1PresetB' | 'lead2PresetC' | 'lead2PresetD';
type LeadPresetFallbackId = 'soft_rhodes' | 'gamelan';
type LeadPresetOption = {
  id: string;
  name: string;
  library: 'stock' | 'user' | 'cloud';
  tags?: string[];
  updatedAt?: number;
  rating?: number;
  runtime?: boolean;
  slotKey?: LeadPresetSlotKey;
  sourceId?: string;
  sourceName?: string;
  sourceLibrary?: 'stock' | 'user' | 'cloud';
};

function leadPresetOptionPriority(option: LeadPresetOption): number {
  if (option.library === 'stock') return 4;
  if (option.library === 'cloud') return 3;
  if (option.library === 'user') return 2;
  return 1;
}

function normalizePoolMatchKey(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function padOptionToPoolCandidate(option: PadPresetOption): PresetPoolCandidate {
  return {
    id: option.id,
    name: option.name,
    library: option.library,
    tags: option.tags,
    updatedAt: option.updatedAt,
    rating: option.rating,
    aliases: [option.id, option.name],
  };
}

function leadOptionToPoolCandidate(option: LeadPresetOption): PresetPoolCandidate {
  return {
    id: option.sourceId ?? option.id,
    name: option.sourceName ?? option.name,
    library: option.sourceLibrary ?? option.library,
    tags: option.tags,
    updatedAt: option.updatedAt,
    rating: option.rating,
    aliases: [option.id, option.name, option.sourceId, option.sourceName].filter((value): value is string => Boolean(value)),
  };
}

function candidateMatchesOption(candidate: PresetPoolCandidate, optionValues: Array<string | undefined>): boolean {
  const candidateKeys = new Set(
    [candidate.id, candidate.name, ...(candidate.aliases ?? [])]
      .map(normalizePoolMatchKey)
      .filter((key): key is string => Boolean(key)),
  );
  return optionValues
    .map(normalizePoolMatchKey)
    .filter((key): key is string => Boolean(key))
    .some(key => candidateKeys.has(key));
}

function filterPadOptionsByPool(options: PadPresetOption[], candidates: PresetPoolCandidate[]): PadPresetOption[] {
  if (candidates.length === 0) return [];
  return options.filter(option => candidates.some(candidate => candidateMatchesOption(candidate, [option.id, option.name])));
}

function filterLeadOptionsByPool(options: LeadPresetOption[], candidates: PresetPoolCandidate[]): LeadPresetOption[] {
  if (candidates.length === 0) return [];
  return options.filter(option => candidates.some(candidate => candidateMatchesOption(candidate, [
    option.id,
    option.name,
    option.sourceId,
    option.sourceName,
  ])));
}

const POOL_PREVIEW_PAD_LEVEL_FLOOR = 0.72;
const POOL_PREVIEW_LEAD_LEVEL_FLOOR = 0.76;

type PoolPreviewLevelKey = 'synthLevel' | 'pad2Level' | 'lead1Level' | 'lead2Level';

function applyPoolPreviewLevelFloor(state: SliderState, key: PoolPreviewLevelKey, floor: number): void {
  const current = state[key];
  if (current < floor) {
    state[key] = floor;
  }
}

function previewStateForPadPoolSlot(state: SliderState, slotKey: keyof SliderState, presetId: string): SliderState {
  const next = { ...state, [slotKey]: presetId } as SliderState;
  if (slotKey === 'padPresetA') {
    next.padMorph = 0;
    next.padEnabled = true;
    applyPoolPreviewLevelFloor(next, 'synthLevel', POOL_PREVIEW_PAD_LEVEL_FLOOR);
  }
  if (slotKey === 'padPresetB') {
    next.padMorph = 1;
    next.padEnabled = true;
    applyPoolPreviewLevelFloor(next, 'synthLevel', POOL_PREVIEW_PAD_LEVEL_FLOOR);
  }
  if (slotKey === 'pad2PresetA') {
    next.pad2Morph = 0;
    next.pad2Enabled = true;
    applyPoolPreviewLevelFloor(next, 'pad2Level', POOL_PREVIEW_PAD_LEVEL_FLOOR);
  }
  if (slotKey === 'pad2PresetB') {
    next.pad2Morph = 1;
    next.pad2Enabled = true;
    applyPoolPreviewLevelFloor(next, 'pad2Level', POOL_PREVIEW_PAD_LEVEL_FLOOR);
  }
  return next;
}

function previewStateForLeadPoolSlot(state: SliderState, slotKey: LeadPresetSlotKey, presetId: string): SliderState {
  const next = { ...state, [slotKey]: presetId } as SliderState;
  if (slotKey === 'lead1PresetA') {
    next.lead1Morph = 0;
    next.lead1UseCustomAdsr = false;
    next.leadEnabled = true;
    applyPoolPreviewLevelFloor(next, 'lead1Level', POOL_PREVIEW_LEAD_LEVEL_FLOOR);
  }
  if (slotKey === 'lead1PresetB') {
    next.lead1Morph = 1;
    next.lead1UseCustomAdsr = false;
    next.leadEnabled = true;
    applyPoolPreviewLevelFloor(next, 'lead1Level', POOL_PREVIEW_LEAD_LEVEL_FLOOR);
  }
  if (slotKey === 'lead2PresetC') {
    next.lead2Morph = 0;
    next.lead2UseCustomAdsr = false;
    next.lead2Enabled = true;
    applyPoolPreviewLevelFloor(next, 'lead2Level', POOL_PREVIEW_LEAD_LEVEL_FLOOR);
  }
  if (slotKey === 'lead2PresetD') {
    next.lead2Morph = 1;
    next.lead2UseCustomAdsr = false;
    next.lead2Enabled = true;
    applyPoolPreviewLevelFloor(next, 'lead2Level', POOL_PREVIEW_LEAD_LEVEL_FLOOR);
  }
  return next;
}

function leadManualSourceForSlot(slotKey: LeadPresetSlotKey): ManualSynthSource {
  return slotKey === 'lead1PresetA' || slotKey === 'lead1PresetB' ? 'lead1' : 'lead2';
}

const STOCK_LEAD4OP_PRESETS: Array<{ id: string; name: string }> = [
  { id: 'soft_rhodes', name: 'Soft Rhodes' },
  { id: 'gamelan', name: 'Gamelan' },
];

const LEAD_PRESET_SLOT_FALLBACKS: Record<LeadPresetSlotKey, LeadPresetFallbackId> = {
  lead1PresetA: 'soft_rhodes',
  lead1PresetB: 'gamelan',
  lead2PresetC: 'soft_rhodes',
  lead2PresetD: 'gamelan',
};

function leadPresetFallbackForPresetId(presetId: string): LeadPresetFallbackId {
  return presetId.trim().toLowerCase().replace(/[\s-]+/g, '_') === 'gamelan'
    ? 'gamelan'
    : 'soft_rhodes';
}

interface LeadEditorSlotChoice {
  slotKey: LeadPresetSlotKey;
  slotLabel: string;
  accentColor: string;
}

interface LeadEditorSession {
  sourceLabel: string;
  slotKey: LeadPresetSlotKey;
  slots: LeadEditorSlotChoice[];
}

export interface SynthKeyboardUiState {
  open: boolean;
  inputMode: KeyboardInputMode;
  source: ManualSynthSource;
  octave: number;
  sequenceSteps?: number[];
  triggerSteps?: number[];
  pitchSteps?: number[];
  sequenceCursorTarget?: KeyboardSequenceCursorTarget;
}

const SYNTH_KEYBOARD_EDIT_LANES: readonly SynthKeyboardEditLane[] = ['trigger', 'pitch', 'expression', 'morph', 'distance', 'nudge'] as const;
const ARP_CONTOUR_MIN = -12;
const ARP_CONTOUR_MAX = 12;
const ARP_CONTOUR_SVG_RANGE = ARP_CONTOUR_MAX - ARP_CONTOUR_MIN;
const ARP_VISIBLE_STEPS = 16;
const ARP_FULL_STEP_MASK = (1 << ARP_VISIBLE_STEPS) - 1;
const ARP_FLOW_OPTIONS: Array<{ value: ProductArpFlow; label: string }> = [
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'upDown', label: 'Up/Down' },
  { value: 'downUp', label: 'Down/Up' },
  { value: 'randomLiveTone', label: 'Random Live' },
  { value: 'diceHold', label: 'Dice Hold' },
];
const ARP_RATE_OPTIONS: Array<{ value: ProductArpRate; label: string }> = [
  { value: 0.5, label: '1/2x' },
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 4, label: '4x' },
];
const ARP_BOUNDARY_OPTIONS: Array<{ value: ProductArpBoundaryMode; label: string }> = [
  { value: 'fold', label: 'Fold' },
  { value: 'wrap', label: 'Wrap' },
  { value: 'clamp', label: 'Clamp' },
];
const ARP_CONTOUR_MODE_OPTIONS: Array<{ value: ProductArpContourMode; label: string }> = [
  { value: 'pool', label: 'Pool' },
  { value: 'semitone', label: 'Semitone' },
];
const ARP_SLOT_CHOICES: Array<{ value: ProductArpSlotChoice; label: string }> = [
  { value: -1, label: 'Follow' },
  { value: 0, label: 'S1' },
  { value: 1, label: 'S2' },
  { value: 2, label: 'S3' },
  { value: 3, label: 'S4' },
  { value: 4, label: 'S5' },
  { value: 5, label: 'S6' },
  { value: 6, label: 'S7' },
  { value: 7, label: 'S8' },
];
const ARP_CONTOUR_GRID_VALUES = [12, 6, 0, -6, -12] as const;
type ArpContourPreset = 'flat' | 'rise' | 'fall' | 'wave';
const ARP_CONTOUR_PRESETS: Array<{ value: ArpContourPreset; label: string }> = [
  { value: 'flat', label: 'Flat' },
  { value: 'rise', label: 'Rise' },
  { value: 'fall', label: 'Fall' },
  { value: 'wave', label: 'Wave' },
];
const PLAY_MODE_OPTIONS: Array<{ value: ProductPlayMode; label: string }> = [
  { value: 'arp', label: 'ARP' },
  { value: 'chord', label: 'Chord' },
];
const CHORD_STYLE_OPTIONS: Array<{ value: ProductChordStyle; label: string }> = [
  { value: 'straight', label: 'Straight' },
  { value: 'strum', label: 'Strum' },
];
const CHORD_FLOW_OPTIONS: Array<{ value: ProductChordFlow; label: string }> = [
  { value: 'forward', label: 'Forward' },
  { value: 'reverse', label: 'Reverse' },
  { value: 'pingpong', label: 'Pingpong' },
];
type HarmonyBank = 'A' | 'B';
const ARP_ROMAN_DEGREES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;
const ARP_QUALITY_LABELS = {
  auto: 'Auto',
  dim: 'Dim',
  min: 'Min',
  maj: 'Maj',
  sus: 'Sus',
  maj7: 'M7',
  min7: 'm7',
  dom7: '7',
  add9: 'add9',
  six: '6',
  sixNine: '6/9',
  nine: '9',
  quartal: 'Quartal',
  cluster: 'Cluster',
  custom: 'Custom',
} as const;
const ARP_EXTENSION_LABELS: Readonly<Record<string, string>> = {
  six: '6',
  min7: 'm7',
  maj7: 'M7',
  dom7: '7',
  add9: '9',
  nine: '9',
  sixNine: '6/9',
};

function normalizeKeyboardStepArray(steps?: number[]): number[] {
  return Array.from({ length: 4 }, (_, index) => {
    const value = steps?.[index];
    return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0;
  });
}

function formatArpPitchClass(value: number): string {
  return CHROMATIC_NOTE_NAMES[((Math.round(value) % 12) + 12) % 12] ?? 'C';
}

function formatArpIntentTitle(intent: HarmonyIntent | null | undefined): string {
  if (!intent) return 'Empty';
  const root = intent.rootMode === 'degree'
    ? ARP_ROMAN_DEGREES[Math.max(0, Math.min(6, Math.round(intent.degree)))] ?? 'I'
    : formatArpPitchClass(intent.rootNote);
  const quality = ARP_QUALITY_LABELS[intent.quality] ?? intent.quality;
  const extensions = intent.extensions
    .map((extension) => ARP_EXTENSION_LABELS[extension] ?? extension)
    .filter((extension) => extension !== quality);
  return [root, quality, ...extensions].join(' ');
}

function formatArpSlotChoiceLabel(slots: readonly HarmonyChordSlot[], choice: ProductArpSlotChoice): string {
  if (choice < 0) return 'F';
  const slot = slots[choice];
  return slot ? `S${choice + 1} ${formatArpIntentTitle(slot.intent)}` : `S${choice + 1}`;
}

function formatArpSlotChoiceCompactLabel(choice: ProductArpSlotChoice): string {
  return choice < 0 ? 'F' : `S${choice + 1}`;
}

function formatArpSlotChoiceTitle(
  slots: readonly HarmonyChordSlot[],
  choice: ProductArpSlotChoice,
  harmony: ReturnType<typeof createProductArpHarmonyContext>,
): string {
  if (choice < 0) return 'Follow current harmony';
  const slot = slots[choice];
  if (!slot) return `Slot ${choice + 1}`;
  const notes = resolveHarmonyIntentToNotePool({
    intent: { ...slot.intent, source: 'slot' },
    rootMidi: harmony.rootMidi,
    scaleId: harmony.scaleId,
    tension: harmony.tension,
  }).map(formatMidiNoteName);
  return `S${choice + 1} ${formatArpIntentTitle(slot.intent)}${notes.length ? ` · ${notes.join(' ')}` : ''}`;
}

function clampArpContourValue(value: number): number {
  return Math.max(ARP_CONTOUR_MIN, Math.min(ARP_CONTOUR_MAX, Math.round(value)));
}

function clampArpLengthValue(value: number): number {
  return Math.max(1, Math.min(ARP_VISIBLE_STEPS, Math.round(value)));
}

function stepRangeMask(start: number, end: number): number {
  const safeStart = Math.max(0, Math.min(ARP_VISIBLE_STEPS, Math.round(start)));
  const safeEnd = Math.max(safeStart, Math.min(ARP_VISIBLE_STEPS, Math.round(end)));
  let mask = 0;
  for (let step = safeStart; step < safeEnd; step += 1) {
    mask |= 1 << step;
  }
  return mask;
}

function armNewArpLengthSteps(pulseMask: number, oldLength: number, nextLength: number): number {
  const normalizedMask = Math.max(0, Math.min(ARP_FULL_STEP_MASK, Math.round(pulseMask)));
  if (nextLength <= oldLength) return normalizedMask;
  return normalizedMask | stepRangeMask(oldLength, nextLength);
}

function armNewChordLengthSteps(
  steps: readonly ProductChordPlayConfig['steps'][number][],
  oldLength: number,
  nextLength: number,
): ProductChordPlayConfig['steps'] {
  if (nextLength <= oldLength) return steps.map((step, index) => step ?? { active: false, slotId: index % 8 });
  return Array.from({ length: ARP_VISIBLE_STEPS }, (_, index) => {
    const step = steps[index] ?? { active: false, slotId: index % 8 };
    return index >= oldLength && index < nextLength ? { ...step, active: true } : step;
  });
}

function arpContourPresetValues(preset: ArpContourPreset): number[] {
  return Array.from({ length: ARP_VISIBLE_STEPS }, (_, step) => {
    if (preset === 'rise') return clampArpContourValue((step % 8) - 3);
    if (preset === 'fall') return clampArpContourValue(3 - (step % 8));
    if (preset === 'wave') return [0, 2, 4, 2, 0, -2, -4, -2][step % 8] ?? 0;
    return 0;
  });
}

function mutateArpContourValues(contour: readonly number[]): number[] {
  return Array.from({ length: ARP_VISIBLE_STEPS }, (_, step) => {
    const current = contour[step] ?? 0;
    const nudge = Math.floor(Math.random() * 5) - 2;
    return clampArpContourValue(current + nudge);
  });
}

function formatArpMove(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function arpContourSvgY(value: number): number {
  return ARP_CONTOUR_MAX - clampArpContourValue(value);
}

function arpContourTopPercent(value: number): number {
  return (arpContourSvgY(value) / ARP_CONTOUR_SVG_RANGE) * 100;
}

function formatArpResolvedNote(midi: number | null | undefined): string {
  return typeof midi === 'number' && Number.isFinite(midi) && midi >= 0 ? formatMidiNoteName(midi) : '--';
}

function chordPitchViewport(details: readonly ProductChordResolvedStep[]): number[] {
  const notes = details.flatMap((detail) => detail.notes);
  if (notes.length === 0) return Array.from({ length: 13 }, (_, index) => 60 + index);
  const low = Math.max(0, Math.min(...notes) - 6);
  const high = Math.min(127, Math.max(...notes) + 6);
  return Array.from({ length: high - low + 1 }, (_, index) => low + index);
}

function strumOrderIndex(detail: ProductChordResolvedStep, midi: number): number {
  const index = detail.strumOrder.indexOf(midi);
  return index >= 0 ? index + 1 : 0;
}

function normalizeChordMidiPool(notes: readonly number[]): number[] {
  return Array.from(new Set(notes
    .map((note) => Math.max(0, Math.min(127, Math.round(note))))
    .filter((note) => Number.isFinite(note))))
    .sort((left, right) => left - right);
}

function synthHarmonyMorphPercent(state: SliderState): number {
  const record = state as unknown as Record<string, unknown>;
  const explicit = record.harmonyMorphPercent;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return Math.max(0, Math.min(100, explicit));
  const journeyPhase = record.journeyMorphPhase;
  if (typeof journeyPhase === 'number' && Number.isFinite(journeyPhase)) return Math.max(0, Math.min(100, journeyPhase * 100));
  return 0;
}

function harmonyBankKeys(bank: HarmonyBank): { slots: keyof SliderState } {
  return bank === 'B'
    ? { slots: 'harmonyChordSlotsB' }
    : { slots: 'harmonyChordSlotsA' };
}

function shouldMirrorHarmonyBaseBank(record: Record<string, unknown>, bank: HarmonyBank): boolean {
  if (bank !== 'A') return false;
  return record.harmonyChordSlotsA === undefined && record.harmonyChordSlotsB === undefined;
}

interface ArpContourEditorProps {
  config: ProductArpConfig;
  color: string;
  harmony: ReturnType<typeof createProductArpHarmonyContext>;
  resolvedSteps: ProductArpResolvedStep[];
  selectedStep: number;
  playStep?: number | null;
  onSelectStep: (step: number) => void;
  onToggleEnabled: () => void;
  onUpdateConfig: (patch: Partial<ProductArpConfig>) => void;
  onSetContour: (step: number, value: number) => void;
  onTogglePulse: (step: number) => void;
  onSetSlotChoice: (step: number, value: ProductArpSlotChoice) => void;
  onToggleReset: (step: number) => void;
  onApplyPreset: (preset: ArpContourPreset) => void;
  onMutate: () => void;
}

const ArpContourEditor: React.FC<ArpContourEditorProps> = ({
  config,
  color,
  harmony,
  resolvedSteps,
  selectedStep,
  playStep = null,
  onSelectStep,
  onToggleEnabled,
  onUpdateConfig,
  onSetContour,
  onTogglePulse,
  onSetSlotChoice,
  onToggleReset,
  onApplyPreset,
  onMutate,
}) => {
  const length = clampArpLengthValue(config.length);
  const selected = Math.max(0, Math.min(ARP_VISIBLE_STEPS - 1, Math.round(selectedStep)));
  const playbackStep = typeof playStep === 'number' && Number.isFinite(playStep)
    ? ((Math.floor(playStep) % ARP_VISIBLE_STEPS) + ARP_VISIBLE_STEPS) % ARP_VISIBLE_STEPS
    : null;
  const selectedInRange = selected < length;
  const selectedDetail = selectedInRange ? resolvedSteps[selected] : undefined;
  const selectedMove = config.contour[selected] ?? 0;
  const selectedSource = config.slotLane[selected] ?? -1;
  const selectedPulseStored = (config.pulseMask & (1 << selected)) !== 0;
  const selectedResetStored = (config.resetMask & (1 << selected)) !== 0;
  const playingDetail = playbackStep == null ? undefined : resolvedSteps[playbackStep];
  const [dragState, setDragState] = useState<{
    pointerId: number;
    step: number;
    startY: number;
    startValue: number;
    value: number;
  } | null>(null);
  const contourPoints = Array.from({ length: ARP_VISIBLE_STEPS }, (_, step) => {
    const move = config.contour[step] ?? 0;
    return `${step + 0.5},${arpContourSvgY(move)}`;
  }).join(' ');

  const beginDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>, step: number) => {
    if (event.button !== 0) return;
    const value = config.contour[step] ?? 0;
    onSelectStep(step);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      step,
      startY: event.clientY,
      startValue: value,
      value,
    });
  }, [config.contour, onSelectStep]);

  const updateDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    event.preventDefault();
    const delta = Math.round((dragState.startY - event.clientY) / 8);
    const nextValue = clampArpContourValue(dragState.startValue + delta);
    setDragState((current) => current ? { ...current, value: nextValue } : current);
    onSetContour(dragState.step, nextValue);
  }, [dragState, onSetContour]);

  const endDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    setDragState(null);
  }, [dragState]);

  return (
    <div className="seq-arp-editor" style={{ '--seq-arp-color': color } as React.CSSProperties}>
      <div className="seq-arp-toolbar">
        <button
          type="button"
          className={`seq-lane-enable-btn${config.enabled ? ' on' : ''}`}
          onClick={onToggleEnabled}
        >
          {config.enabled ? 'On' : 'Off'}
        </button>
        <label className="seq-arp-field">
          <span>Flow</span>
          <select
            className="seq-arp-select"
            value={config.flow}
            onChange={(event) => {
              onUpdateConfig({ flow: event.target.value as ProductArpFlow });
              blurSelectAfterChange(event.currentTarget);
            }}
          >
            {ARP_FLOW_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="seq-arp-field seq-arp-rate-field">
          <span>Rate</span>
          <select
            className="seq-arp-select"
            value={config.rate}
            onChange={(event) => {
              onUpdateConfig({ rate: Number.parseFloat(event.target.value) as ProductArpRate });
              blurSelectAfterChange(event.currentTarget);
            }}
          >
            {ARP_RATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="seq-arp-field seq-arp-length-field">
          <span>Len</span>
          <input
            className="seq-arp-length-input"
            type="number"
            min={1}
            max={16}
            value={length}
            onChange={(event) => {
              const nextLength = Number.parseInt(event.target.value, 10);
              if (Number.isFinite(nextLength)) onUpdateConfig({ length: nextLength });
            }}
          />
        </label>
        <label className="seq-arp-field seq-arp-boundary-field">
          <span>Boundary</span>
          <select
            className="seq-arp-select"
            value={config.boundaryMode}
            onChange={(event) => {
              onUpdateConfig({ boundaryMode: event.target.value as ProductArpBoundaryMode });
              blurSelectAfterChange(event.currentTarget);
            }}
          >
            {ARP_BOUNDARY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="seq-arp-segment" aria-label="ARP contour mode">
          {ARP_CONTOUR_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={config.contourMode === option.value ? 'active' : ''}
              onClick={() => onUpdateConfig({ contourMode: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="seq-arp-action-row" aria-label="ARP contour presets">
        {ARP_CONTOUR_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            className="seq-arp-action-button"
            onClick={() => onApplyPreset(preset.value)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className="seq-arp-action-button strong"
          onClick={onMutate}
        >
          Mutate
        </button>
      </div>

      <div className="seq-arp-contour">
        <div className="seq-arp-contour-scale" aria-hidden="true">
          {ARP_CONTOUR_GRID_VALUES.map((value) => (
            <span key={value} style={{ top: `${arpContourTopPercent(value)}%` }}>{formatArpMove(value)}</span>
          ))}
        </div>
        <div className="seq-arp-contour-plot">
          <svg
            className="seq-arp-contour-svg"
            viewBox={`0 0 ${ARP_VISIBLE_STEPS} ${ARP_CONTOUR_SVG_RANGE}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {ARP_CONTOUR_GRID_VALUES.map((value) => (
              <line
                key={value}
                x1={0}
                x2={ARP_VISIBLE_STEPS}
                y1={arpContourSvgY(value)}
                y2={arpContourSvgY(value)}
                className={value === 0 ? 'zero' : undefined}
              />
            ))}
            <polyline points={contourPoints} />
          </svg>
          <div className="seq-arp-contour-columns" style={{ gridTemplateColumns: `repeat(${ARP_VISIBLE_STEPS}, minmax(0, 1fr))` }}>
            {Array.from({ length: ARP_VISIBLE_STEPS }, (_, step) => (
              <button
                key={step}
                type="button"
                className={`seq-arp-contour-column${selected === step ? ' selected' : ''}${playbackStep === step ? ' playing' : ''}${step >= length ? ' out' : ''}`}
                onClick={() => onSelectStep(step)}
                aria-label={`Select arp step ${step + 1}`}
              >
                <span>{step + 1}</span>
              </button>
            ))}
          </div>
          {Array.from({ length: ARP_VISIBLE_STEPS }, (_, step) => {
            const move = config.contour[step] ?? 0;
            const inRange = step < length;
            const stored = (config.pulseMask & (1 << step)) !== 0;
            const active = inRange && stored;
            const reset = (config.resetMask & (1 << step)) !== 0;
            const detail = inRange ? resolvedSteps[step] : undefined;
            return (
              <button
                key={step}
                type="button"
                className={`seq-arp-contour-node${active ? '' : ' muted'}${selected === step ? ' selected' : ''}${playbackStep === step ? ' playing' : ''}${reset ? ' reset' : ''}${inRange ? '' : ' out'}${stored && !inRange ? ' armed' : ''}`}
                style={{
                  left: `${((step + 0.5) / ARP_VISIBLE_STEPS) * 100}%`,
                  top: `${arpContourTopPercent(move)}%`,
                }}
                onPointerDown={(event) => beginDrag(event, step)}
                onPointerMove={updateDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onDoubleClick={() => onSetContour(step, 0)}
                title={`Step ${step + 1} move ${formatArpMove(move)} ${inRange ? `out ${formatArpResolvedNote(detail?.outputMidi)}` : stored ? 'stored on' : 'stored off'}`}
                aria-label={`ARP step ${step + 1} move ${formatArpMove(move)}`}
              />
            );
          })}
          {dragState && (
            <div
              className="seq-arp-drag-readout"
              style={{
                left: `${((dragState.step + 0.5) / ARP_VISIBLE_STEPS) * 100}%`,
                top: `${arpContourTopPercent(dragState.value)}%`,
              }}
            >
              {formatArpMove(dragState.value)}
            </div>
          )}
        </div>
      </div>

      <div className="seq-arp-note-row" style={{ gridTemplateColumns: `repeat(${ARP_VISIBLE_STEPS}, minmax(0, 1fr))` }}>
        {Array.from({ length: ARP_VISIBLE_STEPS }, (_, step) => {
          const inRange = step < length;
          const detail = inRange ? resolvedSteps[step] : undefined;
          const active = inRange && (config.pulseMask & (1 << step)) !== 0;
          return (
            <button
              key={step}
              type="button"
              className={`seq-arp-note-cell${active ? '' : ' muted'}${selected === step ? ' selected' : ''}${playbackStep === step ? ' playing' : ''}${inRange ? '' : ' out'}`}
              onClick={() => onSelectStep(step)}
              title={`Base ${formatArpResolvedNote(detail?.baseMidi)} out ${formatArpResolvedNote(detail?.outputMidi)}`}
            >
              {formatArpResolvedNote(detail?.outputMidi)}
            </button>
          );
        })}
      </div>

      <div className="seq-arp-source-row" style={{ gridTemplateColumns: `repeat(${ARP_VISIBLE_STEPS}, minmax(0, 1fr))` }}>
        {Array.from({ length: ARP_VISIBLE_STEPS }, (_, step) => {
          const source = config.slotLane[step] ?? -1;
          const inRange = step < length;
          return (
            <button
              key={step}
              type="button"
              className={`seq-arp-source-cell${source >= 0 ? ' locked' : ''}${selected === step ? ' selected' : ''}${playbackStep === step ? ' playing' : ''}${inRange ? '' : ' out'}`}
              onClick={() => onSelectStep(step)}
              title={formatArpSlotChoiceTitle(harmony.chordSlots, source, harmony)}
            >
              {formatArpSlotChoiceCompactLabel(source)}
            </button>
          );
        })}
      </div>

      <div className="seq-arp-gate-row" style={{ gridTemplateColumns: `repeat(${ARP_VISIBLE_STEPS}, minmax(0, 1fr))` }}>
        {Array.from({ length: ARP_VISIBLE_STEPS }, (_, step) => {
          const inRange = step < length;
          const stored = (config.pulseMask & (1 << step)) !== 0;
          const active = inRange && stored;
          const reset = (config.resetMask & (1 << step)) !== 0;
          return (
            <button
              key={step}
              type="button"
              className={`seq-arp-gate-cell${active ? ' on' : ''}${reset ? ' reset' : ''}${selected === step ? ' selected' : ''}${playbackStep === step ? ' playing' : ''}${inRange ? '' : ' out'}${stored && !inRange ? ' armed' : ''}`}
              onClick={() => onTogglePulse(step)}
              onContextMenu={(event) => {
                event.preventDefault();
                onToggleReset(step);
              }}
              aria-label={`Toggle arp step ${step + 1}`}
            >
              <span>{inRange ? (stored ? 'On' : 'Off') : (stored ? 'Set' : 'Off')}</span>
            </button>
          );
        })}
      </div>

      <div className="seq-arp-inspector">
        <span className="seq-arp-inspector-item">
          <strong>Step</strong>
          {String(selected + 1).padStart(2, '0')}
        </span>
        <span className="seq-arp-inspector-item">
          <strong>Move</strong>
          {formatArpMove(selectedMove)}
        </span>
        <span className="seq-arp-inspector-item">
          <strong>Base</strong>
          {formatArpResolvedNote(selectedDetail?.baseMidi)}
        </span>
        <span className="seq-arp-inspector-item">
          <strong>Out</strong>
          {formatArpResolvedNote(selectedDetail?.outputMidi)}
        </span>
        <span className="seq-arp-inspector-item">
          <strong>Range</strong>
          {selectedInRange ? 'Live' : 'Stored'}
        </span>
        <span className="seq-arp-inspector-item playing-note">
          <strong>Playing</strong>
          {formatArpResolvedNote(playingDetail?.outputMidi)}
        </span>
        <label className="seq-arp-inspector-source">
          <span>Source</span>
          <select
            className="seq-arp-select"
            value={selectedSource}
            title={formatArpSlotChoiceTitle(harmony.chordSlots, selectedSource, harmony)}
            onChange={(event) => {
              onSetSlotChoice(selected, Number.parseInt(event.target.value, 10) as ProductArpSlotChoice);
              blurSelectAfterChange(event.currentTarget);
            }}
          >
            {ARP_SLOT_CHOICES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.value < 0 ? option.label : formatArpSlotChoiceLabel(harmony.chordSlots, option.value)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`seq-arp-inspector-toggle${selectedSource < 0 ? ' on' : ''}`}
          onClick={() => onSetSlotChoice(selected, -1)}
        >
          Follow Harmony
        </button>
        <button
          type="button"
          className={`seq-arp-inspector-toggle${selectedPulseStored ? ' on' : ''}`}
          onClick={() => onTogglePulse(selected)}
        >
          {selectedInRange ? (selectedPulseStored ? 'Active' : 'Muted') : (selectedPulseStored ? 'Set' : 'Muted')}
        </button>
        <button
          type="button"
          className={`seq-arp-inspector-toggle${selectedResetStored ? ' on' : ''}`}
          onClick={() => onToggleReset(selected)}
        >
          {selectedResetStored ? 'Reset' : 'Free'}
        </button>
      </div>
    </div>
  );
}

interface ChordPlayEditorProps {
  config: ProductChordPlayConfig;
  color: string;
  harmony: ReturnType<typeof createProductArpHarmonyContext>;
  resolvedSteps: ProductChordResolvedStep[];
  selectedStep: number;
  onSelectStep: (step: number) => void;
  onUpdateConfig: (patch: Partial<ProductChordPlayConfig>) => void;
  onCommitSlotMidiPool?: (slotId: number, midiNotes: readonly number[]) => void;
}

const ChordPlayEditor: React.FC<ChordPlayEditorProps> = ({
  config,
  color,
  harmony,
  resolvedSteps,
  selectedStep,
  onSelectStep,
  onUpdateConfig,
  onCommitSlotMidiPool,
}) => {
  const length = clampArpLengthValue(config.length);
  const selected = Math.max(0, Math.min(ARP_VISIBLE_STEPS - 1, Math.round(selectedStep)));
  const selectedDetail = resolvedSteps.find((step) => step.sourceStep === selected) ?? resolvedSteps[selected];
  const pitches = chordPitchViewport(resolvedSteps);
  const [selectedNote, setSelectedNote] = useState<{ slotId: number; midi: number } | null>(null);
  const slotNotePools = useMemo(() => harmony.chordSlots.map((slot) => resolveHarmonyIntentToNotePool({
    intent: slot.intent,
    rootMidi: harmony.rootMidi,
    scaleId: harmony.scaleId,
    tension: harmony.tension,
  })), [harmony.chordSlots, harmony.rootMidi, harmony.scaleId, harmony.tension]);
  const selectedSlotId = config.steps[selected]?.slotId ?? 0;
  const selectedSlot = harmony.chordSlots[selectedSlotId];
  const selectedSlotLocked = selectedSlot?.locked === true;
  const selectedSlotUses = config.steps.reduce((count, step, index) => (
    index < length && step.active && step.slotId === selectedSlotId ? count + 1 : count
  ), 0);
  const canEditChordNotes = Boolean(onCommitSlotMidiPool);
  const updateStep = useCallback((step: number, patch: Partial<ProductChordPlayConfig['steps'][number]>) => {
    const steps = [...config.steps];
    steps[step] = { active: true, slotId: step % 8, ...(steps[step] ?? {}), ...patch };
    onUpdateConfig({ steps });
  }, [config.steps, onUpdateConfig]);
  const commitSlotNotes = useCallback((slotId: number, nextNotes: readonly number[]) => {
    const slot = harmony.chordSlots[slotId];
    if (!slot || slot.locked || !onCommitSlotMidiPool) return;
    const normalized = normalizeChordMidiPool(nextNotes).slice(0, HARMONY_POOL_MAX_NOTES);
    if (normalized.length === 0) return;
    onCommitSlotMidiPool(slotId, normalized);
  }, [harmony.chordSlots, onCommitSlotMidiPool]);
  const togglePitchForStep = useCallback((step: number, midi: number, hasNote: boolean) => {
    const chordStep = config.steps[step] ?? { active: true, slotId: step % 8 };
    const slot = harmony.chordSlots[chordStep.slotId];
    if (!slot || slot.locked || !onCommitSlotMidiPool) {
      onSelectStep(step);
      return;
    }
    const currentNotes = slotNotePools[chordStep.slotId] ?? [];
    if (hasNote) {
      setSelectedNote({ slotId: chordStep.slotId, midi });
      return;
    }
    if (currentNotes.length >= HARMONY_POOL_MAX_NOTES) return;
    commitSlotNotes(chordStep.slotId, [...currentNotes, midi]);
    setSelectedNote({ slotId: chordStep.slotId, midi });
    onSelectStep(step);
  }, [commitSlotNotes, config.steps, harmony.chordSlots, onCommitSlotMidiPool, onSelectStep, slotNotePools]);
  const deleteSelectedNote = useCallback(() => {
    if (!selectedNote) return;
    const slot = harmony.chordSlots[selectedNote.slotId];
    if (!slot || slot.locked) return;
    const currentNotes = slotNotePools[selectedNote.slotId] ?? [];
    const nextNotes = currentNotes.filter((midi) => midi !== selectedNote.midi);
    if (nextNotes.length === currentNotes.length || nextNotes.length === 0) return;
    commitSlotNotes(selectedNote.slotId, nextNotes);
    setSelectedNote(null);
  }, [commitSlotNotes, harmony.chordSlots, selectedNote, slotNotePools]);
  const moveSelectedNoteOctave = useCallback((octaves: number) => {
    if (!selectedNote) return;
    const slot = harmony.chordSlots[selectedNote.slotId];
    if (!slot || slot.locked) return;
    const currentNotes = slotNotePools[selectedNote.slotId] ?? [];
    const nextMidi = selectedNote.midi + octaves * 12;
    if (nextMidi < 0 || nextMidi > 127) return;
    const nextNotes = currentNotes.map((midi) => midi === selectedNote.midi ? nextMidi : midi);
    commitSlotNotes(selectedNote.slotId, nextNotes);
    setSelectedNote({ slotId: selectedNote.slotId, midi: nextMidi });
  }, [commitSlotNotes, harmony.chordSlots, selectedNote, slotNotePools]);
  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;
    event.preventDefault();
    deleteSelectedNote();
  }, [deleteSelectedNote]);

  return (
    <div
      className="seq-play-chord-editor"
      style={{ '--seq-arp-color': color } as React.CSSProperties}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="seq-play-chord-toolbar">
        <div className="seq-arp-segment" aria-label="Chord style">
          {CHORD_STYLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={config.style === option.value ? 'active' : ''}
              onClick={() => onUpdateConfig({ style: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="seq-arp-field seq-arp-length-field">
          <span>Len</span>
          <input
            className="seq-arp-length-input"
            type="number"
            min={1}
            max={16}
            value={length}
            onChange={(event) => {
              const nextLength = Number.parseInt(event.target.value, 10);
              if (Number.isFinite(nextLength)) onUpdateConfig({ length: nextLength });
            }}
          />
        </label>
        <label className="seq-arp-field">
          <span>Flow</span>
          <select
            className="seq-arp-select"
            value={config.flow}
            onChange={(event) => {
              onUpdateConfig({ flow: event.target.value as ProductChordFlow });
              blurSelectAfterChange(event.currentTarget);
            }}
          >
            {CHORD_FLOW_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="seq-arp-field seq-arp-length-field">
          <span>Gate</span>
          <input
            className="seq-arp-length-input"
            type="number"
            min={5}
            max={100}
            value={Math.round(config.gate * 100)}
            onChange={(event) => {
              const nextGate = Number.parseInt(event.target.value, 10);
              if (Number.isFinite(nextGate)) onUpdateConfig({ gate: Math.max(0.05, Math.min(1, nextGate / 100)) });
            }}
          />
        </label>
        <label className="seq-arp-field seq-arp-length-field">
          <span>Voices</span>
          <input
            className="seq-arp-length-input"
            type="number"
            min={1}
            max={8}
            value={config.voiceCount}
            onChange={(event) => {
              const nextVoiceCount = Number.parseInt(event.target.value, 10);
              if (Number.isFinite(nextVoiceCount)) onUpdateConfig({ voiceCount: nextVoiceCount });
            }}
          />
        </label>
      </div>

      {config.style === 'strum' && (
        <div className="seq-play-chord-toolbar compact">
          <label className="seq-arp-field">
            <span>Dir</span>
            <select
              className="seq-arp-select"
              value={config.strum.direction}
              onChange={(event) => {
                onUpdateConfig({ strum: { ...config.strum, direction: event.target.value as ProductChordPlayConfig['strum']['direction'] } });
                blurSelectAfterChange(event.currentTarget);
              }}
            >
              {['up', 'down', 'upDown', 'downUp', 'random'].map((direction) => <option key={direction} value={direction}>{direction}</option>)}
            </select>
          </label>
          <label className="seq-arp-field seq-arp-length-field">
            <span>Spread</span>
            <input
              className="seq-arp-length-input"
              type="number"
              min={0}
              max={400}
              value={Math.round(config.strum.spreadMs)}
              onChange={(event) => {
                const spreadMs = Number.parseInt(event.target.value, 10);
                if (Number.isFinite(spreadMs)) onUpdateConfig({ strum: { ...config.strum, spreadMs } });
              }}
            />
          </label>
          <label className="seq-arp-field seq-arp-length-field">
            <span>Curve</span>
            <input
              className="seq-arp-length-input"
              type="number"
              min={-100}
              max={100}
              value={Math.round(config.strum.curve * 100)}
              onChange={(event) => {
                const curve = Number.parseInt(event.target.value, 10);
                if (Number.isFinite(curve)) onUpdateConfig({ strum: { ...config.strum, curve: Math.max(-1, Math.min(1, curve / 100)) } });
              }}
            />
          </label>
          <label className="seq-arp-field seq-arp-length-field">
            <span>Fall</span>
            <input
              className="seq-arp-length-input"
              type="number"
              min={0}
              max={60}
              value={Math.round(config.strum.velocityFalloff * 100)}
              onChange={(event) => {
                const velocityFalloff = Number.parseInt(event.target.value, 10);
                if (Number.isFinite(velocityFalloff)) onUpdateConfig({ strum: { ...config.strum, velocityFalloff: Math.max(0, Math.min(0.6, velocityFalloff / 100)) } });
              }}
            />
          </label>
        </div>
      )}

      <div
        className="seq-play-chord-grid"
        style={{ gridTemplateColumns: `42px 66px minmax(76px, 0.45fr) repeat(${pitches.length}, minmax(10px, 1fr))` }}
      >
        <span className="seq-play-chord-head">Step</span>
        <span className="seq-play-chord-head">Slot</span>
        <span className="seq-play-chord-head">Chord</span>
        {pitches.map((midi) => (
          <span key={`h-${midi}`} className="seq-play-chord-pitch-label">{formatMidiNoteName(midi).replace(/\d+$/, '')}</span>
        ))}
        {Array.from({ length: ARP_VISIBLE_STEPS }, (_, step) => {
          const inRange = step < length;
          const chordStep = config.steps[step] ?? { active: false, slotId: step % 8 };
          const detail = resolvedSteps.find((entry) => entry.sourceStep === step);
          const slot = harmony.chordSlots[chordStep.slotId];
          const fallbackNotes = (slotNotePools[chordStep.slotId] ?? []).slice(0, config.voiceCount);
          const displayNotes = detail?.notes.length ? detail.notes : (chordStep.active ? fallbackNotes : []);
          const displayLabel = detail?.label ?? (slot
            ? formatHarmonyIntentChordLabel(slot.intent, { rootMidi: harmony.rootMidi, scaleId: harmony.scaleId })
            : `S${chordStep.slotId + 1}`);
          const locked = detail?.locked ?? slot?.locked === true;
          const active = inRange && chordStep.active;
          const sameSlot = chordStep.slotId === selectedSlotId;
          return (
            <React.Fragment key={step}>
              <button
                type="button"
                className={`seq-play-chord-step${selected === step ? ' selected' : ''}${sameSlot ? ' same-slot' : ''}${inRange ? '' : ' out'}`}
                onClick={() => onSelectStep(step)}
              >
                {String(step + 1).padStart(2, '0')}
              </button>
              <select
                className={`seq-play-chord-slot${selected === step ? ' selected' : ''}${sameSlot ? ' same-slot' : ''}${inRange ? '' : ' out'}`}
                value={chordStep.slotId}
                onChange={(event) => {
                  updateStep(step, { slotId: Number.parseInt(event.target.value, 10) });
                  onSelectStep(step);
                  blurSelectAfterChange(event.currentTarget);
                }}
              >
                {Array.from({ length: 8 }, (_, slot) => <option key={slot} value={slot}>S{slot + 1}</option>)}
              </select>
              <button
                type="button"
                className={`seq-play-chord-label${active ? '' : ' muted'}${locked ? ' locked' : ''}${sameSlot ? ' same-slot' : ''}${inRange ? '' : ' out'}`}
                onClick={() => {
                  updateStep(step, { active: !chordStep.active });
                  onSelectStep(step);
                }}
                title={locked ? 'Locked global harmony slot' : 'Toggle chord step'}
              >
                {displayLabel}
              </button>
              {pitches.map((midi) => {
                const hasNote = chordStep.active && displayNotes.includes(midi);
                const order = hasNote && config.style === 'strum' && detail ? strumOrderIndex(detail, midi) : 0;
                const selectedDot = selectedNote?.slotId === chordStep.slotId && selectedNote.midi === midi;
                return (
                  <button
                    key={`${step}-${midi}`}
                    type="button"
                    className={`seq-play-chord-dot${hasNote ? ' on' : ''}${selectedDot ? ' selected' : ''}${sameSlot ? ' same-slot' : ''}${locked ? ' locked' : ''}${canEditChordNotes && !locked ? ' editable' : ''}${inRange ? '' : ' out'}`}
                    onClick={() => togglePitchForStep(step, midi, Boolean(hasNote))}
                    onDoubleClick={() => {
                      if (!hasNote || locked) return;
                      setSelectedNote({ slotId: chordStep.slotId, midi });
                      const currentNotes = slotNotePools[chordStep.slotId] ?? [];
                      const nextNotes = currentNotes.filter((note) => note !== midi);
                      if (nextNotes.length > 0) commitSlotNotes(chordStep.slotId, nextNotes);
                    }}
                    title={locked
                      ? `${formatMidiNoteName(midi)} locked`
                      : hasNote
                        ? `${formatMidiNoteName(midi)}${order ? ` strum ${order}` : ''}`
                        : `Add ${formatMidiNoteName(midi)}`}
                    aria-label={`Step ${step + 1} ${formatMidiNoteName(midi)}`}
                  >
                    {order ? <span>{order}</span> : null}
                  </button>
                );
              })}
            </React.Fragment>
          );
        })}
      </div>

      <div className="seq-arp-inspector">
        <span className="seq-arp-inspector-item">
          <strong>Step</strong>
          {String(selected + 1).padStart(2, '0')}
        </span>
        <span className="seq-arp-inspector-item">
          <strong>Slot</strong>
          S{selectedSlotId + 1}{selectedSlotLocked ? ' Locked' : ''}
        </span>
        <span className="seq-arp-inspector-item">
          <strong>Chord</strong>
          {selectedDetail?.label ?? (selectedSlot ? formatHarmonyIntentChordLabel(selectedSlot.intent, { rootMidi: harmony.rootMidi, scaleId: harmony.scaleId }) : '--')}
        </span>
        <span className="seq-arp-inspector-item">
          <strong>Notes</strong>
          {slotNotePools[selectedSlotId]?.length ?? 0}
        </span>
        <span className="seq-arp-inspector-item">
          <strong>Used</strong>
          {selectedSlotUses}x
        </span>
        <span className="seq-arp-inspector-item">
          <strong>Range</strong>
          {selected < length ? 'Live' : 'Stored'}
        </span>
        <span className="seq-arp-inspector-item">
          <strong>Edit</strong>
          {selectedNote ? formatMidiNoteName(selectedNote.midi) : selectedSlotLocked ? 'Locked' : canEditChordNotes ? 'Ready' : 'Preview'}
        </span>
        <button
          type="button"
          className="seq-arp-inspector-toggle"
          onClick={() => moveSelectedNoteOctave(-1)}
          disabled={!selectedNote || selectedSlotLocked}
        >
          -8va
        </button>
        <button
          type="button"
          className="seq-arp-inspector-toggle"
          onClick={() => moveSelectedNoteOctave(1)}
          disabled={!selectedNote || selectedSlotLocked}
        >
          +8va
        </button>
        <button
          type="button"
          className="seq-arp-inspector-toggle"
          onClick={deleteSelectedNote}
          disabled={!selectedNote || selectedSlotLocked}
        >
          Del
        </button>
      </div>
    </div>
  );
};

function getSynthKeyboardEditLane(openLane: string): SynthKeyboardEditLane {
  if (openLane === 'pitch' || openLane === 'expression' || openLane === 'morph' || openLane === 'distance' || openLane === 'nudge') return openLane;
  return 'trigger';
}

function formatMidiNoteName(midi: number): string {
  const safeMidi = Math.max(0, Math.round(midi));
  const noteName = CHROMATIC_NOTE_NAMES[((safeMidi % 12) + 12) % 12] ?? 'C';
  const octave = Math.floor(safeMidi / 12) - 1;
  return `${noteName}${octave}`;
}

function getPitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

function rootMidiWithPitchClass(baseMidi: number, rootPitchClass: number): number {
  const base = Math.max(0, Math.min(127, Math.round(baseMidi)));
  const candidate = Math.floor(base / 12) * 12 + getPitchClass(rootPitchClass);
  return Math.max(0, Math.min(127, candidate > 127 ? candidate - 12 : candidate));
}

function resolvePitchSettingsForHarmony(settings: PitchSettings, harmony: HarmonyState | null | undefined) {
  if (settings.scale !== HARMONY_PITCH_SCALE) {
    return {
      root: settings.root,
      scaleIntervals: SCALES[settings.scale] ?? DEFAULT_SCALE_INTERVALS,
      scaleLabel: settings.scale,
    };
  }
  const harmonyRoot = typeof harmony?.effectiveRoot === 'number'
    ? rootMidiWithPitchClass(HARMONY_PITCH_ROOT_OCTAVE_MIDI, harmony.effectiveRoot)
    : HARMONY_PITCH_ROOT_OCTAVE_MIDI;
  return {
    root: harmonyRoot,
    scaleIntervals: harmony?.scaleFamily.intervals ?? DEFAULT_SCALE_INTERVALS,
    scaleLabel: harmony?.scaleFamily.name ?? HARMONY_PITCH_SCALE,
  };
}

function harmonyCapturePitchReference(harmony: HarmonyState | null | undefined): CapturedPitchReference {
  const resolved = resolvePitchSettingsForHarmony(SYNTH_DEFAULT_PITCH_SETTINGS, harmony);
  return {
    root: resolved.root,
    scale: HARMONY_PITCH_SCALE,
    scaleIntervals: resolved.scaleIntervals,
  };
}

function generatedCapturePitchReferenceForSlot(
  mode: SequencerMode,
  slot: SequencerSlotModeState | undefined,
  harmony: HarmonyState | null | undefined,
): CapturedPitchReference | null {
  if (!slot) return null;
  if (mode === 'anchorWalker') {
    return slot.anchorWalker.snapSource === 'harmonyEngine'
      ? harmonyCapturePitchReference(harmony)
      : null;
  }
  if (mode === 'orbit') {
    const usesHarmonyPitch = slot.orbit.quantizeToHarmony || slot.orbit.notes.some((note) => (
      note.enabled && note.pitchMode !== 'fixedMidi'
    ));
    return usesHarmonyPitch ? harmonyCapturePitchReference(harmony) : null;
  }
  return null;
}

function synthSourceSelectValue(source: unknown): string {
  const normalized = normalizeSynthEuclidSource(source);
  if (normalized.startsWith('synth')) return 'pad1';
  return normalized;
}

type PadVoiceAssignment = 'off' | 'pad1' | 'pad2';

function padVoiceAssignment(state: SliderState, voice: number): PadVoiceAssignment {
  const bit = 1 << (voice - 1);
  const enabledMask = (state.synthVoiceMask ?? 63) & PAD_VOICE_MASK_ALL;
  if ((enabledMask & bit) === 0) return 'off';
  return ((state.pad2VoiceAssign ?? 0) & bit) !== 0 ? 'pad2' : 'pad1';
}

function padVoiceButtonStyle(voice: number, assignment: PadVoiceAssignment): React.CSSProperties | undefined {
  if (assignment === 'off') return undefined;
  const hue = assignment === 'pad2' ? 260 + voice * 15 : 210 + voice * 25;
  return {
    background: `linear-gradient(135deg, hsl(${hue}, 60%, 35%), hsl(${hue}, 60%, 25%))`,
    borderColor: `hsl(${hue}, 60%, 50%)`,
  };
}

function padVoiceAssignmentLabel(assignment: PadVoiceAssignment): string {
  if (assignment === 'pad2') return 'Pad 2';
  if (assignment === 'pad1') return 'Pad 1';
  return 'Off';
}

function padVoiceAssignmentSummary(state: SliderState): string {
  const grouped = {
    pad1: PAD_VOICE_NUMBERS.filter((voice) => padVoiceAssignment(state, voice) === 'pad1'),
    pad2: PAD_VOICE_NUMBERS.filter((voice) => padVoiceAssignment(state, voice) === 'pad2'),
    off: PAD_VOICE_NUMBERS.filter((voice) => padVoiceAssignment(state, voice) === 'off'),
  };
  return [
    grouped.pad1.length > 0 ? `P1 ${grouped.pad1.join(' ')}` : '',
    grouped.pad2.length > 0 ? `P2 ${grouped.pad2.join(' ')}` : '',
    grouped.off.length > 0 ? `Off ${grouped.off.join(' ')}` : '',
  ].filter(Boolean).join(' · ');
}

type RuntimeMorphValueKey = 'padMorph' | 'pad2Morph' | 'lead1Morph' | 'lead2Morph';

function runtimeMorphKeyForLaneSource(source: unknown, pad2VoiceAssign: number | undefined): RuntimeMorphValueKey | null {
  const manualSource = manualSynthSourceForLaneSource(source ?? 'lead1', pad2VoiceAssign);
  if (manualSource === 'pad1') return 'padMorph';
  if (manualSource === 'pad2') return 'pad2Morph';
  if (manualSource === 'lead1') return 'lead1Morph';
  if (manualSource === 'lead2') return 'lead2Morph';
  return null;
}

function midiToPitchOffsetForSettings(midi: number, settings: PitchSettings, harmony?: HarmonyState | null): number {
  if (settings.mode === 'noteRange') return 0;
  const resolved = resolvePitchSettingsForHarmony(settings, harmony);
  if (settings.mode === 'notes') return clampMidiNote(midi);
  return semitoneToScaleDegree(midi - resolved.root, resolved.scaleIntervals);
}

function pitchOffsetToMidi(offset: number, settings: PitchSettings, harmony?: HarmonyState | null): number | null {
  if (!Number.isFinite(offset)) return null;
  if (settings.mode === 'noteRange') return null;
  const resolved = resolvePitchSettingsForHarmony(settings, harmony);
  if (settings.mode === 'notes') return clampMidiNote(offset);
  return clampMidiNote(resolved.root + scaleDegreeToSemitone(offset, resolved.scaleIntervals));
}

function arpPitchAnchorMidi(
  enabled: boolean | undefined,
  values: readonly number[] | null | undefined,
  settings: PitchSettings | undefined,
  harmony: HarmonyState | null | undefined,
  noteMin: unknown,
): number | null {
  if (!enabled || !settings) return null;
  const firstValue = values?.find((value) => Number.isFinite(value));
  if (firstValue != null) return pitchOffsetToMidi(firstValue, settings, harmony);
  return settings.mode === 'noteRange' && typeof noteMin === 'number' && Number.isFinite(noteMin)
    ? clampMidiNote(noteMin)
    : null;
}

function convertSynthPitchValuesForMode(
  values: readonly number[],
  currentSettings: PitchSettings,
  nextMode: PitchSettings['mode'],
  harmony?: HarmonyState | null,
): number[] {
  if (currentSettings.mode === nextMode || currentSettings.mode === 'noteRange' || nextMode === 'noteRange') {
    return values.map((value) => Math.round(value));
  }
  const nextSettings = { ...currentSettings, mode: nextMode };
  return values.map((value) => {
    const midi = pitchOffsetToMidi(value, currentSettings, harmony);
    return midi == null ? Math.round(value) : midiToPitchOffsetForSettings(midi, nextSettings, harmony);
  });
}

function fixedKeyboardRecordPitchSettings(settings: PitchSettings, harmony?: HarmonyState | null): PitchSettings {
  const resolved = resolvePitchSettingsForHarmony(settings, harmony);
  return {
    mode: 'semitones',
    root: resolved.root,
    scale: 'Chromatic',
  };
}

function finiteWalkerMidi(value: number, valid = true): number | null {
  if (!valid || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(127, value));
}

function anchorWalkerRuntimeFromVisualState(
  laneIndex: number,
  lanes: Array<ProductSynthAnchorWalkerVisualLaneState | null>,
): AnchorWalkerRuntimeViewState | null {
  const lane = lanes[laneIndex] ?? null;
  if (!lane) return null;
  const cursorMidi = finiteWalkerMidi(lane.cursorMidi, lane.cursorValid);
  const previousCursorMidi = finiteWalkerMidi(lane.previousCursorMidi, lane.cursorValid);
  return {
    anchorMidi: finiteWalkerMidi(lane.anchorMidi, lane.anchorValid),
    cursorMidi,
    previousCursorMidi,
    cursorDegree: Number.isFinite(lane.cursorDegree) ? lane.cursorDegree : 0,
    activeSnapPitchClasses: [],
    layerOutputMidis: lane.outputMidis
      .map((output) => output.midi)
      .filter((midi) => Number.isFinite(midi)),
    lastGestureDelta: Number.isFinite(lane.lastGestureDelta) ? lane.lastGestureDelta : 0,
    direction: cursorMidi !== null && previousCursorMidi !== null
      ? (cursorMidi > previousCursorMidi ? 'up' : cursorMidi < previousCursorMidi ? 'down' : 'none')
      : 'none',
    isGestureHeld: lane.gestureHeld,
    isWalking: lane.walking,
    boundaryEvent: lane.boundaryEvent,
  };
}

const PAD_VARIANT_PROGRESS = [0.2, 0.4, 0.65, 0.85, 1] as const;
const PAD_WALK_BLEND = 0.34;
const PAD_WALK_DISCRETE_THRESHOLD = 0.34;
const PAD_ENDPOINT_EPSILON = 1e-3;

interface PadVariationSession {
  anchor: PadScopeSnapshot | null;
  goal: PadScopeSnapshot | null;
  history: PadScopeSnapshot[];
  appliedSteps: number;
  walkEnabled: boolean;
}

const EMPTY_PAD_VARIATION_SESSION: PadVariationSession = {
  anchor: null,
  goal: null,
  history: [],
  appliedSteps: 0,
  walkEnabled: false,
};

const PAD2_TO_PAD1_KEY = Object.fromEntries(
  Object.entries(PAD1_TO_PAD2_KEY).map(([pad1Key, pad2Key]) => [pad2Key, pad1Key]),
) as Record<string, string>;

const SYNTH_SOURCE_CARD_IDS = ['pad1', 'pad2', 'lead1', 'lead2', 'sample1', 'sample2'] as const;
type SynthSourceCardId = typeof SYNTH_SOURCE_CARD_IDS[number];
type SynthSourceCardExpansion = Partial<Record<SynthSourceCardId, boolean>>;

function createRuntimePadPreset(
  scope: 'pad1' | 'pad2',
  name: string,
  data: Record<string, unknown>,
  tags: string[] = [],
): PadPreset {
  const params: Record<string, number | string | boolean> = {};

  if (scope === 'pad1') {
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
        params[key] = value;
      }
    }
  } else {
    for (const [key, value] of Object.entries(data)) {
      const pad1Key = PAD2_TO_PAD1_KEY[key];
      if (!pad1Key) continue;
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
        params[pad1Key] = value;
      }
    }
  }

  return {
    name,
    tags,
    params,
  };
}

// Inline styles available for future use — currently CSS classes handle layout
// const inlineStyles = { ... };

// ═══════════════ Props ═══════════════

export interface SynthPageProps {
  state: SliderState;
  isMobile: boolean;
  expandedPanels: Set<string>;
  onParamChange: (key: keyof SliderState, value: number) => void;
  onSelectChange: (key: keyof SliderState, value: SliderState[keyof SliderState]) => void;
  onStateChange?: React.Dispatch<React.SetStateAction<SliderState>>;
  togglePanel: (id: string) => void;
  sliderProps: (paramKey: keyof SliderState) => Record<string, unknown>;
  SliderComponent: React.ComponentType<Record<string, unknown>>;
  SelectComponent: React.ComponentType<Record<string, unknown>>;
  CollapsiblePanelComponent: React.ComponentType<Record<string, unknown>>;
  /** Whether audio engine is running */
  isRunning: boolean;
  /** Live transport timing used by simple phrase visualizers */
  transportDebug?: TransportDebugSnapshot | null;
  /** Enables product runtime visual-only plan snapshots for mounted simple visualizers */
  onSimpleVisualizerRuntimePlanVisibilityChange?: (active: ProductSimpleSequencerVisualPlanActive) => void;
  onRequestPlaybackStart?: (statePatch?: Partial<SliderState>) => void;
  /** Get morphed lead params for ADSR preview */
  getLeadMorphedParams: (lead: 1 | 2) => { attack: number; decay: number; sustain: number; release: number } | null;
  /** Whether live lead morphed params are available from the current audio runtime */
  liveLeadMorphedParamsAvailable?: boolean;
  /** Whether live source filter/LFO telemetry is available from the current audio runtime */
  liveSourceTelemetryAvailable?: boolean;
  getPadFilterFreq: (pad: 'pad1' | 'pad2') => number;
  getPadLfoValue: (pad: 'pad1' | 'pad2') => number;
  setStepPositionCallback: (callback: ((steps: number[], hitCounts: number[], arpSteps?: number[]) => void) | null) => void;
  setOrbitVisualStateCallback: (callback: ((lanes: Array<ProductSynthOrbitVisualLaneState | null>) => void) | null) => void;
  setAnchorWalkerVisualStateCallback: (callback: ((lanes: Array<ProductSynthAnchorWalkerVisualLaneState | null>) => void) | null) => void;
  setEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
  /** Evolve configs change callback */
  onEvolveConfigsChange?: (configs: EvolveConfig[]) => void;
  /** Initial evolve configs to restore across tab switches / preset loads */
  initialEvolveConfigs?: EvolveConfig[];
  /** Preset version counter for triggering UI reset on preset load */
  presetVersion?: number;
  /** Step overrides change callback (sends MIDI-converted pitch for engine) */
  onStepOverridesChange?: (overrides: StepOverrides, subLaneStates?: Record<SubLaneKind, SubLaneState>[]) => void;
  /** Raw step overrides change callback (unconverted pitch offsets for persistence/round-trip) */
  onRawStepOverridesChange?: (overrides: StepOverrides) => void;
  /** Reasserts persistent audio-thread sequencer state before this editor unmounts. */
  onSequencerRuntimeDetach?: () => void;
  /** Initial step overrides to restore across tab switches */
  initialStepOverrides?: StepOverrides;
  /** Initial sub-lane states to restore across tab switches */
  initialSubLaneStates?: Record<SubLaneKind, SubLaneState>[];
  /** Called when sub-lane states change, so parent can persist across tab switches */
  onSubLaneStatesChange?: (states: Record<SubLaneKind, SubLaneState>[]) => void;
  /** Initial view mode to restore */
  initialViewMode?: SequencerViewMode;
  /** Called when view mode changes */
  onViewModeChange?: (mode: SequencerViewMode) => void;
  /** Reset evolve home */
  resetEvolveHome?: (laneIdx: number) => void;
  /** Capture current lane state as evolve home */
  captureEvolveHome?: (laneIdx: number, pitchState?: SubLaneState | null) => void;
  /** Dice: regenerate lane with random values */
  diceLane?: (laneIdx: number, intensity: number) => void;
  /** Evolved step overrides pushed from audio engine (for visual sync) */
  evolvedOverrides?: EvolvedSequencerPatch;
  /** Called when per-lane clock divisions change */
  onClockDivsChange?: (divs: ClockDivision[]) => void;
  initialClockDivs?: ClockDivision[];
  /** Called when per-lane swing amounts change */
  onSwingsChange?: (swings: number[]) => void;
  initialSwings?: number[];
  onLinkedChange?: (linked: boolean[]) => void;
  initialLinked?: boolean[];
  /** Initial pitch settings to restore across tab switches */
  initialPitchSettings?: PitchSettings[];
  /** Called when pitch settings change, so parent can persist across tab switches */
  onPitchSettingsChange?: (settings: PitchSettings[]) => void;
  /** Initial pitch binding modes to restore across tab switches */
  initialPitchBindingModes?: PitchBindingMode[];
  /** Called when pitch binding modes change, so parent can persist them */
  onPitchBindingModesChange?: (modes: PitchBindingMode[]) => void;
  /** Initial synth keyboard popup state to restore across tab switches */
  initialKeyboardUiState?: SynthKeyboardUiState;
  /** Called when synth keyboard popup state changes */
  onKeyboardUiStateChange?: (state: SynthKeyboardUiState) => void;
  /** Initial per-lane Play configs to restore across tab switches / preset loads. Legacy ARP configs are migrated. */
  initialArpConfigs?: ProductPlayConfig[];
  /** Called when Play configs change, so parent can persist and bridge engine lane flags. */
  onArpConfigsChange?: (configs: ProductPlayConfig[]) => void;
  /** Fire a one-shot manual audition note from the synth keyboard */
  onAuditionNote?: (note: ManualSynthNoteOptions) => void | Promise<void>;
  /** Start and stop held live notes from computer-keyboard and pointer input. */
  onLiveNoteStart?: (event: import('../../audio/product/liveNoteEvents').ProductLiveNoteEvent) => Promise<void>;
  onLiveNoteStop?: (event: import('../../audio/product/liveNoteEvents').ProductLiveNoteEvent) => void;
  /** Fire a one-shot manual audition note using a temporary, non-UI preset state */
  onAuditionPresetPreview?: (note: ManualSynthNoteOptions, externalState: SliderState) => void | Promise<void>;
  sendProductAnchorWalkerPerformanceEvent?: ProductRuntimeSynthPageEvents['sendProductAnchorWalkerPerformanceEvent'];
  setProductGeneratedSequencerCaptureEnabled?: ProductRuntimeSynthPageEvents['setProductGeneratedSequencerCaptureEnabled'];
  commitProductGeneratedSequencerCaptureToStep?: ProductRuntimeSynthPageEvents['commitProductGeneratedSequencerCaptureToStep'];
  getProductGeneratedSequencerCaptureTelemetry?: ProductRuntimeSynthPageEvents['getProductGeneratedSequencerCaptureTelemetry'];
  /** Current harmony snapshot for keyboard note coloring */
  harmonyState?: HarmonyState | null;
}

// ═══════════════ Component ═══════════════

const SynthPage: React.FC<SynthPageProps> = (props) => {
  const {
    state,
    isMobile,
    // expandedPanels, togglePanel — available via props if needed
    onParamChange,
    onSelectChange,
    sliderProps,
    SliderComponent,
    SelectComponent,
    // CollapsiblePanelComponent — available via props if needed
    isRunning,
    transportDebug,
    onSimpleVisualizerRuntimePlanVisibilityChange,
    onRequestPlaybackStart,
    getLeadMorphedParams,
    liveLeadMorphedParamsAvailable = true,
    liveSourceTelemetryAvailable = true,
    getPadFilterFreq,
    getPadLfoValue,
    setStepPositionCallback,
    setOrbitVisualStateCallback,
    setAnchorWalkerVisualStateCallback,
    setEvolveTriggerCallback,
    onEvolveConfigsChange,
    onStepOverridesChange,
    onRawStepOverridesChange,
    onSequencerRuntimeDetach,
    initialStepOverrides,
    initialSubLaneStates,
    onSubLaneStatesChange,
    initialViewMode,
    onViewModeChange,
    resetEvolveHome,
    captureEvolveHome,
    diceLane,
    onClockDivsChange,
    initialClockDivs,
    onSwingsChange,
    initialSwings,
    onLinkedChange,
    initialLinked,
    initialPitchSettings,
    onPitchSettingsChange,
    initialPitchBindingModes,
    onPitchBindingModesChange,
    initialKeyboardUiState,
    onKeyboardUiStateChange,
    initialArpConfigs,
    onArpConfigsChange,
    onAuditionNote,
    onLiveNoteStart,
    onLiveNoteStop,
    onAuditionPresetPreview,
    sendProductAnchorWalkerPerformanceEvent,
    setProductGeneratedSequencerCaptureEnabled,
    commitProductGeneratedSequencerCaptureToStep,
    getProductGeneratedSequencerCaptureTelemetry,
    harmonyState,
  } = props;
  const onStateChange = props.onStateChange;

  const evolvedOverrides = props.evolvedOverrides;
  const initialEvolveConfigs = props.initialEvolveConfigs;
  const presetVersion = props.presetVersion;
  const simpleChordPhraseVizToggle = useVisualFeatureToggle(
    'kessho.visualizers.synthSimple.chordGenerator.v2.enabled',
    false,
  );
  const simpleRandomTimingVizToggle = useVisualFeatureToggle(
    'kessho.visualizers.synthSimple.randomTiming.v2.enabled',
    false,
  );

  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [diceIntensity, setDiceIntensity] = useState(0.5);
  const pendingDiceSyncUntilRef = useRef<number[]>(Array.from({ length: LANE_CONFIGS.length }, () => 0));
  const pendingDiceExpectedSignatureRef = useRef<(string | null)[]>(Array.from({ length: LANE_CONFIGS.length }, () => null));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [chordSequencerSelected, setChordSequencerSelected] = useState(false);
  const [chordSequencerSelectedTriggerStep, setChordSequencerSelectedTriggerStep] = useState(0);
  const [chordSequencerOpenLane, setChordSequencerOpenLane] = useState<SynthChordSequencerSubLaneName | 'trigger'>('chord');
  const [triggerStamp, setTriggerStamp] = useState<TriggerStamp | null>(null);
  const [triggerStampMode, setTriggerStampMode] = useState(false);
  const [triggerStampPickSource, setTriggerStampPickSource] = useState(false);
  const [linkedTriggerStampReady, setLinkedTriggerStampReady] = useState(false);
  const [linkedTriggerStampMode, setLinkedTriggerStampMode] = useState(false);
  const [linkedTriggerStampPickSource, setLinkedTriggerStampPickSource] = useState(false);
  const [linkedTriggerStampSummary, setLinkedTriggerStampSummary] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(initialKeyboardUiState?.open ?? false);
  const [keyboardInputMode, setKeyboardInputMode] = useState<KeyboardInputMode>(initialKeyboardUiState?.inputMode ?? 'play');
  const [keyboardSource, setKeyboardSource] = useState<ManualSynthSource>(initialKeyboardUiState?.source ?? 'lead1');
  const [keyboardOctave, setKeyboardOctave] = useState(initialKeyboardUiState?.octave ?? 4);
  const [pitchBindingModes, setPitchBindingModes] = useState<PitchBindingMode[]>(() =>
    normalizeSequencerPitchBindingModes(initialPitchBindingModes, SYNTH_EUCLIDEAN_LANE_COUNT)
  );
  const [triggerKeyboardSteps, setTriggerKeyboardSteps] = useState<number[]>(() =>
    normalizeKeyboardStepArray(initialKeyboardUiState?.triggerSteps ?? initialKeyboardUiState?.sequenceSteps)
  );
  const [pitchKeyboardSteps, setPitchKeyboardSteps] = useState<number[]>(() =>
    normalizeKeyboardStepArray(initialKeyboardUiState?.pitchSteps)
  );
  const [expressionKeyboardSteps, setExpressionKeyboardSteps] = useState<number[]>(() =>
    normalizeKeyboardStepArray()
  );
  const [morphKeyboardSteps, setMorphKeyboardSteps] = useState<number[]>(() =>
    normalizeKeyboardStepArray()
  );
  const [distanceKeyboardSteps, setDistanceKeyboardSteps] = useState<number[]>(() =>
    normalizeKeyboardStepArray()
  );
  const [nudgeKeyboardSteps, setNudgeKeyboardSteps] = useState<number[]>(() =>
    normalizeKeyboardStepArray()
  );
  const [keyboardSequenceCursorTarget, setKeyboardSequenceCursorTarget] = useState<KeyboardSequenceCursorTarget>(
    initialKeyboardUiState?.sequenceCursorTarget ?? 'pitch'
  );
  const [padTier, setPadTier] = useState<0 | 1 | 2>(0); // 0=closed, 1=primary, 2=advanced
  const [pad2Tier, setPad2Tier] = useState<0 | 1 | 2>(0); // Pad 2: 0=closed by default
  const [dragPopup, setDragPopup] = useState<{ x: number; y: number; text: string } | null>(null);
  const [lead4opPresets, setLead4opPresets] = useState<Array<{ id: string; name: string }>>(() => STOCK_LEAD4OP_PRESETS);
  const [leadPresetPreviewCache, setLeadPresetPreviewCache] = useState<Record<string, Lead4opFMPreset>>({});
  const [leadEditorSlot, setLeadEditorSlot] = useState<LeadEditorSession | null>(null);
  const [leadEditorRuntimeOptions, setLeadEditorRuntimeOptions] = useState<LeadPresetOption[]>([]);
  const [lead1LoaderPresetId, setLead1LoaderPresetId] = useState(() => String(state.lead1PresetA ?? ''));
  const [lead2LoaderPresetId, setLead2LoaderPresetId] = useState(() => String(state.lead2PresetC ?? ''));
  const [leadLocalRatings, setLeadLocalRatings] = useState<Record<string, number>>({});
  const [padPoolPopupSlot, setPadPoolPopupSlot] = useState<{
    scope: 'pad1' | 'pad2';
    slotKey: keyof SliderState;
  } | null>(null);
  const [leadPoolPopupSlot, setLeadPoolPopupSlot] = useState<LeadPresetSlotKey | null>(null);
  const [livePadViz, setLivePadViz] = useState({
    pad1FilterFreq: 1000,
    pad1LfoValue: 0,
    pad2FilterFreq: 1000,
    pad2LfoValue: 0,
  });
  const [playheads, setPlayheads] = useState<number[]>([0, 0, 0, 0]);
  const [hitCounts, setHitCounts] = useState<number[]>([0, 0, 0, 0]);
  const [chordSequencerPlayhead, setChordSequencerPlayhead] = useState(0);
  const [chordSequencerAbsoluteStep, setChordSequencerAbsoluteStep] = useState(0);
  const chordSequencerClockAnchorRef = useRef<number | null>(null);
  const chordSequencerWasRunningRef = useRef(false);
  const [orbitVisualStates, setOrbitVisualStates] = useState<Array<ProductSynthOrbitVisualLaneState | null>>([null, null, null, null]);
  const [walkerVisualStates, setWalkerVisualStates] = useState<Array<ProductSynthAnchorWalkerVisualLaneState | null>>([null, null, null, null]);
  const [evolveFlashing, setEvolveFlashing] = useState<boolean[]>([false, false, false, false]);
  const {
    presets: pad1EnginePresets,
    save: savePad1Preset,
    load: loadPad1Preset,
    remove: removePad1Preset,
    refresh: refreshPad1Presets,
    updateMetadata: updatePad1PresetMetadata,
  } = usePresets('engine', 'pad1');
  const {
    presets: pad2EnginePresets,
    save: savePad2Preset,
    load: loadPad2Preset,
    remove: removePad2Preset,
    refresh: refreshPad2Presets,
    updateMetadata: updatePad2PresetMetadata,
  } = usePresets('engine', 'pad2');
  const {
    presets: leadFmPresets,
    load: loadLeadFmPresetEntry,
    remove: removeLeadFmPreset,
    refresh: refreshLeadFmPresets,
    updateMetadata: updateLeadFmPresetMetadata,
  } = usePresets('engine', 'lead4opfm');
  const leadStockIdByName = useMemo(
    () => new Map(
      lead4opPresets.map((preset) => [preset.name.trim().toLowerCase(), preset.id]),
    ),
    [lead4opPresets],
  );
  const resolveLeadPresetRuntimeId = useCallback((name: string) => {
    return leadStockIdByName.get(name.trim().toLowerCase()) ?? name;
  }, [leadStockIdByName]);
  const createRuntimeLeadPreset = useCallback((runtimeId: string, name: string, data: Record<string, unknown>): Lead4opFMPreset | null => {
    const candidate = typeof data.preset === 'object' && data.preset !== null
      ? data.preset as Record<string, unknown>
      : data;
    if (
      typeof candidate.id !== 'string'
      || typeof candidate.name !== 'string'
      || typeof candidate.algorithm !== 'string'
      || typeof candidate.xy !== 'object'
      || candidate.xy === null
      || typeof candidate.params !== 'object'
      || candidate.params === null
    ) {
      return null;
    }

    return {
      ...(candidate as unknown as Lead4opFMPreset),
      id: runtimeId,
      name,
    };
  }, []);
  const toggleEdit = (section: string) => setEditingSection(prev => prev === section ? null : section);

  const Slider = SliderComponent as React.ComponentType<any>;
  const Select = SelectComponent as React.ComponentType<any>;
  const sampleLibraryOptions = useMemo(() => SAMPLE_LIBRARY_REGISTRY_GENERATED.map((library) => ({
    value: library.libraryKey,
    label: library.displayName,
  })), []);
  const sampleLibraryByKey = useMemo(() => new Map(
    SAMPLE_LIBRARY_REGISTRY_GENERATED.map((library) => [library.libraryKey, library]),
  ), []);
  const sampleSelectionModeOptions = useMemo(() => SAMPLE_SELECTION_MODES.map((mode) => ({
    value: mode,
    label: sampleOptionLabel(mode),
  })), []);
  const sampleDynamicModeOptions = useMemo(() => SAMPLE_DYNAMIC_MODES.map((mode) => ({
    value: mode,
    label: sampleOptionLabel(mode),
  })), []);
  const sampleDynamicOptions = useMemo(() => SAMPLE_DYNAMIC_KEYS.map((dynamic) => ({
    value: dynamic,
    label: sampleOptionLabel(dynamic),
  })), []);
  const sampleVariantOptions = useMemo(() => SAMPLE_VARIANT_MODES.map((mode) => ({
    value: mode,
    label: sampleOptionLabel(mode),
  })), []);
  const handleSampleLibraryChange = useCallback((slotId: SampleSlotId, value: string) => {
    if (!isSampleLibraryKey(value)) return;
    const config = SAMPLE_SLOT_UI[slotId];
    if (onStateChange) {
      onStateChange((current) => applySampleLibrarySelectionDefaultsToFlatState(
        { ...current },
        slotId,
        value,
      ) as unknown as SliderState);
      return;
    }
    onSelectChange(config.libraryKey, value as SampleLibraryKey as SliderState[keyof SliderState]);
  }, [onSelectChange, onStateChange]);
  const { announceHelp } = useSliderHelp();
  const bindHelp = useCallback((helpKey: string, options: { label?: string } = {}) => ({
    onMouseEnter: () => announceHelp(helpKey, options),
    onPointerDown: () => announceHelp(helpKey, options),
    onFocus: () => announceHelp(helpKey, options),
  }), [announceHelp]);
  const [manualExpandedCards, setManualExpandedCards] = useState<SynthSourceCardExpansion>({});
  const defaultExpandedCards = useMemo<Record<SynthSourceCardId, boolean>>(() => ({
    pad1: Boolean(state.padEnabled),
    pad2: Boolean(state.pad2Enabled),
    lead1: Boolean(state.leadEnabled),
    lead2: Boolean(state.lead2Enabled),
    sample1: Boolean(state.sample1Enabled),
    sample2: Boolean(state.sample2Enabled),
  }), [
    state.lead2Enabled,
    state.leadEnabled,
    state.pad2Enabled,
    state.padEnabled,
    state.sample1Enabled,
    state.sample2Enabled,
  ]);
  const previousDefaultExpandedCards = useRef(defaultExpandedCards);

  useEffect(() => {
    const changedCardIds = SYNTH_SOURCE_CARD_IDS.filter(
      (cardId) => previousDefaultExpandedCards.current[cardId] !== defaultExpandedCards[cardId],
    );
    previousDefaultExpandedCards.current = defaultExpandedCards;
    if (changedCardIds.length === 0) return;

    setManualExpandedCards((previous) => {
      if (!changedCardIds.some((cardId) => Object.prototype.hasOwnProperty.call(previous, cardId))) {
        return previous;
      }

      const next = { ...previous };
      changedCardIds.forEach((cardId) => {
        delete next[cardId];
      });
      return next;
    });
  }, [defaultExpandedCards]);

  const isSynthSourceCardExpanded = useCallback((cardId: SynthSourceCardId) => (
    manualExpandedCards[cardId] ?? defaultExpandedCards[cardId]
  ), [defaultExpandedCards, manualExpandedCards]);

  const toggleSynthSourceCard = useCallback((cardId: SynthSourceCardId) => {
    setManualExpandedCards((previous) => ({
      ...previous,
      [cardId]: !(previous[cardId] ?? defaultExpandedCards[cardId]),
    }));
  }, [defaultExpandedCards]);

  const handleSynthSourceHeaderKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>, cardId: SynthSourceCardId) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target as HTMLElement;
    if (target !== event.currentTarget && target.closest('button, select, input, textarea, a')) return;

    event.preventDefault();
    toggleSynthSourceCard(cardId);
  }, [toggleSynthSourceCard]);
  const livePadFilterVizMounted = isSynthSourceCardExpanded('pad1') || isSynthSourceCardExpanded('pad2');

  const keyboardKeysRef = useRef<SynthKeyboardKeysHandle>(null);
  const leftShiftHeldRef = useRef(false);
  const zHeldRef = useRef(false);
  const liveNoteInput = useLiveNoteInput({
    start: (event) => {
      if (onLiveNoteStart) return onLiveNoteStart(event);
      if (!isProductManualSynthSource(event.instrument)) return;
      return onAuditionNote?.({
        source: event.instrument,
        midi: event.note,
        velocity: event.velocity,
        durationMs: 180,
      });
    },
    stop: (event) => onLiveNoteStop?.(event),
  });
  const previousLiveNoteBridgeRef = useRef({ onLiveNoteStart, onLiveNoteStop });
  useEffect(() => {
    const previous = previousLiveNoteBridgeRef.current;
    if (previous.onLiveNoteStart !== onLiveNoteStart || previous.onLiveNoteStop !== onLiveNoteStop) {
      keyboardKeysRef.current?.releaseAll();
      liveNoteInput.releaseAll();
      previousLiveNoteBridgeRef.current = { onLiveNoteStart, onLiveNoteStop };
    }
  }, [liveNoteInput, onLiveNoteStart, onLiveNoteStop]);
  const synthLiveOverdubCaptureRef = useRef<SynthLiveOverdubCaptureSession | null>(null);
  const [synthRecorderMetronomeEnabled, setSynthRecorderMetronomeEnabled] = useState(true);
  const [generatedCaptureStartArm, setGeneratedCaptureStartArm] = useState<GeneratedCaptureStartArm | null>(null);
  const generatedCaptureStartArmRef = useRef<GeneratedCaptureStartArm | null>(null);
  useEffect(() => {
    generatedCaptureStartArmRef.current = generatedCaptureStartArm;
  }, [generatedCaptureStartArm]);
  const [pad1Variation, setPad1Variation] = useState<PadVariationSession>(EMPTY_PAD_VARIATION_SESSION);
  const [pad2Variation, setPad2Variation] = useState<PadVariationSession>(EMPTY_PAD_VARIATION_SESSION);

  useEffect(() => {
    getLead4opFMPresetList().then(setLead4opPresets).catch(() => {
      setLead4opPresets(STOCK_LEAD4OP_PRESETS);
    });
  }, []);

  useEffect(() => {
    setLead1LoaderPresetId(String(state.lead1PresetA ?? ''));
  }, [state.lead1PresetA]);

  useEffect(() => {
    setLead2LoaderPresetId(String(state.lead2PresetC ?? ''));
  }, [state.lead2PresetC]);

  useEffect(() => {
    let rafId: number | null = null;
    let pendingSteps: number[] = [0, 0, 0, 0];
    let pendingHitCounts: number[] = [0, 0, 0, 0];
    let pendingArpSteps: number[] = [0, 0, 0, 0];
    setStepPositionCallback((nextSteps: number[], nextHitCounts: number[], nextArpSteps?: number[]) => {
      if (document.visibilityState !== 'visible') return;
      pendingSteps = [...nextSteps];
      pendingHitCounts = [...nextHitCounts];
      if (Array.isArray(nextArpSteps)) {
        pendingArpSteps = [...nextArpSteps];
      }
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setPlayheads(pendingSteps);
        setHitCounts(pendingHitCounts);
        setArpUiPlayheads(pendingArpSteps);
      });
    });
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      setStepPositionCallback(null);
    };
  }, [setStepPositionCallback]);

  useEffect(() => {
    const flashTimers: Array<number | null> = [null, null, null, null];
    setEvolveTriggerCallback((laneIndex: number) => {
      if (document.visibilityState !== 'visible') return;
      if (laneIndex < 0 || laneIndex > 3) return;
      setEvolveFlashing(prev => prev.map((value, index) => (index === laneIndex ? true : value)));

      const existingTimer = flashTimers[laneIndex];
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      flashTimers[laneIndex] = window.setTimeout(() => {
        setEvolveFlashing(prev => prev.map((value, index) => (index === laneIndex ? false : value)));
        flashTimers[laneIndex] = null;
      }, 180);
    });

    return () => {
      setEvolveTriggerCallback(null);
      flashTimers.forEach((timer) => {
        if (timer) {
          window.clearTimeout(timer);
        }
      });
    };
  }, [setEvolveTriggerCallback]);

  const updateLiveFilterViz = useCallback(() => {
    if (!liveSourceTelemetryAvailable) return;
    const next = {
      pad1FilterFreq: getPadFilterFreq('pad1'),
      pad1LfoValue: getPadLfoValue('pad1'),
      pad2FilterFreq: getPadFilterFreq('pad2'),
      pad2LfoValue: getPadLfoValue('pad2'),
    };
    setLivePadViz((prev) => {
      if (
        Math.abs(prev.pad1FilterFreq - next.pad1FilterFreq) < 0.01 &&
        Math.abs(prev.pad2FilterFreq - next.pad2FilterFreq) < 0.01 &&
        Math.abs(prev.pad1LfoValue - next.pad1LfoValue) < 0.00001 &&
        Math.abs(prev.pad2LfoValue - next.pad2LfoValue) < 0.00001
      ) {
        return prev;
      }
      return next;
    });
  }, [getPadFilterFreq, getPadLfoValue, liveSourceTelemetryAvailable]);

  const livePad1Morph = useRuntimeValue('padMorph');
  const livePad2Morph = useRuntimeValue('pad2Morph');
  const liveLead1Morph = useRuntimeValue('lead1Morph');
  const liveLead2Morph = useRuntimeValue('lead2Morph');
  const livePad1Distance = useRuntimeValue('padDistance', state.padDistance ?? 0) ?? (state.padDistance ?? 0);
  const livePad2Distance = useRuntimeValue('pad2Distance', state.pad2Distance ?? 0) ?? (state.pad2Distance ?? 0);
  const liveLead1Distance = useRuntimeValue('lead1Distance', state.lead1Distance ?? 0) ?? (state.lead1Distance ?? 0);
  const liveLead2Distance = useRuntimeValue('lead2Distance', state.lead2Distance ?? 0) ?? (state.lead2Distance ?? 0);
  const pad1FilterMinRuntime = sliderProps('filterCutoffMin') as RuntimeSliderProps;
  const pad1FilterMaxRuntime = sliderProps('filterCutoffMax') as RuntimeSliderProps;
  const pad1PostLpfRuntime = sliderProps('padPostLPF') as RuntimeSliderProps;
  const pad2FilterMinRuntime = sliderProps('pad2FilterCutoffMin') as RuntimeSliderProps;
  const pad2FilterMaxRuntime = sliderProps('pad2FilterCutoffMax') as RuntimeSliderProps;
  const pad2PostLpfRuntime = sliderProps('pad2PostLPF') as RuntimeSliderProps;
  const chordRateRuntime = sliderProps('chordRate') as RuntimeSliderProps;
  const voicingSpreadRuntime = sliderProps('voicingSpread') as RuntimeSliderProps;
  const waveSpreadRuntime = sliderProps('waveSpread') as RuntimeSliderProps;
  const detuneRuntime = sliderProps('detune') as RuntimeSliderProps;
  const synthOctaveRuntime = sliderProps('synthOctave') as RuntimeSliderProps;
  const lead1DensityRuntime = sliderProps('lead1Density') as RuntimeSliderProps;
  const lead1OctaveRuntime = sliderProps('lead1Octave') as RuntimeSliderProps;
  const lead1OctaveRangeRuntime = sliderProps('lead1OctaveRange') as RuntimeSliderProps;
  const livePad1FilterMinPosition = useRuntimeSliderPosition('filterCutoffMin', pad1FilterMinRuntime.mode ?? 'single', pad1FilterMinRuntime.walkPosition);
  const livePad1FilterMaxPosition = useRuntimeSliderPosition('filterCutoffMax', pad1FilterMaxRuntime.mode ?? 'single', pad1FilterMaxRuntime.walkPosition);
  const livePad1PostLpfPosition = useRuntimeSliderPosition('padPostLPF', pad1PostLpfRuntime.mode ?? 'single', pad1PostLpfRuntime.walkPosition);
  const livePad2FilterMinPosition = useRuntimeSliderPosition('pad2FilterCutoffMin', pad2FilterMinRuntime.mode ?? 'single', pad2FilterMinRuntime.walkPosition);
  const livePad2FilterMaxPosition = useRuntimeSliderPosition('pad2FilterCutoffMax', pad2FilterMaxRuntime.mode ?? 'single', pad2FilterMaxRuntime.walkPosition);
  const livePad2PostLpfPosition = useRuntimeSliderPosition('pad2PostLPF', pad2PostLpfRuntime.mode ?? 'single', pad2PostLpfRuntime.walkPosition);
  const liveChordRatePosition = useRuntimeSliderPosition('chordRate', chordRateRuntime.mode ?? 'single', chordRateRuntime.walkPosition);
  const liveVoicingSpreadPosition = useRuntimeSliderPosition('voicingSpread', voicingSpreadRuntime.mode ?? 'single', voicingSpreadRuntime.walkPosition);
  const liveWaveSpreadPosition = useRuntimeSliderPosition('waveSpread', waveSpreadRuntime.mode ?? 'single', waveSpreadRuntime.walkPosition);
  const liveDetunePosition = useRuntimeSliderPosition('detune', detuneRuntime.mode ?? 'single', detuneRuntime.walkPosition);
  const liveSynthOctavePosition = useRuntimeSliderPosition('synthOctave', synthOctaveRuntime.mode ?? 'single', synthOctaveRuntime.walkPosition);
  const liveLead1DensityPosition = useRuntimeSliderPosition('lead1Density', lead1DensityRuntime.mode ?? 'single', lead1DensityRuntime.walkPosition);
  const liveLead1OctavePosition = useRuntimeSliderPosition('lead1Octave', lead1OctaveRuntime.mode ?? 'single', lead1OctaveRuntime.walkPosition);
  const liveLead1OctaveRangePosition = useRuntimeSliderPosition('lead1OctaveRange', lead1OctaveRangeRuntime.mode ?? 'single', lead1OctaveRangeRuntime.walkPosition);
  const livePad1FilterMinBase = resolveRuntimeSliderValue(state.filterCutoffMin ?? 400, pad1FilterMinRuntime, livePad1FilterMinPosition);
  const livePad1FilterMaxBase = resolveRuntimeSliderValue(state.filterCutoffMax ?? 3000, pad1FilterMaxRuntime, livePad1FilterMaxPosition);
  const livePad1PostLpfBase = resolveRuntimeSliderValue(state.padPostLPF ?? 18000, pad1PostLpfRuntime, livePad1PostLpfPosition);
  const livePad2FilterMinBase = resolveRuntimeSliderValue(state.pad2FilterCutoffMin ?? 400, pad2FilterMinRuntime, livePad2FilterMinPosition);
  const livePad2FilterMaxBase = resolveRuntimeSliderValue(state.pad2FilterCutoffMax ?? 3000, pad2FilterMaxRuntime, livePad2FilterMaxPosition);
  const livePad2PostLpfBase = resolveRuntimeSliderValue(state.pad2PostLPF ?? 18000, pad2PostLpfRuntime, livePad2PostLpfPosition);
  const liveSimpleSequencerState = useMemo(() => ({
    ...state,
    chordRate: resolveRuntimeSliderValue(state.chordRate, chordRateRuntime, liveChordRatePosition),
    voicingSpread: resolveRuntimeSliderValue(state.voicingSpread, voicingSpreadRuntime, liveVoicingSpreadPosition),
    waveSpread: resolveRuntimeSliderValue(state.waveSpread, waveSpreadRuntime, liveWaveSpreadPosition),
    detune: resolveRuntimeSliderValue(state.detune, detuneRuntime, liveDetunePosition),
    synthOctave: resolveRuntimeSliderValue(state.synthOctave, synthOctaveRuntime, liveSynthOctavePosition),
    lead1Density: resolveRuntimeSliderValue(state.lead1Density, lead1DensityRuntime, liveLead1DensityPosition),
    lead1Octave: resolveRuntimeSliderValue(state.lead1Octave, lead1OctaveRuntime, liveLead1OctavePosition),
    lead1OctaveRange: resolveRuntimeSliderValue(state.lead1OctaveRange, lead1OctaveRangeRuntime, liveLead1OctaveRangePosition),
  }), [
    chordRateRuntime,
    detuneRuntime,
    lead1DensityRuntime,
    lead1OctaveRangeRuntime,
    lead1OctaveRuntime,
    liveChordRatePosition,
    liveDetunePosition,
    liveLead1DensityPosition,
    liveLead1OctavePosition,
    liveLead1OctaveRangePosition,
    liveSynthOctavePosition,
    liveVoicingSpreadPosition,
    liveWaveSpreadPosition,
    state,
    synthOctaveRuntime,
    voicingSpreadRuntime,
    waveSpreadRuntime,
  ]);
  const livePad1DistanceState = useMemo(() => applyPadDistanceToState({
    ...state,
    filterCutoffMin: livePad1FilterMinBase,
    filterCutoffMax: livePad1FilterMaxBase,
    padPostLPF: livePad1PostLpfBase,
  }, 'pad1', livePad1Distance), [
    livePad1Distance,
    livePad1FilterMaxBase,
    livePad1FilterMinBase,
    livePad1PostLpfBase,
    state,
  ]);
  const livePad2DistanceState = useMemo(() => applyPadDistanceToState({
    ...state,
    pad2FilterCutoffMin: livePad2FilterMinBase,
    pad2FilterCutoffMax: livePad2FilterMaxBase,
    pad2PostLPF: livePad2PostLpfBase,
  }, 'pad2', livePad2Distance), [
    livePad2Distance,
    livePad2FilterMaxBase,
    livePad2FilterMinBase,
    livePad2PostLpfBase,
    state,
  ]);
  const livePad1FilterMin = Math.min(livePad1DistanceState.filterCutoffMin, livePad1DistanceState.filterCutoffMax);
  const livePad1FilterMax = Math.max(livePad1DistanceState.filterCutoffMin, livePad1DistanceState.filterCutoffMax);
  const livePad2FilterMin = Math.min(livePad2DistanceState.pad2FilterCutoffMin ?? 400, livePad2DistanceState.pad2FilterCutoffMax ?? 3000);
  const livePad2FilterMax = Math.max(livePad2DistanceState.pad2FilterCutoffMin ?? 400, livePad2DistanceState.pad2FilterCutoffMax ?? 3000);
  const livePad1PostLpf = livePad1DistanceState.padPostLPF ?? livePad1PostLpfBase;
  const livePad2PostLpf = livePad2DistanceState.pad2PostLPF ?? livePad2PostLpfBase;
  const padEnvelopeTimelineSeconds = getPadEnvelopeTimelineSeconds(state);
  const liveSynthNoteMin1 = useRuntimeValue('synthEuclid1NoteMin', state.synthEuclid1NoteMin ?? 48) ?? (state.synthEuclid1NoteMin ?? 48);
  const liveSynthNoteMax1 = useRuntimeValue('synthEuclid1NoteMax', state.synthEuclid1NoteMax ?? 72) ?? (state.synthEuclid1NoteMax ?? 72);
  const liveSynthNoteMin2 = useRuntimeValue('synthEuclid2NoteMin', state.synthEuclid2NoteMin ?? 48) ?? (state.synthEuclid2NoteMin ?? 48);
  const liveSynthNoteMax2 = useRuntimeValue('synthEuclid2NoteMax', state.synthEuclid2NoteMax ?? 72) ?? (state.synthEuclid2NoteMax ?? 72);
  const liveSynthNoteMin3 = useRuntimeValue('synthEuclid3NoteMin', state.synthEuclid3NoteMin ?? 48) ?? (state.synthEuclid3NoteMin ?? 48);
  const liveSynthNoteMax3 = useRuntimeValue('synthEuclid3NoteMax', state.synthEuclid3NoteMax ?? 72) ?? (state.synthEuclid3NoteMax ?? 72);
  const liveSynthNoteMin4 = useRuntimeValue('synthEuclid4NoteMin', state.synthEuclid4NoteMin ?? 48) ?? (state.synthEuclid4NoteMin ?? 48);
  const liveSynthNoteMax4 = useRuntimeValue('synthEuclid4NoteMax', state.synthEuclid4NoteMax ?? 72) ?? (state.synthEuclid4NoteMax ?? 72);
  const pad1MorphValue = livePad1Morph ?? (state.padMorph ?? 0);
  const pad2MorphValue = livePad2Morph ?? (state.pad2Morph ?? 0);
  const pad1MorphSequencerLocked = livePad1Morph !== undefined;
  const pad2MorphSequencerLocked = livePad2Morph !== undefined;
  const lead1MorphValue = liveLead1Morph ?? (state.lead1Morph ?? 0);
  const lead2MorphValue = liveLead2Morph ?? (state.lead2Morph ?? 0);
  const lead1MorphSequencerLocked = liveLead1Morph !== undefined;
  const lead2MorphSequencerLocked = liveLead2Morph !== undefined;
  const pad1DistancePreview = useMemo(() => getPadDistancePreview(state, 'pad1', livePad1Distance), [livePad1Distance, state]);
  const pad2DistancePreview = useMemo(() => getPadDistancePreview(state, 'pad2', livePad2Distance), [livePad2Distance, state]);
  const lead1DistancePreview = useMemo(() => getLeadDistancePreview(state, 'lead1', liveLead1Distance), [liveLead1Distance, state]);
  const lead2DistancePreview = useMemo(() => getLeadDistancePreview(state, 'lead2', liveLead2Distance), [liveLead2Distance, state]);
  const liveSynthNoteMins = [liveSynthNoteMin1, liveSynthNoteMin2, liveSynthNoteMin3, liveSynthNoteMin4];
  const liveSynthNoteMaxs = [liveSynthNoteMax1, liveSynthNoteMax2, liveSynthNoteMax3, liveSynthNoteMax4];

  const getPreviewValue = useCallback((
    preview: Partial<Record<keyof SliderState, number>>,
    key: keyof SliderState,
  ): number | undefined => {
    const value = preview[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }, []);

  const getDistanceGhostValue = useCallback((key: keyof SliderState, liveValue: number): number | undefined => {
    const sliderState = sliderProps(key) as { mode?: string };
    if ((sliderState.mode ?? 'single') !== 'single') return undefined;
    const baseValue = state[key];
    if (typeof baseValue !== 'number' || !Number.isFinite(baseValue) || !Number.isFinite(liveValue)) {
      return undefined;
    }
    return Math.abs(baseValue - liveValue) > 1e-6 ? liveValue : undefined;
  }, [sliderProps, state]);

  const handlePresetMorphSliderChange = useCallback((key: keyof SliderState, value: number) => {
    removeRuntimeValues([String(key)]);
    onParamChange(key, value);
  }, [onParamChange]);

  const handlePresetEndpointSelectChange = useCallback((
    key: keyof SliderState,
    value: SliderState[keyof SliderState],
  ) => {
    onSelectChange(key, value);
  }, [onSelectChange]);

  const chordSequencerConfig = useMemo(
    () => sanitizeSynthChordSequencerConfig(state.synthChordSequencer),
    [state.synthChordSequencer],
  );

  const updateChordSequencerConfig = useCallback((
    updater: (current: SynthChordSequencerConfig) => SynthChordSequencerConfig,
  ) => {
    const next = sanitizeSynthChordSequencerConfig(updater(chordSequencerConfig));
    onSelectChange('synthChordSequencer' as keyof SliderState, next as SliderState[keyof SliderState]);
  }, [chordSequencerConfig, onSelectChange]);

  const updateChordSequencerStep = useCallback((
    stepIndex: number,
    patch: Partial<SynthChordSequencerConfig['steps'][number]>,
  ) => {
    updateChordSequencerConfig((current) => ({
      ...current,
      steps: current.steps.map((step, index) => index === stepIndex ? { ...step, ...patch } : step),
    }));
  }, [updateChordSequencerConfig]);

  const updateChordSequencerSubLane = useCallback((
    laneName: SynthChordSequencerSubLaneName,
    updater: (current: SynthChordSequencerSubLaneConfig) => SynthChordSequencerSubLaneConfig,
  ) => {
    updateChordSequencerConfig((current) => ({
      ...current,
      subLanes: {
        ...current.subLanes,
        [laneName]: updater(current.subLanes[laneName]),
      },
    }));
  }, [updateChordSequencerConfig]);

  const updateChordSequencerSubLaneValue = useCallback((
    laneName: SynthChordSequencerSubLaneName,
    stepIndex: number,
    value: number,
  ) => {
    updateChordSequencerSubLane(laneName, (lane) => ({
      ...lane,
      values: lane.values.map((currentValue, index) => index === stepIndex ? value : currentValue),
    }));
  }, [updateChordSequencerSubLane]);

  const chordSequencerEnabled = state.synthChordSequencerEnabled === true;
  const chordSequencerSourceValue = String(state.synthChordSequencerSource ?? 'sample1');
  const chordSequencerSourceInfo =
    CHORD_SEQUENCER_SOURCES.find((source) => source.value === chordSequencerSourceValue) ?? {
      value: 'sample1',
      label: 'Sample 1',
      color: SOURCE_COLORS.sample1,
    };
  const chordGeneratorSourceValue = String(state.synthChordGeneratorSource ?? 'sample1');
  const chordGeneratorSourceInfo =
    CHORD_GENERATOR_SOURCES.find((source) => source.value === chordGeneratorSourceValue) ?? {
      value: 'sample1',
      label: 'Sample 1',
      color: SOURCE_COLORS.sample1,
    };
  const randomTimingSourceValue = String(state.leadRandomSource ?? 'lead1');
  const randomTimingSourceInfo =
    RANDOM_TIMING_SOURCES.find((source) => source.value === randomTimingSourceValue) ?? {
      value: 'lead1',
      label: 'Lead 1',
      color: SOURCE_COLORS.lead1,
    };
  const chordSequencerActiveStepCount = chordSequencerConfig.steps
    .slice(0, chordSequencerConfig.stepCount)
    .filter((step) => step.enabled).length;
  const chordSequencerClockDivision = state.synthChordSequencerClockDivision ?? '1/4';

  const chordSequencerLaneModel = useMemo<SequencerState>(() => {
    const makeSubLane = (laneName: SynthChordSequencerSubLaneName) => ({
      enabled: chordSequencerConfig.subLanes[laneName].enabled,
      steps: chordSequencerConfig.subLanes[laneName].steps,
      direction: chordSequencerConfig.subLanes[laneName].direction,
      _ppForward: true,
      values: chordSequencerConfig.subLanes[laneName].values,
    });
    const triggerPattern = chordSequencerConfig.steps.map((step, index) => index < chordSequencerConfig.stepCount && step.enabled);
    const triggerLength = chordSequencerConfig.steps.length;
    return {
      id: 4,
      rng: () => 0.5,
      color: CHORD_SEQUENCER_LANE_COLOR,
      name: CHORD_SEQUENCER_LANE_NAME,
      muted: !chordSequencerEnabled,
      solo: false,
      clockDiv: chordSequencerClockDivision,
      swing: 0,
      sources: {} as SequencerState['sources'],
      trigger: {
        enabled: chordSequencerEnabled,
        steps: chordSequencerConfig.stepCount,
        hits: chordSequencerActiveStepCount,
        rotation: 0,
        pattern: triggerPattern,
        overrides: new Set<number>(),
        probability: chordSequencerConfig.steps.map((step) => step.probability),
        ratchet: new Array(triggerLength).fill(1),
        trigCondition: new Array(triggerLength).fill([1, 1]),
      },
      pitch: {
        ...makeSubLane('pitch'),
        offsets: chordSequencerConfig.subLanes.pitch.values,
        mode: 'semitones',
        root: HARMONY_PITCH_ROOT_OCTAVE_MIDI,
        scale: HARMONY_PITCH_SCALE,
        scaleQuantize: true,
      },
      expression: {
        ...makeSubLane('expression'),
        velocities: chordSequencerConfig.subLanes.expression.values,
      },
      morph: makeSubLane('morph'),
      distance: makeSubLane('distance'),
      nudge: makeSubLane('nudge'),
      slice: {
        ...makeSubLane('chord'),
        _ppForward: true,
        values: chordSequencerConfig.subLanes.chord.values,
      },
      reverse: {
        enabled: false,
        steps: 4,
        direction: 'forward',
        _ppForward: true,
        values: new Array(8).fill(0),
      },
      stepIndex: 0,
      hitCount: 0,
      nextTime: 0,
      lastDisplayStep: 0,
      totalStepCount: chordSequencerConfig.stepCount,
      linked: false,
      evolve: {
        enabled: false,
        everyBars: 4,
        evolution: 0,
        writeOffset: 'auto',
        mutationMode: 'biased',
        lastEvolveBar: -1,
        methods: {} as SequencerState['evolve']['methods'],
        home: null,
      },
    };
  }, [chordSequencerActiveStepCount, chordSequencerClockDivision, chordSequencerConfig, chordSequencerEnabled]);

  useEffect(() => {
    if (!isRunning) {
      chordSequencerWasRunningRef.current = false;
      chordSequencerClockAnchorRef.current = null;
      setChordSequencerPlayhead(0);
      setChordSequencerAbsoluteStep(0);
      return;
    }
    const startingTransport = !chordSequencerWasRunningRef.current || chordSequencerClockAnchorRef.current == null;
    if (startingTransport) {
      chordSequencerClockAnchorRef.current = currentWallSeconds();
      setChordSequencerPlayhead(0);
      setChordSequencerAbsoluteStep(0);
    }
    chordSequencerWasRunningRef.current = true;
    if (!chordSequencerEnabled) return;

    let rafId: number | null = null;
    let lastAbsoluteStep = -1;
    const stepCount = Math.max(1, chordSequencerConfig.stepCount);
    const tick = () => {
      if (document.visibilityState === 'visible') {
        const anchor = chordSequencerClockAnchorRef.current ?? currentWallSeconds();
        const stepSeconds = chordSequencerUiStepSeconds(state, chordSequencerClockDivision);
        const absoluteStep = Math.max(0, Math.floor((currentWallSeconds() - anchor) / stepSeconds));
        if (absoluteStep !== lastAbsoluteStep) {
          lastAbsoluteStep = absoluteStep;
          setChordSequencerAbsoluteStep(absoluteStep);
          setChordSequencerPlayhead(absoluteStep % stepCount);
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };
    tick();
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [
    chordSequencerClockDivision,
    chordSequencerConfig.stepCount,
    chordSequencerEnabled,
    isRunning,
    state.drumEuclidBaseBPM,
    state.sequencerMasterBPM,
    state.synthEuclidBaseBPM,
  ]);

  const chordSequencerHitCount = useMemo(
    () => synthChordSequencerTriggerOrdinalForTick(chordSequencerConfig, chordSequencerAbsoluteStep) + 1,
    [chordSequencerAbsoluteStep, chordSequencerConfig],
  );
  const selectedChordSequencerTriggerStep = Math.max(
    0,
    Math.min(chordSequencerConfig.stepCount - 1, chordSequencerSelectedTriggerStep),
  );
  const canPasteChordSequencerTrigger = triggerStamp?.source === 'seq5Chord';

  useEffect(() => {
    const maxStep = Math.max(0, chordSequencerConfig.stepCount - 1);
    if (chordSequencerSelectedTriggerStep > maxStep) {
      setChordSequencerSelectedTriggerStep(maxStep);
    }
  }, [chordSequencerConfig.stepCount, chordSequencerSelectedTriggerStep]);

  const setChordSequencerStepCount = useCallback((value: number) => {
    updateChordSequencerConfig((current) => {
      const minSteps = CHORD_SEQUENCER_STEP_OPTIONS[0] ?? 1;
      const maxSteps = CHORD_SEQUENCER_STEP_OPTIONS[CHORD_SEQUENCER_STEP_OPTIONS.length - 1] ?? 8;
      const stepCount = clampChordSequencerInt(value, minSteps, maxSteps);
      return {
        ...current,
        stepCount,
        steps: current.steps.map((step) => ({
          ...step,
          holdSteps: clampChordSequencerInt(step.holdSteps ?? 1, 1, stepCount),
        })),
      };
    });
  }, [updateChordSequencerConfig]);

  const setChordSequencerHoldSteps = useCallback((stepIndex: number, holdSteps: number) => {
    updateChordSequencerStep(stepIndex, {
      holdSteps: clampChordSequencerInt(holdSteps, 1, chordSequencerConfig.stepCount),
    });
  }, [chordSequencerConfig.stepCount, updateChordSequencerStep]);

  const cycleChordSequencerHoldSteps = useCallback((stepIndex: number) => {
    const currentHold = chordSequencerConfig.steps[stepIndex]?.holdSteps ?? 1;
    setChordSequencerHoldSteps(
      stepIndex,
      nextChordSequencerHoldSteps(currentHold, chordSequencerConfig.stepCount),
    );
  }, [chordSequencerConfig.stepCount, chordSequencerConfig.steps, setChordSequencerHoldSteps]);

  const chordSequencerTriggerHoldSteps = useMemo(
    () => chordSequencerConfig.steps.map((step, index) => index < chordSequencerConfig.stepCount
      ? clampChordSequencerInt(step.holdSteps ?? 1, 1, chordSequencerConfig.stepCount)
      : 1),
    [chordSequencerConfig.stepCount, chordSequencerConfig.steps],
  );

  const chordSequencerTieSteps = useMemo(() => {
    const ties = chordSequencerConfig.steps.map(() => false);
    const stepCount = Math.max(1, chordSequencerConfig.stepCount);
    for (let index = 0; index < stepCount; index += 1) {
      const step = chordSequencerConfig.steps[index];
      if (!step?.enabled) continue;
      const holdSteps = clampChordSequencerInt(step.holdSteps ?? 1, 1, stepCount);
      for (let offset = 1; offset < holdSteps && index + offset < stepCount; offset += 1) {
        const tieIndex = index + offset;
        if (!chordSequencerConfig.steps[tieIndex]?.enabled) ties[tieIndex] = true;
      }
    }
    return ties;
  }, [chordSequencerConfig.stepCount, chordSequencerConfig.steps]);

  const chordSequencerTriggerLabels = useMemo(
    () => chordSequencerConfig.steps.map((step, index) => {
      if (index >= chordSequencerConfig.stepCount) return null;
      if (step.enabled) {
        return `●${formatChordSequencerHoldSteps(step.holdSteps ?? 1, chordSequencerConfig.stepCount)}`;
      }
      return chordSequencerTieSteps[index] ? '·' : '–';
    }),
    [chordSequencerConfig.stepCount, chordSequencerConfig.steps, chordSequencerTieSteps],
  );

  const chordSequencerStampSubLanes = useCallback((config: SynthChordSequencerConfig): Record<string, SubLaneLike> => {
    const toLane = (laneName: SynthChordSequencerSubLaneName): SubLaneLike => ({
      enabled: config.subLanes[laneName].enabled,
      steps: config.subLanes[laneName].steps,
      direction: config.subLanes[laneName].direction,
      values: config.subLanes[laneName].values,
    });
    return {
      chord: toLane('chord'),
      expression: toLane('expression'),
      morph: toLane('morph'),
      distance: toLane('distance'),
      nudge: toLane('nudge'),
    };
  }, []);

  const copyChordSequencerTriggerStamp = useCallback((stepIndex: number): boolean => {
    const safeStep = Math.max(0, Math.min(chordSequencerConfig.stepCount - 1, Math.round(stepIndex)));
    const labels = [
      chordSequencerConfig.subLanes.chord.enabled ? 'C' : '',
      chordSequencerConfig.subLanes.expression.enabled ? 'E' : '',
      chordSequencerConfig.subLanes.morph.enabled ? 'M' : '',
      chordSequencerConfig.subLanes.distance.enabled ? 'D' : '',
      chordSequencerConfig.subLanes.nudge.enabled ? 'N' : '',
    ].filter(Boolean);
    const summary = `Trig ${safeStep + 1}${labels.length ? ` + ${labels.join(' ')}` : ''}`;
    const stamp = copyTriggerStamp({
      source: 'seq5Chord',
      stepIndex: safeStep,
      trigger: {
        steps: chordSequencerConfig.stepCount,
        pattern: chordSequencerConfig.steps.slice(0, chordSequencerConfig.stepCount).map((step) => step.enabled),
        probability: chordSequencerConfig.steps.map((step) => step.probability),
      },
      subLanes: chordSequencerStampSubLanes(chordSequencerConfig),
      extraTriggerData: {
        holdSteps: chordSequencerConfig.steps[safeStep]?.holdSteps ?? 1,
      },
      label: summary,
    });
    if (!stamp) return false;
    setTriggerStamp(stamp);
    setTriggerStampMode(true);
    setTriggerStampPickSource(false);
    return true;
  }, [chordSequencerConfig, chordSequencerStampSubLanes]);

  const beginChordSequencerTriggerStampSourcePick = useCallback(() => {
    setTriggerStampPickSource(true);
    setTriggerStampMode(false);
  }, []);

  const pasteChordSequencerTriggerStamp = useCallback((stepIndex: number): boolean => {
    if (!triggerStamp || triggerStamp.source !== 'seq5Chord') return false;
    const safeStep = Math.max(0, Math.min(chordSequencerConfig.stepCount - 1, Math.round(stepIndex)));
    const result = pasteTriggerStamp({
      stamp: triggerStamp,
      stepIndex: safeStep,
      trigger: {
        steps: chordSequencerConfig.stepCount,
        pattern: chordSequencerConfig.steps.slice(0, chordSequencerConfig.stepCount).map((step) => step.enabled),
        probability: chordSequencerConfig.steps.map((step) => step.probability),
      },
      subLanes: chordSequencerStampSubLanes(chordSequencerConfig),
      maxSubLaneSteps: 8,
    });
    updateChordSequencerConfig((current) => ({
      ...current,
      steps: current.steps.map((step, index) => index === safeStep
        ? {
            ...step,
            enabled: true,
            probability: result.probability?.[safeStep] ?? triggerStamp.trigger.probability ?? step.probability,
            holdSteps: triggerStamp.trigger.holdSteps ?? step.holdSteps,
          }
        : {
            ...step,
            enabled: index < result.pattern.length ? result.pattern[index] ?? step.enabled : step.enabled,
          }),
      subLanes: {
        ...current.subLanes,
        chord: result.subLanes.chord ?? current.subLanes.chord,
        expression: result.subLanes.expression ?? current.subLanes.expression,
        morph: result.subLanes.morph ?? current.subLanes.morph,
        distance: result.subLanes.distance ?? current.subLanes.distance,
        nudge: result.subLanes.nudge ?? current.subLanes.nudge,
      },
    }));
    return true;
  }, [chordSequencerConfig, chordSequencerStampSubLanes, triggerStamp, updateChordSequencerConfig]);

  const renderChordSequencerControls = (variant: 'detail' | 'simple' = 'detail') => (
    <div className={`synth-chord-editor synth-chord-editor--${variant}`}>
      <div className="seq-sources seq-chord-sources">
        <select
          className="synth-source-select"
          aria-label="Chord sequencer source"
          value={chordSequencerSourceValue}
          onChange={(e) => setChordSequencerSource(e.target.value)}
          style={{
            borderColor: `${chordSequencerSourceInfo.color}60`,
            color: chordSequencerSourceInfo.color,
          }}
        >
          {CHORD_SEQUENCER_SOURCES.map((source) => (
            <option key={source.value} value={source.value}>{source.label}</option>
          ))}
        </select>
        <label className="synth-source-label">
          Voices
          <select
            className="synth-source-select"
            value={state.synthChordSequencerVoiceCount ?? 6}
            onChange={(e) => onParamChange('synthChordSequencerVoiceCount', Number(e.target.value))}
          >
            {PAD_VOICE_NUMBERS.map((voice) => (
              <option key={voice} value={voice}>{voice}</option>
            ))}
          </select>
        </label>
        <label className="synth-source-label">
          Mode
          <select
            className="synth-source-select"
            value={chordSequencerConfig.playbackMode}
            onChange={(event) => updateChordSequencerConfig((current) => ({
              ...current,
              playbackMode: event.target.value as SynthChordSequencerPlaybackMode,
            }))}
          >
            {CHORD_PLAYBACK_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </select>
        </label>
        <label className="synth-source-label">
          Clock
          <select
            className="synth-source-select"
            value={chordSequencerClockDivision}
            onChange={(event) => onSelectChange('synthChordSequencerClockDivision' as keyof SliderState, event.target.value as SliderState[keyof SliderState])}
          >
            <option value="1/4">1/4</option>
            <option value="1/4T">1/4T</option>
            <option value="1/8">1/8</option>
            <option value="1/8T">1/8T</option>
            <option value="1/16">1/16</option>
            <option value="1/16T">1/16T</option>
            <option value="1/32">1/32</option>
            <option value="1/32T">1/32T</option>
          </select>
        </label>
      </div>
      {chordSequencerConfig.playbackMode === 'strum' && (
        <div className="synth-chord-mode-panel">
          <label className="synth-source-label">
            Dir
            <select
              className="synth-source-select"
              value={chordSequencerConfig.strum.direction}
              onChange={(event) => updateChordSequencerConfig((current) => ({
                ...current,
                strum: { ...current.strum, direction: event.target.value as SynthChordSequencerStrumDirection },
              }))}
            >
              {CHORD_STRUM_DIRECTIONS.map((direction) => (
                <option key={direction.value} value={direction.value}>{direction.label}</option>
              ))}
            </select>
          </label>
          <label className="synth-source-label">
            Spread
            <input
              className="synth-chord-mini-range"
              type="range"
              min={0}
              max={400}
              step={1}
              value={chordSequencerConfig.strum.spreadMs}
              onChange={(event) => updateChordSequencerConfig((current) => ({
                ...current,
                strum: { ...current.strum, spreadMs: Number(event.target.value) },
              }))}
            />
          </label>
          <label className="synth-source-label">
            Curve
            <input
              className="synth-chord-mini-range"
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={chordSequencerConfig.strum.curve}
              onChange={(event) => updateChordSequencerConfig((current) => ({
                ...current,
                strum: { ...current.strum, curve: Number(event.target.value) },
              }))}
            />
          </label>
          <label className="synth-source-label">
            Gate
            <input
              className="synth-chord-mini-range"
              type="range"
              min={0.05}
              max={1}
              step={0.01}
              value={chordSequencerConfig.strum.gate}
              onChange={(event) => updateChordSequencerConfig((current) => ({
                ...current,
                strum: { ...current.strum, gate: Number(event.target.value) },
              }))}
            />
          </label>
        </div>
      )}
    </div>
  );

  const renderChordRhythmTrack = () => (
    <div className="seq-trigger-always seq-chord-trigger-lane seq-chord-rhythm-track">
      <div className="seq-lane-header seq-chord-trigger-header">
        <span className="seq-lane-title">RHYTHM</span>
        <div className="seq-lane-controls seq-chord-trigger-controls">
          <DragNumber
            value={chordSequencerConfig.stepCount}
            min={CHORD_SEQUENCER_STEP_OPTIONS[0] ?? 1}
            max={CHORD_SEQUENCER_STEP_OPTIONS[CHORD_SEQUENCER_STEP_OPTIONS.length - 1] ?? 8}
            label="Steps"
            shapeByDrag
            onChange={setChordSequencerStepCount}
          />
          <button
            type="button"
            className={`seq-chord-clip-btn${triggerStampPickSource ? ' on' : ''}`}
            onClick={beginChordSequencerTriggerStampSourcePick}
          >
            Copy
          </button>
          {(triggerStampPickSource || triggerStampMode) ? (
            <span className="seq-trigger-stamp-pill">
              {triggerStampPickSource ? 'Select source trigger' : triggerStamp?.label}
            </span>
          ) : null}
        </div>
      </div>
      <SeqLane
        sequencer={chordSequencerLaneModel}
        lane="trigger"
        color={CHORD_SEQUENCER_LANE_COLOR}
        playhead={chordSequencerPlayhead}
        hitCount={chordSequencerHitCount}
        selectedStep={selectedChordSequencerTriggerStep}
        selectedStepLabel="Seq 5"
        onSelectStep={setChordSequencerSelectedTriggerStep}
        onToggleTriggerStep={(step) => {
          if (triggerStampPickSource) {
            setChordSequencerSelectedTriggerStep(step);
            if (chordSequencerConfig.steps[step]?.enabled) copyChordSequencerTriggerStamp(step);
            return;
          }
          if (triggerStampMode && canPasteChordSequencerTrigger) {
            pasteChordSequencerTriggerStamp(step);
            return;
          }
          updateChordSequencerStep(step, {
            enabled: !chordSequencerConfig.steps[step]?.enabled,
          });
        }}
        onCycleTriggerHold={cycleChordSequencerHoldSteps}
        onSetTriggerHold={setChordSequencerHoldSteps}
        triggerHoldSteps={chordSequencerTriggerHoldSteps}
        triggerTieSteps={chordSequencerTieSteps}
        triggerStepLabels={chordSequencerTriggerLabels}
        onSetProbability={(step, value) => updateChordSequencerStep(step, { probability: value })}
        onResetProbability={(step) => updateChordSequencerStep(step, { probability: 1 })}
      />
    </div>
  );

  /* ─── Digitone-style Global Arp Config Bar (Option B) ─── */
  const renderChordArpBar = () => {
    if (chordSequencerConfig.playbackMode !== 'arp') return null;
    return (
      <div className="seq-chord-arp-bar">
        <div className="seq-chord-arp-bar-row">
          <div className="seq-chord-arp-bar-param">
            <span className="seq-chord-arp-bar-label">Mode</span>
            <div className="seq-chord-arp-bar-shapes">
              {CHORD_ARP_SHAPES.filter((s) => s.value !== 'custom').map((shape) => (
                <button
                  key={shape.value}
                  type="button"
                  className={`seq-chord-arp-shape-btn${chordSequencerConfig.arp.shape === shape.value ? ' active' : ''}`}
                  onClick={() => updateChordSequencerConfig((current) => ({
                    ...current,
                    arp: {
                      ...current.arp,
                      shape: shape.value as SynthChordSequencerArpShape,
                      pattern: shape.value === 'custom'
                        ? current.arp.pattern
                        : synthChordArpPatternForShape(shape.value as SynthChordSequencerArpShape, current.arp.patternLength),
                    },
                  }))}
                  title={shape.label}
                >
                  {shape.label}
                </button>
              ))}
            </div>
          </div>
          <div className="seq-chord-arp-bar-param">
            <span className="seq-chord-arp-bar-label">Speed</span>
            <select
              className="synth-source-select seq-chord-arp-bar-select"
              value={chordSequencerConfig.arp.speed}
              onChange={(event) => updateChordSequencerConfig((current) => ({
                ...current,
                arp: { ...current.arp, speed: event.target.value as SynthChordSequencerArpSpeed },
              }))}
            >
              {SYNTH_CHORD_ARP_SPEEDS.map((speed) => (
                <option key={speed} value={speed}>{speed}</option>
              ))}
            </select>
          </div>
          <div className="seq-chord-arp-bar-param">
            <span className="seq-chord-arp-bar-label">Range</span>
            <select
              className="synth-source-select seq-chord-arp-bar-select"
              value={chordSequencerConfig.arp.range}
              onChange={(event) => updateChordSequencerConfig((current) => ({
                ...current,
                arp: { ...current.arp, range: Number(event.target.value) as SynthChordSequencerArpRange },
              }))}
            >
              {SYNTH_CHORD_ARP_RANGES.map((r) => (
                <option key={r} value={r}>{r} oct</option>
              ))}
            </select>
          </div>
          <div className="seq-chord-arp-bar-param">
            <span className="seq-chord-arp-bar-label">Length</span>
            <DragNumber
              value={chordSequencerConfig.arp.patternLength}
              min={1}
              max={8}
              label=""
              displayValue={chordSequencerConfig.arp.patternLength}
              onChange={(value: number) => {
                const patternLength = snapChordArpPatternLength(value);
                updateChordSequencerConfig((current) => ({
                  ...current,
                  arp: {
                    ...current.arp,
                    patternLength,
                    pattern: current.arp.shape === 'custom'
                      ? current.arp.pattern
                      : synthChordArpPatternForShape(current.arp.shape, patternLength),
                  },
                }));
              }}
            />
          </div>
          <div className="seq-chord-arp-bar-param seq-chord-arp-bar-gate">
            <span className="seq-chord-arp-bar-label">Gate</span>
            <input
              className="synth-chord-mini-range"
              type="range"
              min={0.05}
              max={1}
              step={0.01}
              value={chordSequencerConfig.arp.gate}
              onChange={(event) => updateChordSequencerConfig((current) => ({
                ...current,
                arp: { ...current.arp, gate: Number(event.target.value) },
              }))}
            />
          </div>
        </div>
      </div>
    );
  };

  /* ─── Melody Track (Option B: independent chord slot lane) ─── */
  const updateMelodyTrack = useCallback((
    updater: (current: SynthChordSequencerMelodyTrack) => SynthChordSequencerMelodyTrack,
  ) => {
    updateChordSequencerConfig((current) => ({
      ...current,
      melodyTrack: updater(current.melodyTrack),
    }));
  }, [updateChordSequencerConfig]);

  const updateMelodyStep = useCallback((
    stepIndex: number,
    patch: Partial<SynthChordSequencerMelodyStep>,
  ) => {
    updateMelodyTrack((current) => ({
      ...current,
      steps: current.steps.map((step, index) => index === stepIndex ? { ...step, ...patch } : step),
    }));
  }, [updateMelodyTrack]);

  const cycleMelodySlot = useCallback((stepIndex: number) => {
    const current = chordSequencerConfig.melodyTrack.steps[stepIndex];
    if (!current) return;
    const next = current.slotIndex >= 8 ? 1 : current.slotIndex + 1;
    updateMelodyStep(stepIndex, { slotIndex: next });
  }, [chordSequencerConfig.melodyTrack.steps, updateMelodyStep]);

  const cycleMelodyDirection = useCallback(() => {
    updateMelodyTrack((current) => {
      const dirs: SynthChordSequencerSubLaneDirection[] = ['forward', 'reverse', 'pingpong'];
      const idx = dirs.indexOf(current.direction);
      return { ...current, direction: dirs[(idx + 1) % dirs.length]! };
    });
  }, [updateMelodyTrack]);

  const melodyTrackDirectionLabel = useMemo(() => {
    const d = chordSequencerConfig.melodyTrack.direction;
    return d === 'forward' ? 'Fwd' : d === 'reverse' ? 'Rev' : 'Ping';
  }, [chordSequencerConfig.melodyTrack.direction]);

  const MELODY_SLOT_COLORS = useMemo(() => [
    '#22d3ee', '#a78bfa', '#f472b6', '#fbbf24',
    '#34d399', '#fb923c', '#60a5fa', '#e879f9',
  ], []);

  const renderChordMelodyTrack = () => {
    const track = chordSequencerConfig.melodyTrack;
    const visibleSteps = track.steps.slice(0, track.stepCount);
    return (
      <div className="seq-chord-melody-track">
        <div className="seq-lane-header seq-chord-melody-header">
          <span className="seq-lane-title">MELODY</span>
          <div className="seq-lane-controls seq-chord-melody-controls">
            <DragNumber
              value={track.stepCount}
              min={1}
              max={8}
              label="Steps"
              shapeByDrag
              onChange={(value: number) => updateMelodyTrack((current) => ({
                ...current,
                stepCount: Math.max(1, Math.min(8, Math.round(value))),
              }))}
            />
            <button
              type="button"
              className="seq-chord-dir-btn"
              onClick={cycleMelodyDirection}
              title="Cycle direction"
            >
              {melodyTrackDirectionLabel}
            </button>
          </div>
        </div>
        <div
          className="seq-chord-melody-grid"
          style={{ gridTemplateColumns: `repeat(${track.stepCount}, 1fr)` }}
        >
          {visibleSteps.map((step, index) => {
            const slotColor = MELODY_SLOT_COLORS[(step.slotIndex - 1) % MELODY_SLOT_COLORS.length] ?? '#22d3ee';
            const modeLabel = step.mode === 'inherit'
              ? ''
              : step.mode === 'chord' ? 'C'
              : step.mode === 'arp' ? 'A'
              : 'S';
            const shapeGlyph = step.mode === 'arp' || (step.mode === 'inherit' && chordSequencerConfig.playbackMode === 'arp')
              ? (step.arpShapeOverride
                  ? step.arpShapeOverride === 'up' ? '↗'
                  : step.arpShapeOverride === 'down' ? '↘'
                  : step.arpShapeOverride === 'upDown' ? '⟋⟍'
                  : step.arpShapeOverride === 'skip' ? '⤮'
                  : step.arpShapeOverride === 'octave' ? '⏚'
                  : '~'
                : '')
              : '';
            return (
              <button
                key={index}
                type="button"
                className="seq-chord-melody-cell"
                style={{
                  '--slot-color': slotColor,
                  borderColor: `color-mix(in srgb, ${slotColor} 55%, rgba(255,255,255,0.12))`,
                } as React.CSSProperties}
                onClick={() => cycleMelodySlot(index)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  const modes: SynthChordSequencerMelodyStepMode[] = ['inherit', 'chord', 'arp', 'strum'];
                  const currentIdx = modes.indexOf(step.mode);
                  updateMelodyStep(index, { mode: modes[(currentIdx + 1) % modes.length]! });
                }}
                title={`Slot ${step.slotIndex} · ${step.mode}${shapeGlyph ? ` · ${shapeGlyph}` : ''}\nClick: cycle slot · Right-click: cycle mode`}
              >
                <span className="seq-chord-melody-slot-badge" style={{ background: slotColor }}>
                  {step.slotIndex}
                </span>
                {modeLabel && (
                  <span className="seq-chord-melody-mode-badge">{modeLabel}</span>
                )}
                {shapeGlyph && (
                  <span className="seq-chord-melody-shape">{shapeGlyph}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderChordSubLaneEditor = (laneName: SynthChordSequencerSubLaneName) => {
    const lane = chordSequencerConfig.subLanes[laneName];
    const meta = CHORD_SUB_LANE_META[laneName];
    const sparkValues = laneName === 'chord'
      ? lane.values.map((value) => (Math.max(1, Math.min(8, Math.round(value))) - 1) / 7)
      : laneName === 'pitch'
      ? lane.values.map((value) => normalizeNoteDegreeOffset(value))
      : lane.values;
    return (
      <React.Fragment key={laneName}>
        <SeqSparkline
          label={`${meta.label.charAt(0)}:`}
          steps={lane.steps}
          values={sparkValues}
          color={meta.color}
          playhead={chordSequencerPlayhead}
          hitCount={chordSequencerHitCount}
          playheadMode="hit"
          direction={lane.direction}
          bipolar={laneName === 'morph'}
          mode={laneName === 'nudge' ? 'signed' : undefined}
          invertFill={laneName === 'expression'}
          enabled={lane.enabled}
          expanded={chordSequencerOpenLane === laneName}
          onClick={() => setChordSequencerOpenLane(chordSequencerOpenLane === laneName ? 'trigger' : laneName)}
          onToggleEnabled={() => updateChordSequencerSubLane(laneName, (current) => ({ ...current, enabled: !current.enabled }))}
        />
        {chordSequencerOpenLane === laneName && (
          <div className="seq-lane-editor-wrap">
            <SeqLane
              sequencer={chordSequencerLaneModel}
              lane={laneName}
              color={meta.color}
              playhead={chordSequencerPlayhead}
              hitCount={chordSequencerHitCount}
              enabled={lane.enabled}
              direction={lane.direction}
              onToggleEnabled={() => updateChordSequencerSubLane(laneName, (current) => ({ ...current, enabled: !current.enabled }))}
              onChangeSteps={(steps) => updateChordSequencerSubLane(laneName, (current) => ({
                ...current,
                steps: Math.max(1, Math.min(8, Math.round(steps))),
              }))}
              onCycleDirection={() => updateChordSequencerSubLane(laneName, (current) => {
                const currentIndex = CHORD_SUB_LANE_DIRECTIONS.findIndex((direction) => direction.value === current.direction);
                const nextDirection = CHORD_SUB_LANE_DIRECTIONS[(currentIndex + 1) % CHORD_SUB_LANE_DIRECTIONS.length]?.value ?? 'forward';
                return { ...current, direction: nextDirection };
              })}
              onChangeValue={(step, value) => updateChordSequencerSubLaneValue(
                laneName,
                step,
                laneName === 'chord' ? Math.max(1, Math.min(8, Math.round(value))) : value,
              )}
              maxSubLaneSteps={8}
            />
          </div>
        )}
      </React.Fragment>
    );
  };

  const synthLivePollMs = useMemo(() => {
    const pad1FilterModEnvActive =
      !!state.padModEnvEnabled &&
      (state.padModEnvDest ?? 'filterCutoff') === 'filterCutoff' &&
      Math.abs(state.padModEnvDepth ?? 0) > 0.001;
    const pad2FilterModEnvActive =
      !!state.pad2ModEnvEnabled &&
      (state.pad2ModEnvDest ?? 'filterCutoff') === 'filterCutoff' &&
      Math.abs(state.pad2ModEnvDepth ?? 0) > 0.001;
    const hasAnimatedFilterView =
      !!state.synthEuclideanMasterEnabled ||
      !!state.leadRandomEnabled ||
      (((state.padLfo1Dest ?? 'none') !== 'none') && (state.padLfo1Depth ?? 0) > 0.001) ||
      (((state.padLfo2Dest ?? 'none') !== 'none') && (state.padLfo2Depth ?? 0) > 0.001) ||
      (((state.pad2Lfo1Dest ?? 'none') !== 'none') && (state.pad2Lfo1Depth ?? 0) > 0.001) ||
      (((state.pad2Lfo2Dest ?? 'none') !== 'none') && (state.pad2Lfo2Depth ?? 0) > 0.001) ||
      pad1FilterModEnvActive ||
      pad2FilterModEnvActive ||
      (state.leadVibratoDepth ?? 0) > 0.001;
    return hasAnimatedFilterView ? 50 : 180;
  }, [
    state.leadRandomEnabled,
    state.leadVibratoDepth,
    state.pad2ModEnvDepth,
    state.pad2ModEnvDest,
    state.pad2ModEnvEnabled,
    state.pad2Lfo1Depth,
    state.pad2Lfo1Dest,
    state.pad2Lfo2Depth,
    state.pad2Lfo2Dest,
    state.padModEnvDepth,
    state.padModEnvDest,
    state.padModEnvEnabled,
    state.padLfo1Depth,
    state.padLfo1Dest,
    state.padLfo2Depth,
    state.padLfo2Dest,
    state.synthEuclideanMasterEnabled,
  ]);

  useVisibleInterval(updateLiveFilterViz, synthLivePollMs, {
    enabled: isRunning && liveSourceTelemetryAvailable && livePadFilterVizMounted,
  });

  const getPadMorphValue = useCallback((scope: PadRandomScope): number => (
    scope === 'pad1' ? pad1MorphValue : pad2MorphValue
  ), [pad1MorphValue, pad2MorphValue]);

  const getPadAutoMorphEnabled = useCallback((scope: PadRandomScope): boolean => (
    scope === 'pad1' ? !!state.padMorphAuto : !!state.pad2MorphAuto
  ), [state.pad2MorphAuto, state.padMorphAuto]);

  const getPadEndpointLabel = useCallback((scope: PadRandomScope): 'A' | 'B' | null => {
    const morphValue = getPadMorphValue(scope);
    if (Math.abs(morphValue) <= PAD_ENDPOINT_EPSILON) return 'A';
    if (Math.abs(morphValue - 1) <= PAD_ENDPOINT_EPSILON) return 'B';
    return null;
  }, [getPadMorphValue]);

  const canUsePadRandomize = useCallback((scope: PadRandomScope): boolean => (
    !!onStateChange && getPadEndpointLabel(scope) !== null && !getPadAutoMorphEnabled(scope)
  ), [getPadAutoMorphEnabled, getPadEndpointLabel, onStateChange]);

  const setPadVariationForScope = useCallback((
    scope: PadRandomScope,
    updater: PadVariationSession | ((prev: PadVariationSession) => PadVariationSession),
  ) => {
    if (scope === 'pad1') {
      setPad1Variation(prev => (typeof updater === 'function' ? updater(prev) : updater));
      return;
    }
    setPad2Variation(prev => (typeof updater === 'function' ? updater(prev) : updater));
  }, []);

  const getPadVariationForScope = useCallback((scope: PadRandomScope): PadVariationSession => (
    scope === 'pad1' ? pad1Variation : pad2Variation
  ), [pad1Variation, pad2Variation]);

  const applyPadVariationSnapshot = useCallback((scope: PadRandomScope, snapshot: PadScopeSnapshot) => {
    if (!onStateChange) return;
    onStateChange(applyPadScopeState(state, scope, snapshot));
  }, [onStateChange, state]);

  const handlePadRandomGoal = useCallback((scope: PadRandomScope) => {
    if (!canUsePadRandomize(scope)) return;
    const current = extractPadScopeState(state, scope);
    const endpointLabel = getPadEndpointLabel(scope) ?? 'A';
    const goal = createPadRandomGoal(current, scope, 'target', `${endpointLabel}|goal`);
    setPadVariationForScope(scope, {
      anchor: current,
      goal,
      history: [],
      appliedSteps: 0,
      walkEnabled: false,
    });
  }, [canUsePadRandomize, getPadEndpointLabel, setPadVariationForScope, state]);

  const handlePadWalkToggle = useCallback((scope: PadRandomScope) => {
    if (!canUsePadRandomize(scope)) return;
    const current = extractPadScopeState(state, scope);
    setPadVariationForScope(scope, prev => ({
      anchor: current,
      goal: null,
      history: prev.walkEnabled ? prev.history : [],
      appliedSteps: 0,
      walkEnabled: !prev.walkEnabled,
    }));
  }, [canUsePadRandomize, setPadVariationForScope, state]);

  const handlePadVariant = useCallback((scope: PadRandomScope) => {
    if (!canUsePadRandomize(scope)) return;

    const current = extractPadScopeState(state, scope);
    const variation = getPadVariationForScope(scope);

    if (variation.walkEnabled) {
      const walkGoal = createPadRandomGoal(current, scope, 'walk', `walk|${variation.history.length}`);
      const nextSnapshot = blendPadScopeState(scope, current, walkGoal, PAD_WALK_BLEND, PAD_WALK_DISCRETE_THRESHOLD);
      applyPadVariationSnapshot(scope, nextSnapshot);
      setPadVariationForScope(scope, prev => ({
        ...prev,
        anchor: prev.anchor ?? current,
        goal: walkGoal,
        history: [...prev.history, current],
        appliedSteps: prev.appliedSteps + 1,
      }));
      return;
    }

    if (!variation.anchor || !variation.goal) return;
    if (variation.appliedSteps >= PAD_VARIANT_PROGRESS.length) return;

    const nextStepCount = variation.appliedSteps + 1;
    const nextAmount = PAD_VARIANT_PROGRESS[nextStepCount - 1] ?? 1;
    const nextSnapshot = blendPadScopeState(scope, variation.anchor, variation.goal, nextAmount);
    applyPadVariationSnapshot(scope, nextSnapshot);
    setPadVariationForScope(scope, prev => ({
      ...prev,
      history: [...prev.history, current],
      appliedSteps: nextStepCount,
    }));
  }, [applyPadVariationSnapshot, canUsePadRandomize, getPadVariationForScope, setPadVariationForScope, state]);

  const handlePadVariationUndo = useCallback((scope: PadRandomScope) => {
    const variation = getPadVariationForScope(scope);
    if (variation.history.length === 0) return;

    const previousSnapshot = variation.history[variation.history.length - 1];
    if (!previousSnapshot) return;

    applyPadVariationSnapshot(scope, previousSnapshot);
    setPadVariationForScope(scope, prev => ({
      ...prev,
      history: prev.history.slice(0, -1),
      appliedSteps: Math.max(0, prev.appliedSteps - 1),
    }));
  }, [applyPadVariationSnapshot, getPadVariationForScope, setPadVariationForScope]);

  const buildPadVariationControls = useCallback((scope: PadRandomScope) => {
    const variation = getPadVariationForScope(scope);
    const endpointLabel = getPadEndpointLabel(scope);
    const canArm = canUsePadRandomize(scope);
    const canVariant = canArm && (
      variation.walkEnabled
      || (!!variation.goal && variation.appliedSteps < PAD_VARIANT_PROGRESS.length)
    );
    const disabledReason = getPadAutoMorphEnabled(scope)
      ? 'Stop Auto Morph before using Random or Walk'
      : 'Random is only available when the preset morph slider is fully at A or B';

    let progressText = endpointLabel ? `Base ${endpointLabel}` : 'Endpoint only';
    if (variation.walkEnabled) {
      progressText = variation.history.length > 0 ? `Walk ${variation.history.length}` : 'Walk ready';
    } else if (variation.goal) {
      progressText = `Goal ${variation.appliedSteps}/${PAD_VARIANT_PROGRESS.length}`;
    }

    return {
      canArm,
      canVariant,
      canUndo: variation.history.length > 0,
      walkEnabled: variation.walkEnabled,
      targetReady: !variation.walkEnabled && !!variation.goal,
      endpointLabel,
      progressText,
      disabledReason,
      onRandom: () => handlePadRandomGoal(scope),
      onWalkToggle: () => handlePadWalkToggle(scope),
      onVariant: () => handlePadVariant(scope),
      onUndo: () => handlePadVariationUndo(scope),
    };
  }, [
    canUsePadRandomize,
    getPadAutoMorphEnabled,
    getPadEndpointLabel,
    getPadVariationForScope,
    handlePadRandomGoal,
    handlePadVariationUndo,
    handlePadVariant,
    handlePadWalkToggle,
  ]);

  // ── Shared Euclidean sequence bank ──
  const [euclidPresetNames, setEuclidPresetNames] = useState<Array<string | undefined>>(() => Array(4).fill(undefined));
  const setEuclidPresetNameForLane = useCallback((laneIdx: number, name: string | undefined) => {
    setEuclidPresetNames(prev => prev.map((value, index) => (index === laneIdx ? name : value)));
  }, []);

  // CollapsiblePanel available from CollapsiblePanelComponent prop if needed

  useEffect(() => {
    let cancelled = false;

    const syncPadRuntimePresets = async (
      scope: 'pad1' | 'pad2',
      summaries: typeof pad1EnginePresets,
      loadPreset: typeof loadPad1Preset,
    ) => {
      type RuntimePadPresetSyncEntry = {
        id: string;
        name: string;
        library: Exclude<PadPresetOption['library'], 'stock'>;
        preset: PadPreset;
        updatedAt?: number;
        rating?: number;
      };
      const runtimePresets = await Promise.all(
        summaries
          .map(async (preset): Promise<RuntimePadPresetSyncEntry | null> => {
            const entry = await loadPreset(preset.name);
            if (!entry) return null;
            const version = entry.versions.find(v => v.v === entry.currentVersion)
              || entry.versions[entry.versions.length - 1];
            if (!version) return null;
            const stockId = getFactoryPadPresetIdByName(entry.name);
            const library: Exclude<PadPresetOption['library'], 'stock'> = entry.library === 'cloud' ? 'cloud' : 'user';
            return {
              id: stockId ?? entry.id ?? entry.name,
              name: entry.name,
              library,
              preset: createRuntimePadPreset(scope, entry.name, version.data, entry.tags ?? []),
              updatedAt: entry.updatedAt,
              rating: entry.rating,
            };
          }),
      );

      if (!cancelled) {
        setUserPadPresets(
          scope,
          runtimePresets.filter((preset): preset is RuntimePadPresetSyncEntry => Boolean(preset)),
        );
      }
    };

    syncPadRuntimePresets('pad1', pad1EnginePresets, loadPad1Preset).catch((error) => {
      console.warn('Failed to sync pad1 L1 presets:', error);
      if (!cancelled) setUserPadPresets('pad1', []);
    });
    syncPadRuntimePresets('pad2', pad2EnginePresets, loadPad2Preset).catch((error) => {
      console.warn('Failed to sync pad2 L1 presets:', error);
      if (!cancelled) setUserPadPresets('pad2', []);
    });

    return () => {
      cancelled = true;
    };
  }, [loadPad1Preset, loadPad2Preset, pad1EnginePresets, pad2EnginePresets]);

  useEffect(() => {
    let cancelled = false;

    const syncLeadRuntimePresets = async () => {
      const runtimePresets = await Promise.all(
        leadFmPresets
          .map(async (preset) => {
            const entry = await loadLeadFmPresetEntry(preset.name);
            if (!entry) return null;
            const runtimeId = resolveLeadPresetRuntimeId(entry.name);
            const version = entry.versions.find(v => v.v === entry.currentVersion)
              || entry.versions[entry.versions.length - 1];
            if (!version) return null;
            const resolvedPreset = createRuntimeLeadPreset(runtimeId, entry.name, version.data);
            if (!resolvedPreset) return null;
            const runtimeLibrary: 'user' | 'cloud' = entry.library === 'cloud' ? 'cloud' : 'user';
            return {
              id: runtimeId,
              name: entry.name,
              library: runtimeLibrary,
              preset: resolvedPreset,
            };
          }),
      );

      if (!cancelled) {
        setUserLead4opFMPresets(runtimePresets.filter((preset): preset is NonNullable<typeof preset> => Boolean(preset)));
      }
    };

    syncLeadRuntimePresets().catch((error) => {
      console.warn('Failed to sync lead FM L1 presets:', error);
      if (!cancelled) setUserLead4opFMPresets([]);
    });

    return () => {
      cancelled = true;
    };
  }, [createRuntimeLeadPreset, leadFmPresets, loadLeadFmPresetEntry, resolveLeadPresetRuntimeId]);

  useEffect(() => {
    setPad1Variation(EMPTY_PAD_VARIATION_SESSION);
  }, [state.padPresetA, state.padPresetB, state.padMorph, state.padMorphAuto]);

  useEffect(() => {
    setPad2Variation(EMPTY_PAD_VARIATION_SESSION);
  }, [state.pad2PresetA, state.pad2PresetB, state.pad2Morph, state.pad2MorphAuto]);

  const pad1PresetOptions = getPadPresetOptions('pad1');
  const pad2PresetOptions = getPadPresetOptions('pad2');
  const pad1OptionById = new Map(pad1PresetOptions.map(option => [option.id, option]));
  const pad2OptionById = new Map(pad2PresetOptions.map(option => [option.id, option]));
  const leadPresetOptions = useMemo<LeadPresetOption[]>(() => {
    const optionsById = new Map<string, LeadPresetOption>();
    const optionIdByName = new Map<string, string>();

    const mergeOption = (option: LeadPresetOption) => {
      if (option.runtime) {
        optionsById.set(option.id, option);
        return;
      }

      const normalizedName = option.name.trim().toLowerCase();
      const priority = leadPresetOptionPriority(option);
      const existingIdByName = optionIdByName.get(normalizedName);
      if (existingIdByName) {
        const existing = optionsById.get(existingIdByName);
        const existingPriority = existing ? leadPresetOptionPriority(existing) : 0;
        if (existing && existingPriority >= priority) {
          return;
        }
        optionsById.delete(existingIdByName);
      }

      optionsById.set(option.id, option);
      optionIdByName.set(normalizedName, option.id);
    };

    for (const preset of lead4opPresets) {
      mergeOption({
        id: preset.id,
        name: preset.name,
        library: 'stock',
      });
    }

    for (const preset of leadFmPresets) {
      mergeOption({
        id: resolveLeadPresetRuntimeId(preset.name),
        name: preset.name,
        library: preset.library,
        sourceId: preset.id,
        sourceName: preset.name,
        sourceLibrary: preset.library,
        tags: preset.tags,
        updatedAt: preset.updatedAt,
        rating: preset.rating,
      });
    }

    for (const preset of leadEditorRuntimeOptions) {
      mergeOption(preset);
    }

    return [...optionsById.values()];
  }, [lead4opPresets, leadEditorRuntimeOptions, leadFmPresets, resolveLeadPresetRuntimeId]);
  const leadPresetOptionById = useMemo(
    () => new Map(leadPresetOptions.map(option => [option.id, option])),
    [leadPresetOptions],
  );
  const findLeadPresetOption = useCallback((value: string): LeadPresetOption | undefined => {
    const direct = leadPresetOptionById.get(value);
    if (direct) return direct;
    const normalizedValue = value.trim().toLowerCase().replace(/[_-]+/g, ' ');
    return leadPresetOptions.find((option) => (
      option.id.trim().toLowerCase().replace(/[_-]+/g, ' ') === normalizedValue
      || option.name.trim().toLowerCase().replace(/[_-]+/g, ' ') === normalizedValue
      || (option.sourceId ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ') === normalizedValue
      || (option.sourceName ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ') === normalizedValue
    ));
  }, [leadPresetOptionById, leadPresetOptions]);
  const resolveLeadPresetSelectionId = useCallback((value: unknown): string => {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) return rawValue;
    return findLeadPresetOption(rawValue)?.id ?? rawValue;
  }, [findLeadPresetOption]);
  const pad1PoolCandidates = useMemo(() => pad1PresetOptions.map(padOptionToPoolCandidate), [pad1PresetOptions]);
  const pad2PoolCandidates = useMemo(() => pad2PresetOptions.map(padOptionToPoolCandidate), [pad2PresetOptions]);
  const leadPoolCandidates = useMemo(() => leadPresetOptions.map(leadOptionToPoolCandidate), [leadPresetOptions]);
  const pad1Pool = usePresetPoolCandidates('engine', 'pad1', pad1PoolCandidates, [
    String(state.padPresetA ?? ''),
    String(state.padPresetB ?? ''),
  ]);
  const pad2Pool = usePresetPoolCandidates('engine', 'pad2', pad2PoolCandidates, [
    String(state.pad2PresetA ?? ''),
    String(state.pad2PresetB ?? ''),
  ]);
  const leadPool = usePresetPoolCandidates('engine', 'lead4opfm', leadPoolCandidates, [
    resolveLeadPresetSelectionId(state.lead1PresetA),
    resolveLeadPresetSelectionId(state.lead1PresetB),
    resolveLeadPresetSelectionId(state.lead2PresetC),
    resolveLeadPresetSelectionId(state.lead2PresetD),
  ]);
  const pad1PooledPresetOptions = useMemo(
    () => filterPadOptionsByPool(pad1PresetOptions, pad1Pool.filteredCandidates),
    [pad1Pool.filteredCandidates, pad1PresetOptions],
  );
  const pad2PooledPresetOptions = useMemo(
    () => filterPadOptionsByPool(pad2PresetOptions, pad2Pool.filteredCandidates),
    [pad2Pool.filteredCandidates, pad2PresetOptions],
  );
  const leadPooledPresetOptions = useMemo(
    () => filterLeadOptionsByPool(leadPresetOptions, leadPool.filteredCandidates),
    [leadPool.filteredCandidates, leadPresetOptions],
  );
  useEffect(() => {
    const selectedPresetLoads = [
      { slotKey: 'lead1PresetA' as const, value: state.lead1PresetA },
      { slotKey: 'lead1PresetB' as const, value: state.lead1PresetB },
      { slotKey: 'lead2PresetC' as const, value: state.lead2PresetC },
      { slotKey: 'lead2PresetD' as const, value: state.lead2PresetD },
    ]
      .map(({ slotKey, value }) => ({
        id: resolveLeadPresetSelectionId(value),
        fallbackId: LEAD_PRESET_SLOT_FALLBACKS[slotKey],
      }))
      .filter(({ id }) => Boolean(id && !leadPresetPreviewCache[id]));
    const missingById = new Map<string, LeadPresetFallbackId>();
    for (const { id, fallbackId } of selectedPresetLoads) {
      if (!missingById.has(id)) missingById.set(id, fallbackId);
    }
    const missingLoads = Array.from(missingById, ([id, fallbackId]) => ({ id, fallbackId }));
    if (missingLoads.length === 0) return;

    let cancelled = false;
    void Promise.all(
      missingLoads.map(async ({ id, fallbackId }) => [
        id,
        await loadLead4opFMPresetVerified(id, fallbackId),
      ] as const),
    )
      .then((loadedPresets) => {
        if (cancelled) return;
        setLeadPresetPreviewCache((previous) => {
          let changed = false;
          const next = { ...previous };
          for (const [id, preset] of loadedPresets) {
            if (next[id]) continue;
            next[id] = preset;
            changed = true;
          }
          return changed ? next : previous;
        });
      })
      .catch((error) => {
        console.warn('Failed to load lead preset ADSR preview:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    leadPresetPreviewCache,
    resolveLeadPresetSelectionId,
    state.lead1PresetA,
    state.lead1PresetB,
    state.lead2PresetC,
    state.lead2PresetD,
  ]);
  const getLeadPreviewMorphedParams = useCallback((leadNum: 1 | 2) => {
    if (liveLeadMorphedParamsAvailable) {
      return getLeadMorphedParams(leadNum);
    }

    const presetAId = resolveLeadPresetSelectionId(leadNum === 2 ? state.lead2PresetC : state.lead1PresetA);
    const presetBId = resolveLeadPresetSelectionId(leadNum === 2 ? state.lead2PresetD : state.lead1PresetB);
    const presetA = leadPresetPreviewCache[presetAId];
    const presetB = leadPresetPreviewCache[presetBId];
    if (!presetA || !presetB) return null;

    return morphPresets(
      presetA,
      presetB,
      leadNum === 2 ? state.lead2Morph ?? 0 : state.lead1Morph ?? 0,
      leadNum === 2 ? state.lead2AlgorithmMode : state.lead1AlgorithmMode,
    );
  }, [
    getLeadMorphedParams,
    leadPresetPreviewCache,
    liveLeadMorphedParamsAvailable,
    resolveLeadPresetSelectionId,
    state.lead1AlgorithmMode,
    state.lead1Morph,
    state.lead1PresetA,
    state.lead1PresetB,
    state.lead2AlgorithmMode,
    state.lead2Morph,
    state.lead2PresetC,
    state.lead2PresetD,
  ]);
  const findLeadPresetSummary = useCallback((option: LeadPresetOption | undefined): PresetSummary | undefined => {
    if (!option) return undefined;
    const optionSourceId = (option.sourceId ?? '').trim().toLowerCase();
    const optionName = (option.sourceName ?? option.name).trim().toLowerCase();
    const optionId = option.id.trim().toLowerCase();
    return leadFmPresets.find((preset) => (
      preset.name.trim().toLowerCase() === optionName
      || preset.name.trim().toLowerCase() === optionId
      || (preset.id ?? '').trim().toLowerCase() === optionSourceId
      || (preset.id ?? '').trim().toLowerCase() === optionId
    ));
  }, [leadFmPresets]);

  useEffect(() => {
    if (!onStateChange) return;

    onStateChange((current) => {
      let changed = false;
      const next = { ...current };
      const leadSlotState = next as unknown as Record<LeadPresetSlotKey, string>;
      const leadSlotKeys: readonly LeadPresetSlotKey[] = ['lead1PresetA', 'lead1PresetB', 'lead2PresetC', 'lead2PresetD'];

      for (const slotKey of leadSlotKeys) {
        const currentId = String(leadSlotState[slotKey] ?? '').trim();
        const resolvedId = resolveLeadPresetSelectionId(currentId);
        if (!resolvedId || resolvedId === currentId) continue;
        leadSlotState[slotKey] = resolvedId;
        changed = true;
      }

      return changed ? next : current;
    });
  }, [onStateChange, resolveLeadPresetSelectionId]);

  const handleLeadPresetRate = useCallback(async (option: LeadPresetOption, rating: number) => {
    const summary = findLeadPresetSummary(option);
    const ratingKey = summary?.name ?? option.sourceName ?? option.name;
    setLeadLocalRatings(prev => ({ ...prev, [ratingKey]: rating }));
    try {
      let targetName = summary?.name ?? option.sourceName;
      if (!targetName) {
        const runtimePreset = await loadLead4opFMPresetVerified(option.id, leadPresetFallbackForPresetId(option.id));
        targetName = await saveUserLead4opFMPreset(option.name, runtimePreset, 'Seeded from lead preset for rating');
        await refreshLeadFmPresets();
      }

      await updateLeadFmPresetMetadata(targetName, { rating });
      if (targetName !== ratingKey) {
        setLeadLocalRatings(prev => ({ ...prev, [targetName]: rating }));
      }
    } catch (ratingError) {
      console.warn('Failed to update lead preset rating:', ratingError);
    }
  }, [findLeadPresetSummary, refreshLeadFmPresets, updateLeadFmPresetMetadata]);

  const applyLeadPresetToSlots = useCallback((slotKeys: readonly LeadPresetSlotKey[], presetId: string) => {
    if (onStateChange) {
      onStateChange((current) => {
        let changed = false;
        const next = { ...current };
        const leadSlotState = next as unknown as Record<LeadPresetSlotKey, string>;
        const touchesLead1 = slotKeys.some((slotKey) => slotKey === 'lead1PresetA' || slotKey === 'lead1PresetB');
        const touchesLead2 = slotKeys.some((slotKey) => slotKey === 'lead2PresetC' || slotKey === 'lead2PresetD');
        slotKeys.forEach((slotKey) => {
          if (leadSlotState[slotKey] === presetId) return;
          leadSlotState[slotKey] = presetId;
          changed = true;
        });
        if (touchesLead1 && next.lead1UseCustomAdsr) {
          next.lead1UseCustomAdsr = false;
          changed = true;
        }
        if (touchesLead2 && next.lead2UseCustomAdsr) {
          next.lead2UseCustomAdsr = false;
          changed = true;
        }
        return changed ? next : current;
      });
      return;
    }

    slotKeys.forEach((slotKey) => {
      onSelectChange(slotKey, presetId as SliderState[typeof slotKey]);
    });
    if (slotKeys.some((slotKey) => slotKey === 'lead1PresetA' || slotKey === 'lead1PresetB')) {
      onSelectChange('lead1UseCustomAdsr' as keyof SliderState, false as SliderState[keyof SliderState]);
    }
    if (slotKeys.some((slotKey) => slotKey === 'lead2PresetC' || slotKey === 'lead2PresetD')) {
      onSelectChange('lead2UseCustomAdsr' as keyof SliderState, false as SliderState[keyof SliderState]);
    }
  }, [onSelectChange, onStateChange]);

  const renderLeadPresetLoader = ({
    selectedPresetId,
    onSelectedPresetIdChange,
    slots,
    color,
  }: {
    selectedPresetId: string;
    onSelectedPresetIdChange: (value: string) => void;
    slots: LeadEditorSlotChoice[];
    color: string;
  }) => {
    const selectedOption = findLeadPresetOption(selectedPresetId);
    const resolvedPresetId = selectedOption?.id ?? selectedPresetId;
    const selectedSummary = findLeadPresetSummary(selectedOption);
    const ratingKey = selectedSummary?.name ?? selectedOption?.sourceName ?? selectedOption?.name ?? selectedPresetId;
    const handleLoaderSelectChange = (value: string) => {
      const nextOption = findLeadPresetOption(value);
      const nextPresetId = nextOption?.id ?? value;
      onSelectedPresetIdChange(nextPresetId);
      applyLeadPresetToSlots(slots.map(slot => slot.slotKey), nextPresetId);
    };

    return (
      <div className="sc-preset-loader">
        <select
          value={resolvedPresetId}
          onChange={(e) => {
            handleLoaderSelectChange(e.target.value);
            blurSelectAfterChange(e.currentTarget);
          }}
          className="sc-preset-loader-select"
          title="Select preset"
        >
          {renderLeadPresetOptions(leadPooledPresetOptions, resolvedPresetId)}
        </select>
        {selectedOption && (
          <PresetRatingStars
            value={leadLocalRatings[ratingKey] ?? selectedSummary?.rating ?? 0}
            onChange={(rating) => { void handleLeadPresetRate(selectedOption, rating); }}
            color={color}
            size="0.6rem"
          />
        )}
        {slots.map((slot) => (
          <button
            key={slot.slotKey}
            className="sc-preset-loader-slot"
            type="button"
            style={{ '--slot-color': slot.accentColor } as React.CSSProperties}
            onClick={() => applyLeadPresetToSlots([slot.slotKey], resolvedPresetId)}
            title={`Load into ${slot.slotLabel}`}
          >
            {slot.slotLabel.replace('Slot ', '')}
          </button>
        ))}
        {slots[0] && (
          <button
            className="sc-preset-loader-slot"
            type="button"
            style={{ '--slot-color': color } as React.CSSProperties}
            onClick={() => setLeadPoolPopupSlot(slots[0]!.slotKey)}
            title="Edit lead preset pool"
            aria-label="Edit lead preset pool"
          >
            {PRESET_POOL_ICON}
          </button>
        )}
      </div>
    );
  };
  const activePadPool = padPoolPopupSlot?.scope === 'pad2' ? pad2Pool : pad1Pool;
  const activePadPoolCandidates = padPoolPopupSlot?.scope === 'pad2' ? pad2PoolCandidates : pad1PoolCandidates;
  const handlePadPoolLoad = useCallback((candidate: PresetPoolCandidate) => {
    if (!padPoolPopupSlot) return;
    const options = padPoolPopupSlot.scope === 'pad2' ? pad2PresetOptions : pad1PresetOptions;
    const option = options.find(candidateOption => candidateMatchesOption(candidate, [candidateOption.id, candidateOption.name]));
    const presetId = option?.id ?? candidate.id;
    handlePresetEndpointSelectChange(padPoolPopupSlot.slotKey, presetId as SliderState[keyof SliderState]);
    setPadPoolPopupSlot(null);
  }, [handlePresetEndpointSelectChange, pad1PresetOptions, pad2PresetOptions, padPoolPopupSlot]);

  const handlePadPoolAudition = useCallback((candidate: PresetPoolCandidate) => {
    if (!padPoolPopupSlot || !onAuditionPresetPreview) return;
    const options = padPoolPopupSlot.scope === 'pad2' ? pad2PresetOptions : pad1PresetOptions;
    const option = options.find(candidateOption => candidateMatchesOption(candidate, [candidateOption.id, candidateOption.name]));
    const presetId = option?.id ?? candidate.id;
    const source: ManualSynthSource = padPoolPopupSlot.scope === 'pad2' ? 'pad2' : 'pad1';
    const previewState = previewStateForPadPoolSlot(state, padPoolPopupSlot.slotKey, presetId);
    void onAuditionPresetPreview({
      source,
      midi: source === 'pad2' ? 62 : 60,
      velocity: 0.82,
      durationMs: 1100,
    }, previewState);
  }, [onAuditionPresetPreview, pad1PresetOptions, pad2PresetOptions, padPoolPopupSlot, state]);

  const handlePadPoolDelete = useCallback((candidate: PresetPoolCandidate) => {
    if (!padPoolPopupSlot) return false;
    const options = padPoolPopupSlot.scope === 'pad2' ? pad2PresetOptions : pad1PresetOptions;
    const option = options.find(candidateOption => candidateMatchesOption(candidate, [candidateOption.id, candidateOption.name]));
    const removePreset = padPoolPopupSlot.scope === 'pad2' ? removePad2Preset : removePad1Preset;
    return removePreset(option?.name ?? candidate.name);
  }, [pad1PresetOptions, pad2PresetOptions, padPoolPopupSlot, removePad1Preset, removePad2Preset]);

  const handlePadPoolRate = useCallback(async (candidate: PresetPoolCandidate, rating: number) => {
    if (!padPoolPopupSlot) return;
    const isPad2 = padPoolPopupSlot.scope === 'pad2';
    const options = isPad2 ? pad2PresetOptions : pad1PresetOptions;
    const option = options.find(candidateOption => candidateMatchesOption(candidate, [candidateOption.id, candidateOption.name]));
    if (!option) return;

    try {
      await ratePadPreset({
        scope: isPad2 ? 'pad2' : 'pad1',
        option,
        rating,
        presets: isPad2 ? pad2EnginePresets : pad1EnginePresets,
        save: isPad2 ? savePad2Preset : savePad1Preset,
        updateMetadata: isPad2 ? updatePad2PresetMetadata : updatePad1PresetMetadata,
      });
    } catch (ratingError) {
      console.warn('Failed to update pad preset rating:', ratingError);
    }
  }, [
    pad1EnginePresets,
    pad1PresetOptions,
    pad2EnginePresets,
    pad2PresetOptions,
    padPoolPopupSlot,
    savePad1Preset,
    savePad2Preset,
    updatePad1PresetMetadata,
    updatePad2PresetMetadata,
  ]);

  const handleLeadPoolLoad = useCallback((candidate: PresetPoolCandidate) => {
    if (!leadPoolPopupSlot) return;
    const option = leadPresetOptions.find(candidateOption => candidateMatchesOption(candidate, [
      candidateOption.id,
      candidateOption.name,
      candidateOption.sourceId,
      candidateOption.sourceName,
    ]));
    const presetId = option?.id ?? candidate.aliases?.[0] ?? candidate.id;
    handlePresetEndpointSelectChange(leadPoolPopupSlot, presetId as SliderState[keyof SliderState]);
    setLeadPoolPopupSlot(null);
  }, [handlePresetEndpointSelectChange, leadPoolPopupSlot, leadPresetOptions]);

  const handleLeadPoolAudition = useCallback((candidate: PresetPoolCandidate) => {
    if (!leadPoolPopupSlot || !onAuditionPresetPreview) return;
    const option = leadPresetOptions.find(candidateOption => candidateMatchesOption(candidate, [
      candidateOption.id,
      candidateOption.name,
      candidateOption.sourceId,
      candidateOption.sourceName,
    ]));
    const presetId = option?.id ?? candidate.aliases?.[0] ?? candidate.id;
    const source = leadManualSourceForSlot(leadPoolPopupSlot);
    const previewState = previewStateForLeadPoolSlot(state, leadPoolPopupSlot, presetId);
    void onAuditionPresetPreview({
      source,
      midi: source === 'lead2' ? 74 : 67,
      velocity: 0.84,
      durationMs: 720,
    }, previewState);
  }, [leadPoolPopupSlot, leadPresetOptions, onAuditionPresetPreview, state]);

  const handleLeadPoolDelete = useCallback((candidate: PresetPoolCandidate) => {
    const option = leadPresetOptions.find(candidateOption => candidateMatchesOption(candidate, [
      candidateOption.id,
      candidateOption.name,
      candidateOption.sourceId,
      candidateOption.sourceName,
    ]));
    return removeLeadFmPreset(option?.sourceName ?? option?.name ?? candidate.name);
  }, [leadPresetOptions, removeLeadFmPreset]);

  const handleLeadPoolRate = useCallback(async (candidate: PresetPoolCandidate, rating: number) => {
    const option = leadPresetOptions.find(candidateOption => candidateMatchesOption(candidate, [
      candidateOption.id,
      candidateOption.name,
      candidateOption.sourceId,
      candidateOption.sourceName,
    ]));
    if (!option) return;
    await handleLeadPresetRate(option, rating);
  }, [handleLeadPresetRate, leadPresetOptions]);
  const activeLeadEditorSlot = leadEditorSlot
    ? leadEditorSlot.slots.find(slot => slot.slotKey === leadEditorSlot.slotKey) ?? leadEditorSlot.slots[0]
    : undefined;
  const activeLeadEditorPresetId = activeLeadEditorSlot ? String(state[activeLeadEditorSlot.slotKey] ?? '').trim() : '';
  const activeLeadEditorOption = activeLeadEditorPresetId ? leadPresetOptionById.get(activeLeadEditorPresetId) : undefined;
  const activeLeadEditorSourceLibrary = activeLeadEditorOption?.sourceLibrary ?? activeLeadEditorOption?.library;
  const activeLeadEditorCanOverwrite = activeLeadEditorSourceLibrary === 'cloud' || activeLeadEditorSourceLibrary === 'user';
  const activeLeadEditorOverwriteLabel = activeLeadEditorSourceLibrary === 'cloud' ? 'Overwrite cloud' : 'Overwrite saved';

  const openLeadPresetEditor = useCallback((
    sourceLabel: string,
    slots: LeadEditorSlotChoice[],
    initialSlotKey: LeadPresetSlotKey,
  ) => {
    setLeadEditorSlot({
      sourceLabel,
      slotKey: initialSlotKey,
      slots,
    });
  }, []);

  const handleLeadEditorApply = useCallback(async (request: Lead4opFMEditorApplyRequest) => {
    if (!leadEditorSlot) return;
    const activeSlot = leadEditorSlot.slots.find(slot => slot.slotKey === leadEditorSlot.slotKey) ?? leadEditorSlot.slots[0];
    if (!activeSlot) return;

    const currentId = String(state[activeSlot.slotKey] ?? '').trim();
    const currentOption = leadPresetOptionById.get(currentId);
    const sourceName = currentOption?.sourceName || currentOption?.name || request.sourceName || request.name.trim() || 'Lead Preset';
    const sourceLibrary = currentOption?.sourceLibrary ?? currentOption?.library;
    const displayName = currentOption?.name || sourceName;
    const runtimeLibrary: 'user' | 'cloud' = sourceLibrary === 'cloud' ? 'cloud' : 'user';

    if (request.mode === 'slot') {
      const runtimeId = `__lead4opfm_editor:${activeSlot.slotKey}:${Date.now().toString(36)}`;
      const runtimePreset: Lead4opFMPreset = {
        ...request.preset,
        id: runtimeId,
        name: displayName,
      };

      upsertUserLead4opFMPreset({
        id: runtimeId,
        name: displayName,
        library: runtimeLibrary,
        preset: runtimePreset,
      });
      setLeadEditorRuntimeOptions((previous) => [
        ...previous.filter(option => option.slotKey !== activeSlot.slotKey),
        {
          id: runtimeId,
          name: displayName,
          library: runtimeLibrary,
          runtime: true,
          slotKey: activeSlot.slotKey,
          sourceName,
          sourceLibrary,
        },
      ]);

      handlePresetEndpointSelectChange(activeSlot.slotKey, runtimeId as SliderState[typeof activeSlot.slotKey]);
      return;
    }

    if (request.mode === 'overwrite') {
      if (sourceLibrary !== 'cloud' && sourceLibrary !== 'user') {
        throw new Error('Only saved Lead4opFM presets can be overwritten');
      }

      const overwritePreset: Lead4opFMPreset = {
        ...request.preset,
        id: sourceName,
        name: sourceName,
      };
      const savedName = await overwriteLead4opFMPreset(sourceName, overwritePreset, 'Updated from lead editor');
      await refreshLeadFmPresets();

      const runtimeId = `__lead4opfm_editor:${activeSlot.slotKey}:overwrite:${Date.now().toString(36)}`;
      const runtimePreset: Lead4opFMPreset = {
        ...overwritePreset,
        id: runtimeId,
        name: savedName,
      };

      upsertUserLead4opFMPreset({
        id: runtimeId,
        name: savedName,
        library: runtimeLibrary,
        preset: runtimePreset,
      });
      setLeadEditorRuntimeOptions((previous) => [
        ...previous.filter(option => option.slotKey !== activeSlot.slotKey),
        {
          id: runtimeId,
          name: savedName,
          library: runtimeLibrary,
          runtime: true,
          slotKey: activeSlot.slotKey,
          sourceName: savedName,
          sourceLibrary,
        },
      ]);

      handlePresetEndpointSelectChange(activeSlot.slotKey, runtimeId as SliderState[typeof activeSlot.slotKey]);
      return;
    }

    const targetName = request.name.trim() || displayName;
    const presetToSave: Lead4opFMPreset = {
      ...request.preset,
      id: targetName,
      name: targetName,
    };
    const savedId = await saveUserLead4opFMPreset(targetName, presetToSave, 'Saved from lead editor copy');
    await refreshLeadFmPresets();

    upsertUserLead4opFMPreset({
      id: savedId,
      name: savedId,
      library: 'user',
      preset: {
        ...presetToSave,
        id: savedId,
        name: savedId,
      },
    });

    handlePresetEndpointSelectChange(activeSlot.slotKey, savedId as SliderState[typeof activeSlot.slotKey]);
  }, [
    leadEditorSlot,
    leadPresetOptionById,
    handlePresetEndpointSelectChange,
    refreshLeadFmPresets,
    state,
  ]);

  const renderPadPresetOptions = useCallback((options: PadPresetOption[]) => {
    const sorted = [...options].sort((left, right) => left.name.localeCompare(right.name));

    return (
      <>
        {sorted.map((option) => (
          <option key={`${option.library}:${option.id}`} value={option.id}>{option.name}</option>
        ))}
      </>
    );
  }, []);

  const renderLeadPresetOptions = useCallback((options: LeadPresetOption[], selectedId?: string) => {
    const sorted = [...options].sort((left, right) => left.name.localeCompare(right.name));
    const selectedPresetId = selectedId?.trim();
    const selectedExists = selectedPresetId
      ? sorted.some((option) => option.id === selectedPresetId)
      : true;

    return (
      <>
        {selectedPresetId && !selectedExists && (
          <option value={selectedPresetId}>{selectedPresetId}</option>
        )}
        {sorted.map((option) => (
          <option
            key={`${option.library}:${option.id}`}
            value={option.id}
            hidden={option.runtime && option.id !== selectedPresetId}
          >
            {option.name}
          </option>
        ))}
      </>
    );
  }, []);

  const handlePadSlotSave = useCallback(async (
    scope: 'pad1' | 'pad2',
    slotKey: 'padPresetA' | 'padPresetB' | 'pad2PresetA' | 'pad2PresetB',
  ) => {
    const currentId = String(state[slotKey] ?? '').trim();
    const optionMap = scope === 'pad1' ? pad1OptionById : pad2OptionById;
    const currentOption = optionMap.get(currentId);
    const savePreset = scope === 'pad1' ? savePad1Preset : savePad2Preset;
    const loadPreset = scope === 'pad1' ? loadPad1Preset : loadPad2Preset;
    const refreshPresetList = scope === 'pad1' ? refreshPad1Presets : refreshPad2Presets;
    const defaultName = currentOption?.name || `${scope === 'pad1' ? 'Pad 1' : 'Pad 2'} Preset`;

    let targetName = defaultName;
    if (!currentOption) {
      if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
      const requestedName = window.prompt(
        `Name this ${scope === 'pad1' ? 'Pad 1' : 'Pad 2'} preset`,
        defaultName,
      );
      if (!requestedName?.trim()) return;
      targetName = requestedName.trim();
    }

    await savePreset(
      targetName,
      state,
      currentOption ? 'Updated from pad slot' : 'Saved from pad slot',
    );
    await refreshPresetList();

    const savedEntry = await loadPreset(targetName);
    if (!savedEntry) return;
    const version = savedEntry.versions.find(v => v.v === savedEntry.currentVersion)
      || savedEntry.versions[savedEntry.versions.length - 1];
    if (!version) return;

    const savedId = getFactoryPadPresetIdByName(savedEntry.name) ?? savedEntry.id ?? savedEntry.name;
    upsertUserPadPreset(scope, {
      id: savedId,
      name: savedEntry.name,
      library: savedEntry.library === 'cloud' ? 'cloud' : 'user',
      preset: createRuntimePadPreset(scope, savedEntry.name, version.data),
    });

    if (String(state[slotKey] ?? '') !== savedId) {
      handlePresetEndpointSelectChange(slotKey, savedId as SliderState[keyof SliderState]);
    }
  }, [
    loadPad1Preset,
    loadPad2Preset,
    handlePresetEndpointSelectChange,
    pad1OptionById,
    pad2OptionById,
    refreshPad1Presets,
    refreshPad2Presets,
    savePad1Preset,
    savePad2Preset,
    state,
  ]);
  void handlePadSlotSave;

  const handleLeadSlotSave = useCallback(async (
    slotKey: 'lead1PresetA' | 'lead1PresetB' | 'lead2PresetC' | 'lead2PresetD',
    fallbackName: string,
  ) => {
    const currentId = String(state[slotKey] ?? '').trim();
    const currentOption = findLeadPresetOption(currentId);
    const defaultName = currentOption?.name || fallbackName;

    let targetName = defaultName;
    if (!currentOption) {
      if (typeof window === 'undefined' || typeof window.prompt !== 'function') return;
      const requestedName = window.prompt(
        `Name this ${fallbackName} preset`,
        defaultName,
      );
      if (!requestedName?.trim()) return;
      targetName = requestedName.trim();
    }

    const currentPreset = await loadLead4opFMPresetVerified(currentId, LEAD_PRESET_SLOT_FALLBACKS[slotKey]);
    await saveUserLead4opFMPreset(
      targetName,
      currentPreset,
      currentOption ? 'Updated from lead slot' : 'Saved from lead slot',
    );
    const runtimeId = resolveLeadPresetRuntimeId(targetName);
    await refreshLeadFmPresets();

    upsertUserLead4opFMPreset({
      id: runtimeId,
      name: targetName,
      library: 'user',
      preset: {
        ...currentPreset,
        id: runtimeId,
        name: targetName,
      },
    });

    if (String(state[slotKey] ?? '') !== runtimeId) {
      handlePresetEndpointSelectChange(slotKey, runtimeId as SliderState[typeof slotKey]);
    }
  }, [findLeadPresetOption, handlePresetEndpointSelectChange, refreshLeadFmPresets, resolveLeadPresetRuntimeId, state]);
  void handleLeadSlotSave;

  // ── Euclidean Sequencer Hook (reuses same hook as DrumPage) ──
  const seq = useEuclideanSequencer({
    state,
    onParamChange,
    onSelectChange,
    prefix: 'synth',
    laneCount: 4,
    lanes: LANE_CONFIGS,
    playheads,
    hitCounts,
    evolveFlashing,
    initialViewMode,
    initialStepOverrides,
    initialSubLaneStates,
    initialClockDivs,
    initialSwings,
    initialLinked,
    initialPitchSettings,
    defaultPitchSettings: SYNTH_DEFAULT_PITCH_SETTINGS,
    initialEvolveConfigs,
    resetKey: presetVersion,
  });

  const sequencerFaceState = useMemo(
    () => normalizeSynthSequencerFaceState(state.synthSequencerFaces),
    [state.synthSequencerFaces],
  );
  const activeSequencerSlot = sequencerFaceState.slots[seq.activeTab] ?? sequencerFaceState.slots[0];
  const activeSequencerMode = activeSequencerSlot?.mode ?? 'euclid';
  const orbitRuntimeVisualsVisible = seq.viewMode === 'detail' && activeSequencerMode === 'orbit';
  const anchorWalkerRuntimeVisualsVisible = seq.viewMode === 'detail' && activeSequencerMode === 'anchorWalker';

  useEffect(() => {
    if (!orbitRuntimeVisualsVisible) {
      setOrbitVisualStateCallback(null);
      setOrbitVisualStates(prev => (prev.some(Boolean) ? [null, null, null, null] : prev));
      return () => {
        setOrbitVisualStateCallback(null);
      };
    }
    let rafId: number | null = null;
    let pendingStates: Array<ProductSynthOrbitVisualLaneState | null> = [null, null, null, null];
    setOrbitVisualStateCallback((nextStates: Array<ProductSynthOrbitVisualLaneState | null>) => {
      if (document.visibilityState !== 'visible') return;
      pendingStates = [0, 1, 2, 3].map((index) => nextStates[index] ?? null);
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setOrbitVisualStates(pendingStates);
      });
    });
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      setOrbitVisualStateCallback(null);
    };
  }, [orbitRuntimeVisualsVisible, setOrbitVisualStateCallback]);

  useEffect(() => {
    if (!anchorWalkerRuntimeVisualsVisible) {
      setAnchorWalkerVisualStateCallback(null);
      setWalkerVisualStates(prev => (prev.some(Boolean) ? [null, null, null, null] : prev));
      return () => {
        setAnchorWalkerVisualStateCallback(null);
      };
    }
    let rafId: number | null = null;
    let pendingStates: Array<ProductSynthAnchorWalkerVisualLaneState | null> = [null, null, null, null];
    setAnchorWalkerVisualStateCallback((nextStates: Array<ProductSynthAnchorWalkerVisualLaneState | null>) => {
      if (document.visibilityState !== 'visible') return;
      pendingStates = [0, 1, 2, 3].map((index) => nextStates[index] ?? null);
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        setWalkerVisualStates(pendingStates);
      });
    });
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      setAnchorWalkerVisualStateCallback(null);
    };
  }, [anchorWalkerRuntimeVisualsVisible, setAnchorWalkerVisualStateCallback]);

  const synthChainRuntimeState = useMemo(
    () => createSequencerChainUiRuntimeState('synth', state as unknown as Record<string, unknown>, seq.clockDivs),
    [state, seq.clockDivs],
  );
  const synthChainPosition = useSequencerChainUiPosition({
    kind: 'synth',
    state: synthChainRuntimeState,
    chain: state.synthSequencerChain,
    running: isRunning,
  });
  const setSynthSequencerChain = useCallback(
    (chain: SliderState['synthSequencerChain']) => {
      onSelectChange('synthSequencerChain', chain);
    },
    [onSelectChange],
  );

  const [arpConfigs, setArpConfigs] = useState<ProductPlayConfig[]>(() => normalizeProductPlayConfigs(initialArpConfigs, 4));
  const [arpRuntimeTick, setArpRuntimeTick] = useState(0);
  const [arpUiPlayheads, setArpUiPlayheads] = useState<number[]>(() => [0, 0, 0, 0]);
  const [selectedArpSteps, setSelectedArpSteps] = useState<number[]>(() => [0, 0, 0, 0]);
  const arpHarmonyState = state as unknown as Record<string, unknown>;
  const arpHarmonyInputs = useMemo(() => ({
    rootMidi: arpHarmonyState.rootMidi,
    rootNote: arpHarmonyState.rootNote,
    tension: arpHarmonyState.tension,
    manualScale: arpHarmonyState.manualScale,
    scaleMode: arpHarmonyState.scaleMode,
    seedWindow: arpHarmonyState.seedWindow,
    rngSeed: arpHarmonyState.rngSeed,
    seed: arpHarmonyState.seed,
    journeyMorphPhase: arpHarmonyState.journeyMorphPhase,
  }), [
    arpHarmonyState.rootMidi,
    arpHarmonyState.rootNote,
    arpHarmonyState.tension,
    arpHarmonyState.manualScale,
    arpHarmonyState.scaleMode,
    arpHarmonyState.seedWindow,
    arpHarmonyState.rngSeed,
    arpHarmonyState.seed,
    arpHarmonyState.journeyMorphPhase,
  ]);
  const arpHarmonyContext = useMemo(() => createProductArpHarmonyContext(
    arpHarmonyInputs,
    harmonyState,
  ), [arpHarmonyInputs, harmonyState]);
  const activePlayConfig = arpConfigs[seq.activeTab] ?? defaultProductPlayConfig();
  const activeArpConfig = activePlayConfig.arp;
  const activeArpPitchAnchor = arpPitchAnchorMidi(
    seq.subLaneStates[seq.activeTab]?.pitch?.enabled,
    seq.stepOverrides.pitch[seq.activeTab],
    seq.pitchSettings[seq.activeTab],
    harmonyState,
    state[`synthEuclid${seq.activeTab + 1}NoteMin` as keyof SliderState],
  );
  const activeArpResolvedSteps = useMemo(() => resolveProductArpPatternDetails({
    config: { ...activeArpConfig, enabled: true },
    harmony: arpHarmonyContext,
    laneIndex: seq.activeTab,
    runtimeTick: arpRuntimeTick,
    anchorMidi: activeArpPitchAnchor,
  }) ?? [], [activeArpConfig, activeArpPitchAnchor, arpHarmonyContext, arpRuntimeTick, seq.activeTab]);
  const activeChordResolvedSteps = useMemo(() => resolveProductChordPlayPatternDetails({
    config: activePlayConfig.chord,
    harmony: arpHarmonyContext,
  }), [activePlayConfig.chord, arpHarmonyContext]);
  const updatePlayConfig = useCallback((laneIdx: number, patch: Partial<ProductPlayConfig>) => {
    setArpConfigs((current) => current.map((config, index) => (
      index === laneIdx ? normalizeProductPlayConfig({ ...config, ...patch }) : config
    )));
  }, []);
  const updateArpConfig = useCallback((laneIdx: number, patch: Partial<ProductArpConfig>) => {
    setArpConfigs((current) => current.map((config, index) => {
      if (index !== laneIdx) return config;
      const arp = config.arp;
      const nextPatch: Partial<ProductArpConfig> = { ...patch };
      if (typeof patch.length === 'number' && Number.isFinite(patch.length)) {
        const oldLength = clampArpLengthValue(arp.length);
        const nextLength = clampArpLengthValue(patch.length);
        const sourcePulseMask = typeof patch.pulseMask === 'number' ? patch.pulseMask : arp.pulseMask;
        nextPatch.length = nextLength;
        nextPatch.pulseMask = armNewArpLengthSteps(sourcePulseMask, oldLength, nextLength);
      }
      const nextArp = normalizeProductArpConfig({ ...arp, ...nextPatch });
      return normalizeProductPlayConfig({
        ...config,
        enabled: typeof patch.enabled === 'boolean' ? patch.enabled : config.enabled,
        arp: nextArp,
      });
    }));
  }, []);
  const setArpContour = useCallback((laneIdx: number, step: number, value: number) => {
    setArpConfigs((current) => current.map((config, index) => {
      if (index !== laneIdx) return config;
      const contour = [...config.arp.contour];
      contour[step] = clampArpContourValue(value);
      return normalizeProductPlayConfig({ ...config, arp: { ...config.arp, contour } });
    }));
  }, []);
  const setArpSlotChoice = useCallback((laneIdx: number, step: number, value: ProductArpSlotChoice) => {
    setArpConfigs((current) => current.map((config, index) => {
      if (index !== laneIdx) return config;
      const slotLane = [...config.arp.slotLane];
      slotLane[step] = value;
      return normalizeProductPlayConfig({ ...config, arp: { ...config.arp, slotLane } });
    }));
  }, []);
  const toggleArpPulse = useCallback((laneIdx: number, step: number) => {
    setArpConfigs((current) => current.map((config, index) => (
      index === laneIdx
        ? normalizeProductPlayConfig({ ...config, arp: { ...config.arp, pulseMask: config.arp.pulseMask ^ (1 << step) } })
        : config
    )));
  }, []);
  const toggleArpReset = useCallback((laneIdx: number, step: number) => {
    setArpConfigs((current) => current.map((config, index) => (
      index === laneIdx
        ? normalizeProductPlayConfig({ ...config, arp: { ...config.arp, resetMask: config.arp.resetMask ^ (1 << step) } })
        : config
    )));
  }, []);
  const applyArpContourPreset = useCallback((laneIdx: number, preset: ArpContourPreset) => {
    setArpConfigs((current) => current.map((config, index) => (
      index === laneIdx
        ? normalizeProductPlayConfig({ ...config, arp: { ...config.arp, contour: arpContourPresetValues(preset) } })
        : config
    )));
  }, []);
  const mutateArpContour = useCallback((laneIdx: number) => {
    setArpConfigs((current) => current.map((config, index) => (
      index === laneIdx
        ? normalizeProductPlayConfig({ ...config, arp: { ...config.arp, contour: mutateArpContourValues(config.arp.contour) } })
        : config
    )));
  }, []);
  const updateChordPlayConfig = useCallback((laneIdx: number, patch: Partial<ProductChordPlayConfig>) => {
    setArpConfigs((current) => current.map((config, index) => {
      if (index !== laneIdx) return config;
      const nextPatch: Partial<ProductChordPlayConfig> = { ...patch };
      if (typeof patch.length === 'number' && Number.isFinite(patch.length)) {
        const oldLength = clampArpLengthValue(config.chord.length);
        const nextLength = clampArpLengthValue(patch.length);
        nextPatch.length = nextLength;
        nextPatch.steps = armNewChordLengthSteps(patch.steps ?? config.chord.steps, oldLength, nextLength);
      }
      return normalizeProductPlayConfig({ ...config, chord: { ...config.chord, ...nextPatch } });
    }));
  }, []);
  const commitChordPlaySlotMidiPool = useCallback((slotId: number, midiNotes: readonly number[]) => {
    if (!onStateChange) return;
    const nextMidiPool = normalizeChordMidiPool(midiNotes).slice(0, HARMONY_POOL_MAX_NOTES);
    if (nextMidiPool.length === 0) return;
    onStateChange((previous) => {
      const record = previous as unknown as Record<string, unknown>;
      const morphContext = resolvePresetMorphContext({
        state: record,
        morphPercent: synthHarmonyMorphPercent(previous),
      });
      if (!morphContext.manualControlAvailable) return previous;
      const bank = morphContext.bank;
      const slots = sanitizeHarmonyChordSlots(
        bank === 'B'
          ? record.harmonyChordSlotsB ?? record.harmonyChordSlots
          : record.harmonyChordSlotsA ?? record.harmonyChordSlots,
      );
      const slot = slots[slotId];
      if (!slot || slot.locked) return previous;
      const recognizedIntent = recognizeHarmonyIntentFromMidiPool({
        midiNotes: nextMidiPool,
        previousIntent: { ...slot.intent, source: 'slot' },
        rootMidi: arpHarmonyContext.rootMidi,
        scaleId: arpHarmonyContext.scaleId,
        tension: arpHarmonyContext.tension,
      });
      const nextSlots = slots.map((entry) => entry.id === slotId
        ? { ...entry, intent: { ...recognizedIntent, source: 'slot' }, name: entry.name || `Slot ${slotId + 1}` }
        : entry);
      const keys = harmonyBankKeys(bank);
      const patch: Record<string, unknown> = {
        ...record,
        [keys.slots]: nextSlots,
      };
      if (shouldMirrorHarmonyBaseBank(record, bank)) patch.harmonyChordSlots = nextSlots;
      return patch as unknown as SliderState;
    });
  }, [arpHarmonyContext.rootMidi, arpHarmonyContext.scaleId, arpHarmonyContext.tension, onStateChange]);
  const selectArpStep = useCallback((laneIdx: number, step: number) => {
    setSelectedArpSteps((current) => {
      const next = [...current];
      next[laneIdx] = Math.max(0, Math.min(15, Math.round(step)));
      return next;
    });
  }, []);

  useEffect(() => {
    setArpConfigs(normalizeProductPlayConfigs(initialArpConfigs, 4));
  }, [initialArpConfigs, presetVersion]);

  const arpConfigsRef = useRef<ProductPlayConfig[] | null>(null);
  useEffect(() => {
    if (arpConfigsRef.current !== arpConfigs) {
      arpConfigsRef.current = arpConfigs;
      onArpConfigsChange?.(arpConfigs);
    }
  }, [arpConfigs, onArpConfigsChange]);

  useEffect(() => {
    if (!isRunning || !arpConfigs.some((config) => config.enabled && config.mode === 'arp' && config.arp.flow === 'randomLiveTone')) return;
    const intervalId = window.setInterval(() => setArpRuntimeTick((tick) => tick + 1), 250);
    return () => window.clearInterval(intervalId);
  }, [arpConfigs, isRunning]);

  const synthEuclideanPatternOptions = React.useMemo<UsePresetsOptions[]>(() => LANE_CONFIGS.map((_, laneIdx) => ({
    customExtract: (currentState) => {
      const stepOverrides = serializeStepOverrides(copySequenceLaneForPreset(seq.stepOverrides, laneIdx));
      const sequenceState = copySequenceLaneStateForPreset({
        laneIdx,
        subLaneStates: seq.subLaneStates,
        clockDivs: seq.clockDivs,
        swings: seq.swings,
        linked: seq.linked,
        evolveConfigs: seq.evolveConfigs,
        pitchSettings: seq.pitchSettings,
        pitchBindingModes,
      });
      const playConfig = arpConfigs[laneIdx];
      return {
        ...extractEuclideanPatternLaneDataFromSynthState(currentState, laneIdx),
        ...(stepOverrides ? { [EUCLIDEAN_PATTERN_STEP_OVERRIDES_KEY]: stepOverrides } : {}),
        [EUCLIDEAN_PATTERN_SEQUENCE_STATE_KEY]: { ...sequenceState, playConfig },
      };
    },
    customApply: (currentState, data) => applyEuclideanPatternToSynthLaneState(currentState, data, laneIdx),
  })), [
    pitchBindingModes,
    arpConfigs,
    seq.clockDivs,
    seq.evolveConfigs,
    seq.linked,
    seq.pitchSettings,
    seq.stepOverrides,
    seq.subLaneStates,
    seq.swings,
  ]);

  const pendingSequenceHomeCaptureRef = useRef<number | null>(null);
  const pendingSequenceResetHomeRef = useRef<number | null>(null);
  const sequenceSubLaneHomeRef = useRef<(Record<SubLaneKind, SubLaneState> | null)[]>([null, null, null, null]);
  const sequencePitchHomeRef = useRef<(SubLaneState | null)[]>([null, null, null, null]);
  const sequencePitchBindingHomeRef = useRef<(PitchBindingMode | null)[]>([null, null, null, null]);
  const [sequenceHomeCaptureVersion, setSequenceHomeCaptureVersion] = useState(0);
  const handleEuclidSequenceLoad = useCallback((laneIdx: number, entry: PresetEntry, data: Record<string, unknown>) => {
    setEuclidPresetNameForLane(laneIdx, entry.name);
    const stepOverrides = data[EUCLIDEAN_PATTERN_STEP_OVERRIDES_KEY] as SerializedStepOverrides | undefined;
    const sequenceState = data[EUCLIDEAN_PATTERN_SEQUENCE_STATE_KEY] as SerializedSequenceLanePresetState | undefined;
    const playConfig = (sequenceState as SerializedSequenceLanePresetState & { playConfig?: ProductPlayConfig; arpConfig?: ProductArpConfig } | undefined)?.playConfig
      ?? (sequenceState as SerializedSequenceLanePresetState & { arpConfig?: ProductArpConfig } | undefined)?.arpConfig;
    seq.setStepOverrides((current) => applySequencePresetOverrides(current, stepOverrides ?? {}, laneIdx));
    seq.setSubLaneStates((current) => {
      const next = applySequencePresetSubLaneStates(current, sequenceState, laneIdx, stepOverrides);
      sequenceSubLaneHomeRef.current[laneIdx] = next[laneIdx] ?? null;
      sequencePitchHomeRef.current[laneIdx] = next[laneIdx]?.pitch ?? null;
      return next;
    });
    seq.setClockDivs((current) => applySequencePresetClockDivs(current, sequenceState, laneIdx));
    seq.setSwings((current) => applySequencePresetSwings(current, sequenceState, laneIdx));
    seq.setLinked((current) => applySequencePresetLinked(current, sequenceState, laneIdx));
    seq.setEvolveConfigs((current) => applySequencePresetEvolveConfigs(current, sequenceState, laneIdx, 'synth'));
    seq.setPitchSettings((current) => applySequencePresetPitchSettings(current, sequenceState, laneIdx));
    if (playConfig) {
      setArpConfigs((current) => current.map((config, index) => (
        index === laneIdx ? normalizeProductPlayConfig(playConfig) : config
      )));
    }
    setPitchBindingModes((current) => {
      const next = applySequencePresetPitchBindingModes(current, sequenceState, laneIdx);
      sequencePitchBindingHomeRef.current[laneIdx] = next[laneIdx] ?? null;
      return next;
    });
    pendingSequenceHomeCaptureRef.current = laneIdx;
    setSequenceHomeCaptureVersion((version) => version + 1);
  }, [seq, setEuclidPresetNameForLane]);

  const renderSequencePresetControl = useCallback((laneIdx: number) => (
    <div className="seq-sequence-preset-control" onClick={(e) => e.stopPropagation()}>
      <span className="seq-sequence-preset-label">Sequence</span>
      <PresetDropdown
        key={`synth-sequence-${laneIdx}`}
        level="engine"
        scope="euclideanPattern"
        state={state}
        currentName={euclidPresetNames[laneIdx]}
        onLoad={(entry: PresetEntry, data: Record<string, unknown>) => handleEuclidSequenceLoad(laneIdx, entry, data)}
        onStateChange={onStateChange}
        presetOptions={synthEuclideanPatternOptions[laneIdx]}
        showSaveButton
        saveButtonLabel="Save Sequence"
        saveDialogTitle="Save Sequence"
        defaultSaveName={`${LANE_CONFIGS[laneIdx]?.name ?? `Seq ${laneIdx + 1}`} Sequence`}
        showFileButtons={false}
        compact
        className="seq-sequence-preset-dropdown"
      />
    </div>
  ), [euclidPresetNames, handleEuclidSequenceLoad, onStateChange, state, synthEuclideanPatternOptions]);

  const handleResetEvolveHome = useCallback((laneIdx: number) => {
    pendingSequenceResetHomeRef.current = laneIdx;
    resetEvolveHome?.(laneIdx);
  }, [resetEvolveHome]);
  const handleDiceLane = useCallback((laneIdx: number, intensity: number) => {
    const index = Math.max(0, Math.min(LANE_CONFIGS.length - 1, Math.trunc(laneIdx)));
    pendingDiceSyncUntilRef.current[index] = Date.now() + SYNTH_DICE_SYNC_SUPPRESSION_MS;
    pendingDiceExpectedSignatureRef.current[index] = null;
    diceLane?.(laneIdx, intensity);
  }, [diceLane]);

  const previousPresetVersionRef = useRef(presetVersion);
  useEffect(() => {
    if (presetVersion === undefined || presetVersion === previousPresetVersionRef.current) return;
    previousPresetVersionRef.current = presetVersion;
    setPitchBindingModes(normalizeSequencerPitchBindingModes(initialPitchBindingModes, SYNTH_EUCLIDEAN_LANE_COUNT));
    setTriggerKeyboardSteps(normalizeKeyboardStepArray());
    setPitchKeyboardSteps(normalizeKeyboardStepArray());
    setExpressionKeyboardSteps(normalizeKeyboardStepArray());
    setMorphKeyboardSteps(normalizeKeyboardStepArray());
    setDistanceKeyboardSteps(normalizeKeyboardStepArray());
    setNudgeKeyboardSteps(normalizeKeyboardStepArray());
    setKeyboardSequenceCursorTarget('pitch');
  }, [initialPitchBindingModes, presetVersion]);

  const setSynthPitchMode = useCallback((laneIdx: number, mode: PitchSettings['mode']) => {
    const currentSettings = seq.pitchSettings[laneIdx] ?? SYNTH_DEFAULT_PITCH_SETTINGS;
    if (currentSettings.mode !== mode) {
      seq.setStepOverrides((previous) => ({
        ...previous,
        pitch: previous.pitch.map((values, index) => (
          index === laneIdx && values
            ? convertSynthPitchValuesForMode(values, currentSettings, mode, harmonyState)
            : values
        )),
      }));
    }
    seq.setPitchSettings((previous) => previous.map((settings, index) => (
      index === laneIdx ? { ...settings, mode } : settings
    )));
  }, [harmonyState, seq]);

  const setPitchBindingMode = useCallback((laneIdx: number, mode: PitchBindingMode) => {
    setPitchBindingModes((prev) => prev.map((current, index) =>
      index === laneIdx ? normalizeSequencerPitchBindingMode(mode, current) : current
    ));
    if (mode === 'sequence' && seq.pitchSettings[laneIdx]?.mode === 'noteRange') {
      setSynthPitchMode(laneIdx, 'semitones');
    }
  }, [seq.pitchSettings, setSynthPitchMode]);

  const setSharedSequencerBpm = useCallback((bpm: number) => {
    onParamChange('sequencerMasterBPM' as keyof SliderState, bpm);
  }, [onParamChange]);

  // Notify parent when viewMode changes
  useEffect(() => {
    onViewModeChange?.(seq.viewMode);
  }, [seq.viewMode, onViewModeChange]);

  useEffect(() => () => {
    onSimpleVisualizerRuntimePlanVisibilityChange?.({ padChord: false, randomTiming: false });
  }, [onSimpleVisualizerRuntimePlanVisibilityChange]);

  useEffect(() => {
    onSimpleVisualizerRuntimePlanVisibilityChange?.({
      padChord: seq.viewMode === 'simple' && simpleChordPhraseVizToggle.enabled,
      randomTiming: seq.viewMode === 'simple' && simpleRandomTimingVizToggle.enabled,
    });
  }, [
    onSimpleVisualizerRuntimePlanVisibilityChange,
    seq.viewMode,
    simpleChordPhraseVizToggle.enabled,
    simpleRandomTimingVizToggle.enabled,
  ]);

  // Sync evolve configs to audio engine
  const evolveConfigsRef = useRef(seq.evolveConfigs);
  useEffect(() => {
    if (evolveConfigsRef.current !== seq.evolveConfigs) {
      evolveConfigsRef.current = seq.evolveConfigs;
      onEvolveConfigsChange?.(seq.evolveConfigs);
    }
  }, [seq.evolveConfigs, onEvolveConfigsChange]);

  const pitchBindingModesRef = useRef(pitchBindingModes);
  useEffect(() => {
    if (pitchBindingModesRef.current !== pitchBindingModes) {
      pitchBindingModesRef.current = pitchBindingModes;
      onPitchBindingModesChange?.(pitchBindingModes);
    }
  }, [onPitchBindingModesChange, pitchBindingModes]);

  useEffect(() => {
    onKeyboardUiStateChange?.({
      open: showKeyboard,
      inputMode: keyboardInputMode,
      source: keyboardSource,
      octave: keyboardOctave,
      sequenceSteps: triggerKeyboardSteps,
      triggerSteps: triggerKeyboardSteps,
      pitchSteps: pitchKeyboardSteps,
      sequenceCursorTarget: keyboardSequenceCursorTarget,
    });
  }, [
    keyboardInputMode,
    keyboardOctave,
    keyboardSequenceCursorTarget,
    keyboardSource,
    onKeyboardUiStateChange,
    pitchKeyboardSteps,
    showKeyboard,
    triggerKeyboardSteps,
  ]);

  useEffect(() => {
    pitchBindingModes.forEach((mode, laneIdx) => {
      const pitchState = seq.subLaneStates[laneIdx]?.pitch;
      const seqModel = seq.sequencerModels[laneIdx];
      if (!pitchState || !seqModel) return;
      const activeHits = seqModel.trigger.pattern.filter(Boolean).length;
      const targetSteps = mode === 'sequence'
        ? seqModel.trigger.steps
        : mode === 'linked'
          ? Math.max(1, activeHits)
          : null;
      if (targetSteps != null && pitchState.steps !== targetSteps) {
        seq.setSubLaneSteps(laneIdx, 'pitch', targetSteps);
      }
    });
  }, [pitchBindingModes, seq.sequencerModels, seq.setSubLaneSteps, seq.subLaneStates]);

  const morphSubLaneRuntimeOwnersRef = useRef<Array<{ enabled: boolean; key: RuntimeMorphValueKey | null }> | null>(null);
  useEffect(() => {
    const currentOwners = seq.subLaneStates.map((laneState, laneIndex) => ({
      enabled: laneState.morph.enabled === true,
      key: runtimeMorphKeyForLaneSource(
        state[SYNTH_LANE_SOURCE_KEYS[laneIndex] ?? SYNTH_LANE_SOURCE_KEYS[0]],
        state.pad2VoiceAssign,
      ),
    }));
    const previousOwners = morphSubLaneRuntimeOwnersRef.current;
    if (previousOwners) {
      const activeKeys = new Set(
        currentOwners
          .filter((owner): owner is { enabled: true; key: RuntimeMorphValueKey } => owner.enabled && owner.key !== null)
          .map((owner) => owner.key),
      );
      const keysToClear = new Set<RuntimeMorphValueKey>();
      previousOwners.forEach((owner, laneIndex) => {
        if (!owner.enabled || owner.key === null) return;
        const nextOwner = currentOwners[laneIndex];
        if (!nextOwner?.enabled || nextOwner.key !== owner.key) keysToClear.add(owner.key);
      });
      activeKeys.forEach((key) => keysToClear.delete(key));
      if (keysToClear.size > 0) removeRuntimeValues(keysToClear);
    }
    morphSubLaneRuntimeOwnersRef.current = currentOwners;
  }, [
    seq.subLaneStates,
    state.pad2VoiceAssign,
    state.synthEuclid1Source,
    state.synthEuclid2Source,
    state.synthEuclid3Source,
    state.synthEuclid4Source,
  ]);

  // Merge evolved overrides from audio engine into visualizer state
  const evolvedVersionRef = useRef(-1);
  useEffect(() => {
    if (!evolvedOverrides || evolvedOverrides.version === evolvedVersionRef.current) return;
    evolvedVersionRef.current = evolvedOverrides.version;
    const { laneIndex, data, swing, subLaneStates } = evolvedOverrides;
    const restoredPitchSettings = data.pitchSettings?.[laneIndex]
      ? normalizeSequencerPitchSettings(data.pitchSettings[laneIndex], seq.pitchSettings[laneIndex]) as PitchSettings
      : null;
    const restoreSequenceHome = pendingSequenceResetHomeRef.current === laneIndex;
    if (restoreSequenceHome) pendingSequenceResetHomeRef.current = null;
    const sequenceHome = restoreSequenceHome ? sequenceSubLaneHomeRef.current[laneIndex] : null;
    const pitchHomeState = sequenceHome?.pitch ?? (restoredPitchSettings ? sequencePitchHomeRef.current[laneIndex] : null);
    const effectiveSubLaneStates = sequenceHome
      ? Object.fromEntries(Object.entries(sequenceHome).map(([key, value]) => [
          key,
          { ...((subLaneStates as Partial<Record<SubLaneKind, Partial<SubLaneState>>> | undefined)?.[key as SubLaneKind] ?? {}), ...value },
        ])) as Partial<Record<SubLaneKind, Partial<SubLaneState>>>
      : pitchHomeState
      ? { ...(subLaneStates ?? {}), pitch: { ...pitchHomeState, ...(subLaneStates?.pitch ?? {}) } }
      : subLaneStates;
    if (restoredPitchSettings) {
      seq.setPitchSettings(prev => prev.map((settings, index) => (index === laneIndex ? restoredPitchSettings : settings)));
    }
    const restoredBindingMode = (restoreSequenceHome || restoredPitchSettings) ? sequencePitchBindingHomeRef.current[laneIndex] : null;
    if (restoredBindingMode) setPitchBindingModes(prev => prev.map((mode, index) => (index === laneIndex ? restoredBindingMode : mode)));
    if (typeof swing === 'number' && Number.isFinite(swing)) {
      seq.setSwings(prev => prev.map((value, index) => (index === laneIndex ? swing : value)));
    }
    if (effectiveSubLaneStates && typeof effectiveSubLaneStates === 'object') {
      seq.setSubLaneStates(prev => prev.map((laneState, index) => (
        index === laneIndex
          ? {
              ...laneState,
              ...Object.fromEntries(Object.entries(effectiveSubLaneStates).map(([key, patch]) => [
                key,
                { ...laneState[key as SubLaneKind], ...(patch ?? {}) },
              ])) as Record<SubLaneKind, SubLaneState>,
            }
          : laneState
      )));
    }
    if (data.manualDiceHome === true) {
      const expected = applyEvolvedStepOverridePatch(seq.stepOverrides, laneIndex, data);
      pendingDiceExpectedSignatureRef.current[laneIndex] = stepOverrideLaneSignature(expected, laneIndex);
      pendingDiceSyncUntilRef.current[laneIndex] = Date.now() + SYNTH_DICE_SYNC_SUPPRESSION_MS;
    }
    seq.setStepOverrides(prev => applyEvolvedStepOverridePatch(prev, laneIndex, data));
    seq.setSubLaneStates(prev => prev.map((laneState, index) => {
      if (index !== laneIndex) return laneState;
      const nextLane = { ...laneState };
      const lengthFields = {
        expression: effectiveSubLaneStates?.expression?.steps ?? data.expression?.[laneIndex]?.length,
        pitch: effectiveSubLaneStates?.pitch?.steps ?? data.pitch?.[laneIndex]?.length,
        morph: effectiveSubLaneStates?.morph?.steps ?? data.morph?.[laneIndex]?.length,
        distance: effectiveSubLaneStates?.distance?.steps ?? data.distance?.[laneIndex]?.length,
      } as const;
      const directionFields = {
        expression: effectiveSubLaneStates?.expression?.direction ?? data.expressionDirection?.[laneIndex],
        pitch: effectiveSubLaneStates?.pitch?.direction ?? data.pitchDirection?.[laneIndex],
        morph: effectiveSubLaneStates?.morph?.direction ?? data.morphDirection?.[laneIndex],
        distance: effectiveSubLaneStates?.distance?.direction ?? data.distanceDirection?.[laneIndex],
      } as const;
      for (const lane of ['expression', 'pitch', 'morph', 'distance'] as const) {
        const steps = lengthFields[lane];
        const direction = directionFields[lane];
        if (steps == null && direction == null) continue;
        nextLane[lane] = {
          ...nextLane[lane],
          ...(typeof steps === 'number' ? { steps } : {}),
          ...(direction ? { direction } : {}),
        };
      }
      return nextLane;
    }));
  }, [evolvedOverrides, seq]);

  // Sync step overrides to audio engine
  // Track both stepOverrides AND pitchSettings so conversion re-runs on either change
  const stepOverridesRef = useRef<StepOverrides | null>(null);
  const pitchSettingsRef = useRef<PitchSettings[] | null>(null);
  const pitchSubLaneStatesRef = useRef<Record<SubLaneKind, SubLaneState>[] | null>(null);
  const engineArpConfigsRef = useRef<ProductPlayConfig[] | null>(null);
  const engineArpPatternSignatureRef = useRef<string | null>(null);
  const enginePitchBindingModesRef = useRef<PitchBindingMode[] | null>(null);
  const engineSequencerModelsRef = useRef<SequencerState[] | null>(null);
  const engineClockDivsRef = useRef(seq.clockDivs);
  const engineSequencerBeatSecondsRef = useRef(chordSequencerUiBeatSeconds(state));
  useEffect(() => () => {
    onSequencerRuntimeDetach?.();
  }, [onSequencerRuntimeDetach]);
  useEffect(() => {
    const sequencerBeatSeconds = chordSequencerUiBeatSeconds(state);
    const overridesChanged = stepOverridesRef.current !== seq.stepOverrides;
    const settingsChanged = pitchSettingsRef.current !== seq.pitchSettings;
    const subLaneStatesChanged = pitchSubLaneStatesRef.current !== seq.subLaneStates;
    const arpConfigsChanged = engineArpConfigsRef.current !== arpConfigs;
    const pitchBindingModesChanged = enginePitchBindingModesRef.current !== pitchBindingModes;
    const sequencerModelsChanged = engineSequencerModelsRef.current !== seq.sequencerModels;
    const clockDivsChanged = engineClockDivsRef.current !== seq.clockDivs;
    const sequencerBeatSecondsChanged = engineSequencerBeatSecondsRef.current !== sequencerBeatSeconds;
    if (overridesChanged || settingsChanged || subLaneStatesChanged || arpConfigsChanged || pitchBindingModesChanged || sequencerModelsChanged || clockDivsChanged || sequencerBeatSecondsChanged) {
      const now = Date.now();
      let resolvedPendingDiceSync = false;
      const blockedByPendingDice = pendingDiceSyncUntilRef.current.some((until, laneIndex) => {
        if (until <= 0) return false;
        const expected = pendingDiceExpectedSignatureRef.current[laneIndex];
        if (expected && stepOverrideLaneSignature(seq.stepOverrides, laneIndex) === expected) {
          pendingDiceSyncUntilRef.current[laneIndex] = 0;
          pendingDiceExpectedSignatureRef.current[laneIndex] = null;
          resolvedPendingDiceSync = true;
          return false;
        }
        if (now >= until) {
          pendingDiceSyncUntilRef.current[laneIndex] = 0;
          pendingDiceExpectedSignatureRef.current[laneIndex] = null;
          return false;
        }
        return true;
      });
      if (resolvedPendingDiceSync) {
        stepOverridesRef.current = seq.stepOverrides;
        pitchSettingsRef.current = seq.pitchSettings;
        pitchSubLaneStatesRef.current = seq.subLaneStates;
        engineArpConfigsRef.current = arpConfigs;
        enginePitchBindingModesRef.current = pitchBindingModes;
        engineSequencerModelsRef.current = seq.sequencerModels;
        engineClockDivsRef.current = seq.clockDivs;
        engineSequencerBeatSecondsRef.current = sequencerBeatSeconds;
        return;
      }
      if (blockedByPendingDice) return;
      stepOverridesRef.current = seq.stepOverrides;
      pitchSettingsRef.current = seq.pitchSettings;
      pitchSubLaneStatesRef.current = seq.subLaneStates;
      engineArpConfigsRef.current = arpConfigs;
      enginePitchBindingModesRef.current = pitchBindingModes;
      engineSequencerModelsRef.current = seq.sequencerModels;
      engineClockDivsRef.current = seq.clockDivs;
      engineSequencerBeatSecondsRef.current = sequencerBeatSeconds;
      const playEnginePatterns = arpConfigs.map((config, laneIdx) => {
        const laneClockDivision = seq.sequencerModels[laneIdx]?.clockDiv ?? seq.clockDivs[laneIdx] ?? '1/8';
        const pitchAnchor = arpPitchAnchorMidi(
          seq.subLaneStates[laneIdx]?.pitch?.enabled,
          seq.stepOverrides.pitch[laneIdx],
          seq.pitchSettings[laneIdx],
          harmonyState,
          state[`synthEuclid${laneIdx + 1}NoteMin` as keyof SliderState],
        );
        return resolveProductPlayEnginePattern({
          config: config ?? defaultProductPlayConfig(),
          harmony: arpHarmonyContext,
          laneIndex: laneIdx,
          pitchBindingMode: pitchBindingModes[laneIdx] ?? 'polyrhythmic',
          triggerPattern: seq.sequencerModels[laneIdx]?.trigger.pattern ?? null,
          triggerStepMs: Math.max(1, sequencerClockDivisionToSeconds(laneClockDivision, sequencerBeatSeconds, '1/8') * 1000),
          anchorMidi: pitchAnchor,
        });
      });
      const playArps = arpConfigs.map((config, laneIdx) => {
        const playConfig = normalizeProductPlayConfig(config ?? defaultProductPlayConfig());
        const midiPattern = playConfig.enabled && playConfig.mode === 'arp'
          ? resolveProductArpMidiPattern({
            config: { ...playConfig.arp, enabled: true },
            harmony: arpHarmonyContext,
            laneIndex: laneIdx,
            anchorMidi: arpPitchAnchorMidi(
              seq.subLaneStates[laneIdx]?.pitch?.enabled,
              seq.stepOverrides.pitch[laneIdx],
              seq.pitchSettings[laneIdx],
              harmonyState,
              state[`synthEuclid${laneIdx + 1}NoteMin` as keyof SliderState],
            ),
          }) ?? []
          : [];
        return {
          enabled: playConfig.enabled,
          mode: playConfig.mode,
          arp: playConfig.arp,
          midiPattern,
        };
      });
      const arpPatternSignature = JSON.stringify(playArps);
      const arpPatternChanged = engineArpPatternSignatureRef.current !== arpPatternSignature;
      const onlyArpPatternChanged = arpPatternChanged && arpConfigsChanged &&
        !overridesChanged && !settingsChanged && !subLaneStatesChanged &&
        !pitchBindingModesChanged && !sequencerModelsChanged && !clockDivsChanged &&
        !sequencerBeatSecondsChanged;
      if (onlyArpPatternChanged) {
        onStepOverridesChange?.({ playArps } as StepOverrides);
        engineArpPatternSignatureRef.current = arpPatternSignature;
        return;
      }
      // Convert pitch offsets to absolute MIDI notes before sending to engine
      // (engine doesn't know pitch mode/root/scale — we convert here)
      const convertedPitch = seq.stepOverrides.pitch.map((offsets, laneIdx) => {
        const playPattern = playEnginePatterns[laneIdx]?.midiPattern;
        if (playPattern) return playPattern;
        if (!offsets) return null;
        // When pitch sub-lane is disabled, return null so engine uses noteMin/noteMax range
        if (!seq.subLaneStates[laneIdx]?.pitch?.enabled) return null;
        const ps = seq.pitchSettings[laneIdx];
        if (!ps) return offsets;
        // noteRange mode: engine handles note selection via noteMin/noteMax
        if (ps.mode === 'noteRange') return null;
        const resolvedPitch = resolvePitchSettingsForHarmony(ps, harmonyState);
        if (ps.mode === 'notes') return offsets.map(clampMidiNote);
        return offsets.map((degree) => clampMidiNote(
          resolvedPitch.root + scaleDegreeToSemitone(degree, resolvedPitch.scaleIntervals),
        ));
      });
      const playNotes = playEnginePatterns.map((pattern) => (
        pattern?.playNotes?.map((event) => ({
          step: event.step,
          midi: event.midi,
          offsetMs: event.offsetMs,
          velocity: event.velocity,
          voiceIndex: event.voiceIndex,
        })) ?? null
      ));
      const engineSubLaneStates = seq.subLaneStates.map((laneState, laneIdx) => (
        playEnginePatterns[laneIdx]
          ? { ...laneState, pitch: { ...laneState.pitch, enabled: true, steps: playEnginePatterns[laneIdx]!.steps, direction: 'forward' as const } }
          : laneState
      ));
      const pitchDirection = seq.stepOverrides.pitchDirection.map((direction, laneIdx) => (
        arpConfigs[laneIdx]?.enabled ? 'forward' as const : direction
      ));
      // Persist raw (unconverted) overrides for round-trip safety
      if (overridesChanged) {
        onRawStepOverridesChange?.(seq.stepOverrides);
      }
      const expressionRanges = seq.subLaneStates.map((laneState) => {
        const lane = laneState.expression;
        return lane.enabled && lane.valueMode === 'range'
          ? { min: Math.min(lane.rangeMin ?? 0.75, lane.rangeMax ?? 1), max: Math.max(lane.rangeMin ?? 0.75, lane.rangeMax ?? 1) }
          : null;
      });
      const morphRanges = seq.subLaneStates.map((laneState) => {
        const lane = laneState.morph;
        return lane.enabled && lane.valueMode === 'range'
          ? { min: Math.min(lane.rangeMin ?? 0, lane.rangeMax ?? 1), max: Math.max(lane.rangeMin ?? 0, lane.rangeMax ?? 1) }
          : null;
      });
      const distanceRanges = seq.subLaneStates.map((laneState) => {
        const lane = laneState.distance;
        return lane.enabled && lane.valueMode === 'range'
          ? { min: Math.min(lane.rangeMin ?? 0, lane.rangeMax ?? 1), max: Math.max(lane.rangeMin ?? 0, lane.rangeMax ?? 1) }
          : null;
      });
      // Send MIDI-converted pitch to audio engine
      const engineOverrides: StepOverrides = {
          ...seq.stepOverrides,
          pitch: convertedPitch,  // Send MIDI notes, not raw offsets
          playNotes,
          pitchDirection,
          expressionRanges,
          morphRanges,
          distanceRanges,
      };
      if (arpPatternChanged) engineOverrides.playArps = playArps;
      else delete engineOverrides.playArps;
      onStepOverridesChange?.(
        stepOverridesForEngineSubLaneState(engineOverrides, engineSubLaneStates),
        engineSubLaneStates,
      );
      engineArpPatternSignatureRef.current = arpPatternSignature;
    }
  // The live-tone tick only refreshes the visual preview. Reposting ARP state here
  // cancels native notes that are already scheduled inside the current hold window.
  }, [seq.stepOverrides, seq.pitchSettings, seq.subLaneStates, seq.sequencerModels, seq.clockDivs, arpConfigs, arpHarmonyContext, harmonyState, pitchBindingModes, state.sequencerMasterBPM, state.synthEuclidBaseBPM, state.drumEuclidBaseBPM, onStepOverridesChange, onRawStepOverridesChange]);

  // Persist sub-lane states (enabled/steps/direction) across tab switches
  const subLaneStatesRef = useRef<Record<SubLaneKind, SubLaneState>[] | null>(null);
  useEffect(() => {
    if (subLaneStatesRef.current !== seq.subLaneStates) {
      subLaneStatesRef.current = seq.subLaneStates;
      onSubLaneStatesChange?.(seq.subLaneStates);
    }
  }, [seq.subLaneStates, onSubLaneStatesChange]);

  // Persist pitch settings (mode/root/scale) across tab switches
  const pitchSettingsRef2 = useRef(seq.pitchSettings);
  useEffect(() => {
    if (pitchSettingsRef2.current !== seq.pitchSettings) {
      pitchSettingsRef2.current = seq.pitchSettings;
      onPitchSettingsChange?.(seq.pitchSettings);
    }
  }, [seq.pitchSettings, onPitchSettingsChange]);

  // Sync per-lane clock divisions to audio engine
  const clockDivsRef = useRef(seq.clockDivs);
  useEffect(() => {
    if (clockDivsRef.current !== seq.clockDivs) {
      clockDivsRef.current = seq.clockDivs;
      onClockDivsChange?.(seq.clockDivs);
    }
  }, [seq.clockDivs, onClockDivsChange]);

  // Sync per-lane swing amounts to audio engine
  const swingsRef = useRef(seq.swings);
  useEffect(() => {
    if (swingsRef.current !== seq.swings) {
      swingsRef.current = seq.swings;
      onSwingsChange?.(seq.swings);
    }
  }, [seq.swings, onSwingsChange]);

  const linkedRef = useRef(seq.linked);
  useEffect(() => {
    if (linkedRef.current !== seq.linked) {
      linkedRef.current = seq.linked;
      onLinkedChange?.(seq.linked);
    }
  }, [seq.linked, onLinkedChange]);

  useEffect(() => {
    const laneIndex = pendingSequenceHomeCaptureRef.current;
    if (laneIndex == null) return;
    pendingSequenceHomeCaptureRef.current = null;
    captureEvolveHome?.(laneIndex, sequencePitchHomeRef.current[laneIndex] ?? null);
  }, [sequenceHomeCaptureVersion, captureEvolveHome]);

  const activeSeq = seq.activeSeq;
  const triggerSourceIsEuclidean = (activeSeq.trigger.sourceOrigin ?? 'euclidean') === 'euclidean';
  const triggerSourceModeLabel = triggerSourceIsEuclidean ? 'Euclid' : 'Step';
  const [walkerEnsemblePreset, setWalkerEnsemblePreset] = useState<WalkerEnsemblePreset>('off');
  const walkerEnsembleRestoreRef = useRef<SequencerSlotModeState[] | null>(null);
  const hasWalkerSlot = sequencerFaceState.slots.some((slot) => slot.mode === 'anchorWalker');
  const activeAnchorWalkerRuntimeState = useMemo(() => (
    activeSequencerMode === 'anchorWalker'
      ? anchorWalkerRuntimeFromVisualState(
          seq.activeTab,
          walkerVisualStates,
        )
      : null
  ), [activeSequencerMode, seq.activeTab, walkerVisualStates]);
  const updateSequencerSlot = useCallback((laneIdx: number, updater: (slot: SequencerSlotModeState) => SequencerSlotModeState): void => {
    const safeLaneIdx = Math.max(0, Math.min(LANE_CONFIGS.length - 1, Math.round(laneIdx)));
    const next = {
      ...sequencerFaceState,
      slots: sequencerFaceState.slots.map((slot, index) => (
        index === safeLaneIdx ? updater(slot) : slot
      )),
    };
    onSelectChange('synthSequencerFaces' as keyof SliderState, next as SliderState[keyof SliderState]);
  }, [onSelectChange, sequencerFaceState]);
  const setSequencerMode = useCallback((laneIdx: number, mode: SequencerMode): void => {
    updateSequencerSlot(laneIdx, (slot) => ({ ...slot, mode }));
  }, [updateSequencerSlot]);
  const applyWalkerEnsemble = useCallback((preset: WalkerEnsemblePreset): void => {
    setWalkerEnsemblePreset(preset);
    const patches = walkerEnsembleSlotPatches(preset);
    if (patches.length === 0) {
      const restoreSlots = walkerEnsembleRestoreRef.current;
      walkerEnsembleRestoreRef.current = null;
      if (!restoreSlots) return;
      const next = {
        ...sequencerFaceState,
        slots: sequencerFaceState.slots.map((slot, index) => restoreSlots[index] ?? slot),
      };
      onSelectChange('synthSequencerFaces' as keyof SliderState, next as SliderState[keyof SliderState]);
      return;
    }
    if (walkerEnsemblePreset === 'off' && walkerEnsembleRestoreRef.current === null) {
      walkerEnsembleRestoreRef.current = sequencerFaceState.slots.map((slot) => ({
        ...slot,
        anchorWalker: normalizeAnchorWalkerConfig(slot.anchorWalker),
      }));
    }
    const next = {
      ...sequencerFaceState,
      slots: sequencerFaceState.slots.map((slot, index) => {
        const patch = patches[index];
        if (!patch) return slot;
        return {
          ...slot,
          mode: 'anchorWalker' as const,
          anchorWalker: walkerEnsembleConfig(slot.anchorWalker, index, patch),
        };
      }),
    };
    onSelectChange('synthSequencerFaces' as keyof SliderState, next as SliderState[keyof SliderState]);
  }, [onSelectChange, sequencerFaceState, walkerEnsemblePreset]);
  const sendAnchorWalkerPerformanceEvent = useCallback((laneIdx: number, event: AnchorWalkerPerformanceEvent): void => {
    const safeLaneIdx = Math.max(0, Math.min(LANE_CONFIGS.length - 1, Math.round(laneIdx)));
    const shouldBroadcast =
      walkerEnsemblePreset !== 'off' &&
      safeLaneIdx === 0 &&
      sequencerFaceState.slots[0]?.mode === 'anchorWalker';
    const targets = shouldBroadcast
      ? sequencerFaceState.slots
          .slice(0, LANE_CONFIGS.length)
          .map((slot, index) => slot.mode === 'anchorWalker' ? index : -1)
          .filter((index) => index >= 0)
      : [safeLaneIdx];
    for (const targetLane of targets) {
      sendProductAnchorWalkerPerformanceEvent?.(targetLane, event);
    }
  }, [sendProductAnchorWalkerPerformanceEvent, sequencerFaceState.slots, walkerEnsemblePreset]);
  const updateAnchorWalkerSlot = useCallback((laneIdx: number, nextConfig: AnchorWalkerConfig): void => {
    const safeLaneIdx = Math.max(0, Math.min(LANE_CONFIGS.length - 1, Math.round(laneIdx)));
    const shouldBroadcastGesture =
      walkerEnsemblePreset !== 'off' &&
      safeLaneIdx === 0 &&
      nextConfig.playMode === 'hybridPlay';
    const next = {
      ...sequencerFaceState,
      slots: sequencerFaceState.slots.map((slot, index) => {
        if (index === safeLaneIdx) {
          return { ...slot, anchorWalker: nextConfig };
        }
        if (!shouldBroadcastGesture || index >= LANE_CONFIGS.length || slot.mode !== 'anchorWalker') {
          return slot;
        }
        return {
          ...slot,
          anchorWalker: normalizeAnchorWalkerConfig({
            ...slot.anchorWalker,
            triggerMode: nextConfig.triggerMode,
          }, index),
        };
      }),
    };
    onSelectChange('synthSequencerFaces' as keyof SliderState, next as SliderState[keyof SliderState]);
  }, [onSelectChange, sequencerFaceState, walkerEnsemblePreset]);

  const lastGeneratedCaptureTelemetryEventIdRef = useRef(0);
  const setGeneratedSequencerCaptureEnabled = useCallback((
    request: ProductGeneratedSequencerCaptureRequest,
  ): void => {
    if (request.enabled) {
      lastGeneratedCaptureTelemetryEventIdRef.current = 0;
    }
    setProductGeneratedSequencerCaptureEnabled?.(request);
  }, [setProductGeneratedSequencerCaptureEnabled]);
  const setGeneratedCaptureSequencerMode = useCallback((laneIndex: number, mode: 'euclid'): void => {
    setSequencerMode(laneIndex, mode);
  }, [setSequencerMode]);
  const setGeneratedCapturePitchBindingMode = useCallback((laneIndex: number, mode: PitchBindingMode): void => {
    setPitchBindingMode(laneIndex, mode);
  }, [setPitchBindingMode]);
  const generatedCapturePitchReference = useMemo(
    () => generatedCapturePitchReferenceForSlot(activeSequencerMode, activeSequencerSlot, harmonyState),
    [activeSequencerMode, activeSequencerSlot, harmonyState],
  );
  const generatedSequenceCapture = useGeneratedSequenceCapture({
    isRunning,
    activeLaneIndex: seq.activeTab,
    activeLaneMode: activeSequencerMode,
    seq,
    setSequencerMode: setGeneratedCaptureSequencerMode,
    setPitchBindingMode: setGeneratedCapturePitchBindingMode,
    capturePitchReference: generatedCapturePitchReference,
    setProductCaptureEnabled: setGeneratedSequencerCaptureEnabled,
    onStepCommit: commitProductGeneratedSequencerCaptureToStep,
  });
  const {
    session: generatedCaptureSession,
    isCapturing: generatedCaptureIsCapturing,
    capturedCount: generatedCaptureCount,
    startCapture: startGeneratedCapture,
    stopAndCommit: stopGeneratedCapture,
    cancelCapture: cancelGeneratedCapture,
    captureManualNote: captureGeneratedManualNote,
    ingestProductEvents: ingestGeneratedCaptureEvents,
    markCurrentStepFromPlayhead: markGeneratedCaptureStepFromPlayhead,
  } = generatedSequenceCapture;

  useEffect(() => {
    if (!generatedCaptureIsCapturing) return;

    let rafId = window.requestAnimationFrame(function markCaptureStep() {
      markGeneratedCaptureStepFromPlayhead();
      rafId = window.requestAnimationFrame(markCaptureStep);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [generatedCaptureIsCapturing, markGeneratedCaptureStepFromPlayhead]);

  useVisibleInterval(() => {
    if (!generatedCaptureIsCapturing) return;
    const telemetry = getProductGeneratedSequencerCaptureTelemetry?.();
    const events = telemetry?.events ?? [];
    const freshEvents = events.filter((event) => (
      event.eventId > lastGeneratedCaptureTelemetryEventIdRef.current
    ));
    if (freshEvents.length > 0) {
      for (const event of freshEvents) {
        lastGeneratedCaptureTelemetryEventIdRef.current = Math.max(
          lastGeneratedCaptureTelemetryEventIdRef.current,
          event.eventId,
        );
      }
    }
    const overflowCount = telemetry?.overflowCount ?? 0;
    if (freshEvents.length > 0 || overflowCount > 0) {
      ingestGeneratedCaptureEvents(freshEvents, overflowCount);
    }
  }, generatedCaptureIsCapturing ? 50 : null, {
    enabled: generatedCaptureIsCapturing,
    immediate: true,
  });

  // ── Source key helpers ──
  const getSourceKey = (laneIdx: number): keyof SliderState =>
    SYNTH_LANE_SOURCE_KEYS[laneIdx] ?? SYNTH_LANE_SOURCE_KEYS[0];

  const getVoiceMaskKey = (laneIdx: number): keyof SliderState =>
    `synthEuclid${laneIdx + 1}VoiceMask` as keyof SliderState;

  const getSourceColor = (source: string): string =>
    SYNTH_SOURCES.find(s => s.value === synthSourceSelectValue(source))?.color ?? '#888';

  const cyclePadVoiceAssignment = useCallback((voice: number): void => {
    const bit = 1 << (voice - 1);
    const assignment = padVoiceAssignment(state, voice);
    let nextVoiceMask = (state.synthVoiceMask ?? 63) & PAD_VOICE_MASK_ALL;
    let nextPad2Assign = (state.pad2VoiceAssign ?? 0) & PAD_VOICE_MASK_ALL;
    if (assignment === 'off') {
      nextVoiceMask |= bit;
      nextPad2Assign &= ~bit;
    } else if (assignment === 'pad1') {
      nextVoiceMask |= bit;
      nextPad2Assign |= bit;
    } else {
      nextVoiceMask &= ~bit;
      nextPad2Assign &= ~bit;
    }
    onParamChange('synthVoiceMask', nextVoiceMask);
    onParamChange('pad2VoiceAssign', nextPad2Assign);
  }, [onParamChange, state]);

  const assignLaneVoiceMaskToSource = useCallback((laneSource: string, mask: number): void => {
    const source = normalizeSynthEuclidSource(laneSource);
    if (source !== 'pad1' && source !== 'pad2') return;
    const safeMask = (Math.round(mask) || PAD_VOICE_DEFAULT_MASK) & PAD_VOICE_MASK_ALL;
    const nextVoiceMask = ((state.synthVoiceMask ?? 63) | safeMask) & PAD_VOICE_MASK_ALL;
    const currentPad2Assign = (state.pad2VoiceAssign ?? 0) & PAD_VOICE_MASK_ALL;
    const nextPad2Assign = source === 'pad2'
      ? (currentPad2Assign | safeMask) & PAD_VOICE_MASK_ALL
      : currentPad2Assign & ~safeMask;
    onParamChange('synthVoiceMask', nextVoiceMask);
    onParamChange('pad2VoiceAssign', nextPad2Assign);
  }, [onParamChange, state.pad2VoiceAssign, state.synthVoiceMask]);

  const enableManualSynthSourceForPlayback = useCallback((
    source: SequencerManualSynthSource,
    startPatch: Partial<SliderState> = {},
  ): Partial<SliderState> => {
    const enabledKey = MANUAL_SYNTH_SOURCE_ENABLED_KEYS[source];
    if (Boolean(state[enabledKey])) return startPatch;
    onSelectChange(enabledKey, true);
    startPatch[enabledKey] = true;
    return startPatch;
  }, [onSelectChange, state]);

  const enableSourceValueForPlayback = useCallback((
    sourceValue: string,
    startPatch: Partial<SliderState> = {},
  ): Partial<SliderState> => {
    for (const source of manualSynthSourcesForLaneSource(sourceValue, state.pad2VoiceAssign)) {
      enableManualSynthSourceForPlayback(source, startPatch);
    }
    return startPatch;
  }, [enableManualSynthSourceForPlayback, state.pad2VoiceAssign]);

  const defaultLaneVoiceMask = useCallback((laneIdx: number): number => {
    let usedMask = 0;
    for (let index = 0; index < SYNTH_LANE_SOURCE_KEYS.length; index += 1) {
      if (index === laneIdx) continue;
      const source = normalizeSynthEuclidSource(state[getSourceKey(index)] ?? 'lead1');
      if (source === 'pad1' || source === 'pad2') {
        usedMask |= (Number(state[getVoiceMaskKey(index)] ?? PAD_VOICE_DEFAULT_MASK) || PAD_VOICE_DEFAULT_MASK) & PAD_VOICE_MASK_ALL;
      } else if (source.startsWith('synth')) {
        const voice = Number.parseInt(source.replace('synth', ''), 10);
        if (voice >= 1 && voice <= PAD_VOICE_NUMBERS.length) usedMask |= 1 << (voice - 1);
      }
    }
    for (let voice = PAD_VOICE_NUMBERS.length; voice >= 1; voice -= 1) {
      const bit = 1 << (voice - 1);
      if ((usedMask & bit) === 0) return bit;
    }
    return PAD_VOICE_DEFAULT_MASK;
  }, [getSourceKey, getVoiceMaskKey, state]);

  const handleLaneSourceChange = useCallback((laneIdx: number, value: string): void => {
    const sourceKey = getSourceKey(laneIdx);
    const voiceMaskKey = getVoiceMaskKey(laneIdx);
    const nextSource = normalizeSynthEuclidSource(value);
    const previousSource = normalizeSynthEuclidSource(state[sourceKey] ?? 'lead1');
    const existingMask = (Number(state[voiceMaskKey] ?? PAD_VOICE_DEFAULT_MASK) || PAD_VOICE_DEFAULT_MASK) & PAD_VOICE_MASK_ALL;
    const shouldPickAvailableSlot = (nextSource === 'pad1' || nextSource === 'pad2') && previousSource !== 'pad1' && previousSource !== 'pad2';
    const mask = shouldPickAvailableSlot ? defaultLaneVoiceMask(laneIdx) : existingMask || PAD_VOICE_DEFAULT_MASK;
    onSelectChange(sourceKey, value as SliderState[keyof SliderState]);
    if (nextSource === 'pad1' || nextSource === 'pad2') onParamChange(voiceMaskKey, mask);
    assignLaneVoiceMaskToSource(value, mask);
    const laneEnabledKey = SYNTH_LANE_ENABLED_KEYS[laneIdx] ?? SYNTH_LANE_ENABLED_KEYS[0];
    if (state.synthEuclideanMasterEnabled && state[laneEnabledKey] === true) {
      const startPatch = enableSourceValueForPlayback(value);
      if (!isRunning) {
        const playbackPatch: Partial<SliderState> = {
          ...startPatch,
          synthEuclideanMasterEnabled: true,
        };
        playbackPatch[laneEnabledKey] = true;
        onRequestPlaybackStart?.(playbackPatch);
      }
    }
  }, [
    assignLaneVoiceMaskToSource,
    defaultLaneVoiceMask,
    enableSourceValueForPlayback,
    getSourceKey,
    getVoiceMaskKey,
    isRunning,
    onParamChange,
    onRequestPlaybackStart,
    onSelectChange,
    state,
  ]);

  const toggleLaneVoiceMask = useCallback((laneIdx: number, voice: number): void => {
    const source = normalizeSynthEuclidSource(state[getSourceKey(laneIdx)] ?? 'lead1');
    const key = getVoiceMaskKey(laneIdx);
    const bit = 1 << (voice - 1);
    const currentMask = (Number(state[key] ?? PAD_VOICE_DEFAULT_MASK) || PAD_VOICE_DEFAULT_MASK) & PAD_VOICE_MASK_ALL;
    let nextMask = currentMask ^ bit;
    if (nextMask === 0) nextMask = bit;
    onParamChange(key, nextMask);
    if ((nextMask & bit) !== 0) assignLaneVoiceMaskToSource(source, bit);
  }, [assignLaneVoiceMaskToSource, getSourceKey, getVoiceMaskKey, onParamChange, state]);

  const getDefaultKeyboardSource = useCallback((): ManualSynthSource => {
    if (editingSection === 'pad2') return 'pad2';
    if (editingSection === 'lead2') return 'lead2';
    if (editingSection === 'sample1') return 'sample1';
    if (editingSection === 'sample2') return 'sample2';
    if (editingSection === 'lead1') return 'lead1';
    return manualSynthSourceForLaneSource(state[getSourceKey(seq.activeTab)] ?? 'lead1', state.pad2VoiceAssign);
  }, [editingSection, getSourceKey, seq.activeTab, state]);

  const getTriggerStepCountForLane = useCallback((laneIdx: number) => (
    seq.sequencerModels[laneIdx]?.trigger.steps ?? 0
  ), [seq.sequencerModels]);

  const getTriggerPatternForLane = useCallback((laneIdx: number) => (
    seq.sequencerModels[laneIdx]?.trigger.pattern ?? []
  ), [seq.sequencerModels]);

  const getVisiblePitchStepCountForLane = useCallback((laneIdx: number) => (
    seq.subLaneStates[laneIdx]?.pitch.steps ?? 0
  ), [seq.subLaneStates]);

  const getPitchCursorStepCountForLane = useCallback((laneIdx: number) => {
    const bindingMode = pitchBindingModes[laneIdx] ?? 'polyrhythmic';
    if (bindingMode === 'polyrhythmic') return MAX_SUBLANE_STEPS;
    return getVisiblePitchStepCountForLane(laneIdx);
  }, [getVisiblePitchStepCountForLane, pitchBindingModes]);

  const getSynthKeyboardLaneStepCount = useCallback((laneIdx: number, lane: SynthKeyboardEditLane) => {
    if (lane === 'trigger') return getTriggerStepCountForLane(laneIdx);
    if (lane === 'pitch') return getPitchCursorStepCountForLane(laneIdx);
    return seq.subLaneStates[laneIdx]?.[lane]?.steps ?? 0;
  }, [getPitchCursorStepCountForLane, getTriggerStepCountForLane, seq.subLaneStates]);

  const getFirstTriggerKeyboardStep = useCallback((laneIdx: number) => {
    const stepCount = getTriggerStepCountForLane(laneIdx);
    return stepCount > 0 ? 0 : 0;
  }, [getTriggerStepCountForLane]);

  const getFirstPitchKeyboardStep = useCallback((laneIdx: number) => {
    const stepCount = getPitchCursorStepCountForLane(laneIdx);
    return stepCount > 0 ? 0 : 0;
  }, [getPitchCursorStepCountForLane]);

  const getFirstSynthKeyboardLaneStep = useCallback((laneIdx: number, lane: SynthKeyboardEditLane) => {
    const stepCount = getSynthKeyboardLaneStepCount(laneIdx, lane);
    return stepCount > 0 ? 0 : 0;
  }, [getSynthKeyboardLaneStepCount]);

  const findAdjacentTriggerStep = useCallback((laneIdx: number, currentStep: number, direction: 1 | -1) => {
    const stepCount = getTriggerStepCountForLane(laneIdx);
    if (stepCount <= 0) return 0;
    return (currentStep + direction + stepCount) % stepCount;
  }, [getTriggerStepCountForLane]);

  const findAdjacentPitchStep = useCallback((laneIdx: number, currentStep: number, direction: 1 | -1) => {
    const stepCount = getPitchCursorStepCountForLane(laneIdx);
    if (stepCount <= 0) return 0;
    return (currentStep + direction + stepCount) % stepCount;
  }, [getPitchCursorStepCountForLane]);

  const findAdjacentSynthKeyboardLaneStep = useCallback((laneIdx: number, lane: SynthKeyboardEditLane, currentStep: number, direction: 1 | -1) => {
    const stepCount = getSynthKeyboardLaneStepCount(laneIdx, lane);
    if (stepCount <= 0) return 0;
    return (currentStep + direction + stepCount) % stepCount;
  }, [getSynthKeyboardLaneStepCount]);

  useEffect(() => {
    setTriggerKeyboardSteps((prev) => prev.map((step, laneIdx) => {
      const stepCount = getTriggerStepCountForLane(laneIdx);
      if (stepCount <= 0) return 0;
      if (!Number.isFinite(step) || step < 0 || step >= stepCount) {
        return getFirstTriggerKeyboardStep(laneIdx);
      }
      return step;
    }));
  }, [getFirstTriggerKeyboardStep, getTriggerStepCountForLane]);

  useEffect(() => {
    setPitchKeyboardSteps((prev) => prev.map((step, laneIdx) => {
      const stepCount = getPitchCursorStepCountForLane(laneIdx);
      if (stepCount <= 0) return 0;
      if (!Number.isFinite(step) || step < 0 || step >= stepCount) {
        return getFirstPitchKeyboardStep(laneIdx);
      }
      return step;
    }));
  }, [getFirstPitchKeyboardStep, getPitchCursorStepCountForLane]);

  useEffect(() => {
    setExpressionKeyboardSteps((prev) => prev.map((step, laneIdx) => {
      const stepCount = getSynthKeyboardLaneStepCount(laneIdx, 'expression');
      if (stepCount <= 0) return 0;
      if (!Number.isFinite(step) || step < 0 || step >= stepCount) {
        return getFirstSynthKeyboardLaneStep(laneIdx, 'expression');
      }
      return step;
    }));
    setMorphKeyboardSteps((prev) => prev.map((step, laneIdx) => {
      const stepCount = getSynthKeyboardLaneStepCount(laneIdx, 'morph');
      if (stepCount <= 0) return 0;
      if (!Number.isFinite(step) || step < 0 || step >= stepCount) {
        return getFirstSynthKeyboardLaneStep(laneIdx, 'morph');
      }
      return step;
    }));
    setDistanceKeyboardSteps((prev) => prev.map((step, laneIdx) => {
      const stepCount = getSynthKeyboardLaneStepCount(laneIdx, 'distance');
      if (stepCount <= 0) return 0;
      if (!Number.isFinite(step) || step < 0 || step >= stepCount) {
        return getFirstSynthKeyboardLaneStep(laneIdx, 'distance');
      }
      return step;
    }));
    setNudgeKeyboardSteps((prev) => prev.map((step, laneIdx) => {
      const stepCount = getSynthKeyboardLaneStepCount(laneIdx, 'nudge');
      if (stepCount <= 0) return 0;
      if (!Number.isFinite(step) || step < 0 || step >= stepCount) {
        return getFirstSynthKeyboardLaneStep(laneIdx, 'nudge');
      }
      return step;
    }));
  }, [getFirstSynthKeyboardLaneStep, getSynthKeyboardLaneStepCount]);

  const selectTriggerSequenceStep = useCallback((laneIdx: number, step: number) => {
    const stepCount = getTriggerStepCountForLane(laneIdx);
    if (stepCount <= 0) return;
    const normalizedStep = ((step % stepCount) + stepCount) % stepCount;
    seq.setActiveTab(laneIdx);
    setTriggerKeyboardSteps((prev) => prev.map((current, index) => index === laneIdx ? normalizedStep : current));
  }, [getTriggerStepCountForLane, seq]);

  const selectPitchSequenceStep = useCallback((laneIdx: number, step: number) => {
    const stepCount = getPitchCursorStepCountForLane(laneIdx);
    if (stepCount <= 0) return;
    const normalizedStep = ((step % stepCount) + stepCount) % stepCount;
    seq.setActiveTab(laneIdx);
    setPitchKeyboardSteps((prev) => prev.map((current, index) => index === laneIdx ? normalizedStep : current));
  }, [getPitchCursorStepCountForLane, seq]);

  const selectSynthKeyboardLaneStep = useCallback((laneIdx: number, lane: SynthKeyboardEditLane, step: number) => {
    const stepCount = getSynthKeyboardLaneStepCount(laneIdx, lane);
    if (stepCount <= 0) return;
    const normalizedStep = ((step % stepCount) + stepCount) % stepCount;
    seq.setActiveTab(laneIdx);
    if (lane === 'trigger') {
      setTriggerKeyboardSteps((prev) => prev.map((current, index) => index === laneIdx ? normalizedStep : current));
      return;
    }
    if (lane === 'pitch') {
      setPitchKeyboardSteps((prev) => prev.map((current, index) => index === laneIdx ? normalizedStep : current));
      return;
    }
    if (lane === 'expression') {
      setExpressionKeyboardSteps((prev) => prev.map((current, index) => index === laneIdx ? normalizedStep : current));
      return;
    }
    if (lane === 'morph') {
      setMorphKeyboardSteps((prev) => prev.map((current, index) => index === laneIdx ? normalizedStep : current));
      return;
    }
    if (lane === 'distance') {
      setDistanceKeyboardSteps((prev) => prev.map((current, index) => index === laneIdx ? normalizedStep : current));
      return;
    }
    setNudgeKeyboardSteps((prev) => prev.map((current, index) => index === laneIdx ? normalizedStep : current));
  }, [getSynthKeyboardLaneStepCount, seq]);

  const activeLaneSource = normalizeSynthEuclidSource(state[getSourceKey(seq.activeTab)] ?? 'lead1');
  const activeLaneSourceDisplay = synthSourceSelectValue(activeLaneSource);
  const activeLaneVoiceMask = (Number(state[getVoiceMaskKey(seq.activeTab)] ?? PAD_VOICE_DEFAULT_MASK) || PAD_VOICE_DEFAULT_MASK) & PAD_VOICE_MASK_ALL;
  const activeLaneUsesPadVoiceMask = activeLaneSource === 'pad1' || activeLaneSource === 'pad2';
  const sequenceKeyboardSource = manualSynthSourceForLaneSource(activeLaneSource, state.pad2VoiceAssign);
  const effectiveKeyboardSource = keyboardInputMode === 'sequence' ? sequenceKeyboardSource : keyboardSource;
  const activePitchBindingMode = pitchBindingModes[seq.activeTab] ?? 'polyrhythmic';
  const activeTriggerCursorStep = triggerKeyboardSteps[seq.activeTab] ?? getFirstTriggerKeyboardStep(seq.activeTab);
  const activePitchCursorStep = pitchKeyboardSteps[seq.activeTab] ?? getFirstPitchKeyboardStep(seq.activeTab);
  const activeExpressionCursorStep = expressionKeyboardSteps[seq.activeTab] ?? getFirstSynthKeyboardLaneStep(seq.activeTab, 'expression');
  const activeMorphCursorStep = morphKeyboardSteps[seq.activeTab] ?? getFirstSynthKeyboardLaneStep(seq.activeTab, 'morph');
  const activeDistanceCursorStep = distanceKeyboardSteps[seq.activeTab] ?? getFirstSynthKeyboardLaneStep(seq.activeTab, 'distance');
  const activeNudgeCursorStep = nudgeKeyboardSteps[seq.activeTab] ?? getFirstSynthKeyboardLaneStep(seq.activeTab, 'nudge');
  const sequenceWritesToTriggerGrid = activePitchBindingMode === 'sequence';
  const activeKeyboardEditLane = getSynthKeyboardEditLane(seq.openLane);
  const activeSynthKeyboardStep = activeKeyboardEditLane === 'trigger'
    ? activeTriggerCursorStep
    : activeKeyboardEditLane === 'pitch'
      ? activePitchCursorStep
      : activeKeyboardEditLane === 'expression'
        ? activeExpressionCursorStep
        : activeKeyboardEditLane === 'morph'
          ? activeMorphCursorStep
          : activeKeyboardEditLane === 'distance'
            ? activeDistanceCursorStep
            : activeNudgeCursorStep;

  const formatLinkedTriggerStampSummary = useCallback((step: number) => {
    const laneState = seq.subLaneStates[seq.activeTab];
    const labels = [
      laneState?.pitch.enabled ? 'P' : '',
      laneState?.expression.enabled ? 'E' : '',
      laneState?.morph.enabled ? 'M' : '',
      laneState?.distance.enabled ? 'D' : '',
      laneState?.nudge.enabled ? 'N' : '',
    ].filter(Boolean);
    return `Trig ${step + 1}${labels.length ? ` + ${labels.join(' ')}` : ''}`;
  }, [seq.activeTab, seq.subLaneStates]);

  const copyLinkedTriggerStampAtStep = useCallback((step: number) => {
    const copied = seq.copyLinkedTriggerCell(seq.activeTab, step);
    if (copied) {
      setLinkedTriggerStampReady(true);
      setLinkedTriggerStampMode(true);
      setLinkedTriggerStampPickSource(false);
      setLinkedTriggerStampSummary(formatLinkedTriggerStampSummary(step));
    }
    return copied;
  }, [formatLinkedTriggerStampSummary, seq]);

  const beginLinkedTriggerStampSourcePick = useCallback(() => {
    setLinkedTriggerStampPickSource(true);
    setLinkedTriggerStampMode(false);
    setLinkedTriggerStampSummary('Select source trigger');
  }, []);

  const pasteActiveLinkedTriggerStamp = useCallback(() => {
    if (!linkedTriggerStampReady) return false;
    return seq.pasteLinkedTriggerCell(seq.activeTab, activeTriggerCursorStep);
  }, [activeTriggerCursorStep, linkedTriggerStampReady, seq]);

  const pasteLinkedTriggerStampAtStep = useCallback((step: number) => {
    if (!linkedTriggerStampReady) return false;
    return seq.pasteLinkedTriggerCell(seq.activeTab, step);
  }, [linkedTriggerStampReady, seq]);

  useEffect(() => {
    if (!triggerStampMode && !linkedTriggerStampMode && !triggerStampPickSource && !linkedTriggerStampPickSource) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.seq-step-cell, .seq-step-select-btn, .seq-trigger-clip-btn, .seq-chord-clip-btn')) return;
      setTriggerStampMode(false);
      setTriggerStampPickSource(false);
      setLinkedTriggerStampMode(false);
      setLinkedTriggerStampPickSource(false);
    };
    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => window.removeEventListener('pointerdown', handlePointerDown, true);
  }, [linkedTriggerStampMode, linkedTriggerStampPickSource, triggerStampMode, triggerStampPickSource]);

  const keyboardBaseMidi = 12 * (keyboardOctave + 1);
  const keyboardSourceInfo = MANUAL_KEYBOARD_SOURCES.find((source) => source.value === effectiveKeyboardSource) ?? MANUAL_KEYBOARD_SOURCES[0]!;
  const keyboardHarmonyContext = useMemo(() => {
    const activePitchSettings = seq.pitchSettings[seq.activeTab] ?? { ...SYNTH_DEFAULT_PITCH_SETTINGS, root: keyboardBaseMidi };
    const resolvedPitchSettings = resolvePitchSettingsForHarmony(activePitchSettings, harmonyState);
    const rootPitchClass = getPitchClass(resolvedPitchSettings.root);
    const scaleIntervals = resolvedPitchSettings.scaleIntervals;
    const chordPitchClasses = new Set((harmonyState?.currentChord.midiNotes ?? []).map(getPitchClass));
    const scalePitchClasses = new Set(scaleIntervals.map((interval) => (rootPitchClass + interval) % 12));
    return {
      rootPitchClass,
      chordPitchClasses,
      scalePitchClasses,
      label: harmonyState
        ? `${CHROMATIC_NOTE_NAMES[rootPitchClass] ?? 'C'} ${resolvedPitchSettings.scaleLabel}`
        : `${formatMidiNoteName(resolvedPitchSettings.root)} root`,
      usingHarmonyEngine: Boolean(harmonyState),
    };
  }, [harmonyState, keyboardBaseMidi, seq.activeTab, seq.pitchSettings]);

  const classifyKeyboardMidi = useCallback((midi: number): KeyboardHarmonyStatus => {
    const pitchClass = getPitchClass(midi);
    if (pitchClass === keyboardHarmonyContext.rootPitchClass) return 'root';
    if (keyboardHarmonyContext.chordPitchClasses.has(pitchClass)) return 'chord';
    if (keyboardHarmonyContext.scalePitchClasses.has(pitchClass)) return 'scale';
    return 'outside';
  }, [keyboardHarmonyContext]);

  const keyboardKeys = useMemo(() => {
    let currentWhiteIndex = -1;
    return MANUAL_KEYBOARD_LAYOUT.map((key, layoutIndex) => {
      if (!key.accidental) currentWhiteIndex += 1;
      const midi = keyboardBaseMidi + key.semitone;
      return {
        ...key,
        layoutIndex,
        midi,
        noteLabel: formatMidiNoteName(midi),
        whiteIndex: currentWhiteIndex,
        harmonyStatus: classifyKeyboardMidi(midi),
      };
    });
  }, [classifyKeyboardMidi, keyboardBaseMidi]);
  const keyboardVisibleKeys = useMemo(
    () => keyboardKeys.filter((key) => MANUAL_KEYBOARD_VISIBLE_LAYOUT.some((visibleKey) => visibleKey.code === key.code)),
    [keyboardKeys],
  );
  const keyboardWhiteCount = keyboardVisibleKeys.filter((key) => !key.accidental).length;
  const keyboardNaturalKeys = keyboardVisibleKeys.filter((key) => !key.accidental);
  const keyboardAccidentalKeys = keyboardVisibleKeys.filter((key) => key.accidental);
  const activeLanePitchSettings = seq.pitchSettings[seq.activeTab] ?? SYNTH_DEFAULT_PITCH_SETTINGS;
  const activeResolvedPitchSettings = resolvePitchSettingsForHarmony(activeLanePitchSettings, harmonyState);
  const activePitchLaneEnabled = seq.subLaneStates[seq.activeTab]?.pitch.enabled ?? false;
  const activeSequenceTriggerEnabled = (getTriggerPatternForLane(seq.activeTab)[activeTriggerCursorStep] ?? false) === true;
  const activeVisiblePitchSteps = getVisiblePitchStepCountForLane(seq.activeTab);
  const activePitchCursorIsBeyondVisibleRange = activePitchCursorStep >= activeVisiblePitchSteps;

  const getSequenceStepMidi = useCallback((laneIdx: number, step: number) => {
    const offset = seq.stepOverrides.pitch[laneIdx]?.[step];
    if (typeof offset !== 'number' || !Number.isFinite(offset)) return null;
    const settings = seq.pitchSettings[laneIdx] ?? SYNTH_DEFAULT_PITCH_SETTINGS;
    return pitchOffsetToMidi(offset, settings, harmonyState);
  }, [harmonyState, seq.pitchSettings, seq.stepOverrides.pitch]);

  const getSequenceStepLabel = useCallback((laneIdx: number, step: number) => {
    const midi = getSequenceStepMidi(laneIdx, step);
    return midi == null ? null : formatMidiNoteName(midi);
  }, [getSequenceStepMidi]);
  const activePitchCursorLabel = getSequenceStepLabel(seq.activeTab, activePitchCursorStep);
  const activePitchSelectionStep = sequenceWritesToTriggerGrid ? activeTriggerCursorStep : activePitchCursorStep;
  const canWriteSequenceNotes = keyboardInputMode === 'sequence'
    && activePitchLaneEnabled
    && activeLanePitchSettings.mode !== 'noteRange';
  const keyboardTargetVisible = showKeyboard && keyboardInputMode === 'sequence';
  const keyboardTriggerTargetVisible = keyboardTargetVisible && activeKeyboardEditLane === 'trigger';
  const keyboardTargetLabel = '⌖';
  const sequenceWriteHelper = keyboardInputMode !== 'sequence'
    ? null
    : !activePitchLaneEnabled
      ? 'Enable the Pitch lane to write notes.'
      : activeLanePitchSettings.mode === 'noteRange'
        ? 'Set Pitch mode to Semitones or Notes to write exact notes.'
        : activeKeyboardEditLane === 'trigger'
          ? 'Trigger lane is active. Musical keys write notes into the selected trigger, Left/Right moves steps, Up/Down changes probability, and Tab toggles the trigger on or off.'
          : activeKeyboardEditLane === 'pitch'
            ? `Pitch lane is active on step ${String(activePitchCursorStep + 1).padStart(2, '0')}. Left/Right moves steps, Up/Down changes pitch, Z/X shifts octave for typing notes.`
            : activeKeyboardEditLane === 'expression'
              ? 'Expression lane is active. Left/Right moves steps and Up/Down changes the value.'
              : activeKeyboardEditLane === 'morph'
                ? 'Morph lane is active. Left/Right moves steps and Up/Down changes the value.'
                : activeKeyboardEditLane === 'distance'
                  ? 'Distance lane is active. Left/Right moves steps and Up/Down changes the value.'
                  : 'Nudge lane is active. Left/Right moves hits and Up/Down changes timing.';
  const keyboardSequenceStatus = `Seq ${seq.activeTab + 1} | ${SYNTH_SOURCES.find((source) => source.value === activeLaneSourceDisplay)?.label ?? 'Lead 1'} | Lane ${activeKeyboardEditLane === 'trigger' ? 'Sequence' : activeKeyboardEditLane.charAt(0).toUpperCase() + activeKeyboardEditLane.slice(1)} | Step ${String(activeSynthKeyboardStep + 1).padStart(2, '0')}${activeKeyboardEditLane === 'trigger' ? ` | ${activeSequenceTriggerEnabled ? 'On' : 'Off'}` : ''}${activeKeyboardEditLane === 'pitch' && activePitchCursorLabel ? ` | ${activePitchCursorLabel}` : ''}${activeKeyboardEditLane === 'pitch' && activePitchBindingMode === 'polyrhythmic' && activePitchCursorIsBeyondVisibleRange ? ' | Hidden' : ''}`;

  const compactPitchTargetForTriggerStep = useCallback((laneIdx: number, triggerStep: number) => {
    const triggerStepCount = getTriggerStepCountForLane(laneIdx);
    if (triggerStepCount <= 0) return { pitchStep: 0, pitchStepCount: 1 };
    const normalizedTriggerStep = ((triggerStep % triggerStepCount) + triggerStepCount) % triggerStepCount;
    const pattern = getTriggerPatternForLane(laneIdx).slice(0, triggerStepCount);
    while (pattern.length < triggerStepCount) pattern.push(false);
    pattern[normalizedTriggerStep] = true;
    let hitIndex = 0;
    for (let step = 0; step <= normalizedTriggerStep; step += 1) {
      if (pattern[step]) hitIndex += 1;
    }
    const activeHitCount = pattern.reduce((count, enabled) => count + (enabled ? 1 : 0), 0);
    const pitchStepCount = clampEuclideanSubLaneSteps(Math.max(1, activeHitCount));
    return {
      pitchStep: Math.min(pitchStepCount - 1, Math.max(0, hitIndex - 1)),
      pitchStepCount,
    };
  }, [getTriggerPatternForLane, getTriggerStepCountForLane]);

  const writeKeyboardSequenceNote = useCallback((laneIdx: number, midi: number) => {
    const bindingMode = pitchBindingModes[laneIdx] ?? 'polyrhythmic';
    const pitchStepCount = bindingMode === 'sequence'
      ? getTriggerStepCountForLane(laneIdx)
      : getPitchCursorStepCountForLane(laneIdx);
    if (pitchStepCount <= 0) return;
    const currentSettings = seq.pitchSettings[laneIdx] ?? SYNTH_DEFAULT_PITCH_SETTINGS;
    if (currentSettings.mode === 'noteRange') return;
    if (!(seq.subLaneStates[laneIdx]?.pitch.enabled ?? false)) return;
    const storedValue = midiToPitchOffsetForSettings(midi, currentSettings, harmonyState);

    if (bindingMode === 'sequence') {
      const triggerStepCount = getTriggerStepCountForLane(laneIdx);
      if (triggerStepCount <= 0) return;
      const currentStep = triggerKeyboardSteps[laneIdx] ?? getFirstTriggerKeyboardStep(laneIdx);
      const normalizedStep = ((currentStep % triggerStepCount) + triggerStepCount) % triggerStepCount;
      seq.setTriggerStep(laneIdx, normalizedStep, true);
      seq.changeStepValue(laneIdx, 'pitch', normalizedStep, storedValue);
      const nextStep = findAdjacentTriggerStep(laneIdx, normalizedStep, 1);
      setTriggerKeyboardSteps((prev) => prev.map((value, index) => index === laneIdx ? nextStep : value));
      setPitchKeyboardSteps((prev) => prev.map((value, index) => index === laneIdx ? nextStep : value));
      return;
    }

    let normalizedStep: number;
    if (activeKeyboardEditLane === 'trigger') {
      const triggerStepCount = getTriggerStepCountForLane(laneIdx);
      if (triggerStepCount <= 0) return;
      const triggerStep = triggerKeyboardSteps[laneIdx] ?? getFirstTriggerKeyboardStep(laneIdx);
      const normalizedTriggerStep = ((triggerStep % triggerStepCount) + triggerStepCount) % triggerStepCount;
      seq.setTriggerStep(laneIdx, normalizedTriggerStep, true);
      const compactTarget = compactPitchTargetForTriggerStep(laneIdx, normalizedTriggerStep);
      normalizedStep = compactTarget.pitchStep;
      seq.setSubLaneSteps(laneIdx, 'pitch', compactTarget.pitchStepCount);
      const nextTriggerStep = findAdjacentTriggerStep(laneIdx, normalizedTriggerStep, 1);
      setTriggerKeyboardSteps((prev) => prev.map((value, index) => index === laneIdx ? nextTriggerStep : value));
    } else if (activeKeyboardEditLane === 'pitch') {
      const currentStep = pitchKeyboardSteps[laneIdx] ?? getFirstPitchKeyboardStep(laneIdx);
      normalizedStep = ((currentStep % pitchStepCount) + pitchStepCount) % pitchStepCount;
    } else {
      normalizedStep = ((activeSynthKeyboardStep % pitchStepCount) + pitchStepCount) % pitchStepCount;
    }

    seq.changeStepValue(laneIdx, 'pitch', normalizedStep, storedValue);
    const nextStep = findAdjacentPitchStep(laneIdx, normalizedStep, 1);
    setPitchKeyboardSteps((prev) => prev.map((value, index) => index === laneIdx ? nextStep : value));
  }, [
    activeKeyboardEditLane,
    activeSynthKeyboardStep,
    compactPitchTargetForTriggerStep,
    findAdjacentPitchStep,
    findAdjacentTriggerStep,
    getFirstPitchKeyboardStep,
    getFirstTriggerKeyboardStep,
    getPitchCursorStepCountForLane,
    getTriggerStepCountForLane,
    pitchBindingModes,
    pitchKeyboardSteps,
    seq,
    harmonyState,
    triggerKeyboardSteps,
  ]);

  const toggleSequenceTriggerAtStep = useCallback((laneIdx: number, step: number) => {
    const stepCount = getTriggerStepCountForLane(laneIdx);
    if (stepCount <= 0) return;
    const normalizedStep = ((step % stepCount) + stepCount) % stepCount;
    seq.toggleTriggerStep(laneIdx, normalizedStep);
  }, [getTriggerStepCountForLane, seq]);

  const cycleSynthKeyboardLane = useCallback((direction: 1 | -1) => {
    const currentLane = getSynthKeyboardEditLane(seq.openLane);
    const currentIndex = SYNTH_KEYBOARD_EDIT_LANES.indexOf(currentLane);
    const nextLane = SYNTH_KEYBOARD_EDIT_LANES[(currentIndex + direction + SYNTH_KEYBOARD_EDIT_LANES.length) % SYNTH_KEYBOARD_EDIT_LANES.length] ?? 'trigger';
    seq.setOpenLane(nextLane);
  }, [seq.openLane, seq.setOpenLane]);

  const cycleSynthKeyboardSequencer = useCallback((direction: 1 | -1) => {
    const nextLaneIdx = (seq.activeTab + direction + LANE_CONFIGS.length) % LANE_CONFIGS.length;
    seq.setActiveTab(nextLaneIdx);
    seq.setViewMode('detail');
  }, [seq]);

  const toggleSynthKeyboardLane = useCallback(() => {
    if (activeKeyboardEditLane === 'trigger') {
      toggleSequenceTriggerAtStep(seq.activeTab, activeTriggerCursorStep);
      return;
    }
    seq.toggleSubLaneEnabled(seq.activeTab, activeKeyboardEditLane);
  }, [activeKeyboardEditLane, activeTriggerCursorStep, seq, toggleSequenceTriggerAtStep]);

  const adjustSynthKeyboardLaneValue = useCallback((direction: 1 | -1, coarse: boolean) => {
    if (activeKeyboardEditLane === 'trigger') {
      const current = activeSeq.trigger.probability[activeTriggerCursorStep] ?? 1;
      const delta = coarse ? 0.2 : 0.05;
      const next = Math.max(0, Math.min(1, Math.round((current + direction * delta) * 20) / 20));
      seq.setStepProbability(seq.activeTab, activeTriggerCursorStep, next);
      return;
    }

    if (activeKeyboardEditLane === 'pitch') {
      if (activeLanePitchSettings.mode === 'noteRange') return;
      const current = seq.stepOverrides.pitch[seq.activeTab]?.[activePitchCursorStep]
        ?? activeSeq.pitch.offsets[activePitchCursorStep % Math.max(1, activeSeq.pitch.offsets.length)]
        ?? 0;
      const delta = coarse ? 4 : 1;
      seq.changeStepValue(seq.activeTab, 'pitch', activePitchCursorStep, current + direction * delta);
      return;
    }

    if (activeKeyboardEditLane === 'expression') {
      const current = seq.stepOverrides.expression[seq.activeTab]?.[activeExpressionCursorStep]
        ?? activeSeq.expression.velocities[activeExpressionCursorStep % Math.max(1, activeSeq.expression.velocities.length)]
        ?? 1;
      const delta = coarse ? 0.2 : 0.05;
      const next = Math.max(0, Math.min(1, Math.round((current + direction * delta) * 20) / 20));
      seq.changeStepValue(seq.activeTab, 'expression', activeExpressionCursorStep, next);
      return;
    }

    const current = seq.stepOverrides.morph[seq.activeTab]?.[activeMorphCursorStep]
      ?? activeSeq.morph.values[activeMorphCursorStep % Math.max(1, activeSeq.morph.values.length)]
      ?? 0.5;
    const delta = coarse ? 0.1 : 0.025;
    const next = Math.max(0, Math.min(1, Math.round((current + direction * delta) * 40) / 40));
    if (activeKeyboardEditLane === 'morph') {
      seq.changeStepValue(seq.activeTab, 'morph', activeMorphCursorStep, next);
      return;
    }

    if (activeKeyboardEditLane === 'nudge') {
      const currentNudge = seq.stepOverrides.nudge[seq.activeTab]?.[activeNudgeCursorStep]
        ?? activeSeq.nudge.values[activeNudgeCursorStep % Math.max(1, activeSeq.nudge.values.length)]
        ?? 0;
      const nudgeDelta = coarse ? 0.2 : 0.05;
      const nextNudge = Math.round(clampNudge(currentNudge + direction * nudgeDelta) * 20) / 20;
      seq.changeStepValue(seq.activeTab, 'nudge', activeNudgeCursorStep, nextNudge);
      return;
    }

    const currentDistance = seq.stepOverrides.distance[seq.activeTab]?.[activeDistanceCursorStep]
      ?? activeSeq.distance.values[activeDistanceCursorStep % Math.max(1, activeSeq.distance.values.length)]
      ?? 0;
    const distanceDelta = coarse ? 0.1 : 0.05;
    const nextDistance = Math.max(0, Math.min(1, Math.round((currentDistance + direction * distanceDelta) * 20) / 20));
    seq.changeStepValue(seq.activeTab, 'distance', activeDistanceCursorStep, nextDistance);
  }, [
    activeDistanceCursorStep,
    activeExpressionCursorStep,
    activeKeyboardEditLane,
    activeLanePitchSettings.mode,
    activeMorphCursorStep,
    activeNudgeCursorStep,
    activePitchCursorStep,
    activeSeq.distance.values,
    activeSeq.expression.velocities,
    activeSeq.morph.values,
    activeSeq.nudge.values,
    activeSeq.pitch.offsets,
    activeSeq.trigger.probability,
    activeTriggerCursorStep,
    seq,
  ]);

  const adjustSynthKeyboardLaneSteps = useCallback((direction: 1 | -1) => {
    if (activeKeyboardEditLane === 'trigger') {
      const currentSteps = getTriggerStepCountForLane(seq.activeTab);
      const nextSteps = clampEuclideanTriggerSteps(currentSteps + direction, currentSteps);
      if (nextSteps === currentSteps) return;
      seq.setParam(seq.activeTab, 'Steps', nextSteps);
      selectSynthKeyboardLaneStep(seq.activeTab, 'trigger', Math.min(activeTriggerCursorStep, nextSteps - 1));
      return;
    }

    if (activeKeyboardEditLane === 'nudge') return;

    const currentSteps = activeKeyboardEditLane === 'pitch'
      ? getVisiblePitchStepCountForLane(seq.activeTab)
      : seq.subLaneStates[seq.activeTab]?.[activeKeyboardEditLane]?.steps ?? 0;
    const nextSteps = clampEuclideanSubLaneSteps(currentSteps + direction, currentSteps);
    if (nextSteps === currentSteps) return;
    seq.setSubLaneSteps(seq.activeTab, activeKeyboardEditLane, nextSteps);
    selectSynthKeyboardLaneStep(seq.activeTab, activeKeyboardEditLane, Math.min(activeSynthKeyboardStep, nextSteps - 1));
  }, [
    activeKeyboardEditLane,
    activeSynthKeyboardStep,
    activeTriggerCursorStep,
    getTriggerStepCountForLane,
    getVisiblePitchStepCountForLane,
    selectSynthKeyboardLaneStep,
    seq,
  ]);

  const toggleSynthSequencerTransport = useCallback(() => {
    const plan = planSynthSequencerTransportToggle(state, seq.activeTab);
    applySequencerTransportPlan(plan, onSelectChange, !isRunning ? onRequestPlaybackStart : undefined);
  }, [
    isRunning,
    onRequestPlaybackStart,
    onSelectChange,
    seq.activeTab,
    state,
  ]);

  const enableChordSequencerSource = useCallback((sourceValue = chordSequencerSourceValue): Partial<SliderState> => {
    return enableSourceValueForPlayback(sourceValue);
  }, [chordSequencerSourceValue, enableSourceValueForPlayback]);

  const toggleChordGeneratorEnabled = useCallback(() => {
    const next = !(state.synthChordGeneratorEnabled === true);
    const startPatch = next ? enableSourceValueForPlayback(chordGeneratorSourceValue) : {};
    onSelectChange('synthChordGeneratorEnabled' as keyof SliderState, next);
    if (next && !isRunning) {
      onRequestPlaybackStart?.({
        ...startPatch,
        synthChordGeneratorEnabled: true,
      });
    }
  }, [
    chordGeneratorSourceValue,
    enableSourceValueForPlayback,
    isRunning,
    onRequestPlaybackStart,
    onSelectChange,
    state.synthChordGeneratorEnabled,
  ]);

  const setChordGeneratorSource = useCallback((sourceValue: string) => {
    onSelectChange('synthChordGeneratorSource' as keyof SliderState, sourceValue as SliderState[keyof SliderState]);
    if (state.synthChordGeneratorEnabled !== true) return;
    const startPatch = enableSourceValueForPlayback(sourceValue);
    if (!isRunning) {
      onRequestPlaybackStart?.({
        ...startPatch,
        synthChordGeneratorEnabled: true,
        synthChordGeneratorSource: sourceValue as SliderState['synthChordGeneratorSource'],
      });
    }
  }, [
    enableSourceValueForPlayback,
    isRunning,
    onRequestPlaybackStart,
    onSelectChange,
    state.synthChordGeneratorEnabled,
  ]);

  const toggleRandomTimingEnabled = useCallback(() => {
    const next = !(state.leadRandomEnabled === true);
    const startPatch = next ? enableSourceValueForPlayback(randomTimingSourceValue) : {};
    onSelectChange('leadRandomEnabled' as keyof SliderState, next);
    if (next && !isRunning) {
      onRequestPlaybackStart?.({
        ...startPatch,
        leadRandomEnabled: true,
      });
    }
  }, [
    enableSourceValueForPlayback,
    isRunning,
    onRequestPlaybackStart,
    onSelectChange,
    randomTimingSourceValue,
    state.leadRandomEnabled,
  ]);

  const setRandomTimingSource = useCallback((sourceValue: string) => {
    onSelectChange('leadRandomSource' as keyof SliderState, sourceValue as SliderState[keyof SliderState]);
    if (state.leadRandomEnabled !== true) return;
    const startPatch = enableSourceValueForPlayback(sourceValue);
    if (!isRunning) {
      onRequestPlaybackStart?.({
        ...startPatch,
        leadRandomEnabled: true,
        leadRandomSource: sourceValue as SliderState['leadRandomSource'],
      });
    }
  }, [
    enableSourceValueForPlayback,
    isRunning,
    onRequestPlaybackStart,
    onSelectChange,
    state.leadRandomEnabled,
  ]);

  const toggleChordSequencerEnabled = useCallback(() => {
    const next = !chordSequencerEnabled;
    const startPatch = next ? enableChordSequencerSource(chordSequencerSourceValue) : {};
    onSelectChange('synthChordSequencerEnabled' as keyof SliderState, next);
    if (next && !isRunning) {
      onRequestPlaybackStart?.({
        ...startPatch,
        synthChordSequencerEnabled: true,
      });
    }
  }, [
    chordSequencerEnabled,
    chordSequencerSourceValue,
    enableChordSequencerSource,
    isRunning,
    onRequestPlaybackStart,
    onSelectChange,
  ]);

  const setChordSequencerSource = useCallback((sourceValue: string) => {
    onSelectChange('synthChordSequencerSource' as keyof SliderState, sourceValue as SliderState[keyof SliderState]);
    if (!chordSequencerEnabled) return;
    const startPatch = enableChordSequencerSource(sourceValue);
    if (!isRunning) {
      onRequestPlaybackStart?.({
        ...startPatch,
        synthChordSequencerEnabled: true,
        synthChordSequencerSource: sourceValue as SliderState['synthChordSequencerSource'],
      });
    }
  }, [
    chordSequencerEnabled,
    enableChordSequencerSource,
    isRunning,
    onRequestPlaybackStart,
    onSelectChange,
  ]);

  const startSynthPlaybackForLaneRecording = useCallback((laneIdx: number) => {
    const safeLaneIdx = Math.max(0, Math.min(LANE_CONFIGS.length - 1, Math.round(laneIdx)));
    const startPatch: Partial<SliderState> = {
      synthEuclideanMasterEnabled: true,
      synthSequencerFaces: sequencerFaceState,
    };
    const activeLaneEnabledKey = SYNTH_LANE_ENABLED_KEYS[safeLaneIdx] ?? SYNTH_LANE_ENABLED_KEYS[0];

    enableSourceValueForPlayback(String(state[getSourceKey(safeLaneIdx)] ?? 'lead1'), startPatch);
    if (!Boolean(state[activeLaneEnabledKey])) {
      onSelectChange(activeLaneEnabledKey, true);
      startPatch[activeLaneEnabledKey] = true;
    }
    if (!state.synthEuclideanMasterEnabled) {
      onSelectChange('synthEuclideanMasterEnabled' as keyof SliderState, true);
    }
    onRequestPlaybackStart?.(startPatch);
  }, [
    enableSourceValueForPlayback,
    getSourceKey,
    onRequestPlaybackStart,
    onSelectChange,
    state.synthEuclid1Enabled,
    state.synthEuclid1Source,
    state.synthEuclid2Enabled,
    state.synthEuclid2Source,
    state.synthEuclid3Enabled,
    state.synthEuclid3Source,
    state.synthEuclid4Enabled,
    state.synthEuclid4Source,
    state.synthEuclideanMasterEnabled,
    sequencerFaceState,
  ]);

  const startSynthPlaybackForOverdub = useCallback(() => {
    startSynthPlaybackForLaneRecording(seq.activeTab);
  }, [seq.activeTab, startSynthPlaybackForLaneRecording]);

  const synthRecorderCountInBeats = useMemo(() => (
    Math.max(1, Math.round(Number(state.transportBeatsPerBar ?? 4) || 4))
  ), [state.transportBeatsPerBar]);

  const toggleSynthRecorderMetronome = useCallback(() => {
    setSynthRecorderMetronomeEnabled((enabled) => !enabled);
  }, []);

  const startGeneratedCaptureAfterCountIn = useCallback(() => {
    const arm = generatedCaptureStartArmRef.current;
    if (!arm) return;

    if (!isRunning) {
      setGeneratedCaptureStartArm({
        ...arm,
        phase: 'waitingForStart',
        waitingForBoundary: true,
        previousStep: null,
      });
      startSynthPlaybackForLaneRecording(arm.targetLaneIndex);
      return;
    }

    const stepCount = getTriggerStepCountForLane(arm.targetLaneIndex);
    const currentStep = normalizedRecorderStep(seq.playheads[arm.targetLaneIndex], stepCount);
    setGeneratedCaptureStartArm({
      ...arm,
      phase: 'waitingForStart',
      waitingForBoundary: true,
      previousStep: currentStep,
    });
  }, [
    getTriggerStepCountForLane,
    isRunning,
    seq.playheads,
    startSynthPlaybackForLaneRecording,
  ]);

  const generatedCaptureCountIn = useLiveOverdubRecorder({
    bpm: Number(state.sequencerMasterBPM ?? state.synthEuclidBaseBPM ?? 120),
    countInBeats: synthRecorderCountInBeats,
    metronomeEnabled: synthRecorderMetronomeEnabled,
    onMetronomeEnabledChange: setSynthRecorderMetronomeEnabled,
    onCountInComplete: startGeneratedCaptureAfterCountIn,
  });

  useEffect(() => {
    const arm = generatedCaptureStartArm;
    if (!arm?.waitingForBoundary || !isRunning) return;

    const stepCount = getTriggerStepCountForLane(arm.targetLaneIndex);
    const currentStep = normalizedRecorderStep(seq.playheads[arm.targetLaneIndex], stepCount);
    const previousStep = arm.previousStep;
    const crossedStart = previousStep !== null &&
      previousStep !== 0 &&
      (currentStep === 0 || currentStep < previousStep);

    if (currentStep === 0 || crossedStart) {
      startGeneratedCapture({
        sourceLaneIndex: arm.sourceLaneIndex,
        targetLaneIndex: arm.targetLaneIndex,
        sourceMode: arm.sourceMode,
      });
      setGeneratedCaptureStartArm(null);
      generatedCaptureCountIn.stop();
      return;
    }

    if (previousStep !== currentStep) {
      setGeneratedCaptureStartArm((current) => (
        current === arm
          ? { ...current, previousStep: currentStep }
          : current
      ));
    }
  }, [
    generatedCaptureCountIn.stop,
    generatedCaptureStartArm,
    getTriggerStepCountForLane,
    isRunning,
    seq.playheads,
    startGeneratedCapture,
  ]);

  const synthLiveOverdub = useLiveOverdubRecorder({
    bpm: Number(state.sequencerMasterBPM ?? state.synthEuclidBaseBPM ?? 120),
    countInBeats: synthRecorderCountInBeats,
    metronomeEnabled: synthRecorderMetronomeEnabled,
    onMetronomeEnabledChange: setSynthRecorderMetronomeEnabled,
    onCountInComplete: startSynthPlaybackForOverdub,
  });

  const writeSynthLiveOverdubCaptureNote = useCallback((
    laneIdx: number,
    triggerStep: number,
    targetStepFloat: number,
    pitchValue: number,
  ) => {
    const triggerStepCount = getTriggerStepCountForLane(laneIdx);
    if (triggerStepCount <= 0) {
      return { pitchStep: 0, pitchStepCount: 1, nudgeStepCount: 1, hasNudge: false };
    }
    const normalizedTriggerStep = ((triggerStep % triggerStepCount) + triggerStepCount) % triggerStepCount;
    let session = synthLiveOverdubCaptureRef.current;
    if (!session || session.laneIndex !== laneIdx) {
      const pitchSettings = fixedKeyboardRecordPitchSettings(
        seq.pitchSettings[laneIdx] ?? SYNTH_DEFAULT_PITCH_SETTINGS,
        harmonyState,
      );
      session = { laneIndex: laneIdx, events: [], nextEventOrder: 0, pitchSettings };
      synthLiveOverdubCaptureRef.current = session;
      seq.setPitchSettings((previous) => previous.map((settings, index) => (
        index === laneIdx ? pitchSettings : settings
      )));
    }

    const event: SynthLiveOverdubCaptureEvent = {
      targetStepIndex: normalizedTriggerStep,
      targetStepFloat,
      pitchValue,
      eventOrder: session.nextEventOrder,
    };
    session.nextEventOrder += 1;
    session.events.push(event);
    const committedEventLimit = clampEuclideanSubLaneSteps(session.events.length);
    const rawCapturedEvents = session.events.slice(0, committedEventLimit);
    const preserveTriggerSteps = canPreserveSynthLiveCaptureTriggerSteps(rawCapturedEvents, triggerStepCount);
    const capturedEvents = preserveTriggerSteps
      ? [...rawCapturedEvents].sort((left, right) => (
          left.targetStepIndex - right.targetStepIndex || left.eventOrder - right.eventOrder
        ))
      : rawCapturedEvents;
    const pitchStepCount = clampEuclideanSubLaneSteps(Math.max(1, capturedEvents.length));
    const pitchValues = capturedEvents.map((capturedEvent) => capturedEvent.pitchValue);
    const triggerPattern = synthLiveCaptureTriggerPattern(capturedEvents, triggerStepCount);
    const nudgeValues = synthLiveNudgeValues(capturedEvents, triggerPattern, preserveTriggerSteps);
    const hasNudge = nudgeValues.some((value) => Math.abs(value) > NUDGE_EPSILON);
    const pitchStep = Math.max(0, capturedEvents.findIndex((capturedEvent) => capturedEvent.eventOrder === event.eventOrder));

    seq.setStepOverrides((previous) => {
      const triggerMap = new Map<number, boolean>();
      for (let step = 0; step < triggerStepCount; step += 1) {
        triggerMap.set(step, triggerPattern[step] === true);
      }
      return {
        ...previous,
        triggerToggles: previous.triggerToggles.map((map, index) => (
          index === laneIdx ? triggerMap : map
        )),
        pitch: previous.pitch.map((values, index) => (
          index === laneIdx ? pitchValues : values
        )),
        nudge: previous.nudge.map((values, index) => (
          index === laneIdx ? nudgeValues : values
        )),
        pitchDirection: previous.pitchDirection.map((direction, index) => (
          index === laneIdx ? 'forward' : direction
        )),
        nudgeDirection: previous.nudgeDirection.map((direction, index) => (
          index === laneIdx ? 'forward' : direction
        )),
      };
    });

    return { pitchStep, pitchStepCount, nudgeStepCount: pitchStepCount, hasNudge };
  }, [getTriggerStepCountForLane, harmonyState, seq]);

  const recordSynthLiveOverdubNote = useCallback((midi: number) => {
    const laneIdx = seq.activeTab;
    const triggerStepCount = getTriggerStepCountForLane(laneIdx);
    if (triggerStepCount <= 0) return;
    const playheadStep = seq.playheads[laneIdx];
    const rawTargetStep = typeof playheadStep === 'number' && Number.isFinite(playheadStep)
      ? playheadStep
      : activeTriggerCursorStep;
    const targetStep = liveOverdubTargetStep(playheadStep, activeTriggerCursorStep, triggerStepCount);
    const session = synthLiveOverdubCaptureRef.current;
    const currentSettings = session?.laneIndex === laneIdx
      ? session.pitchSettings
      : fixedKeyboardRecordPitchSettings(seq.pitchSettings[laneIdx] ?? SYNTH_DEFAULT_PITCH_SETTINGS, harmonyState);

    if ((pitchBindingModes[laneIdx] ?? 'polyrhythmic') !== 'polyrhythmic') {
      setPitchBindingMode(laneIdx, 'polyrhythmic');
    }
    const pitchValue = midiToPitchOffsetForSettings(midi, currentSettings, null);
    const compactTarget = writeSynthLiveOverdubCaptureNote(laneIdx, targetStep, rawTargetStep, pitchValue);
    seq.setSubLaneStates((prev) => prev.map((laneState, index) => (
      index === laneIdx
        ? {
            ...laneState,
            pitch: {
              ...laneState.pitch,
              enabled: true,
              steps: compactTarget.pitchStepCount,
            },
            nudge: {
              ...laneState.nudge,
              enabled: compactTarget.hasNudge,
              steps: compactTarget.nudgeStepCount,
              direction: 'forward',
              followTriggerHits: true,
            },
          }
        : laneState
    )));
    setKeyboardSequenceCursorTarget('trigger');
    setTriggerKeyboardSteps((prev) => prev.map((value, index) => index === laneIdx ? targetStep : value));
    setPitchKeyboardSteps((prev) => prev.map((value, index) => index === laneIdx ? compactTarget.pitchStep : value));
    setNudgeKeyboardSteps((prev) => prev.map((value, index) => index === laneIdx ? compactTarget.pitchStep : value));
    seq.setViewMode('detail');
    seq.setOpenLane('pitch');
  }, [
    activeTriggerCursorStep,
    getTriggerStepCountForLane,
    harmonyState,
    pitchBindingModes,
    seq,
    setPitchBindingMode,
    writeSynthLiveOverdubCaptureNote,
  ]);

  const toggleSynthLiveOverdub = useCallback(() => {
    if (synthLiveOverdub.isArmed) {
      synthLiveOverdubCaptureRef.current = null;
      synthLiveOverdub.stop();
      return;
    }
    const laneIdx = seq.activeTab;
    const triggerStepCount = getTriggerStepCountForLane(laneIdx);
    const recordPitchSettings = fixedKeyboardRecordPitchSettings(
      seq.pitchSettings[laneIdx] ?? SYNTH_DEFAULT_PITCH_SETTINGS,
      harmonyState,
    );
    synthLiveOverdubCaptureRef.current = {
      laneIndex: laneIdx,
      events: [],
      nextEventOrder: 0,
      pitchSettings: recordPitchSettings,
    };
    setShowKeyboard(true);
    setKeyboardInputMode('sequence');
    setKeyboardSequenceCursorTarget('trigger');
    setPitchBindingMode(laneIdx, 'polyrhythmic');
    seq.setPitchSettings((previous) => previous.map((settings, index) => (
      index === laneIdx ? recordPitchSettings : settings
    )));
    seq.setParamSelect(laneIdx, 'Preset', 'custom' as never);
    seq.setViewMode('detail');
    seq.setOpenLane('pitch');
    if (triggerStepCount > 0) {
      seq.setSubLaneStates((prev) => prev.map((laneState, index) => (
        index === laneIdx
          ? {
              ...laneState,
              pitch: {
                ...laneState.pitch,
                enabled: true,
                steps: 1,
              },
              nudge: {
                ...laneState.nudge,
                enabled: false,
                steps: 1,
                direction: 'forward',
                followTriggerHits: true,
              },
            }
          : laneState
      )));
      seq.setStepOverrides((previous) => {
        const triggerMap = new Map<number, boolean>();
        for (let step = 0; step < triggerStepCount; step += 1) {
          triggerMap.set(step, false);
        }
        return {
          ...previous,
          triggerToggles: previous.triggerToggles.map((map, index) => (
            index === laneIdx ? triggerMap : map
          )),
          pitch: previous.pitch.map((values, index) => (
            index === laneIdx ? [0] : values
          )),
          nudge: previous.nudge.map((values, index) => (
            index === laneIdx ? [0] : values
          )),
          pitchDirection: previous.pitchDirection.map((direction, index) => (
            index === laneIdx ? 'forward' : direction
          )),
          nudgeDirection: previous.nudgeDirection.map((direction, index) => (
            index === laneIdx ? 'forward' : direction
          )),
        };
      });
    }
    synthLiveOverdub.start();
  }, [
    getTriggerStepCountForLane,
    harmonyState,
    seq,
    setPitchBindingMode,
    synthLiveOverdub.isArmed,
    synthLiveOverdub.start,
    synthLiveOverdub.stop,
  ]);

  const synthLiveOverdubStatus = synthLiveOverdub.status === 'count-in'
    ? `Count ${synthLiveOverdub.countInRemaining}`
    : synthLiveOverdub.status === 'recording'
      ? 'Recording'
      : 'Ready';

  const activeLaneUsesGeneratedRecorder =
    activeSequencerMode === 'anchorWalker' || activeSequencerMode === 'orbit';
  const generatedCaptureSessionForActiveLane =
    generatedCaptureSession &&
    (generatedCaptureSession.sourceLaneIndex === seq.activeTab ||
      generatedCaptureSession.targetLaneIndex === seq.activeTab)
      ? generatedCaptureSession
      : null;
  const generatedCaptureStartArmForActiveLane =
    generatedCaptureStartArm &&
    (generatedCaptureStartArm.sourceLaneIndex === seq.activeTab ||
      generatedCaptureStartArm.targetLaneIndex === seq.activeTab)
      ? generatedCaptureStartArm
      : null;
  const generatedRecorderActive =
    (
      generatedCaptureSessionForActiveLane?.active === true &&
      generatedCaptureSessionForActiveLane.sourceLaneIndex === seq.activeTab
    ) ||
    (
      generatedCaptureCountIn.isArmed &&
      generatedCaptureStartArmForActiveLane?.sourceLaneIndex === seq.activeTab
    );
  const synthRecorderActive = activeLaneUsesGeneratedRecorder
    ? generatedRecorderActive
    : synthLiveOverdub.isArmed;
  const synthRecorderStatus = (
    activeLaneUsesGeneratedRecorder &&
    generatedCaptureCountIn.status === 'count-in' &&
    generatedCaptureStartArmForActiveLane
  )
    ? `Count ${generatedCaptureCountIn.countInRemaining}`
    : (
        activeLaneUsesGeneratedRecorder &&
        generatedCaptureStartArmForActiveLane?.phase === 'waitingForStart'
      )
      ? 'Sync start'
      : generatedCaptureSessionForActiveLane?.status === 'committing'
        ? `Saving ${generatedCaptureCount} notes`
        : generatedCaptureSessionForActiveLane?.status === 'finishing'
          ? `Finishing ${generatedCaptureCount} notes`
        : generatedCaptureSessionForActiveLane?.status === 'waitingFirstTrigger'
          ? 'Waiting trigger'
        : generatedCaptureSessionForActiveLane?.status === 'committed'
          ? 'Saved to Step'
          : generatedCaptureSessionForActiveLane?.status === 'empty'
            ? 'No notes captured'
            : generatedRecorderActive
              ? `Capturing ${generatedCaptureCount} notes`
              : activeLaneUsesGeneratedRecorder
                ? `${activeSequencerMode === 'orbit' ? 'Orbit' : 'Walker'} capture`
                : synthLiveOverdubStatus;

  const toggleSynthRecorder = useCallback(() => {
    if (!activeLaneUsesGeneratedRecorder) {
      toggleSynthLiveOverdub();
      return;
    }
    if (generatedCaptureSession?.status === 'committing') return;
    if (generatedCaptureStartArm) {
      setGeneratedCaptureStartArm(null);
      generatedCaptureCountIn.stop();
      if (generatedCaptureSession?.active) {
        cancelGeneratedCapture();
      }
      return;
    }
    if (generatedCaptureSession?.active) {
      generatedCaptureCountIn.stop();
      if (generatedCaptureSession.sourceLaneIndex === seq.activeTab) {
        stopGeneratedCapture();
      } else {
        cancelGeneratedCapture();
      }
      return;
    }
    const sourceMode = activeSequencerMode === 'anchorWalker'
      ? 'anchorWalker'
      : activeSequencerMode === 'orbit'
        ? 'orbit'
        : null;
    if (!sourceMode) return;
    if (sourceMode === 'orbit') {
      startGeneratedCapture({
        sourceLaneIndex: seq.activeTab,
        targetLaneIndex: seq.activeTab,
        sourceMode,
        startMode: 'firstEvent',
      });
      if (!isRunning) {
        startSynthPlaybackForLaneRecording(seq.activeTab);
      }
      return;
    }
    setGeneratedCaptureStartArm({
      sourceLaneIndex: seq.activeTab,
      targetLaneIndex: seq.activeTab,
      sourceMode,
      phase: 'waitingForStart',
      waitingForBoundary: false,
      previousStep: null,
    });
    generatedCaptureCountIn.start();
  }, [
    activeLaneUsesGeneratedRecorder,
    activeSequencerMode,
    cancelGeneratedCapture,
    generatedCaptureCountIn,
    generatedCaptureSession,
    generatedCaptureStartArm,
    isRunning,
    seq.activeTab,
    startGeneratedCapture,
    startSynthPlaybackForLaneRecording,
    stopGeneratedCapture,
    toggleSynthLiveOverdub,
  ]);

  const generatedSequencerCaptureControls = activeLaneUsesGeneratedRecorder ? (
    <div className={`live-overdub-controls generated-face-capture${synthRecorderActive ? ' active' : ''}`}>
      <button
        type="button"
        className={`live-overdub-btn record${synthRecorderActive ? ' active' : ''}`}
        onClick={toggleSynthRecorder}
        aria-pressed={synthRecorderActive}
      >
        REC
      </button>
      <button
        type="button"
        className={`live-overdub-btn${synthRecorderMetronomeEnabled ? ' active' : ''}`}
        onClick={toggleSynthRecorderMetronome}
        aria-pressed={synthRecorderMetronomeEnabled}
      >
        Metro
      </button>
      <span className="live-overdub-status">{synthRecorderStatus}</span>
    </div>
  ) : null;

  const enterKeyboardSequenceMode = useCallback(() => {
    setKeyboardInputMode('sequence');
    setKeyboardSequenceCursorTarget(activePitchBindingMode === 'sequence' ? 'trigger' : 'pitch');
    seq.setViewMode('detail');
    seq.setOpenLane(getSynthKeyboardEditLane(seq.openLane));
    if (!(seq.subLaneStates[seq.activeTab]?.pitch.enabled ?? false)) {
      seq.toggleSubLaneEnabled(seq.activeTab, 'pitch');
    }
    selectTriggerSequenceStep(seq.activeTab, activeTriggerCursorStep);
    selectPitchSequenceStep(seq.activeTab, activePitchCursorStep);
  }, [
    activePitchBindingMode,
    activePitchCursorStep,
    activeTriggerCursorStep,
    getSynthKeyboardEditLane,
    selectPitchSequenceStep,
    selectTriggerSequenceStep,
    seq.activeTab,
    seq.openLane,
    seq.setOpenLane,
    seq.setViewMode,
    seq.subLaneStates,
    seq.toggleSubLaneEnabled,
  ]);

  const triggerKeyboardNote = useCallback((
    keyIndex: number,
    inputId: string,
    inputSource: 'computer-keyboard' | 'ui-pad',
  ) => {
    const layout = MANUAL_KEYBOARD_LAYOUT[keyIndex];
    if (!layout) return;
    const midi = keyboardBaseMidi + layout.semitone;
    if (!isProductManualSynthSource(effectiveKeyboardSource)) return;
    if (!liveNoteInput.noteOn(inputId, {
      source: inputSource,
      instrument: effectiveKeyboardSource,
      note: midi,
      velocity: MANUAL_KEYBOARD_VELOCITY,
    })) return;
    if (generatedCaptureIsCapturing) {
      const targetLaneIndex = generatedCaptureSession?.targetLaneIndex ?? seq.activeTab;
      const targetStepCount = generatedCaptureSession?.targetStepCount ?? getTriggerStepCountForLane(targetLaneIndex);
      const targetStep = liveOverdubTargetStep(
        seq.playheads[targetLaneIndex],
        activeTriggerCursorStep,
        targetStepCount,
      );
      captureGeneratedManualNote({
        midiNote: midi,
        velocity: MANUAL_KEYBOARD_VELOCITY,
        gateSeconds: 0.18,
        targetStepIndex: targetStep,
      });
    } else if (synthLiveOverdub.isRecording) {
      recordSynthLiveOverdubNote(midi);
    } else if (!synthLiveOverdub.isArmed && keyboardInputMode === 'sequence' && canWriteSequenceNotes) {
      writeKeyboardSequenceNote(seq.activeTab, midi);
    }
  }, [
    activeTriggerCursorStep,
    canWriteSequenceNotes,
    captureGeneratedManualNote,
    effectiveKeyboardSource,
    generatedCaptureIsCapturing,
    generatedCaptureSession?.targetLaneIndex,
    generatedCaptureSession?.targetStepCount,
    getTriggerStepCountForLane,
    keyboardBaseMidi,
    keyboardInputMode,
    liveNoteInput,
    recordSynthLiveOverdubNote,
    seq.activeTab,
    seq.playheads,
    synthLiveOverdub.isArmed,
    synthLiveOverdub.isRecording,
    writeKeyboardSequenceNote,
  ]);
  const releaseKeyboardNote = useCallback((inputId: string) => {
    liveNoteInput.noteOff(inputId);
  }, [liveNoteInput]);
  const toggleKeyboardPanel = useCallback(() => {
    setShowKeyboard((prev) => {
      const next = !prev;
      if (next) {
        setKeyboardSource(getDefaultKeyboardSource());
        setTriggerKeyboardSteps((steps) => steps.map((step, laneIdx) => {
          const stepCount = getTriggerStepCountForLane(laneIdx);
          if (stepCount <= 0) return 0;
          return step >= 0 && step < stepCount ? step : getFirstTriggerKeyboardStep(laneIdx);
        }));
        setPitchKeyboardSteps((steps) => steps.map((step, laneIdx) => {
          const stepCount = getPitchCursorStepCountForLane(laneIdx);
          if (stepCount <= 0) return 0;
          return step >= 0 && step < stepCount ? step : getFirstPitchKeyboardStep(laneIdx);
        }));
      }
      return next;
    });
  }, [
    getDefaultKeyboardSource,
    getFirstPitchKeyboardStep,
    getFirstTriggerKeyboardStep,
    getPitchCursorStepCountForLane,
    getTriggerStepCountForLane,
  ]);

  const cycleKeyboardPanelHotkeyState = useCallback(() => {
    if (!showKeyboard) {
      setKeyboardInputMode('play');
      setShowKeyboard(true);
      setKeyboardSource(getDefaultKeyboardSource());
      setTriggerKeyboardSteps((steps) => steps.map((step, laneIdx) => {
        const stepCount = getTriggerStepCountForLane(laneIdx);
        if (stepCount <= 0) return 0;
        return step >= 0 && step < stepCount ? step : getFirstTriggerKeyboardStep(laneIdx);
      }));
      setPitchKeyboardSteps((steps) => steps.map((step, laneIdx) => {
        const stepCount = getPitchCursorStepCountForLane(laneIdx);
        if (stepCount <= 0) return 0;
        return step >= 0 && step < stepCount ? step : getFirstPitchKeyboardStep(laneIdx);
      }));
      return;
    }

    if (keyboardInputMode === 'play') {
      enterKeyboardSequenceMode();
      return;
    }

    setShowKeyboard(false);
    setKeyboardInputMode('play');
  }, [
    enterKeyboardSequenceMode,
    getDefaultKeyboardSource,
    getFirstPitchKeyboardStep,
    getFirstTriggerKeyboardStep,
    getPitchCursorStepCountForLane,
    getTriggerStepCountForLane,
    keyboardInputMode,
    showKeyboard,
  ]);

  const cycleSynthViewMode = useCallback((direction: 1 | -1) => {
    const modes: SequencerViewMode[] = ['simple', 'detail', 'overview'];
    const currentIndex = modes.indexOf(seq.viewMode);
    const nextMode = modes[(currentIndex + direction + modes.length) % modes.length] ?? 'detail';
    seq.setViewMode(nextMode);
  }, [seq.viewMode, seq.setViewMode]);

  useEffect(() => {
    if (!isMobile) return;
    setShowKeyboard(false);
    setKeyboardInputMode('play');
  }, [isMobile]);

  useEffect(() => {
    if (showKeyboard) return;
    keyboardKeysRef.current?.releaseAll();
    liveNoteInput.releaseAll();
  }, [liveNoteInput, showKeyboard]);

  useEffect(() => {
    if (!(showKeyboard && keyboardInputMode === 'sequence')) return;
    seq.setViewMode('detail');
    if (!(seq.subLaneStates[seq.activeTab]?.pitch.enabled ?? false)) {
      seq.toggleSubLaneEnabled(seq.activeTab, 'pitch');
    }
  }, [keyboardInputMode, seq.activeTab, seq.setViewMode, seq.subLaneStates, seq.toggleSubLaneEnabled, showKeyboard]);

  useKeyboardScope({
    priority: 60,
    onKeyDown: (event) => {
      if (event.defaultPrevented || event.repeat || isEditableShortcutTarget(event.target)) return;
      if (event.shiftKey && event.code === 'KeyZ') {
        event.preventDefault();
        seq.toggleMute(seq.activeTab);
        return;
      }
      if (event.shiftKey && event.code === 'KeyX') {
        event.preventDefault();
        seq.toggleSolo(seq.activeTab);
        return;
      }
      if (event.code === 'KeyX') {
        event.preventDefault();
        toggleSequenceTriggerAtStep(seq.activeTab, activeTriggerCursorStep);
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        toggleSynthSequencerTransport();
        return;
      }
      if (event.code === 'KeyQ') {
        event.preventDefault();
        cycleKeyboardPanelHotkeyState();
        return;
      }
      if (event.code === 'Comma') {
        event.preventDefault();
        cycleSynthViewMode(-1);
        return;
      }
      if (event.code === 'Period') {
        event.preventDefault();
        cycleSynthViewMode(1);
      }
    },
  });

  useKeyboardScope({
    enabled: showKeyboard,
    priority: 50,
    onKeyDown: (event) => {
      if (event.defaultPrevented || event.repeat || isEditableShortcutTarget(event.target)) return;
      if (event.code === 'ShiftLeft') {
        leftShiftHeldRef.current = true;
        return;
      }
      if (event.code === 'KeyZ') {
        zHeldRef.current = true;
        return;
      }
      if (event.code === 'BracketLeft') {
        event.preventDefault();
        setKeyboardOctave((prev) => Math.max(MANUAL_KEYBOARD_MIN_OCTAVE, prev - 1));
        return;
      }
      if (event.code === 'BracketRight') {
        event.preventDefault();
        setKeyboardOctave((prev) => Math.min(MANUAL_KEYBOARD_MAX_OCTAVE, prev + 1));
        return;
      }
      if (keyboardInputMode === 'sequence') {
        if ((event.metaKey || event.ctrlKey) && event.code === 'KeyC') {
          if (chordSequencerSelected) {
            event.preventDefault();
            beginChordSequencerTriggerStampSourcePick();
            return;
          }
          if (activeKeyboardEditLane === 'trigger') {
            event.preventDefault();
            beginLinkedTriggerStampSourcePick();
          }
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.code === 'KeyV') {
          if (chordSequencerSelected) {
            event.preventDefault();
            pasteChordSequencerTriggerStamp(activeTriggerCursorStep);
            return;
          }
          if (activeKeyboardEditLane === 'trigger') {
            event.preventDefault();
            pasteActiveLinkedTriggerStamp();
          }
          return;
        }
        if (event.code === 'Escape' && (triggerStampMode || linkedTriggerStampMode || triggerStampPickSource || linkedTriggerStampPickSource)) {
          event.preventDefault();
          setTriggerStampMode(false);
          setTriggerStampPickSource(false);
          setLinkedTriggerStampMode(false);
          setLinkedTriggerStampPickSource(false);
          return;
        }
        if (event.code === 'Tab') {
          event.preventDefault();
          toggleSynthKeyboardLane();
          return;
        }
        if (leftShiftHeldRef.current && event.code === 'ArrowLeft') {
          event.preventDefault();
          cycleSynthKeyboardSequencer(-1);
          return;
        }
        if (leftShiftHeldRef.current && event.code === 'ArrowRight') {
          event.preventDefault();
          cycleSynthKeyboardSequencer(1);
          return;
        }
        if (leftShiftHeldRef.current && event.code === 'ArrowUp') {
          event.preventDefault();
          cycleSynthKeyboardLane(-1);
          return;
        }
        if (leftShiftHeldRef.current && event.code === 'ArrowDown') {
          event.preventDefault();
          cycleSynthKeyboardLane(1);
          return;
        }
        if (event.code === 'ArrowLeft') {
          event.preventDefault();
          if (zHeldRef.current) {
            adjustSynthKeyboardLaneSteps(-1);
            return;
          }
          selectSynthKeyboardLaneStep(
            seq.activeTab,
            activeKeyboardEditLane,
            findAdjacentSynthKeyboardLaneStep(seq.activeTab, activeKeyboardEditLane, activeSynthKeyboardStep, -1),
          );
          return;
        }
        if (event.code === 'ArrowRight') {
          event.preventDefault();
          if (zHeldRef.current) {
            adjustSynthKeyboardLaneSteps(1);
            return;
          }
          selectSynthKeyboardLaneStep(
            seq.activeTab,
            activeKeyboardEditLane,
            findAdjacentSynthKeyboardLaneStep(seq.activeTab, activeKeyboardEditLane, activeSynthKeyboardStep, 1),
          );
          return;
        }
        if (event.code === 'ArrowUp') {
          event.preventDefault();
          adjustSynthKeyboardLaneValue(1, !zHeldRef.current);
          return;
        }
        if (event.code === 'ArrowDown') {
          event.preventDefault();
          adjustSynthKeyboardLaneValue(-1, !zHeldRef.current);
          return;
        }
      }
      const keyIndex = MANUAL_KEYBOARD_INDEX_BY_CODE.get(event.code);
      if (keyIndex === undefined) return;
      event.preventDefault();
      const inputId = `keyboard:${event.code}`;
      keyboardKeysRef.current?.press(event.code, inputId);
      triggerKeyboardNote(keyIndex, inputId, 'computer-keyboard');
    },
    onKeyUp: (event) => {
      if (event.code === 'ShiftLeft') {
        leftShiftHeldRef.current = false;
        return;
      }
      if (event.code === 'KeyZ') {
        zHeldRef.current = false;
        return;
      }
      if (!MANUAL_KEYBOARD_INDEX_BY_CODE.has(event.code)) return;
      const inputId = `keyboard:${event.code}`;
      keyboardKeysRef.current?.release(inputId);
      releaseKeyboardNote(inputId);
    },
    onBlur: () => {
      leftShiftHeldRef.current = false;
      zHeldRef.current = false;
      keyboardKeysRef.current?.releaseAll();
      liveNoteInput.releaseAll();
    },
  });

  // ── ADSR renderer (per-lead: Lead 1 uses lead1* params, Lead 2 uses lead2* params) ──
  const renderLeadAdsr = (leadNum: 1 | 2) => {
    const voice = leadNum === 2 ? 'lead2' : 'lead1';
    const distance = voice === 'lead2' ? liveLead2Distance : liveLead1Distance;
    const distancePreview = voice === 'lead2' ? lead2DistancePreview : lead1DistancePreview;
    const useCustomAdsr = leadNum === 2 ? state.lead2UseCustomAdsr : state.lead1UseCustomAdsr;
    const customAdsrKey = leadNum === 2 ? 'lead2UseCustomAdsr' : 'lead1UseCustomAdsr';
    const attackKey = leadNum === 2 ? 'lead2Attack' : 'lead1Attack';
    const decayKey = leadNum === 2 ? 'lead2Decay' : 'lead1Decay';
    const sustainKey = leadNum === 2 ? 'lead2Sustain' : 'lead1Sustain';
    const holdKey = leadNum === 2 ? 'lead2Hold' : 'lead1Hold';
    const releaseKey = leadNum === 2 ? 'lead2Release' : 'lead1Release';
    const customEnv = {
      attack: state[attackKey], decay: state[decayKey],
      sustain: state[sustainKey], release: state[releaseKey],
    };
    const mp = useCustomAdsr ? null : getLeadPreviewMorphedParams(leadNum);
    const env = mp
      ? { attack: mp.attack, decay: mp.decay, sustain: mp.sustain, release: mp.release }
      : null;
    const hasPresetEnv = (
      !!env &&
      typeof env.attack === 'number' && typeof env.decay === 'number' &&
      typeof env.sustain === 'number' && typeof env.release === 'number' &&
      Number.isFinite(env.attack) && Number.isFinite(env.decay) &&
      Number.isFinite(env.sustain) && Number.isFinite(env.release)
    );
    if (!useCustomAdsr && !hasPresetEnv) return null;
    const safeEnv = useCustomAdsr ? customEnv : env!;

    if (
      typeof safeEnv.attack !== 'number' || typeof safeEnv.decay !== 'number' ||
      typeof safeEnv.sustain !== 'number' || typeof safeEnv.release !== 'number' ||
      !Number.isFinite(safeEnv.attack) || !Number.isFinite(safeEnv.decay) ||
      !Number.isFinite(safeEnv.sustain) || !Number.isFinite(safeEnv.release)
    ) {
      return null;
    }

    const sourceLabel = useCustomAdsr ? 'custom' : liveLeadMorphedParamsAvailable ? 'from runtime' : 'from preset';
    const distanceEnv = applyLeadDistanceEnvelope(voice, {
      attack: safeEnv.attack,
      decay: safeEnv.decay,
      sustain: safeEnv.sustain,
      hold: state[holdKey],
      release: safeEnv.release,
    }, distance);

    const accentColor = leadNum === 1 ? '#f59e0b' : '#06b6d4';
    const accentRgba = leadNum === 1 ? 'rgba(245,158,11,' : 'rgba(6,182,212,';

    return (
      <div style={{ marginTop: '8px' }}>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
          <button
            onClick={() => onSelectChange(customAdsrKey as keyof SliderState, false)}
            style={{
              padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer',
              fontSize: '0.7rem',
              background: !useCustomAdsr ? `${accentRgba}0.2)` : 'rgba(255,255,255,0.08)',
              color: !useCustomAdsr ? accentColor : '#999',
            }}
          >
            Preset ADSR
          </button>
          <button
            onClick={() => onSelectChange(customAdsrKey as keyof SliderState, true)}
            style={{
              padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer',
              fontSize: '0.7rem',
              background: useCustomAdsr ? `${accentRgba}0.2)` : 'rgba(255,255,255,0.08)',
              color: useCustomAdsr ? accentColor : '#999',
            }}
          >
            Custom ADSR
          </button>
        </div>
        <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '4px' }}>
          Envelope ({sourceLabel}) — A:{safeEnv.attack.toFixed(3)}s D:{safeEnv.decay.toFixed(2)}s S:{(safeEnv.sustain * 100).toFixed(0)}% R:{safeEnv.release.toFixed(2)}s
        </div>
        {distance > 0.001 && (
          <div style={{ fontSize: '0.68rem', color: '#888', marginBottom: '4px' }}>
            Distance target — A:{distanceEnv.attack.toFixed(3)}s D:{distanceEnv.decay.toFixed(2)}s S:{(distanceEnv.sustain * 100).toFixed(0)}% H:{(distanceEnv.hold ?? state[holdKey]).toFixed(2)}s R:{distanceEnv.release.toFixed(2)}s
          </div>
        )}
        <LeadAdsrViz
          attack={safeEnv.attack}
          decay={safeEnv.decay}
          sustain={safeEnv.sustain}
          hold={state[holdKey]}
          release={safeEnv.release}
          accentColor={accentColor}
          accentRgba={accentRgba}
          envelopeTimelineSeconds={padEnvelopeTimelineSeconds}
          onChange={useCustomAdsr ? (param, v) => onParamChange(param as keyof SliderState, v) : undefined}
          disabled={!useCustomAdsr}
          paramPrefix={leadNum === 2 ? 'lead2' : 'lead1'}
        />
        {useCustomAdsr && (
          <div style={{ marginTop: '8px' }}>
            <Slider label="Attack" value={state[attackKey]} paramKey={attackKey} unit="s" logarithmic ghostValue={getPreviewValue(distancePreview, attackKey)} onChange={onParamChange} {...sliderProps(attackKey)} />
            <Slider label="Decay" value={state[decayKey]} paramKey={decayKey} unit="s" logarithmic ghostValue={getPreviewValue(distancePreview, decayKey)} onChange={onParamChange} {...sliderProps(decayKey)} />
            <Slider label="Sustain" value={state[sustainKey]} paramKey={sustainKey} ghostValue={getPreviewValue(distancePreview, sustainKey)} onChange={onParamChange} {...sliderProps(sustainKey)} />
            <Slider label="Hold" value={state[holdKey]} paramKey={holdKey} unit="s" ghostValue={getPreviewValue(distancePreview, holdKey)} onChange={onParamChange} {...sliderProps(holdKey)} />
            <Slider label="Release" value={state[releaseKey]} paramKey={releaseKey} unit="s" logarithmic ghostValue={getPreviewValue(distancePreview, releaseKey)} onChange={onParamChange} {...sliderProps(releaseKey)} />
          </div>
        )}
      </div>
    );
  };

  const renderSampleSlotCard = (slotId: SampleSlotId) => {
    const config = SAMPLE_SLOT_UI[slotId];
    const expanded = isSynthSourceCardExpanded(slotId);
    const slot = readSampleSlotState(state as unknown as Record<string, unknown>, slotId);
    const enabled = slot.enabled;
    const library = sampleLibraryByKey.get(slot.libraryKey as never) ?? sampleLibraryByKey.get('piano');
    const resolvedLibraryKey = library?.libraryKey ?? 'piano';
    const librarySamples = library?.samples ?? [];
    const currentRole = slot.role;
    const currentArticulation = slot.articulation;
    const roleOptions = [
      { value: '', label: 'Default' },
      ...Array.from(new Set(librarySamples.map((sample) => sample.role).filter(Boolean)))
        .sort()
        .map((role) => ({ value: role, label: sampleOptionLabel(role) })),
    ];
    if (currentRole && !roleOptions.some((option) => option.value === currentRole)) {
      roleOptions.push({ value: currentRole, label: sampleOptionLabel(currentRole) });
    }
    const articulationOptions = [
      { value: '', label: 'Default' },
      ...Array.from(new Set(librarySamples.map((sample) => sample.articulation).filter(Boolean)))
        .sort()
        .map((articulation) => ({ value: articulation, label: sampleOptionLabel(articulation) })),
    ];
    if (currentArticulation && !articulationOptions.some((option) => option.value === currentArticulation)) {
      articulationOptions.push({ value: currentArticulation, label: sampleOptionLabel(currentArticulation) });
    }
    const stringValue = (key: keyof SliderState, fallback: string) => (
      typeof state[key] === 'string' ? String(state[key]) : fallback
    );
    const numberValue = (key: keyof SliderState, fallback: number) => {
      const value = state[key];
      return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    };
    const loopEnabled = slot.loopEnabled;
    const attackMs = numberValue(config.attackMsKey, slot.attackMs);
    const decayMs = numberValue(config.decayMsKey, slot.decayMs);
    const sustain = numberValue(config.sustainKey, slot.sustain);
    const holdMs = numberValue(config.holdMsKey, slot.holdMs);
    const releaseMs = numberValue(config.releaseMsKey, slot.releaseMs);
    const envelopeTimelineSeconds = padEnvelopeTimelineSeconds;

    return (
      <div key={slotId} className={`synth-card${editingSection === slotId ? ' editing' : ''}${expanded ? '' : ' collapsed'}`} style={{ '--sc': config.color } as React.CSSProperties}>
        <div
          className="synth-card-header clickable"
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onClick={() => toggleSynthSourceCard(slotId)}
          onKeyDown={(event) => handleSynthSourceHeaderKeyDown(event, slotId)}
        >
          <span className="sc-name">{config.label}</span>
          <button
            type="button"
            className={`sc-enable-btn${enabled ? ' on' : ''}`}
            aria-pressed={enabled}
            onClick={(event) => {
              event.stopPropagation();
              onSelectChange(config.enabledKey, !enabled as SliderState[keyof SliderState]);
            }}
          >
            {enabled ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            className={`sc-edit-btn${editingSection === slotId ? ' active' : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              toggleEdit(slotId);
            }}
            title={editingSection === slotId ? 'Close advanced' : 'Advanced parameters'}
          >
            {'\u270E'}
          </button>
        </div>

        {expanded && (
          <>
            <div className="synth-card-simple">
              <div className="sc-compact-grid-2">
                <Select
                  label="Library"
                  value={resolvedLibraryKey}
                  options={sampleLibraryOptions}
                  onChange={(value: string) => handleSampleLibraryChange(slotId, value)}
                />
                <Select
                  label="Selection"
                  value={stringValue(config.selectionModeKey, slot.selectionMode)}
                  options={sampleSelectionModeOptions}
                  onChange={(value: string) => onSelectChange(config.selectionModeKey, value as SliderState[keyof SliderState])}
                />
              </div>
              <div className="sc-compact-grid-2" style={{ marginTop: '6px' }}>
                <Select
                  label="Role"
                  value={currentRole}
                  options={roleOptions}
                  onChange={(value: string) => onSelectChange(config.roleKey, value as SliderState[keyof SliderState])}
                />
                <Select
                  label="Articulation"
                  value={currentArticulation}
                  options={articulationOptions}
                  onChange={(value: string) => onSelectChange(config.articulationKey, value as SliderState[keyof SliderState])}
                />
              </div>
              <div className="sc-compact-grid-2" style={{ marginTop: '6px' }}>
                <Select
                  label="Dynamics"
                  value={stringValue(config.dynamicModeKey, slot.dynamicMode)}
                  options={sampleDynamicModeOptions}
                  onChange={(value: string) => onSelectChange(config.dynamicModeKey, value as SliderState[keyof SliderState])}
                />
                <Select
                  label="Fixed"
                  value={stringValue(config.fixedDynamicKey, slot.fixedDynamic)}
                  options={sampleDynamicOptions}
                  onChange={(value: string) => onSelectChange(config.fixedDynamicKey, value as SliderState[keyof SliderState])}
                />
              </div>
              <div className="sc-compact-grid-2" style={{ marginTop: '6px' }}>
                <Select
                  label="Variant"
                  value={stringValue(config.variantModeKey, slot.variantMode)}
                  options={sampleVariantOptions}
                  onChange={(value: string) => onSelectChange(config.variantModeKey, value as SliderState[keyof SliderState])}
                />
                <button
                  type="button"
                  className={`sc-toggle-btn${loopEnabled ? ' on' : ''}`}
                  aria-pressed={loopEnabled}
                  onClick={() => onSelectChange(config.loopEnabledKey, !loopEnabled as SliderState[keyof SliderState])}
                >
                  Loop
                </button>
              </div>
              <div className="sc-compact-grid-2" style={{ marginTop: '8px' }}>
                <Slider label="Level" value={numberValue(config.levelKey, slot.level)} paramKey={config.levelKey} onChange={onParamChange} {...sliderProps(config.levelKey)} />
                <Slider label="Voices" value={numberValue(config.maxVoicesKey, slot.maxVoices)} paramKey={config.maxVoicesKey} onChange={onParamChange} {...sliderProps(config.maxVoicesKey)} />
              </div>
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '4px' }}>
                  Envelope — A:{formatEnvelopeSeconds(attackMs / 1000)} D:{formatEnvelopeSeconds(decayMs / 1000)} S:{formatEnvelopeSustain(sustain)} H:{formatEnvelopeSeconds(holdMs / 1000)} R:{formatEnvelopeSeconds(releaseMs / 1000)}
                </div>
                <LeadAdsrViz
                  attack={attackMs / 1000}
                  decay={decayMs / 1000}
                  sustain={sustain}
                  hold={holdMs / 1000}
                  release={releaseMs / 1000}
                  accentColor={config.color}
                  accentRgba={config.color}
                  envelopeTimelineSeconds={envelopeTimelineSeconds}
                  onChange={(param, value) => onParamChange(param as keyof SliderState, value)}
                  paramPrefix={slotId}
                />
              </div>
              <div className="sc-compact-grid-2" style={{ marginTop: '8px' }}>
                <Slider label="Attack" value={attackMs} paramKey={config.attackMsKey} unit=" ms" logarithmic onChange={onParamChange} {...sliderProps(config.attackMsKey)} />
                <Slider label="Decay" value={decayMs} paramKey={config.decayMsKey} unit=" ms" logarithmic onChange={onParamChange} {...sliderProps(config.decayMsKey)} />
                <Slider label="Sustain" value={sustain} paramKey={config.sustainKey} onChange={onParamChange} {...sliderProps(config.sustainKey)} />
                <Slider label="Hold" value={holdMs} paramKey={config.holdMsKey} unit=" ms" onChange={onParamChange} {...sliderProps(config.holdMsKey)} />
                <Slider label="Release" value={releaseMs} paramKey={config.releaseMsKey} unit=" ms" logarithmic onChange={onParamChange} {...sliderProps(config.releaseMsKey)} />
              </div>
            </div>

            {editingSection === slotId && (
              <div className="synth-card-advanced">
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Distance</div>
                  <Slider label="Distance" value={numberValue(config.distanceKey, 0)} paramKey={config.distanceKey} onChange={onParamChange} {...sliderProps(config.distanceKey)} />
                  <Slider label="Post LPF" value={numberValue(config.postLpfKey, slotId === 'sample1' ? 16000 : 18000)} paramKey={config.postLpfKey} unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps(config.postLpfKey)} />
                  <Slider label="Stereo Width" value={numberValue(config.stereoWidthKey, slotId === 'sample1' ? 0.85 : 1)} paramKey={config.stereoWidthKey} onChange={onParamChange} {...sliderProps(config.stereoWidthKey)} />
                  <Slider label="Diffuse Send" value={numberValue(config.diffuseSendKey, 0)} paramKey={config.diffuseSendKey} onChange={onParamChange} {...sliderProps(config.diffuseSendKey)} />
                </div>
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Routing</div>
                  <Slider label="Reverb Send" value={numberValue(config.reverbSendKey, slotId === 'sample1' ? 0.35 : 0.25)} paramKey={config.reverbSendKey} onChange={onParamChange} {...sliderProps(config.reverbSendKey)} />
                  <Slider label="Delay A Send" value={numberValue(config.delayASendKey, 0)} paramKey={config.delayASendKey} onChange={onParamChange} {...sliderProps(config.delayASendKey)} />
                  <Slider label="Delay B Send" value={numberValue(config.delayBSendKey, 0)} paramKey={config.delayBSendKey} onChange={onParamChange} {...sliderProps(config.delayBSendKey)} />
                  <Slider label="Granular Send" value={numberValue(config.granularSendKey, 0)} paramKey={config.granularSendKey} onChange={onParamChange} {...sliderProps(config.granularSendKey)} />
                  <Slider label="Degrade Send" value={numberValue(config.degradeSendKey, 0)} paramKey={config.degradeSendKey} onChange={onParamChange} {...sliderProps(config.degradeSendKey)} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // ═══════════════ Render ═══════════════
  const pad1CardExpanded = isSynthSourceCardExpanded('pad1');
  const pad2CardExpanded = isSynthSourceCardExpanded('pad2');
  const lead1CardExpanded = isSynthSourceCardExpanded('lead1');
  const lead2CardExpanded = isSynthSourceCardExpanded('lead2');

  return (
    <div className="synth-root">
      <div className="container">
        {/* ════════ LEFT: Sound Panels ════════ */}
        <div className="sound-panel">
          {/* ═══ Synth Source Identity ═══ */}
          <div className="synth-source-preset-bar fx-page-header fx-page-header--identity">
            <span className="synth-source-preset-label fx-page-title">∿ Synth</span>
          </div>

          {/* ── Pad Synth Card ── */}
          <div className={`synth-card${padTier > 0 ? ' editing' : ''}${pad1CardExpanded ? '' : ' collapsed'}`} style={{ '--sc': SOURCE_COLORS.pad1 } as React.CSSProperties}>
            <div
              className="synth-card-header clickable"
              role="button"
              tabIndex={0}
              aria-expanded={pad1CardExpanded}
              onClick={() => toggleSynthSourceCard('pad1')}
              onKeyDown={(event) => handleSynthSourceHeaderKeyDown(event, 'pad1')}
            >
              <span className="sc-name">Pad Synth</span>
              <button
                type="button"
                className={`sc-enable-btn${state.padEnabled ? ' on' : ''}`}
                aria-pressed={state.padEnabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectChange('padEnabled' as keyof SliderState, !state.padEnabled);
                }}
              >
                {state.padEnabled ? 'ON' : 'OFF'}
              </button>
              {/* Tier toggle buttons */}
              <button
                type="button"
                className={`sc-tier-btn${padTier >= 1 ? ' active' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setPadTier(padTier >= 1 ? 0 : 1);
                }}
                title="Primary controls"
                {...bindHelp('synthPadPrimaryTier')}
              >
                {'\u2699'}
              </button>
              <button
                type="button"
                className={`sc-tier-btn adv${padTier === 2 ? ' active' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setPadTier(padTier === 2 ? 1 : 2);
                }}
                title="Advanced controls"
                {...bindHelp('synthPadAdvancedTier')}
              >
                {'\u270E'}
              </button>
            </div>

            {pad1CardExpanded && (
              <>
            {/* ══ TIER 1 — Always visible: Presets + Interactive Viz ══ */}
            <div className="synth-card-simple sc-tier1">
              <SynthPresetManager
                engineScope="pad1"
                slotAKey={'padPresetA' as keyof SliderState}
                slotBKey={'padPresetB' as keyof SliderState}
                state={state}
                onSelectChange={handlePresetEndpointSelectChange}
                color="#4a9eff"
                onOpenPool={() => setPadPoolPopupSlot({ scope: 'pad1', slotKey: 'padPresetA' as keyof SliderState })}
                poolButtonTitle="Edit pad preset pool"
                poolButtonAriaLabel="Edit pad preset pool"
                variationControls={buildPadVariationControls('pad1')}
              />
              {/* Preset A / Morph / B — single row */}
              <div className="sc-morph-row">
                <span className="sc-morph-tag" style={{ color: '#4a9eff' }}>A</span>
                <div className="sc-preset-slot">
                  <select
                    value={state.padPresetA}
                    onChange={(e) => {
                      handlePresetEndpointSelectChange('padPresetA' as keyof SliderState, e.target.value);
                      blurSelectAfterChange(e.currentTarget);
                    }}
                    className="sc-preset-select"
                    style={{ borderColor: 'rgba(74,158,255,0.3)' }}
                  >
                    {renderPadPresetOptions(pad1PooledPresetOptions)}
                  </select>
                </div>
                <div className="sc-morph-slider">
                  <Slider label="" value={pad1MorphValue} paramKey="padMorph" onChange={handlePresetMorphSliderChange} {...sliderProps('padMorph')} disabled={pad1MorphSequencerLocked} />
                </div>
                <div className="sc-preset-slot">
                  <select
                    value={state.padPresetB}
                    onChange={(e) => {
                      handlePresetEndpointSelectChange('padPresetB' as keyof SliderState, e.target.value);
                      blurSelectAfterChange(e.currentTarget);
                    }}
                    className="sc-preset-select"
                    style={{ borderColor: 'rgba(139,92,246,0.3)' }}
                  >
                    {renderPadPresetOptions(pad1PooledPresetOptions)}
                  </select>
                </div>
                <span className="sc-morph-tag" style={{ color: '#8b5cf6' }}>B</span>
              </div>

              {/* Interactive Visualization — drag filter min/max & ADSR points */}
              <FilterLfoViz
                filterAType={state.filterType}
                filterACutoff={livePad1FilterMin + (livePad1FilterMax - livePad1FilterMin) * 0.5}
                filterARes={state.filterResonance}
                filterAQ={state.filterQ}
                filterASlope={state.filterSlope ?? 12}
                hardness={state.hardness}
                filterBEnabled={state.padFilterBEnabled ?? false}
                filterBType={state.padFilterBType ?? 'highpass'}
                filterBCutoff={state.padFilterBCutoff ?? 2000}
                filterBRes={state.padFilterBResonance ?? 0}
                filterRouting={state.padFilterRouting ?? 'series'}
                lfoWave={state.padLfo1Wave ?? 'sine'}
                lfoRate={state.padLfo1Rate ?? 0.5}
                lfoDepth={state.padLfo1Depth ?? 0}
                lfoDest={state.padLfo1Dest ?? 'none'}
                filterCutoffMin={livePad1FilterMin}
                filterCutoffMax={livePad1FilterMax}
                postLpfHz={livePad1PostLpf}
                synthAttack={state.synthAttack}
                synthDecay={state.synthDecay}
                synthSustain={state.synthSustain}
                synthHold={state.synthHold}
                synthRelease={state.synthRelease}
                envelopeTimelineSeconds={padEnvelopeTimelineSeconds}
                envelopeAccentColor={SOURCE_COLORS.pad1}
                modEnvEnabled={state.padModEnvEnabled}
                modEnvAttack={state.padModEnvAttack ?? 0.1}
                modEnvDecay={state.padModEnvDecay ?? 0.3}
                modEnvSustain={state.padModEnvSustain ?? 0}
                modEnvRelease={state.padModEnvRelease ?? 0.5}
                modEnvDepth={state.padModEnvDepth ?? 0}
                modEnvDest={state.padModEnvDest ?? 'filterCutoff'}
                liveFilterFreq={liveSourceTelemetryAvailable ? livePadViz.pad1FilterFreq : livePad1FilterMin + (livePad1FilterMax - livePad1FilterMin) * 0.5}
                liveLfoValue={liveSourceTelemetryAvailable ? livePadViz.pad1LfoValue : 0}
                isRunning={isRunning && liveSourceTelemetryAvailable}
                onFilterMinChange={(v) => onParamChange('filterCutoffMin', v)}
                onFilterMaxChange={(v) => onParamChange('filterCutoffMax', v)}
                onAdsrChange={(param, v) => onParamChange(param, v)}
                onModEnvChange={(param, v) => {
                  const modEnvMap: Record<typeof param, keyof SliderState> = {
                    attack: 'padModEnvAttack',
                    decay: 'padModEnvDecay',
                    sustain: 'padModEnvSustain',
                    release: 'padModEnvRelease',
                  };
                  onParamChange(modEnvMap[param], v);
                }}
              />

              {/* Drive + Osc Mix — same line */}
              <div className="sc-compact-grid-2">
                <Slider label="Drive" value={state.hardness} paramKey="hardness" ghostValue={getPreviewValue(pad1DistancePreview, 'hardness')} onChange={onParamChange} {...sliderProps('hardness')} />
                <Slider label="Osc Mix" value={state.padOscMix ?? 0.5} paramKey="padOscMix" onChange={onParamChange} {...sliderProps('padOscMix')} />
              </div>

              {/* Wave Fold — viz + slider + mode on one line */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <WaveFoldViz foldAmount={state.padFoldAmount ?? 0} foldMode={state.padFoldMode ?? 0} oscAWave={state.padOscAWave ?? 'sine'} oscBWave={state.padOscBWave ?? 'sine'} oscALevel={state.padOscALevel ?? 1} oscBLevel={state.padOscBLevel ?? 1} oscMix={state.padOscMix ?? 0.5} />
                <div style={{ flex: 1 }}>
                  <Slider label="Fold" value={state.padFoldAmount ?? 0} paramKey="padFoldAmount" onChange={onParamChange} {...sliderProps('padFoldAmount')} />
                </div>
                <Select
                  label=""
                  value={state.padFoldMode ?? 0}
                  options={[
                    { value: 0, label: 'Buchla' },
                    { value: 1, label: 'Sine' },
                    { value: 2, label: 'Serge' },
                  ]}
                  onChange={(v: number) => onSelectChange('padFoldMode' as keyof SliderState, v)}
                />
              </div>
            </div>

            {/* ══ TIER 2 — Primary controls ══ */}
            {padTier >= 1 && (
              <div className="synth-card-tier2">
                {/* ─── Envelope ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">
                    Envelope
                    <button
                      className={`sc-toggle-btn small${state.padFitEnvelopeToChord ? ' on' : ''}`}
                      onClick={() => onSelectChange('padFitEnvelopeToChord' as keyof SliderState, !state.padFitEnvelopeToChord)}
                    >
                      Fit Chord
                    </button>
                  </div>
                  <div className="sc-compact-grid-4">
                    <Slider label="Attack" value={state.synthAttack} paramKey="synthAttack" format={formatEnvelopeSeconds} logarithmic ghostValue={getPreviewValue(pad1DistancePreview, 'synthAttack')} onChange={onParamChange} {...sliderProps('synthAttack')} />
                    <Slider label="Decay" value={state.synthDecay} paramKey="synthDecay" format={formatEnvelopeSeconds} logarithmic ghostValue={getPreviewValue(pad1DistancePreview, 'synthDecay')} onChange={onParamChange} {...sliderProps('synthDecay')} />
                    <Slider label="Sustain" value={state.synthSustain} paramKey="synthSustain" format={formatEnvelopeSustain} ghostValue={getPreviewValue(pad1DistancePreview, 'synthSustain')} onChange={onParamChange} {...sliderProps('synthSustain')} />
                    <Slider label="Hold" value={state.synthHold} paramKey="synthHold" format={formatEnvelopeSeconds} ghostValue={getPreviewValue(pad1DistancePreview, 'synthHold')} onChange={onParamChange} {...sliderProps('synthHold')} />
                    <Slider label="Release" value={state.synthRelease} paramKey="synthRelease" format={formatEnvelopeSeconds} logarithmic ghostValue={getPreviewValue(pad1DistancePreview, 'synthRelease')} onChange={onParamChange} {...sliderProps('synthRelease')} />
                  </div>
                </div>

                {/* ─── Filter ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Filter</div>
                  <div className="sc-compact-row">
                    <Select
                      label="Type"
                      value={state.filterType}
                      options={[
                        { value: 'lowpass', label: 'LP' },
                        { value: 'bandpass', label: 'BP' },
                        { value: 'highpass', label: 'HP' },
                        { value: 'notch', label: 'Notch' },
                        { value: 'ladderLp', label: 'Ladder LP' },
                      ]}
                      onChange={(v: string) => onSelectChange('filterType' as keyof SliderState, v)}
                    />
                  </div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Min" value={state.filterCutoffMin} paramKey="filterCutoffMin" unit="Hz" logarithmic ghostValue={getPreviewValue(pad1DistancePreview, 'filterCutoffMin')} onChange={onParamChange} {...sliderProps('filterCutoffMin')} />
                    <Slider label="Max" value={state.filterCutoffMax} paramKey="filterCutoffMax" unit="Hz" logarithmic ghostValue={getPreviewValue(pad1DistancePreview, 'filterCutoffMax')} onChange={onParamChange} {...sliderProps('filterCutoffMax')} />
                  </div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Resonance" value={state.filterResonance} paramKey="filterResonance" onChange={onParamChange} {...sliderProps('filterResonance')} />
                    <Slider label="Q" value={state.filterQ} paramKey="filterQ" onChange={onParamChange} {...sliderProps('filterQ')} />
                  </div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Slope" value={state.filterSlope ?? 12} paramKey="filterSlope" unit=" dB/oct" onChange={onParamChange} {...sliderProps('filterSlope')} />
                    <Slider label="Key Track" value={state.filterKeyTracking ?? 0} paramKey="filterKeyTracking" onChange={onParamChange} {...sliderProps('filterKeyTracking')} />
                  </div>
                </div>

                <div className="sc-advanced-section">
                  <div className="sc-section-label">Space</div>
                  <div style={{ fontSize: '0.62rem', color: '#888', marginBottom: '6px' }}>
                    Distance pushes the pad back by darkening, narrowing, and increasing the diffuse halo.
                  </div>
                  <div className="sc-compact-grid-2">
                  <Slider label="Distance" value={state.padDistance} paramKey="padDistance" ghostValue={getDistanceGhostValue('padDistance', livePad1Distance)} onChange={onParamChange} {...sliderProps('padDistance')} />
                    <Slider label="Level" value={state.synthLevel} paramKey="synthLevel" ghostValue={getPreviewValue(pad1DistancePreview, 'synthLevel')} onChange={onParamChange} {...sliderProps('synthLevel')} />
                  </div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Reverb Send" value={state.pad1ReverbSend} paramKey="pad1ReverbSend" ghostValue={getPreviewValue(pad1DistancePreview, 'pad1ReverbSend')} onChange={onParamChange} {...sliderProps('pad1ReverbSend')} />
                    <Slider label="Post LPF" value={state.padPostLPF} paramKey="padPostLPF" unit=" Hz" logarithmic ghostValue={getPreviewValue(pad1DistancePreview, 'padPostLPF')} onChange={onParamChange} {...sliderProps('padPostLPF')} />
                  </div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Stereo Width" value={state.padStereoWidth} paramKey="padStereoWidth" ghostValue={getPreviewValue(pad1DistancePreview, 'padStereoWidth')} onChange={onParamChange} {...sliderProps('padStereoWidth')} />
                    <Slider label="Diffuse Send" value={state.padDiffuseSend} paramKey="padDiffuseSend" ghostValue={getPreviewValue(pad1DistancePreview, 'padDiffuseSend')} onChange={onParamChange} {...sliderProps('padDiffuseSend')} />
                  </div>
                </div>

                {/* ─── LFO ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">LFO</div>
                  <div className="sc-lfo-preset-row">
                    <label className="sc-lfo-preset-label">Preset</label>
                    <select
                      className="sc-lfo-preset-select"
                      value=""
                      onChange={(e) => {
                        const preset = LFO_PRESETS.find(p => p.id === e.target.value);
                        if (preset) {
                          onSelectChange('padLfo1Dest' as keyof SliderState, preset.dest);
                          onSelectChange('padLfo1Wave' as keyof SliderState, preset.wave);
                          onParamChange('padLfo1Rate' as keyof SliderState, preset.rate);
                          onParamChange('padLfo1Depth' as keyof SliderState, preset.depth);
                        }
                      }}
                      {...bindHelp('synthLfoPresetSelect')}
                    >
                      <option value="" disabled>Select LFO preset…</option>
                      {Object.entries(LFO_PRESET_CATEGORIES).map(([cat, label]) => (
                        <optgroup key={cat} label={label}>
                          {LFO_PRESETS.filter(p => p.category === cat).map(p => (
                            <option key={p.id} value={p.id} title={p.description}>{p.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="sc-compact-grid-2">
                    <Select
                      label="Dest"
                      value={state.padLfo1Dest ?? 'none'}
                      options={[
                        { value: 'none', label: 'Off' },
                        { value: 'filterCutoff', label: 'Filter A' },
                        { value: 'filterBCutoff', label: 'Filter B' },
                        { value: 'amplitude', label: 'Amp' },
                        { value: 'pitch', label: 'Pitch' },
                        { value: 'oscBLevel', label: 'Osc B' },
                        { value: 'foldAmount', label: 'Fold' },
                      ]}
                      onChange={(v: string) => onSelectChange('padLfo1Dest' as keyof SliderState, v)}
                      {...bindHelp('synthLfoDestSelect')}
                    />
                    {(state.padLfo1Dest ?? 'none') !== 'none' ? (
                      <Select
                        label="Wave"
                        value={state.padLfo1Wave ?? 'sine'}
                        options={[
                          { value: 'sine', label: 'Sine' },
                          { value: 'triangle', label: 'Tri' },
                          { value: 'sawtooth', label: 'Saw' },
                          { value: 'square', label: 'Sq' },
                          { value: 'sampleHold', label: 'S&H' },
                          { value: 'randomSmooth', label: 'Rnd' },
                          { value: 'randomWalk', label: 'Walk' },
                        ]}
                        onChange={(v: string) => onSelectChange('padLfo1Wave' as keyof SliderState, v)}
                        {...bindHelp('synthLfoWaveSelect')}
                      />
                    ) : <div />}
                  </div>
                  {(state.padLfo1Dest ?? 'none') !== 'none' && (
                    <div className="sc-compact-grid-2">
                      <Slider label="Rate" value={state.padLfo1Rate ?? 0.5} paramKey="padLfo1Rate" unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps('padLfo1Rate')} />
                      <Slider label="Depth" value={state.padLfo1Depth ?? 0} paramKey="padLfo1Depth" onChange={onParamChange} {...sliderProps('padLfo1Depth')} />
                    </div>
                  )}
                </div>

                {/* ─── LFO 2 ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">LFO 2</div>
                  <div className="sc-lfo-preset-row">
                    <label className="sc-lfo-preset-label">Preset</label>
                    <select
                      className="sc-lfo-preset-select"
                      value=""
                      onChange={(e) => {
                        const preset = LFO_PRESETS.find(p => p.id === e.target.value);
                        if (preset) {
                          onSelectChange('padLfo2Dest' as keyof SliderState, preset.dest);
                          onSelectChange('padLfo2Wave' as keyof SliderState, preset.wave);
                          onParamChange('padLfo2Rate' as keyof SliderState, preset.rate);
                          onParamChange('padLfo2Depth' as keyof SliderState, preset.depth);
                        }
                      }}
                      {...bindHelp('synthLfoPresetSelect')}
                    >
                      <option value="" disabled>Select LFO preset…</option>
                      {Object.entries(LFO_PRESET_CATEGORIES).map(([cat, label]) => (
                        <optgroup key={cat} label={label}>
                          {LFO_PRESETS.filter(p => p.category === cat).map(p => (
                            <option key={p.id} value={p.id} title={p.description}>{p.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="sc-compact-grid-2">
                    <Select
                      label="Dest"
                      value={state.padLfo2Dest ?? 'none'}
                      options={[
                        { value: 'none', label: 'Off' },
                        { value: 'filterCutoff', label: 'Filter A' },
                        { value: 'filterBCutoff', label: 'Filter B' },
                        { value: 'amplitude', label: 'Amp' },
                        { value: 'pitch', label: 'Pitch' },
                        { value: 'oscBLevel', label: 'Osc B' },
                        { value: 'foldAmount', label: 'Fold' },
                      ]}
                      onChange={(v: string) => onSelectChange('padLfo2Dest' as keyof SliderState, v)}
                      {...bindHelp('synthLfoDestSelect')}
                    />
                    {(state.padLfo2Dest ?? 'none') !== 'none' ? (
                      <Select
                        label="Wave"
                        value={state.padLfo2Wave ?? 'sine'}
                        options={[
                          { value: 'sine', label: 'Sine' },
                          { value: 'triangle', label: 'Tri' },
                          { value: 'sawtooth', label: 'Saw' },
                          { value: 'square', label: 'Sq' },
                          { value: 'sampleHold', label: 'S&H' },
                          { value: 'randomSmooth', label: 'Rnd' },
                          { value: 'randomWalk', label: 'Walk' },
                        ]}
                        onChange={(v: string) => onSelectChange('padLfo2Wave' as keyof SliderState, v)}
                        {...bindHelp('synthLfoWaveSelect')}
                      />
                    ) : <div />}
                  </div>
                  {(state.padLfo2Dest ?? 'none') !== 'none' && (
                    <div className="sc-compact-grid-2">
                      <Slider label="Rate" value={state.padLfo2Rate ?? 0.5} paramKey="padLfo2Rate" unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps('padLfo2Rate')} />
                      <Slider label="Depth" value={state.padLfo2Depth ?? 0} paramKey="padLfo2Depth" onChange={onParamChange} {...sliderProps('padLfo2Depth')} />
                    </div>
                  )}
                </div>

                {/* ─── Oscillators (compact 2-col grid) ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Oscillators</div>
                  <div className="sc-osc-grid">
                    {/* Osc A */}
                    <div className="sc-osc-block">
                      <div className="sc-osc-block-label">Osc A</div>
                      <Select
                        label=""
                        value={state.padOscAWave ?? 'sawtooth'}
                        options={[
                          { value: 'sine', label: 'Sin' },
                          { value: 'triangle', label: 'Tri' },
                          { value: 'sawtooth', label: 'Saw' },
                          { value: 'square', label: 'Sq' },
                        ]}
                        onChange={(v: string) => onSelectChange('padOscAWave' as keyof SliderState, v)}
                      />
                      <div className="sc-inline-slider">
                        <Slider label="Lvl" value={state.padOscALevel ?? 0.6} paramKey="padOscALevel" onChange={onParamChange} {...sliderProps('padOscALevel')} />
                      </div>
                      <div className="sc-inline-slider">
                        <Slider label="Oct" value={state.padOscAOctave ?? 0} paramKey="padOscAOctave" onChange={onParamChange} {...sliderProps('padOscAOctave')} />
                      </div>
                      <div className="sc-inline-slider">
                        <Slider label="Det" value={state.padOscADetune ?? 0} paramKey="padOscADetune" onChange={onParamChange} {...sliderProps('padOscADetune')} />
                      </div>
                    </div>
                    {/* Osc B */}
                    <div className="sc-osc-block">
                      <div className="sc-osc-block-label">Osc B</div>
                      <Select
                        label=""
                        value={state.padOscBWave ?? 'triangle'}
                        options={[
                          { value: 'sine', label: 'Sin' },
                          { value: 'triangle', label: 'Tri' },
                          { value: 'sawtooth', label: 'Saw' },
                          { value: 'square', label: 'Sq' },
                        ]}
                        onChange={(v: string) => onSelectChange('padOscBWave' as keyof SliderState, v)}
                      />
                      <div className="sc-inline-slider">
                        <Slider label="Lvl" value={state.padOscBLevel ?? 0.4} paramKey="padOscBLevel" onChange={onParamChange} {...sliderProps('padOscBLevel')} />
                      </div>
                      <div className="sc-inline-slider">
                        <Slider label="Oct" value={state.padOscBOctave ?? 0} paramKey="padOscBOctave" onChange={onParamChange} {...sliderProps('padOscBOctave')} />
                      </div>
                      <div className="sc-inline-slider">
                        <Slider label="Det" value={state.padOscBDetune ?? 0} paramKey="padOscBDetune" onChange={onParamChange} {...sliderProps('padOscBDetune')} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══ TIER 3 — Advanced controls ══ */}
            {padTier === 2 && (
              <div className="synth-card-advanced">
                {/* ─── Auto Morph ─── */}
                <div className="sc-morph-auto-row">
                  <button
                    className={`sc-toggle-btn${state.padMorphAuto ? ' on' : ''}`}
                    onClick={() => onSelectChange('padMorphAuto' as keyof SliderState, !state.padMorphAuto)}
                  >
                    {state.padMorphAuto ? '● Auto Morph' : '○ Auto Morph'}
                  </button>
                  <div style={{ flex: 1 }}>
                    <Slider label="Speed" value={state.padMorphSpeed} paramKey="padMorphSpeed" unit=" phr" onChange={onParamChange} {...sliderProps('padMorphSpeed')} />
                  </div>
                </div>



                {/* ─── Sub Oscillator ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">
                    Sub Oscillator
                    <button
                      className={`sc-toggle-btn small${state.padSubEnabled ? ' on' : ''}`}
                      onClick={() => onSelectChange('padSubEnabled' as keyof SliderState, !state.padSubEnabled)}
                    >
                      {state.padSubEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {state.padSubEnabled && (
                    <div className="sc-compact-grid-2">
                      <div>
                        <Select
                          label="Wave"
                          value={state.padSubWave ?? 'sine'}
                          options={[
                            { value: 'sine', label: 'Sine' },
                            { value: 'triangle', label: 'Triangle' },
                          ]}
                          onChange={(v: string) => onSelectChange('padSubWave' as keyof SliderState, v)}
                        />
                        <Slider label="Level" value={state.padSubLevel ?? 0.3} paramKey="padSubLevel" onChange={onParamChange} {...sliderProps('padSubLevel')} />
                      </div>
                      <div>
                        <Slider label="Octave" value={state.padSubOctave ?? -1} paramKey="padSubOctave" onChange={onParamChange} {...sliderProps('padSubOctave')} />
                      </div>
                    </div>
                  )}
                </div>

                {/* ─── Noise ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Noise</div>
                  <div className="sc-compact-grid-2">
                    <Select
                      label="Type"
                      value={state.padNoiseType ?? 'white'}
                      options={[
                        { value: 'white', label: 'White' },
                        { value: 'pink', label: 'Pink' },
                      ]}
                      onChange={(v: string) => onSelectChange('padNoiseType' as keyof SliderState, v)}
                    />
                    <Slider label="Level" value={state.padNoiseLevel ?? 0.15} paramKey="padNoiseLevel" onChange={onParamChange} {...sliderProps('padNoiseLevel')} />
                  </div>
                </div>

                {/* ─── Character ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Character</div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Warmth" value={state.warmth} paramKey="warmth" ghostValue={getPreviewValue(pad1DistancePreview, 'warmth')} onChange={onParamChange} {...sliderProps('warmth')} />
                    <Slider label="Presence" value={state.presence} paramKey="presence" ghostValue={getPreviewValue(pad1DistancePreview, 'presence')} onChange={onParamChange} {...sliderProps('presence')} />
                  </div>
                  {/* Legacy: global detune — superseded by per-osc detune */}
                </div>

                {/* ─── Mod Envelope ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">
                    Mod Envelope
                    <button
                      className={`sc-toggle-btn small${state.padModEnvEnabled ? ' on' : ''}`}
                      onClick={() => onSelectChange('padModEnvEnabled' as keyof SliderState, !state.padModEnvEnabled)}
                      {...bindHelp('synthModEnvEnable')}
                    >
                      {state.padModEnvEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {state.padModEnvEnabled && (
                    <>
                      <Select
                        label="Target"
                        value={state.padModEnvDest ?? 'filterCutoff'}
                        options={[
                          { value: 'filterCutoff', label: 'Filter Cutoff' },
                          { value: 'pitch', label: 'Pitch' },
                          { value: 'oscBLevel', label: 'Osc B Level' },
                          { value: 'foldAmount', label: 'Fold' },
                        ]}
                        onChange={(v: string) => onSelectChange('padModEnvDest' as keyof SliderState, v)}
                        {...bindHelp('synthModEnvTarget')}
                      />
                      <Slider label="Depth" value={state.padModEnvDepth ?? 0} paramKey="padModEnvDepth" onChange={onParamChange} {...sliderProps('padModEnvDepth')} />
                      <div className="sc-compact-grid-4">
                        <Slider label="Attack" value={state.padModEnvAttack ?? 0.1} paramKey="padModEnvAttack" format={formatEnvelopeSeconds} logarithmic onChange={onParamChange} {...sliderProps('padModEnvAttack')} />
                        <Slider label="Decay" value={state.padModEnvDecay ?? 0.3} paramKey="padModEnvDecay" format={formatEnvelopeSeconds} logarithmic onChange={onParamChange} {...sliderProps('padModEnvDecay')} />
                        <Slider label="Sustain" value={state.padModEnvSustain ?? 0} paramKey="padModEnvSustain" format={formatEnvelopeSustain} onChange={onParamChange} {...sliderProps('padModEnvSustain')} />
                        <Slider label="Release" value={state.padModEnvRelease ?? 0.5} paramKey="padModEnvRelease" format={formatEnvelopeSeconds} logarithmic onChange={onParamChange} {...sliderProps('padModEnvRelease')} />
                      </div>
                    </>
                  )}
                </div>

                {/* ─── Filter B ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">
                    Filter B
                    <button
                      className={`sc-toggle-btn small${state.padFilterBEnabled ? ' on' : ''}`}
                      onClick={() => onSelectChange('padFilterBEnabled' as keyof SliderState, !state.padFilterBEnabled)}
                    >
                      {state.padFilterBEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {state.padFilterBEnabled && (
                    <>
                      <Select
                        label="Type"
                        value={state.padFilterBType ?? 'highpass'}
                        options={[
                          { value: 'lowpass', label: 'Lowpass' },
                          { value: 'bandpass', label: 'Bandpass' },
                          { value: 'highpass', label: 'Highpass' },
                          { value: 'notch', label: 'Notch' },
                        ]}
                        onChange={(v: string) => onSelectChange('padFilterBType' as keyof SliderState, v)}
                      />
                      <div className="sc-compact-grid-2">
                        <Slider label="Cutoff" value={state.padFilterBCutoff ?? 200} paramKey="padFilterBCutoff" unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps('padFilterBCutoff')} />
                        <Slider label="Res" value={state.padFilterBResonance ?? 0.2} paramKey="padFilterBResonance" onChange={onParamChange} {...sliderProps('padFilterBResonance')} />
                      </div>
                      <Slider label="Q" value={state.padFilterBQ ?? 1} paramKey="padFilterBQ" onChange={onParamChange} {...sliderProps('padFilterBQ')} />
                    </>
                  )}
                </div>

                {/* ─── Filter Routing ─── */}
                {state.padFilterBEnabled && (
                  <div className="sc-advanced-section">
                    <div className="sc-section-label">Routing</div>
                    <Select
                      label="Mode"
                      value={state.padFilterRouting ?? 'series'}
                      options={[
                        { value: 'series', label: 'Series (A → B)' },
                        { value: 'aOnly', label: 'A Only' },
                        { value: 'bOnly', label: 'B Only' },
                      ]}
                      onChange={(v: string) => onSelectChange('padFilterRouting' as keyof SliderState, v)}
                      {...bindHelp('synthFilterRoutingMode')}
                    />
                  </div>
                )}

                {/* ─── Voices ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Voices</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.65rem', color: '#888' }}>Assignments</span>
                    <span style={{ fontSize: '0.55rem', color: '#666' }}>
                      {padVoiceAssignmentSummary(state)}
                    </span>
                  </div>
                  <div className="voice-mask-row">
                    {PAD_VOICE_NUMBERS.map(voice => {
                      const assignment = padVoiceAssignment(state, voice);
                      return (
                        <button
                          key={voice}
                          className={`voice-mask-btn ${assignment !== 'off' ? 'active' : ''}`}
                          onClick={() => cyclePadVoiceAssignment(voice)}
                          style={padVoiceButtonStyle(voice, assignment)}
                          title={`Voice ${voice} · ${padVoiceAssignmentLabel(assignment)}`}
                          {...bindHelp('synthVoiceMaskToggle', { label: `Voice ${voice}` })}
                        >
                          {voice}
                        </button>
                      );
                    })}
                  </div>
                  <Slider label="Octave Offset" value={state.synthOctave} paramKey="synthOctave" onChange={onParamChange} {...sliderProps('synthOctave')} />
                </div>
              </div>
            )}
              </>
            )}
          </div>

          {/* ── Pad 2 Card ── */}
          <div className={`synth-card${pad2Tier > 0 ? ' editing' : ''}${pad2CardExpanded ? '' : ' collapsed'}`} style={{ '--sc': SOURCE_COLORS.pad2 } as React.CSSProperties}>
            <div
              className="synth-card-header clickable"
              role="button"
              tabIndex={0}
              aria-expanded={pad2CardExpanded}
              onClick={() => toggleSynthSourceCard('pad2')}
              onKeyDown={(event) => handleSynthSourceHeaderKeyDown(event, 'pad2')}
            >
              <span className="sc-name">Pad 2</span>
              <button
                type="button"
                className={`sc-enable-btn${state.pad2Enabled ? ' on' : ''}`}
                aria-pressed={state.pad2Enabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectChange('pad2Enabled' as keyof SliderState, !state.pad2Enabled);
                }}
              >
                {state.pad2Enabled ? 'ON' : 'OFF'}
              </button>
              {pad2CardExpanded && (
                <button
                  type="button"
                  className={`sc-tier-btn${pad2Tier >= 1 ? ' active' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPad2Tier(pad2Tier >= 1 ? 0 : 1);
                  }}
                  title="Primary controls"
                  {...bindHelp('synthPadPrimaryTier')}
                >
                  {'\u2699'}
                </button>
              )}
              {pad2CardExpanded && (
                <button
                  type="button"
                  className={`sc-tier-btn adv${pad2Tier === 2 ? ' active' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPad2Tier(pad2Tier === 2 ? 1 : 2);
                  }}
                  title="Advanced controls"
                  {...bindHelp('synthPadAdvancedTier')}
                >
                  {'\u270E'}
                </button>
              )}
            </div>

            {pad2CardExpanded && (<>
            {/* ══ TIER 1 — Always visible: Presets + Viz + Drive + Voice Assign ══ */}
            <div className="synth-card-simple sc-tier1">
              <SynthPresetManager
                engineScope="pad2"
                slotAKey={'pad2PresetA' as keyof SliderState}
                slotBKey={'pad2PresetB' as keyof SliderState}
                state={state}
                onSelectChange={handlePresetEndpointSelectChange}
                color="#8b5cf6"
                onOpenPool={() => setPadPoolPopupSlot({ scope: 'pad2', slotKey: 'pad2PresetA' as keyof SliderState })}
                poolButtonTitle="Edit pad preset pool"
                poolButtonAriaLabel="Edit pad preset pool"
                variationControls={buildPadVariationControls('pad2')}
              />
              {/* Preset A/B morph */}
              {/* Preset A / Morph / B — single row */}
              <div className="sc-morph-row">
                <span className="sc-morph-tag" style={{ color: '#8b5cf6' }}>A</span>
                <div className="sc-preset-slot">
                  <select
                    value={state.pad2PresetA}
                    onChange={(e) => {
                      handlePresetEndpointSelectChange('pad2PresetA' as keyof SliderState, e.target.value);
                      blurSelectAfterChange(e.currentTarget);
                    }}
                    className="sc-preset-select"
                    style={{ borderColor: 'rgba(139,92,246,0.3)' }}
                  >
                    {renderPadPresetOptions(pad2PooledPresetOptions)}
                  </select>
                </div>
                <div className="sc-morph-slider">
                  <Slider label="" value={pad2MorphValue} paramKey="pad2Morph" onChange={handlePresetMorphSliderChange} {...sliderProps('pad2Morph')} disabled={pad2MorphSequencerLocked} />
                </div>
                <div className="sc-preset-slot">
                  <select
                    value={state.pad2PresetB}
                    onChange={(e) => {
                      handlePresetEndpointSelectChange('pad2PresetB' as keyof SliderState, e.target.value);
                      blurSelectAfterChange(e.currentTarget);
                    }}
                    className="sc-preset-select"
                    style={{ borderColor: 'rgba(236,72,153,0.3)' }}
                  >
                    {renderPadPresetOptions(pad2PooledPresetOptions)}
                  </select>
                </div>
                <span className="sc-morph-tag" style={{ color: '#ec4899' }}>B</span>
              </div>

              {/* Interactive Visualization */}
              <FilterLfoViz
                filterAType={state.pad2FilterType ?? 'lowpass'}
                filterACutoff={livePad2FilterMin + (livePad2FilterMax - livePad2FilterMin) * 0.5}
                filterARes={state.pad2FilterResonance ?? 0.2}
                filterAQ={state.pad2FilterQ ?? 1}
                filterASlope={state.pad2FilterSlope ?? 12}
                hardness={state.pad2Hardness ?? 0.3}
                filterBEnabled={state.pad2FilterBEnabled ?? false}
                filterBType={state.pad2FilterBType ?? 'highpass'}
                filterBCutoff={state.pad2FilterBCutoff ?? 2000}
                filterBRes={state.pad2FilterBResonance ?? 0}
                filterRouting={state.pad2FilterRouting ?? 'series'}
                lfoWave={state.pad2Lfo1Wave ?? 'sine'}
                lfoRate={state.pad2Lfo1Rate ?? 0.5}
                lfoDepth={state.pad2Lfo1Depth ?? 0}
                lfoDest={state.pad2Lfo1Dest ?? 'none'}
                filterCutoffMin={livePad2FilterMin}
                filterCutoffMax={livePad2FilterMax}
                postLpfHz={livePad2PostLpf}
                synthAttack={state.pad2Attack ?? 6}
                synthDecay={state.pad2Decay ?? 1}
                synthSustain={state.pad2Sustain ?? 0.8}
                synthHold={state.pad2Hold ?? 1}
                synthRelease={state.pad2Release ?? 12}
                envelopeTimelineSeconds={padEnvelopeTimelineSeconds}
                envelopeAccentColor={SOURCE_COLORS.pad2}
                modEnvEnabled={state.pad2ModEnvEnabled}
                modEnvAttack={state.pad2ModEnvAttack ?? 0.1}
                modEnvDecay={state.pad2ModEnvDecay ?? 0.3}
                modEnvSustain={state.pad2ModEnvSustain ?? 0}
                modEnvRelease={state.pad2ModEnvRelease ?? 0.5}
                modEnvDepth={state.pad2ModEnvDepth ?? 0}
                modEnvDest={state.pad2ModEnvDest ?? 'filterCutoff'}
                liveFilterFreq={liveSourceTelemetryAvailable ? livePadViz.pad2FilterFreq : livePad2FilterMin + (livePad2FilterMax - livePad2FilterMin) * 0.5}
                liveLfoValue={liveSourceTelemetryAvailable ? livePadViz.pad2LfoValue : 0}
                isRunning={isRunning && liveSourceTelemetryAvailable}
                onFilterMinChange={(v) => onParamChange('pad2FilterCutoffMin', v)}
                onFilterMaxChange={(v) => onParamChange('pad2FilterCutoffMax', v)}
                onAdsrChange={(param, v) => {
                  const pad2Map: Record<string, string> = {
                    synthAttack: 'pad2Attack', synthDecay: 'pad2Decay',
                    synthSustain: 'pad2Sustain', synthHold: 'pad2Hold', synthRelease: 'pad2Release',
                  };
                  onParamChange((pad2Map[param] || param) as keyof SliderState, v);
                }}
                onModEnvChange={(param, v) => {
                  const modEnvMap: Record<typeof param, keyof SliderState> = {
                    attack: 'pad2ModEnvAttack',
                    decay: 'pad2ModEnvDecay',
                    sustain: 'pad2ModEnvSustain',
                    release: 'pad2ModEnvRelease',
                  };
                  onParamChange(modEnvMap[param], v);
                }}
              />

              {/* Drive + Osc Mix */}
              <div className="sc-compact-grid-2">
                <Slider label="Drive" value={state.pad2Hardness} paramKey="pad2Hardness" ghostValue={getPreviewValue(pad2DistancePreview, 'pad2Hardness')} onChange={onParamChange} {...sliderProps('pad2Hardness')} />
                <Slider label="Osc Mix" value={state.pad2OscMix ?? 0.5} paramKey="pad2OscMix" onChange={onParamChange} {...sliderProps('pad2OscMix')} />
              </div>

              {/* Wave Fold — viz + slider + mode on one line */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <WaveFoldViz foldAmount={state.pad2FoldAmount ?? 0} foldMode={state.pad2FoldMode ?? 0} oscAWave={state.pad2OscAWave ?? 'sine'} oscBWave={state.pad2OscBWave ?? 'sine'} oscALevel={state.pad2OscALevel ?? 1} oscBLevel={state.pad2OscBLevel ?? 1} oscMix={state.pad2OscMix ?? 0.5} />
                <div style={{ flex: 1 }}>
                  <Slider label="Fold" value={state.pad2FoldAmount ?? 0} paramKey="pad2FoldAmount" onChange={onParamChange} {...sliderProps('pad2FoldAmount')} />
                </div>
                <Select
                  label=""
                  value={state.pad2FoldMode ?? 0}
                  options={[
                    { value: 0, label: 'Buchla' },
                    { value: 1, label: 'Sine' },
                    { value: 2, label: 'Serge' },
                  ]}
                  onChange={(v: number) => onSelectChange('pad2FoldMode' as keyof SliderState, v)}
                />
              </div>

              {/* Shared voice assignment */}
              <div className="sc-advanced-section" style={{ marginTop: '4px' }}>
                <div className="sc-section-label" style={{ fontSize: '0.65rem' }}>Voice Assignment</div>
                <div style={{ fontSize: '0.55rem', color: '#888', marginBottom: '4px' }}>
                  {padVoiceAssignmentSummary(state)}
                </div>
                <div className="voice-mask-row">
                  {PAD_VOICE_NUMBERS.map(voice => {
                    const assignment = padVoiceAssignment(state, voice);
                    return (
                      <button
                        key={voice}
                        className={`voice-mask-btn ${assignment !== 'off' ? 'active' : ''}`}
                        onClick={() => cyclePadVoiceAssignment(voice)}
                        style={padVoiceButtonStyle(voice, assignment)}
                        title={`Voice ${voice} · ${padVoiceAssignmentLabel(assignment)}`}
                        {...bindHelp('synthPad2VoiceAssign', { label: `Voice ${voice}` })}
                      >
                        {voice}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ══ TIER 2 — Primary controls ══ */}
            {pad2Tier >= 1 && (
              <div className="synth-card-tier2">
                {/* ─── Envelope ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">
                    Envelope
                    <button
                      className={`sc-toggle-btn small${state.pad2FitEnvelopeToChord ? ' on' : ''}`}
                      onClick={() => onSelectChange('pad2FitEnvelopeToChord' as keyof SliderState, !state.pad2FitEnvelopeToChord)}
                    >
                      Fit Chord
                    </button>
                  </div>
                  <div className="sc-compact-grid-4">
                    <Slider label="Attack" value={state.pad2Attack} paramKey="pad2Attack" format={formatEnvelopeSeconds} logarithmic ghostValue={getPreviewValue(pad2DistancePreview, 'pad2Attack')} onChange={onParamChange} {...sliderProps('pad2Attack')} />
                    <Slider label="Decay" value={state.pad2Decay} paramKey="pad2Decay" format={formatEnvelopeSeconds} logarithmic ghostValue={getPreviewValue(pad2DistancePreview, 'pad2Decay')} onChange={onParamChange} {...sliderProps('pad2Decay')} />
                    <Slider label="Sustain" value={state.pad2Sustain} paramKey="pad2Sustain" format={formatEnvelopeSustain} ghostValue={getPreviewValue(pad2DistancePreview, 'pad2Sustain')} onChange={onParamChange} {...sliderProps('pad2Sustain')} />
                    <Slider label="Hold" value={state.pad2Hold} paramKey="pad2Hold" format={formatEnvelopeSeconds} ghostValue={getPreviewValue(pad2DistancePreview, 'pad2Hold')} onChange={onParamChange} {...sliderProps('pad2Hold')} />
                    <Slider label="Release" value={state.pad2Release} paramKey="pad2Release" format={formatEnvelopeSeconds} logarithmic ghostValue={getPreviewValue(pad2DistancePreview, 'pad2Release')} onChange={onParamChange} {...sliderProps('pad2Release')} />
                  </div>
                </div>

                {/* ─── Filter ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Filter</div>
                  <div className="sc-compact-row">
                    <Select
                      label="Type"
                      value={state.pad2FilterType ?? 'lowpass'}
                      options={[
                        { value: 'lowpass', label: 'LP' },
                        { value: 'bandpass', label: 'BP' },
                        { value: 'highpass', label: 'HP' },
                        { value: 'notch', label: 'Notch' },
                        { value: 'ladderLp', label: 'Ladder LP' },
                      ]}
                      onChange={(v: string) => onSelectChange('pad2FilterType' as keyof SliderState, v)}
                    />
                  </div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Min" value={state.pad2FilterCutoffMin} paramKey="pad2FilterCutoffMin" unit="Hz" logarithmic ghostValue={getPreviewValue(pad2DistancePreview, 'pad2FilterCutoffMin')} onChange={onParamChange} {...sliderProps('pad2FilterCutoffMin')} />
                    <Slider label="Max" value={state.pad2FilterCutoffMax} paramKey="pad2FilterCutoffMax" unit="Hz" logarithmic ghostValue={getPreviewValue(pad2DistancePreview, 'pad2FilterCutoffMax')} onChange={onParamChange} {...sliderProps('pad2FilterCutoffMax')} />
                  </div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Resonance" value={state.pad2FilterResonance} paramKey="pad2FilterResonance" onChange={onParamChange} {...sliderProps('pad2FilterResonance')} />
                    <Slider label="Q" value={state.pad2FilterQ} paramKey="pad2FilterQ" onChange={onParamChange} {...sliderProps('pad2FilterQ')} />
                  </div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Slope" value={state.pad2FilterSlope ?? 12} paramKey="pad2FilterSlope" unit=" dB/oct" onChange={onParamChange} {...sliderProps('pad2FilterSlope')} />
                    <Slider label="Key Track" value={state.pad2FilterKeyTracking ?? 0} paramKey="pad2FilterKeyTracking" onChange={onParamChange} {...sliderProps('pad2FilterKeyTracking')} />
                  </div>
                </div>

                <div className="sc-advanced-section">
                  <div className="sc-section-label">Space</div>
                  <div style={{ fontSize: '0.62rem', color: '#888', marginBottom: '6px' }}>
                    Distance pushes Pad 2 back with darker filtering, tighter width, and more diffuse spread.
                  </div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Distance" value={state.pad2Distance} paramKey="pad2Distance" ghostValue={getDistanceGhostValue('pad2Distance', livePad2Distance)} onChange={onParamChange} {...sliderProps('pad2Distance')} />
                    <Slider label="Level" value={state.pad2Level} paramKey="pad2Level" ghostValue={getPreviewValue(pad2DistancePreview, 'pad2Level')} onChange={onParamChange} {...sliderProps('pad2Level')} />
                  </div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Reverb Send" value={state.pad2ReverbSend} paramKey="pad2ReverbSend" ghostValue={getPreviewValue(pad2DistancePreview, 'pad2ReverbSend')} onChange={onParamChange} {...sliderProps('pad2ReverbSend')} />
                    <Slider label="Post LPF" value={state.pad2PostLPF} paramKey="pad2PostLPF" unit=" Hz" logarithmic ghostValue={getPreviewValue(pad2DistancePreview, 'pad2PostLPF')} onChange={onParamChange} {...sliderProps('pad2PostLPF')} />
                  </div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Stereo Width" value={state.pad2StereoWidth} paramKey="pad2StereoWidth" ghostValue={getPreviewValue(pad2DistancePreview, 'pad2StereoWidth')} onChange={onParamChange} {...sliderProps('pad2StereoWidth')} />
                    <Slider label="Diffuse Send" value={state.pad2DiffuseSend} paramKey="pad2DiffuseSend" ghostValue={getPreviewValue(pad2DistancePreview, 'pad2DiffuseSend')} onChange={onParamChange} {...sliderProps('pad2DiffuseSend')} />
                  </div>
                </div>

                {/* ─── LFO 1 ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">LFO</div>
                  <div className="sc-lfo-preset-row">
                    <label className="sc-lfo-preset-label">Preset</label>
                    <select
                      className="sc-lfo-preset-select"
                      value=""
                      onChange={(e) => {
                        const preset = LFO_PRESETS.find(p => p.id === e.target.value);
                        if (preset) {
                          onSelectChange('pad2Lfo1Dest' as keyof SliderState, preset.dest);
                          onSelectChange('pad2Lfo1Wave' as keyof SliderState, preset.wave);
                          onParamChange('pad2Lfo1Rate' as keyof SliderState, preset.rate);
                          onParamChange('pad2Lfo1Depth' as keyof SliderState, preset.depth);
                        }
                      }}
                      {...bindHelp('synthLfoPresetSelect')}
                    >
                      <option value="" disabled>Select LFO preset…</option>
                      {Object.entries(LFO_PRESET_CATEGORIES).map(([cat, label]) => (
                        <optgroup key={cat} label={label}>
                          {LFO_PRESETS.filter(p => p.category === cat).map(p => (
                            <option key={p.id} value={p.id} title={p.description}>{p.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="sc-compact-grid-2">
                    <Select
                      label="Dest"
                      value={state.pad2Lfo1Dest ?? 'none'}
                      options={[
                        { value: 'none', label: 'Off' },
                        { value: 'filterCutoff', label: 'Filter A' },
                        { value: 'filterBCutoff', label: 'Filter B' },
                        { value: 'amplitude', label: 'Amp' },
                        { value: 'pitch', label: 'Pitch' },
                        { value: 'oscBLevel', label: 'Osc B' },
                        { value: 'foldAmount', label: 'Fold' },
                      ]}
                      onChange={(v: string) => onSelectChange('pad2Lfo1Dest' as keyof SliderState, v)}
                      {...bindHelp('synthLfoDestSelect')}
                    />
                    {(state.pad2Lfo1Dest ?? 'none') !== 'none' ? (
                      <Select
                        label="Wave"
                        value={state.pad2Lfo1Wave ?? 'sine'}
                        options={[
                          { value: 'sine', label: 'Sine' },
                          { value: 'triangle', label: 'Tri' },
                          { value: 'sawtooth', label: 'Saw' },
                          { value: 'square', label: 'Sq' },
                          { value: 'sampleHold', label: 'S&H' },
                          { value: 'randomSmooth', label: 'Rnd' },
                          { value: 'randomWalk', label: 'Walk' },
                        ]}
                        onChange={(v: string) => onSelectChange('pad2Lfo1Wave' as keyof SliderState, v)}
                        {...bindHelp('synthLfoWaveSelect')}
                      />
                    ) : <div />}
                  </div>
                  {(state.pad2Lfo1Dest ?? 'none') !== 'none' && (
                    <div className="sc-compact-grid-2">
                      <Slider label="Rate" value={state.pad2Lfo1Rate ?? 0.5} paramKey="pad2Lfo1Rate" unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps('pad2Lfo1Rate')} />
                      <Slider label="Depth" value={state.pad2Lfo1Depth ?? 0} paramKey="pad2Lfo1Depth" onChange={onParamChange} {...sliderProps('pad2Lfo1Depth')} />
                    </div>
                  )}
                </div>

                {/* ─── LFO 2 ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">LFO 2</div>
                  <div className="sc-lfo-preset-row">
                    <label className="sc-lfo-preset-label">Preset</label>
                    <select
                      className="sc-lfo-preset-select"
                      value=""
                      onChange={(e) => {
                        const preset = LFO_PRESETS.find(p => p.id === e.target.value);
                        if (preset) {
                          onSelectChange('pad2Lfo2Dest' as keyof SliderState, preset.dest);
                          onSelectChange('pad2Lfo2Wave' as keyof SliderState, preset.wave);
                          onParamChange('pad2Lfo2Rate' as keyof SliderState, preset.rate);
                          onParamChange('pad2Lfo2Depth' as keyof SliderState, preset.depth);
                        }
                      }}
                      {...bindHelp('synthLfoPresetSelect')}
                    >
                      <option value="" disabled>Select LFO preset…</option>
                      {Object.entries(LFO_PRESET_CATEGORIES).map(([cat, label]) => (
                        <optgroup key={cat} label={label}>
                          {LFO_PRESETS.filter(p => p.category === cat).map(p => (
                            <option key={p.id} value={p.id} title={p.description}>{p.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="sc-compact-grid-2">
                    <Select
                      label="Dest"
                      value={state.pad2Lfo2Dest ?? 'none'}
                      options={[
                        { value: 'none', label: 'Off' },
                        { value: 'filterCutoff', label: 'Filter A' },
                        { value: 'filterBCutoff', label: 'Filter B' },
                        { value: 'amplitude', label: 'Amp' },
                        { value: 'pitch', label: 'Pitch' },
                        { value: 'oscBLevel', label: 'Osc B' },
                        { value: 'foldAmount', label: 'Fold' },
                      ]}
                      onChange={(v: string) => onSelectChange('pad2Lfo2Dest' as keyof SliderState, v)}
                      {...bindHelp('synthLfoDestSelect')}
                    />
                    {(state.pad2Lfo2Dest ?? 'none') !== 'none' ? (
                      <Select
                        label="Wave"
                        value={state.pad2Lfo2Wave ?? 'sine'}
                        options={[
                          { value: 'sine', label: 'Sine' },
                          { value: 'triangle', label: 'Tri' },
                          { value: 'sawtooth', label: 'Saw' },
                          { value: 'square', label: 'Sq' },
                          { value: 'sampleHold', label: 'S&H' },
                          { value: 'randomSmooth', label: 'Rnd' },
                          { value: 'randomWalk', label: 'Walk' },
                        ]}
                        onChange={(v: string) => onSelectChange('pad2Lfo2Wave' as keyof SliderState, v)}
                        {...bindHelp('synthLfoWaveSelect')}
                      />
                    ) : <div />}
                  </div>
                  {(state.pad2Lfo2Dest ?? 'none') !== 'none' && (
                    <div className="sc-compact-grid-2">
                      <Slider label="Rate" value={state.pad2Lfo2Rate ?? 0.5} paramKey="pad2Lfo2Rate" unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps('pad2Lfo2Rate')} />
                      <Slider label="Depth" value={state.pad2Lfo2Depth ?? 0} paramKey="pad2Lfo2Depth" onChange={onParamChange} {...sliderProps('pad2Lfo2Depth')} />
                    </div>
                  )}
                </div>

                {/* ─── Oscillators ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Oscillators</div>
                  <div className="sc-osc-grid">
                    <div className="sc-osc-block">
                      <div className="sc-osc-block-label">Osc A</div>
                      <Select
                        label=""
                        value={state.pad2OscAWave ?? 'sawtooth'}
                        options={[
                          { value: 'sine', label: 'Sin' },
                          { value: 'triangle', label: 'Tri' },
                          { value: 'sawtooth', label: 'Saw' },
                          { value: 'square', label: 'Sq' },
                        ]}
                        onChange={(v: string) => onSelectChange('pad2OscAWave' as keyof SliderState, v)}
                      />
                      <div className="sc-inline-slider">
                        <Slider label="Lvl" value={state.pad2OscALevel ?? 0.6} paramKey="pad2OscALevel" onChange={onParamChange} {...sliderProps('pad2OscALevel')} />
                      </div>
                      <div className="sc-inline-slider">
                        <Slider label="Oct" value={state.pad2OscAOctave ?? 0} paramKey="pad2OscAOctave" onChange={onParamChange} {...sliderProps('pad2OscAOctave')} />
                      </div>
                      <div className="sc-inline-slider">
                        <Slider label="Det" value={state.pad2OscADetune ?? 0} paramKey="pad2OscADetune" onChange={onParamChange} {...sliderProps('pad2OscADetune')} />
                      </div>
                    </div>
                    <div className="sc-osc-block">
                      <div className="sc-osc-block-label">Osc B</div>
                      <Select
                        label=""
                        value={state.pad2OscBWave ?? 'triangle'}
                        options={[
                          { value: 'sine', label: 'Sin' },
                          { value: 'triangle', label: 'Tri' },
                          { value: 'sawtooth', label: 'Saw' },
                          { value: 'square', label: 'Sq' },
                        ]}
                        onChange={(v: string) => onSelectChange('pad2OscBWave' as keyof SliderState, v)}
                      />
                      <div className="sc-inline-slider">
                        <Slider label="Lvl" value={state.pad2OscBLevel ?? 0.4} paramKey="pad2OscBLevel" onChange={onParamChange} {...sliderProps('pad2OscBLevel')} />
                      </div>
                      <div className="sc-inline-slider">
                        <Slider label="Oct" value={state.pad2OscBOctave ?? 0} paramKey="pad2OscBOctave" onChange={onParamChange} {...sliderProps('pad2OscBOctave')} />
                      </div>
                      <div className="sc-inline-slider">
                        <Slider label="Det" value={state.pad2OscBDetune ?? 0} paramKey="pad2OscBDetune" onChange={onParamChange} {...sliderProps('pad2OscBDetune')} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ══ TIER 3 — Advanced controls ══ */}
            {pad2Tier === 2 && (
              <div className="synth-card-advanced">
                {/* ─── Auto Morph ─── */}
                <div className="sc-morph-auto-row">
                  <button
                    className={`sc-toggle-btn${state.pad2MorphAuto ? ' on' : ''}`}
                    onClick={() => onSelectChange('pad2MorphAuto' as keyof SliderState, !state.pad2MorphAuto)}
                  >
                    {state.pad2MorphAuto ? '● Auto Morph' : '○ Auto Morph'}
                  </button>
                  <div style={{ flex: 1 }}>
                    <Slider label="Speed" value={state.pad2MorphSpeed} paramKey="pad2MorphSpeed" unit=" phr" onChange={onParamChange} {...sliderProps('pad2MorphSpeed')} />
                  </div>
                </div>

                {/* ─── Sub Oscillator ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">
                    Sub Oscillator
                    <button
                      className={`sc-toggle-btn small${state.pad2SubEnabled ? ' on' : ''}`}
                      onClick={() => onSelectChange('pad2SubEnabled' as keyof SliderState, !state.pad2SubEnabled)}
                    >
                      {state.pad2SubEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {state.pad2SubEnabled && (
                    <div className="sc-compact-grid-2">
                      <div>
                        <Select
                          label="Wave"
                          value={state.pad2SubWave ?? 'sine'}
                          options={[
                            { value: 'sine', label: 'Sine' },
                            { value: 'triangle', label: 'Triangle' },
                          ]}
                          onChange={(v: string) => onSelectChange('pad2SubWave' as keyof SliderState, v)}
                        />
                        <Slider label="Level" value={state.pad2SubLevel ?? 0.3} paramKey="pad2SubLevel" onChange={onParamChange} {...sliderProps('pad2SubLevel')} />
                      </div>
                      <div>
                        <Slider label="Octave" value={state.pad2SubOctave ?? -1} paramKey="pad2SubOctave" onChange={onParamChange} {...sliderProps('pad2SubOctave')} />
                      </div>
                    </div>
                  )}
                </div>

                {/* ─── Noise ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Noise</div>
                  <div className="sc-compact-grid-2">
                    <Select
                      label="Type"
                      value={state.pad2NoiseType ?? 'white'}
                      options={[
                        { value: 'white', label: 'White' },
                        { value: 'pink', label: 'Pink' },
                      ]}
                      onChange={(v: string) => onSelectChange('pad2NoiseType' as keyof SliderState, v)}
                    />
                    <Slider label="Level" value={state.pad2NoiseLevel ?? 0.15} paramKey="pad2NoiseLevel" onChange={onParamChange} {...sliderProps('pad2NoiseLevel')} />
                  </div>
                </div>

                {/* ─── Character ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Character</div>
                  <div className="sc-compact-grid-2">
                    <Slider label="Warmth" value={state.pad2Warmth} paramKey="pad2Warmth" ghostValue={getPreviewValue(pad2DistancePreview, 'pad2Warmth')} onChange={onParamChange} {...sliderProps('pad2Warmth')} />
                    <Slider label="Presence" value={state.pad2Presence} paramKey="pad2Presence" ghostValue={getPreviewValue(pad2DistancePreview, 'pad2Presence')} onChange={onParamChange} {...sliderProps('pad2Presence')} />
                  </div>
                </div>

                {/* ─── Mod Envelope ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">
                    Mod Envelope
                    <button
                      className={`sc-toggle-btn small${state.pad2ModEnvEnabled ? ' on' : ''}`}
                      onClick={() => onSelectChange('pad2ModEnvEnabled' as keyof SliderState, !state.pad2ModEnvEnabled)}
                      {...bindHelp('synthModEnvEnable')}
                    >
                      {state.pad2ModEnvEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {state.pad2ModEnvEnabled && (
                    <>
                      <Select
                        label="Target"
                        value={state.pad2ModEnvDest ?? 'filterCutoff'}
                        options={[
                          { value: 'filterCutoff', label: 'Filter Cutoff' },
                          { value: 'pitch', label: 'Pitch' },
                          { value: 'oscBLevel', label: 'Osc B Level' },
                          { value: 'foldAmount', label: 'Fold' },
                        ]}
                        onChange={(v: string) => onSelectChange('pad2ModEnvDest' as keyof SliderState, v)}
                        {...bindHelp('synthModEnvTarget')}
                      />
                      <Slider label="Depth" value={state.pad2ModEnvDepth ?? 0} paramKey="pad2ModEnvDepth" onChange={onParamChange} {...sliderProps('pad2ModEnvDepth')} />
                      <div className="sc-compact-grid-4">
                        <Slider label="Attack" value={state.pad2ModEnvAttack ?? 0.1} paramKey="pad2ModEnvAttack" format={formatEnvelopeSeconds} logarithmic onChange={onParamChange} {...sliderProps('pad2ModEnvAttack')} />
                        <Slider label="Decay" value={state.pad2ModEnvDecay ?? 0.3} paramKey="pad2ModEnvDecay" format={formatEnvelopeSeconds} logarithmic onChange={onParamChange} {...sliderProps('pad2ModEnvDecay')} />
                        <Slider label="Sustain" value={state.pad2ModEnvSustain ?? 0} paramKey="pad2ModEnvSustain" format={formatEnvelopeSustain} onChange={onParamChange} {...sliderProps('pad2ModEnvSustain')} />
                        <Slider label="Release" value={state.pad2ModEnvRelease ?? 0.5} paramKey="pad2ModEnvRelease" format={formatEnvelopeSeconds} logarithmic onChange={onParamChange} {...sliderProps('pad2ModEnvRelease')} />
                      </div>
                    </>
                  )}
                </div>

                {/* ─── Filter B ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">
                    Filter B
                    <button
                      className={`sc-toggle-btn small${state.pad2FilterBEnabled ? ' on' : ''}`}
                      onClick={() => onSelectChange('pad2FilterBEnabled' as keyof SliderState, !state.pad2FilterBEnabled)}
                    >
                      {state.pad2FilterBEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  {state.pad2FilterBEnabled && (
                    <>
                      <Select
                        label="Type"
                        value={state.pad2FilterBType ?? 'highpass'}
                        options={[
                          { value: 'lowpass', label: 'Lowpass' },
                          { value: 'bandpass', label: 'Bandpass' },
                          { value: 'highpass', label: 'Highpass' },
                          { value: 'notch', label: 'Notch' },
                        ]}
                        onChange={(v: string) => onSelectChange('pad2FilterBType' as keyof SliderState, v)}
                      />
                      <div className="sc-compact-grid-2">
                        <Slider label="Cutoff" value={state.pad2FilterBCutoff ?? 200} paramKey="pad2FilterBCutoff" unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps('pad2FilterBCutoff')} />
                        <Slider label="Res" value={state.pad2FilterBResonance ?? 0.2} paramKey="pad2FilterBResonance" onChange={onParamChange} {...sliderProps('pad2FilterBResonance')} />
                      </div>
                      <Slider label="Q" value={state.pad2FilterBQ ?? 1} paramKey="pad2FilterBQ" onChange={onParamChange} {...sliderProps('pad2FilterBQ')} />
                    </>
                  )}
                </div>

                {/* ─── Filter Routing ─── */}
                {state.pad2FilterBEnabled && (
                  <div className="sc-advanced-section">
                    <div className="sc-section-label">Routing</div>
                    <Select
                      label="Mode"
                      value={state.pad2FilterRouting ?? 'series'}
                      options={[
                        { value: 'series', label: 'Series (A → B)' },
                        { value: 'aOnly', label: 'A Only' },
                        { value: 'bOnly', label: 'B Only' },
                      ]}
                      onChange={(v: string) => onSelectChange('pad2FilterRouting' as keyof SliderState, v)}
                      {...bindHelp('synthFilterRoutingMode')}
                    />
                  </div>
                )}

                {/* ─── Octave ─── */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Octave</div>
                  <div className="octave-row">
                    {[-2, -1, 0, 1, 2].map(oct => (
                      <button
                        key={oct}
                        className={`octave-btn ${state.pad2Octave === oct ? 'active' : ''}`}
                        onClick={() => onParamChange('pad2Octave', oct)}
                      >
                        {oct === 0 ? '0' : (oct > 0 ? `+${oct}` : oct)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            </>)}
          </div>

          {/* ── Lead 1 Card ── */}
          <div className={`synth-card${editingSection === 'lead1' ? ' editing' : ''}${lead1CardExpanded ? '' : ' collapsed'}`} style={{ '--sc': SOURCE_COLORS.lead1 } as React.CSSProperties}>
            <div
              className="synth-card-header clickable"
              role="button"
              tabIndex={0}
              aria-expanded={lead1CardExpanded}
              onClick={() => toggleSynthSourceCard('lead1')}
              onKeyDown={(event) => handleSynthSourceHeaderKeyDown(event, 'lead1')}
            >
              <span className="sc-name">Lead 1</span>
              <button
                type="button"
                className={`sc-enable-btn${state.leadEnabled ? ' on' : ''}`}
                aria-pressed={state.leadEnabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectChange('leadEnabled' as keyof SliderState, !state.leadEnabled);
                }}
              >
                {state.leadEnabled ? 'ON' : 'OFF'}
              </button>
              <button
                className="sc-preset-editor-btn"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openLeadPresetEditor('Lead 1', [
                    { slotKey: 'lead1PresetA', slotLabel: 'Slot A', accentColor: '#f59e0b' },
                    { slotKey: 'lead1PresetB', slotLabel: 'Slot B', accentColor: '#8b5cf6' },
                  ], 'lead1PresetA');
                }}
              >
                Edit preset
              </button>
              <button
                type="button"
                className={`sc-edit-btn${editingSection === 'lead1' ? ' active' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleEdit('lead1');
                }}
                title={editingSection === 'lead1' ? 'Close advanced' : 'Advanced parameters'}
                {...bindHelp('synthLeadEdit')}
              >
                {'\u270E'}
              </button>
            </div>

            {lead1CardExpanded && (
              <>
            <div className="synth-card-simple">
              {renderLeadPresetLoader({
                selectedPresetId: lead1LoaderPresetId,
                onSelectedPresetIdChange: setLead1LoaderPresetId,
                slots: [
                  { slotKey: 'lead1PresetA', slotLabel: 'Slot A', accentColor: '#f59e0b' },
                  { slotKey: 'lead1PresetB', slotLabel: 'Slot B', accentColor: '#8b5cf6' },
                ],
                color: '#f59e0b',
              })}
              {/* Preset A / Morph / B — single row */}
              <div className="sc-morph-row">
                <span className="sc-morph-tag" style={{ color: '#f59e0b' }}>A</span>
                <div className="sc-preset-slot">
                  <select
                    value={resolveLeadPresetSelectionId(state.lead1PresetA)}
                    onChange={(e) => {
                      handlePresetEndpointSelectChange('lead1PresetA' as keyof SliderState, e.target.value);
                      blurSelectAfterChange(e.currentTarget);
                    }}
                    className="sc-preset-select"
                    style={{ borderColor: 'rgba(245,158,11,0.3)' }}
                  >
                    {renderLeadPresetOptions(leadPooledPresetOptions, resolveLeadPresetSelectionId(state.lead1PresetA))}
                  </select>
                </div>
                <div className="sc-morph-slider">
                  <Slider label="" value={lead1MorphValue} paramKey="lead1Morph" onChange={handlePresetMorphSliderChange} {...sliderProps('lead1Morph')} disabled={lead1MorphSequencerLocked} />
                </div>
                <div className="sc-preset-slot">
                  <select
                    value={resolveLeadPresetSelectionId(state.lead1PresetB)}
                    onChange={(e) => {
                      handlePresetEndpointSelectChange('lead1PresetB' as keyof SliderState, e.target.value);
                      blurSelectAfterChange(e.currentTarget);
                    }}
                    className="sc-preset-select"
                    style={{ borderColor: 'rgba(139,92,246,0.3)' }}
                  >
                    {renderLeadPresetOptions(leadPooledPresetOptions, resolveLeadPresetSelectionId(state.lead1PresetB))}
                  </select>
                </div>
                <span className="sc-morph-tag" style={{ color: '#8b5cf6' }}>B</span>
              </div>

              {/* ADSR */}
              {renderLeadAdsr(1)}
            </div>

            {/* Advanced */}
            {editingSection === 'lead1' && (
              <div className="synth-card-advanced">
                {/* Random walk */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <button
                    onClick={() => onSelectChange('lead1MorphAuto' as keyof SliderState, !state.lead1MorphAuto)}
                    style={{
                      padding: '4px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                      fontSize: '0.7rem', fontWeight: 'bold',
                      background: state.lead1MorphAuto ? 'linear-gradient(135deg, #f59e0b, #8b5cf6)' : 'rgba(255,255,255,0.1)',
                      color: state.lead1MorphAuto ? '#fff' : '#888',
                    }}
                  >
                    {state.lead1MorphAuto ? '\u25CF Random Walk' : '\u25CB Random Walk'}
                  </button>
                  <div style={{ flex: 1 }}>
                    <Slider label="Speed" value={state.lead1MorphSpeed} paramKey="lead1MorphSpeed" unit=" phr" onChange={onParamChange} {...sliderProps('lead1MorphSpeed')} />
                  </div>
                </div>

                {/* Algorithm mode */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.7rem', color: '#888' }}>Algorithm:</span>
                  <button
                    onClick={() => onSelectChange('lead1AlgorithmMode' as keyof SliderState, state.lead1AlgorithmMode === 'snap' ? 'presetA' : 'snap')}
                    style={{
                      padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.7rem',
                      background: state.lead1AlgorithmMode === 'snap' ? 'rgba(245,158,11,0.2)' : 'rgba(139,92,246,0.2)',
                      color: state.lead1AlgorithmMode === 'snap' ? '#f59e0b' : '#8b5cf6',
                    }}
                  >
                    {state.lead1AlgorithmMode === 'snap' ? 'Snap @ 50%' : 'Always A'}
                  </button>
                </div>

                <Slider label="Lead 1 Level" value={state.lead1Level} paramKey="lead1Level" ghostValue={getPreviewValue(lead1DistancePreview, 'lead1Level')} onChange={onParamChange} {...sliderProps('lead1Level')} />

                {/* Hold Time (shared) */}
                <Slider label="Hold Time" value={state.lead1Hold} paramKey="lead1Hold" unit="s" ghostValue={getPreviewValue(lead1DistancePreview, 'lead1Hold')} onChange={onParamChange} {...sliderProps('lead1Hold')} />

                <div className="sc-advanced-section">
                  <div className="sc-section-label">Distance</div>
                  <Slider label="Distance" value={state.lead1Distance} paramKey="lead1Distance" ghostValue={getDistanceGhostValue('lead1Distance', liveLead1Distance)} onChange={onParamChange} {...sliderProps('lead1Distance')} />
                  <Slider label="Post LPF" value={state.lead1PostLPF} paramKey="lead1PostLPF" unit=" Hz" logarithmic ghostValue={getPreviewValue(lead1DistancePreview, 'lead1PostLPF')} onChange={onParamChange} {...sliderProps('lead1PostLPF')} />
                  <Slider label="LPF Key Track" value={state.lead1PostLPFKeyTracking ?? 0} paramKey="lead1PostLPFKeyTracking" onChange={onParamChange} {...sliderProps('lead1PostLPFKeyTracking')} />
                  <Slider label="Stereo Width" value={state.lead1StereoWidth} paramKey="lead1StereoWidth" ghostValue={getPreviewValue(lead1DistancePreview, 'lead1StereoWidth')} onChange={onParamChange} {...sliderProps('lead1StereoWidth')} />
                  <Slider label="Diffuse Send" value={state.lead1DiffuseSend} paramKey="lead1DiffuseSend" ghostValue={getPreviewValue(lead1DistancePreview, 'lead1DiffuseSend')} onChange={onParamChange} {...sliderProps('lead1DiffuseSend')} />
                  <Slider label="Reverb Send" value={state.lead1ReverbSend} paramKey="lead1ReverbSend" ghostValue={getPreviewValue(lead1DistancePreview, 'lead1ReverbSend')} onChange={onParamChange} {...sliderProps('lead1ReverbSend')} />
                </div>

                {/* Expression */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Expression (per note)</div>
                  <Slider label="Vibrato Depth" value={state.leadVibratoDepth} paramKey="leadVibratoDepth" unit=" st" onChange={onParamChange} {...sliderProps('leadVibratoDepth')} />
                  <Slider label="Vibrato Rate" value={state.leadVibratoRate} paramKey="leadVibratoRate" unit=" Hz" onChange={onParamChange} {...sliderProps('leadVibratoRate')} />
                  <Slider label="Glide" value={state.leadGlide} paramKey="leadGlide" onChange={onParamChange} {...sliderProps('leadGlide')} />
                </div>

                {/* Delay */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Delay A</div>
                  <Slider label="Delay A Send" value={state.lead1DelayASend} paramKey="lead1DelayASend" onChange={onParamChange} {...sliderProps('lead1DelayASend')} />
                  <Slider label="Left Division" value={getSliderNumericValue('drumDelayNoteL', state.drumDelayNoteL) ?? 0} paramKey="drumDelayNoteL" onChange={onParamChange} format={(value: number) => formatIndexedDelayDivision('drumDelayNoteL', value)} {...sliderProps('drumDelayNoteL')} />
                  <Slider label="Right Division" value={getSliderNumericValue('drumDelayNoteR', state.drumDelayNoteR) ?? 0} paramKey="drumDelayNoteR" onChange={onParamChange} format={(value: number) => formatIndexedDelayDivision('drumDelayNoteR', value)} {...sliderProps('drumDelayNoteR')} />
                  <Slider label="Delay Feedback" value={state.delayAFeedback} paramKey="delayAFeedback" onChange={onParamChange} {...sliderProps('delayAFeedback')} />
                  <Slider label="Delay Mix" value={state.delayAMix} paramKey="delayAMix" onChange={onParamChange} {...sliderProps('delayAMix')} />
                  <Slider label="Delay Filter" value={state.delayAFilter} paramKey="delayAFilter" unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps('delayAFilter')} />
                </div>
              </div>
            )}
              </>
            )}
          </div>

          {/* ── Lead 2 Card ── */}
          <div className={`synth-card${editingSection === 'lead2' ? ' editing' : ''}${lead2CardExpanded ? '' : ' collapsed'}`} style={{ '--sc': SOURCE_COLORS.lead2 } as React.CSSProperties}>
            <div
              className="synth-card-header clickable"
              role="button"
              tabIndex={0}
              aria-expanded={lead2CardExpanded}
              onClick={() => toggleSynthSourceCard('lead2')}
              onKeyDown={(event) => handleSynthSourceHeaderKeyDown(event, 'lead2')}
            >
              <span className="sc-name">Lead 2</span>
              <button
                type="button"
                className={`sc-enable-btn${state.lead2Enabled ? ' on' : ''}`}
                aria-pressed={state.lead2Enabled}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectChange('lead2Enabled' as keyof SliderState, !state.lead2Enabled);
                }}
              >
                {state.lead2Enabled ? 'ON' : 'OFF'}
              </button>
              <button
                className="sc-preset-editor-btn"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  openLeadPresetEditor('Lead 2', [
                    { slotKey: 'lead2PresetC', slotLabel: 'Slot C', accentColor: '#06b6d4' },
                    { slotKey: 'lead2PresetD', slotLabel: 'Slot D', accentColor: '#a78bfa' },
                  ], 'lead2PresetC');
                }}
              >
                Edit preset
              </button>
              <button
                type="button"
                className={`sc-edit-btn${editingSection === 'lead2' ? ' active' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleEdit('lead2');
                }}
                title={editingSection === 'lead2' ? 'Close advanced' : 'Advanced parameters'}
                {...bindHelp('synthLeadEdit')}
              >
                {'\u270E'}
              </button>
            </div>

            {lead2CardExpanded && (
              <div className="synth-card-simple">
                {renderLeadPresetLoader({
                  selectedPresetId: lead2LoaderPresetId,
                  onSelectedPresetIdChange: setLead2LoaderPresetId,
                  slots: [
                    { slotKey: 'lead2PresetC', slotLabel: 'Slot C', accentColor: '#06b6d4' },
                    { slotKey: 'lead2PresetD', slotLabel: 'Slot D', accentColor: '#a78bfa' },
                  ],
                  color: '#06b6d4',
                })}
                {/* Preset C / Morph / D — single row */}
                <div className="sc-morph-row">
                  <span className="sc-morph-tag" style={{ color: '#06b6d4' }}>C</span>
                  <div className="sc-preset-slot">
                    <select
                      value={resolveLeadPresetSelectionId(state.lead2PresetC)}
                      onChange={(e) => {
                        handlePresetEndpointSelectChange('lead2PresetC' as keyof SliderState, e.target.value);
                        blurSelectAfterChange(e.currentTarget);
                      }}
                      className="sc-preset-select"
                      style={{ borderColor: 'rgba(6,182,212,0.3)' }}
                    >
                      {renderLeadPresetOptions(leadPooledPresetOptions, resolveLeadPresetSelectionId(state.lead2PresetC))}
                    </select>
                  </div>
                  <div className="sc-morph-slider">
                    <Slider label="" value={lead2MorphValue} paramKey="lead2Morph" onChange={handlePresetMorphSliderChange} {...sliderProps('lead2Morph')} disabled={lead2MorphSequencerLocked} />
                  </div>
                  <div className="sc-preset-slot">
                    <select
                      value={resolveLeadPresetSelectionId(state.lead2PresetD)}
                      onChange={(e) => {
                        handlePresetEndpointSelectChange('lead2PresetD' as keyof SliderState, e.target.value);
                        blurSelectAfterChange(e.currentTarget);
                      }}
                      className="sc-preset-select"
                      style={{ borderColor: 'rgba(167,139,250,0.3)' }}
                    >
                      {renderLeadPresetOptions(leadPooledPresetOptions, resolveLeadPresetSelectionId(state.lead2PresetD))}
                    </select>
                  </div>
                  <span className="sc-morph-tag" style={{ color: '#a78bfa' }}>D</span>
                </div>

                {/* ADSR */}
                {renderLeadAdsr(2)}
              </div>
            )}

            {/* Advanced */}
            {editingSection === 'lead2' && lead2CardExpanded && (
              <div className="synth-card-advanced">
                {/* Random walk */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <button
                    onClick={() => onSelectChange('lead2MorphAuto' as keyof SliderState, !state.lead2MorphAuto)}
                    style={{
                      padding: '4px 10px', borderRadius: '4px', border: 'none', cursor: 'pointer',
                      fontSize: '0.7rem', fontWeight: 'bold',
                      background: state.lead2MorphAuto ? 'linear-gradient(135deg, #06b6d4, #a78bfa)' : 'rgba(255,255,255,0.1)',
                      color: state.lead2MorphAuto ? '#fff' : '#888',
                    }}
                  >
                    {state.lead2MorphAuto ? '\u25CF Random Walk' : '\u25CB Random Walk'}
                  </button>
                  <div style={{ flex: 1 }}>
                    <Slider label="Speed" value={state.lead2MorphSpeed} paramKey="lead2MorphSpeed" unit=" phr" onChange={onParamChange} {...sliderProps('lead2MorphSpeed')} />
                  </div>
                </div>

                {/* Algorithm mode */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.7rem', color: '#888' }}>Algorithm:</span>
                  <button
                    onClick={() => onSelectChange('lead2AlgorithmMode' as keyof SliderState, state.lead2AlgorithmMode === 'snap' ? 'presetA' : 'snap')}
                    style={{
                      padding: '3px 8px', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.7rem',
                      background: state.lead2AlgorithmMode === 'snap' ? 'rgba(6,182,212,0.2)' : 'rgba(167,139,250,0.2)',
                      color: state.lead2AlgorithmMode === 'snap' ? '#06b6d4' : '#a78bfa',
                    }}
                  >
                    {state.lead2AlgorithmMode === 'snap' ? 'Snap @ 50%' : 'Always C'}
                  </button>
                </div>

                <Slider label="Lead 2 Level" value={state.lead2Level} paramKey="lead2Level" ghostValue={getPreviewValue(lead2DistancePreview, 'lead2Level')} onChange={onParamChange} {...sliderProps('lead2Level')} />

                <div className="sc-advanced-section">
                  <div className="sc-section-label">Distance</div>
                  <Slider label="Distance" value={state.lead2Distance} paramKey="lead2Distance" ghostValue={getDistanceGhostValue('lead2Distance', liveLead2Distance)} onChange={onParamChange} {...sliderProps('lead2Distance')} />
                  <Slider label="Hold Time" value={state.lead2Hold} paramKey="lead2Hold" unit="s" ghostValue={getPreviewValue(lead2DistancePreview, 'lead2Hold')} onChange={onParamChange} {...sliderProps('lead2Hold')} />
                  <Slider label="Post LPF" value={state.lead2PostLPF} paramKey="lead2PostLPF" unit=" Hz" logarithmic ghostValue={getPreviewValue(lead2DistancePreview, 'lead2PostLPF')} onChange={onParamChange} {...sliderProps('lead2PostLPF')} />
                  <Slider label="LPF Key Track" value={state.lead2PostLPFKeyTracking ?? 0} paramKey="lead2PostLPFKeyTracking" onChange={onParamChange} {...sliderProps('lead2PostLPFKeyTracking')} />
                  <Slider label="Stereo Width" value={state.lead2StereoWidth} paramKey="lead2StereoWidth" ghostValue={getPreviewValue(lead2DistancePreview, 'lead2StereoWidth')} onChange={onParamChange} {...sliderProps('lead2StereoWidth')} />
                  <Slider label="Diffuse Send" value={state.lead2DiffuseSend} paramKey="lead2DiffuseSend" ghostValue={getPreviewValue(lead2DistancePreview, 'lead2DiffuseSend')} onChange={onParamChange} {...sliderProps('lead2DiffuseSend')} />
                  <Slider label="Reverb Send" value={state.lead2ReverbSend} paramKey="lead2ReverbSend" ghostValue={getPreviewValue(lead2DistancePreview, 'lead2ReverbSend')} onChange={onParamChange} {...sliderProps('lead2ReverbSend')} />
                </div>

                {/* Expression */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Expression (per note)</div>
                  <Slider label="Vibrato Depth" value={state.leadVibratoDepth} paramKey="leadVibratoDepth" unit=" st" onChange={onParamChange} {...sliderProps('leadVibratoDepth')} />
                  <Slider label="Vibrato Rate" value={state.leadVibratoRate} paramKey="leadVibratoRate" unit=" Hz" onChange={onParamChange} {...sliderProps('leadVibratoRate')} />
                  <Slider label="Glide" value={state.leadGlide} paramKey="leadGlide" onChange={onParamChange} {...sliderProps('leadGlide')} />
                </div>

                {/* Delay */}
                <div className="sc-advanced-section">
                  <div className="sc-section-label">Delay A</div>
                  <Slider label="Delay A Send" value={state.lead2DelayASend} paramKey="lead2DelayASend" onChange={onParamChange} {...sliderProps('lead2DelayASend')} />
                  <Slider label="Left Division" value={getSliderNumericValue('drumDelayNoteL', state.drumDelayNoteL) ?? 0} paramKey="drumDelayNoteL" onChange={onParamChange} format={(value: number) => formatIndexedDelayDivision('drumDelayNoteL', value)} {...sliderProps('drumDelayNoteL')} />
                  <Slider label="Right Division" value={getSliderNumericValue('drumDelayNoteR', state.drumDelayNoteR) ?? 0} paramKey="drumDelayNoteR" onChange={onParamChange} format={(value: number) => formatIndexedDelayDivision('drumDelayNoteR', value)} {...sliderProps('drumDelayNoteR')} />
                  <Slider label="Delay Feedback" value={state.delayAFeedback} paramKey="delayAFeedback" onChange={onParamChange} {...sliderProps('delayAFeedback')} />
                  <Slider label="Delay Mix" value={state.delayAMix} paramKey="delayAMix" onChange={onParamChange} {...sliderProps('delayAMix')} />
                  <Slider label="Delay Filter" value={state.delayAFilter} paramKey="delayAFilter" unit=" Hz" logarithmic onChange={onParamChange} {...sliderProps('delayAFilter')} />
                </div>
              </div>
            )}
          </div>

          {renderSampleSlotCard('sample1')}
          {renderSampleSlotCard('sample2')}
        </div>

        {/* ════════ RIGHT: Sequencer Panel ════════ */}
        <div className="sequencer-panel">
          {/* ── Transport bar ── */}
          <div className="seq-transport">
            <button
              className={`seq-play-btn${state.synthEuclideanMasterEnabled ? ' playing' : ''}`}
              data-sequencer-transport="synth"
              onClick={toggleSynthSequencerTransport}
              {...bindHelp('synthSeqPlayToggle')}
            >
              {state.synthEuclideanMasterEnabled ? '\u25A0' : '\u25B6'}
            </button>
            <DragNumber
              value={state.sequencerMasterBPM as number}
              min={40}
              max={300}
              label="BPM"
              onChange={setSharedSequencerBpm}
              commitOnRelease
            />
            {!isMobile && (
              <button
                className={`synth-keyboard-toggle${showKeyboard ? ' active' : ''}`}
                onClick={toggleKeyboardPanel}
                style={{ '--kb-accent': keyboardSourceInfo.color } as React.CSSProperties}
                type="button"
              >
                Keys
              </button>
            )}
            <div className={`live-overdub-controls${synthRecorderActive ? ' active' : ''}`}>
              <button
                type="button"
                className={`live-overdub-btn record${synthRecorderActive ? ' active' : ''}`}
                onClick={toggleSynthRecorder}
                aria-pressed={synthRecorderActive}
              >
                REC
              </button>
              <button
                type="button"
                className={`live-overdub-btn${synthRecorderMetronomeEnabled ? ' active' : ''}`}
                onClick={toggleSynthRecorderMetronome}
                aria-pressed={synthRecorderMetronomeEnabled}
              >
                Metro
              </button>
              <span className="live-overdub-status">{synthRecorderStatus}</span>
            </div>
            <div className="seq-view-toggle">
              <button
                className={`seq-view-btn${seq.viewMode === 'simple' ? ' active' : ''}`}
                onClick={() => seq.setViewMode('simple')}
                {...bindHelp('synthSeqViewSimple')}
              >
                Simple
              </button>
              <button
                className={`seq-view-btn${seq.viewMode === 'detail' ? ' active' : ''}`}
                onClick={() => seq.setViewMode('detail')}
                {...bindHelp('synthSeqViewDetail')}
              >
                Detail
              </button>
              <button
                className={`seq-view-btn${seq.viewMode === 'overview' ? ' active' : ''}`}
                onClick={() => seq.setViewMode('overview')}
                {...bindHelp('synthSeqViewOverview')}
              >
                Overview
              </button>
            </div>
          </div>

          {!isMobile && showKeyboard && (
            <div className="synth-keyboard-panel" style={{ '--kb-accent': keyboardSourceInfo.color } as React.CSSProperties}>
              <div className="synth-keyboard-header">
                <div>
                  <div className="synth-keyboard-title">Manual Keyboard</div>
                  <div className="synth-keyboard-meta">
                    {keyboardVisibleKeys[0]?.noteLabel ?? formatMidiNoteName(keyboardBaseMidi)} to {keyboardVisibleKeys[keyboardVisibleKeys.length - 1]?.noteLabel ?? formatMidiNoteName(keyboardBaseMidi + 12)}
                  </div>
                  <div className="synth-keyboard-meta">
                    {keyboardHarmonyContext.usingHarmonyEngine ? 'Harmony' : 'Pitch Root'}: {keyboardHarmonyContext.label}
                  </div>
                </div>
                  <div className="synth-keyboard-hint">
                  {keyboardInputMode === 'sequence'
                    ? 'Space plays/stops | Left/Right step | Z+Left/Right steps | Up/Down coarse | Z+Up/Down fine | Left Shift + arrows lane/seq | Tab toggle | [ ] octave | Shift+Z mute | Shift+X solo'
                    : 'Space plays/stops | [ ] octave | Shift+Z mute | Shift+X solo'}
                </div>
              </div>

              <div className="synth-keyboard-mode-row">
                <span className="synth-keyboard-mode-label">Mode</span>
                <button
                  type="button"
                  className={`synth-keyboard-mode-btn${keyboardInputMode === 'play' ? ' active' : ''}`}
                  onClick={() => setKeyboardInputMode('play')}
                >
                  Play
                </button>
                <button
                  type="button"
                  className={`synth-keyboard-mode-btn${keyboardInputMode === 'sequence' ? ' active' : ''}`}
                  onClick={enterKeyboardSequenceMode}
                >
                  Sequence
                </button>
                {keyboardInputMode === 'sequence' && (
                  <>
                    <span className="synth-keyboard-mode-status">{keyboardSequenceStatus}</span>
                    <div className="synth-keyboard-sequence-nav">
                      <button
                        type="button"
                        className="synth-keyboard-nav-btn"
                        onClick={() => {
                          selectSynthKeyboardLaneStep(
                            seq.activeTab,
                            activeKeyboardEditLane,
                            findAdjacentSynthKeyboardLaneStep(seq.activeTab, activeKeyboardEditLane, activeSynthKeyboardStep, -1),
                          );
                        }}
                      >
                        ← Step
                      </button>
                      <button
                        type="button"
                        className="synth-keyboard-nav-btn"
                        onClick={() => {
                          selectSynthKeyboardLaneStep(
                            seq.activeTab,
                            activeKeyboardEditLane,
                            findAdjacentSynthKeyboardLaneStep(seq.activeTab, activeKeyboardEditLane, activeSynthKeyboardStep, 1),
                          );
                        }}
                      >
                        Step →
                      </button>
                    </div>
                  </>
                )}
              </div>

              {keyboardInputMode === 'play' ? (
                <div className="synth-keyboard-source-row">
                  {MANUAL_KEYBOARD_SOURCES.map((source) => (
                    <button
                      key={source.value}
                      type="button"
                      className={`synth-keyboard-source-btn${keyboardSource === source.value ? ' active' : ''}`}
                      style={{ '--source-color': source.color } as React.CSSProperties}
                      onClick={() => setKeyboardSource(source.value)}
                    >
                      {source.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className={`synth-keyboard-sequence-helper${canWriteSequenceNotes ? ' ready' : ' warning'}`}>
                  {sequenceWriteHelper}
                </div>
              )}

              <div className="synth-keyboard-legend">
                <span className="synth-keyboard-legend-pill root">Root</span>
                <span className="synth-keyboard-legend-pill chord">Chord</span>
                <span className="synth-keyboard-legend-pill scale">In Key</span>
                <span className="synth-keyboard-legend-pill outside">Out</span>
              </div>

              <SynthKeyboardKeys
                ref={keyboardKeysRef}
                naturalKeys={keyboardNaturalKeys as SynthKeyboardKeyView[]}
                accidentalKeys={keyboardAccidentalKeys as SynthKeyboardKeyView[]}
                whiteKeyCount={keyboardWhiteCount}
                onNoteOn={(key, inputId) => triggerKeyboardNote(key.layoutIndex, inputId, 'ui-pad')}
                onNoteOff={releaseKeyboardNote}
              />
            </div>
          )}

          {/* ══════ SIMPLE MODE ══════ */}
          {seq.viewMode === 'simple' && (
            <div className="synth-simple-seq">
              {/* ── Chord Generator ── */}
              <div className="synth-simple-section">
                <div className="synth-simple-header">
                  <span>Chord Generator</span>
                  <button
                    className={`synth-simple-enable${state.synthChordGeneratorEnabled === true ? ' on' : ''}`}
                    onClick={toggleChordGeneratorEnabled}
                  >
                    {state.synthChordGeneratorEnabled === true ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div className="synth-simple-content">
                  <div className="synth-simple-controls">
                    <div className="seq-sources" style={{ marginBottom: '6px' }}>
                      <select
                        className="synth-source-select"
                        aria-label="Chord generator source"
                        value={state.synthChordGeneratorSource ?? 'sample1'}
                        onChange={(e) => setChordGeneratorSource(e.target.value)}
                        style={{
                          borderColor: `${chordGeneratorSourceInfo.color}60`,
                          color: chordGeneratorSourceInfo.color,
                        }}
                      >
                        {CHORD_GENERATOR_SOURCES.map((source) => (
                          <option key={source.value} value={source.value}>{source.label}</option>
                        ))}
                      </select>
                      <label className="synth-source-label">
                        Voices
                        <select
                          className="synth-source-select"
                          value={state.synthChordGeneratorVoiceCount ?? 6}
                          onChange={(e) => onParamChange('synthChordGeneratorVoiceCount', Number(e.target.value))}
                        >
                          {PAD_VOICE_NUMBERS.map((voice) => (
                            <option key={voice} value={voice}>{voice}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <Slider label="Chords / Phrase" value={state.chordRate} paramKey="chordRate" onChange={onParamChange} {...sliderProps('chordRate')} />
                    <Slider label="Voicing Spread" value={state.voicingSpread} paramKey="voicingSpread" onChange={onParamChange} {...sliderProps('voicingSpread')} />
                    <Slider label="Wave Spread" value={state.waveSpread} paramKey="waveSpread" onChange={onParamChange} {...sliderProps('waveSpread')} />
                    <div style={{ position: 'relative', height: '14px', marginTop: '-4px', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.5rem', color: '#666', padding: '0 2px' }}>
                        <span>0</span>
                        <span style={{ position: 'absolute', left: '6.25%', transform: 'translateX(-50%)' }}>1/16</span>
                        <span style={{ position: 'absolute', left: '12.5%', transform: 'translateX(-50%)' }}>⅛</span>
                        <span style={{ position: 'absolute', left: '25%', transform: 'translateX(-50%)' }}>¼</span>
                        <span style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>½</span>
                        <span style={{ position: 'absolute', right: 0 }}>1</span>
                      </div>
                    </div>
                    <Slider label="Detune" value={state.detune} paramKey="detune" unit={'\u00A2'} onChange={onParamChange} {...sliderProps('detune')} />
                    <Slider label="Octave Offset" value={state.synthOctave} paramKey="synthOctave" onChange={onParamChange} {...sliderProps('synthOctave')} />
                  </div>
                  <OptionalVisualizerGate
                    enabled={simpleChordPhraseVizToggle.enabled}
                    title="Chord visualizer"
                    description={isMobile
                      ? 'Canvas animation is paused by default on mobile to keep playback responsive.'
                      : 'Canvas animation can be hidden when you want to reduce rendering work.'}
                    enableLabel="Show visualizer"
                    hideLabel="Hide visualizer"
                    onEnable={simpleChordPhraseVizToggle.show}
                    onHide={simpleChordPhraseVizToggle.hide}
                  >
                    <SimplePhraseVisualizer
                      kind="padChord"
                      state={liveSimpleSequencerState}
                      isRunning={isRunning}
                      transportDebug={transportDebug}
                    />
                  </OptionalVisualizerGate>
                </div>
              </div>

              {/* ── Lead Synth Random Timing ── */}
              <div className="synth-simple-section">
                <div className="synth-simple-header">
                  <span>Random Timing</span>
                  <button
                    className={`synth-simple-enable${state.leadRandomEnabled ? ' on' : ''}`}
                    onClick={toggleRandomTimingEnabled}
                  >
                    {state.leadRandomEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div className="synth-simple-content">
                  <div className="synth-simple-controls">
                    <label className="synth-source-label" style={{ marginBottom: '8px' }}>
                      Source
                      <select
                        className="synth-source-select"
                        value={randomTimingSourceValue}
                        onChange={(e) => setRandomTimingSource(e.target.value)}
                        style={{
                          borderColor: `${randomTimingSourceInfo.color}60`,
                          color: randomTimingSourceInfo.color,
                        }}
                      >
                        {RANDOM_TIMING_SOURCES.map((source) => (
                          <option key={source.value} value={source.value}>{source.label}</option>
                        ))}
                      </select>
                    </label>
                    <Slider label="Note Density" value={state.lead1Density} paramKey="lead1Density" unit="/phrase" onChange={onParamChange} {...sliderProps('lead1Density')} />
                    <Slider label="Octave Offset" value={state.lead1Octave} paramKey="lead1Octave" onChange={onParamChange} {...sliderProps('lead1Octave')} />
                    <Slider label="Octave Range" value={state.lead1OctaveRange} paramKey="lead1OctaveRange" unit=" oct" onChange={onParamChange} {...sliderProps('lead1OctaveRange')} />
                  </div>
                  <OptionalVisualizerGate
                    enabled={simpleRandomTimingVizToggle.enabled}
                    title="Random timing visualizer"
                    description={isMobile
                      ? 'Canvas animation is paused by default on mobile to keep playback responsive.'
                      : 'Canvas animation can be hidden when you want to reduce rendering work.'}
                    enableLabel="Show visualizer"
                    hideLabel="Hide visualizer"
                    onEnable={simpleRandomTimingVizToggle.show}
                    onHide={simpleRandomTimingVizToggle.hide}
                  >
                    <SimplePhraseVisualizer
                      kind="randomTiming"
                      state={liveSimpleSequencerState}
                      isRunning={isRunning}
                      transportDebug={transportDebug}
                    />
                  </OptionalVisualizerGate>
                </div>
              </div>
            </div>
          )}

          {/* ══════ DETAIL MODE ══════ */}
          {seq.viewMode === 'detail' && (
            <div>
              {/* Tab bar */}
              <div className="seq-tab-bar">
                {seq.sequencerModels.map((seqModel, idx) => (
                  <div
                    key={seqModel.id}
                    className={`seq-tab${!chordSequencerSelected && idx === seq.activeTab ? ' active' : ''}${seqModel.muted ? ' muted' : ''}${seq.evolveFlashing[idx] ? ' seq-evolve-flash' : ''}`}
                    style={{ '--sc': seqModel.color } as React.CSSProperties}
                    onClick={() => {
                      setChordSequencerSelected(false);
                      seq.setActiveTab(idx);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <span>{seqModel.name}</span>
                    <div className="seq-tab-ms">
                      <button
                        className={`mute-btn${seqModel.muted ? ' on' : ''}`}
                        onClick={(e) => { e.stopPropagation(); seq.toggleMute(idx); }}
                      >M</button>
                      <button
                        className={`solo-btn${seqModel.solo ? ' on' : ''}`}
                        onClick={(e) => { e.stopPropagation(); seq.toggleSolo(idx); }}
                      >S</button>
                    </div>
                  </div>
                ))}
                <div
                  className={`seq-tab seq-tab--chord${chordSequencerSelected ? ' active' : ''}${!chordSequencerEnabled ? ' muted' : ''}`}
                  style={{ '--sc': CHORD_SEQUENCER_LANE_COLOR } as React.CSSProperties}
                  onClick={() => setChordSequencerSelected(true)}
                  role="button"
                  tabIndex={0}
                >
                  <span>{CHORD_SEQUENCER_LANE_NAME}</span>
                  <div className="seq-tab-ms">
                    <button
                      className={`mute-btn${!chordSequencerEnabled ? ' on' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleChordSequencerEnabled();
                      }}
                    >
                      M
                    </button>
                  </div>
                </div>
              </div>

              {/* Seq body */}
              {!chordSequencerSelected && (
              <div className={`seq-body${seq.evolveFlashing[seq.activeTab] ? ' seq-evolve-flash' : ''}`} style={{ '--sc': activeSeq.color } as React.CSSProperties}>

                {/* ── Source selector + per-seq controls ── */}
                <div className="seq-sources">
                  {/* Per-seq controls */}
                  <div className="seq-per-controls" style={{ marginLeft: 0 }}>
                    <select
                      className="synth-source-select"
                      aria-label={`Seq ${seq.activeTab + 1} source`}
                      value={synthSourceSelectValue(state[getSourceKey(seq.activeTab)] ?? 'lead1')}
                      onChange={(e) => handleLaneSourceChange(seq.activeTab, e.target.value)}
                      {...bindHelp('synthSeqSourceSelect')}
                      style={{
                        borderColor: getSourceColor(String(state[getSourceKey(seq.activeTab)] ?? 'lead1')) + '60',
                        color: getSourceColor(String(state[getSourceKey(seq.activeTab)] ?? 'lead1')),
                      }}
                    >
                      {SYNTH_SOURCES.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                    <label className="seq-mode-label">
                      Type
                      <span className="seq-mode-segmented" role="group" aria-label={`Seq ${seq.activeTab + 1} type`}>
                        {([
                          ['euclid', 'Step'],
                          ['anchorWalker', 'Walker'],
                          ['orbit', 'Orbit'],
                        ] as const).map(([mode, label]) => (
                          <button
                            key={mode}
                            type="button"
                            className={activeSequencerMode === mode ? 'active' : ''}
                            onClick={() => setSequencerMode(seq.activeTab, mode)}
                          >
                            {label}
                          </button>
                        ))}
                      </span>
                    </label>
                    {activeLaneUsesPadVoiceMask && (
                      <label className="seq-clock-label">
                        Voices
                        <div className="voice-mask-row" style={{ width: '176px', gap: '3px' }}>
                          {PAD_VOICE_NUMBERS.map((voice) => {
                            const bit = 1 << (voice - 1);
                            const selected = (activeLaneVoiceMask & bit) !== 0;
                            const sourceAssignment: PadVoiceAssignment = activeLaneSource === 'pad2' ? 'pad2' : 'pad1';
                            return (
                              <button
                                key={voice}
                                type="button"
                                className={`voice-mask-btn ${selected ? 'active' : ''}`}
                                onClick={() => toggleLaneVoiceMask(seq.activeTab, voice)}
                                style={{
                                  ...(selected ? padVoiceButtonStyle(voice, sourceAssignment) : undefined),
                                  padding: '4px 0',
                                  fontSize: '0.65rem',
                                }}
                                title={`Seq ${seq.activeTab + 1} voice ${voice} · ${selected ? 'Rotate' : 'Off'}`}
                              >
                                {voice}
                              </button>
                            );
                          })}
                        </div>
                      </label>
                    )}
                    <label className="seq-clock-label">
                      Clock
                      <select
                        className="seq-clock-select"
                        value={seq.clockDivs[seq.activeTab]}
                        onChange={(e) => seq.setClockDiv(seq.activeTab, e.target.value as any)}
                        {...bindHelp('synthSeqClockSelect')}
                      >
                        <option value="1/4">1/4</option>
                        <option value="1/4T">1/4T</option>
                        <option value="1/8">1/8</option>
                        <option value="1/8T">1/8T</option>
                        <option value="1/16">1/16</option>
                        <option value="1/16T">1/16T</option>
                        <option value="1/32">1/32</option>
                        <option value="1/32T">1/32T</option>
                      </select>
                    </label>
                    <label className="seq-swing-label">
                      Swing
                      <input
                        type="range"
                        className="seq-swing-range"
                        min={0}
                        max={0.75}
                        step={0.05}
                        value={seq.swings[seq.activeTab] ?? 0}
                        onChange={(e) => seq.setSwing(seq.activeTab, parseFloat(e.target.value))}
                      />
                      <span className="seq-swing-val">{Math.round((seq.swings[seq.activeTab] ?? 0) * 100)}%</span>
                    </label>
                    {activeSequencerMode === 'euclid' && (
                      <>
                        <label className="seq-pitch-bind-label" title="How pitch aligns to trigger hits or steps">
                          Pitch
                          <select
                            className="seq-pitch-bind-select"
                            value={activePitchBindingMode}
                            onChange={(e) => setPitchBindingMode(seq.activeTab, e.target.value as PitchBindingMode)}
                          >
                            {PITCH_BINDING_MODE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <button
                          className={`seq-evolve-btn${seq.evolveConfigs[seq.activeTab]?.enabled ? ' on' : ''}`}
                          onClick={() => {
                            seq.setEvolveConfigs(prev => prev.map((cfg, idx) => (
                              idx === seq.activeTab ? { ...cfg, enabled: !cfg.enabled } : cfg
                            )));
                          }}
                          {...bindHelp('synthSeqEvolve')}
                        >
                          Evolve
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {activeSequencerMode === 'euclid' ? (
                  <>
                    <div className="seq-sequence-preset-row">
                      {renderSequencePresetControl(seq.activeTab)}
                    </div>

                    {/* Evolution panel */}
                    <div className={`seq-evolve-panel${seq.evolveConfigs[seq.activeTab]?.enabled ? ' open' : ''}`}>
                  <div className="seq-evolve-row">
                    <DragNumber
                      value={seq.evolveConfigs[seq.activeTab]?.everyBars ?? 4}
                      min={1}
                      max={32}
                      label="Every"
                      onChange={(v) => {
                        seq.setEvolveConfigs(prev => prev.map((cfg, idx) => (
                          idx === seq.activeTab ? { ...cfg, everyBars: v } : cfg
                        )));
                      }}
                    />
                    <span className="seq-drag-num-label">bars</span>
                    <div className="seq-evolve-zone-wrap">
                      <label>
                        Evolution
                        <input
                          type="range" min={0} max={100} step={5}
                          value={Math.round((seq.evolveConfigs[seq.activeTab]?.evolution ?? 0.25) * 100)}
                          onChange={(e) => {
                            const evolution = parseInt(e.target.value, 10) / 100;
                            seq.setEvolveConfigs(prev => prev.map((cfg, idx) => {
                              if (idx !== seq.activeTab) return cfg;
                              const pct = evolution * 100;
                              const methods: Record<string, boolean> = {
                                swingDrift: true,
                                probDrift: pct > 30,
                                ratchetSpray: pct > 60,
                                pitchWalk: true,
                                valueDrift: true,
                                valueScramble: pct > 40,
                                valueWiden: pct > 60,
                                subLaneLengthDrift: pct > 50,
                                subLaneDirectionFlip: pct > 80,
                                triggerToggle: pct > 50,
                              };
                              return { ...cfg, evolution, methods };
                            }));
                          }}
                        />
                        <span>{Math.round((seq.evolveConfigs[seq.activeTab]?.evolution ?? 0.25) * 100)}%</span>
                      </label>
                      {(() => {
                        const pct = Math.round((seq.evolveConfigs[seq.activeTab]?.evolution ?? 0.25) * 100);
                        return (
                          <div className="seq-evolve-methods">
                            <span className="seq-evolve-method on">Swing</span>
                            <span className="seq-evolve-method on">Pitch</span>
                            <span className="seq-evolve-method on">Drift</span>
                            <span className={`seq-evolve-method${pct > 30 ? ' on-t' : ''}`}>Probability</span>
                            <span className={`seq-evolve-method${pct > 40 ? ' on-t' : ''}`}>Scramble</span>
                            <span className={`seq-evolve-method${pct > 50 ? ' on-t' : ''}`}>Triggers</span>
                            <span className={`seq-evolve-method${pct > 50 ? ' on-t' : ''}`}>Length</span>
                            <span className={`seq-evolve-method${pct > 60 ? ' on-t' : ''}`}>Ratchet</span>
                            <span className={`seq-evolve-method${pct > 60 ? ' on-t' : ''}`}>Widen</span>
                            <span className={`seq-evolve-method${pct > 80 ? ' on-t' : ''}`}>Direction</span>
                          </div>
                        );
                      })()}
                    </div>
                    <button className="seq-evolve-reset" onClick={() => handleResetEvolveHome(seq.activeTab)}>Reset</button>
                    {diceLane && (
                      <span className="seq-dice-group">
                        <SliderPrimitive
                          className="seq-dice-slider"
                          label="Dice"
                          mode="single"
                          value={Math.round(diceIntensity * 100)}
                          hero={SEQUENCER_SUB_LANE_COLORS.expression}
                          variant="full"
                          density="compact"
                          displayValue={`${Math.round(diceIntensity * 100)}%`}
                          formatValue={(value) => `${Math.round(value)}%`}
                          onValueChange={(value) => setDiceIntensity(Math.round(value / 5) * 5 / 100)}
                          title={`Dice intensity: ${Math.round(diceIntensity * 100)}%`}
                        />
                        <button className="seq-evolve-dice" onClick={() => handleDiceLane(seq.activeTab, diceIntensity)} title="Randomize lane">&#x1F3B2;</button>
                      </span>
                    )}
                  </div>
                  <button
                    className="seq-evolve-advanced-toggle"
                    onClick={() => setShowAdvanced(v => !v)}
                    {...bindHelp('synthSeqEvolveAdvanced')}
                  >
                    {showAdvanced ? '▾' : '▸'} Advanced
                  </button>
                  <div className={`seq-evolve-advanced-body${showAdvanced ? ' open' : ''}`}>
                    <div className="seq-evolve-advanced-row">
                      <label>Write Offset</label>
                      <span className="seq-evolve-mode-group">
                        <button
                          className={`seq-evolve-mode-btn${(seq.evolveConfigs[seq.activeTab]?.writeOffset ?? 'auto') === 'auto' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, writeOffset: 'auto' } : cfg))}
                          {...bindHelp('synthSeqWriteOffsetAuto')}
                        >Auto</button>
                        <button
                          className={`seq-evolve-mode-btn${typeof (seq.evolveConfigs[seq.activeTab]?.writeOffset ?? 'auto') === 'number' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, writeOffset: 0 } : cfg))}
                          {...bindHelp('synthSeqWriteOffsetManual')}
                        >Manual</button>
                      </span>
                      {typeof (seq.evolveConfigs[seq.activeTab]?.writeOffset ?? 'auto') === 'number' && (
                        <input
                          type="range" min={0} max={Math.max(1, (activeSeq?.trigger?.steps ?? 16) - 1)} step={1}
                          value={seq.evolveConfigs[seq.activeTab]?.writeOffset as number}
                          onChange={(e) => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, writeOffset: parseInt(e.target.value, 10) } : cfg))}
                        />
                      )}
                    </div>
                    <div className="seq-evolve-advanced-row">
                      <label>Mutation</label>
                      <span className="seq-evolve-mode-group">
                        <button
                          className={`seq-evolve-mode-btn${(seq.evolveConfigs[seq.activeTab]?.mutationMode ?? 'biased') === 'biased' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, mutationMode: 'biased' } : cfg))}
                          {...bindHelp('synthSeqMutationBiased')}
                        >Biased</button>
                        <button
                          className={`seq-evolve-mode-btn${(seq.evolveConfigs[seq.activeTab]?.mutationMode ?? 'biased') === 'strict' ? ' active' : ''}`}
                          onClick={() => seq.setEvolveConfigs(prev => prev.map((cfg, idx) => idx === seq.activeTab ? { ...cfg, mutationMode: 'strict' } : cfg))}
                          {...bindHelp('synthSeqMutationStrict')}
                        >Strict</button>
                      </span>
                    </div>
                    <div className="seq-evolve-sublanes">
                      {(['pitch', 'expression', 'morph', 'distance', 'probability', 'ratchet'] as const).map((sl) => {
                        const enabled = seq.evolveConfigs[seq.activeTab]?.enabledSubLanes;
                        const isOn = !enabled || enabled.includes(sl);
                        return (
                          <label key={sl}>
                            <input
                              type="checkbox"
                              checked={isOn}
                              onChange={() => {
                                seq.setEvolveConfigs(prev => prev.map((cfg, idx) => {
                                  if (idx !== seq.activeTab) return cfg;
                                  const current = cfg.enabledSubLanes ?? ['pitch', 'expression', 'morph', 'distance', 'probability', 'ratchet'];
                                  const next = isOn ? current.filter(s => s !== sl) : [...current, sl];
                                  return { ...cfg, enabledSubLanes: next };
                                }));
                              }}
                            />
                            {sl}
                          </label>
                        );
                      })}
                    </div>
                    <div className="seq-evolve-checks">
                      {Object.keys(seq.evolveConfigs[seq.activeTab]?.methods ?? {}).map((method) => (
                        <label key={method}>
                          <input
                            type="checkbox"
                            checked={!!seq.evolveConfigs[seq.activeTab]?.methods[method]}
                            onChange={() => {
                              seq.setEvolveConfigs(prev => prev.map((cfg, idx) => (
                                idx === seq.activeTab
                                  ? { ...cfg, methods: { ...cfg.methods, [method]: !cfg.methods[method] } }
                                  : cfg
                              )));
                            }}
                          />
                          {method}
                        </label>
                      ))}
                    </div>
                  </div>
                    </div>

                {/* ── TRIGGER LANE ── */}
                <div className="seq-trigger-always">
                  <div className="seq-lane-header">
                    <button
                      className={`seq-lane-enable-btn trigger-toggle${!activeSeq.muted ? ' on' : ''}`}
                      style={!activeSeq.muted ? { background: activeSeq.color, color: '#000' } as React.CSSProperties : undefined}
                      onClick={() => seq.toggleMute(seq.activeTab)}
                    >
                      {activeSeq.muted ? 'Off' : 'On'}
                    </button>
                    <div className="seq-lane-controls">
                      {shouldShowTriggerSourceBadge(activeSeq.trigger.sourceOrigin, activeSeq.trigger.sourceDirty) && (
                        <span className={`seq-source-badge seq-source-badge--${activeSeq.trigger.sourceOrigin ?? 'euclidean'}`}>
                          {triggerSourceDisplayLabel(activeSeq.trigger.sourceLabel, activeSeq.trigger.sourceOrigin)}
                          {activeSeq.trigger.sourceDirty ? '*' : ''}
                        </span>
                      )}
                      <div className="seq-source-mode-toggle" aria-label="Trigger pattern source">
                        <button
                          type="button"
                          className={`seq-source-mode-button ${triggerSourceIsEuclidean ? 'euclid' : 'step'}`}
                          title={`Switch to ${triggerSourceIsEuclidean ? 'Step' : 'Euclid'}`}
                          onClick={() => seq.setTriggerClipEuclideanEnabled(seq.activeTab, !triggerSourceIsEuclidean)}
                        >
                          {triggerSourceModeLabel}
                        </button>
                      </div>
                      <DragNumber
                        value={activeSeq.trigger.steps}
                        min={2}
                        max={EUCLIDEAN_STEP_MAX}
                        label="Steps"
                        shapeByDrag
                        onChange={(v) => seq.setParam(seq.activeTab, 'Steps', v)}
                      />
                      {activeSeq.trigger.sourceOrigin && activeSeq.trigger.sourceOrigin !== 'euclidean' ? (
                        <span
                          className="seq-ov-readonly-hits"
                          title="Step patterns preserve the written trigger cells. Switch to Euclid to reshape by hit count."
                        >
                          Hits {activeSeq.trigger.hits}
                        </span>
                      ) : (
                        <DragNumber
                          value={activeSeq.trigger.hits}
                          min={0}
                          max={activeSeq.trigger.steps}
                          label="Hits"
                          onChange={(v) => seq.setParam(seq.activeTab, 'Hits', v)}
                        />
                      )}
                      <div className="seq-rotation-control">
                        <button onClick={() => seq.rotateSequence(seq.activeTab, -1)}>{'\u2190'}</button>
                        <span className="seq-rotation-val">{activeSeq.trigger.rotation}</span>
                        <button onClick={() => seq.rotateSequence(seq.activeTab, 1)}>{'\u2192'}</button>
                      </div>
                      <button
                        type="button"
                        className={`seq-trigger-clip-btn${linkedTriggerStampPickSource ? ' on' : ''}`}
                        onClick={beginLinkedTriggerStampSourcePick}
                      >
                        Copy
                      </button>
                      {(linkedTriggerStampPickSource || linkedTriggerStampMode) && linkedTriggerStampSummary ? (
                        <span className="seq-trigger-stamp-pill">
                          {linkedTriggerStampSummary}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <SeqLane
                    sequencer={activeSeq}
                    lane="trigger"
                    color={activeSeq.color}
                    playhead={seq.playheads[seq.activeTab] ?? 0}
                    hitCount={seq.hitCounts[seq.activeTab] ?? 0}
                    onToggleTriggerStep={(step) => {
                      if (linkedTriggerStampPickSource) {
                        selectTriggerSequenceStep(seq.activeTab, step);
                        if (activeSeq.trigger.pattern[step] === true) copyLinkedTriggerStampAtStep(step);
                        return;
                      }
                      if (linkedTriggerStampMode && pasteLinkedTriggerStampAtStep(step)) return;
                      seq.toggleTriggerStep(seq.activeTab, step);
                    }}
                    selectedStep={activeTriggerCursorStep}
                    selectedStepLabel={keyboardTriggerTargetVisible ? keyboardTargetLabel : '⌖'}
                    selectedStepKeyboardFocus={keyboardTriggerTargetVisible}
                    onSelectStep={(step) => {
                      selectTriggerSequenceStep(seq.activeTab, step);
                    }}
                    onSetProbability={(step, value) => seq.setStepProbability(seq.activeTab, step, value)}
                    onResetProbability={(step) => seq.resetStepProbability(seq.activeTab, step)}
                    onCycleRatchet={(step) => seq.cycleStepRatchet(seq.activeTab, step)}
                    onCycleTrigCondition={(step) => seq.cycleTrigCondition(seq.activeTab, step)}
                  />
                </div>

                {/* ── Sub-lane sparklines: pitch, expression, morph, distance ── */}
                <div className="seq-spark-container">
                  {(() => {
                    const playConfig = activePlayConfig;
                    const arpConfig = activeArpConfig;
                    const laneColor = '#7dd3fc';
                    const openLane = seq.openLane as SynthDetailOpenLane;
                    const selectedArpStep = selectedArpSteps[seq.activeTab] ?? 0;
                    const activeArpUiPlayhead = arpUiPlayheads[seq.activeTab] ?? 0;
                    const playSparklineUsesArpClock = playConfig.enabled && playConfig.mode === 'arp';
                    return (
                      <React.Fragment key="arp">
                        <SeqSparkline
                          label="Play:"
                          steps={productPlayLiveLength(playConfig)}
                          values={productPlayPulseValues(playConfig)}
                          color={laneColor}
                          playhead={playSparklineUsesArpClock ? activeArpUiPlayhead : (seq.playheads[seq.activeTab] ?? 0)}
                          hitCount={playSparklineUsesArpClock ? 0 : (seq.hitCounts[seq.activeTab] ?? 0)}
                          playheadMode={playSparklineUsesArpClock ? 'step' : 'hit'}
                          direction="forward"
                          bipolar={playConfig.mode === 'arp'}
                          mode={playConfig.mode === 'arp' ? 'signed' : undefined}
                          enabled={playConfig.enabled}
                          expanded={openLane === 'arp'}
                          onClick={() => seq.setOpenLane((openLane === 'arp' ? 'trigger' : 'arp') as never)}
                          onToggleEnabled={() => updatePlayConfig(seq.activeTab, { enabled: !playConfig.enabled })}
                          selectedStep={selectedArpStep}
                        />
                        {openLane === 'arp' && (
                          <div className="seq-lane-editor-wrap">
                            <div className="seq-play-mode-header" style={{ '--seq-arp-color': laneColor } as React.CSSProperties}>
                              <button
                                type="button"
                                className={`seq-lane-enable-btn${playConfig.enabled ? ' on' : ''}`}
                                onClick={() => updatePlayConfig(seq.activeTab, { enabled: !playConfig.enabled })}
                              >
                                {playConfig.enabled ? 'On' : 'Off'}
                              </button>
                              <div className="seq-arp-segment seq-play-mode-segment" aria-label="Play mode">
                                {PLAY_MODE_OPTIONS.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className={playConfig.mode === option.value ? 'active' : ''}
                                    onClick={() => updatePlayConfig(seq.activeTab, { mode: option.value })}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {playConfig.mode === 'arp' ? (
                              <ArpContourEditor
                                config={{ ...arpConfig, enabled: playConfig.enabled }}
                                color={laneColor}
                                harmony={arpHarmonyContext}
                                resolvedSteps={activeArpResolvedSteps}
                                selectedStep={selectedArpStep}
                                playStep={isRunning && playConfig.enabled ? activeArpUiPlayhead : null}
                                onSelectStep={(step) => selectArpStep(seq.activeTab, step)}
                                onToggleEnabled={() => updatePlayConfig(seq.activeTab, { enabled: !playConfig.enabled })}
                                onUpdateConfig={(patch) => updateArpConfig(seq.activeTab, patch)}
                                onSetContour={(step, value) => setArpContour(seq.activeTab, step, value)}
                                onTogglePulse={(step) => toggleArpPulse(seq.activeTab, step)}
                                onSetSlotChoice={(step, value) => setArpSlotChoice(seq.activeTab, step, value)}
                                onToggleReset={(step) => toggleArpReset(seq.activeTab, step)}
                                onApplyPreset={(preset) => applyArpContourPreset(seq.activeTab, preset)}
                                onMutate={() => mutateArpContour(seq.activeTab)}
                              />
                            ) : (
                              <ChordPlayEditor
                                config={playConfig.chord}
                                color={laneColor}
                                harmony={arpHarmonyContext}
                                resolvedSteps={activeChordResolvedSteps}
                                selectedStep={selectedArpStep}
                                onSelectStep={(step) => selectArpStep(seq.activeTab, step)}
                                onUpdateConfig={(patch) => updateChordPlayConfig(seq.activeTab, patch)}
                                onCommitSlotMidiPool={commitChordPlaySlotMidiPool}
                              />
                            )}
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })()}
                  {(['pitch', 'expression', 'morph', 'distance', 'nudge'] as const).map((laneKind) => {
                    const subState = seq.subLaneStates[seq.activeTab]?.[laneKind];
                    const laneColor = SEQUENCER_SUB_LANE_COLORS[laneKind];
                    const activePlayhead = seq.playheads[seq.activeTab] ?? 0;
                    const sparkHitCount = seq.hitCounts[seq.activeTab] ?? 0;

                    const noteMinKey = `synthEuclid${seq.activeTab + 1}NoteMin` as keyof SliderState;
                    const noteMaxKey = `synthEuclid${seq.activeTab + 1}NoteMax` as keyof SliderState;

                    return (
                      <React.Fragment key={laneKind}>
                        <SeqSparkline
                          label={`${laneKind.charAt(0).toUpperCase()}:`}
                          steps={subState?.steps ?? 5}
                          values={
                            laneKind === 'pitch'
                              ? activeSeq.pitch.offsets.map(off =>
                                  activeSeq.pitch.mode === 'semitones'
                                    ? normalizeNoteDegreeOffset(off)
                                    : activeSeq.pitch.mode === 'noteRange'
                                      ? 0.5
                                      : clampMidiNote(off) / 127
                                )
                              : laneKind === 'expression' && subState?.valueMode === 'range'
                                ? new Array(subState.steps).fill(((subState.rangeMin ?? 0.75) + (subState.rangeMax ?? 1)) * 0.5)
                                : laneKind === 'expression'
                                  ? activeSeq.expression.velocities
                                  : laneKind === 'morph' && subState?.valueMode === 'range'
                                    ? new Array(subState.steps).fill(((subState.rangeMin ?? 0.25) + (subState.rangeMax ?? 0.75)) * 0.5)
                                    : laneKind === 'morph'
                                      ? activeSeq.morph.values
                                      : laneKind === 'distance' && subState?.valueMode === 'range'
                                        ? new Array(subState.steps).fill(((subState.rangeMin ?? 0) + (subState.rangeMax ?? 1)) * 0.5)
                                        : laneKind === 'distance'
                                          ? activeSeq.distance.values
                                          : activeSeq.nudge.values
                          }
                          color={laneColor}
                          playhead={activePlayhead}
                          hitCount={sparkHitCount}
                          playheadMode={laneKind === 'pitch' && activePitchBindingMode === 'sequence' ? 'step' : 'hit'}
                          direction={subState?.direction ?? 'forward'}
                          bipolar={laneKind === 'morph'}
                          mode={laneKind === 'nudge' ? 'signed' : undefined}
                          invertFill={laneKind === 'expression'}
                          enabled={subState?.enabled ?? false}
                          expanded={seq.openLane === laneKind}
                          selectedStep={keyboardTargetVisible ? (
                            laneKind === 'pitch'
                              ? activeKeyboardEditLane === 'pitch'
                                ? activePitchSelectionStep
                                : null
                              : laneKind === 'expression'
                                ? activeKeyboardEditLane === 'expression'
                                  ? activeExpressionCursorStep
                                  : null
                                : laneKind === 'morph'
                                  ? activeKeyboardEditLane === 'morph'
                                    ? activeMorphCursorStep
                                    : null
                                  : laneKind === 'distance'
                                    ? activeKeyboardEditLane === 'distance'
                                      ? activeDistanceCursorStep
                                      : null
                                    : activeKeyboardEditLane === 'nudge'
                                      ? activeNudgeCursorStep
                                      : null
                          ) : null}
                          onClick={() => seq.setOpenLane(seq.openLane === laneKind ? 'trigger' : laneKind)}
                          onToggleEnabled={() => seq.toggleSubLaneEnabled(seq.activeTab, laneKind)}
                        />
                        {seq.openLane === laneKind && (
                          <div className="seq-lane-editor-wrap">
                            <SeqLane
                              sequencer={activeSeq}
                              lane={laneKind}
                              color={laneColor}
                              playhead={seq.playheads[seq.activeTab] ?? 0}
                              hitCount={seq.hitCounts[seq.activeTab] ?? 0}
                              selectedStep={keyboardTargetVisible ? (
                                laneKind === 'pitch'
                                  ? activeKeyboardEditLane === 'pitch'
                                    ? activePitchSelectionStep
                                    : null
                                  : laneKind === 'expression'
                                    ? activeKeyboardEditLane === 'expression'
                                      ? activeExpressionCursorStep
                                      : null
                                    : laneKind === 'morph'
                                      ? activeKeyboardEditLane === 'morph'
                                        ? activeMorphCursorStep
                                        : null
                                      : laneKind === 'distance'
                                        ? activeKeyboardEditLane === 'distance'
                                          ? activeDistanceCursorStep
                                          : null
                                        : activeKeyboardEditLane === 'nudge'
                                          ? activeNudgeCursorStep
                                          : null
                              ) : null}
                              selectedStepLabel={keyboardTargetLabel}
                              onSelectStep={keyboardTargetVisible
                                ? (step) => selectSynthKeyboardLaneStep(seq.activeTab, laneKind, step)
                                : undefined}
                              enabled={subState?.enabled ?? false}
                              direction={subState?.direction ?? 'forward'}
                              onToggleEnabled={() => seq.toggleSubLaneEnabled(seq.activeTab, laneKind)}
                              onChangeSteps={(v) => seq.setSubLaneSteps(seq.activeTab, laneKind, v)}
                              onCycleDirection={() => seq.cycleSubLaneDirection(seq.activeTab, laneKind)}
                              onChangeValue={(step, value) => seq.changeStepValue(seq.activeTab, laneKind, step, value)}
                              valueMode={laneKind === 'expression' || laneKind === 'morph' || laneKind === 'distance' ? subState?.valueMode ?? 'sequence' : undefined}
                              rangeMin={laneKind === 'expression' || laneKind === 'morph' || laneKind === 'distance' ? subState?.rangeMin : undefined}
                              rangeMax={laneKind === 'expression' || laneKind === 'morph' || laneKind === 'distance' ? subState?.rangeMax : undefined}
                              onChangeValueMode={laneKind === 'expression' || laneKind === 'morph' || laneKind === 'distance'
                                ? (mode) => seq.setSubLaneValueMode(seq.activeTab, laneKind, mode)
                                : undefined}
                              onChangeRange={laneKind === 'expression' || laneKind === 'morph' || laneKind === 'distance'
                                ? (min, max) => seq.setSubLaneRange(seq.activeTab, laneKind, min, max)
                                : undefined}
                              linked={laneKind === 'pitch' && activePitchBindingMode !== 'polyrhythmic'}
                              {...(laneKind === 'expression' ? {
                                onCycleRatchet: (step: number) => seq.cycleStepRatchet(seq.activeTab, step),
                              } : {})}
                              {...(laneKind === 'pitch' ? {
                                onChangePitchMode: (mode) => setSynthPitchMode(seq.activeTab, mode),
                                pitchBindingMode: activePitchBindingMode,
                                onChangePitchBindingMode: (mode: PitchBindingMode) => setPitchBindingMode(seq.activeTab, mode),
                                onChangePitchRoot: (root) => seq.setPitchRoot(seq.activeTab, root),
                                onChangePitchScale: (scale) => seq.setPitchScale(seq.activeTab, scale),
                                allowHarmonyPitchScale: true,
                                pitchRootDisplayValue: formatMidiNoteName(activeResolvedPitchSettings.root),
                                pitchDisplayRoot: activeResolvedPitchSettings.root,
                                pitchDisplayScaleIntervals: activeResolvedPitchSettings.scaleIntervals,
                                hidePitchNoteRange: activePitchBindingMode === 'sequence',
                                pitchNoteMin: liveSynthNoteMins[seq.activeTab] ?? (state[noteMinKey] as number),
                                pitchNoteMax: liveSynthNoteMaxs[seq.activeTab] ?? (state[noteMaxKey] as number),
                                onChangePitchNoteMin: (v: number) => onParamChange(noteMinKey, v),
                                onChangePitchNoteMax: (v: number) => onParamChange(noteMaxKey, v),
                              } : {})}
                            />
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
                  </>
                ) : (
                  <>
                    {hasWalkerSlot ? (
                      <div className="walker-ensemble-strip">
                        <span className="walker-ensemble-title">Walker Ensemble</span>
                        <div className="walker-ensemble-options">
                          {(Object.keys(WALKER_ENSEMBLE_LABELS) as WalkerEnsemblePreset[]).map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              className={walkerEnsemblePreset === preset ? 'active' : ''}
                              onClick={() => applyWalkerEnsemble(preset)}
                            >
                              {WALKER_ENSEMBLE_LABELS[preset]}
                            </button>
                          ))}
                        </div>
                        <span className="walker-ensemble-meta">Master Seq 1</span>
                      </div>
                    ) : null}
                    {activeSequencerMode === 'anchorWalker' && activeSequencerSlot ? (
                  <AnchorWalkerSequencerBody
                    config={activeSequencerSlot.anchorWalker}
                    laneIndex={seq.activeTab}
                    color={activeSeq.color}
                    harmonyState={harmonyState}
                    runtimeState={activeAnchorWalkerRuntimeState}
                    captureSlot={generatedSequencerCaptureControls}
                    onChange={(nextConfig) => updateAnchorWalkerSlot(seq.activeTab, nextConfig)}
                    onPerformanceEvent={(event) => sendAnchorWalkerPerformanceEvent(seq.activeTab, event)}
                  />
                ) : activeSequencerSlot ? (
                  <OrbitSequencerBody
                    config={activeSequencerSlot.orbit}
                    laneIndex={seq.activeTab}
                    color={activeSeq.color}
                    harmonyState={harmonyState}
                    isRunning={isRunning}
                    transportBpm={transportDebug?.effectiveBpm ?? getEffectiveSequencerBpm(state)}
                    clockDivision={seq.clockDivs[seq.activeTab]}
                    stepCount={activeSeq.trigger.steps}
                    tempoMultiplier={Number.isFinite(state.synthEuclideanTempo) ? state.synthEuclideanTempo : 1}
                    runtimeVisualState={orbitVisualStates[seq.activeTab] ?? null}
                    captureSlot={generatedSequencerCaptureControls}
                    onChange={(nextConfig) => updateSequencerSlot(seq.activeTab, (slot) => ({
                      ...slot,
                      orbit: nextConfig,
                    }))}
                  />
                    ) : null}
                  </>
                )}
                <SequencerCapturePreviewOverlay
                  session={generatedCaptureSession}
                  laneIndex={seq.activeTab}
                />
              </div>
              )}
              {chordSequencerSelected && (
                <div
                  className="seq-body seq-chord-body"
                  style={{ '--sc': CHORD_SEQUENCER_LANE_COLOR } as React.CSSProperties}
                >
                  <div className="seq-chord-header">
                    <button
                      type="button"
                      className={`seq-lane-enable-btn trigger-toggle${chordSequencerEnabled ? ' on' : ''}`}
                      style={chordSequencerEnabled ? { background: CHORD_SEQUENCER_LANE_COLOR, color: '#001018' } as React.CSSProperties : undefined}
                      onClick={toggleChordSequencerEnabled}
                    >
                      {chordSequencerEnabled ? 'On' : 'Off'}
                    </button>
                    <div className="seq-chord-title">
                      <span>{CHORD_SEQUENCER_LANE_NAME}</span>
                      <strong>Chord / Arp Sequencer</strong>
                    </div>
                    <div className="seq-chord-meta">
                      <span>{chordSequencerConfig.playbackMode}</span>
                      <span>{chordSequencerConfig.stepCount} steps</span>
                      <span>{chordSequencerSourceInfo.label}</span>
                    </div>
                  </div>
                  {triggerStampMode && triggerStamp ? (
                    <button
                      type="button"
                      className="seq-trigger-stamp-pill"
                      onClick={() => setTriggerStampMode(false)}
                      title="Click to exit stamp mode"
                    >
                      STAMP: {triggerStamp.label}
                    </button>
                  ) : null}
                  {renderChordSequencerControls('detail')}
                  {renderChordRhythmTrack()}
                  {renderChordArpBar()}
                  {renderChordMelodyTrack()}
                  <div className="seq-spark-container seq-chord-sublane-grid">
                    {SYNTH_CHORD_SUB_LANE_NAMES_V2.map(renderChordSubLaneEditor)}
                  </div>
                </div>
              )}

              {/* Mini overview at bottom */}
              <SeqMiniOverview
                patterns={seq.miniPatterns}
                playheads={seq.playheads}
                colors={LANE_CONFIGS.map(c => c.color)}
                sequencers={seq.sequencerModels}
                onRowClick={(idx) => {
                  setChordSequencerSelected(false);
                  seq.setActiveTab(idx);
                }}
              />
              <div className="seq-mini-overview seq-mini-overview--chord">
                <div
                  className={`seq-mini-row seq-mini-row--chord${chordSequencerSelected ? ' active' : ''}${!chordSequencerEnabled ? ' muted' : ''}`}
                  style={{ '--sc': CHORD_SEQUENCER_LANE_COLOR } as React.CSSProperties}
                  onClick={() => setChordSequencerSelected(true)}
                >
                  <div className="seq-mini-label">
                    <span>{CHORD_SEQUENCER_LANE_NAME}</span>
                    <span className="mini-ms">{chordSequencerConfig.playbackMode}</span>
                  </div>
                  <div className="seq-mini-dots">
                    {chordSequencerConfig.steps.map((step, index) => (
                      <span
                        key={step.id}
                        className={`${index < chordSequencerConfig.stepCount && step.enabled ? 'dot-hit' : 'dot-rest'}${index === chordSequencerPlayhead ? ' dot-cur' : ''}`}
                      >
                        {index < chordSequencerConfig.stepCount && step.enabled ? '●' : '·'}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════ OVERVIEW MODE ══════ */}
          {seq.viewMode === 'overview' && (
            <>
              <SequencerChainRail
                chain={state.synthSequencerChain}
                lanes={seq.sequencerModels.map((model) => ({ name: model.name, color: model.color }))}
                selectedLaneIndex={seq.activeTab}
                activeEntryIndex={synthChainPosition?.activeEntryIndex ?? null}
                onChange={setSynthSequencerChain}
                onSelectLane={(index) => {
                  setChordSequencerSelected(false);
                  seq.setActiveTab(index);
                }}
              />
              <div className="seq-overview">
                {seq.sequencerModels.map((seqModel, row) => {
                  const source = synthSourceSelectValue(state[getSourceKey(row)] ?? 'lead1');
                  const sourceInfo = SYNTH_SOURCES.find(s => s.value === source);
                  const chainBadge = sequencerChainBadgeLabel(state.synthSequencerChain, row);
                  return (
                    <div
                      key={seqModel.id}
                      className={`seq-ov-row${seqModel.muted ? ' muted' : ''}`}
                      style={{ '--sc': seqModel.color } as React.CSSProperties}
                    >
                      <div className="seq-ov-header" onClick={() => {
                        setChordSequencerSelected(false);
                        seq.setActiveTab(row);
                        seq.setViewMode('detail');
                      }}>
                        <span className="seq-ov-name">{seqModel.name}</span>
                        {chainBadge && (
                          <span className={`seq-chain-badge${synthChainPosition?.activeLaneIndex === row ? ' active' : ''}`}>
                            {chainBadge}
                          </span>
                        )}
                        <div className="seq-ov-controls" onClick={(e) => e.stopPropagation()}>
                          <DragNumber
                            value={seqModel.trigger.steps}
                            min={2} max={EUCLIDEAN_STEP_MAX} label="S" shapeByDrag
                            onChange={(v) => seq.setParam(row, 'Steps', v)}
                          />
                          <DragNumber
                            value={seqModel.trigger.hits}
                            min={0} max={seqModel.trigger.steps} label="H"
                            onChange={(v) => seq.setParam(row, 'Hits', v)}
                          />
                          <div className="seq-rotation-control seq-ov-rot">
                            <button onClick={() => seq.rotateSequence(row, -1)}>{'\u2190'}</button>
                            <span className="seq-rotation-val">{seqModel.trigger.rotation}</span>
                            <button onClick={() => seq.rotateSequence(row, 1)}>{'\u2192'}</button>
                          </div>
                          <select
                            className="seq-ov-select seq-ov-clk"
                            value={seqModel.clockDiv}
                            onChange={(e) => seq.setClockDiv(row, e.target.value as any)}
                            {...bindHelp('synthSeqClockSelect')}
                          >
                            <option value="1/4">1/4</option>
                            <option value="1/4T">1/4T</option>
                            <option value="1/8">1/8</option>
                            <option value="1/8T">1/8T</option>
                            <option value="1/16">1/16</option>
                            <option value="1/16T">1/16T</option>
                            <option value="1/32">1/32</option>
                            <option value="1/32T">1/32T</option>
                          </select>
                          {/* Source dropdown */}
                          <select
                            className="seq-ov-select synth-ov-source"
                            value={source}
                            onChange={(e) => handleLaneSourceChange(row, e.target.value)}
                            {...bindHelp('synthSeqSourceSelect')}
                            style={{ color: sourceInfo?.color ?? '#888' }}
                          >
                            {SYNTH_SOURCES.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                          <button
                            className={`ov-mute-btn${seqModel.muted ? ' on' : ''}`}
                            onClick={(e) => { e.stopPropagation(); seq.toggleMute(row); }}
                          >M</button>
                          <button
                            className={`ov-solo-btn${seqModel.solo ? ' on' : ''}`}
                            onClick={(e) => { e.stopPropagation(); seq.toggleSolo(row); }}
                          >S</button>
                        </div>
                      </div>
                      {/* Trigger grid */}
                      <div className="seq-ov-grid-wrap">
                        {(() => {
                          const visibleCells = sequencerGridCellCount(seqModel.trigger.steps);
                          const columnCount = sequencerGridColumnCount(seqModel.trigger.steps);
                          return (
                            <div className="seq-step-grid" style={{ gridTemplateColumns: `repeat(${columnCount}, 1fr)` }}>
                              {new Array(visibleCells).fill(0).map((_, step) => {
                                const inRange = step < seqModel.trigger.steps;
                                const hit = inRange ? (seqModel.trigger.pattern[step] ?? false) : false;
                                const isPlayhead = inRange && ((seq.playheads[row] ?? 0) % seqModel.trigger.steps === step);
                                const prob = inRange ? (seqModel.trigger.probability[step] ?? 1.0) : 1.0;
                                const probPct = Math.round(prob * 100);
                                const sequenceModeForRow = (pitchBindingModes[row] ?? 'polyrhythmic') === 'sequence';
                                const triggerCursorVisibleForRow = showKeyboard
                                  && keyboardInputMode === 'sequence'
                                  && row === seq.activeTab
                                  && activeKeyboardEditLane === 'trigger';
                                const sequenceSelected = showKeyboard
                                  && triggerCursorVisibleForRow
                                  && step === (triggerKeyboardSteps[row] ?? 0);
                                const stepNoteLabel = inRange && sequenceModeForRow ? getSequenceStepLabel(row, step) : null;
                                const stepNoteMidi = inRange && sequenceModeForRow ? getSequenceStepMidi(row, step) : null;
                                const stepNoteStatus = stepNoteMidi == null ? null : classifyKeyboardMidi(stepNoteMidi);

                                return (
                                  <div key={step} className="seq-step">
                                    <span className="seq-step-num">{step % 4 === 0 ? step + 1 : ''}</span>
                                    <button
                                      type="button"
                                      className={`seq-step-cell${hit ? ' active' : ''}${isPlayhead ? ' playing' : ''}${!inRange ? ' inactive' : ''}${sequenceSelected ? ' selected' : ''}${stepNoteStatus ? ` harmony-${stepNoteStatus}` : ''}`}
                                      style={{ touchAction: 'none' } as React.CSSProperties}
                                      onPointerDown={inRange ? (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const el = e.currentTarget;
                                        el.setPointerCapture(e.pointerId);
                                        const startY = e.clientY;
                                        const startProb = prob;
                                        let dragged = false;
                                        const onMove = (ev: PointerEvent) => {
                                          if (Math.abs(ev.clientY - startY) > 5) dragged = true;
                                          if (!dragged) return;
                                          const pct = Math.max(0, Math.min(1,
                                            startProb + (startY - ev.clientY) / OV_PROB_DRAG_PX
                                          ));
                                          const snapped = Math.round(pct * 20) / 20;
                                          seq.setStepProbability(row, step, snapped);
                                          setDragPopup({ x: ev.clientX, y: ev.clientY, text: `${Math.round(snapped * 100)}%` });
                                        };
                                        const onUp = () => {
                                          el.removeEventListener('pointermove', onMove);
                                          el.removeEventListener('pointerup', onUp);
                                          setDragPopup(null);
                                          if (!dragged) {
                                            if (showKeyboard && keyboardInputMode === 'sequence') {
                                              selectTriggerSequenceStep(row, step);
                                            } else {
                                              seq.toggleTriggerStep(row, step);
                                            }
                                          }
                                        };
                                        el.addEventListener('pointermove', onMove);
                                        el.addEventListener('pointerup', onUp);
                                      } : undefined}
                                      onDoubleClick={inRange ? (e) => {
                                        e.stopPropagation();
                                        seq.resetStepProbability(row, step);
                                      } : undefined}
                                    >
                                      {inRange && (
                                        <div className="prob-fill" style={{ height: `${probPct}%` }} />
                                      )}
                                      {inRange && <span className="prob-label">{probPct}%</span>}
                                      {sequenceSelected && (
                                        <span
                                          className="seq-step-cursor"
                                          style={getKeyboardCursorMarkerStyle(seqModel.color)}
                                          aria-hidden="true"
                                        >
                                          {keyboardTargetLabel}
                                        </span>
                                      )}
                                      {stepNoteLabel && <span className="seq-step-note">{stepNoteLabel}</span>}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
                <div
                  className={`seq-ov-row seq-ov-row--chord${!chordSequencerEnabled ? ' muted' : ''}`}
                  style={{ '--sc': CHORD_SEQUENCER_LANE_COLOR } as React.CSSProperties}
                >
                  <div className="seq-ov-header" onClick={() => {
                    setChordSequencerSelected(true);
                    seq.setViewMode('detail');
                  }}>
                    <span className="seq-ov-name">{CHORD_SEQUENCER_LANE_NAME}</span>
                    <span className="seq-chain-badge active">Chord</span>
                    <div className="seq-ov-controls" onClick={(e) => e.stopPropagation()}>
                      <DragNumber
                        value={chordSequencerConfig.stepCount}
                        min={CHORD_SEQUENCER_STEP_OPTIONS[0] ?? 1}
                        max={CHORD_SEQUENCER_STEP_OPTIONS[CHORD_SEQUENCER_STEP_OPTIONS.length - 1] ?? 8}
                        label="S"
                        shapeByDrag
                        onChange={setChordSequencerStepCount}
                      />
                      <button
                        type="button"
                        className={`ov-mute-btn${!chordSequencerEnabled ? ' on' : ''}`}
                        onClick={toggleChordSequencerEnabled}
                      >
                        M
                      </button>
                      <select
                        className="seq-ov-select synth-ov-source"
                        value={chordSequencerSourceValue}
                        onChange={(event) => setChordSequencerSource(event.target.value)}
                        style={{ color: chordSequencerSourceInfo.color }}
                      >
                        {CHORD_SEQUENCER_SOURCES.map((source) => (
                          <option key={source.value} value={source.value}>{source.label}</option>
                        ))}
                      </select>
                      <select
                        className="seq-ov-select"
                        value={chordSequencerClockDivision}
                        onChange={(event) => onSelectChange('synthChordSequencerClockDivision' as keyof SliderState, event.target.value as SliderState[keyof SliderState])}
                      >
                        <option value="1/4">1/4</option>
                        <option value="1/4T">1/4T</option>
                        <option value="1/8">1/8</option>
                        <option value="1/8T">1/8T</option>
                        <option value="1/16">1/16</option>
                        <option value="1/16T">1/16T</option>
                        <option value="1/32">1/32</option>
                        <option value="1/32T">1/32T</option>
                      </select>
                      <select
                        className="seq-ov-select"
                        value={chordSequencerConfig.playbackMode}
                        onChange={(event) => updateChordSequencerConfig((current) => ({
                          ...current,
                          playbackMode: event.target.value as SynthChordSequencerPlaybackMode,
                        }))}
                      >
                        {CHORD_PLAYBACK_MODES.map((mode) => (
                          <option key={mode.value} value={mode.value}>{mode.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="seq-ov-grid-wrap seq-ov-grid-wrap--chord">
                    <div className="seq-step-grid seq-chord-overview-grid" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
                      {chordSequencerConfig.steps.map((step, index) => {
                        const inRange = index < chordSequencerConfig.stepCount;
                        const tie = inRange && chordSequencerTieSteps[index];
                        return (
                          <div key={step.id} className="seq-step">
                            <span className="seq-step-num">{index + 1}</span>
                            <button
                              type="button"
                              className={`seq-step-cell seq-chord-overview-cell${inRange && step.enabled ? ' active' : ''}${tie ? ' tie' : ''}${inRange && index === chordSequencerPlayhead ? ' playing' : ''}${!inRange ? ' inactive' : ''}`}
                              onClick={() => inRange && updateChordSequencerStep(index, { enabled: !step.enabled })}
                            >
                              <span className="seq-chord-overview-label">
                                {chordSequencerTriggerLabels[index] ?? ''}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
              {dragPopup && (
                <div className="seq-drag-popup" style={{ left: dragPopup.x, top: dragPopup.y }}>
                  {dragPopup.text}
                </div>
              )}
              <SeqMiniOverview
                patterns={seq.miniPatterns}
                playheads={seq.playheads}
                colors={LANE_CONFIGS.map(c => c.color)}
                sequencers={seq.sequencerModels}
                onRowClick={(idx) => {
                  setChordSequencerSelected(false);
                  seq.setActiveTab(idx);
                  seq.setViewMode('detail');
                }}
              />
              <div className="seq-mini-overview seq-mini-overview--chord">
                <div
                  className={`seq-mini-row seq-mini-row--chord${chordSequencerSelected ? ' active' : ''}${!chordSequencerEnabled ? ' muted' : ''}`}
                  style={{ '--sc': CHORD_SEQUENCER_LANE_COLOR } as React.CSSProperties}
                  onClick={() => {
                    setChordSequencerSelected(true);
                    seq.setViewMode('detail');
                  }}
                >
                  <div className="seq-mini-label">
                    <span>{CHORD_SEQUENCER_LANE_NAME}</span>
                    <span className="mini-ms">{chordSequencerConfig.playbackMode}</span>
                  </div>
                  <div className="seq-mini-dots">
                    {chordSequencerConfig.steps.map((step, index) => (
                      <span
                        key={step.id}
                        className={`${index < chordSequencerConfig.stepCount && step.enabled ? 'dot-hit' : 'dot-rest'}${index === chordSequencerPlayhead ? ' dot-cur' : ''}`}
                      >
                        {index < chordSequencerConfig.stepCount && step.enabled ? '●' : '·'}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {leadEditorSlot && (
        <Lead4opFMEditorOverlay
          open
          presetId={activeLeadEditorPresetId}
          slotLabel={activeLeadEditorSlot?.slotLabel ?? ''}
          sourceLabel={leadEditorSlot.sourceLabel}
          accentColor={activeLeadEditorSlot?.accentColor ?? '#f59e0b'}
          library={activeLeadEditorSourceLibrary ?? activeLeadEditorOption?.library}
          canOverwrite={activeLeadEditorCanOverwrite}
          overwriteLabel={activeLeadEditorOverwriteLabel}
          slotOptions={leadEditorSlot.slots.map(slot => ({
            key: slot.slotKey,
            label: slot.slotLabel,
            accentColor: slot.accentColor,
          }))}
          activeSlotKey={activeLeadEditorSlot?.slotKey}
          onSlotChange={(slotKey) => {
            setLeadEditorSlot((previous) => previous
              ? { ...previous, slotKey: slotKey as LeadPresetSlotKey }
              : previous);
          }}
          onClose={() => setLeadEditorSlot(null)}
          onApply={handleLeadEditorApply}
        />
      )}
      <PresetPoolPopup
        open={Boolean(padPoolPopupSlot)}
        title={`Preset Pool: ${getPresetPoolLabel(activePadPool.poolKey ?? 'pad')}`}
        candidates={activePadPoolCandidates}
        poolIds={activePadPool.poolIds}
        accentColor={padPoolPopupSlot?.scope === 'pad2' ? '#8b5cf6' : '#4a9eff'}
        onChange={activePadPool.setPoolIds}
        onReset={activePadPool.resetPoolIds}
        onClose={() => setPadPoolPopupSlot(null)}
        onAudition={handlePadPoolAudition}
        onLoad={handlePadPoolLoad}
        onDelete={handlePadPoolDelete}
        onRate={handlePadPoolRate}
      />
      <PresetPoolPopup
        open={Boolean(leadPoolPopupSlot)}
        title={`Preset Pool: ${getPresetPoolLabel(leadPool.poolKey ?? 'lead4opfm')}`}
        candidates={leadPoolCandidates}
        poolIds={leadPool.poolIds}
        accentColor="#f59e0b"
        onChange={leadPool.setPoolIds}
        onReset={leadPool.resetPoolIds}
        onClose={() => setLeadPoolPopupSlot(null)}
        onAudition={handleLeadPoolAudition}
        onLoad={handleLeadPoolLoad}
        onDelete={handleLeadPoolDelete}
        onRate={handleLeadPoolRate}
      />
    </div>
  );
};

export default SynthPage;
