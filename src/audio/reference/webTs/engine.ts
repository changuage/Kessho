/**
 * REFERENCE / A-B TESTING PATH
 *
 * This file is required for web-ts, product-test, parity checks, and A/B comparison.
 * Do not delete or simplify in a way that changes behavior unless the corresponding
 * Product Core replacement and A/B validation have landed.
 *
 * Status: Keep Active — Archive Later
 *
 * Audio Engine
 *
 * Main audio graph management with:
 * - Poly synth pad (6 voices)
 * - Granular effect (AudioWorklet)
 * - Algorithmic reverb (AudioWorklet)
 * - Rhodes/Bell lead synth with delay
 * - Ikeda-style drum synth
 * - Ocean sample player
 * - Master limiter
 * - Deterministic scheduling
 */

import {
  HarmonyState,
  createHarmonyState,
  updateHarmonyState,
  CircleOfFifthsConfig,
  HarmonyParams,
  getEffectiveTension,
} from '../../harmony';
import { getScaleNotesInRange, midiToFreq } from '../../scales';
import {
  createRng,
  generateRandomSequence,
  getUtcBucket,
  computeSeed,
  computeGranularRuntimeSeed,
  granularRuntimeSeedMaterial,
  rngFloat,
} from '../../rng';
import { DrumSynth, DrumVoiceType } from '../../drumSynth';
import type { DrumStepOverrides, LaneDirection, TrigCondition, ClockDivision, PitchMode, ScaleName, PitchBindingMode } from '../../drumSeqTypes';
import { SCALES } from '../../drumSeqTypes';
import { seqLaneIndex, seqEuclidean } from '../../drumSequencer';
import { sequencerClockDivisionToSeconds } from '../../sequencerClockDivisions';
import { resolveSequencerLaneAudibility } from '../../sequencerAudibility';
import { sequencerResumeQuantizationForLane } from '../../sequencerResumeQuantization';
import {
  createSequencerResumeRuntimeState,
  invalidatePendingSequencerResumeBoundaries,
  resetSequencerResumeRuntimeState,
  updateSequencerResumeRuntimeLane,
} from '../../sequencerResumeRuntime';
import { normalizeSequencerPitchBindingMode } from '../../sequencerPitchBinding';
import { normalizeSequencerPitchSettings, type SequencerPitchSettings } from '../../sequencerPitchSettings';
import { normalizeSequencerSwing } from '../../sequencerSwing';
import { generateDiceValues, generateDicePitchOffsets, blendDiceValues, clamp as clampVal, clampSequencerRatchet } from '../../seqEvolveCore';
import {
  evolveSynthLane,
  resetSynthLaneToHome,
  captureSynthHomeSnapshot,
  defaultSynthEvolveConfig,
  defaultSynthEvolveState,
} from '../../synthSeqEvolve';
import type { SynthEvolveConfig, SynthEvolveState, SynthLaneOverrides } from '../../synthSeqEvolve';
import { computeGranularMacroModel } from '../../granularMacroModel';
import type { CoreProductGranularVisualEvent } from '../../coreProductTelemetry';
import { SharedDelayBusA, SharedDelayBusB, delayNoteToSeconds } from '../../delayBuses';
import { resolveDynamicsTargets, type DynamicsRoutingTargets, type DynamicsTargets } from '../../dynamicsModel';
import { toDynamicsDriftParamObject } from '../../dynamicsDriftParams';
import { DEFAULT_MASTER_VOLUME, ENGINE_TRIMS, MASTER_OUTPUT_TRIM } from '../../outputTrims';
import { isIOSLikeDevice, isMobileDevice } from '../../../platform';
import {
  EarthTexturePlayer,
  type EarthTexturePlayerDebugSnapshot,
} from '../../earthTexturePlayer';
import {
  type PianoSampleVariant,
  choosePianoSampleVariant,
  frequencyToMidiNote,
  getManualPianoPrioritySampleIndices,
  getNearestPianoSample,
  getPianoSamplePath,
  getPianoSampleMidi,
  PIANO_SAMPLE_COUNT,
} from '../../pianoSamples';
import type { KesshoMidiMessage } from '../../../native/capacitorMidiRouting';
import {
  type TransportAnchors,
  type TransportDebugSnapshot,
  getCurrentClockIndexWall,
  getEffectiveSequencerBpm,
  getNextBarBoundaryCtxTime,
  getNextBeatGridCtxTime,
  getPhraseDurationForClockSource,
  sampleGlobalWalkPosition,
  getTimeUntilNextBoundaryWall,
  getTransportMetrics,
  resolveProgressionPhraseClockSource,
} from '../../transport';
import { chordIntervalSecondsFromState, resolveChordsPerPhrase } from '../../chordPhraseTiming';
import { harmonySeedPayloadJsonFromState } from '../../harmonySeedMaterial';
import { SEQUENCER_VISUAL_SYNC_OFFSET_MS } from '../../sequencerVisualSync';
import { getChangedRuntimeWalkParameterKeys } from './runtimeWalkParameterDiff';
import type { StemRecordTrackId } from '../../recordingTracks';
import { DEFAULT_REVERB_PRE_COMP, getIndexedDelayDivisionValue, getStateValueFromSliderNumber, quantize, type IndexedDelayDivisionKey, type SliderState } from '../../../ui/state';
import {
  applyDistanceValue,
  applyLeadDistanceEnvelope,
  applyPadDistanceToState,
  applyPianoDistanceEnvelope,
  getVoiceDistanceValue,
} from '../../distanceMacro';
export interface RecordableTrackSource {
  node: AudioNode | null;
  outputIndex?: number;
}

type WebGraphRecordTrackId =
  | 'reverbInput'
  | 'pad1Dry'
  | 'pad1ReverbSend'
  | 'pad1DelayASend'
  | 'pad1DelayBSend'
  | 'pad1GranularSend'
  | 'pad2Dry'
  | 'pad2ReverbSend'
  | 'pad2DelayASend'
  | 'pad2DelayBSend'
  | 'pad2GranularSend'
  | 'lead1Dry'
  | 'lead1ReverbSend'
  | 'lead1DelayASend'
  | 'lead1DelayBSend'
  | 'lead1GranularSend'
  | 'lead2Dry'
  | 'lead2ReverbSend'
  | 'lead2DelayASend'
  | 'lead2DelayBSend'
  | 'lead2GranularSend'
  | 'pianoDry'
  | 'pianoReverbSend'
  | 'pianoDelayASend'
  | 'pianoDelayBSend'
  | 'pianoGranularSend'
  | 'diffuseInput'
  | 'diffuseOutput'
  | 'diffuseDirectOut'
  | 'diffuseOut'
  | 'diffuseReverbSend'
  | 'pad1DiffuseSend'
  | 'padDiffuseSend'
  | 'pad2DiffuseSend'
  | 'lead1DiffuseSend'
  | 'lead2DiffuseSend'
  | 'pianoDiffuseSend'
  | 'oceanDry'
  | 'wavesDry'
  | 'waterDry'
  | 'insectsDry'
  | 'natureDry'
  | 'oceanReverbSend'
  | 'wavesReverbSend'
  | 'oceanDelayASend'
  | 'wavesDelayASend'
  | 'oceanDelayBSend'
  | 'wavesDelayBSend'
  | 'oceanGranularSend'
  | 'wavesGranularSend'
  | 'granularWavesSend'
  | 'waterReverbSend'
  | 'waterDelayASend'
  | 'waterDelayBSend'
  | 'waterGranularSend'
  | 'granularWaterSend'
  | 'insectsReverbSend'
  | 'insectsDelayASend'
  | 'insDelayASend'
  | 'insectsDelayBSend'
  | 'insDelayBSend'
  | 'insectsGranularSend'
  | 'granularInsectsSend'
  | 'natureReverbSend'
  | 'natureDelayASend'
  | 'natureDelayBSend'
  | 'natureGranularSend'
  | 'granularNatureSend'
  | 'soundscapeStem'
  | 'earthStem'
  | 'delayAInput'
  | 'delayBInput'
  | 'granularInput'
  | 'delayAOutput'
  | 'delayADirectOut'
  | 'delayAReverbSend'
  | 'delayAToDelayBSend'
  | 'delayAToBSend'
  | 'delayAToGranularSend'
  | 'delayAGranularSend'
  | 'delayBOutput'
  | 'delayBDirectOut'
  | 'delayBReverbSend'
  | 'delayBToDelayASend'
  | 'delayBToASend'
  | 'delayBToGranularSend'
  | 'delayBGranularSend'
  | 'granularOutput'
  | 'granularDirectOut'
  | 'granularFxDirect'
  | 'granularReverbSend'
  | 'granularFxReverbSend'
  | 'granularToDelayASend'
  | 'granularDelayASend'
  | 'granularToDelayBSend'
  | 'granularDelayBSend'
  | 'reverbOutput'
  | 'reverbReturn'
  | 'reverbPreconditionerOut'
  | 'reverbPreconditionerOutput'
  | 'reverbConditionedInput'
  | 'spectralFreezeInput'
  | 'spectralFreezeOutput'
  | 'drumDry'
  | 'drumReverbSend'
  | 'drumDelayASend'
  | 'drumDelayBSend'
  | 'drumGranularSend'
  | 'sidechainPad1Input'
  | 'sidechainPad1Output'
  | 'sidechainPad1GainTrace'
  | 'sidechainPad2Input'
  | 'sidechainPad2Output'
  | 'sidechainPad2GainTrace'
  | 'sidechainLead1Input'
  | 'sidechainLead1Output'
  | 'sidechainLead1GainTrace'
  | 'sidechainLead2Input'
  | 'sidechainLead2Output'
  | 'sidechainLead2GainTrace'
  | 'sidechainPianoInput'
  | 'sidechainPianoOutput'
  | 'sidechainPianoGainTrace'
  | 'sidechainGranularInput'
  | 'sidechainGranularOutput'
  | 'sidechainGranularGainTrace'
  | 'sidechainDelayAInput'
  | 'sidechainDelayAOutput'
  | 'sidechainDelayAGainTrace'
  | 'sidechainDelayBInput'
  | 'sidechainDelayBOutput'
  | 'sidechainDelayBGainTrace'
  | 'sidechainReverbInput'
  | 'sidechainReverbOutput'
  | 'sidechainReverbGainTrace'
  | 'dynamicsInput'
  | 'dynamicsOutput'
  | 'masterPreLimiter'
  | 'masterPostLimiter';

type DiagnosticRecordTrackId = StemRecordTrackId | 'pad1Pre' | 'reverbFeed' | WebGraphRecordTrackId;
type EvolvedAudioSubLane = 'pitch' | 'expression' | 'morph' | 'distance';
type EvolvedSubLanePatch = Partial<Record<EvolvedAudioSubLane, { enabled: boolean; steps: number; direction: LaneDirection; scaleQuantize?: boolean }>>;
type EvolvedDrumSubLane = EvolvedAudioSubLane | 'slice' | 'reverse';
type EvolvedDrumSubLanePatch = Partial<Record<EvolvedDrumSubLane, { enabled: boolean; steps: number; direction: LaneDirection; scaleQuantize?: boolean }>>;
type SynthEvolveOverridesPayload = Partial<SynthLaneOverrides> & { swing?: number; subLaneStates?: EvolvedSubLanePatch; pitchSettings?: (SequencerPitchSettings | null)[] };
type DrumEvolveOverridesPayload = Partial<DrumStepOverrides> & { swing?: number; subLaneStates?: EvolvedDrumSubLanePatch; pitchSettings?: (SequencerPitchSettings | null)[] };
type SynthPlayStepNote = { midi: number; offsetMs: number; velocity: number; voiceIndex: number };
type SynthPlayNoteTable = SynthPlayStepNote[][];
const EUCLIDEAN_STEP_MAX = 32;
const SYNTH_PLAY_MAX_NOTES_PER_TRIGGER = 32;
const SYNTH_PLAY_NOTE_OFFSET_MAX_MS = 16000;

function normalizeSynthPlayNoteTable(value: unknown): SynthPlayNoteTable | null {
  if (!Array.isArray(value)) return null;
  const table: SynthPlayNoteTable = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const rawStep = record.step;
    const rawMidi = record.midi;
    if (typeof rawStep !== 'number' || !Number.isFinite(rawStep)) continue;
    if (typeof rawMidi !== 'number' || !Number.isFinite(rawMidi)) continue;
    const step = Math.max(0, Math.min(63, Math.round(rawStep)));
    const voiceIndex = typeof record.voiceIndex === 'number' && Number.isFinite(record.voiceIndex)
      ? Math.max(0, Math.min(SYNTH_PLAY_MAX_NOTES_PER_TRIGGER - 1, Math.round(record.voiceIndex)))
      : 0;
    const note: SynthPlayStepNote = {
      midi: Math.max(24, Math.min(108, rawMidi)),
      offsetMs: typeof record.offsetMs === 'number' && Number.isFinite(record.offsetMs)
        ? Math.max(0, Math.min(SYNTH_PLAY_NOTE_OFFSET_MAX_MS, record.offsetMs))
        : 0,
      velocity: typeof record.velocity === 'number' && Number.isFinite(record.velocity)
        ? Math.max(0.05, Math.min(1, record.velocity))
        : 1,
      voiceIndex,
    };
    if (!table[step]) table[step] = [];
    table[step]!.push(note);
  }
  for (const notes of table) {
    notes?.sort((left, right) => left.voiceIndex - right.voiceIndex || left.midi - right.midi);
  }
  return table.some((notes) => (notes?.length ?? 0) > 0) ? table : null;
}

function normalizeSynthPlayNoteTables(
  value: unknown,
  fallback: (SynthPlayNoteTable | null)[],
): (SynthPlayNoteTable | null)[] {
  if (!Array.isArray(value)) return fallback;
  return SYNTH_LANE_INDICES.map((laneIndex) => normalizeSynthPlayNoteTable(value[laneIndex])) as Quad<SynthPlayNoteTable | null>;
}

type StereoWidthProcessor = {
  input: GainNode;
  splitter: ChannelSplitterNode;
  merger: ChannelMergerNode;
  output: GainNode;
  leftDirectGain: GainNode;
  rightDirectGain: GainNode;
  leftCrossGain: GainNode;
  rightCrossGain: GainNode;
};

function synthEvolvedSubLaneStatePatch(overrides: SynthLaneOverrides): EvolvedSubLanePatch {
  const patch: EvolvedSubLanePatch = {};
  const add = (lane: EvolvedAudioSubLane, values: number[] | null, direction: LaneDirection | null): void => {
    if (!Array.isArray(values)) return;
    patch[lane] = {
      enabled: true,
      steps: Math.max(1, Math.min(EUCLIDEAN_STEP_MAX, values.length)),
      direction: direction ?? 'forward',
    };
  };
  add('pitch', overrides.pitch, overrides.pitchDirection);
  add('expression', overrides.expression, overrides.expressionDirection);
  add('morph', overrides.morph, overrides.morphDirection);
  add('distance', overrides.distance, overrides.distanceDirection);
  return patch;
}

function drumStepOverrideSubLaneStatePatch(
  overrides: DrumStepOverrides,
  laneIndex: number,
  fallback?: DrumStepOverrides | null,
): EvolvedDrumSubLanePatch {
  const patch: EvolvedDrumSubLanePatch = {};
  const add = (
    lane: EvolvedDrumSubLane,
    valueKey: 'pitch' | 'expression' | 'morph' | 'distance' | 'slice' | 'reverse',
    directionKey: 'pitchDirection' | 'expressionDirection' | 'morphDirection' | 'distanceDirection' | 'sliceDirection' | 'reverseDirection',
  ): void => {
    const values = overrides[valueKey]?.[laneIndex] ?? null;
    const fallbackValues = fallback?.[valueKey]?.[laneIndex] ?? null;
    const direction = overrides[directionKey]?.[laneIndex] ?? fallback?.[directionKey]?.[laneIndex] ?? 'forward';
    patch[lane] = {
      enabled: Array.isArray(values),
      steps: Math.max(1, Math.min(EUCLIDEAN_STEP_MAX, Array.isArray(values)
        ? values.length
        : Array.isArray(fallbackValues) ? fallbackValues.length : 1)),
      direction,
    };
  };
  add('pitch', 'pitch', 'pitchDirection');
  add('expression', 'expression', 'expressionDirection');
  add('morph', 'morph', 'morphDirection');
  add('distance', 'distance', 'distanceDirection');
  add('slice', 'slice', 'sliceDirection');
  add('reverse', 'reverse', 'reverseDirection');
  return patch;
}

type VoiceSpatialChain = {
  postLpf: BiquadFilterNode;
  postLpfStage2: BiquadFilterNode | null;
  width: StereoWidthProcessor;
  diffuseSend: GainNode;
  output: GainNode;
};

type SidechainTargetKey = 'pad1' | 'pad2' | 'lead1' | 'lead2' | 'piano' | 'granular' | 'delayA' | 'delayB' | 'reverb';

type SidechainTargetNode = {
  input: GainNode;
  dry: GainNode;
  duck: GainNode;
  output: GainNode;
  traceSource: ConstantSourceNode | null;
  traceDry: GainNode | null;
  traceDuck: GainNode | null;
  traceOutput: GainNode | null;
  duckingUntil: number;
};

export type DynamicsAnalyserKey =
  | 'input'
  | 'postDegrade'
  | 'preSaturation'
  | 'postSaturation'
  | 'endInput'
  | 'endOutput';

export type DynamicsWorkletVisualTelemetry = {
  inputPeak: number;
  outputPeak: number;
  wetPeak: number;
  driftEnv: number;
  driftReductionDb: number;
  dropoutGain: number;
  endInputPeak: number;
  endOutputPeak: number;
  endReductionDb: number;
  endDetectorDb: number;
  driftCombRisk: number;
  driftMinDelayMs: number;
  driftDiffusion: number;
  erosionEventEnv: number;
  erosionEventGainDb: number;
  erosionProfileAmount: number;
  endLowReductionDb: number;
  endHighReductionDb: number;
  endClarityBoostDb: number;
  endBandSplitHz: number;
  endCompMode: number;
  masterSatOversamplingFactor: number;
  timestamp: number;
};

export type DynamicsSidechainVisualEvent = {
  id: number;
  time: number;
  voice: DrumVoiceType;
  attack: number;
  hold: number;
  release: number;
  amount: number;
  keyStrength: number;
  targetStrength: number;
  reductionDb: number;
};

export type DynamicsVisualTelemetrySnapshot = {
  contextTime: number;
  endCompHandledByWorklet: boolean;
  endCompReductionDb: number;
  worklet: DynamicsWorkletVisualTelemetry | null;
  sidechainEvents: DynamicsSidechainVisualEvent[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneSignatureSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneSignatureSnapshot);
  }
  if (isPlainObject(value)) {
    const snapshot: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      snapshot[key] = cloneSignatureSnapshot(entry);
    }
    return snapshot;
  }
  return value;
}

function areSignatureSnapshotsEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!areSignatureSnapshotsEqual(left[index], right[index])) return false;
    }
    return true;
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    for (const key of leftKeys) {
      if (!(key in right)) return false;
      if (!areSignatureSnapshotsEqual(left[key], right[key])) return false;
    }
    return true;
  }
  return false;
}

function areBooleanArraysEqual(left: boolean[] | undefined, right: boolean[] | undefined): boolean {
  if (left === right) return true;
  const safeLeft = left ?? [];
  const safeRight = right ?? [];
  if (safeLeft.length !== safeRight.length) return false;
  for (let index = 0; index < safeLeft.length; index += 1) {
    if (safeLeft[index] !== safeRight[index]) return false;
  }
  return true;
}

type PerfMetrics = {
  avgPercent: number;
  peakPercent: number;
  missPercent: number | null;
  scope?: 'worklet' | 'source';
};

type EarthTextureRuntime = {
  player: EarthTexturePlayer;
  sourceBus: GainNode;
  gateGain: GainNode;
  preFaderBus: GainNode;
  levelGain: GainNode;
  reverbSend: GainNode;
  delayASend: GainNode | null;
  delayBSend: GainNode | null;
  granularSend: GainNode | null;
  fadeState: EarthFadeState;
};

type EarthFadeState = {
  initialized: boolean;
  targetEnabled: boolean;
  from: number;
  to: number;
  rampStartTime: number;
  rampEndTime: number;
  stopTimer: number | null;
};

type ActivePianoVoice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  filter?: BiquadFilterNode | null;
};

type RuntimeWalkRange = {
  min: number;
  max: number;
};

type RuntimeWalkState = {
  position: number;
  velocity: number;
};

type BootCapabilities = {
  reverb: boolean;
  spectralFreeze: boolean;
  soundscapes: boolean;
  granular: boolean;
};

const EARTH_LAYER_FADE_SECONDS = 5;
const EARTH_LAYER_FADE_MS = EARTH_LAYER_FADE_SECONDS * 1000;
const SOFT_STOP_SOURCE_FADE_SECONDS = 0.18;
const SOFT_STOP_SOURCE_FADE_MS = Math.round(SOFT_STOP_SOURCE_FADE_SECONDS * 1000);

function createEarthFadeState(): EarthFadeState {
  return {
    initialized: false,
    targetEnabled: false,
    from: 0,
    to: 0,
    rampStartTime: 0,
    rampEndTime: 0,
    stopTimer: null,
  };
}

export type ManualSynthSource = 'pad1' | 'pad2' | 'lead1' | 'lead2' | 'piano';

export type ManualSynthNoteOptions = {
  source: ManualSynthSource;
  midi: number;
  velocity?: number;
  durationMs?: number;
  voiceIndex?: number;
};

export type EarthTextureDebugState = {
  waves: EarthTexturePlayerDebugSnapshot | null;
  birds: EarthTexturePlayerDebugSnapshot | null;
  birds2: EarthTexturePlayerDebugSnapshot | null;
  frogs: EarthTexturePlayerDebugSnapshot | null;
};

type Quad<T> = [T, T, T, T];
type Hex<T> = [T, T, T, T, T, T];
type FxOwnershipBus = 'delayA' | 'delayB' | 'granular' | 'reverb';
type FxOwnershipSource = 'pad1' | 'pad2' | 'lead1' | 'lead2' | 'piano' | 'drum';
type FxOwnershipOrigin = 'padChord' | 'padEuclid' | 'leadNote' | 'pianoNote' | 'drumHit';

type FxOwnershipState = {
  owner: FxOwnershipSource | null;
  strength: number;
  expiresAtMs: number;
  lastOrigin: FxOwnershipOrigin | null;
};

export type FxOwnershipDebugState = Record<
  FxOwnershipBus,
  {
    owner: FxOwnershipSource | null;
    strength: number;
    lastOrigin: FxOwnershipOrigin | null;
    active: boolean;
  }
>;

const SYNTH_LANE_INDICES = [0, 1, 2, 3] as const;
const DRUM_LANE_INDICES = [0, 1, 2, 3] as const;
const PAD_VOICE_COUNT = 8;
const PAD_VOICE_MASK_ALL = (1 << PAD_VOICE_COUNT) - 1;

function createEmptyDrumStepOverrides(): DrumStepOverrides {
  return {
    triggerToggles: [new Map(), new Map(), new Map(), new Map()],
    probability: [null, null, null, null],
    ratchet: [null, null, null, null],
    trigCondition: [null, null, null, null],
    expression: [null, null, null, null],
    pitch: [null, null, null, null],
    morph: [null, null, null, null],
    distance: [null, null, null, null],
    nudge: [null, null, null, null],
    slice: [null, null, null, null],
    reverse: [null, null, null, null],
    expressionDirection: [null, null, null, null],
    morphDirection: [null, null, null, null],
    distanceDirection: [null, null, null, null],
    nudgeDirection: [null, null, null, null],
    pitchDirection: [null, null, null, null],
    sliceDirection: [null, null, null, null],
    reverseDirection: [null, null, null, null],
    expressionRanges: [null, null, null, null],
    morphRanges: [null, null, null, null],
    distanceRanges: [null, null, null, null],
  };
}

function cloneDrumStepOverrides(overrides: DrumStepOverrides | null | undefined): DrumStepOverrides {
  const source = overrides ?? createEmptyDrumStepOverrides();
  return {
    triggerToggles: DRUM_LANE_INDICES.map((index) => new Map(source.triggerToggles[index] ?? [])),
    probability: DRUM_LANE_INDICES.map((index) => source.probability[index] ? [...source.probability[index]!] : null),
    ratchet: DRUM_LANE_INDICES.map((index) => source.ratchet[index] ? [...source.ratchet[index]!] : null),
    trigCondition: DRUM_LANE_INDICES.map((index) => source.trigCondition?.[index] ? source.trigCondition[index]!.map((entry) => [entry[0], entry[1]] as TrigCondition) : null),
    expression: DRUM_LANE_INDICES.map((index) => source.expression[index] ? [...source.expression[index]!] : null),
    pitch: DRUM_LANE_INDICES.map((index) => source.pitch?.[index] ? [...source.pitch[index]!] : null),
    morph: DRUM_LANE_INDICES.map((index) => source.morph[index] ? [...source.morph[index]!] : null),
    distance: DRUM_LANE_INDICES.map((index) => source.distance[index] ? [...source.distance[index]!] : null),
    nudge: DRUM_LANE_INDICES.map((index) => source.nudge?.[index] ? [...source.nudge[index]!] : null),
    slice: DRUM_LANE_INDICES.map((index) => source.slice?.[index] ? [...source.slice[index]!] : null),
    reverse: DRUM_LANE_INDICES.map((index) => source.reverse?.[index] ? [...source.reverse[index]!] : null),
    expressionDirection: DRUM_LANE_INDICES.map((index) => source.expressionDirection?.[index] ?? null),
    morphDirection: DRUM_LANE_INDICES.map((index) => source.morphDirection?.[index] ?? null),
    distanceDirection: DRUM_LANE_INDICES.map((index) => source.distanceDirection?.[index] ?? null),
    nudgeDirection: DRUM_LANE_INDICES.map((index) => source.nudgeDirection?.[index] ?? null),
    pitchDirection: DRUM_LANE_INDICES.map((index) => source.pitchDirection?.[index] ?? null),
    sliceDirection: DRUM_LANE_INDICES.map((index) => source.sliceDirection?.[index] ?? null),
    reverseDirection: DRUM_LANE_INDICES.map((index) => source.reverseDirection?.[index] ?? null),
    expressionRanges: DRUM_LANE_INDICES.map((index) => source.expressionRanges?.[index] ?? null),
    morphRanges: DRUM_LANE_INDICES.map((index) => source.morphRanges?.[index] ?? null),
    distanceRanges: DRUM_LANE_INDICES.map((index) => source.distanceRanges?.[index] ?? null),
  };
}

function drumStepOverridesHomeIsEmpty(overrides: DrumStepOverrides): boolean {
  return overrides.triggerToggles.every((toggles) => toggles.size === 0) &&
    overrides.probability.every((values) => !values) &&
    overrides.ratchet.every((values) => !values) &&
    overrides.expression.every((values) => !values) &&
    overrides.pitch.every((values) => !values) &&
    overrides.morph.every((values) => !values) &&
    overrides.distance.every((values) => !values);
}

/**
 * Pick a note from availableNotes, weighted toward chord tones.
 * Chord tones get ~70% probability collectively; passing tones get ~30%.
 * Falls back to uniform if chord is empty or no overlap.
 */
function pickChordWeightedNote(
  rng: () => number,
  availableNotes: number[],
  chordMidiNotes: number[] | undefined,
  chordBias = 0.7,
): number {
  if (!chordMidiNotes || chordMidiNotes.length === 0 || availableNotes.length <= 1) {
    return availableNotes[Math.floor(rng() * availableNotes.length)]!;
  }
  // Build pitch-class set of chord tones (mod 12)
  const chordPCs = new Set(chordMidiNotes.map(n => n % 12));
  const chordTones: number[] = [];
  const passingTones: number[] = [];
  for (const n of availableNotes) {
    if (chordPCs.has(n % 12)) chordTones.push(n);
    else passingTones.push(n);
  }
  if (chordTones.length === 0) return availableNotes[Math.floor(rng() * availableNotes.length)]!;
  if (passingTones.length === 0) return chordTones[Math.floor(rng() * chordTones.length)]!;
  if (rng() < chordBias) return chordTones[Math.floor(rng() * chordTones.length)]!;
  return passingTones[Math.floor(rng() * passingTones.length)]!;
}
import { getPadPreset, morphPadPresets, PAD_PRESET_PARAM_KEYS } from '../../padPresets';
import { applyMorphToState, DrumMorphManager, updateAutoMorph, VOICE_MORPH_KEYS } from '../../drumMorph';
import {
  type Lead4opFMPreset,
  type Lead4opFMMorphedParams,
  loadLead4opFMPresetVerified,
  morphPresets,
  playLead4opFMNote,
  DEFAULT_SOFT_RHODES,
  DEFAULT_GAMELAN,
} from '../../lead4opfm';
import { morphWaterPresets, WATER_MORPH_PARAM_KEYS, type WaterPresetState } from '../../waterPresets';

type GranularVoiceMode = SliderState['granularV1Mode'];
type GranularGrainShape = NonNullable<SliderState['granularShape']>;
type GranularQuality = SliderState['granularQuality'];
type GranularPitchMode = SliderState['granularV1PitchMode'];
type GranularCloudStyle = SliderState['granularV1CloudStyle'];
type GranularAnchorPattern = SliderState['granularV1AnchorPattern'];

type GranularWorkletGlobalParams = {
  enabled: boolean;
  freeze: boolean;
  freezeWithFeedback: boolean;
  dryWet: number;
  feedback: number;
  feedbackLPF: number;
  bufferSeconds: number;
  grainShape: GranularGrainShape;
};

type GranularWorkletSpaceParams = {
  busDiffusion: number;
  timingRandomness: number;
  quality: GranularQuality;
  maxGrains: number;
  sprayMacro: number;
  cloudMacro: number;
  pitchMacro: number;
};

type GranularWorkletVoiceParams = {
  voiceEnabled: boolean[];
  voiceMode: GranularVoiceMode[];
  voiceSlice: number[];
  voiceSpeed: number[];
  voiceScanRate: number[];
  voiceReverse: boolean[];
  voicePitch: number[];
  voiceAttack: number[];
  voiceDecay: number[];
  voiceBlur: number[];
  voiceGrainOct: number[];
  voiceSpray: number[];
  voiceDensity: number[];
  voiceGrainSize: number[];
  voicePan: number[];
  voiceGain: number[];
  voicePosLFORate: number[];
  voicePosLFODepth: number[];
  voicePanLFORate: number[];
  voiceStereoSpread: number[];
  voiceReverseLFORate: number[];
  voiceWriteFollow: number[];
  voiceRecordLFORate: number[];
  voicePositionSpray: number[];
  voiceTimingSpray: number[];
  voiceLookback: number[];
  voiceWriteGuard: number[];
  voicePitchMode: GranularPitchMode[];
  voicePitchSpread: number[];
  voicePitchJitter: number[];
  voicePitchQuantize: number[];
  voiceReverseChance: number[];
  voiceBloom: number[];
  voiceGlide: number[];
  voiceCloudStyle: GranularCloudStyle[];
  voiceAnchorPattern: GranularAnchorPattern[];
  voiceLoopCrossfade: number[];
  tempoGated: boolean[];
};

type GranularWorkletHarmonyParams = {
  scaleIntervals: number[];
  chordPitches: number[];
  chordBias: number;
};

type GranularWorkletLegacyParams = {
  legacyJitter: number;
  legacyProbability: number;
  legacyPitchMode: 'random' | 'harmonic';
  legacyPitchSpread: number;
  legacyMaxGrains: number;
  legacyFeedback: number;
};

type GranularWorkletUpdate = {
  global: GranularWorkletGlobalParams;
  space: GranularWorkletSpaceParams;
  voices: GranularWorkletVoiceParams;
  harmony: GranularWorkletHarmonyParams;
  legacy: GranularWorkletLegacyParams;
};

// Maps pad-preset param keys (pad1 naming) → pad2 state keys for morph override
const PAD1_TO_PAD2_ENGINE: Record<string, string> = {
  padOscAWave: 'pad2OscAWave', padOscAOctave: 'pad2OscAOctave', padOscADetune: 'pad2OscADetune', padOscALevel: 'pad2OscALevel',
  padOscBWave: 'pad2OscBWave', padOscBOctave: 'pad2OscBOctave', padOscBDetune: 'pad2OscBDetune', padOscBLevel: 'pad2OscBLevel',
  padSubEnabled: 'pad2SubEnabled', padSubOctave: 'pad2SubOctave', padSubWave: 'pad2SubWave', padSubLevel: 'pad2SubLevel',
  padNoiseType: 'pad2NoiseType', padNoiseLevel: 'pad2NoiseLevel',
  hardness: 'pad2Hardness', warmth: 'pad2Warmth', presence: 'pad2Presence',
  filterType: 'pad2FilterType', filterCutoffMin: 'pad2FilterCutoffMin', filterCutoffMax: 'pad2FilterCutoffMax',
  filterResonance: 'pad2FilterResonance', filterQ: 'pad2FilterQ', filterSlope: 'pad2FilterSlope', filterKeyTracking: 'pad2FilterKeyTracking',
  padFilterBEnabled: 'pad2FilterBEnabled', padFilterBType: 'pad2FilterBType', padFilterBCutoff: 'pad2FilterBCutoff',
  padFilterBResonance: 'pad2FilterBResonance', padFilterBQ: 'pad2FilterBQ', padFilterRouting: 'pad2FilterRouting',
  synthAttack: 'pad2Attack', synthDecay: 'pad2Decay', synthSustain: 'pad2Sustain', synthHold: 'pad2Hold', synthRelease: 'pad2Release',
  padLfo1Rate: 'pad2Lfo1Rate', padLfo1Depth: 'pad2Lfo1Depth', padLfo1Wave: 'pad2Lfo1Wave', padLfo1Dest: 'pad2Lfo1Dest',
  padLfo2Rate: 'pad2Lfo2Rate', padLfo2Depth: 'pad2Lfo2Depth', padLfo2Wave: 'pad2Lfo2Wave', padLfo2Dest: 'pad2Lfo2Dest',
  padModEnvEnabled: 'pad2ModEnvEnabled', padModEnvAttack: 'pad2ModEnvAttack', padModEnvDecay: 'pad2ModEnvDecay',
  padModEnvSustain: 'pad2ModEnvSustain', padModEnvRelease: 'pad2ModEnvRelease',
  padModEnvDepth: 'pad2ModEnvDepth', padModEnvDest: 'pad2ModEnvDest',
};

const PAD1_MORPH_HOLD_KEYS = new Set<string>(PAD_PRESET_PARAM_KEYS);
const PAD2_MORPH_HOLD_KEYS = new Set<string>(Object.values(PAD1_TO_PAD2_ENGINE));
const DRUM_AUTO_MORPH_VOICES: DrumVoiceType[] = ['sub', 'kick', 'click', 'beepHi', 'beepLo', 'noise', 'membrane'];

function clampUnitInterval(value: number | undefined): number {
  const safeValue = Number.isFinite(value) ? (value as number) : 0;
  if (safeValue <= 0) return 0;
  if (safeValue >= 1) return 1;
  return safeValue;
}

function normalizeEvolveWriteOffset(value: unknown, fallback: number | 'auto'): number | 'auto' {
  if (value === 'auto') return 'auto';
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  return fallback;
}

function mergeEvolveMethods<T extends string>(current: Record<T, boolean>, incoming: unknown): Record<T, boolean> {
  const methods: Record<string, boolean> = { ...current };
  if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
    for (const [key, value] of Object.entries(incoming)) {
      methods[key] = value === true;
    }
  }
  return methods as Record<T, boolean>;
}

function mergeEvolveEnabledSubLanes(incoming: unknown, current: string[] | undefined): string[] | undefined {
  if (Array.isArray(incoming)) return incoming.filter((lane): lane is string => typeof lane === 'string');
  return current ? [...current] : undefined;
}
const PAD1_TRIGGER_HOLD_KEYS = new Set<string>([
  ...PAD1_MORPH_HOLD_KEYS,
  'padMorph',
  'synthLevel',
  'synthOctave',
  'pad1ReverbSend',
  'pad1DelayASend',
  'pad1DelayBSend',
  'granularPad1Send',
]);
const PAD2_TRIGGER_HOLD_KEYS = new Set<string>([
  ...PAD2_MORPH_HOLD_KEYS,
  'pad2Morph',
  'pad2Level',
  'pad2Octave',
  'pad2ReverbSend',
  'pad2DelayASend',
  'pad2DelayBSend',
  'granularPad2Send',
]);
const PIANO_TRIGGER_HOLD_KEYS = new Set<string>([
  'pianoLevel',
  'pianoAttack',
  'pianoDecay',
  'pianoSustain',
  'pianoHold',
  'pianoRelease',
  'pianoReverbSend',
  'pianoDelayASend',
  'pianoDelayBSend',
  'granularPianoSend',
]);

// Worklet URLs from public folder - these are plain JS files that work in production
// Use absolute URLs for Safari compatibility
const getWorkletUrl = (filename: string): string => {
  const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
  return `${base}/worklets/${filename}`;
};

const resolvePublicSampleUrl = (relativePath: string): string => {
  const root = new URL(import.meta.env.BASE_URL, window.location.origin);
  const encodedPath = relativePath.split('/').map((part) => encodeURIComponent(part)).join('/');
  return new URL(`samples/${encodedPath}`, root).toString();
};
// Reverb uses WASM path — kessho_reverb.wasm loaded at init
const reverbWasmWorkletUrl = getWorkletUrl('reverb-wasm.worklet.js');
const reverbPreconditionerWorkletUrl = getWorkletUrl('reverb-preconditioner.worklet.js');
// Waves sample uses the shared Earth filter path — no separate waves synth worklet
// Granular FX uses WASM-only path
const granularFxWasmWorkletUrl = getWorkletUrl('granular-fx-wasm.worklet.js');
const soundscapesWorkletUrl = getWorkletUrl('soundscapes-wasm.worklet.js');
const spectralFreezeWorkletUrl = getWorkletUrl('spectral-freeze-wasm.worklet.js');
const padSynthWasmWorkletUrl = getWorkletUrl('pad-synth-wasm.worklet.js');
const leadFmWasmWorkletUrl = getWorkletUrl('lead-fm-wasm.worklet.js');
const drumSynthWasmWorkletUrl = getWorkletUrl('drum-synth-wasm.worklet.js');
const dynamicsDriftWorkletUrl = getWorkletUrl('dynamics-drift.worklet.js');
const dynamicsDriftWasmUrl = getWorkletUrl('kessho_dynamics_drift.wasm');
const GRANULAR_WORKLET_DISPATCH_INTERVAL_MS = 16;
const RUNTIME_RANDOM_WALK_INTERVAL_MS = 100;
const RANDOM_WALK_MAX_CATCHUP_STEPS = 600;
const MAIN_THREAD_MODULATION_MAX_DELTA_MS = RUNTIME_RANDOM_WALK_INTERVAL_MS * RANDOM_WALK_MAX_CATCHUP_STEPS;
const FOREGROUND_PARAM_RESYNC_WINDOW_MS = 1200;
const FOREGROUND_PARAM_RESYNC_SMOOTH_TIME = 0.35;
const PIANO_SAMPLE_CACHE_LIMIT_PER_VARIANT = 24;

const FX_OWNERSHIP_WINDOW_MS = 140;
const FX_OWNERSHIP_STEAL_MARGIN = 0.05;
const FX_OWNERSHIP_STEAL_RATIO = 1.15;
const FX_OWNERSHIP_RECENT_ONSET_RATIO = 0.65;

const REVERB_OWNERSHIP_KEYS = new Set<string>([
  'reverbLevel',
  'reverbDecay',
  'reverbSize',
  'reverbDiffusion',
  'reverbModulation',
  'predelay',
  'damping',
  'width',
  'reverbShimmer',
  'reverbShimmerPitch',
  'reverbSlowModRate',
  'reverbSlowModDepth',
  'reverbReverse',
  'reverbReverseLength',
  'reverbChorusRate',
  'reverbChorusDepth',
  'reverbDampLow',
  'reverbDampHigh',
  'reverbCrossoverFreq',
  'reverbInputTone',
  'reverbShimmerFeedback',
  'reverbBloom',
  'reverbWarp',
  'reverbCrossFeed',
  'reverbEarlyReflections',
  'reverbAirAbsorption',
  'reverbTransientSmooth',
  'reverbErLpFreq',
  'reverbPreCompThreshold',
  'reverbPreCompKnee',
  'reverbPreCompRatio',
  'reverbPreCompAttackMs',
  'reverbPreCompReleaseMs',
  'reverbPreCompMakeup',
]);

const GRANULAR_OWNERSHIP_PREFIX_EXCLUSIONS = [
  'granularPad',
  'granularLead',
  'granularDrum',
  'granularWaves',
  'granularWater',
  'granularInsects',
  'granularDelay',
] as const;

// Voice structure for poly synth
interface Voice {
  osc1: OscillatorNode;       // OscA
  osc2: OscillatorNode;       // OscA detuned
  osc3: OscillatorNode;       // OscB
  osc4: OscillatorNode;       // Sub (or OscB detuned when sub disabled)
  osc1Gain: GainNode;
  osc2Gain: GainNode;
  osc3Gain: GainNode;
  osc4Gain: GainNode;
  noise?: AudioBufferSourceNode;
  noiseGain: GainNode;
  filter: BiquadFilterNode;
  filterB: BiquadFilterNode;         // Second filter in series
  warmthFilter: BiquadFilterNode;    // Low shelf for warmth
  presenceFilter: BiquadFilterNode;  // Peaking EQ for presence
  gain: GainNode;
  saturation: WaveShaperNode;
  envelope: GainNode;
  mixerGain: GainNode;              // Per-voice level control (pad 1 vs pad 2)
  modEnvGain: GainNode;              // Mod envelope gain for amplitude/filter/pitch modulation
  active: boolean;
  targetFreq: number;
}

export interface EngineState {
  isRunning: boolean;
  harmonyState: HarmonyState | null;
  currentSeed: number;
  currentBucket: string;
  currentFilterFreq: number;
  currentLfoValue: number;     // -1 to +1 (after depth scaling)
  currentLfo2Value: number;    // LFO 2 value for UI
  cofCurrentStep: number;
  fxOwners: FxOwnershipDebugState;
  transportDebug: TransportDebugSnapshot | null;
}

import type { DrumEuclidEvolveConfig } from '../../drumSynth';
import { defaultEvolveConfig as defaultDrumEuclidEvolveConfig } from '../../drumSynth';

/** Shared clock-division-to-seconds helper (used by synth + granular schedulers). */
function clockDivToSeconds(clockDiv: ClockDivision, beatDuration: number): number {
  return sequencerClockDivisionToSeconds(clockDiv, beatDuration);
}

function getSharedSequencerBpm(state?: Partial<SliderState> | null): number {
  return getEffectiveSequencerBpm(state ?? {});
}

function alignSequencerTime(now: number, stepDuration: number): number {
  if (!Number.isFinite(stepDuration) || stepDuration <= 0) return now;
  return Math.ceil(now / stepDuration) * stepDuration;
}

type MasterSaturationCurveMode = SliderState['dynamicsSaturationMode'] | 'linear';

function makeMasterSaturationCurve(mode: MasterSaturationCurveMode, samples = 8192): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT));
  const half = (samples - 1) / 2;
  for (let i = 0; i < samples; i++) {
    const x = (i - half) / half;
    switch (mode) {
      case 'linear':
        curve[i] = x;
        break;
      case 'tape':
        curve[i] = Math.tanh(x * 1.5) * 0.9 + x * 0.1;
        break;
      case 'tube':
        curve[i] = x / (1 + Math.abs(x));
        break;
      case 'diode':
        curve[i] = x >= 0 ? Math.tanh(x * 1.35) : -Math.tanh(-x * 0.82);
        break;
      case 'fold':
        curve[i] = Math.tanh(x) * 0.72 + Math.sin(x * Math.PI * 0.82) * 0.22;
        break;
      case 'clean':
      default:
        curve[i] = Math.tanh(x * 1.05);
        break;
    }
  }
  return curve;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private outputGain: GainNode | null = null;
  private satPreGain: GainNode | null = null;
  private satWaveshaper: WaveShaperNode | null = null;
  private satPostTone: BiquadFilterNode | null = null;
  private satPostGain: GainNode | null = null;
  private lastMasterSatMode: MasterSaturationCurveMode | null = null;
  private driftInputGain: GainNode | null = null;
  private driftProcessorNode: AudioWorkletNode | GainNode | null = null;
  private driftProcessorNodeMode: 'gain' | 'worklet' | null = null;
  private driftOutputGain: GainNode | null = null;
  private dynamicsDriftWorkletLoaded = false;
  private dynamicsDriftWorkletLoadPromise: Promise<void> | null = null;
  private dynamicsDriftWorkletLoadContext: AudioContext | null = null;
  private dynamicsDriftWorkletContext: AudioContext | null = null;
  private wasmDynamicsDriftBinary: ArrayBuffer | null = null;
  private dynamicsRoutingKey: string | null = null;
  private endCompInputGain: GainNode | null = null;
  private endCompDryGain: GainNode | null = null;
  private endCompCompressor: DynamicsCompressorNode | null = null;
  private endCompMakeupGain: GainNode | null = null;
  private endCompWetGain: GainNode | null = null;
  private endCompOutputGain: GainNode | null = null;
  private sidechainTargets: Partial<Record<SidechainTargetKey, SidechainTargetNode>> = {};
  private dynamicsAnalysers: Partial<Record<DynamicsAnalyserKey, AnalyserNode>> = {};
  private dynamicsWorkletTelemetry: DynamicsWorkletVisualTelemetry | null = null;
  private sidechainVisualEvents: DynamicsSidechainVisualEvent[] = [];
  private sidechainVisualEventId = 1;
  private mediaStreamDest: MediaStreamAudioDestinationNode | null = null;
  private voices: Voice[] = [];
  private reverbNode: AudioWorkletNode | null = null;
  private reverbOutputGain: GainNode | null = null;
  private reverbPreCompressor: DynamicsCompressorNode | null = null;
  private reverbPreMakeupGain: GainNode | null = null;
  private reverbPreConditionerNode: AudioWorkletNode | null = null;
  private reverbPreConditionerLoaded = false;

  // Spectral Freeze (STFT WASM)
  private spectralFreezeNode: AudioWorkletNode | null = null;
  private wasmSpectralFreezeBinary: ArrayBuffer | null = null;
  private reverbInputBus: GainNode | null = null;   // bus between all sources and reverb (gain always 1)
  private reverbDirectSend: GainNode | null = null;  // crossfade-controlled direct path to reverb (pre-mode only)

  private synthBus: GainNode | null = null;
  private dryBus: GainNode | null = null;
  private pad1ReverbSend: GainNode | null = null;
  private pad2ReverbSend: GainNode | null = null;
  private synthDirect: GainNode | null = null;
  private diffuseInputBus: GainNode | null = null;
  private diffuseHighpass: BiquadFilterNode | null = null;
  private diffuseLowpass: BiquadFilterNode | null = null;
  private diffuseSpreadBus: GainNode | null = null;
  private diffuseOutputGain: GainNode | null = null;
  private diffuseReverbSend: GainNode | null = null;
  private pad1SpatialChain: VoiceSpatialChain | null = null;
  private pad2SpatialChain: VoiceSpatialChain | null = null;
  private sharedDelayA: SharedDelayBusA | null = null;
  private sharedDelayB: SharedDelayBusB | null = null;
  private sharedDelayGranularLinksWired = false;

  // Lead synth (4op FM)
  private leadGain: GainNode | null = null;
  private leadDry: GainNode | null = null;
  private leadFilter: BiquadFilterNode | null = null;
  private lead1ReverbSend: GainNode | null = null;
  private lead2ReverbSend: GainNode | null = null;
  private pad1DelayASend: GainNode | null = null;
  private pad1DelayBSend: GainNode | null = null;
  private pad2DelayASend: GainNode | null = null;
  private pad2DelayBSend: GainNode | null = null;
  private lead1DelayASend: GainNode | null = null;
  private lead1DelayBSend: GainNode | null = null;
  private lead2DelayASend: GainNode | null = null;
  private lead2DelayBSend: GainNode | null = null;
  private pianoDelayASend: GainNode | null = null;
  private pianoDelayBSend: GainNode | null = null;
  private leadMelodyTimer: number | null = null;  // Random lead mode (phrase-based)
  private leadNoteTimeouts: number[] = [];  // Track scheduled random note timeouts
  private synthEuclidCurrentStep: Quad<number> = [0, 0, 0, 0];  // Step position per lane
  private onSynthStepPositionChange: ((steps: number[], hitCounts: number[]) => void) | null = null;
  private synthEuclidHitCounts: Quad<number> = [0, 0, 0, 0];  // Hit counts per lane
  private synthEuclidVisualStep: Quad<number> = [0, 0, 0, 0];
  private synthEuclidVisualHitCounts: Quad<number> = [0, 0, 0, 0];
  private synthEuclidVisualTimers = new Set<number>();

  // Continuous lead Euclidean scheduler (look-ahead, like drum sequencer)
  private synthEuclidScheduleTimer: number | null = null;
  private synthEuclidNextStepTime: Quad<number> = [0, 0, 0, 0]; // AudioContext time per lane
  private synthEuclidStepIndex: Quad<number> = [0, 0, 0, 0]; // Current step index per lane
  private synthEuclidClockDivs: Quad<ClockDivision> = ['1/8', '1/16', '1/8T', '1/4']; // Per-lane clock division
  private synthEuclidSwings: Quad<number> = [0, 0, 0, 0]; // Per-lane swing amount (0-1)
  private synthEuclidStarting = false;
  private pendingDrumPresetHomeCapture = false;

  // Synth evolve state
  private synthEvolveConfigs: Quad<SynthEvolveConfig> = [
    defaultSynthEvolveConfig(), defaultSynthEvolveConfig(),
    defaultSynthEvolveConfig(), defaultSynthEvolveConfig(),
  ];
  private synthEvolveStates: Quad<SynthEvolveState> = [
    defaultSynthEvolveState(), defaultSynthEvolveState(),
    defaultSynthEvolveState(), defaultSynthEvolveState(),
  ];
  private synthEuclidTotalStepCounts: Quad<number> = [0, 0, 0, 0];
  private onSynthEvolveTrigger: ((laneIndex: number) => void) | null = null;
  private onSynthEvolveOverridesChanged: ((laneIndex: number, overrides: SynthEvolveOverridesPayload) => void) | null = null;
  /** Per-lane pitch settings for MIDI↔offset conversion at evolve boundary */
  private synthPitchSettings: Quad<{ mode: PitchMode; root: number; scale: ScaleName }> = [
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'semitones', root: 60, scale: 'Major' },
  ];
  /** Per-lane pitch binding/indexing mode for the synth sequencer. */
  private synthPitchBindingModes: Quad<PitchBindingMode> = ['polyrhythmic', 'polyrhythmic', 'polyrhythmic', 'polyrhythmic'];
  /** Per-lane noteRange overrides from evolve (null = use sliderState) */
  private synthNoteRangeOverrides: Quad<{ min: number; max: number } | null> = [null, null, null, null];
  /** Callback fired when evolve mutates noteRange bounds → UI updates sliders */
  private onSynthNoteRangeEvolved: ((laneIndex: number, noteMin: number, noteMax: number) => void) | null = null;
  /** Per-lane sub-lane enabled state (from UI). Keys are sub-lane names (e.g. 'expression', 'ratchet'). */
  private synthSubLaneEnabled: Quad<Record<string, boolean>> = [{}, {}, {}, {}];

  // Lead 4op FM preset slots
  private lead1PresetA: Lead4opFMPreset = DEFAULT_SOFT_RHODES;
  private lead1PresetB: Lead4opFMPreset = DEFAULT_GAMELAN;
  private lead2PresetC: Lead4opFMPreset = DEFAULT_SOFT_RHODES;
  private lead2PresetD: Lead4opFMPreset = DEFAULT_GAMELAN;
  private lead1PresetAId = 'soft_rhodes';
  private lead1PresetBId = 'gamelan';
  private lead2PresetCId = 'soft_rhodes';
  private lead2PresetDId = 'gamelan';
  private leadPresetPendingIds: Partial<Record<'A' | 'B' | 'C' | 'D', string>> = {};

  // Ikeda-style drum synth
  private drumSynth: DrumSynth | null = null;
  private drumDelayASend: GainNode | null = null;
  private drumDelayBSend: GainNode | null = null;

  // Reverb (WASM)
  private wasmReverbBinary: ArrayBuffer | null = null;

  // Pad Synth (WASM — replaces Web Audio oscillator voices)
  private wasmPadBinary: ArrayBuffer | null = null;
  private padWasmNode: AudioWorkletNode | null = null;
  private padWasmReady = false;
  private padWasmModuleContext: AudioContext | null = null;
  private padWasmInitPromise: Promise<void> | null = null;
  private padWasmUnavailableWarned = false;

  // Lead FM Synth (WASM — replaces per-note playLead4opFMNote)
  private wasmLeadFmBinary: ArrayBuffer | null = null;
  private leadFmWasmNode: AudioWorkletNode | null = null;
  private leadFmWasmReady = false;
  private leadFmWasmInitPromise: Promise<void> | null = null;
  private leadFmWasmModuleContext: AudioContext | null = null;

  // Drum Synth (WASM — replaces per-trigger Web Audio nodes)
  private wasmDrumBinary: ArrayBuffer | null = null;
  private drumWasmNode: AudioWorkletNode | null = null;
  private drumWasmReady = false;

  // Granular FX (unified granular engine — WASM only)
  private wasmGranularBinary: ArrayBuffer | null = null;
  private granularFxModuleContext: AudioContext | null = null;
  private granularFxNode: AudioWorkletNode | null = null;
  private granularFxInputGain: GainNode | null = null;
  private granularFxReverbSend: GainNode | null = null;
  private granularFxReverbLPF: BiquadFilterNode | null = null;
  private granularFxReverbCompressor: DynamicsCompressorNode | null = null;
  private granularFxOutputLPF: BiquadFilterNode | null = null;
  private granularFxDirect: GainNode | null = null;
  private granularDelayASend: GainNode | null = null;
  private granularPad1Send: GainNode | null = null;     // pad 1 bus → granular
  private granularPad2Send: GainNode | null = null;     // pad 2 bus → granular
  private granularLead1Send: GainNode | null = null;    // lead 1 bus → granular
  private granularLead2Send: GainNode | null = null;    // lead 2 bus → granular
  private granularPianoSend: GainNode | null = null;    // piano bus → granular
  private granularDrumSend: GainNode | null = null;     // drum bus → granular
  private granularWavesSend: GainNode | null = null;    // waves → granular
  // Note: granularWaterSend and granularInsectsSend are declared in the Earth section above
  private pad1Bus: GainNode | null = null;            // sum of pad 1 voices (post-fader)
  private pad2Bus: GainNode | null = null;            // sum of pad 2 voices (post-fader)
  private pad1PreFaderBus: GainNode | null = null;    // sum of pad 1 voices (pre-fader, for granular)
  private pad2PreFaderBus: GainNode | null = null;    // sum of pad 2 voices (pre-fader, for granular)
  private lead1Bus: GainNode | null = null;           // lead 1 output pre-mix
  private lead2Bus: GainNode | null = null;           // lead 2 output pre-mix
  private pianoBus: GainNode | null = null;           // piano output pre-fx
  private lead1LevelGain: GainNode | null = null;     // lead 1 dry-path level (FX sends remain independent)
  private lead2LevelGain: GainNode | null = null;     // lead 2 dry-path level (FX sends remain independent)
  private pianoLevelGain: GainNode | null = null;     // piano dry-path level (FX sends remain independent)
  private leadVoiceLevel: GainNode | null = null;     // final dry-path trim stage for lead output
  private leadWasmLevelGain: GainNode | null = null;  // WASM lead dry-path level (FX sends remain independent)
  private leadWasmLead2LevelGain: GainNode | null = null;  // WASM lead 2 dry-path level
  private pianoReverbSend: GainNode | null = null;
  private lead1SpatialChain: VoiceSpatialChain | null = null;
  private lead2SpatialChain: VoiceSpatialChain | null = null;
  private lead1PostLpfTrackingFreq = 261.6255653005986;
  private lead2PostLpfTrackingFreq = 261.6255653005986;
  private pianoSpatialChain: VoiceSpatialChain | null = null;
  private readonly pianoBuffers: { regular: Map<number, AudioBuffer>; short: Map<number, AudioBuffer> } = {
    regular: new Map(),
    short: new Map(),
  };
  private readonly pianoBufferPromises: { regular: Map<number, Promise<AudioBuffer | null>>; short: Map<number, Promise<AudioBuffer | null>> } = {
    regular: new Map(),
    short: new Map(),
  };
  private readonly pianoBufferLastUsed: { regular: Map<number, number>; short: Map<number, number> } = {
    regular: new Map(),
    short: new Map(),
  };
  private pianoPriorityWarmupPromise: Promise<void> | null = null;
  private pianoPriorityWarmupGeneration = 0;
  private pianoBufferUseSequence = 0;
  private readonly activePianoVoices = new Set<ActivePianoVoice>();
  private lastPad2VoiceAssign = 0;                    // track for re-routing
  private granularWriteHeadPosition = 0;     // 0-1 for UI
  private granularVoicePositions = [0, 0, 0, 0]; // 0-1 per voice for UI
  private granularActiveGrainCount = 0;
  private granularBufferWaveform: Float32Array | null = null;  // downsampled buffer peaks for viz
  private granularVisualEvents: CoreProductGranularVisualEvent[] = [];
  private granularUiActive = false;
  private lastGranularUiActiveSent: boolean | null = null;
  private pendingGranularWorkletUpdate: GranularWorkletUpdate | null = null;
  private granularWorkletDispatchTimer: number | null = null;
  private lastGranularWorkletDispatchMs = 0;
  private lastGranularRandomSeedMaterial = '';
  private lastGranularRandomSequencePreview: number[] = [];
  private foregroundParamResyncUntilMs = 0;

  // Granular multi-tap delay (Microcosm-style)
  private granularDelayInputNode: GainNode | null = null;
  private granularDelayTapNodes: DelayNode[] = [];
  private granularDelayTapGains: GainNode[] = [];
  private granularDelayTapPanners: StereoPannerNode[] = [];
  private granularDelayOutputGain: GainNode | null = null;
  private granularDelayDirectGain: GainNode | null = null;
  private granularDelayReverbSendGain: GainNode | null = null;
  private granularDelayFeedbackGain: GainNode | null = null;
  private granularDelayToneFilter: BiquadFilterNode | null = null;
  private granularDelaySendGain: GainNode | null = null;
  private granularDelayVibratoOscs: OscillatorNode[] = [];
  private granularDelayVibratoDepths: GainNode[] = [];
  private sharedGranularDelayBSend: GainNode | null = null;

  private granularTempoSyncTimer: number | null = null;
  private granularTempoSyncNextStepTime: Quad<number> = [0, 0, 0, 0];

  // Waves sample path
  private oceanFilter: BiquadFilterNode | null = null;  // Shared waves filter
  private oceanGateGain: GainNode | null = null;        // Waves on/off fade gate before dry/wet splits
  private oceanLevelGain: GainNode | null = null;       // Waves dry level → earthBus
  private oceanSourceBus: GainNode | null = null;       // Mono slice bus before filter
  private oceanPreFaderBus: GainNode | null = null;     // Stereo widened bus after filter
  private readonly oceanFadeState = createEarthFadeState();

  // Earth texture players (mono snippets widened to stereo)
  private oceanTexturePlayer: EarthTexturePlayer | null = null;
  private natureBus: GainNode | null = null;            // Shared dry bus for birds + birds2 + frogs
  private natureLevelGain: GainNode | null = null;      // Nature dry master → earthBus
  private natureReverbSendTap: GainNode | null = null;
  private natureDelayASendTap: GainNode | null = null;
  private natureDelayBSendTap: GainNode | null = null;
  private natureGranularSendTap: GainNode | null = null;
  private birdsTexture: EarthTextureRuntime | null = null;
  private birds2Texture: EarthTextureRuntime | null = null;
  private frogsTexture: EarthTextureRuntime | null = null;

  // Soundscapes WASM worklet (water + insects + fire engines)
  private soundscapesNode: AudioWorkletNode | null = null;
  private waterGateGain: GainNode | null = null;        // Water on/off fade gate before dry/wet splits
  private waterPreFaderBus: GainNode | null = null;     // Pre-fader bus for reverb/granular taps
  private waterLevelGain: GainNode | null = null;       // Water dry level → earthBus
  private waterReverbSend: GainNode | null = null;
  private waterDelayASend: GainNode | null = null;
  private waterDelayBSend: GainNode | null = null;
  private oceanReverbSendNode: GainNode | null = null;    // Waves reverb send (post-filter)
  private oceanDelayASend: GainNode | null = null;
  private oceanDelayBSend: GainNode | null = null;
  private insectsReverbSendNode: GainNode | null = null;  // Insects reverb send
  private insectsPreFaderBus: GainNode | null = null;     // Pre-fader bus for reverb/granular taps
  private insectsLevelGain: GainNode | null = null;       // Insects dry mix → earthBus (per-layer fades happen in the worklet)
  private insectsDelayASend: GainNode | null = null;
  private insectsDelayBSend: GainNode | null = null;
  private granularWaterSend: GainNode | null = null;      // Water → granular
  private granularInsectsSend: GainNode | null = null;    // Insects → granular

  // Earth master bus (waves + water + insects → earthBus → earthLevelGain → masterGain)
  private earthBus: GainNode | null = null;
  private earthLevelGain: GainNode | null = null;
  private wasmSoundscapesBinary: ArrayBuffer | null = null;
  private soundscapesWasmReady = false;
  private _scWaterStarted = false;
  private _scInsects1Started = false;
  private _scInsects2Started = false;
  private _scInsects1Engine = -1;
  private _scInsects2Engine = -1;
  private _scWaterPreset = -1;
  private readonly waterFadeState = createEarthFadeState();
  private readonly insects1FadeState = createEarthFadeState();
  private readonly insects2FadeState = createEarthFadeState();

  private harmonyState: HarmonyState | null = null;
  private cofConfig: CircleOfFifthsConfig = {
    enabled: false,
    driftRate: 2,
    direction: 'cw',
    range: 3,
    currentStep: 0,
    phraseCounter: 0,
  };
  private phraseTimer: number | null = null;
  private nextHarmonyEventWallSec: number | null = null;
  private chordSubTickCount = 0;    // Sub-phrase tick counter for multi-chord phrases
  private effectiveRoot = 4;  // Current root note including CoF drift
  private transportAnchors: TransportAnchors | null = null;
  private prevSynthEuclidLaneEnabled: Quad<boolean> = [false, false, false, false];
  private synthResumeRuntime = createSequencerResumeRuntimeState(4);

  // Reverb harmony coupling — transient modulation amounts
  private reverbWashBoost = 0;       // 0..1 decays after chord change
  private reverbBloomBoost = 0;      // 0..1 decays on resolution
  private prevReverbTension = 0;     // track tension for bloom trigger
  private currentSeed = 0;
  private currentBucket = '';
  private sliderState: SliderState | null = null;
  private sourceSliderState: SliderState | null = null;
  private _sliderStateJsonCache = '';
  private _sliderStateJsonDirty = true;
  private lastHardness = -1;  // Track to avoid unnecessary saturation curve updates
  private _lastPadEnabled: boolean | undefined = undefined;  // Track effective pad activity transitions
  private voiceReleaseTimers = new Set<number>();  // Track triggerSynthVoice release timeouts
  private ratchetTimers = new Set<number>();  // Track ratchet retrigger timeouts
  private padChordTriggerTimers = new Set<number>();  // Track delayed chord note-ons from waveSpread
  private softStopCleanupTimers = new Set<number>();
  private synthVoiceNoteGen: Hex<number> = [0, 0, 0, 0, 0, 0];  // Per-voice WASM noteOff generation counter
  private synthVoiceNoteOffTimers: Hex<number | null> = [null, null, null, null, null, null];
  private manualPadRouteRestoreTimers: Hex<number | null> = [null, null, null, null, null, null];
  private manualPadVoiceCursor: { pad1: number; pad2: number } = { pad1: 0, pad2: 0 };

  // Temp drum synth management: debounce rapid previews and track cleanup timers
  private tempDrumSynthTimer: number | null = null;
  private synthPerfTimer: ReturnType<typeof setInterval> | null = null;
  private tempDrumSynth: DrumSynth | null = null;
  private tempDrumGain: GainNode | null = null;
  private tempDrumReverb: GainNode | null = null;
  private rng: (() => number) | null = null;
  private isRunning = false;
  private isStarting = false; // true while start() is loading worklets — prevents updateParams teardown
  private graphBootstrapped = false;
  private bootCapabilities: BootCapabilities = {
    reverb: false,
    spectralFreeze: false,
    soundscapes: false,
    granular: false,
  };
  private forceHardGraphTeardown = false;
  private graphRebuildPromise: Promise<void> | null = null;
  private _applyParamsDirty = false;  // Dirty flag for RAF-batched applyParams
  private _applyParamsRaf: number | null = null;  // RAF handle for batched applyParams
  private _stateChangeNotifyRaf: number | null = null;
  private seedLocked = false; // When true, don't recompute seed on param changes (for morphing)
  private isMobile = false; // Detected in createAudioGraph, used for CPU-saving defaults

  // Dirty-gate caches: skip worklet postMessage when params unchanged
  private _prevReverbParams: Record<string, unknown> | null = null;
  private _prevSfFreeze = false;
  private _prevSfSlushy = false;
  private _prevSfSpeed = 0.3;
  private _prevSfMix = 1.0;
  private _prevSfDecay = 0;
  private _prevSfPhaseJitter = 0;
  private _sfParamsInitialized = false;
  private _messageSignatures = new Map<string, unknown>();

  private currentFilterFreq = 1000;  // Current filter frequency for UI display
  private currentLfoValue = 0;       // Current LFO 1 output (-1..+1 after depth) for UI
  private currentLfo2Value = 0;      // Current LFO 2 output (-1..+1 after depth) for UI
  private currentPad1FilterFreq = 1000;
  private currentPad2FilterFreq = 1000;
  private currentPad1LfoValue = 0;
  private currentPad2LfoValue = 0;

  private onStateChange: ((state: EngineState) => void) | null = null;
  private onLeadExpressionTrigger: ((expression: { vibratoDepth: number; vibratoRate: number; glide: number }) => void) | null = null;
  private onLeadMorphTrigger: ((morph: { lead1: number; lead2: number }) => void) | null = null;
  private onLeadDelayTrigger: ((delay: { time: number; feedback: number; mix: number }) => void) | null = null;
  private onDrumTrigger: ((voice: DrumVoiceType, velocity: number) => void) | null = null;
  private onDrumMorphTrigger: ((voice: DrumVoiceType, morphPosition: number) => void) | null = null;
  private onDrumParamSHTrigger: ((voice: DrumVoiceType, key: string, position: number) => void) | null = null;
  private onPadMorphTrigger: ((morphPosition: number) => void) | null = null;
  private onPad2MorphTrigger: ((morphPosition: number) => void) | null = null;
  private onLeadDistanceTrigger: ((distance: { lead1: number; lead2: number }) => void) | null = null;
  private onPianoDistanceTrigger: ((distance: number) => void) | null = null;
  private onPadDistanceTrigger: ((distance: number) => void) | null = null;
  private onPad2DistanceTrigger: ((distance: number) => void) | null = null;
  private onJourneyMorphClockFrame: ((now: number) => void) | null = null;
  private onDrumEuclidEvolveTrigger: ((laneIndex: number) => void) | null = null;
  private onDrumStepPositionChange: ((steps: number[], hitCounts: number[]) => void) | null = null;
  private journeyMorphClockRaf: number | null = null;
  private journeyMorphClockTimeout: number | null = null;
  private journeyMorphClockActive = false;
  private leadMorphTimer: number | null = null;
  private autoMorphTimer: number | null = null;
  private runtimeRandomWalkTimer: number | null = null;
  private runtimeRandomWalkLastUpdateMs = 0;
  private runtimeWalkRanges: Partial<Record<string, RuntimeWalkRange>> = {};
  private runtimeWalkStates = new Map<string, RuntimeWalkState>();
  private runtimeWalkPositions: Record<string, number> = {};
  private drumAutoMorphManager = new DrumMorphManager();
  private drumAutoMorphValues: Record<DrumVoiceType, number> = {
    sub: 0,
    kick: 0,
    click: 0,
    beepHi: 0,
    beepLo: 0,
    noise: 0,
    membrane: 0,
  };
  private padAutoMorphStates: {
    pad1: { phase: number; direction: 1 | -1 };
    pad2: { phase: number; direction: 1 | -1 };
  } = {
    pad1: { phase: 0, direction: 1 },
    pad2: { phase: 0, direction: 1 },
  };

  // CPU performance monitoring (per-worklet % reported ~1Hz)
  private perfMonitorEnabled = false;
  private perfData: Record<string, PerfMetrics> = {};
  private onPerfUpdate: ((data: Record<string, PerfMetrics>) => void) | null = null;
  private onRuntimeWalkPositionsChange: ((positions: Record<string, number>) => void) | null = null;
  // Lead morph random walk state (per-lead, momentum-based)
  private leadMorphWalkStates: {
    lead1: { position: number; velocity: number; initialized: boolean };
    lead2: { position: number; velocity: number; initialized: boolean };
  } = {
    lead1: { position: 0.5, velocity: 0, initialized: false },
    lead2: { position: 0.5, velocity: 0, initialized: false },
  };

  // Pending morph ranges to apply when drumSynth is created
  private pendingMorphRanges: Record<DrumVoiceType, { min: number; max: number } | null> = {
    sub: null, kick: null, click: null, beepHi: null, beepLo: null, noise: null, membrane: null
  };
  // Pending generic S&H param ranges to apply when drumSynth is created
  private pendingParamSHRanges = new Map<string, { min: number; max: number }>();


  private pendingDrumEuclidEvolveConfigs: DrumEuclidEvolveConfig[] = [
    defaultDrumEuclidEvolveConfig(),
    defaultDrumEuclidEvolveConfig(),
    defaultDrumEuclidEvolveConfig(),
    defaultDrumEuclidEvolveConfig(),
  ];

  // Pending step overrides from UI (full step data per lane)
  private pendingStepOverrides: DrumStepOverrides | null = null;
  private drumHomeStepOverrides: DrumStepOverrides = createEmptyDrumStepOverrides();
  private drumHomePitchSettings: (SequencerPitchSettings | null)[] = [null, null, null, null];
  private drumHomePitchScaleQuantize: (boolean | null)[] = [null, null, null, null];
  private drumHomePitchSubLaneStates: ({ steps?: number; direction?: LaneDirection; scaleQuantize?: boolean } | null)[] = [null, null, null, null];
  // Pending drum clock divs, swings, sub-lane enabled (applied when DrumSynth is created)
  private pendingDrumClockDivs: ClockDivision[] | null = null;
  private pendingDrumSwings: number[] | null = null;
  private pendingDrumSubLaneEnabled: Record<string, boolean>[] | null = null;

  // Lead Euclidean step overrides from UI (pitch, expression, trigger toggles, etc.)
  private synthStepOverrides: {
    pitch: (number[] | null)[];
    pitchDirection: (LaneDirection | null)[];
    triggerToggles: Map<number, boolean>[];
    expression: (number[] | null)[];
    expressionDirection: (LaneDirection | null)[];
    expressionRanges: ({ min: number; max: number } | null)[];
    morph: (number[] | null)[];
    morphDirection: (LaneDirection | null)[];
    morphRanges: ({ min: number; max: number } | null)[];
    distance: (number[] | null)[];
    distanceDirection: (LaneDirection | null)[];
    distanceRanges: ({ min: number; max: number } | null)[];
    nudge: (number[] | null)[];
    nudgeDirection: (LaneDirection | null)[];
    probability: (number[] | null)[];
    ratchet: (number[] | null)[];
    trigCondition: (TrigCondition[] | null)[];
    playNotes: (SynthPlayNoteTable | null)[];
  } = {
    pitch: [null, null, null, null],
    pitchDirection: [null, null, null, null],
    triggerToggles: [new Map(), new Map(), new Map(), new Map()],
    expression: [null, null, null, null],
    expressionDirection: [null, null, null, null],
    expressionRanges: [null, null, null, null],
    morph: [null, null, null, null],
    morphDirection: [null, null, null, null],
    morphRanges: [null, null, null, null],
    distance: [null, null, null, null],
    distanceDirection: [null, null, null, null],
    distanceRanges: [null, null, null, null],
    nudge: [null, null, null, null],
    nudgeDirection: [null, null, null, null],
    probability: [null, null, null, null],
    ratchet: [null, null, null, null],
    trigCondition: [null, null, null, null],
    playNotes: [null, null, null, null],
  };

  // Lead Euclidean trig condition counters per lane per step
  private synthTrigConditionCounters: Quad<number[]> = [[], [], [], []];

  // Temporary per-trigger overrides for lead sub-lanes (set before playLeadNote, cleared after)
  private synthMorphOverride: number | null = null;  // 0-1 morph position override
  private synthRatchetFactor: number = 1;  // ADSR scaling for ratchet (1/ratchetCount)

  // LFO per-pad state objects (Pad 1 LFO 1/2, Pad 2 LFO 1/2)
  private lfo1State = { shValue: 0, shLastPhase: 0, smoothTarget: 0, smoothCurrent: 0, rwPos: 0.5, rwVel: 0, rwLast: 0 };
  private lfo2State = { shValue: 0, shLastPhase: 0, smoothTarget: 0, smoothCurrent: 0, rwPos: 0.5, rwVel: 0, rwLast: 0 };
  private pad2Lfo1State = { shValue: 0, shLastPhase: 0, smoothTarget: 0, smoothCurrent: 0, rwPos: 0.5, rwVel: 0, rwLast: 0 };
  private pad2Lfo2State = { shValue: 0, shLastPhase: 0, smoothTarget: 0, smoothCurrent: 0, rwPos: 0.5, rwVel: 0, rwLast: 0 };
  private pad2LastHardness = -1;  // Track pad2 saturation separately

  // Unified dual-range storage: key → { min, max }
  // Populated by App when a slider is in walk or sampleHold mode.
  // When absent for a key, engine uses the single-value from sliderState.
  private dualRanges: Partial<Record<string, { min: number; max: number }>> = {};

  // S&H engine-side sampling: 10Hz re-sampling for non-drum dual-range params
  private shSampledValues: Record<string, number> = {};
  private padHeldOverrides: Partial<SliderState> = {};
  private shLastSampleTime = 0;
  private onGranularSHTrigger: ((positions: Record<string, number>) => void) | null = null;
  private fxBusOwners: Record<FxOwnershipBus, FxOwnershipState> = {
    delayA: { owner: null, strength: 0, expiresAtMs: 0, lastOrigin: null },
    delayB: { owner: null, strength: 0, expiresAtMs: 0, lastOrigin: null },
    granular: { owner: null, strength: 0, expiresAtMs: 0, lastOrigin: null },
    reverb: { owner: null, strength: 0, expiresAtMs: 0, lastOrigin: null },
  };
  private readonly drumTriggerRouter = (voice: DrumVoiceType, velocity: number, time?: number) => {
    this.reportFxOnset('drum', 'drumHit');
    this.triggerSidechainDuck(voice, velocity, time);
    this.onDrumTrigger?.(voice, velocity);
  };

  private readonly handleDocumentVisibilityChange = () => {
    const nowMs = performance.now();
    if (this.isDocumentVisible()) {
      this.foregroundParamResyncUntilMs = nowMs + FOREGROUND_PARAM_RESYNC_WINDOW_MS;
      this.syncGranularUiActive();
      if (this.sliderState && (this.isRunning || this.synthEuclidScheduleTimer !== null)) {
        this.scheduleApplyParamsRefresh();
      }
      if (
        this.journeyMorphClockActive &&
        this.journeyMorphClockRaf === null &&
        this.journeyMorphClockTimeout === null
      ) {
        this.scheduleJourneyMorphClockTick();
      }
      return;
    }

    this.syncGranularUiActive();
  };

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleDocumentVisibilityChange);
    }
  }

  private isDocumentVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState === 'visible';
  }

  private shouldRunMainThreadModulation(): boolean {
    return true;
  }

  private capMainThreadModulationDelta(elapsedMs: number): number {
    return Math.min(MAIN_THREAD_MODULATION_MAX_DELTA_MS, Math.max(0, elapsedMs));
  }

  private getRuntimeWalkWallTimeSec(): number {
    return Date.now() / 1000;
  }

  private getParamSmoothTime(defaultSmoothTime: number): number {
    return performance.now() < this.foregroundParamResyncUntilMs
      ? Math.max(defaultSmoothTime, FOREGROUND_PARAM_RESYNC_SMOOTH_TIME)
      : defaultSmoothTime;
  }

  /**
   * Lazy accessor for sliderState JSON. Recomputes only when dirty.
   * Used for deterministic harmony seeding at phrase boundaries.
   */
  private get sliderStateJson(): string {
    if (this._sliderStateJsonDirty && this.sliderState) {
      this._sliderStateJsonCache = harmonySeedPayloadJsonFromState(this.sliderState);
      this._sliderStateJsonDirty = false;
    }
    return this._sliderStateJsonCache;
  }

  private ensureTransportAnchors(): TransportAnchors {
    const nowWallSec = Date.now() / 1000;
    const nowCtxSec = this.ctx?.currentTime ?? 0;
    if (!this.transportAnchors) {
      this.transportAnchors = {
        localPhraseWallStartSec: nowWallSec,
        localBeatWallStartSec: nowWallSec,
        localBeatCtxStartSec: nowCtxSec,
      };
    }
    return this.transportAnchors;
  }

  private resetLocalPhraseAnchor(): void {
    const anchors = this.ensureTransportAnchors();
    anchors.localPhraseWallStartSec = Date.now() / 1000;
  }

  private resetLocalBeatAnchor(): void {
    const anchors = this.ensureTransportAnchors();
    anchors.localBeatWallStartSec = Date.now() / 1000;
    anchors.localBeatCtxStartSec = this.ctx?.currentTime ?? 0;
  }

  private getEffectiveHarmonyPhraseSeconds(state: SliderState = this.sliderState!): number {
    return getPhraseDurationForClockSource(state, state.harmonyClockSource ?? 'globalPhrase');
  }

  private getCurrentHarmonyPhraseIndex(nowWallSec: number = Date.now() / 1000): number {
    const state = this.sliderState!;
    const anchors = this.ensureTransportAnchors();
    const phraseSeconds = this.getEffectiveHarmonyPhraseSeconds(state);
    return getCurrentClockIndexWall(
      state.harmonyClockSource ?? 'globalPhrase',
      phraseSeconds,
      anchors,
      nowWallSec,
    );
  }

  private getCurrentProgressionPhraseIndex(nowWallSec: number = Date.now() / 1000): number {
    const state = this.sliderState!;
    const anchors = this.ensureTransportAnchors();
    const source = resolveProgressionPhraseClockSource(
      state.chordProgressionClockSource ?? 'harmony',
      state.harmonyClockSource ?? 'globalPhrase',
    );
    const phraseSeconds = getPhraseDurationForClockSource(state, source);
    return getCurrentClockIndexWall(source, phraseSeconds, anchors, nowWallSec);
  }

  private getTransportDebugStateInternal(nowWallSec: number = Date.now() / 1000): TransportDebugSnapshot | null {
    if (!this.sliderState || !this.transportAnchors) return null;
    const phraseSeconds = this.getEffectiveHarmonyPhraseSeconds(this.sliderState);
    const metrics = getTransportMetrics(this.sliderState);
    const nextPhraseBoundaryIn = getTimeUntilNextBoundaryWall(
      this.sliderState.harmonyClockSource ?? 'globalPhrase',
      phraseSeconds,
      this.transportAnchors,
      nowWallSec,
    );
    const progressionSource = resolveProgressionPhraseClockSource(
      this.sliderState.chordProgressionClockSource ?? 'harmony',
      this.sliderState.harmonyClockSource ?? 'globalPhrase',
    );
    const progressionPhraseSeconds = getPhraseDurationForClockSource(this.sliderState, progressionSource);
    const progressionStepSeconds = progressionPhraseSeconds * Math.max(1, this.sliderState.chordProgressionPhraseMultiplier ?? 1);
    const nextProgressionStepIn = (this.sliderState.chordProgressionEnabled ?? false)
      ? getTimeUntilNextBoundaryWall(progressionSource, progressionStepSeconds, this.transportAnchors, nowWallSec)
      : null;

    return {
      effectiveBpm: metrics.effectiveBpm,
      effectivePhraseSeconds: phraseSeconds,
      nextPhraseBoundaryIn,
      nextHarmonyEventIn: this.nextHarmonyEventWallSec !== null ? Math.max(0, this.nextHarmonyEventWallSec - nowWallSec) : null,
      nextProgressionStepIn,
    };
  }

  getTransportDebugState(): TransportDebugSnapshot | null {
    return this.getTransportDebugStateInternal();
  }

  private resetSynthEuclidTransportAlignment(resetCounters: boolean): void {
    this.synthEuclidNextStepTime = [0, 0, 0, 0];
    if (resetCounters) {
      this.synthEuclidCurrentStep = [0, 0, 0, 0];
      this.synthEuclidHitCounts = [0, 0, 0, 0];
      this.synthEuclidStepIndex = [0, 0, 0, 0];
      this.synthEuclidTotalStepCounts = [0, 0, 0, 0];
      this.resetSynthEuclidEvolveBarCounters();
      this.synthTrigConditionCounters = [[], [], [], []];
      this.onSynthStepPositionChange?.([0, 0, 0, 0], [0, 0, 0, 0]);
    }
  }

  private resetSynthEuclidEvolveBarCounters(): void {
    for (const state of this.synthEvolveStates) {
      state.lastEvolveBar = 0;
    }
  }

  /** App calls this whenever dualSliderRanges change */
  setDualRanges(ranges: Partial<Record<string, { min: number; max: number }>>) {
    const normalizedRanges: Partial<Record<string, { min: number; max: number }>> = {};
    for (const [key, range] of Object.entries(ranges)) {
      if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) continue;
      normalizedRanges[key] = {
        min: Math.min(range.min, range.max),
        max: Math.max(range.min, range.max),
      };
    }
    this.dualRanges = normalizedRanges;
    for (const key of Object.keys(this.shSampledValues)) {
      if ((key.startsWith('lead') || key.startsWith('granularLead') || this.isFxOwnershipDrivenKey(key) || this.isPadTriggerDrivenKey(key) || this.isPianoTriggerDrivenKey(key)) && !normalizedRanges[key]) {
        delete this.shSampledValues[key];
      }
    }
    this.cleanupPadHeldOverrides(normalizedRanges);
  }

  setRuntimeWalkRanges(ranges: Partial<Record<string, RuntimeWalkRange>>) {
    const nextRanges: Partial<Record<string, RuntimeWalkRange>> = {};
    for (const [key, range] of Object.entries(ranges)) {
      if (!range) continue;
      nextRanges[key] = { min: range.min, max: range.max };
      if (!this.runtimeWalkStates.has(key)) {
        this.runtimeWalkStates.set(key, {
          position: Math.random(),
          velocity: (Math.random() - 0.5) * 0.02,
        });
      }
    }

    for (const key of Array.from(this.runtimeWalkStates.keys())) {
      if (!(key in nextRanges)) {
        this.runtimeWalkStates.delete(key);
      }
    }

    this.runtimeWalkRanges = nextRanges;
    this.emitRuntimeWalkPositions(true);
    this.syncRuntimeRandomWalk();
    if (this.sourceSliderState) {
      this.updateParams(this.sourceSliderState);
    }
  }

  setRuntimeWalkPositionsCallback(callback: ((positions: Record<string, number>) => void) | null) {
    this.onRuntimeWalkPositionsChange = callback;
    if (callback) {
      callback({ ...this.runtimeWalkPositions });
    }
  }

  setVisualTelemetryActive(_active: boolean): void {
    // Web TS owns visual values directly on the main engine path.
  }

  private emitRuntimeWalkPositions(force = false): void {
    const nextPositions: Record<string, number> = {};
    for (const key of Object.keys(this.runtimeWalkRanges)) {
      nextPositions[key] = this.runtimeWalkStates.get(key)?.position ?? 0.5;
    }

    let changed = force;
    if (!changed) {
      const prevKeys = Object.keys(this.runtimeWalkPositions);
      const nextKeys = Object.keys(nextPositions);
      changed = prevKeys.length !== nextKeys.length;
      if (!changed) {
        for (const key of nextKeys) {
          if (Math.abs((this.runtimeWalkPositions[key] ?? 0.5) - nextPositions[key]!) > 0.0005) {
            changed = true;
            break;
          }
        }
      }
    }
    if (!changed) return;

    this.runtimeWalkPositions = nextPositions;
    this.onRuntimeWalkPositionsChange?.({ ...nextPositions });
  }

  private isPadTriggerDrivenKey(key: string): boolean {
    return PAD1_TRIGGER_HOLD_KEYS.has(key) || PAD2_TRIGGER_HOLD_KEYS.has(key);
  }

  private isPianoTriggerDrivenKey(key: string): boolean {
    return PIANO_TRIGGER_HOLD_KEYS.has(key);
  }

  private cleanupPadHeldOverrides(ranges: Partial<Record<string, { min: number; max: number }>>): void {
    for (const key of Object.keys(this.padHeldOverrides)) {
      const keepPad1Morph = ranges.padMorph && PAD1_MORPH_HOLD_KEYS.has(key);
      const keepPad2Morph = ranges.pad2Morph && PAD2_MORPH_HOLD_KEYS.has(key);
      if (!ranges[key] && !keepPad1Morph && !keepPad2Morph) {
        delete this.padHeldOverrides[key as keyof SliderState];
      }
    }
  }

  private getEffectivePadState(state: SliderState): SliderState {
    const baseState = Object.keys(this.padHeldOverrides).length > 0
      ? ({ ...state, ...this.padHeldOverrides } as SliderState)
      : state;
    const pad1State = applyPadDistanceToState(baseState, 'pad1');
    return applyPadDistanceToState(pad1State, 'pad2');
  }

  private buildPadTriggerState(
    pad: 'pad1' | 'pad2',
    baseState: SliderState,
    morphOverride: number | null = null,
    distanceOverride: number | null = null,
  ): SliderState | null {
    const heldBaseState = Object.keys(this.padHeldOverrides).length > 0
      ? ({ ...baseState, ...this.padHeldOverrides } as SliderState)
      : baseState;
    const effectiveDistance = Math.max(
      0,
      Math.min(
        1,
        distanceOverride ?? getVoiceDistanceValue(heldBaseState, pad === 'pad2' ? 'pad2' : 'pad1'),
      ),
    );
    const effectiveBase = applyPadDistanceToState(
      applyPadDistanceToState(
        heldBaseState,
        'pad1',
        pad === 'pad1' ? distanceOverride : null,
      ),
      'pad2',
      pad === 'pad2' ? distanceOverride : null,
    );
    if (pad === 'pad2') {
      this.onPad2DistanceTrigger?.(effectiveDistance);
    } else {
      this.onPadDistanceTrigger?.(effectiveDistance);
    }
    const nextState = { ...effectiveBase } as SliderState;
    const nextStateRecord = nextState as unknown as Record<string, SliderState[keyof SliderState]>;
    const heldOverrideRecord = this.padHeldOverrides as Record<string, SliderState[keyof SliderState] | undefined>;
    const positions: Record<string, number> = {};
    const sampledKeys = new Set<string>();
    let changed = false;

    const morphKey = pad === 'pad2' ? 'pad2Morph' : 'padMorph';
    let effectiveMorph = morphOverride;
    if (effectiveMorph === null) {
      const sampledMorph = this.sampleDualRangeKey(morphKey, positions);
      if (sampledMorph !== null) {
        effectiveMorph = sampledMorph;
      }
    }

    if (effectiveMorph !== null) {
      const presetA = getPadPreset((pad === 'pad2' ? effectiveBase.pad2PresetA : effectiveBase.padPresetA) as string, pad);
      const presetB = getPadPreset((pad === 'pad2' ? effectiveBase.pad2PresetB : effectiveBase.padPresetB) as string, pad);
      if (presetA && presetB) {
        const morphed = morphPadPresets(presetA, presetB, effectiveMorph);
        for (const key of PAD_PRESET_PARAM_KEYS) {
          if (!(key in morphed)) continue;
          const targetKey = (pad === 'pad2' ? PAD1_TO_PAD2_ENGINE[key] : key) as keyof SliderState;
          const value = morphed[key] as SliderState[keyof SliderState];
          nextStateRecord[targetKey as string] = value;
          heldOverrideRecord[targetKey as string] = value;
          sampledKeys.add(targetKey as string);
          changed = true;
        }
        if (pad === 'pad2') {
          this.onPad2MorphTrigger?.(effectiveMorph);
        } else {
          this.onPadMorphTrigger?.(effectiveMorph);
        }
      }
    }

    const directKeys = pad === 'pad2'
      ? Array.from(PAD2_TRIGGER_HOLD_KEYS)
      : Array.from(PAD1_TRIGGER_HOLD_KEYS);
    for (const key of directKeys) {
      if (key === morphKey || !this.dualRanges[key]) continue;
      const sampled = this.sampleDualRangeKey(key, positions);
      if (sampled === null) continue;
      nextStateRecord[key] = sampled as SliderState[keyof SliderState];
      heldOverrideRecord[key] = sampled as SliderState[keyof SliderState];
      sampledKeys.add(key);
      changed = true;
    }

    if (sampledKeys.size > 0) {
      for (const key of Object.keys(this.padHeldOverrides)) {
        if ((pad === 'pad2' ? PAD2_TRIGGER_HOLD_KEYS : PAD1_TRIGGER_HOLD_KEYS).has(key) && !sampledKeys.has(key)) {
          const keepMorph = pad === 'pad2'
            ? !!(this.dualRanges.pad2Morph && PAD2_MORPH_HOLD_KEYS.has(key))
            : !!(this.dualRanges.padMorph && PAD1_MORPH_HOLD_KEYS.has(key));
          if (!keepMorph && !this.dualRanges[key]) {
            delete this.padHeldOverrides[key as keyof SliderState];
          }
        }
      }
    }

    this.emitOwnedSamplePositions(positions);
    if (changed) {
      this.scheduleApplyParamsRefresh();
      return nextState;
    }
    return Object.keys(this.padHeldOverrides).length > 0 ? nextState : null;
  }

  private shapeNoteDistance(distance: number): number {
    const safe = clampVal(distance, 0, 1);
    return 1 - Math.pow(1 - safe, 2);
  }

  private applyLeadDistanceTimbre(
    morphed: Lead4opFMMorphedParams,
    distance: number,
  ): Lead4opFMMorphedParams {
    if (distance <= 1e-4) return morphed;
    const shaped = this.shapeNoteDistance(distance);
    return {
      ...morphed,
      filterFreq: Math.max(80, morphed.filterFreq * (1 - shaped * 0.72)),
      filterQ: Math.max(0.05, morphed.filterQ * (1 - shaped * 0.18)),
      filterEnvDepth: morphed.filterEnvDepth * (1 - shaped * 0.55),
      transientClick: morphed.transientClick * (1 - shaped * 0.92),
      transientNoise: morphed.transientNoise * (1 - shaped * 0.82),
      mod1Index: morphed.mod1Index * (1 - shaped * 0.34),
      mod2Index: morphed.mod2Index * (1 - shaped * 0.30),
      mod3Index: morphed.mod3Index * (1 - shaped * 0.24),
      mod4Index: morphed.mod4Index * (1 - shaped * 0.18),
      drive: morphed.drive * (1 - shaped * 0.62),
      carrier2Mix: morphed.carrier2Mix * (1 - shaped * 0.12),
      gain: morphed.gain * (1 - shaped * 0.15),
    };
  }

  private getFxOwnershipBusForKey(key: string): FxOwnershipBus | null {
    if (key === 'drumDelayNoteL' || key === 'drumDelayNoteR') {
      return 'delayA';
    }

    if (key.startsWith('delayA')) {
      if (
        key === 'delayATime' ||
        key === 'delayASpread' ||
        key === 'delayAPingPong' ||
        key === 'delayAFilterType' ||
        key === 'delayAEnabled' ||
        key === 'delayASend'
      ) {
        return null;
      }
      return 'delayA';
    }

    if (key.startsWith('granularDelay')) {
      if (key === 'granularDelayEnabled') {
        return null;
      }
      return 'delayB';
    }

    if (
      key === 'delayBGranularSend' ||
      key === 'delayBToASend' ||
      key === 'delayBWarpIntensity' ||
      key === 'delayBSpread'
    ) {
      return 'delayB';
    }

    if (REVERB_OWNERSHIP_KEYS.has(key)) {
      return 'reverb';
    }

    if (key.startsWith('granular')) {
      if (
        GRANULAR_OWNERSHIP_PREFIX_EXCLUSIONS.some(prefix => key.startsWith(prefix)) ||
        key === 'granularEnabled' ||
        key === 'granularFreeze' ||
        key === 'granularShape' ||
        key.endsWith('Enabled') ||
        key.endsWith('Mode') ||
        key.endsWith('Slice') ||
        key.endsWith('Reverse') ||
        key.includes('TempoSync')
      ) {
        return null;
      }
      return 'granular';
    }

    return null;
  }

  private isFxOwnershipDrivenKey(key: string): boolean {
    return this.getFxOwnershipBusForKey(key) !== null;
  }

  private shv(key: string, fallback: number): number {
    return this.shSampledValues[key] ?? fallback;
  }

  private shDelayDivision<K extends IndexedDelayDivisionKey>(key: K, fallback: SliderState[K]): SliderState[K] {
    const sampled = this.shSampledValues[key];
    if (typeof sampled !== 'number') return fallback;
    return getIndexedDelayDivisionValue(key, sampled);
  }

  private getFxOwnerDebugState(): FxOwnershipDebugState {
    const nowMs = performance.now();
    return {
      delayA: {
        owner: this.fxBusOwners.delayA.owner,
        strength: this.fxBusOwners.delayA.strength,
        lastOrigin: this.fxBusOwners.delayA.lastOrigin,
        active: this.fxBusOwners.delayA.owner !== null && nowMs < this.fxBusOwners.delayA.expiresAtMs,
      },
      delayB: {
        owner: this.fxBusOwners.delayB.owner,
        strength: this.fxBusOwners.delayB.strength,
        lastOrigin: this.fxBusOwners.delayB.lastOrigin,
        active: this.fxBusOwners.delayB.owner !== null && nowMs < this.fxBusOwners.delayB.expiresAtMs,
      },
      granular: {
        owner: this.fxBusOwners.granular.owner,
        strength: this.fxBusOwners.granular.strength,
        lastOrigin: this.fxBusOwners.granular.lastOrigin,
        active: this.fxBusOwners.granular.owner !== null && nowMs < this.fxBusOwners.granular.expiresAtMs,
      },
      reverb: {
        owner: this.fxBusOwners.reverb.owner,
        strength: this.fxBusOwners.reverb.strength,
        lastOrigin: this.fxBusOwners.reverb.lastOrigin,
        active: this.fxBusOwners.reverb.owner !== null && nowMs < this.fxBusOwners.reverb.expiresAtMs,
      },
    };
  }

  private sampleDualRangeKey(key: string, positions: Record<string, number>): number | null {
    const range = this.dualRanges[key];
    if (!range) return null;
    const sampled = range.min + Math.random() * (range.max - range.min);
    this.shSampledValues[key] = sampled;
    const span = range.max - range.min;
    positions[key] = span > 0 ? (sampled - range.min) / span : 0.5;
    return sampled;
  }

  private emitOwnedSamplePositions(positions: Record<string, number>): void {
    if (Object.keys(positions).length === 0) return;
    if (this.onGranularSHTrigger) {
      this.onGranularSHTrigger(positions);
    }
    if (
      this.onLeadDelayTrigger &&
      (positions.delayAFeedback !== undefined || positions.delayAMix !== undefined)
    ) {
      this.onLeadDelayTrigger({
        time: 0.5,
        feedback: positions.delayAFeedback ?? 0.5,
        mix: positions.delayAMix ?? 0.5,
      });
    }
  }

  private getLeadRandomSource(state: SliderState): SliderState['leadRandomSource'] {
    return state.leadRandomSource ?? 'lead1';
  }

  private isLeadRandomSourceEnabled(state: SliderState): boolean {
    const randomSource = this.getLeadRandomSource(state);
    if (randomSource === 'lead2') return !!state.lead2Enabled;
    if (randomSource === 'sample1' || randomSource === 'sample2') return false;
    return !!state.leadEnabled;
  }

  private usesRandomLeadPath(state: SliderState): boolean {
    if (!state.leadRandomEnabled || !this.isLeadRandomSourceEnabled(state)) return false;
    const randomSource = this.getLeadRandomSource(state);
    return randomSource === 'lead1' || randomSource === 'lead2';
  }

  private euclidUsesLead1Source(state: SliderState): boolean {
    return !!(
      state.synthEuclideanMasterEnabled && (
        (state.synthEuclid1Enabled && ((state.synthEuclid1Source ?? 'lead') === 'lead' || (state.synthEuclid1Source ?? 'lead') === 'lead1')) ||
        (state.synthEuclid2Enabled && ((state.synthEuclid2Source ?? 'lead') === 'lead' || (state.synthEuclid2Source ?? 'lead') === 'lead1')) ||
        (state.synthEuclid3Enabled && ((state.synthEuclid3Source ?? 'lead') === 'lead' || (state.synthEuclid3Source ?? 'lead') === 'lead1')) ||
        (state.synthEuclid4Enabled && ((state.synthEuclid4Source ?? 'lead') === 'lead' || (state.synthEuclid4Source ?? 'lead') === 'lead1'))
      )
    );
  }

  private euclidUsesLead2Source(state: SliderState): boolean {
    return !!(
      state.synthEuclideanMasterEnabled && (
        (state.synthEuclid1Enabled && state.synthEuclid1Source === 'lead2') ||
        (state.synthEuclid2Enabled && state.synthEuclid2Source === 'lead2') ||
        (state.synthEuclid3Enabled && state.synthEuclid3Source === 'lead2') ||
        (state.synthEuclid4Enabled && state.synthEuclid4Source === 'lead2')
      )
    );
  }

  private euclidUsesPianoSource(state: SliderState): boolean {
    return !!(
      state.synthEuclideanMasterEnabled && (
        (state.synthEuclid1Enabled && String(state.synthEuclid1Source) === 'piano') ||
        (state.synthEuclid2Enabled && String(state.synthEuclid2Source) === 'piano') ||
        (state.synthEuclid3Enabled && String(state.synthEuclid3Source) === 'piano') ||
        (state.synthEuclid4Enabled && String(state.synthEuclid4Source) === 'piano')
      )
    );
  }

  private isLead1RouteActive(state: SliderState): boolean {
    return !!state.leadEnabled || this.euclidUsesLead1Source(state);
  }

  private isLead2RouteActive(state: SliderState): boolean {
    return !!state.lead2Enabled || this.euclidUsesLead2Source(state);
  }

  private isPianoRouteActive(state: SliderState): boolean {
    return !!state.pianoEnabled || this.euclidUsesPianoSource(state);
  }

  private setPadVoiceTarget(voiceIndex: number, isPad2: boolean): void {
    if (voiceIndex < 0 || voiceIndex >= PAD_VOICE_COUNT) return;
    const bit = 1 << voiceIndex;
    const wasPad2 = (this.lastPad2VoiceAssign & bit) !== 0;
    if (wasPad2 === isPad2) return;

    if (this.pad1Bus && this.pad2Bus && this.voices[voiceIndex]) {
      const voice = this.voices[voiceIndex]!;
      const fromBus = wasPad2 ? this.pad2Bus : this.pad1Bus;
      const toBus = isPad2 ? this.pad2Bus : this.pad1Bus;
      try { voice.mixerGain.disconnect(fromBus); } catch { /* stale routing is safe */ }
      voice.mixerGain.connect(toBus);

      if (this.pad1PreFaderBus && this.pad2PreFaderBus) {
        const fromPre = wasPad2 ? this.pad2PreFaderBus : this.pad1PreFaderBus;
        const toPre = isPad2 ? this.pad2PreFaderBus : this.pad1PreFaderBus;
        try { voice.envelope.disconnect(fromPre); } catch { /* stale routing is safe */ }
        voice.envelope.connect(toPre);
      }
    }

    if (this.padWasmNode) {
      this.padWasmNode.port.postMessage({ type: 'voicePad', voiceIndex, pad: isPad2 ? 1 : 0 });
    }

    this.lastPad2VoiceAssign = isPad2
      ? (this.lastPad2VoiceAssign | bit)
      : (this.lastPad2VoiceAssign & ~bit);
  }

  private killPadVoiceNow(voiceIndex: number): void {
    if (voiceIndex < 0 || voiceIndex >= PAD_VOICE_COUNT) return;

    const noteOffTimerId = this.synthVoiceNoteOffTimers[voiceIndex];
    if (noteOffTimerId !== null) {
      clearTimeout(noteOffTimerId);
      this.synthVoiceNoteOffTimers[voiceIndex] = null;
    }

    if (this.padWasmNode) {
      this.padWasmNode.port.postMessage({ type: 'killVoice', voiceIndex });
    }

    const voice = this.voices[voiceIndex];
    if (voice && this.ctx) {
      const now = this.ctx.currentTime;
      voice.envelope.gain.cancelScheduledValues(now);
      voice.envelope.gain.setValueAtTime(0, now);
      voice.active = false;
    }
  }

  private clearPadChordTriggerTimers(): void {
    if (this.padChordTriggerTimers.size === 0) return;
    for (const timerId of this.padChordTriggerTimers) {
      clearTimeout(timerId);
    }
    this.padChordTriggerTimers.clear();
  }

  private clearSoftStopCleanupTimers(): void {
    if (this.softStopCleanupTimers.size === 0) return;
    for (const timerId of this.softStopCleanupTimers) {
      clearTimeout(timerId);
    }
    this.softStopCleanupTimers.clear();
  }

  private scheduleSoftStopCleanup(callback: () => void, delayMs = SOFT_STOP_SOURCE_FADE_MS + 24): void {
    const timerId = window.setTimeout(() => {
      this.softStopCleanupTimers.delete(timerId);
      callback();
    }, Math.max(0, delayMs));
    this.softStopCleanupTimers.add(timerId);
  }

  private fadeAudioParamToZero(
    param: AudioParam | null | undefined,
    now: number,
    endTime: number,
  ): void {
    if (!param) return;
    const current = Number.isFinite(param.value) ? param.value : 0;
    this.rampAudioParam(param, current, 0, now, endTime);
  }

  private softStopActivePianoVoices(now: number, endTime: number): void {
    if (this.activePianoVoices.size === 0) return;

    const voices = Array.from(this.activePianoVoices);
    for (const voice of voices) {
      this.fadeAudioParamToZero(voice.gain.gain, now, endTime);
    }

    this.scheduleSoftStopCleanup(() => {
      if (this.isRunning) return;
      for (const voice of voices) {
        try { voice.source.stop(); } catch { /* ignore stale piano source */ }
        try { voice.source.disconnect(); } catch { /* ignore stale piano source */ }
        try { voice.gain.disconnect(); } catch { /* ignore stale piano gain */ }
        try { voice.filter?.disconnect(); } catch { /* ignore stale piano filter */ }
        this.activePianoVoices.delete(voice);
      }
    });
  }

  private softStopEarthTextureRuntime(runtime: EarthTextureRuntime | null, now: number, endTime: number): void {
    if (!runtime) return;
    this.fadeAudioParamToZero(runtime.gateGain.gain, now, endTime);
    this.fadeAudioParamToZero(runtime.levelGain.gain, now, endTime);
    this.fadeAudioParamToZero(runtime.reverbSend.gain, now, endTime);
    this.fadeAudioParamToZero(runtime.delayASend?.gain, now, endTime);
    this.fadeAudioParamToZero(runtime.delayBSend?.gain, now, endTime);
    this.fadeAudioParamToZero(runtime.granularSend?.gain, now, endTime);
    this.resetEarthFadeState(runtime.fadeState);
    this.scheduleSoftStopCleanup(() => {
      if (!this.isRunning) {
        runtime.player.stop();
      }
    });
  }

  private softStopGraphSources(now: number): void {
    const endTime = now + SOFT_STOP_SOURCE_FADE_SECONDS;

    this.clearPadChordTriggerTimers();

    this.fadeAudioParamToZero(this.synthDirect?.gain, now, endTime);
    this.fadeAudioParamToZero(this.pad1Bus?.gain, now, endTime);
    this.fadeAudioParamToZero(this.pad2Bus?.gain, now, endTime);
    this.fadeAudioParamToZero(this.pad1PreFaderBus?.gain, now, endTime);
    this.fadeAudioParamToZero(this.pad2PreFaderBus?.gain, now, endTime);
    this.fadeAudioParamToZero(this.pad1ReverbSend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.pad2ReverbSend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.pad1DelayASend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.pad1DelayBSend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.pad2DelayASend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.pad2DelayBSend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.granularPad1Send?.gain, now, endTime);
    this.fadeAudioParamToZero(this.granularPad2Send?.gain, now, endTime);

    this.voices.forEach((voice) => {
      if (!voice.active) return;
      voice.envelope.gain.cancelScheduledValues(now);
      voice.envelope.gain.setValueAtTime(voice.envelope.gain.value, now);
      voice.envelope.gain.linearRampToValueAtTime(0, endTime);
      voice.active = false;
    });
    this.postPadWasmAllNotesOff();

    this.fadeAudioParamToZero(this.leadDry?.gain, now, endTime);
    this.fadeAudioParamToZero(this.lead1LevelGain?.gain, now, endTime);
    this.fadeAudioParamToZero(this.lead2LevelGain?.gain, now, endTime);
    this.fadeAudioParamToZero(this.leadWasmLevelGain?.gain, now, endTime);
    this.fadeAudioParamToZero(this.leadWasmLead2LevelGain?.gain, now, endTime);
    this.fadeAudioParamToZero(this.lead1ReverbSend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.lead2ReverbSend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.lead1DelayASend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.lead1DelayBSend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.lead2DelayASend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.lead2DelayBSend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.granularLead1Send?.gain, now, endTime);
    this.fadeAudioParamToZero(this.granularLead2Send?.gain, now, endTime);
    if (this.leadFmWasmReady && this.leadFmWasmNode) {
      this.leadFmWasmNode.port.postMessage({ type: 'allNotesOff' });
    }

    this.fadeAudioParamToZero(this.pianoLevelGain?.gain, now, endTime);
    this.fadeAudioParamToZero(this.pianoReverbSend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.pianoDelayASend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.pianoDelayBSend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.granularPianoSend?.gain, now, endTime);
    this.softStopActivePianoVoices(now, endTime);

    this.fadeAudioParamToZero(this.oceanGateGain?.gain, now, endTime);
    this.fadeAudioParamToZero(this.oceanLevelGain?.gain, now, endTime);
    this.fadeAudioParamToZero(this.oceanReverbSendNode?.gain, now, endTime);
    this.fadeAudioParamToZero(this.oceanDelayASend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.oceanDelayBSend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.granularWavesSend?.gain, now, endTime);
    this.resetEarthFadeState(this.oceanFadeState);
    this.scheduleSoftStopCleanup(() => {
      if (!this.isRunning) {
        this.oceanTexturePlayer?.stop();
      }
    });

    this.fadeAudioParamToZero(this.waterGateGain?.gain, now, endTime);
    this.fadeAudioParamToZero(this.waterLevelGain?.gain, now, endTime);
    this.fadeAudioParamToZero(this.waterReverbSend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.waterDelayASend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.waterDelayBSend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.granularWaterSend?.gain, now, endTime);
    this.resetEarthFadeState(this.waterFadeState);

    this.fadeAudioParamToZero(this.insectsLevelGain?.gain, now, endTime);
    this.fadeAudioParamToZero(this.insectsReverbSendNode?.gain, now, endTime);
    this.fadeAudioParamToZero(this.insectsDelayASend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.insectsDelayBSend?.gain, now, endTime);
    this.fadeAudioParamToZero(this.granularInsectsSend?.gain, now, endTime);
    this.resetEarthFadeState(this.insects1FadeState);
    this.resetEarthFadeState(this.insects2FadeState);

    this.fadeAudioParamToZero(this.natureLevelGain?.gain, now, endTime);
    this.softStopEarthTextureRuntime(this.birdsTexture, now, endTime);
    this.softStopEarthTextureRuntime(this.birds2Texture, now, endTime);
    this.softStopEarthTextureRuntime(this.frogsTexture, now, endTime);

    if (this.soundscapesNode && this.soundscapesWasmReady) {
      try {
        this.soundscapesNode.port.postMessage({
          type: 'insectsGate',
          enabled: false,
          fadeSeconds: SOFT_STOP_SOURCE_FADE_SECONDS,
        });
        this.soundscapesNode.port.postMessage({
          type: 'insects2Gate',
          enabled: false,
          fadeSeconds: SOFT_STOP_SOURCE_FADE_SECONDS,
        });
      } catch {
        // Ignore stale worklet ports during soft-stop.
      }

      this.scheduleSoftStopCleanup(() => {
        if (this.isRunning || !this.soundscapesNode) return;
        try {
          if (this._scWaterStarted) this.soundscapesNode.port.postMessage({ type: 'waterStop' });
          if (this._scInsects1Started) this.soundscapesNode.port.postMessage({ type: 'insectsStop' });
          if (this._scInsects2Started) this.soundscapesNode.port.postMessage({ type: 'insects2Stop' });
        } catch {
          // Ignore stale worklet ports during delayed cleanup.
        }
        this._scWaterStarted = false;
        this._scInsects1Started = false;
        this._scInsects2Started = false;
      });
    }

    this.fadeAudioParamToZero(this.granularDrumSend?.gain, now, endTime);
    this.drumSynth?.softStop(SOFT_STOP_SOURCE_FADE_SECONDS);
  }

  private killAllPadVoicesNow(): void {
    this.clearPadChordTriggerTimers();
    for (let voiceIndex = 0; voiceIndex < PAD_VOICE_COUNT; voiceIndex += 1) {
      this.killPadVoiceNow(voiceIndex);
    }
  }

  private clearManualPadAuditionTails(): void {
    if (this.isRunning) return;
    this.killAllPadVoicesNow();
  }

  private stopManualLeadAuditionTails(): void {
    if (this.isRunning || !this.leadFmWasmReady || !this.leadFmWasmNode) return;
    this.leadFmWasmNode.port.postMessage({ type: 'reset' });
  }

  private warnPadWasmUnavailable(context: string): void {
    if (this.padWasmUnavailableWarned) return;
    this.padWasmUnavailableWarned = true;
    console.warn(`[PadSynth-WASM] ${context}: Pad WASM is unavailable; JS fallback is disabled.`);
  }

  private postPadWasmNoteOff(voiceIndex: number): void {
    if (!this.padWasmNode) return;
    this.padWasmNode.port.postMessage({ type: 'noteOff', voiceIndex });
  }

  private postPadWasmAllNotesOff(): void {
    if (!this.padWasmNode) return;
    for (let voiceIndex = 0; voiceIndex < PAD_VOICE_COUNT; voiceIndex += 1) {
      this.postPadWasmNoteOff(voiceIndex);
    }
  }

  private getManualPadVoicePool(pad: 'pad1' | 'pad2', state: SliderState): number[] {
    const mask = (state.synthVoiceMask ?? 63) & PAD_VOICE_MASK_ALL;
    const assign = (state.pad2VoiceAssign ?? 0) & PAD_VOICE_MASK_ALL;
    const enabledVoices = Array.from({ length: PAD_VOICE_COUNT }, (_, voiceIndex) => voiceIndex)
      .filter((voiceIndex) => (mask & (1 << voiceIndex)) !== 0);

    if (enabledVoices.length === 0) return [0];

    const preferred = enabledVoices.filter((voiceIndex) => {
      const isPad2 = (assign & (1 << voiceIndex)) !== 0;
      return pad === 'pad2' ? isPad2 : !isPad2;
    });

    return preferred.length > 0 ? preferred : enabledVoices;
  }

  private pickManualPadVoice(pad: 'pad1' | 'pad2', state: SliderState): number {
    const pool = this.getManualPadVoicePool(pad, state);
    const cursor = this.manualPadVoiceCursor[pad] % pool.length;
    const voiceIndex = pool[cursor] ?? pool[0] ?? 0;
    this.manualPadVoiceCursor[pad] = (cursor + 1) % pool.length;
    return voiceIndex;
  }

  private resolveManualPadVoiceIndex(note: ManualSynthNoteOptions, pad: 'pad1' | 'pad2', state: SliderState): number {
    return Number.isInteger(note.voiceIndex) && note.voiceIndex! >= 0 && note.voiceIndex! < PAD_VOICE_COUNT
      ? note.voiceIndex!
      : this.pickManualPadVoice(pad, state);
  }

  private createManualAuditionState(
    source: ManualSynthSource,
    baseState: SliderState,
    voiceIndex: number | null,
  ): SliderState {
    const nextState = { ...baseState };

    switch (source) {
      case 'pad1':
        nextState.padEnabled = true;
        break;
      case 'pad2':
        nextState.pad2Enabled = true;
        break;
      case 'lead1':
        nextState.leadEnabled = true;
        break;
      case 'lead2':
        nextState.lead2Enabled = true;
        break;
      case 'piano':
        nextState.pianoEnabled = true;
        break;
    }

    if (voiceIndex !== null) {
      const bit = 1 << voiceIndex;
      nextState.pad2VoiceAssign = source === 'pad2'
        ? ((nextState.pad2VoiceAssign ?? 0) | bit)
        : ((nextState.pad2VoiceAssign ?? 0) & ~bit);
    }

    return nextState;
  }

  private applyManualAuditionMixStateForSources(sources: ReadonlySet<ManualSynthSource>, state: SliderState): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const smoothTime = 0.01;
    const shv = (key: string, fallback: number) => this.shv(key, fallback);
    const padState = this.getEffectivePadState(state);
    const hasPad1 = sources.has('pad1');
    const hasPad2 = sources.has('pad2');
    const hasLead1 = sources.has('lead1');
    const hasLead2 = sources.has('lead2');
    const hasPiano = sources.has('piano');

    if (hasPad1 || hasPad2) {
      this.synthDirect?.gain.setTargetAtTime(1, now, smoothTime);
      this.pad1ReverbSend?.gain.setTargetAtTime(hasPad1 && state.reverbEnabled ? shv('pad1ReverbSend', padState.pad1ReverbSend ?? 0) : 0, now, smoothTime);
      this.pad2ReverbSend?.gain.setTargetAtTime(hasPad2 && state.reverbEnabled ? shv('pad2ReverbSend', padState.pad2ReverbSend ?? 0) : 0, now, smoothTime);
      this.pad1DelayASend?.gain.setTargetAtTime(hasPad1 ? shv('pad1DelayASend', padState.pad1DelayASend ?? 0) : 0, now, smoothTime);
      this.pad1DelayBSend?.gain.setTargetAtTime(hasPad1 ? shv('pad1DelayBSend', padState.pad1DelayBSend ?? 0) : 0, now, smoothTime);
      this.pad2DelayASend?.gain.setTargetAtTime(hasPad2 ? shv('pad2DelayASend', padState.pad2DelayASend ?? 0) : 0, now, smoothTime);
      this.pad2DelayBSend?.gain.setTargetAtTime(hasPad2 ? shv('pad2DelayBSend', padState.pad2DelayBSend ?? 0) : 0, now, smoothTime);
    }

    const lead1Level = applyDistanceValue('lead1Level', state, 'lead1');
    const lead2Level = applyDistanceValue('lead2Level', state, 'lead2');
    const pianoLevel = applyDistanceValue('pianoLevel', state, 'piano') * ENGINE_TRIMS.piano;

    this.lead1LevelGain?.gain.setTargetAtTime(hasLead1 ? lead1Level : 0, now, smoothTime);
    this.leadWasmLevelGain?.gain.setTargetAtTime(hasLead1 ? lead1Level : 0, now, smoothTime);
    this.lead2LevelGain?.gain.setTargetAtTime(hasLead2 ? lead2Level : 0, now, smoothTime);
    this.leadWasmLead2LevelGain?.gain.setTargetAtTime(hasLead2 ? lead2Level : 0, now, smoothTime);
    this.pianoLevelGain?.gain.setTargetAtTime(hasPiano ? pianoLevel : 0, now, smoothTime);

    this.lead1ReverbSend?.gain.setTargetAtTime(hasLead1 && state.reverbEnabled ? applyDistanceValue('lead1ReverbSend', state, 'lead1') : 0, now, smoothTime);
    this.lead2ReverbSend?.gain.setTargetAtTime(hasLead2 && state.reverbEnabled ? applyDistanceValue('lead2ReverbSend', state, 'lead2') : 0, now, smoothTime);
    this.pianoReverbSend?.gain.setTargetAtTime(hasPiano && state.reverbEnabled ? applyDistanceValue('pianoReverbSend', state, 'piano') : 0, now, smoothTime);

    this.lead1DelayASend?.gain.setTargetAtTime(hasLead1 ? shv('lead1DelayASend', state.lead1DelayASend ?? 0) : 0, now, smoothTime);
    this.lead1DelayBSend?.gain.setTargetAtTime(hasLead1 ? shv('lead1DelayBSend', state.lead1DelayBSend ?? 0) : 0, now, smoothTime);
    this.lead2DelayASend?.gain.setTargetAtTime(hasLead2 ? shv('lead2DelayASend', state.lead2DelayASend ?? 0) : 0, now, smoothTime);
    this.lead2DelayBSend?.gain.setTargetAtTime(hasLead2 ? shv('lead2DelayBSend', state.lead2DelayBSend ?? 0) : 0, now, smoothTime);
    this.pianoDelayASend?.gain.setTargetAtTime(hasPiano ? shv('pianoDelayASend', state.pianoDelayASend ?? 0) : 0, now, smoothTime);
    this.pianoDelayBSend?.gain.setTargetAtTime(hasPiano ? shv('pianoDelayBSend', state.pianoDelayBSend ?? 0) : 0, now, smoothTime);
    this.sendLeadFmWasmDelay(state);
  }

  private isAnyPadSourceActive(state: SliderState): boolean {
    return state.padEnabled !== false || !!state.pad2Enabled || this.euclideanUsesPadSource(state);
  }

  private async prepareManualSynthChain(state: SliderState, source: ManualSynthSource, focusMidi?: number): Promise<void> {
    await this.prepareManualSynthChainForSources(state, new Set([source]), focusMidi);
  }

  private async prepareManualSynthChainForSources(
    state: SliderState,
    sources: ReadonlySet<ManualSynthSource>,
    focusMidi?: number,
  ): Promise<void> {
    if (this.ctx?.state === 'closed') {
      this.resetIndependentSynthContextState();
      this.ctx = null;
      this.graphBootstrapped = false;
      this.transportAnchors = null;
    }

    this.sliderState = state;
    this._sliderStateJsonDirty = true;
    this.syncLeadMorphRandomWalk();
    this.ensureTransportAnchors();
    this.ensureSynthChain();
    await Promise.resolve();
    this.applyParams(state);
    this.applyManualAuditionMixStateForSources(sources, state);

    if (sources.has('pad1') || sources.has('pad2')) {
      await this.ensurePadWasmForIndependentSynth();
      await this.waitForPadWasmReady();
      this.sendPadWasmParams(state);
      this.applyManualAuditionMixStateForSources(sources, state);
    }

    if (sources.has('lead1') || sources.has('lead2')) {
      await this.ensureLeadFmWasmForIndependentSynth();
      await this.waitForLeadFmWasmReady();
      this.applyManualAuditionMixStateForSources(sources, state);
    }

    if (sources.has('piano')) {
      await this.ensurePianoFocusSampleLoaded(focusMidi);
    }

    if (this.ctx?.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (error) {
        console.warn('Manual synth audition resume failed:', error);
      }
    }

    this.attachAudioContextMonitoring();
    this.unlockAudioContext();
  }

  private resetIndependentSynthContextState(): void {
    for (let i = 0; i < this.synthVoiceNoteOffTimers.length; i += 1) {
      const noteOffTimerId = this.synthVoiceNoteOffTimers[i];
      if (noteOffTimerId !== null) clearTimeout(noteOffTimerId);
      this.synthVoiceNoteOffTimers[i] = null;

      const restoreTimerId = this.manualPadRouteRestoreTimers[i];
      if (restoreTimerId !== null) clearTimeout(restoreTimerId);
      this.manualPadRouteRestoreTimers[i] = null;
    }

    for (const voice of Array.from(this.activePianoVoices)) {
      try { voice.source.stop(); } catch { /* ignore stale piano source */ }
      try { voice.source.disconnect(); } catch { /* ignore stale piano source */ }
      try { voice.gain.disconnect(); } catch { /* ignore stale piano gain */ }
      try { voice.filter?.disconnect(); } catch { /* ignore stale piano filter */ }
    }
    this.activePianoVoices.clear();

    if (this.padWasmNode) {
      try { this.padWasmNode.port.postMessage({ type: 'destroy' }); } catch { /* */ }
      try { this.padWasmNode.port.close(); } catch { /* */ }
      try { this.padWasmNode.disconnect(); } catch { /* */ }
      this.padWasmNode = null;
      this.padWasmReady = false;
      this.padWasmInitPromise = null;
    }

    if (this.leadFmWasmNode) {
      try { this.leadFmWasmNode.port.postMessage({ type: 'allNotesOff' }); } catch { /* */ }
      try { this.leadFmWasmNode.port.postMessage({ type: 'destroy' }); } catch { /* */ }
      try { this.leadFmWasmNode.port.close(); } catch { /* */ }
      try { this.leadFmWasmNode.disconnect(); } catch { /* */ }
      this.leadFmWasmNode = null;
      this.leadFmWasmReady = false;
    }

    this.disposeDriftNodes();
    this.disposeEndCompressorNodes();

    const synthNodeKeys = [
      'masterGain',
      'limiter',
      'satPreGain',
      'satWaveshaper',
      'satPostTone',
      'satPostGain',
      'reverbNode',
      'reverbOutputGain',
      'reverbInputBus',
      'synthBus',
      'dryBus',
      'pad1Bus',
      'pad2Bus',
      'pad1PreFaderBus',
      'pad2PreFaderBus',
      'pad1ReverbSend',
      'pad2ReverbSend',
      'synthDirect',
      'diffuseInputBus',
      'diffuseHighpass',
      'diffuseLowpass',
      'diffuseSpreadBus',
      'diffuseOutputGain',
      'diffuseReverbSend',
      'leadGain',
      'leadFilter',
      'leadDry',
      'lead1Bus',
      'lead2Bus',
      'lead1LevelGain',
      'lead2LevelGain',
      'leadWasmLevelGain',
      'leadWasmLead2LevelGain',
      'lead1ReverbSend',
      'lead2ReverbSend',
      'pianoBus',
      'pianoLevelGain',
      'pianoReverbSend',
      'pad1DelayASend',
      'pad1DelayBSend',
      'pad2DelayASend',
      'pad2DelayBSend',
      'lead1DelayASend',
      'lead1DelayBSend',
      'lead2DelayASend',
      'lead2DelayBSend',
      'pianoDelayASend',
      'pianoDelayBSend',
      'granularPad1Send',
      'granularPad2Send',
      'granularLead1Send',
      'granularLead2Send',
      'granularPianoSend',
    ] as const;

    for (const key of synthNodeKeys) {
      const node = this[key];
      if (node) {
        try { node.disconnect(); } catch { /* */ }
        this[key] = null;
      }
    }

    this.disposeVoiceSpatialChain(this.pad1SpatialChain);
    this.pad1SpatialChain = null;
    this.disposeVoiceSpatialChain(this.pad2SpatialChain);
    this.pad2SpatialChain = null;
    this.disposeVoiceSpatialChain(this.lead1SpatialChain);
    this.lead1SpatialChain = null;
    this.disposeVoiceSpatialChain(this.lead2SpatialChain);
    this.lead2SpatialChain = null;
    this.disposeVoiceSpatialChain(this.pianoSpatialChain);
    this.pianoSpatialChain = null;

    this.sharedDelayA?.dispose();
    this.sharedDelayA = null;
    this.sharedDelayB?.dispose();
    this.sharedDelayB = null;
    this.sharedDelayGranularLinksWired = false;
    this.lastMasterSatMode = null;
    this.lastPad2VoiceAssign = 0;
    this.voices = [];
    this.resetBootCapabilities();
    this.resetWorkletParamCaches();
  }

  private resetBootCapabilities(): void {
    this.bootCapabilities = {
      reverb: false,
      spectralFreeze: false,
      soundscapes: false,
      granular: false,
    };
  }

  private resetWorkletParamCaches(): void {
    this._prevReverbParams = null;
    this._prevSfFreeze = false;
    this._prevSfSlushy = false;
    this._prevSfSpeed = 0.3;
    this._prevSfMix = 1.0;
    this._prevSfDecay = 0;
    this._prevSfPhaseJitter = 0;
    this._sfParamsInitialized = false;
    this.currentSpectralFreezeRouting = null;
    this._messageSignatures.clear();
  }

  private getRequiredBootCapabilities(state: SliderState): BootCapabilities {
    const lead1RouteActive = this.isLead1RouteActive(state);
    const lead2RouteActive = this.isLead2RouteActive(state);
    const pianoRouteActive = this.isPianoRouteActive(state);
    return {
      reverb: !!state.reverbEnabled || !!state.spectralFreezeEnabled,
      spectralFreeze: !!state.spectralFreezeEnabled,
      soundscapes: !!state.waterEnabled || !!state.insectsEnabled || !!state.insects2Enabled,
      granular: this.isGranularBusArmed(state, lead1RouteActive, lead2RouteActive, pianoRouteActive),
    };
  }

  private hasRequiredBootCapabilities(state: SliderState): boolean {
    const required = this.getRequiredBootCapabilities(state);
    return (
      (!required.reverb || this.bootCapabilities.reverb) &&
      (!required.spectralFreeze || this.bootCapabilities.spectralFreeze) &&
      (!required.soundscapes || this.bootCapabilities.soundscapes) &&
      (!required.granular || this.bootCapabilities.granular)
    );
  }

  private async rebuildGraphForState(state: SliderState): Promise<void> {
    if (this.graphRebuildPromise) {
      return this.graphRebuildPromise;
    }

    this.graphRebuildPromise = (async () => {
      console.info('Rebuilding audio graph to enable deferred engines');
      this.forceHardGraphTeardown = true;
      try {
        this.stop();
      } finally {
        this.forceHardGraphTeardown = false;
      }

      const restartState = this.sourceSliderState ?? state;
      await this.start(restartState);
    })()
      .catch((error) => {
        console.error('Audio graph rebuild failed:', error);
      })
      .finally(() => {
        this.graphRebuildPromise = null;
      });

    return this.graphRebuildPromise;
  }

  private getManualPadTapDuration(state: SliderState, pad: 'pad1' | 'pad2'): number {
    const attack = Math.max(0.01, pad === 'pad2' ? (state.pad2Attack ?? 0.1) : (state.synthAttack ?? 0.1));
    const decay = Math.max(0.02, pad === 'pad2' ? (state.pad2Decay ?? 0.3) : (state.synthDecay ?? 0.3));
    return Math.max(0.16, Math.min(0.6, attack + decay * 0.75));
  }

  private getPadChordTriggerIntervalSeconds(state: SliderState): number {
    const phraseLength = this.getEffectiveHarmonyPhraseSeconds(state);
    return chordIntervalSecondsFromState(state.chordRate, phraseLength);
  }

  private getPadEnvelopeGateSeconds(
    state: SliderState,
    pad: 'pad1' | 'pad2',
    voiceDelaySeconds: number,
    triggerIntervalSeconds: number,
  ): number {
    const attack = Math.max(0.001, Math.min(16, pad === 'pad2' ? (state.pad2Attack ?? 6) : (state.synthAttack ?? 6)));
    const decay = Math.max(0.01, Math.min(8, pad === 'pad2' ? (state.pad2Decay ?? 1) : (state.synthDecay ?? 1)));
    const requestedHold = Math.max(0, Math.min(20, pad === 'pad2' ? (state.pad2Hold ?? 1) : (state.synthHold ?? 1)));
    const release = Math.max(0.01, Math.min(30, pad === 'pad2' ? (state.pad2Release ?? 12) : (state.synthRelease ?? 12)));
    const fit = pad === 'pad2' ? (state.pad2FitEnvelopeToChord ?? true) : (state.padFitEnvelopeToChord ?? true);
    let hold = requestedHold;
    if (fit) {
      const maxHold = triggerIntervalSeconds - voiceDelaySeconds - 0.05 - attack - decay - release;
      hold = Math.max(0, Math.min(requestedHold, maxHold));
    }
    return Math.max(0.02, Math.min(20, attack + decay + hold));
  }

  private isNonPadMelodicSource(source: string): boolean {
    return source === 'lead' || source === 'lead1' || source === 'lead2' || source === 'piano';
  }

  private getFxSourceStrength(
    bus: FxOwnershipBus,
    source: FxOwnershipSource,
    state: SliderState,
  ): number {
    const padState = this.getEffectivePadState(state);
    const lead1WetActive = this.isLead1RouteActive(state);
    const lead2WetActive = this.isLead2RouteActive(state);
    const pianoWetActive = this.isPianoRouteActive(state);
    const pad1Active = state.padEnabled !== false || this.euclideanUsesPadSource(state);
    const pad2Active = !!state.pad2Enabled;
    const granularBusArmed = this.isGranularBusArmed(state, lead1WetActive, lead2WetActive, pianoWetActive);

    switch (bus) {
      case 'delayA':
        switch (source) {
          case 'pad1': return pad1Active ? this.shv('pad1DelayASend', padState.pad1DelayASend ?? 0) : 0;
          case 'pad2': return pad2Active ? this.shv('pad2DelayASend', padState.pad2DelayASend ?? 0) : 0;
          case 'lead1': return lead1WetActive ? this.shv('lead1DelayASend', state.lead1DelayASend ?? 0) : 0;
          case 'lead2': return lead2WetActive ? this.shv('lead2DelayASend', state.lead2DelayASend ?? 0) : 0;
          case 'piano': return pianoWetActive ? this.shv('pianoDelayASend', state.pianoDelayASend ?? 0) : 0;
          case 'drum': return state.drumEnabled ? this.getDrumDelaySendProfile(state) * (state.drumDelayASend ?? 1) : 0;
        }
        break;
      case 'delayB':
        switch (source) {
          case 'pad1': return pad1Active ? this.shv('pad1DelayBSend', padState.pad1DelayBSend ?? 0) : 0;
          case 'pad2': return pad2Active ? this.shv('pad2DelayBSend', padState.pad2DelayBSend ?? 0) : 0;
          case 'lead1': return lead1WetActive ? this.shv('lead1DelayBSend', state.lead1DelayBSend ?? 0) : 0;
          case 'lead2': return lead2WetActive ? this.shv('lead2DelayBSend', state.lead2DelayBSend ?? 0) : 0;
          case 'piano': return pianoWetActive ? this.shv('pianoDelayBSend', state.pianoDelayBSend ?? 0) : 0;
          case 'drum': return state.drumEnabled ? (state.drumDelayBSend ?? 0) : 0;
        }
        break;
      case 'granular':
        if (!granularBusArmed) return 0;
        switch (source) {
          case 'pad1': return pad1Active ? this.shv('granularPad1Send', padState.granularPad1Send ?? 0) : 0;
          case 'pad2': return pad2Active ? this.shv('granularPad2Send', padState.granularPad2Send ?? 0) : 0;
          case 'lead1': return lead1WetActive ? this.shv('granularLead1Send', state.granularLead1Send ?? 0) : 0;
          case 'lead2': return lead2WetActive ? this.shv('granularLead2Send', state.granularLead2Send ?? 0) : 0;
          case 'piano': return pianoWetActive ? this.shv('granularPianoSend', state.granularPianoSend ?? 0) : 0;
          case 'drum': return state.drumEnabled ? (state.granularDrumSend ?? 0) : 0;
        }
        break;
      case 'reverb':
        if (!state.reverbEnabled) return 0;
        switch (source) {
          case 'pad1': return pad1Active ? this.shv('pad1ReverbSend', state.pad1ReverbSend ?? 0) : 0;
          case 'pad2': return pad2Active ? this.shv('pad2ReverbSend', state.pad2ReverbSend ?? 0) : 0;
          case 'lead1': return lead1WetActive ? this.shv('lead1ReverbSend', state.lead1ReverbSend ?? 0) : 0;
          case 'lead2': return lead2WetActive ? this.shv('lead2ReverbSend', state.lead2ReverbSend ?? 0) : 0;
          case 'piano': return pianoWetActive ? this.shv('pianoReverbSend', state.pianoReverbSend ?? 0) : 0;
          case 'drum': return state.drumEnabled ? (this.shSampledValues.drumReverbSend ?? state.drumReverbSend ?? 0) : 0;
        }
        break;
    }

    return 0;
  }

  private shouldTriggerOwnedFxBus(
    bus: FxOwnershipBus,
    source: FxOwnershipSource,
    strength: number,
    nowMs: number,
  ): boolean {
    const owner = this.fxBusOwners[bus];
    if (strength <= 0.0001) return false;
    if (owner.owner === source) return true;
    if (owner.owner === null || nowMs >= owner.expiresAtMs) return true;
    if (strength >= owner.strength + FX_OWNERSHIP_STEAL_MARGIN) return true;
    if (owner.strength > 0 && strength / owner.strength >= FX_OWNERSHIP_STEAL_RATIO) return true;
    if (owner.strength > 0 && strength / owner.strength >= FX_OWNERSHIP_RECENT_ONSET_RATIO) return true;
    return false;
  }

  private scheduleApplyParamsRefresh(): void {
    if (!this.sliderState) return;
    this._applyParamsDirty = true;
    if (this._applyParamsRaf === null) {
      this._applyParamsRaf = requestAnimationFrame(() => {
        this._applyParamsRaf = null;
        if (this._applyParamsDirty && this.sliderState) {
          this._applyParamsDirty = false;
          this.applyParams(this.sliderState);
        }
      });
    }
  }

  private async waitForWorkletReady(
    getNode: () => AudioWorkletNode | null,
    isReady: () => boolean,
    timeoutMs = 1000,
  ): Promise<void> {
    if (!getNode() || isReady()) return;
    const start = performance.now();
    while (getNode() && !isReady() && performance.now() - start < timeoutMs) {
      await new Promise((resolve) => window.setTimeout(resolve, 10));
    }
  }

  private async waitForStartupRuntimeReadiness(state: SliderState, timeoutMs = 1000): Promise<void> {
    const waits: Promise<void>[] = [];
    if (this.padWasmNode) waits.push(this.waitForPadWasmReady(timeoutMs));
    if (this.leadFmWasmNode) waits.push(this.waitForLeadFmWasmReady(timeoutMs));
    if (this.drumWasmNode) waits.push(this.waitForDrumWasmReady(timeoutMs));
    if (this.soundscapesNode && (state.waterEnabled || state.insectsEnabled || state.insects2Enabled)) {
      waits.push(this.waitForSoundscapesWasmReady(timeoutMs));
    }
    if (this.dynamicsDriftWorkletLoadPromise && this.dynamicsDriftWorkletLoadContext === this.ctx) {
      const loadPromise = this.dynamicsDriftWorkletLoadPromise;
      waits.push(Promise.race([
        loadPromise.then(() => undefined).catch(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, timeoutMs)),
      ]));
    }
    if (waits.length > 0) {
      await Promise.all(waits);
    }
  }

  private async preloadStartupEarthTextures(state: SliderState): Promise<void> {
    const textureLoads: Promise<AudioBuffer | null>[] = [];
    if (state.oceanSampleEnabled && this.oceanTexturePlayer) {
      textureLoads.push(this.oceanTexturePlayer.ensureLoaded());
    }
    if (state.birdsEnabled && this.birdsTexture) {
      textureLoads.push(this.birdsTexture.player.ensureLoaded());
    }
    if (state.birds2Enabled && this.birds2Texture) {
      textureLoads.push(this.birds2Texture.player.ensureLoaded());
    }
    if (state.frogsEnabled && this.frogsTexture) {
      textureLoads.push(this.frogsTexture.player.ensureLoaded());
    }
    if (textureLoads.length > 0) {
      await Promise.all(textureLoads);
    }
  }

  private resampleOwnedFxBus(bus: FxOwnershipBus): boolean {
    const positions: Record<string, number> = {};
    for (const key of Object.keys(this.dualRanges)) {
      if (this.getFxOwnershipBusForKey(key) !== bus) continue;
      this.sampleDualRangeKey(key, positions);
    }
    this.emitOwnedSamplePositions(positions);
    return Object.keys(positions).length > 0;
  }

  private getSharedDelayBState(
    state: SliderState,
    pad1Active: boolean,
    pad2Active: boolean,
    lead1RoutingActive: boolean,
    lead2RoutingActive: boolean,
    pianoRoutingActive: boolean,
    granularEnabled: boolean,
  ) {
    const now = this.ctx?.currentTime ?? 0;
    const delayBArmed = !!state.granularDelayEnabled;
    const oceanLayerActive = this.isOceanLayerFadeActive(state, now);
    const natureLayerActive = this.isNatureLayerFadeActive(state, now);
    const waterLayerActive = this.isWaterLayerFadeActive(state, now);
    const insectsLayerActive = this.isInsectsLayerFadeActive(state, now);
    const natureFamilySendScale = this.getNatureFamilySendScale(state);
    const waterFamilySendScale = this.getWaterFamilySendScale(state);
    const insectsFamilySendScale = this.getInsectsFamilySendScale(state);
    const spaceMode = computeGranularMacroModel(state, (key, fallback) => this.shv(key as string, fallback)).spaceMode;
    const delayBGranularReturn = delayBArmed ? this.shv('delayBGranularSend', state.delayBGranularSend ?? 0) : 0;
    const granularDelaySourceLevel =
      (delayBArmed && granularEnabled && delayBGranularReturn < 0.0001)
        ? (state.granularDelayBSend ?? 0)
        : 0;
    const padState = this.getEffectivePadState(state);
    const crossFeeds = this.getSafeDelayCrossFeedLevels(state);
    const delayBExternalFeedActive = delayBArmed && (
      (pad1Active && this.shv('pad1DelayBSend', padState.pad1DelayBSend ?? 0) > 0.0001) ||
      (pad2Active && this.shv('pad2DelayBSend', padState.pad2DelayBSend ?? 0) > 0.0001) ||
      (lead1RoutingActive && (state.lead1DelayBSend ?? 0) > 0.0001) ||
      (lead2RoutingActive && (state.lead2DelayBSend ?? 0) > 0.0001) ||
      (pianoRoutingActive && (state.pianoDelayBSend ?? 0) > 0.0001) ||
      (state.drumEnabled && (state.drumDelayBSend ?? 0) > 0.0001) ||
      (oceanLayerActive && (state.oceanDelayBSend ?? 0) > 0.0001) ||
      (natureLayerActive && this.scaleEarthSend(state.natureDelayBSend ?? 0, natureFamilySendScale) > 0.0001) ||
      (waterLayerActive && this.scaleEarthSend(state.waterDelayBSend ?? 0, waterFamilySendScale) > 0.0001) ||
      (insectsLayerActive && this.scaleEarthSend(state.insDelayBSend ?? 0, insectsFamilySendScale) > 0.0001) ||
      (crossFeeds.aToB > 0.0001)
    );
    const delayBEnabled = delayBArmed && (granularDelaySourceLevel > 0.0001 || delayBExternalFeedActive);

    return {
      delayBEnabled,
      granularDelaySourceLevel,
      params: {
        enabled: delayBEnabled,
        activity: this.shv('granularDelayActivity', state.granularDelayActivity ?? 0.3),
        repeats: this.shv('granularDelayRepeats', state.granularDelayRepeats ?? 0.3),
        noteDiv: this.shDelayDivision('granularDelayTime', (state.granularDelayTime as string) ?? '1/4'),
        tone: this.shv('granularDelayFilter', state.granularDelayFilter ?? 0.5),
        vibrato: this.shv('granularDelayVibrato', state.granularDelayVibrato ?? 0),
        mix: this.shv('granularDelayMix', state.granularDelayMix ?? 1.0),
        reverbSend: (delayBEnabled && state.reverbEnabled) ? this.shv('granularDelayReverbSend', state.granularDelayReverbSend ?? 0.4) : 0,
        granularSend: (delayBEnabled && granularDelaySourceLevel < 0.0001) ? this.shv('delayBGranularSend', state.delayBGranularSend ?? 0) : 0,
        toDelayA: delayBEnabled ? crossFeeds.bToA : 0,
        bpm: getSharedSequencerBpm(state),
        algorithm: state.delayBAlgorithm ?? 'clockedSpace',
        spaceMode,
        pattern: state.delayBPattern ?? 'cascade',
        warp: state.delayBWarp ?? 'clean',
        warpIntensity: this.shv('delayBWarpIntensity', state.delayBWarpIntensity ?? 0.5),
        spread: this.shv('delayBSpread', state.delayBSpread ?? 0.5),
        tapeSpacing: state.delayBTapeSpacing ?? 'even',
        tapeHeadEnabled: [
          state.delayBTapeHead1Enabled ?? true,
          state.delayBTapeHead2Enabled ?? true,
          state.delayBTapeHead3Enabled ?? true,
          state.delayBTapeHead4Enabled ?? true,
        ],
        tapeHeadLevels: [
          this.shv('delayBTapeHead1Level', state.delayBTapeHead1Level ?? 0.72),
          this.shv('delayBTapeHead2Level', state.delayBTapeHead2Level ?? 0.8),
          this.shv('delayBTapeHead3Level', state.delayBTapeHead3Level ?? 0.88),
          this.shv('delayBTapeHead4Level', state.delayBTapeHead4Level ?? 1),
        ],
        tapeHeadPans: [
          this.shv('delayBTapeHead1Pan', state.delayBTapeHead1Pan ?? 0.28),
          this.shv('delayBTapeHead2Pan', state.delayBTapeHead2Pan ?? 0.72),
          this.shv('delayBTapeHead3Pan', state.delayBTapeHead3Pan ?? 0.38),
          this.shv('delayBTapeHead4Pan', state.delayBTapeHead4Pan ?? 0.62),
        ],
      },
    };
  }

  private refreshOwnedFxBus(bus: FxOwnershipBus): void {
    if (!this.sliderState || !this.ctx) return;

    const state = this.getEffectivePadState(this.sliderState);
    const now = this.ctx.currentTime;
    const smoothTime = 0.015;
    const pad1Active = state.padEnabled !== false || this.euclideanUsesPadSource(state);
    const pad2Active = state.pad2Enabled ?? false;
    const lead1WetActive = this.isLead1RouteActive(state);
    const lead2WetActive = this.isLead2RouteActive(state);
    const pianoWetActive = this.isPianoRouteActive(state);
    const granularBusArmed = this.isGranularBusArmed(state, lead1WetActive, lead2WetActive, pianoWetActive);

    if (bus === 'delayB' || bus === 'delayA') {
      const delayBState = this.getSharedDelayBState(
        state,
        pad1Active,
        pad2Active,
        lead1WetActive,
        lead2WetActive,
        pianoWetActive,
        granularBusArmed,
      );
      if (bus === 'delayB') {
        this.sharedGranularDelayBSend?.gain.setTargetAtTime(delayBState.granularDelaySourceLevel, now, smoothTime);
        this.sharedDelayB?.update(delayBState.params, now, smoothTime);
        return;
      }

      const delayAState = this.getSharedDelayAState(
        state,
        lead1WetActive,
        lead2WetActive,
        pianoWetActive,
        granularBusArmed,
        delayBState.delayBEnabled,
      );
      this.sharedDelayA?.update(delayAState, now, smoothTime);
    }
  }

  private reportFxOnset(source: FxOwnershipSource, origin: FxOwnershipOrigin): void {
    if (!this.sliderState) return;

    const nowMs = performance.now();
    const buses: FxOwnershipBus[] = ['delayA', 'delayB', 'granular', 'reverb'];
    let shouldNotify = false;
    let shouldRefreshParams = false;
    for (const bus of buses) {
      const strength = this.getFxSourceStrength(bus, source, this.sliderState);
      if (!this.shouldTriggerOwnedFxBus(bus, source, strength, nowMs)) continue;
      const previous = this.fxBusOwners[bus];
      this.fxBusOwners[bus] = {
        owner: source,
        strength,
        expiresAtMs: nowMs + FX_OWNERSHIP_WINDOW_MS,
        lastOrigin: origin,
      };
      if (previous.owner !== source || previous.lastOrigin !== origin) {
        shouldNotify = true;
      }
      if (this.resampleOwnedFxBus(bus)) {
        shouldRefreshParams = true;
        this.refreshOwnedFxBus(bus);
      }
    }
    if (shouldRefreshParams) {
      this.scheduleApplyParamsRefresh();
    }
    if (shouldNotify) {
      this.notifyStateChange();
    }
  }

  private postCachedWorkletMessage(
    cacheKey: string,
    node: AudioWorkletNode | null,
    message: Record<string, unknown>,
    signatureSource: unknown = message,
  ): void {
    if (!node) return;
    const previousSignature = this._messageSignatures.get(cacheKey);
    if (previousSignature !== undefined && areSignatureSnapshotsEqual(previousSignature, signatureSource)) return;
    this._messageSignatures.set(cacheKey, cloneSignatureSnapshot(signatureSource));
    node.port.postMessage(message);
  }

  private ensureSharedDelayBuses(ctx: AudioContext): void {
    if (!this.masterGain || !this.reverbInputBus) return;

    if (!this.sharedDelayA) {
      const delayAOutput = this.getSidechainTargetInput(ctx, 'delayA', this.masterGain);
      this.sharedDelayA = new SharedDelayBusA(ctx, delayAOutput, this.reverbInputBus);
    }
    if (!this.sharedDelayB) {
      const delayBOutput = this.getSidechainTargetInput(ctx, 'delayB', this.masterGain);
      this.sharedDelayB = new SharedDelayBusB(ctx, delayBOutput, this.reverbInputBus);
      this.sharedDelayA.connectDelayBInput(this.sharedDelayB.input);
      this.sharedDelayB.connectDelayAInput(this.sharedDelayA.input);
    }
    if (this.granularFxInputGain && !this.sharedDelayGranularLinksWired) {
      this.sharedDelayA.connectGranularInput(this.granularFxInputGain);
      this.sharedDelayB.connectGranularInput(this.granularFxInputGain);
      this.sharedDelayGranularLinksWired = true;
    }
  }

  private ensureTappedSend(
    ctx: AudioContext,
    current: GainNode | null,
    connectSource: (gain: GainNode) => void,
    target: AudioNode | null,
  ): GainNode | null {
    if (!target) return current;
    if (!current) {
      current = ctx.createGain();
      current.gain.value = 0;
      connectSource(current);
      current.connect(target);
    }
    return current;
  }

  private ensurePadDelaySends(ctx: AudioContext): void {
    if (this.sharedDelayA) {
      this.pad1DelayASend = this.ensureTappedSend(ctx, this.pad1DelayASend, (gain) => {
        this.pad1PreFaderBus?.connect(gain);
        if (this.padWasmNode) this.padWasmNode.connect(gain, 2);
      }, this.sharedDelayA.input);
      this.pad2DelayASend = this.ensureTappedSend(ctx, this.pad2DelayASend, (gain) => {
        this.pad2PreFaderBus?.connect(gain);
        if (this.padWasmNode) this.padWasmNode.connect(gain, 3);
      }, this.sharedDelayA.input);
    }
    if (this.sharedDelayB) {
      this.pad1DelayBSend = this.ensureTappedSend(ctx, this.pad1DelayBSend, (gain) => {
        this.pad1PreFaderBus?.connect(gain);
        if (this.padWasmNode) this.padWasmNode.connect(gain, 2);
      }, this.sharedDelayB.input);
      this.pad2DelayBSend = this.ensureTappedSend(ctx, this.pad2DelayBSend, (gain) => {
        this.pad2PreFaderBus?.connect(gain);
        if (this.padWasmNode) this.padWasmNode.connect(gain, 3);
      }, this.sharedDelayB.input);
    }
  }

  private ensureLeadDelaySends(ctx: AudioContext): void {
    if (this.sharedDelayA) {
      this.lead1DelayASend = this.ensureTappedSend(ctx, this.lead1DelayASend, (gain) => {
        this.lead1Bus?.connect(gain);
      }, this.sharedDelayA.input);
      this.lead2DelayASend = this.ensureTappedSend(ctx, this.lead2DelayASend, (gain) => {
        this.lead2Bus?.connect(gain);
      }, this.sharedDelayA.input);
    }
    if (this.sharedDelayB) {
      this.lead1DelayBSend = this.ensureTappedSend(ctx, this.lead1DelayBSend, (gain) => {
        this.lead1Bus?.connect(gain);
      }, this.sharedDelayB.input);
      this.lead2DelayBSend = this.ensureTappedSend(ctx, this.lead2DelayBSend, (gain) => {
        this.lead2Bus?.connect(gain);
      }, this.sharedDelayB.input);
    }
  }

  private ensurePianoDelaySends(ctx: AudioContext): void {
    if (this.sharedDelayA) {
      this.pianoDelayASend = this.ensureTappedSend(ctx, this.pianoDelayASend, (gain) => {
        this.pianoBus?.connect(gain);
      }, this.sharedDelayA.input);
    }
    if (this.sharedDelayB) {
      this.pianoDelayBSend = this.ensureTappedSend(ctx, this.pianoDelayBSend, (gain) => {
        this.pianoBus?.connect(gain);
      }, this.sharedDelayB.input);
    }
  }

  private ensureGranularDelaySends(ctx: AudioContext): void {
    const granularDelaySource = (this.granularFxOutputLPF ?? this.granularFxNode) as AudioNode | null;
    if (this.sharedDelayA && granularDelaySource) {
      this.granularDelayASend = this.ensureTappedSend(ctx, this.granularDelayASend, (gain) => {
        granularDelaySource.connect(gain);
      }, this.sharedDelayA.input);
    }
    if (this.sharedDelayB && granularDelaySource) {
      this.sharedGranularDelayBSend = this.ensureTappedSend(ctx, this.sharedGranularDelayBSend, (gain) => {
        granularDelaySource.connect(gain);
      }, this.sharedDelayB.input);
    }
  }

  private ensureEarthDelaySends(ctx: AudioContext): void {
    if (this.sharedDelayA) {
      this.oceanDelayASend = this.ensureTappedSend(ctx, this.oceanDelayASend, (gain) => {
        this.oceanPreFaderBus?.connect(gain);
      }, this.sharedDelayA.input);
      this.waterDelayASend = this.ensureTappedSend(ctx, this.waterDelayASend, (gain) => {
        this.waterPreFaderBus?.connect(gain);
      }, this.sharedDelayA.input);
      this.insectsDelayASend = this.ensureTappedSend(ctx, this.insectsDelayASend, (gain) => {
        this.insectsPreFaderBus?.connect(gain);
      }, this.sharedDelayA.input);
      this.birdsTexture = this.ensureEarthTextureDelaySend(ctx, this.birdsTexture, 'A');
      this.birds2Texture = this.ensureEarthTextureDelaySend(ctx, this.birds2Texture, 'A');
      this.frogsTexture = this.ensureEarthTextureDelaySend(ctx, this.frogsTexture, 'A');
    }
    if (this.sharedDelayB) {
      this.oceanDelayBSend = this.ensureTappedSend(ctx, this.oceanDelayBSend, (gain) => {
        this.oceanPreFaderBus?.connect(gain);
      }, this.sharedDelayB.input);
      this.waterDelayBSend = this.ensureTappedSend(ctx, this.waterDelayBSend, (gain) => {
        this.waterPreFaderBus?.connect(gain);
      }, this.sharedDelayB.input);
      this.insectsDelayBSend = this.ensureTappedSend(ctx, this.insectsDelayBSend, (gain) => {
        this.insectsPreFaderBus?.connect(gain);
      }, this.sharedDelayB.input);
      this.birdsTexture = this.ensureEarthTextureDelaySend(ctx, this.birdsTexture, 'B');
      this.birds2Texture = this.ensureEarthTextureDelaySend(ctx, this.birds2Texture, 'B');
      this.frogsTexture = this.ensureEarthTextureDelaySend(ctx, this.frogsTexture, 'B');
    }
  }

  private ensureEarthGranularSends(ctx: AudioContext): void {
    if (!this.granularFxInputGain) return;
    this.birdsTexture = this.ensureEarthTextureGranularSend(ctx, this.birdsTexture);
    this.birds2Texture = this.ensureEarthTextureGranularSend(ctx, this.birds2Texture);
    this.frogsTexture = this.ensureEarthTextureGranularSend(ctx, this.frogsTexture);
  }

  private ensureEarthTextureDelaySend(
    ctx: AudioContext,
    runtime: EarthTextureRuntime | null,
    bus: 'A' | 'B',
  ): EarthTextureRuntime | null {
    if (!runtime) return runtime;
    const destination = bus === 'A' ? this.sharedDelayA?.input ?? null : this.sharedDelayB?.input ?? null;
    if (!destination) return runtime;

    if (bus === 'A') {
      runtime.delayASend = this.ensureTappedSend(ctx, runtime.delayASend, (gain) => {
        runtime.preFaderBus.connect(gain);
      }, destination);
      if (runtime.delayASend && this.natureDelayASendTap) runtime.delayASend.connect(this.natureDelayASendTap);
    } else {
      runtime.delayBSend = this.ensureTappedSend(ctx, runtime.delayBSend, (gain) => {
        runtime.preFaderBus.connect(gain);
      }, destination);
      if (runtime.delayBSend && this.natureDelayBSendTap) runtime.delayBSend.connect(this.natureDelayBSendTap);
    }
    return runtime;
  }

  private ensureEarthTextureGranularSend(
    ctx: AudioContext,
    runtime: EarthTextureRuntime | null,
  ): EarthTextureRuntime | null {
    if (!runtime || !this.granularFxInputGain) return runtime;
    runtime.granularSend = this.ensureTappedSend(ctx, runtime.granularSend, (gain) => {
      runtime.preFaderBus.connect(gain);
    }, this.granularFxInputGain);
    if (runtime.granularSend && this.natureGranularSendTap) runtime.granularSend.connect(this.natureGranularSendTap);
    return runtime;
  }

  private createHaasWidenedBus(
    ctx: AudioContext,
    input: AudioNode,
    options: {
      delayMs: number;
      sideGain: number;
      centerGain: number;
      pan?: number;
    },
  ): GainNode {
    const output = ctx.createGain();
    output.gain.value = 1;

    const center = ctx.createGain();
    center.gain.value = options.centerGain;
    input.connect(center);
    center.connect(output);

    const panAmount = options.pan ?? 1;

    const leftGain = ctx.createGain();
    leftGain.gain.value = options.sideGain;
    const leftPanner = ctx.createStereoPanner();
    leftPanner.pan.value = -panAmount;
    input.connect(leftGain);
    leftGain.connect(leftPanner);
    leftPanner.connect(output);

    const rightDelay = ctx.createDelay(0.05);
    rightDelay.delayTime.value = Math.max(0, Math.min(0.05, options.delayMs / 1000));
    const rightGain = ctx.createGain();
    rightGain.gain.value = options.sideGain;
    const rightPanner = ctx.createStereoPanner();
    rightPanner.pan.value = panAmount;
    input.connect(rightDelay);
    rightDelay.connect(rightGain);
    rightGain.connect(rightPanner);
    rightPanner.connect(output);

    return output;
  }

  private getReverbSendDestination(): AudioNode | null {
    return this.reverbInputBus ?? this.reverbNode ?? null;
  }

  private createStereoWidthProcessor(ctx: AudioContext, initialWidth = 1): StereoWidthProcessor {
    const input = ctx.createGain();
    input.gain.value = 1;
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    const output = ctx.createGain();
    output.gain.value = 1;
    const leftDirectGain = ctx.createGain();
    const rightDirectGain = ctx.createGain();
    const leftCrossGain = ctx.createGain();
    const rightCrossGain = ctx.createGain();

    input.connect(splitter);
    splitter.connect(leftDirectGain, 0);
    leftDirectGain.connect(merger, 0, 0);
    splitter.connect(rightCrossGain, 1);
    rightCrossGain.connect(merger, 0, 0);
    splitter.connect(leftCrossGain, 0);
    leftCrossGain.connect(merger, 0, 1);
    splitter.connect(rightDirectGain, 1);
    rightDirectGain.connect(merger, 0, 1);
    merger.connect(output);

    const processor: StereoWidthProcessor = {
      input,
      splitter,
      merger,
      output,
      leftDirectGain,
      rightDirectGain,
      leftCrossGain,
      rightCrossGain,
    };
    this.setStereoWidthProcessor(processor, initialWidth);
    return processor;
  }

  private setStereoWidthProcessor(
    processor: StereoWidthProcessor | null,
    width: number,
    now?: number,
    smoothTime = 0.05,
  ): void {
    if (!processor) return;
    const safeWidth = clampVal(width, 0, 1);
    const direct = 0.5 * (1 + safeWidth);
    const cross = 0.5 * (1 - safeWidth);
    const apply = (param: AudioParam, value: number) => {
      if (now == null) {
        param.value = value;
      } else {
        param.setTargetAtTime(value, now, smoothTime);
      }
    };
    apply(processor.leftDirectGain.gain, direct);
    apply(processor.rightDirectGain.gain, direct);
    apply(processor.leftCrossGain.gain, cross);
    apply(processor.rightCrossGain.gain, cross);
  }

  private disposeStereoWidthProcessor(processor: StereoWidthProcessor | null): void {
    if (!processor) return;
    try { processor.input.disconnect(); } catch { /* ignore stale stereo width input */ }
    try { processor.splitter.disconnect(); } catch { /* ignore stale stereo width splitter */ }
    try { processor.leftDirectGain.disconnect(); } catch { /* ignore stale stereo width gain */ }
    try { processor.rightDirectGain.disconnect(); } catch { /* ignore stale stereo width gain */ }
    try { processor.leftCrossGain.disconnect(); } catch { /* ignore stale stereo width gain */ }
    try { processor.rightCrossGain.disconnect(); } catch { /* ignore stale stereo width gain */ }
    try { processor.merger.disconnect(); } catch { /* ignore stale stereo width merger */ }
    try { processor.output.disconnect(); } catch { /* ignore stale stereo width output */ }
  }

  private ensureDiffuseBus(ctx: AudioContext): void {
    if (this.diffuseInputBus || !this.masterGain) return;
    const reverbDestination = this.getReverbSendDestination();

    this.diffuseInputBus = ctx.createGain();
    this.diffuseInputBus.gain.value = 1;
    this.diffuseHighpass = ctx.createBiquadFilter();
    this.diffuseHighpass.type = 'highpass';
    this.diffuseHighpass.frequency.value = 180;
    this.diffuseHighpass.Q.value = 0.7;
    this.diffuseLowpass = ctx.createBiquadFilter();
    this.diffuseLowpass.type = 'lowpass';
    this.diffuseLowpass.frequency.value = 7200;
    this.diffuseLowpass.Q.value = 0.7;
    this.diffuseSpreadBus = this.createHaasWidenedBus(ctx, this.diffuseLowpass, {
      delayMs: 14,
      sideGain: 0.28,
      centerGain: 0.78,
      pan: 1,
    });
    this.diffuseOutputGain = ctx.createGain();
    this.diffuseOutputGain.gain.value = 0.22;
    this.diffuseReverbSend = ctx.createGain();
    this.diffuseReverbSend.gain.value = 0.18;

    this.diffuseInputBus.connect(this.diffuseHighpass);
    this.diffuseHighpass.connect(this.diffuseLowpass);
    this.diffuseSpreadBus.connect(this.diffuseOutputGain);
    this.diffuseOutputGain.connect(this.masterGain);
    if (reverbDestination) {
      this.diffuseSpreadBus.connect(this.diffuseReverbSend);
      this.diffuseReverbSend.connect(reverbDestination);
    }
  }

  private createVoiceSpatialChain(
    ctx: AudioContext,
    options: {
      initialPostLpf: number;
      initialStereoWidth: number;
      initialDiffuseSend: number;
      dryDestination: AudioNode;
      postLpfSlope?: 12 | 24;
    },
  ): VoiceSpatialChain {
    this.ensureDiffuseBus(ctx);
    const postLpf = ctx.createBiquadFilter();
    postLpf.type = 'lowpass';
    postLpf.frequency.value = options.initialPostLpf;
    postLpf.Q.value = 0.7;
    const postLpfStage2 = options.postLpfSlope === 24 ? ctx.createBiquadFilter() : null;
    if (postLpfStage2) {
      postLpfStage2.type = 'lowpass';
      postLpfStage2.frequency.value = options.initialPostLpf;
      postLpfStage2.Q.value = 0.7;
    }
    const width = this.createStereoWidthProcessor(ctx, options.initialStereoWidth);
    const diffuseSend = ctx.createGain();
    diffuseSend.gain.value = options.initialDiffuseSend;

    if (postLpfStage2) {
      postLpf.connect(postLpfStage2);
      postLpfStage2.connect(width.input);
    } else {
      postLpf.connect(width.input);
    }
    width.output.connect(options.dryDestination);
    if (this.diffuseInputBus) {
      width.output.connect(diffuseSend);
      diffuseSend.connect(this.diffuseInputBus);
    }

    return {
      postLpf,
      postLpfStage2,
      width,
      diffuseSend,
      output: width.output,
    };
  }

  private disposeVoiceSpatialChain(chain: VoiceSpatialChain | null): void {
    if (!chain) return;
    try { chain.postLpf.disconnect(); } catch { /* ignore stale spatial filter */ }
    try { chain.postLpfStage2?.disconnect(); } catch { /* ignore stale spatial filter */ }
    try { chain.diffuseSend.disconnect(); } catch { /* ignore stale diffuse send */ }
    this.disposeStereoWidthProcessor(chain.width);
  }

  private setVoiceSpatialChainState(
    chain: VoiceSpatialChain | null,
    options: {
      active: boolean;
      postLpf: number;
      stereoWidth: number;
      diffuseSend: number;
      now: number;
      smoothTime: number;
    },
  ): void {
    if (!chain) return;
    const activeWidth = options.active ? options.stereoWidth : 1;
    const activeDiffuse = options.active ? options.diffuseSend : 0;
    chain.postLpf.frequency.setTargetAtTime(options.postLpf, options.now, options.smoothTime);
    chain.postLpfStage2?.frequency.setTargetAtTime(options.postLpf, options.now, options.smoothTime);
    chain.diffuseSend.gain.setTargetAtTime(activeDiffuse, options.now, options.smoothTime);
    this.setStereoWidthProcessor(chain.width, activeWidth, options.now, options.smoothTime);
  }

  private applyFilterKeyTracking(baseCutoff: number, noteFreq: number, amount: number): number {
    const safeCutoff = Number.isFinite(baseCutoff) ? baseCutoff : 18000;
    const safeAmount = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0));
    if (safeAmount <= 0.0001) return safeCutoff;
    const safeFreq = Number.isFinite(noteFreq) && noteFreq > 0 ? noteFreq : 261.6255653005986;
    const ratio = Math.max(0.125, Math.min(8, safeFreq / 261.6255653005986));
    return Math.max(20, Math.min(20000, safeCutoff * Math.pow(ratio, safeAmount)));
  }

  private getLeadPostLpfCutoff(state: SliderState, lead: 'lead1' | 'lead2'): number {
    const isLead2 = lead === 'lead2';
    const baseKey = isLead2 ? 'lead2PostLPF' : 'lead1PostLPF';
    const trackingKey = isLead2 ? 'lead2PostLPFKeyTracking' : 'lead1PostLPFKeyTracking';
    const noteFreq = isLead2 ? this.lead2PostLpfTrackingFreq : this.lead1PostLpfTrackingFreq;
    const baseCutoff = applyDistanceValue(baseKey, state, lead);
    const trackingBase = isLead2 ? state.lead2PostLPFKeyTracking : state.lead1PostLPFKeyTracking;
    const tracking = this.shv(trackingKey, trackingBase ?? 0);
    return this.applyFilterKeyTracking(baseCutoff, noteFreq, tracking);
  }

  private updateLeadPostLpfForNote(lead: 'lead1' | 'lead2', frequency: number): void {
    if (!this.ctx || !this.sliderState) return;
    if (lead === 'lead2') {
      this.lead2PostLpfTrackingFreq = frequency;
    } else {
      this.lead1PostLpfTrackingFreq = frequency;
    }
    const chain = lead === 'lead2' ? this.lead2SpatialChain : this.lead1SpatialChain;
    const cutoff = this.getLeadPostLpfCutoff(this.sliderState, lead);
    chain?.postLpf.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.01);
    chain?.postLpfStage2?.frequency.setTargetAtTime(cutoff, this.ctx.currentTime, 0.01);
  }

  private createEarthTextureRuntime(
    ctx: AudioContext,
    config: {
      fileName: string;
      sliceDuration: number;
      fadeTime: number;
      density: number;
      randomSeed?: string | null;
      delayMs: number;
      sideGain: number;
      centerGain: number;
      initialLevel: number;
      initialReverbSend: number;
      dryDestination: AudioNode;
      parityDryBypass?: boolean;
      parityDeterministic?: boolean;
    },
  ): EarthTextureRuntime {
    const sourceBus = ctx.createGain();
    sourceBus.gain.value = 1;
    const gateGain = ctx.createGain();
    gateGain.gain.value = 0;
    sourceBus.connect(gateGain);
    const preFaderBus = config.parityDryBypass === true
      ? ctx.createGain()
      : this.createHaasWidenedBus(ctx, gateGain, {
          delayMs: config.delayMs,
          sideGain: config.sideGain,
          centerGain: config.centerGain,
        });
    if (config.parityDryBypass === true) {
      preFaderBus.gain.value = 1;
      gateGain.connect(preFaderBus);
    }
    const levelGain = ctx.createGain();
    levelGain.gain.value = config.initialLevel;
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = config.initialReverbSend;

    preFaderBus.connect(levelGain);
    levelGain.connect(config.dryDestination);
    preFaderBus.connect(reverbSend);
    reverbSend.connect(this.reverbInputBus!);

    const player = new EarthTexturePlayer(ctx, sourceBus, {
      fileName: config.fileName,
      sliceDuration: config.sliceDuration,
      fadeTime: config.fadeTime,
      density: config.density,
      randomSeed: config.randomSeed,
      parityDeterministic: config.parityDeterministic,
    });

    return {
      player,
      sourceBus,
      gateGain,
      preFaderBus,
      levelGain,
      reverbSend,
      delayASend: null,
      delayBSend: null,
      granularSend: null,
      fadeState: createEarthFadeState(),
    };
  }

  private destroyEarthTextureRuntime(runtime: EarthTextureRuntime | null): null {
    if (!runtime) return null;
    this.clearEarthFadeStopTimer(runtime.fadeState);
    runtime.player.dispose();
    try { runtime.levelGain.disconnect(); } catch { /* */ }
    try { runtime.reverbSend.disconnect(); } catch { /* */ }
    try { runtime.delayASend?.disconnect(); } catch { /* */ }
    try { runtime.delayBSend?.disconnect(); } catch { /* */ }
    try { runtime.granularSend?.disconnect(); } catch { /* */ }
    try { runtime.preFaderBus.disconnect(); } catch { /* */ }
    try { runtime.gateGain.disconnect(); } catch { /* */ }
    try { runtime.sourceBus.disconnect(); } catch { /* */ }
    return null;
  }

  private clearEarthFadeStopTimer(fadeState: EarthFadeState): void {
    if (fadeState.stopTimer !== null) {
      clearTimeout(fadeState.stopTimer);
      fadeState.stopTimer = null;
    }
  }

  private resetEarthFadeState(fadeState: EarthFadeState): void {
    this.clearEarthFadeStopTimer(fadeState);
    fadeState.initialized = false;
    fadeState.targetEnabled = false;
    fadeState.from = 0;
    fadeState.to = 0;
    fadeState.rampStartTime = 0;
    fadeState.rampEndTime = 0;
  }

  private getEarthFadeValue(fadeState: EarthFadeState, now: number): number {
    if (!fadeState.initialized) return 0;
    if (fadeState.rampEndTime <= fadeState.rampStartTime) return fadeState.to;
    if (now <= fadeState.rampStartTime) return fadeState.from;
    if (now >= fadeState.rampEndTime) return fadeState.to;
    const progress = (now - fadeState.rampStartTime) / (fadeState.rampEndTime - fadeState.rampStartTime);
    return fadeState.from + (fadeState.to - fadeState.from) * progress;
  }

  private isEarthFadeActive(fadeState: EarthFadeState, now: number): boolean {
    return fadeState.targetEnabled || this.getEarthFadeValue(fadeState, now) > 0.0001;
  }

  private isOceanLayerFadeActive(state: SliderState, now = this.ctx?.currentTime ?? 0): boolean {
    return !!state.oceanSampleEnabled || this.isEarthFadeActive(this.oceanFadeState, now);
  }

  private isNatureLayerFadeActive(state: SliderState, now = this.ctx?.currentTime ?? 0): boolean {
    return (
      !!state.birdsEnabled ||
      !!state.birds2Enabled ||
      !!state.frogsEnabled ||
      (this.birdsTexture ? this.isEarthFadeActive(this.birdsTexture.fadeState, now) : false) ||
      (this.birds2Texture ? this.isEarthFadeActive(this.birds2Texture.fadeState, now) : false) ||
      (this.frogsTexture ? this.isEarthFadeActive(this.frogsTexture.fadeState, now) : false)
    );
  }

  private isWaterLayerFadeActive(state: SliderState, now = this.ctx?.currentTime ?? 0): boolean {
    return !!state.waterEnabled || this.isEarthFadeActive(this.waterFadeState, now);
  }

  private isInsectsLayerFadeActive(state: SliderState, now = this.ctx?.currentTime ?? 0): boolean {
    return (
      !!state.insectsEnabled ||
      !!state.insects2Enabled ||
      this.isEarthFadeActive(this.insects1FadeState, now) ||
      this.isEarthFadeActive(this.insects2FadeState, now)
    );
  }

  private getEarthLayerOutputScale(level: number | undefined, masterLevel = 1): number {
    return Math.max(0, level ?? 0) * Math.max(0, masterLevel);
  }

  private createEarthTextureSeed(layer: string, state: SliderState | null | undefined = this.sliderState): string {
    const seedWindow = state?.seedWindow === 'day' ? 'day' : 'hour';
    const seedValue = (state as unknown as Record<string, unknown> | null | undefined)?.seed;
    const seed = Number.isFinite(Number(seedValue)) ? Math.trunc(Number(seedValue)) : 42;
    return `${getUtcBucket(seedWindow)}|${seed}|earth-texture|${layer}`;
  }

  private isSoundscapeParityFixture(state: SliderState | null | undefined = this.sliderState): boolean {
    return (state as unknown as Record<string, unknown> | null | undefined)?.soundscapeParityFixture === true;
  }

  private getFiniteStateNumber(
    state: SliderState | null | undefined,
    key: keyof SliderState | string,
    fallback: number,
  ): number {
    const value = (state as unknown as Record<string, unknown> | null | undefined)?.[key as string];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private getBoundedStateNumber(
    state: SliderState | null | undefined,
    key: keyof SliderState | string,
    fallback: number,
    min: number,
    max: number,
  ): number {
    return Math.max(min, Math.min(max, this.getFiniteStateNumber(state, key, fallback)));
  }

  private getWaterSoundscapePresetIndex(state: SliderState | null | undefined): number {
    const presetA = Math.round(this.getBoundedStateNumber(state, 'waterMorphA', this.getFiniteStateNumber(state, 'waterPreset', 0), 0, 7));
    const presetB = Math.round(this.getBoundedStateNumber(state, 'waterMorphB', this.getFiniteStateNumber(state, 'waterPreset', presetA), 0, 7));
    const morph = this.getBoundedStateNumber(state, 'waterMorph', 0, 0, 1);
    return morph < 0.5 ? presetA : presetB;
  }

  private resolveWaterSoundscapeState(state: SliderState): WaterPresetState {
    const presetA = Math.round(this.getBoundedStateNumber(state, 'waterMorphA', this.getFiniteStateNumber(state, 'waterPreset', 0), 0, 7));
    const presetB = Math.round(this.getBoundedStateNumber(state, 'waterMorphB', this.getFiniteStateNumber(state, 'waterPreset', presetA), 0, 7));
    const morph = this.getBoundedStateNumber(state, 'waterMorph', 0, 0, 1);
    const resolved = { ...morphWaterPresets(presetA, presetB, morph) };
    const stateRecord = state as unknown as Record<string, unknown>;
    for (const key of WATER_MORPH_PARAM_KEYS) {
      const value = stateRecord[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  private scaleEarthSend(send: number | undefined, levelScale: number): number {
    const safeSend = Math.max(0, send ?? 0);
    if (safeSend <= 0.0001 || levelScale <= 0.0001) return 0;
    return safeSend * levelScale;
  }

  private getNatureFamilySendScale(state: SliderState): number {
    return this.getEarthLayerOutputScale(
      Math.max(state.birdsLevel ?? 0, state.birds2Level ?? 0, state.frogsLevel ?? 0),
      state.natureLevel ?? 1,
    );
  }

  private getWaterFamilySendScale(state: SliderState): number {
    return Math.max(0, state.waterLevel ?? 0);
  }

  private getInsectsSharedMasterScale(state: SliderState): number {
    return Math.max(0, state.insectsSharedLevel ?? 1);
  }

  private getInsectsFamilySendScale(state: SliderState): number {
    return this.getEarthLayerOutputScale(
      Math.max(state.insectsLevel ?? 0, state.insects2Level ?? 0),
      this.getInsectsSharedMasterScale(state),
    );
  }

  private syncEarthFadeState(
    fadeState: EarthFadeState,
    enabled: boolean,
    now: number,
    handlers: {
      onInit: (target: number) => void;
      onTransition: (current: number, target: number, endTime: number) => void;
      onFadeOutComplete?: () => void;
    },
  ): void {
    if (!fadeState.initialized) {
      this.clearEarthFadeStopTimer(fadeState);
      const target = enabled ? 1 : 0;
      fadeState.initialized = true;
      fadeState.targetEnabled = enabled;
      fadeState.from = target;
      fadeState.to = target;
      fadeState.rampStartTime = now;
      fadeState.rampEndTime = now;
      handlers.onInit(target);
      return;
    }

    if (fadeState.targetEnabled === enabled) return;

    const current = this.getEarthFadeValue(fadeState, now);
    const target = enabled ? 1 : 0;
    const endTime = now + EARTH_LAYER_FADE_SECONDS;

    this.clearEarthFadeStopTimer(fadeState);
    fadeState.targetEnabled = enabled;
    fadeState.from = current;
    fadeState.to = target;
    fadeState.rampStartTime = now;
    fadeState.rampEndTime = endTime;
    handlers.onTransition(current, target, endTime);

    if (!enabled && handlers.onFadeOutComplete) {
      fadeState.stopTimer = window.setTimeout(() => {
        fadeState.stopTimer = null;
        if (!fadeState.targetEnabled) handlers.onFadeOutComplete?.();
      }, EARTH_LAYER_FADE_MS);
    }
  }

  private setAudioParamImmediate(param: AudioParam | null | undefined, value: number, now: number): void {
    if (!param) return;
    param.cancelScheduledValues(now);
    param.setValueAtTime(value, now);
  }

  private rampAudioParam(
    param: AudioParam | null | undefined,
    current: number,
    target: number,
    now: number,
    endTime: number,
  ): void {
    if (!param) return;
    param.cancelScheduledValues(now);
    param.setValueAtTime(current, now);
    param.linearRampToValueAtTime(target, endTime);
  }

  private getDrumDelaySendProfile(state: SliderState): number {
    const sends = [
      state.drumSubDelaySend,
      state.drumKickDelaySend,
      state.drumClickDelaySend,
      state.drumBeepHiDelaySend,
      state.drumBeepLoDelaySend,
      state.drumNoiseDelaySend,
      state.drumMembraneDelaySend,
    ].map(value => Math.max(0, Math.min(1, value ?? 0)));
    const average = sends.reduce((sum, value) => sum + value, 0) / sends.length;
    const peak = Math.max(...sends, 0);
    return Math.max(0, Math.min(1, peak * 0.5 + average * 0.5));
  }

  private createMasterLimiter(ctx: AudioContext): DynamicsCompressorNode {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    return limiter;
  }

  private createSharedReverbPreCompressor(ctx: AudioContext): DynamicsCompressorNode {
    const compressor = ctx.createDynamicsCompressor();
    // Gentle bus shaping: reduce the dry hit that reaches the tank, then let a
    // small makeup gain feed a denser, more even bloom into the reverb.
    compressor.threshold.value = this.sliderState?.reverbPreCompThreshold ?? DEFAULT_REVERB_PRE_COMP.threshold;
    compressor.knee.value = this.sliderState?.reverbPreCompKnee ?? DEFAULT_REVERB_PRE_COMP.knee;
    compressor.ratio.value = this.sliderState?.reverbPreCompRatio ?? DEFAULT_REVERB_PRE_COMP.ratio;
    compressor.attack.value = (this.sliderState?.reverbPreCompAttackMs ?? DEFAULT_REVERB_PRE_COMP.attackMs) / 1000;
    compressor.release.value = (this.sliderState?.reverbPreCompReleaseMs ?? DEFAULT_REVERB_PRE_COMP.releaseMs) / 1000;
    return compressor;
  }

  private ensureMasterSaturationNodes(ctx: AudioContext): void {
    if (this.satPreGain && this.satPreGain.context !== ctx) {
      try { this.satPreGain.disconnect(); } catch { /* */ }
      this.satPreGain = null;
    }
    if (!this.satPreGain) {
      this.satPreGain = ctx.createGain();
      this.satPreGain.gain.value = 1;
    }
    if (this.satWaveshaper && this.satWaveshaper.context !== ctx) {
      try { this.satWaveshaper.disconnect(); } catch { /* */ }
      this.satWaveshaper = null;
      this.lastMasterSatMode = null;
    }
    if (!this.satWaveshaper) {
      this.satWaveshaper = ctx.createWaveShaper();
      this.satWaveshaper.curve = makeMasterSaturationCurve('linear');
      this.satWaveshaper.oversample = 'none';
      this.lastMasterSatMode = 'linear';
    }
    if (this.satPostTone && this.satPostTone.context !== ctx) {
      try { this.satPostTone.disconnect(); } catch { /* */ }
      this.satPostTone = null;
    }
    if (!this.satPostTone) {
      this.satPostTone = ctx.createBiquadFilter();
      this.satPostTone.type = 'peaking';
      this.satPostTone.frequency.value = 3000;
      this.satPostTone.Q.value = 0.5;
      this.satPostTone.gain.value = 0;
    }
    if (this.satPostGain && this.satPostGain.context !== ctx) {
      try { this.satPostGain.disconnect(); } catch { /* */ }
      this.satPostGain = null;
    }
    if (!this.satPostGain) {
      this.satPostGain = ctx.createGain();
      this.satPostGain.gain.value = 1;
    }
  }

  private disposeDriftNodes(): void {
    try {
      if (this.driftProcessorNode instanceof AudioWorkletNode) {
        this.driftProcessorNode.port.postMessage({ type: 'destroy' });
        this.driftProcessorNode.port.close();
      }
    } catch { /* */ }
    const nodes: Array<AudioNode | null> = [
      this.driftInputGain,
      this.driftProcessorNode,
      this.driftOutputGain,
    ];
    for (const node of nodes) {
      try { node?.disconnect(); } catch { /* */ }
    }
    this.driftInputGain = null;
    this.driftProcessorNode = null;
    this.driftProcessorNodeMode = null;
    this.driftOutputGain = null;
    this.dynamicsWorkletTelemetry = null;
    this.dynamicsRoutingKey = null;
  }

  private disposeEndCompressorNodes(): void {
    const nodes: Array<AudioNode | null> = [
      this.endCompInputGain,
      this.endCompDryGain,
      this.endCompCompressor,
      this.endCompMakeupGain,
      this.endCompWetGain,
      this.endCompOutputGain,
    ];
    for (const node of nodes) {
      try { node?.disconnect(); } catch { /* */ }
    }
    this.endCompInputGain = null;
    this.endCompDryGain = null;
    this.endCompCompressor = null;
    this.endCompMakeupGain = null;
    this.endCompWetGain = null;
    this.endCompOutputGain = null;
    this.dynamicsRoutingKey = null;
  }

  private disposeSidechainTargetNodes(): void {
    for (const target of Object.values(this.sidechainTargets)) {
      if (!target) continue;
      try { target.input.disconnect(); } catch { /* */ }
      try { target.dry.disconnect(); } catch { /* */ }
      try { target.duck.disconnect(); } catch { /* */ }
      try { target.output.disconnect(); } catch { /* */ }
      try { target.traceSource?.disconnect(); } catch { /* */ }
      try { target.traceDry?.disconnect(); } catch { /* */ }
      try { target.traceDuck?.disconnect(); } catch { /* */ }
      try { target.traceOutput?.disconnect(); } catch { /* */ }
      try { target.traceSource?.stop(); } catch { /* */ }
    }
    this.sidechainTargets = {};
    this.sidechainVisualEvents = [];
  }

  private getSidechainTargetInput(ctx: AudioContext, key: SidechainTargetKey, destination: AudioNode): GainNode {
    let target = this.sidechainTargets[key];
    if (target && target.input.context !== ctx) {
      this.disposeSidechainTargetNodes();
      target = undefined;
    }
    if (!target) {
      target = {
        input: ctx.createGain(),
        dry: ctx.createGain(),
        duck: ctx.createGain(),
        output: ctx.createGain(),
        traceSource: null,
        traceDry: null,
        traceDuck: null,
        traceOutput: null,
        duckingUntil: 0,
      };
      target.input.gain.value = 1;
      target.dry.gain.value = 1;
      target.duck.gain.value = 0;
      target.output.gain.value = 1;
      target.input.connect(target.dry);
      target.input.connect(target.duck);
      target.dry.connect(target.output);
      target.duck.connect(target.output);
      this.sidechainTargets[key] = target;
    }
    try { target.output.disconnect(); } catch { /* */ }
    target.output.connect(destination);
    return target.input;
  }

  private getSidechainTargetGainTraceNode(key: SidechainTargetKey): AudioNode | null {
    const target = this.sidechainTargets[key];
    const ctx = this.ctx;
    if (!target || !ctx || target.input.context !== ctx) return null;
    if (!target.traceSource || !target.traceDry || !target.traceDuck || !target.traceOutput) {
      const source = ctx.createConstantSource();
      const dry = ctx.createGain();
      const duck = ctx.createGain();
      const output = ctx.createGain();
      source.offset.value = 1;
      output.gain.value = 1;
      source.connect(dry);
      source.connect(duck);
      dry.connect(output);
      duck.connect(output);
      const amount = this.sliderState ? this.getSidechainTargetAmount(this.sliderState, key) : 0;
      dry.gain.value = 1 - amount;
      duck.gain.value = amount;
      source.start();
      target.traceSource = source;
      target.traceDry = dry;
      target.traceDuck = duck;
      target.traceOutput = output;
    }
    return target.traceOutput;
  }

  private getSidechainTargetAmount(state: SliderState, key: SidechainTargetKey): number {
    const targetKeyByBus: Record<SidechainTargetKey, keyof SliderState> = {
      pad1: 'sidechainPad1Target',
      pad2: 'sidechainPad2Target',
      lead1: 'sidechainLead1Target',
      lead2: 'sidechainLead2Target',
      piano: 'sidechainPianoTarget',
      granular: 'sidechainGranularTarget',
      delayA: 'sidechainDelayATarget',
      delayB: 'sidechainDelayBTarget',
      reverb: 'sidechainReverbTarget',
    };
    if (!state.sidechainEnabled) return 0;
    const target = clampUnitInterval(state[targetKeyByBus[key]] as number | undefined);
    const amount = clampUnitInterval(state.sidechainAmount ?? 1);
    const mix = clampUnitInterval(state.sidechainMix ?? 1);
    const raw = clampUnitInterval(target * amount * mix);
    return 1 - (1 - raw) * (1 - raw);
  }

  private applySidechainTargetGains(state: SliderState, now: number, smoothTime = 0.03): void {
    for (const [key, target] of Object.entries(this.sidechainTargets) as Array<[SidechainTargetKey, SidechainTargetNode]>) {
      const amount = this.getSidechainTargetAmount(state, key);
      target.dry.gain.setTargetAtTime(1 - amount, now, smoothTime);
      target.traceDry?.gain.setTargetAtTime(1 - amount, now, smoothTime);
      if (amount <= 0.0001) {
        target.duck.gain.cancelScheduledValues(now);
        target.duck.gain.setTargetAtTime(0, now, smoothTime);
        target.traceDuck?.gain.cancelScheduledValues(now);
        target.traceDuck?.gain.setTargetAtTime(0, now, smoothTime);
        target.duckingUntil = 0;
        continue;
      }
      if (now >= target.duckingUntil) {
        target.duck.gain.setTargetAtTime(amount, now, smoothTime);
        target.traceDuck?.gain.setTargetAtTime(amount, now, smoothTime);
      }
    }
  }

  private triggerSidechainDuck(voice: DrumVoiceType, velocity: number, time?: number): void {
    const state = this.sliderState;
    if (!state?.sidechainEnabled || !this.ctx) return;

    const keyA = state.sidechainKeyA ?? 'off';
    const keyB = state.sidechainKeyB ?? 'off';
    const weight =
      (voice === keyA ? clampUnitInterval(state.sidechainKeyAWeight ?? 1) : 0) +
      (voice === keyB ? clampUnitInterval(state.sidechainKeyBWeight ?? 0.7) : 0);
    if (weight <= 0.0001) return;

    const targetEntries = Object.entries(this.sidechainTargets) as Array<[SidechainTargetKey, SidechainTargetNode]>;
    if (targetEntries.length === 0) return;
    const activeTargets = targetEntries.filter(([key]) => this.getSidechainTargetAmount(state, key) > 0.0001);
    if (activeTargets.length === 0) return;

    const now = Math.max(this.ctx.currentTime, time ?? this.ctx.currentTime);
    const attack = Math.max(0.0001, (state.sidechainAttackMs ?? 5) / 1000);
    const hold = Math.max(0, (state.sidechainHoldMs ?? 20) / 1000);
    const release = Math.max(0.02, (state.sidechainReleaseMs ?? 180) / 1000);
    const curve = 0.65 + clampUnitInterval(state.sidechainCurve ?? 0.5) * 0.7;
    const triggerStrength = Math.pow(clampUnitInterval(velocity * weight), curve);
    const detectorDb = 20 * Math.log10(Math.max(0.0001, triggerStrength));
    const thresholdDb = state.sidechainThreshold ?? -24;
    const ratio = Math.max(1, Math.min(20, state.sidechainRatio ?? 4));
    const knee = Math.max(0, state.sidechainKnee ?? 6);
    const overDb = detectorDb - thresholdDb;
    const kneeOverDb = knee > 0 && overDb > -knee && overDb < knee
      ? ((overDb + knee) * (overDb + knee)) / (4 * knee)
      : Math.max(0, overDb);
    const gainReductionDb = kneeOverDb * (1 - 1 / ratio);
    const duckFactor = Math.max(0.005, Math.pow(10, -gainReductionDb / 20));
    const makeup = Math.max(0.25, Math.min(4, state.sidechainMakeup ?? 1));
    let visualTargetStrength = 0;
    let visualDuckAmount = 0;
    let visualReductionDb = 0;

    for (const [key, target] of activeTargets) {
      const amount = this.getSidechainTargetAmount(state, key);
      const restGain = amount;
      const duckedGain = Math.min(restGain * 1.2, restGain * duckFactor * makeup);
      const totalDuckedGain = clampUnitInterval((1 - amount) + duckedGain);
      visualTargetStrength = Math.max(visualTargetStrength, amount);
      visualDuckAmount = Math.max(visualDuckAmount, 1 - totalDuckedGain);
      visualReductionDb = Math.max(visualReductionDb, -20 * Math.log10(Math.max(0.0001, totalDuckedGain)));
      const params = [target.duck.gain, target.traceDuck?.gain].filter((param): param is AudioParam => Boolean(param));
      for (const param of params) {
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(duckedGain, now + attack);
        param.setTargetAtTime(restGain, now + attack + hold, release / 3);
      }
      target.duckingUntil = now + attack + hold + release;
    }
    if (visualTargetStrength > 0.0001) {
      this.sidechainVisualEvents.push({
        id: this.sidechainVisualEventId++,
        time: now,
        voice,
        attack,
        hold,
        release,
        amount: clampUnitInterval(visualDuckAmount),
        keyStrength: triggerStrength,
        targetStrength: visualTargetStrength,
        reductionDb: visualReductionDb,
      });
      this.pruneSidechainVisualEvents(now);
    }
  }

  private createEndChainCompressor(ctx: AudioContext): DynamicsCompressorNode {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 2;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.18;
    return compressor;
  }

  private getOrCreateDynamicsAnalyser(ctx: AudioContext, key: DynamicsAnalyserKey): AnalyserNode {
    const existing = this.dynamicsAnalysers[key];
    if (existing && existing.context === ctx) return existing;
    try { existing?.disconnect(); } catch { /* noop */ }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.5;
    this.dynamicsAnalysers[key] = analyser;
    return analyser;
  }

  private connectDynamicsAnalyserTap(key: DynamicsAnalyserKey, source: AudioNode | null | undefined): void {
    if (!this.ctx || !source) return;
    const analyser = this.getOrCreateDynamicsAnalyser(this.ctx, key);
    try {
      source.connect(analyser);
    } catch { /* duplicate or incompatible tap; audio path remains authoritative */ }
  }

  private connectDynamicsAnalyserTaps(routing: DynamicsRoutingTargets): void {
    this.connectDynamicsAnalyserTap('input', this.masterGain);
    this.connectDynamicsAnalyserTap(
      'postDegrade',
      routing.degradePathActive ? this.driftOutputGain : this.masterGain,
    );
    this.connectDynamicsAnalyserTap('preSaturation', this.satPreGain);
    this.connectDynamicsAnalyserTap('postSaturation', this.satPostGain);
    if (routing.endChainActive) {
      this.connectDynamicsAnalyserTap('endInput', this.endCompInputGain);
      this.connectDynamicsAnalyserTap('endOutput', this.endCompOutputGain);
    }
  }

  private pruneSidechainVisualEvents(now: number): void {
    const keepAfter = now - 8;
    if (this.sidechainVisualEvents.length > 80) {
      this.sidechainVisualEvents = this.sidechainVisualEvents.slice(-80);
    }
    if (this.sidechainVisualEvents.length > 0 && this.sidechainVisualEvents[0]!.time < keepAfter) {
      this.sidechainVisualEvents = this.sidechainVisualEvents.filter((event) => event.time >= keepAfter);
    }
  }

  private ensureDynamicsDriftWorkletModule(ctx: AudioContext): void {
    if (this.dynamicsDriftWorkletLoaded && this.dynamicsDriftWorkletContext === ctx) return;
    if (this.dynamicsDriftWorkletLoadPromise && this.dynamicsDriftWorkletLoadContext === ctx) return;
    if (this.dynamicsDriftWorkletContext !== ctx) {
      this.dynamicsDriftWorkletLoaded = false;
      this.wasmDynamicsDriftBinary = null;
    }
    this.dynamicsDriftWorkletLoadContext = ctx;
    this.dynamicsDriftWorkletLoadPromise = Promise.all([
      fetch(dynamicsDriftWasmUrl).then((response) => {
        if (!response.ok) throw new Error(`Dynamics Drift WASM fetch failed: ${response.status}`);
        return response.arrayBuffer();
      }),
      ctx.audioWorklet.addModule(dynamicsDriftWorkletUrl),
    ])
      .then(([binary]) => {
        if (this.dynamicsDriftWorkletLoadContext !== ctx || this.ctx !== ctx) return;
        this.wasmDynamicsDriftBinary = binary;
        this.dynamicsDriftWorkletLoaded = true;
        this.dynamicsDriftWorkletContext = ctx;
        this.dynamicsDriftWorkletLoadContext = null;
        this.dynamicsDriftWorkletLoadPromise = null;
        this.dynamicsRoutingKey = null;
        if (this.sliderState && this.ctx === ctx) {
          this.wireMasterOutputChain(ctx);
          this.applyMasterSaturation(this.sliderState, ctx.currentTime);
          this.applyDynamics(this.sliderState, ctx.currentTime);
        }
      })
      .catch((e) => {
        if (this.dynamicsDriftWorkletLoadContext !== ctx) return;
        this.dynamicsDriftWorkletLoaded = false;
        this.dynamicsDriftWorkletContext = null;
        this.dynamicsDriftWorkletLoadContext = null;
        this.dynamicsDriftWorkletLoadPromise = null;
        this.wasmDynamicsDriftBinary = null;
        console.warn('Dynamics Drift worklet unavailable, Drift will use pass-through fallback:', e);
      });
  }

  private ensureDriftProcessorNode(ctx: AudioContext, useWorklet: boolean): void {
    const workletReady = this.dynamicsDriftWorkletLoaded && this.dynamicsDriftWorkletContext === ctx;
    const wantedMode: 'gain' | 'worklet' = useWorklet && workletReady ? 'worklet' : 'gain';
    if (useWorklet && !workletReady) {
      this.ensureDynamicsDriftWorkletModule(ctx);
    }
    if (
      this.driftProcessorNode &&
      (this.driftProcessorNode.context !== ctx || this.driftProcessorNodeMode !== wantedMode)
    ) {
      try {
        if (this.driftProcessorNode instanceof AudioWorkletNode) {
          this.driftProcessorNode.port.postMessage({ type: 'destroy' });
          this.driftProcessorNode.port.close();
        }
      } catch { /* */ }
      try { this.driftProcessorNode.disconnect(); } catch { /* */ }
      this.driftProcessorNode = null;
      this.driftProcessorNodeMode = null;
    }
    if (this.driftProcessorNode) return;
    if (wantedMode === 'worklet') {
      try {
        this.driftProcessorNode = new AudioWorkletNode(ctx, 'dynamics-drift', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          channelCount: 2,
          channelCountMode: 'explicit',
          processorOptions: {
            wasmBinary: this.wasmDynamicsDriftBinary,
          },
        });
        this.driftProcessorNode.port.onmessage = (event) => {
          if (event.data?.type === 'perf') {
            this.handlePerfMessage(event.data);
          } else if (event.data?.type === 'dynamicsTelemetry') {
            const now = this.ctx?.currentTime ?? 0;
            this.dynamicsWorkletTelemetry = {
              inputPeak: Math.max(0, Number(event.data.inputPeak) || 0),
              outputPeak: Math.max(0, Number(event.data.outputPeak) || 0),
              wetPeak: Math.max(0, Number(event.data.wetPeak) || 0),
              driftEnv: Math.max(0, Number(event.data.driftEnv) || 0),
              driftReductionDb: Math.max(0, Number(event.data.driftReductionDb) || 0),
              dropoutGain: Math.max(0, Number(event.data.dropoutGain) || 0),
              endInputPeak: Math.max(0, Number(event.data.endInputPeak) || 0),
              endOutputPeak: Math.max(0, Number(event.data.endOutputPeak) || 0),
              endReductionDb: Math.max(0, Number(event.data.endReductionDb) || 0),
              endDetectorDb: Number.isFinite(Number(event.data.endDetectorDb)) ? Number(event.data.endDetectorDb) : -90,
              driftCombRisk: Math.max(0, Number(event.data.driftCombRisk) || 0),
              driftMinDelayMs: Math.max(0, Number(event.data.driftMinDelayMs) || 0),
              driftDiffusion: Math.max(0, Number(event.data.driftDiffusion) || 0),
              erosionEventEnv: Math.max(0, Number(event.data.erosionEventEnv) || 0),
              erosionEventGainDb: Number.isFinite(Number(event.data.erosionEventGainDb)) ? Number(event.data.erosionEventGainDb) : 0,
              erosionProfileAmount: Math.max(0, Number(event.data.erosionProfileAmount) || 0),
              endLowReductionDb: Math.max(0, Number(event.data.endLowReductionDb) || 0),
              endHighReductionDb: Math.max(0, Number(event.data.endHighReductionDb) || 0),
              endClarityBoostDb: Number.isFinite(Number(event.data.endClarityBoostDb)) ? Number(event.data.endClarityBoostDb) : 0,
              endBandSplitHz: Number.isFinite(Number(event.data.endBandSplitHz)) ? Number(event.data.endBandSplitHz) : 170,
              endCompMode: Number.isFinite(Number(event.data.endCompMode)) ? Number(event.data.endCompMode) : 0,
              masterSatOversamplingFactor: Math.max(1, Number(event.data.masterSatOversamplingFactor) || 1),
              timestamp: now,
            };
          } else if (event.data?.type === 'wasmReady') {
            console.log('Dynamics Drift WASM engine initialized');
          }
        };
        if (this.perfMonitorEnabled) {
          this.driftProcessorNode.port.postMessage({ type: 'enablePerf', enabled: true });
        }
        this.driftProcessorNodeMode = 'worklet';
        return;
      } catch (error) {
        console.warn('Dynamics Drift worklet unavailable, using pass-through fallback:', error);
        this.dynamicsDriftWorkletLoaded = false;
        this.dynamicsDriftWorkletContext = null;
      }
    }
    this.driftProcessorNode = ctx.createGain();
    this.driftProcessorNodeMode = 'gain';
  }

  private ensureDynamicsNodes(ctx: AudioContext, routing: DynamicsRoutingTargets): void {
    if (this.driftInputGain && this.driftInputGain.context !== ctx) {
      this.disposeDriftNodes();
    }
    if (!routing.degradePathActive) {
      this.disposeDriftNodes();
    } else if (!this.driftInputGain) {
      this.driftInputGain = ctx.createGain();
      this.driftInputGain.gain.value = 1;
      this.ensureDriftProcessorNode(ctx, routing.degradePathActive);
      this.driftOutputGain = ctx.createGain();
      this.driftOutputGain.gain.value = 1;
    }
    if (routing.degradePathActive) {
      this.ensureDriftProcessorNode(ctx, routing.degradePathActive);
    }

    if (this.endCompInputGain && this.endCompInputGain.context !== ctx) {
      this.disposeEndCompressorNodes();
    }
    if (!routing.endChainActive) {
      this.disposeEndCompressorNodes();
    } else if (!this.endCompInputGain) {
      this.endCompInputGain = ctx.createGain();
      this.endCompInputGain.gain.value = 1;
      this.endCompDryGain = ctx.createGain();
      this.endCompDryGain.gain.value = 1;
      this.endCompCompressor = this.createEndChainCompressor(ctx);
      this.endCompMakeupGain = ctx.createGain();
      this.endCompMakeupGain.gain.value = 1;
      this.endCompWetGain = ctx.createGain();
      this.endCompWetGain.gain.value = 0;
      this.endCompOutputGain = ctx.createGain();
      this.endCompOutputGain.gain.value = 1;
    }
  }

  private getDynamicsRoutingKey(routing: DynamicsRoutingTargets): string {
    const driftWasmReady = this.ctx
      ? this.dynamicsDriftWorkletLoaded && this.dynamicsDriftWorkletContext === this.ctx
      : false;
    return `${routing.degradePathActive ? 1 : 0}:${routing.degradePathActive && driftWasmReady ? 1 : 0}:${routing.endChainActive ? 1 : 0}`;
  }

  private wireMasterOutputChain(ctx: AudioContext, routing?: DynamicsRoutingTargets): void {
    if (!this.masterGain || !this.limiter) return;
    const resolvedRouting = routing ?? (this.sliderState
      ? resolveDynamicsTargets(this.sliderState, ctx.sampleRate).routing
      : { degradePathActive: false, erosionWorkletActive: false, allpassStackActive: false, endChainActive: false });
    this.ensureMasterSaturationNodes(ctx);
    this.ensureDynamicsNodes(ctx, resolvedRouting);
    try { this.masterGain.disconnect(); } catch { /* */ }
    try { this.driftInputGain?.disconnect(); } catch { /* */ }
    try { this.driftProcessorNode?.disconnect(); } catch { /* */ }
    try { this.driftOutputGain?.disconnect(); } catch { /* */ }
    try { this.satPreGain?.disconnect(); } catch { /* */ }
    try { this.satWaveshaper?.disconnect(); } catch { /* */ }
    try { this.satPostTone?.disconnect(); } catch { /* */ }
    try { this.satPostGain?.disconnect(); } catch { /* */ }
    try { this.endCompInputGain?.disconnect(); } catch { /* */ }
    try { this.endCompDryGain?.disconnect(); } catch { /* */ }
    try { this.endCompCompressor?.disconnect(); } catch { /* */ }
    try { this.endCompMakeupGain?.disconnect(); } catch { /* */ }
    try { this.endCompWetGain?.disconnect(); } catch { /* */ }
    try { this.endCompOutputGain?.disconnect(); } catch { /* */ }
    if (resolvedRouting.degradePathActive) {
      this.masterGain.connect(this.driftInputGain!);
      this.driftInputGain!.connect(this.driftProcessorNode!);
      this.driftProcessorNode!.connect(this.driftOutputGain!);
      this.driftOutputGain!.connect(this.satPreGain!);
    } else {
      this.masterGain.connect(this.satPreGain!);
    }
    this.satPreGain!.connect(this.satWaveshaper!);
    this.satWaveshaper!.connect(this.satPostTone!);
    this.satPostTone!.connect(this.satPostGain!);
    if (resolvedRouting.endChainActive) {
      this.satPostGain!.connect(this.endCompInputGain!);
      this.endCompInputGain!.connect(this.endCompDryGain!);
      this.endCompDryGain!.connect(this.endCompOutputGain!);
      this.endCompInputGain!.connect(this.endCompCompressor!);
      this.endCompCompressor!.connect(this.endCompMakeupGain!);
      this.endCompMakeupGain!.connect(this.endCompWetGain!);
      this.endCompWetGain!.connect(this.endCompOutputGain!);
      this.endCompOutputGain!.connect(this.limiter);
    } else {
      this.satPostGain!.connect(this.limiter);
    }
    this.connectDynamicsAnalyserTaps(resolvedRouting);
    this.dynamicsRoutingKey = this.getDynamicsRoutingKey(resolvedRouting);
  }

  private applyMasterSaturation(state: SliderState, now: number): void {
    const saturationEnabled = Boolean(state.dynamicsSaturationEnabled);
    const saturationHandledByWorklet = Boolean(
      saturationEnabled &&
      this.driftProcessorNodeMode === 'worklet',
    );
    const rawDrive = saturationEnabled
      ? Math.max(0, Math.min(1, saturationHandledByWorklet ? 0 : (state.dynamicsSaturationDrive ?? 0)))
      : 0;
    const drive = rawDrive * 0.75;
    const tone = Math.max(0, Math.min(1, state.dynamicsSaturationTone ?? 0.5));
    const mode = (saturationEnabled
      ? (state.dynamicsSaturationMode ?? 'clean')
      : 'clean') as SliderState['dynamicsSaturationMode'];
    const preGainValue = 1 + drive * 3;
    const postCompensation = 1 / (1 + drive * 1.5);
    const effectiveTone = rawDrive > 0.0001 ? tone : 0.5;
    const curveMode: MasterSaturationCurveMode = drive > 0.0001 ? mode : 'linear';
    const tiltDb = (effectiveTone - 0.5) * 12;

    if (this.satWaveshaper && curveMode !== this.lastMasterSatMode) {
      this.satWaveshaper.curve = makeMasterSaturationCurve(curveMode);
      this.lastMasterSatMode = curveMode;
    }
    if (this.satWaveshaper) {
      this.satWaveshaper.oversample = drive > 0.1 ? '2x' : 'none';
    }
    this.satPreGain?.gain.setTargetAtTime(preGainValue, now, 0.05);
    this.satPostGain?.gain.setTargetAtTime(postCompensation, now, 0.05);
    this.satPostTone?.gain.setTargetAtTime(tiltDb, now, 0.05);
  }

  private sendDriftProcessorParams(targets: DynamicsTargets): void {
    if (!(this.driftProcessorNode instanceof AudioWorkletNode)) return;
    const params = toDynamicsDriftParamObject(targets);
    this.postCachedWorkletMessage(
      'dynamics:drift',
      this.driftProcessorNode,
      { type: 'params', params },
      params
    );
  }

  private applyDynamics(state: SliderState, now: number): void {
    const targets = resolveDynamicsTargets(state, this.ctx?.sampleRate ?? 44100);
    const routingKey = this.getDynamicsRoutingKey(targets.routing);
    if (this.ctx && routingKey !== this.dynamicsRoutingKey) {
      this.wireMasterOutputChain(this.ctx, targets.routing);
    }

    if (targets.routing.degradePathActive) {
      this.sendDriftProcessorParams(targets);
    }

    const endHandledByWorklet = Boolean(targets.routing.endChainActive && this.driftProcessorNodeMode === 'worklet');
    this.endCompDryGain?.gain.setTargetAtTime(endHandledByWorklet ? 1 : targets.endDry, now, 0.03);
    this.endCompWetGain?.gain.setTargetAtTime(endHandledByWorklet ? 0 : targets.endWet, now, 0.03);
    this.endCompMakeupGain?.gain.setTargetAtTime(endHandledByWorklet ? 1 : targets.endMakeup, now, 0.03);
    if (this.endCompCompressor) {
      this.endCompCompressor.threshold.setTargetAtTime(targets.endThreshold, now, 0.03);
      this.endCompCompressor.knee.setTargetAtTime(targets.endKnee, now, 0.03);
      this.endCompCompressor.ratio.setTargetAtTime(targets.endRatio, now, 0.03);
      this.endCompCompressor.attack.setTargetAtTime(targets.endAttack, now, 0.03);
      this.endCompCompressor.release.setTargetAtTime(targets.endRelease, now, 0.03);
    }
  }

  private getSafeDelayCrossFeedLevels(state: SliderState): { aToB: number; bToA: number } {
    let aToB = Math.max(0, Math.min(1, this.shv('delayAToBSend', state.delayAToBSend ?? 0)));
    let bToA = Math.max(0, Math.min(1, this.shv('delayBToASend', state.delayBToASend ?? 0)));
    const product = aToB * bToA;
    if (product > 0.4) {
      const scale = Math.sqrt(0.4 / product);
      aToB *= scale;
      bToA *= scale;
    }
    return { aToB, bToA };
  }

  private getSharedDelayATimes(state: SliderState): { leftMs: number; rightMs: number } {
    const bpm = getSharedSequencerBpm(state);
    const delayNoteL = this.shDelayDivision('drumDelayNoteL', (state.drumDelayNoteL as string) ?? '1/8d');
    const delayNoteR = this.shDelayDivision('drumDelayNoteR', (state.drumDelayNoteR as string) ?? '1/4');
    return {
      leftMs: delayNoteToSeconds(delayNoteL, bpm) * 1000,
      rightMs: delayNoteToSeconds(delayNoteR, bpm) * 1000,
    };
  }

  private isGranularBusArmed(state: SliderState, lead1WetActive: boolean, lead2WetActive: boolean, pianoWetActive: boolean): boolean {
    const now = this.ctx?.currentTime ?? 0;
    const padState = this.getEffectivePadState(state);
    const oceanLayerActive = this.isOceanLayerFadeActive(state, now);
    const natureLayerActive = this.isNatureLayerFadeActive(state, now);
    const waterLayerActive = this.isWaterLayerFadeActive(state, now);
    const insectsLayerActive = this.isInsectsLayerFadeActive(state, now);
    const natureFamilySendScale = this.getNatureFamilySendScale(state);
    const waterFamilySendScale = this.getWaterFamilySendScale(state);
    const insectsFamilySendScale = this.getInsectsFamilySendScale(state);
    const hasIncomingFeed =
      ((state.padEnabled ?? true) && this.shv('granularPad1Send', padState.granularPad1Send ?? 0) > 0.0001) ||
      ((state.pad2Enabled ?? false) && this.shv('granularPad2Send', padState.granularPad2Send ?? 0) > 0.0001) ||
      (lead1WetActive && (state.granularLead1Send ?? 0) > 0.0001) ||
      (lead2WetActive && (state.granularLead2Send ?? 0) > 0.0001) ||
      (pianoWetActive && (state.granularPianoSend ?? 0) > 0.0001) ||
      (state.drumEnabled && (state.granularDrumSend ?? 0) > 0.0001) ||
      (oceanLayerActive && (state.granularWavesSend ?? 0) > 0.0001) ||
      (natureLayerActive && this.scaleEarthSend(state.granularNatureSend ?? 0, natureFamilySendScale) > 0.0001) ||
      (waterLayerActive && this.scaleEarthSend(state.granularWaterSend ?? 0, waterFamilySendScale) > 0.0001) ||
      (insectsLayerActive && this.scaleEarthSend(state.granularInsectsSend ?? 0, insectsFamilySendScale) > 0.0001) ||
      (this.shv('delayAGranularSend', state.delayAGranularSend ?? 0) > 0.0001) ||
      (this.shv('delayBGranularSend', state.delayBGranularSend ?? 0) > 0.0001);
    const hasOutgoingPath =
      this.shv('granularLevel', state.granularLevel ?? 0) > 0.0001 ||
      this.shv('granularReverbSend', state.granularReverbSend ?? 0) > 0.0001 ||
      (state.granularDelayASend ?? 0) > 0.0001 ||
      (state.granularDelayBSend ?? 0) > 0.0001;
    return !!state.granularEnabled && (hasIncomingFeed || hasOutgoingPath);
  }

  private hasAnyReverbFeed(
    state: SliderState,
    pad1Active: boolean,
    pad2Active: boolean,
    lead1WetActive: boolean,
    lead2WetActive: boolean,
    pianoWetActive: boolean,
    granularBusArmed: boolean,
    delayAEnabled: boolean,
    delayBEnabled: boolean,
  ): boolean {
    const now = this.ctx?.currentTime ?? 0;
    const padState = this.getEffectivePadState(state);
    const oceanLayerActive = this.isOceanLayerFadeActive(state, now);
    const natureLayerActive = this.isNatureLayerFadeActive(state, now);
    const waterLayerActive = this.isWaterLayerFadeActive(state, now);
    const insectsLayerActive = this.isInsectsLayerFadeActive(state, now);
    const natureFamilySendScale = this.getNatureFamilySendScale(state);
    const waterFamilySendScale = this.getWaterFamilySendScale(state);
    const insectsFamilySendScale = this.getInsectsFamilySendScale(state);
    return (
      (pad1Active && this.shv('pad1ReverbSend', padState.pad1ReverbSend ?? 0) > 0.0001) ||
      (pad2Active && this.shv('pad2ReverbSend', padState.pad2ReverbSend ?? 0) > 0.0001) ||
      (lead1WetActive && (state.lead1ReverbSend ?? 0) > 0.0001) ||
      (lead2WetActive && (state.lead2ReverbSend ?? 0) > 0.0001) ||
      (pianoWetActive && (state.pianoReverbSend ?? 0) > 0.0001) ||
      (state.drumEnabled && (state.drumReverbSend ?? 0) > 0.0001) ||
      (granularBusArmed && this.shv('granularReverbSend', state.granularReverbSend ?? 0) > 0.0001) ||
      (delayAEnabled && this.shv('delayAReverbSend', state.delayAReverbSend ?? 0) > 0.0001) ||
      (delayBEnabled && this.shv('granularDelayReverbSend', state.granularDelayReverbSend ?? 0) > 0.0001) ||
      (oceanLayerActive && (state.oceanReverbSend ?? 0) > 0.0001) ||
      (natureLayerActive && this.scaleEarthSend(state.natureReverbSend ?? 0, natureFamilySendScale) > 0.0001) ||
      (waterLayerActive && this.scaleEarthSend(state.waterReverbSend ?? 0, waterFamilySendScale) > 0.0001) ||
      (insectsLayerActive && this.scaleEarthSend(state.insectsReverbSend ?? 0, insectsFamilySendScale) > 0.0001)
    );
  }

  private getSharedDelayAState(
    state: SliderState,
    lead1WetActive: boolean,
    lead2WetActive: boolean,
    pianoWetActive: boolean,
    granularBusArmed: boolean,
    delayBEnabled = false,
  ) {
    const now = this.ctx?.currentTime ?? 0;
    const oceanLayerActive = this.isOceanLayerFadeActive(state, now);
    const natureLayerActive = this.isNatureLayerFadeActive(state, now);
    const waterLayerActive = this.isWaterLayerFadeActive(state, now);
    const insectsLayerActive = this.isInsectsLayerFadeActive(state, now);
    const natureFamilySendScale = this.getNatureFamilySendScale(state);
    const waterFamilySendScale = this.getWaterFamilySendScale(state);
    const insectsFamilySendScale = this.getInsectsFamilySendScale(state);
    const { leftMs, rightMs } = this.getSharedDelayATimes(state);
    const drumDelayProfile = this.getDrumDelaySendProfile(state);
    const crossFeeds = this.getSafeDelayCrossFeedLevels(state);
    const delayFeedback = this.shv('delayAFeedback', state.delayAFeedback ?? 0.4);
    const delayMix = this.shv('delayAMix', state.delayAMix ?? 0.35);
    const delayFilter = this.shv('delayAFilter', state.delayAFilter ?? 2000);
    const delayReverbSend = this.shv('delayAReverbSend', state.delayAReverbSend ?? 0.4);
    const delayModDepth = this.shv('delayAModDepth', state.delayAModDepth ?? 0);
    const delayModRate = this.shv('delayAModRate', state.delayAModRate ?? 0);
    const delayDuck = this.shv('delayADuck', state.delayADuck ?? 0);
    const delayWidth = this.shv('delayAWidth', state.delayAWidth ?? 0.5);
    const delayCrossFeedFilter = this.shv('delayACrossFeedFilter', state.delayACrossFeedFilter ?? 1);
    const delayGranularSend = this.shv('delayAGranularSend', state.delayAGranularSend ?? 0);
    const padState = this.getEffectivePadState(state);
    const delayAExternalFeedActive =
      ((state.padEnabled ?? true) && this.shv('pad1DelayASend', padState.pad1DelayASend ?? 0) > 0.0001) ||
      ((state.pad2Enabled ?? false) && this.shv('pad2DelayASend', padState.pad2DelayASend ?? 0) > 0.0001) ||
      (lead1WetActive && (state.lead1DelayASend ?? 0) > 0.0001) ||
      (lead2WetActive && (state.lead2DelayASend ?? 0) > 0.0001) ||
      (pianoWetActive && (state.pianoDelayASend ?? 0) > 0.0001) ||
      (state.drumEnabled && drumDelayProfile * (state.drumDelayASend ?? 0) > 0.0001) ||
      (granularBusArmed && (state.granularDelayASend ?? 0) > 0.0001) ||
      (delayBEnabled && crossFeeds.bToA > 0.0001) ||
      (oceanLayerActive && (state.oceanDelayASend ?? 0) > 0.0001) ||
      (natureLayerActive && this.scaleEarthSend(state.natureDelayASend ?? 0, natureFamilySendScale) > 0.0001) ||
      (waterLayerActive && this.scaleEarthSend(state.waterDelayASend ?? 0, waterFamilySendScale) > 0.0001) ||
      (insectsLayerActive && this.scaleEarthSend(state.insDelayASend ?? 0, insectsFamilySendScale) > 0.0001);

    return {
      enabled: delayAExternalFeedActive,
      timeLeftMs: leftMs,
      timeRightMs: rightMs,
      feedback: delayFeedback,
      mix: delayMix,
      filterHz: delayFilter,
      filterType: state.delayAFilterType ?? 'lowpass',
      reverbSend: (state.reverbEnabled && delayAExternalFeedActive) ? delayReverbSend : 0,
      modRateHz: delayModDepth > 0 ? (0.05 + delayModRate * 4.95) : 0,
      modDepthMs: delayModDepth * 50,
      pingPong: state.delayAPingPong ?? false,
      duck: delayDuck,
      width: delayWidth,
      toDelayB: crossFeeds.aToB,
      crossFeedFilterHz: 200 * Math.pow(40, Math.max(0, Math.min(1, delayCrossFeedFilter))),
      granularSend: delayGranularSend,
    };
  }

  private wireDrumDelaySends(ctx: AudioContext): void {
    this.drumSynth?.setSharedDelayInput(this.sharedDelayA?.input ?? null);
    if (this.sharedDelayA && this.drumWasmNode && !this.drumDelayASend) {
      this.drumDelayASend = ctx.createGain();
      this.drumDelayASend.gain.value = 0;
      this.drumWasmNode.connect(this.drumDelayASend, 0);
      this.drumDelayASend.connect(this.sharedDelayA.input);
    }

    if (this.sharedDelayB && this.drumSynth && !this.drumDelayBSend) {
      this.drumDelayBSend = ctx.createGain();
      this.drumDelayBSend.gain.value = 0;
      this.drumSynth.getPreFaderBus().connect(this.drumDelayBSend);
      if (this.drumWasmNode) {
        this.drumWasmNode.connect(this.drumDelayBSend, 0);
      }
      this.drumDelayBSend.connect(this.sharedDelayB.input);
    }
  }

  private flushGranularWorkletUpdate(): void {
    if (this.granularWorkletDispatchTimer !== null) {
      clearTimeout(this.granularWorkletDispatchTimer);
      this.granularWorkletDispatchTimer = null;
    }
    if (!this.granularFxNode || !this.pendingGranularWorkletUpdate) return;

    const update = this.pendingGranularWorkletUpdate;
    this.pendingGranularWorkletUpdate = null;
    this.lastGranularWorkletDispatchMs = performance.now();

    this.postCachedWorkletMessage(
      'granular:globalParams',
      this.granularFxNode,
      { type: 'globalParams', params: update.global },
      update.global,
    );
    this.postCachedWorkletMessage(
      'granular:spaceParams',
      this.granularFxNode,
      { type: 'spaceParams', params: update.space },
      update.space,
    );
    this.postCachedWorkletMessage(
      'granular:voiceParams',
      this.granularFxNode,
      { type: 'voiceParams', params: update.voices },
      update.voices,
    );
    this.postCachedWorkletMessage(
      'granular:harmonyParams',
      this.granularFxNode,
      { type: 'harmonyParams', params: update.harmony },
      update.harmony,
    );
    this.postCachedWorkletMessage(
      'granular:legacyParams',
      this.granularFxNode,
      { type: 'legacyParams', params: update.legacy },
      update.legacy,
    );
  }

  private queueGranularWorkletUpdate(update: GranularWorkletUpdate): void {
    this.pendingGranularWorkletUpdate = update;
    if (!this.granularFxNode) return;

    const nowMs = performance.now();
    const elapsed = nowMs - this.lastGranularWorkletDispatchMs;
    if (this.lastGranularWorkletDispatchMs === 0 || elapsed >= GRANULAR_WORKLET_DISPATCH_INTERVAL_MS) {
      this.flushGranularWorkletUpdate();
      return;
    }

    if (this.granularWorkletDispatchTimer !== null) return;
    const waitMs = Math.max(1, GRANULAR_WORKLET_DISPATCH_INTERVAL_MS - elapsed);
    this.granularWorkletDispatchTimer = window.setTimeout(() => {
      this.granularWorkletDispatchTimer = null;
      this.flushGranularWorkletUpdate();
    }, waitMs);
  }

  /** Callback fired when engine-owned S&H params resample, including onset-driven owners. */
  setGranularSHTriggerCallback(cb: (positions: Record<string, number>) => void) {
    this.onGranularSHTrigger = cb;
  }

  /** Enable/disable CPU performance monitoring overlay. Sends enablePerf to all worklets. */
  setPerfMonitorEnabled(enabled: boolean) {
    this.perfMonitorEnabled = enabled;
    if (!enabled) {
      this.perfData = {};
    }
    this.sendEnablePerfToWorklets(enabled);
  }

  /** Send enablePerf message to all worklet nodes that have a port */
  private sendEnablePerfToWorklets(enabled: boolean) {
    const msg = { type: 'enablePerf', enabled };
    // Guard: only send to AudioWorkletNodes (which have .port), not to GainNode stand-ins
    if (this.reverbNode && 'port' in this.reverbNode) (this.reverbNode as AudioWorkletNode).port.postMessage(msg);
    if (this.granularFxNode && 'port' in this.granularFxNode) this.granularFxNode.port.postMessage(msg);
    if (this.soundscapesNode && 'port' in this.soundscapesNode) this.soundscapesNode.port.postMessage(msg);
    if (this.padWasmNode) this.padWasmNode.port.postMessage(msg);
    if (this.leadFmWasmNode) this.leadFmWasmNode.port.postMessage(msg);
    if (this.drumWasmNode) this.drumWasmNode.port.postMessage(msg);
    if (this.spectralFreezeNode) this.spectralFreezeNode.port.postMessage(msg);
    if (this.driftProcessorNode instanceof AudioWorkletNode) this.driftProcessorNode.port.postMessage(msg);
  }

  setPerfUpdateCallback(callback: ((data: Record<string, PerfMetrics>) => void) | null) {
    this.onPerfUpdate = callback;
  }

  private roundPerfPercent(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private setPerfMetric(
    key: string,
    avgPercent: number,
    peakPercent = avgPercent,
    missPercent: number | null = 0,
    scope: PerfMetrics['scope'] = 'worklet',
  ): void {
    if (!Number.isFinite(avgPercent)) return;
    const safePeak = Number.isFinite(peakPercent) ? peakPercent : avgPercent;
    this.perfData[key] = {
      avgPercent: this.roundPerfPercent(avgPercent),
      peakPercent: this.roundPerfPercent(safePeak),
      missPercent: missPercent === null
        ? null
        : this.roundPerfPercent(Number.isFinite(missPercent) ? missPercent : 0),
      scope,
    };
  }

  /** Handle incoming perf message from any worklet */
  private handlePerfMessage(data: Record<string, unknown>) {
    // Standard format: { name: string, cpuPercent: number }
    if (typeof data.name === 'string' && typeof data.cpuPercent === 'number') {
      this.setPerfMetric(
        data.name,
        data.cpuPercent,
        typeof data.peakPercent === 'number' ? data.peakPercent : data.cpuPercent,
        typeof data.missPercent === 'number' ? data.missPercent : 0,
      );
    }
    // Soundscapes format: total worklet timing plus per-source timing details.
    if (typeof data.budgetMs === 'number') {
      const budget = data.budgetMs as number;
      if (budget > 0) {
        if (typeof data.avgMs === 'number') {
          this.setPerfMetric(
            'soundscapes-wasm',
            (data.avgMs / budget) * 100,
            typeof data.peakMs === 'number' ? (data.peakMs / budget) * 100 : (data.avgMs / budget) * 100,
            typeof data.missPercent === 'number' ? data.missPercent : 0,
          );
        }

        const setSourceMetric = (key: string, avgMsKey: string, peakMsKey: string): boolean => {
          const avgMs = data[avgMsKey];
          if (typeof avgMs !== 'number') return false;
          const peakMs = data[peakMsKey];
          this.setPerfMetric(
            key,
            (avgMs / budget) * 100,
            typeof peakMs === 'number' ? (peakMs / budget) * 100 : (avgMs / budget) * 100,
            null,
            'source',
          );
          return true;
        };

        setSourceMetric('water', 'waterMs', 'waterPeakMs');
        const hasInsects1 = setSourceMetric('insects-1', 'insects1Ms', 'insects1PeakMs');
        const hasInsects2 = setSourceMetric('insects-2', 'insects2Ms', 'insects2PeakMs');
        const hasSplitInsects = hasInsects1 || hasInsects2;
        if (hasSplitInsects) {
          delete this.perfData['insects'];
        } else {
          setSourceMetric('insects', 'insectsMs', 'insectsPeakMs');
          delete this.perfData['insects-1'];
          delete this.perfData['insects-2'];
        }
        delete this.perfData['ocean'];
      }
    }
    if (this.onPerfUpdate) {
      this.onPerfUpdate({ ...this.perfData });
    }
  }

  private isGranularTempoSyncVoiceActive(state: SliderState, voiceIndex: number): boolean {
    const voiceNum = voiceIndex + 1;
    const enabled = state[`granularV${voiceNum}Enabled` as keyof SliderState] as boolean;
    const mode = state[`granularV${voiceNum}Mode` as keyof SliderState] as SliderState['granularV1Mode'];
    const tempoSync = state[`granularV${voiceNum}TempoSync` as keyof SliderState] as boolean;
    return !!(state.granularEnabled && enabled && mode === 'granular' && tempoSync);
  }

  private hasGranularTempoSyncVoices(state: SliderState | null): boolean {
    if (!state) return false;
    for (let voiceIndex = 0; voiceIndex < 4; voiceIndex++) {
      if (this.isGranularTempoSyncVoiceActive(state, voiceIndex)) return true;
    }
    return false;
  }



  setStateChangeCallback(callback: (state: EngineState) => void) {
    this.onStateChange = callback;
  }

  setLeadExpressionCallback(callback: (expression: { vibratoDepth: number; vibratoRate: number; glide: number }) => void) {
    this.onLeadExpressionTrigger = callback;
  }

  setLeadMorphCallback(callback: (morph: { lead1: number; lead2: number }) => void) {
    this.onLeadMorphTrigger = callback;
  }

  setLeadDelayCallback(callback: (delay: { time: number; feedback: number; mix: number }) => void) {
    this.onLeadDelayTrigger = callback;
  }

  getGranularWriteHeadPosition(): number { return this.granularWriteHeadPosition; }
  getGranularVoicePositions(): number[] { return [...this.granularVoicePositions]; }
  getGranularActiveGrainCount(): number { return this.granularActiveGrainCount; }
  getGranularBufferWaveform(): Float32Array | null { return this.granularBufferWaveform; }
  getGranularVisualEvents(): CoreProductGranularVisualEvent[] {
    const events = this.granularVisualEvents;
    this.granularVisualEvents = [];
    return events;
  }
  getEarthTextureDebugState(): EarthTextureDebugState {
    return {
      waves: this.oceanTexturePlayer?.getDebugSnapshot() ?? null,
      birds: this.birdsTexture?.player.getDebugSnapshot() ?? null,
      birds2: this.birds2Texture?.player.getDebugSnapshot() ?? null,
      frogs: this.frogsTexture?.player.getDebugSnapshot() ?? null,
    };
  }

  setGranularUiActive(active: boolean) {
    this.granularUiActive = active;
    this.syncGranularUiActive();
  }

  private syncGranularUiActive(): void {
    const active = this.granularUiActive && this.isDocumentVisible();
    if (!this.granularFxNode) {
      this.lastGranularUiActiveSent = null;
      return;
    }
    if (this.lastGranularUiActiveSent === active) return;
    this.lastGranularUiActiveSent = active;
    this.granularFxNode.port.postMessage({ type: 'uiActive', active });
  }

  setDrumTriggerCallback(callback: (voice: DrumVoiceType, velocity: number) => void) {
    this.onDrumTrigger = callback;
    // Pass through to drum synth if it exists
    if (this.drumSynth) {
      this.drumSynth.setDrumTriggerCallback(this.drumTriggerRouter);
    }
  }

  setDrumMorphTriggerCallback(callback: (voice: DrumVoiceType, morphPosition: number) => void) {
    this.onDrumMorphTrigger = callback;
    // Pass through to drum synth if it exists
    if (this.drumSynth) {
      this.drumSynth.setMorphTriggerCallback(callback);
    }
  }

  setPadMorphTriggerCallback(callback: (morphPosition: number) => void) {
    this.onPadMorphTrigger = callback;
  }

  setPad2MorphTriggerCallback(callback: (morphPosition: number) => void) {
    this.onPad2MorphTrigger = callback;
  }

  setLeadDistanceCallback(callback: (distance: { lead1: number; lead2: number }) => void) {
    this.onLeadDistanceTrigger = callback;
  }

  setPianoDistanceTriggerCallback(callback: (distance: number) => void) {
    this.onPianoDistanceTrigger = callback;
  }

  setPadDistanceTriggerCallback(callback: (distance: number) => void) {
    this.onPadDistanceTrigger = callback;
  }

  setPad2DistanceTriggerCallback(callback: (distance: number) => void) {
    this.onPad2DistanceTrigger = callback;
  }

  setDrumEuclidEvolveTriggerCallback(callback: (laneIndex: number) => void) {
    this.onDrumEuclidEvolveTrigger = callback;
    if (this.drumSynth) {
      this.drumSynth.setEuclidEvolveTriggerCallback(callback);
    }
  }

  setDrumStepPositionCallback(callback: (steps: number[], hitCounts: number[]) => void) {
    this.onDrumStepPositionChange = callback;
    if (this.drumSynth) {
      this.drumSynth.setStepPositionCallback(callback);
    }
  }

  setSynthStepPositionCallback(callback: ((steps: number[], hitCounts: number[]) => void) | null) {
    this.onSynthStepPositionChange = callback;
    callback?.([...this.synthEuclidVisualStep], [...this.synthEuclidVisualHitCounts]);
  }

  setJourneyMorphClockCallback(callback: ((now: number) => void) | null) {
    this.onJourneyMorphClockFrame = callback;
    if (!callback) {
      this.stopJourneyMorphClock();
    }
  }

  startJourneyMorphClock(): void {
    if (this.journeyMorphClockActive || !this.onJourneyMorphClockFrame) return;
    this.journeyMorphClockActive = true;
    this.scheduleJourneyMorphClockTick();
  }

  stopJourneyMorphClock(): void {
    this.journeyMorphClockActive = false;
    this.cancelJourneyMorphClockTick();
  }

  private cancelJourneyMorphClockTick(): void {
    if (this.journeyMorphClockRaf !== null) {
      cancelAnimationFrame(this.journeyMorphClockRaf);
      this.journeyMorphClockRaf = null;
    }
    if (this.journeyMorphClockTimeout !== null) {
      clearTimeout(this.journeyMorphClockTimeout);
      this.journeyMorphClockTimeout = null;
    }
  }

  private scheduleJourneyMorphClockTick(): void {
    if (!this.journeyMorphClockActive || !this.onJourneyMorphClockFrame) return;

    const tick = (now: number) => {
      this.journeyMorphClockRaf = null;
      this.journeyMorphClockTimeout = null;
      if (!this.journeyMorphClockActive || !this.onJourneyMorphClockFrame) return;

      this.onJourneyMorphClockFrame(now);
      if (!this.journeyMorphClockActive || !this.onJourneyMorphClockFrame) return;

      if (document.visibilityState === 'visible') {
        this.journeyMorphClockRaf = requestAnimationFrame(tick);
        return;
      }
      if (!this.isRunning) {
        this.stopJourneyMorphClock();
        return;
      }
      this.journeyMorphClockTimeout = window.setTimeout(() => {
        tick(performance.now());
      }, 50);
    };

    if (document.visibilityState === 'visible') {
      this.journeyMorphClockRaf = requestAnimationFrame(tick);
      return;
    }
    if (!this.isRunning) {
      this.stopJourneyMorphClock();
      return;
    }
    this.journeyMorphClockTimeout = window.setTimeout(() => {
      tick(performance.now());
    }, 50);
  }

  private clearSynthEuclidVisualTimers(resetVisualState = false): void {
    for (const timerId of this.synthEuclidVisualTimers) {
      window.clearTimeout(timerId);
    }
    this.synthEuclidVisualTimers.clear();
    if (resetVisualState) {
      this.synthEuclidVisualStep = [0, 0, 0, 0];
      this.synthEuclidVisualHitCounts = [0, 0, 0, 0];
    }
  }

  private queueSynthEuclidVisualStep(
    laneIndex: number,
    stepIndex: number,
    hitCount: number,
    delayMs: number,
  ): void {
    const visualDelayMs = Math.max(0, delayMs + SEQUENCER_VISUAL_SYNC_OFFSET_MS);
    const publish = () => {
      this.synthEuclidVisualTimers.delete(timerId);
      this.synthEuclidVisualStep[laneIndex] = stepIndex;
      this.synthEuclidVisualHitCounts[laneIndex] = hitCount;
      this.onSynthStepPositionChange?.([...this.synthEuclidVisualStep], [...this.synthEuclidVisualHitCounts]);
    };

    let timerId = 0;
    if (visualDelayMs <= 1) {
      publish();
      return;
    }

    timerId = window.setTimeout(publish, visualDelayMs);
    this.synthEuclidVisualTimers.add(timerId);
  }

  setSynthStepOverrides(overrides: {
    pitch: (number[] | null)[];
    pitchDirection: (LaneDirection | null)[];
    triggerToggles?: Map<number, boolean>[];
    expression?: (number[] | null)[];
    expressionDirection?: (LaneDirection | null)[];
    expressionRanges?: ({ min: number; max: number } | null)[];
    morph?: (number[] | null)[];
    morphDirection?: (LaneDirection | null)[];
    morphRanges?: ({ min: number; max: number } | null)[];
    distance?: (number[] | null)[];
    distanceDirection?: (LaneDirection | null)[];
    distanceRanges?: ({ min: number; max: number } | null)[];
    nudge?: (number[] | null)[];
    nudgeDirection?: (LaneDirection | null)[];
    probability?: (number[] | null)[];
    ratchet?: (number[] | null)[];
    trigCondition?: (TrigCondition[] | null)[];
    playNotes?: (unknown[] | null)[];
  }) {
    this.synthStepOverrides = {
      pitch: overrides.pitch,
      pitchDirection: overrides.pitchDirection,
      triggerToggles: overrides.triggerToggles ?? this.synthStepOverrides.triggerToggles,
      expression: overrides.expression ?? this.synthStepOverrides.expression,
      expressionDirection: overrides.expressionDirection ?? this.synthStepOverrides.expressionDirection,
      expressionRanges: overrides.expressionRanges ?? this.synthStepOverrides.expressionRanges,
      morph: overrides.morph ?? this.synthStepOverrides.morph,
      morphDirection: overrides.morphDirection ?? this.synthStepOverrides.morphDirection,
      morphRanges: overrides.morphRanges ?? this.synthStepOverrides.morphRanges,
      distance: overrides.distance ?? this.synthStepOverrides.distance,
      distanceDirection: overrides.distanceDirection ?? this.synthStepOverrides.distanceDirection,
      distanceRanges: overrides.distanceRanges ?? this.synthStepOverrides.distanceRanges,
      nudge: overrides.nudge ?? this.synthStepOverrides.nudge,
      nudgeDirection: overrides.nudgeDirection ?? this.synthStepOverrides.nudgeDirection,
      probability: overrides.probability ?? this.synthStepOverrides.probability,
      ratchet: overrides.ratchet ?? this.synthStepOverrides.ratchet,
      trigCondition: overrides.trigCondition ?? this.synthStepOverrides.trigCondition,
      playNotes: overrides.playNotes === undefined
        ? this.synthStepOverrides.playNotes
        : normalizeSynthPlayNoteTables(overrides.playNotes, this.synthStepOverrides.playNotes),
    };
    // Continuous scheduler reads overrides each tick — no restart needed
  }

  /** Set per-lane clock divisions for the synth Euclidean sequencer. */
  setSynthEuclidClockDivs(divs: ClockDivision[]) {
    const previous = this.synthEuclidClockDivs;
    this.synthEuclidClockDivs = SYNTH_LANE_INDICES.map(i => divs[i] ?? this.synthEuclidClockDivs[i]) as Quad<ClockDivision>;
    if (
      this.synthEuclidScheduleTimer &&
      this.synthEuclidClockDivs.some((div, index) => div !== previous[index])
    ) {
      this.resetSynthEuclidTransportAlignment(false);
    }
  }

  /** Set per-lane swing amounts for the synth Euclidean sequencer. */
  setSynthEuclidSwings(swings: number[]) {
    this.synthEuclidSwings = SYNTH_LANE_INDICES.map(i =>
      normalizeSequencerSwing(swings[i], this.synthEuclidSwings[i])
    ) as Quad<number>;
  }

  /** Set evolve configs for the synth Euclidean sequencer (from UI). */
  setSynthEuclidEvolveConfigs(configs: Partial<SynthEvolveConfig>[]) {
    this.synthEvolveConfigs = this.synthEvolveConfigs.map((current, i) => {
      const incoming = configs[i] ?? {};
      const enabledSubLanes = mergeEvolveEnabledSubLanes(incoming.enabledSubLanes, current.enabledSubLanes);
      return {
        ...current,
        enabled: incoming.enabled === undefined ? current.enabled : incoming.enabled === true,
        everyBars: typeof incoming.everyBars === 'number' && Number.isFinite(incoming.everyBars)
          ? Math.max(1, Math.round(incoming.everyBars))
          : current.everyBars,
        evolution: typeof incoming.evolution === 'number' && Number.isFinite(incoming.evolution)
          ? Math.max(0, Math.min(1, incoming.evolution))
          : current.evolution,
        writeOffset: normalizeEvolveWriteOffset(incoming.writeOffset, current.writeOffset),
        mutationMode: incoming.mutationMode === 'strict' ? 'strict' : incoming.mutationMode === 'biased' ? 'biased' : current.mutationMode,
        methods: mergeEvolveMethods(current.methods, incoming.methods),
        ...(enabledSubLanes ? { enabledSubLanes } : {}),
      };
    }) as Quad<SynthEvolveConfig>;
  }

  /** Set per-lane sub-lane enabled state for synth Euclidean sequencer. */
  setSynthSubLaneEnabled(states: Record<string, boolean>[]) {
    this.synthSubLaneEnabled = SYNTH_LANE_INDICES.map(i => ({ ...(states[i] ?? {}) })) as Quad<Record<string, boolean>>;
  }

  setSequencerPresetHomeSnapshots(): void {
    this.drumHomeStepOverrides = cloneDrumStepOverrides(this.pendingStepOverrides);
    this.pendingDrumPresetHomeCapture = true;
    if (this.drumSynth) {
      this.drumSynth.captureEuclidPresetHome();
      this.pendingDrumPresetHomeCapture = false;
    }
    SYNTH_LANE_INDICES.forEach((laneIndex) => this.captureSynthPresetHome(laneIndex));
  }

  captureSynthEuclidLaneHome(laneIndex: number, pitchState?: { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean } | null): void {
    const index = Math.max(0, Math.min(SYNTH_LANE_INDICES.length - 1, Math.trunc(laneIndex)));
    this.captureSynthPresetHome(index, pitchState);
  }

  captureDrumEuclidLaneHome(laneIndex: number, pitchSettings?: SequencerPitchSettings | null, pitchState?: { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean } | null): void {
    const index = Math.max(0, Math.min(DRUM_LANE_INDICES.length - 1, Math.trunc(laneIndex)));
    const current = cloneDrumStepOverrides(this.drumHomeStepOverrides);
    const source = cloneDrumStepOverrides(this.pendingStepOverrides);
    for (const key of Object.keys(current) as (keyof DrumStepOverrides)[]) {
      (current[key] as unknown[])[index] = source[key]?.[index] ?? null;
    }
    this.drumHomeStepOverrides = current;
    if (pitchSettings) {
      this.drumHomePitchSettings[index] = normalizeSequencerPitchSettings(pitchSettings, this.drumHomePitchSettings[index] ?? undefined);
    }
    if (pitchState) {
      this.drumHomePitchSubLaneStates[index] = {
        steps: pitchState.steps,
        direction: pitchState.direction,
        scaleQuantize: typeof pitchState.scaleQuantize === 'boolean' ? false : pitchState.scaleQuantize,
      };
      if (typeof pitchState.scaleQuantize === 'boolean') this.drumHomePitchScaleQuantize[index] = false;
    }
    if (this.drumSynth) this.drumSynth.captureEuclidLaneHome(index, this.drumHomePitchSettings[index], pitchState);
    else this.pendingDrumPresetHomeCapture = true;
  }

  /** Register callback for synth evolve trigger (UI flash). */
  setSynthEuclidEvolveTriggerCallback(callback: (laneIndex: number) => void) {
    this.onSynthEvolveTrigger = callback;
  }

  /** Register callback for synth evolve overrides push-back to UI. */
  setSynthEvolveOverridesChangedCallback(callback: (laneIndex: number, overrides: SynthEvolveOverridesPayload) => void) {
    this.onSynthEvolveOverridesChanged = callback;
  }

  /** Update per-lane pitch settings for MIDI↔offset conversion at evolve boundary. */
  setSynthPitchSettings(settings: { mode: PitchMode; root: number; scale: ScaleName }[]) {
    this.synthPitchSettings = SYNTH_LANE_INDICES.map(i =>
      normalizeSequencerPitchSettings(settings[i], this.synthPitchSettings[i])
    ) as Quad<{ mode: PitchMode; root: number; scale: ScaleName }>;
  }

  /** Set per-lane pitch binding/indexing mode for the synth Euclidean sequencer. */
  setSynthPitchBindingModes(modes: PitchBindingMode[]) {
    this.synthPitchBindingModes = SYNTH_LANE_INDICES.map(i =>
      normalizeSequencerPitchBindingMode(modes[i], this.synthPitchBindingModes[i])
    ) as Quad<PitchBindingMode>;
  }

  /** Register callback for noteRange evolve push-back to UI. */
  setSynthNoteRangeEvolvedCallback(callback: (laneIndex: number, noteMin: number, noteMax: number) => void) {
    this.onSynthNoteRangeEvolved = callback;
  }

  /** Register callback for drum evolve overrides push-back to UI. */
  setDrumEvolveOverridesChangedCallback(callback: (laneIndex: number, overrides: DrumEvolveOverridesPayload) => void) {
    if (this.drumSynth) {
      this.drumSynth.setEvolveOverridesChangedCallback(callback);
    }
    // Store for late-init
    this.pendingDrumEvolveOverridesCallback = callback;
  }
  private pendingDrumEvolveOverridesCallback: ((laneIndex: number, overrides: DrumEvolveOverridesPayload) => void) | null = null;

  /** Reset a single synth lane's overrides to its home snapshot. */
  resetSynthEuclidLaneHome(laneIndex: number) {
    const state = this.synthEvolveStates[laneIndex];
    if (!state?.home) return;
    const laneOv = this.extractSynthLaneOverrides(laneIndex);
    const restored = resetSynthLaneToHome(laneOv, state);
    // Home snapshot is in offsets — convert pitch to MIDI for engine storage
    const ps = state.homePitchSettings ?? this.synthPitchSettings[laneIndex];
    const midiRestored: SynthLaneOverrides = { ...restored };
    if (restored.pitch && ps && ps.mode !== 'noteRange') {
      midiRestored.pitch = this.offsetsToMidi(restored.pitch, ps);
    }
    this.applySynthLaneOverrides(laneIndex, midiRestored);
    // Push offsets to UI (no conversion needed)
    const subLaneStates = synthEvolvedSubLaneStatePatch(restored);
    if (state.homePitchSubLaneState) {
      subLaneStates.pitch = { ...(subLaneStates.pitch ?? { enabled: false, steps: 1, direction: 'forward' }), ...state.homePitchSubLaneState };
    }
    this.onSynthEvolveOverridesChanged?.(laneIndex, {
      ...restored,
      swing: state.homeSwing,
      ...(ps ? { pitchSettings: [null, null, null, null].map((_, index) => index === laneIndex ? { ...ps } : null) } : {}),
      ...(Object.keys(subLaneStates).length > 0 ? { subLaneStates } : {}),
    });
    if (state.homeSwing !== undefined) {
      this.synthEuclidSwings[laneIndex] = state.homeSwing;
    }
    // Reset noteRange override and notify UI to restore home bounds
    if (state.homeNoteRangeMin !== null && state.homeNoteRangeMax !== null) {
      this.synthNoteRangeOverrides[laneIndex] = null;
      this.onSynthNoteRangeEvolved?.(laneIndex, state.homeNoteRangeMin, state.homeNoteRangeMax);
    } else {
      this.synthNoteRangeOverrides[laneIndex] = null;
    }
  }

  private captureSynthPresetHome(laneIndex: number, pitchState?: { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean } | null): void {
    const state = this.synthEvolveStates[laneIndex] ?? defaultSynthEvolveState();
    this.synthEvolveStates[laneIndex] = state;
    const current = this.extractSynthLaneOverrides(laneIndex);
    const ps = this.synthPitchSettings[laneIndex];
    if (current.pitch && ps && ps.mode !== 'noteRange') current.pitch = this.midiToOffsets(current.pitch, ps);
    state.home = captureSynthHomeSnapshot(current);
    state.homeSwing = this.synthEuclidSwings[laneIndex] ?? 0;
    state.homePitchSettings = ps ? { ...ps } : null;
    state.homePitchScaleQuantize = typeof pitchState?.scaleQuantize === 'boolean' ? false : null;
    state.homePitchSubLaneState = pitchState
      ? { steps: pitchState.steps, direction: pitchState.direction, scaleQuantize: typeof pitchState.scaleQuantize === 'boolean' ? false : pitchState.scaleQuantize }
      : null;
    const sliderState = this.sliderState as unknown as Record<string, unknown> | null;
    if (ps?.mode === 'noteRange' && sliderState) {
      const lane = laneIndex + 1;
      const fallbackMin = laneIndex === 1 ? 76 : laneIndex === 2 ? 52 : laneIndex === 3 ? 88 : 64;
      const fallbackMax = laneIndex === 1 ? 88 : laneIndex === 2 ? 64 : laneIndex === 3 ? 96 : 76;
      const bounded = (value: unknown, fallback: number) => {
        const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
        return Math.max(24, Math.min(108, numeric));
      };
      const override = this.synthNoteRangeOverrides[laneIndex];
      state.homeNoteRangeMin = override?.min ?? bounded(sliderState[`synthEuclid${lane}NoteMin`], fallbackMin);
      state.homeNoteRangeMax = override?.max ?? bounded(sliderState[`synthEuclid${lane}NoteMax`], fallbackMax);
    } else {
      state.homeNoteRangeMin = null;
      state.homeNoteRangeMax = null;
    }
  }

  /** Dice: regenerate synth lane with fresh random overrides, capture as new home. */
  diceSynthEuclidLane(laneIndex: number, intensity: number = 1) {
    const totalSteps = this.synthEuclidTotalStepCounts[laneIndex] || 16;
    const rng = Math.random;
    const inten = clampVal(intensity, 0, 1);

    const currentOv = this.extractSynthLaneOverrides(laneIndex);
    // Convert current pitch from MIDI to offsets for blending with offset-based targets
    const ps = this.synthPitchSettings[laneIndex];
    const currentPitchOffsets = (currentOv.pitch && ps && ps.mode !== 'noteRange')
      ? this.midiToOffsets(currentOv.pitch, ps) : currentOv.pitch;

    // Generate targets (in offset space), blend with current offsets by intensity
    const newPitchOffsets = blendDiceValues(currentPitchOffsets, generateDicePitchOffsets(totalSteps, 4, rng, inten), inten).map(Math.round);
    const newOv: SynthLaneOverrides = {
      pitch: newPitchOffsets,
      pitchDirection: null,
      triggerToggles: new Map<number, boolean>(),
      expression: blendDiceValues(currentOv.expression, generateDiceValues(totalSteps, rng, inten), inten),
      expressionDirection: null,
      morph: blendDiceValues(currentOv.morph, generateDiceValues(totalSteps, rng, inten), inten),
      morphDirection: null,
      distance: blendDiceValues(currentOv.distance, generateDiceValues(totalSteps, rng, inten), inten),
      distanceDirection: null,
      nudge: null,
      nudgeDirection: null,
      probability: blendDiceValues(
        currentOv.probability,
        Array.from({ length: totalSteps }, () => clampVal(0.7 + (rng() - 0.5) * 0.4, 0.3, 1.0)),
        inten,
      ),
      ratchet: blendDiceValues(
        currentOv.ratchet,
        Array.from({ length: totalSteps }, () => rng() < 0.2 ? Math.ceil(rng() * 3) + 1 : 1),
        inten,
      ).map(Math.round),
      trigCondition: currentOv.trigCondition ? currentOv.trigCondition.map((entry) => [entry[0], entry[1]]) : null,
    };

    // Random trigger toggle sparse pattern (scaled by intensity)
    for (let i = 0; i < totalSteps; i++) {
      if (rng() < 0.3 * inten) newOv.triggerToggles.set(i, rng() < 0.5);
    }

    // Convert pitch back to MIDI for engine storage, and push offsets to UI
    const midiOv: SynthLaneOverrides = { ...newOv };
    if (newOv.pitch && ps && ps.mode !== 'noteRange') {
      midiOv.pitch = this.offsetsToMidi(newOv.pitch, ps);
    }
    this.applySynthLaneOverrides(laneIndex, midiOv);
    this.onSynthEvolveTrigger?.(laneIndex);
    // Push offsets to UI (no conversion needed)
    const subLaneStates = synthEvolvedSubLaneStatePatch(newOv);
    this.onSynthEvolveOverridesChanged?.(laneIndex, {
      ...newOv,
      swing: this.synthEuclidSwings[laneIndex] ?? 0,
      ...(Object.keys(subLaneStates).length > 0 ? { subLaneStates } : {}),
    });

    // Capture offsets as new home
    const state = this.synthEvolveStates[laneIndex];
    if (state) {
      state.home = captureSynthHomeSnapshot(newOv);
      state.homeSwing = this.synthEuclidSwings[laneIndex] ?? 0;
    }
  }

  /** Extract per-lane overrides from the flat synthStepOverrides structure. */
  private extractSynthLaneOverrides(laneIndex: number): SynthLaneOverrides {
    const ov = this.synthStepOverrides;
    return {
      pitch: ov.pitch[laneIndex] ? [...ov.pitch[laneIndex]!] : null,
      pitchDirection: ov.pitchDirection[laneIndex] ?? null,
      triggerToggles: new Map(ov.triggerToggles[laneIndex]),
      expression: ov.expression[laneIndex] ? [...ov.expression[laneIndex]!] : null,
      expressionDirection: ov.expressionDirection[laneIndex] ?? null,
      morph: ov.morph[laneIndex] ? [...ov.morph[laneIndex]!] : null,
      morphDirection: ov.morphDirection[laneIndex] ?? null,
      distance: ov.distance[laneIndex] ? [...ov.distance[laneIndex]!] : null,
      distanceDirection: ov.distanceDirection[laneIndex] ?? null,
      nudge: ov.nudge[laneIndex] ? [...ov.nudge[laneIndex]!] : null,
      nudgeDirection: ov.nudgeDirection[laneIndex] ?? null,
      probability: ov.probability[laneIndex] ? [...ov.probability[laneIndex]!] : null,
      ratchet: ov.ratchet[laneIndex] ? [...ov.ratchet[laneIndex]!] : null,
      trigCondition: ov.trigCondition[laneIndex] ? ov.trigCondition[laneIndex]!.map((entry) => [entry[0], entry[1]]) : null,
    };
  }

  /** Write mutated per-lane overrides back to the flat structure. */
  private applySynthLaneOverrides(laneIndex: number, ov: SynthLaneOverrides) {
    this.synthStepOverrides.pitch[laneIndex] = ov.pitch ? [...ov.pitch] : null;
    this.synthStepOverrides.pitchDirection[laneIndex] = ov.pitchDirection;
    this.synthStepOverrides.triggerToggles[laneIndex] = new Map(ov.triggerToggles);
    this.synthStepOverrides.expression[laneIndex] = ov.expression ? [...ov.expression] : null;
    this.synthStepOverrides.expressionDirection[laneIndex] = ov.expressionDirection;
    this.synthStepOverrides.morph[laneIndex] = ov.morph ? [...ov.morph] : null;
    this.synthStepOverrides.morphDirection[laneIndex] = ov.morphDirection;
    this.synthStepOverrides.distance[laneIndex] = ov.distance ? [...ov.distance] : null;
    this.synthStepOverrides.distanceDirection[laneIndex] = ov.distanceDirection;
    this.synthStepOverrides.nudge[laneIndex] = ov.nudge ? [...ov.nudge] : null;
    this.synthStepOverrides.nudgeDirection[laneIndex] = ov.nudgeDirection;
    this.synthStepOverrides.probability[laneIndex] = ov.probability ? [...ov.probability] : null;
    this.synthStepOverrides.ratchet[laneIndex] = ov.ratchet ? [...ov.ratchet] : null;
    this.synthStepOverrides.trigCondition[laneIndex] = ov.trigCondition ? ov.trigCondition.map((entry) => [entry[0], entry[1]]) : null;
  }

  /** Convert absolute MIDI pitch array → UI offsets (semitone offsets or scale degree indices). */
  private midiToOffsets(midi: number[], ps: { mode: PitchMode; root: number; scale: ScaleName }): number[] {
    if (ps.mode === 'semitones') {
      const si = SCALES[ps.scale] || [0, 2, 4, 5, 7, 9, 11];
      return midi.map(m => {
        const semi = m - ps.root;
        const octave = Math.floor(semi / 12);
        const rem = ((semi % 12) + 12) % 12;
        let bestDeg = 0;
        let bestDist = 99;
        for (let d = 0; d < si.length; d++) {
          const scaleDegree = si[d] ?? rem;
          const dist = Math.abs(scaleDegree - rem);
          if (dist < bestDist) { bestDist = dist; bestDeg = d; }
        }
        return octave * si.length + bestDeg;
      });
    }
    if (ps.mode === 'noteRange') return midi.map(m => m - ps.root);
    return midi.map(m => Math.max(0, Math.min(127, Math.round(m))));
  }

  /** Convert UI offsets (semitone offsets or scale degree indices) → absolute MIDI. */
  private offsetsToMidi(offsets: number[], ps: { mode: PitchMode; root: number; scale: ScaleName }): number[] {
    if (ps.mode === 'semitones') {
      const si = SCALES[ps.scale] || [0, 2, 4, 5, 7, 9, 11];
      return offsets.map(deg => {
        const oct = Math.floor(deg / si.length);
        const idx = ((deg % si.length) + si.length) % si.length;
        return Math.max(0, Math.min(127, ps.root + oct * 12 + (si[idx] ?? 0)));
      });
    }
    if (ps.mode === 'noteRange') return offsets.map(off => Math.max(0, Math.min(127, ps.root + off)));
    return offsets.map(midi => Math.max(0, Math.min(127, Math.round(midi))));
  }

  /** Set per-lane clock divisions for the drum Euclidean sequencer. */
  setDrumEuclidClockDivs(divs: ClockDivision[]) {
    this.pendingDrumClockDivs = divs;
    if (this.drumSynth) {
      this.drumSynth.setEuclidClockDivs(divs);
    }
  }

  /** Set per-lane swing amounts for the drum Euclidean sequencer. */
  setDrumEuclidSwings(swings: number[]) {
    this.pendingDrumSwings = swings.map((swing, index) => normalizeSequencerSwing(swing, this.pendingDrumSwings?.[index] ?? 0));
    if (this.drumSynth) {
      this.drumSynth.setEuclidSwings(this.pendingDrumSwings);
    }
  }

  setDrumMorphRange(voice: DrumVoiceType, range: { min: number; max: number } | null) {
    // Store for later if drumSynth doesn't exist yet
    this.pendingMorphRanges[voice] = range;
    if (this.drumSynth) {
      this.drumSynth.setMorphRange(voice, range);
    }
  }

  setDrumParamSHRange(key: string, range: { min: number; max: number } | null) {
    if (range) {
      this.pendingParamSHRanges.set(key, range);
    } else {
      this.pendingParamSHRanges.delete(key);
    }
    if (this.drumSynth) {
      this.drumSynth.setParamSHRange(key, range);
    }
  }

  setDrumParamSHTriggerCallback(callback: (voice: DrumVoiceType, key: string, position: number) => void) {
    this.onDrumParamSHTrigger = callback;
    if (this.drumSynth) {
      this.drumSynth.setParamSHTriggerCallback(callback);
    }
  }



  setDrumEuclidEvolveConfigs(configs: Partial<DrumEuclidEvolveConfig>[]) {
    this.pendingDrumEuclidEvolveConfigs = this.pendingDrumEuclidEvolveConfigs.map((current, laneIndex) => {
      const incoming = configs[laneIndex] ?? {};
      const enabledSubLanes = mergeEvolveEnabledSubLanes(incoming.enabledSubLanes, current.enabledSubLanes);
      return {
        enabled: incoming.enabled === undefined ? current.enabled : incoming.enabled === true,
        everyBars: typeof incoming.everyBars === 'number' && Number.isFinite(incoming.everyBars)
          ? Math.max(1, Math.round(incoming.everyBars))
          : current.everyBars,
        evolution: typeof incoming.evolution === 'number' && Number.isFinite(incoming.evolution)
          ? Math.max(0, Math.min(1, incoming.evolution))
          : current.evolution,
        writeOffset: normalizeEvolveWriteOffset(incoming.writeOffset, current.writeOffset),
        mutationMode: incoming.mutationMode === 'strict' ? 'strict' : incoming.mutationMode === 'biased' ? 'biased' : current.mutationMode,
        methods: mergeEvolveMethods(current.methods, incoming.methods),
        ...(enabledSubLanes ? { enabledSubLanes } : {}),
      };
    });

    if (this.drumSynth) {
      this.drumSynth.setEuclidEvolveConfigs(this.pendingDrumEuclidEvolveConfigs);
    }
  }

  private getPendingDrumLaneStepCount(laneIndex: number): number {
    const state = this.sliderState ?? this.sourceSliderState;
    const stateKey = `drumEuclid${laneIndex + 1}Steps` as keyof SliderState;
    const raw = state?.[stateKey];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return Math.max(2, Math.min(EUCLIDEAN_STEP_MAX, Math.round(raw)));
    }
    const overrides = this.pendingStepOverrides;
    const length = [
      overrides?.probability[laneIndex],
      overrides?.ratchet[laneIndex],
      overrides?.expression[laneIndex],
      overrides?.pitch?.[laneIndex],
      overrides?.morph[laneIndex],
      overrides?.distance[laneIndex],
    ].find((values): values is number[] => Array.isArray(values) && values.length > 0)?.length;
    return Math.max(2, Math.min(EUCLIDEAN_STEP_MAX, Math.round(length ?? 16)));
  }

  private publishPendingDrumEvolveOverrides(
    laneIndex: number,
    overrides: DrumStepOverrides,
    fallback?: DrumStepOverrides | null,
    options: { includePitchSettings?: boolean } = {},
  ): void {
    const pitchSettings = this.drumHomePitchSettings[laneIndex]
      ? [null, null, null, null] as (SequencerPitchSettings | null)[]
      : null;
    if (pitchSettings) pitchSettings[laneIndex] = { ...this.drumHomePitchSettings[laneIndex]! };
    const subLaneStates = drumStepOverrideSubLaneStatePatch(overrides, laneIndex, fallback);
    if (options.includePitchSettings && this.drumHomePitchSubLaneStates[laneIndex]) {
      subLaneStates.pitch = { ...(subLaneStates.pitch ?? { enabled: false, steps: 1, direction: 'forward' }), ...this.drumHomePitchSubLaneStates[laneIndex]! };
    }
    this.pendingDrumEvolveOverridesCallback?.(laneIndex, {
      ...overrides,
      swing: this.pendingDrumSwings?.[laneIndex] ?? 0,
      subLaneStates,
      ...(options.includePitchSettings && pitchSettings ? { pitchSettings } : {}),
    });
  }

  resetDrumEuclidLaneHome(laneIndex: number) {
    if (this.drumSynth?.resetEuclidLaneToHome(laneIndex)) {
      return;
    }
    const index = Math.max(0, Math.min(DRUM_LANE_INDICES.length - 1, Math.trunc(laneIndex)));
    const previous = this.pendingStepOverrides;
    const restored = cloneDrumStepOverrides(this.pendingStepOverrides);
    const home = this.drumHomeStepOverrides;
    restored.triggerToggles[index] = new Map(home.triggerToggles[index] ?? []);
    restored.probability[index] = home.probability[index] ? [...home.probability[index]!] : null;
    restored.ratchet[index] = home.ratchet[index] ? [...home.ratchet[index]!] : null;
    restored.trigCondition[index] = home.trigCondition[index] ? home.trigCondition[index]!.map((entry) => [entry[0], entry[1]] as TrigCondition) : null;
    restored.expression[index] = home.expression[index] ? [...home.expression[index]!] : null;
    restored.pitch[index] = home.pitch[index] ? [...home.pitch[index]!] : null;
    restored.morph[index] = home.morph[index] ? [...home.morph[index]!] : null;
    restored.distance[index] = home.distance[index] ? [...home.distance[index]!] : null;
    restored.slice[index] = home.slice[index] ? [...home.slice[index]!] : null;
    restored.reverse[index] = home.reverse[index] ? [...home.reverse[index]!] : null;
    restored.expressionDirection[index] = home.expressionDirection[index] ?? null;
    restored.pitchDirection[index] = home.pitchDirection[index] ?? null;
    restored.morphDirection[index] = home.morphDirection[index] ?? null;
    restored.distanceDirection[index] = home.distanceDirection[index] ?? null;
    restored.sliceDirection[index] = home.sliceDirection[index] ?? null;
    restored.reverseDirection[index] = home.reverseDirection[index] ?? null;
    restored.expressionRanges![index] = home.expressionRanges?.[index] ?? null;
    restored.morphRanges![index] = home.morphRanges?.[index] ?? null;
    restored.distanceRanges![index] = home.distanceRanges?.[index] ?? null;
    this.pendingStepOverrides = restored;
    this.publishPendingDrumEvolveOverrides(index, restored, previous, { includePitchSettings: true });
  }

  /** Dice: regenerate drum lane with fresh random pattern + values. */
  diceDrumEuclidLane(laneIndex: number, intensity: number = 1) {
    if (this.drumSynth?.diceEuclidLane(laneIndex, intensity)) {
      return;
    }
    const index = Math.max(0, Math.min(DRUM_LANE_INDICES.length - 1, Math.trunc(laneIndex)));
    const steps = this.getPendingDrumLaneStepCount(index);
    const amount = clampVal(intensity, 0, 1);
    const rng = Math.random;
    const next = cloneDrumStepOverrides(this.pendingStepOverrides);
    const toggles = new Map<number, boolean>();
    const hitTarget = Math.max(1, Math.round(steps * (0.15 + rng() * 0.55)));
    const pattern = seqEuclidean(steps, hitTarget, Math.floor(rng() * steps));
    for (let step = 0; step < steps; step += 1) {
      if (rng() < amount) toggles.set(step, pattern[step] ?? false);
    }
    next.triggerToggles[index] = toggles;
    next.probability[index] = Array.from({ length: steps }, () => clampVal(0.55 + rng() * 0.45, 0, 1));
    next.ratchet[index] = Array.from({ length: steps }, () => rng() < 0.2 * amount ? 2 + Math.floor(rng() * 3) : 1);
    next.expression[index] = Array.from({ length: steps }, () => clampVal(0.55 + rng() * 0.45, 0, 1));
    next.pitch[index] = Array.from({ length: steps }, () => Math.round((rng() - 0.5) * 14 * amount));
    next.morph[index] = Array.from({ length: steps }, () => clampVal(rng(), 0, 1));
    next.distance[index] = Array.from({ length: steps }, () => clampVal(rng(), 0, 1));
    this.pendingStepOverrides = next;
    this.drumHomeStepOverrides = cloneDrumStepOverrides(next);
    this.onDrumEuclidEvolveTrigger?.(index);
    this.publishPendingDrumEvolveOverrides(index, next);
  }

  getDrumVoiceAnalyser(voice: DrumVoiceType): AnalyserNode | undefined {
    return this.drumSynth?.getVoiceAnalyser(voice);
  }

  /** Sync full step overrides from the UI sequencer to the audio engine's scheduler */
  setDrumStepOverrides(overrides: DrumStepOverrides) {
    this.pendingStepOverrides = cloneDrumStepOverrides(overrides);
    if (drumStepOverridesHomeIsEmpty(this.drumHomeStepOverrides)) {
      this.drumHomeStepOverrides = cloneDrumStepOverrides(overrides);
    }
    if (this.drumSynth) {
      this.drumSynth.setStepOverrides(this.pendingStepOverrides);
    }
  }

  /** Set per-lane sub-lane enabled state for drum Euclidean sequencer. */
  setDrumSubLaneEnabled(states: Record<string, boolean>[]) {
    this.pendingDrumSubLaneEnabled = states;
    if (this.drumSynth) {
      this.drumSynth.setEuclidSubLaneEnabled(states);
    }
  }

  /**
   * Lazily create AudioContext + DrumSynth so the drum sequencer works
   * independently of the master play button. Synchronous creation;
   * context resume is fire-and-forget.
   */
  ensureDrumSynth(sliderState: SliderState): void {
    // Create AudioContext if needed
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const isIOSDevice = isIOSLikeDevice();
      this.ctx = new AudioContextClass(isIOSDevice ? { latencyHint: 'playback' } : undefined);
    }
    this.attachAudioContextMonitoring();
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    if (!this.drumSynth) {
      // Need a master gain for drums
      if (!this.masterGain) {
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = (sliderState.masterVolume ?? DEFAULT_MASTER_VOLUME) * MASTER_OUTPUT_TRIM;
        this.limiter = this.createMasterLimiter(this.ctx);
        this.wireMasterOutputChain(this.ctx);
        this.limiter.connect(this.ctx.destination);
      }
      if (!this.reverbNode) {
        // Dummy reverb gain (real reverb is created in full start)
        this.reverbNode = this.ctx.createGain() as any;
      }

      if (!this.rng) {
        const bucket = getUtcBucket(sliderState.seedWindow as 'hour' | 'day' || 'hour');
        const seed = computeSeed(bucket, JSON.stringify(sliderState));
        this.rng = createRng(String(seed));
      }

      this.drumSynth = new DrumSynth(
        this.ctx,
        this.masterGain,
        (this.reverbInputBus ?? this.reverbNode) as any,
        sliderState,
        this.rng,
        () => this.ensureTransportAnchors(),
      );
      // Forward WASM drum node to DrumSynth for trigger routing
      if (this.drumWasmNode) {
        this.drumSynth.setWasmNode(this.drumWasmNode, this.drumWasmReady);
      }
      this.wireDrumSynthCallbacks();
      this.wireDrumGranularSend();
      this.wireDrumDelaySends(this.ctx);
    }
  }

  /** Wire all pending callbacks and overrides onto a freshly-created DrumSynth. */
  private wireDrumSynthCallbacks(): void {
    if (!this.drumSynth) return;
    this.drumSynth.setDrumTriggerCallback(this.drumTriggerRouter);
    if (this.onDrumMorphTrigger) this.drumSynth.setMorphTriggerCallback(this.onDrumMorphTrigger);
    if (this.onDrumParamSHTrigger) this.drumSynth.setParamSHTriggerCallback(this.onDrumParamSHTrigger);
    if (this.onDrumEuclidEvolveTrigger) this.drumSynth.setEuclidEvolveTriggerCallback(this.onDrumEuclidEvolveTrigger);
    if (this.pendingDrumEvolveOverridesCallback) this.drumSynth.setEvolveOverridesChangedCallback(this.pendingDrumEvolveOverridesCallback);
    if (this.onDrumStepPositionChange) this.drumSynth.setStepPositionCallback(this.onDrumStepPositionChange);
    for (const voice of Object.keys(this.pendingMorphRanges) as DrumVoiceType[]) {
      const range = this.pendingMorphRanges[voice];
      if (range) this.drumSynth.setMorphRange(voice, range);
    }
    for (const [key, range] of this.pendingParamSHRanges) {
      this.drumSynth.setParamSHRange(key, range);
    }
    this.drumSynth.setEuclidEvolveConfigs(this.pendingDrumEuclidEvolveConfigs);
    if (this.pendingStepOverrides) {
      this.drumSynth.setStepOverrides(this.pendingStepOverrides);
    }
    if (this.pendingDrumClockDivs) {
      this.drumSynth.setEuclidClockDivs(this.pendingDrumClockDivs);
    }
    if (this.pendingDrumSwings) {
      this.drumSynth.setEuclidSwings(this.pendingDrumSwings);
    }
    if (this.pendingDrumSubLaneEnabled) {
      this.drumSynth.setEuclidSubLaneEnabled(this.pendingDrumSubLaneEnabled);
    }
    if (this.pendingDrumPresetHomeCapture) {
      this.drumSynth.captureEuclidPresetHome();
      this.pendingDrumPresetHomeCapture = false;
    }
  }

  /** Connect drum synth pre-fader output to the granular engine's drum send node. */
  private wireDrumGranularSend(): void {
    if (!this.drumSynth || !this.granularDrumSend || !this.granularFxInputGain) return;
    try {
      const drumPreFader = this.drumSynth.getPreFaderBus();
      drumPreFader.connect(this.granularDrumSend);
      this.granularDrumSend.connect(this.granularFxInputGain);
    } catch (e) {
      console.warn('Failed to wire drum granular send:', e);
    }
  }

  private notifyStateChange() {
    if (!this.onStateChange) return;
    if (this._stateChangeNotifyRaf !== null) return;
    this._stateChangeNotifyRaf = requestAnimationFrame(() => {
      this._stateChangeNotifyRaf = null;
      if (!this.onStateChange) return;
      this.onStateChange({
        isRunning: this.isRunning,
        harmonyState: this.harmonyState,
        currentSeed: this.currentSeed,
        currentBucket: this.currentBucket,
        currentFilterFreq: this.currentFilterFreq,
        currentLfoValue: this.currentLfoValue,
        currentLfo2Value: this.currentLfo2Value,
        cofCurrentStep: this.harmonyState?.cof.currentStep ?? this.cofConfig.currentStep,
        fxOwners: this.getFxOwnerDebugState(),
        transportDebug: this.getTransportDebugStateInternal(),
      });
    });
  }

  // Getter for current filter frequency (for live UI updates)
  getCurrentFilterFreq(): number {
    return this.currentFilterFreq;
  }

  getCurrentLfoValue(): number {
    return this.currentLfoValue;
  }

  getCurrentPadFilterFreq(pad: 'pad1' | 'pad2' = 'pad1'): number {
    return pad === 'pad2' ? this.currentPad2FilterFreq : this.currentPad1FilterFreq;
  }

  getCurrentPadLfoValue(pad: 'pad1' | 'pad2' = 'pad1'): number {
    return pad === 'pad2' ? this.currentPad2LfoValue : this.currentPad1LfoValue;
  }

  getCurrentLfo2Value(): number {
    return this.currentLfo2Value;
  }

  // Get the MediaStream for iOS background audio (connect to HTML audio element)
  getMediaStream(): MediaStream | null {
    return this.mediaStreamDest?.stream || null;
  }

  private euclideanUsesPadSource(state: SliderState | null | undefined = this.sliderState): boolean {
    if (!state?.synthEuclideanMasterEnabled) return false;
    const isPadSource = (source: string | undefined) => typeof source === 'string' && (source === 'pad1' || source === 'pad2' || source.startsWith('synth'));
    return (
      (state.synthEuclid1Enabled && isPadSource(state.synthEuclid1Source)) ||
      (state.synthEuclid2Enabled && isPadSource(state.synthEuclid2Source)) ||
      (state.synthEuclid3Enabled && isPadSource(state.synthEuclid3Source)) ||
      (state.synthEuclid4Enabled && isPadSource(state.synthEuclid4Source))
    );
  }

  // Public resume method for iOS media session
  resume(): void {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Public suspend method for iOS media session
  suspend(): void {
    if (this.ctx?.state === 'running') {
      this.ctx.suspend();
    }
  }

  // Reset Circle of Fifths drift to home key (step 0)
  // Call this when loading a preset or when morph completes
  resetCofDrift(): void {
    this.cofConfig.currentStep = 0;
    this.cofConfig.phraseCounter = 0;
    this.notifyStateChange();
  }

  // Trigger a drum voice manually for sound design testing
  // Works even when global play is off
  async triggerDrumVoice(voice: DrumVoiceType, velocity: number = 0.8, externalState?: SliderState): Promise<void> {
    // Create AudioContext if needed
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const isIOSDevice = isIOSLikeDevice();
      this.ctx = new AudioContextClass(isIOSDevice ? { latencyHint: 'playback' } : undefined);
    }

    // Resume context if suspended (iOS requirement)
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    // Use external state if internal is not available
    const stateToUse = this.sliderState ?? externalState;
    if (!stateToUse) {
      console.warn('No slider state available for drum trigger');
      return;
    }

    // If we have an existing drumSynth, update its params and use it
    if (this.drumSynth) {
      if (externalState) {
        this.drumSynth.updateParams(externalState);
      }
      this.drumSynth.triggerVoice(voice, velocity);
      return;
    }

    // Dispose any previous temp synth immediately (debounce rapid preview taps)
    this.disposeTempDrumSynth();

    // Create a temporary drum synth for testing
    const tempGain = this.ctx.createGain();
    tempGain.gain.value = 1.0;
    tempGain.connect(this.ctx.destination);
    const tempReverb = this.ctx.createGain(); // Dummy reverb node (not connected)

    const rngSource = this.rng ?? Math.random;
    const tempSynth = new DrumSynth(
      this.ctx,
      tempGain,
      tempReverb,
      stateToUse,
      () => rngSource(),
      () => this.ensureTransportAnchors(),
    );
    tempSynth.setDrumTriggerCallback(this.drumTriggerRouter);
    tempSynth.triggerVoice(voice, velocity);

    // Store references so stop() and next preview can clean up
    this.tempDrumSynth = tempSynth;
    this.tempDrumGain = tempGain;
    this.tempDrumReverb = tempReverb;
    this.tempDrumSynthTimer = window.setTimeout(() => {
      this.disposeTempDrumSynth();
    }, 2000); // 2s is plenty for any one-shot percussion decay
  }

  async auditionSynthNote(note: ManualSynthNoteOptions, externalState?: SliderState): Promise<void> {
    const baseState = externalState ?? this.sliderState;
    if (!baseState) {
      console.warn('No slider state available for synth audition');
      return;
    }

    const safeMidi = Math.max(24, Math.min(108, Math.round(note.midi)));
    const velocity = Math.max(0.05, Math.min(1, note.velocity ?? 0.82));
    const frequency = midiToFreq(safeMidi);
    const padSource = note.source === 'pad1' || note.source === 'pad2' ? note.source : null;
    const voiceIndex = padSource ? this.resolveManualPadVoiceIndex(note, padSource, baseState) : null;
    const effectiveState = this.createManualAuditionState(note.source, baseState, voiceIndex);
    const previousState = this.sliderState ?? baseState;

    await this.prepareManualSynthChain(effectiveState, note.source, safeMidi);

    try {
      switch (note.source) {
        case 'lead1':
          this.stopManualLeadAuditionTails();
          this.playLeadNote(frequency, velocity, 'lead1', null, true);
          break;
        case 'lead2':
          this.stopManualLeadAuditionTails();
          this.playLeadNote(frequency, velocity, 'lead2', null, true);
          break;
        case 'piano':
          this.playPianoNote(frequency, velocity);
          break;
        case 'pad1':
        case 'pad2': {
          if (voiceIndex === null) return;
          const isPad2 = note.source === 'pad2';
          const bit = 1 << voiceIndex;
          const originalIsPad2 = ((baseState.pad2VoiceAssign ?? 0) & bit) !== 0;
          const noteState = this.buildPadTriggerState(note.source, effectiveState) ?? effectiveState;
          const noteDuration = note.durationMs !== undefined
            ? Math.max(80, note.durationMs) / 1000
            : this.getManualPadTapDuration(noteState, note.source);
          const release = Math.max(0.05, isPad2 ? (noteState.pad2Release ?? 0.6) : (noteState.synthRelease ?? 0.6));

          this.clearManualPadAuditionTails();
          this.setPadVoiceTarget(voiceIndex, isPad2);
          this.triggerSynthVoice(voiceIndex, frequency, velocity, noteDuration, noteState);

          if (originalIsPad2 !== isPad2) {
            const existingRestore = this.manualPadRouteRestoreTimers[voiceIndex];
            if (existingRestore !== null) {
              clearTimeout(existingRestore);
            }
            const generation = this.synthVoiceNoteGen[voiceIndex];
            this.manualPadRouteRestoreTimers[voiceIndex] = window.setTimeout(() => {
              this.manualPadRouteRestoreTimers[voiceIndex] = null;
              if (this.synthVoiceNoteGen[voiceIndex] === generation) {
                this.setPadVoiceTarget(voiceIndex, originalIsPad2);
              }
            }, Math.round((noteDuration + release + 0.08) * 1000));
          }
          break;
        }
      }
    } finally {
      this.sliderState = previousState;
      this._sliderStateJsonDirty = true;
    }
  }

  async auditionSynthNotes(notes: ManualSynthNoteOptions[], externalState?: SliderState): Promise<void> {
    if (!Array.isArray(notes) || notes.length === 0) return;
    if (notes.length === 1) {
      const onlyNote = notes[0];
      if (onlyNote) await this.auditionSynthNote(onlyNote, externalState);
      return;
    }

    const baseState = externalState ?? this.sliderState;
    if (!baseState) {
      console.warn('No slider state available for synth audition');
      return;
    }

    const entries: Array<{
      note: ManualSynthNoteOptions;
      source: ManualSynthSource;
      safeMidi: number;
      frequency: number;
      velocity: number;
      voiceIndex: number | null;
      originalIsPad2: boolean;
    }> = [];
    let effectiveState = baseState;
    const sources = new Set<ManualSynthSource>();
    for (const note of notes) {
      sources.add(note.source);
      const safeMidi = Math.max(24, Math.min(108, Math.round(note.midi)));
      const padSource = note.source === 'pad1' || note.source === 'pad2' ? note.source : null;
      const voiceIndex = padSource ? this.resolveManualPadVoiceIndex(note, padSource, effectiveState) : null;
      const bit = voiceIndex === null ? 0 : 1 << voiceIndex;
      entries.push({
        note,
        source: note.source,
        safeMidi,
        frequency: midiToFreq(safeMidi),
        velocity: Math.max(0.05, Math.min(1, note.velocity ?? 0.82)),
        voiceIndex,
        originalIsPad2: voiceIndex === null ? false : ((baseState.pad2VoiceAssign ?? 0) & bit) !== 0,
      });
      effectiveState = this.createManualAuditionState(note.source, effectiveState, voiceIndex);
    }

    const previousState = this.sliderState ?? baseState;
    const firstPianoMidi = entries.find((entry) => entry.source === 'piano')?.safeMidi;
    await this.prepareManualSynthChainForSources(effectiveState, sources, firstPianoMidi ?? entries[0]?.safeMidi);

    try {
      if (entries.some((entry) => entry.voiceIndex !== null)) {
        this.clearManualPadAuditionTails();
      }
      if (entries.some((entry) => entry.source === 'lead1' || entry.source === 'lead2')) {
        this.stopManualLeadAuditionTails();
      }
      for (const entry of entries) {
        switch (entry.source) {
          case 'lead1':
            this.playLeadNote(entry.frequency, entry.velocity, 'lead1', null, true);
            break;
          case 'lead2':
            this.playLeadNote(entry.frequency, entry.velocity, 'lead2', null, true);
            break;
          case 'piano':
            this.playPianoNote(entry.frequency, entry.velocity);
            break;
          case 'pad1':
          case 'pad2': {
            if (entry.voiceIndex === null) break;
            const voiceIndex = entry.voiceIndex;
            const isPad2 = entry.source === 'pad2';
            const noteState = this.buildPadTriggerState(entry.source, effectiveState) ?? effectiveState;
            const noteDuration = entry.note.durationMs !== undefined
              ? Math.max(80, entry.note.durationMs) / 1000
              : this.getManualPadTapDuration(noteState, entry.source);
            const release = Math.max(0.05, isPad2 ? (noteState.pad2Release ?? 0.6) : (noteState.synthRelease ?? 0.6));

            this.setPadVoiceTarget(voiceIndex, isPad2);
            this.triggerSynthVoice(voiceIndex, entry.frequency, entry.velocity, noteDuration, noteState);

            if (entry.originalIsPad2 !== isPad2) {
              const existingRestore = this.manualPadRouteRestoreTimers[voiceIndex];
              if (existingRestore !== null) {
                clearTimeout(existingRestore);
              }
              const generation = this.synthVoiceNoteGen[voiceIndex];
              this.manualPadRouteRestoreTimers[voiceIndex] = window.setTimeout(() => {
                this.manualPadRouteRestoreTimers[voiceIndex] = null;
                if (this.synthVoiceNoteGen[voiceIndex] === generation) {
                  this.setPadVoiceTarget(voiceIndex, entry.originalIsPad2);
                }
              }, Math.round((noteDuration + release + 0.08) * 1000));
            }
            break;
          }
        }
      }
    } finally {
      this.sliderState = previousState;
      this._sliderStateJsonDirty = true;
    }
  }

  resetSonicParityFx(): void {
    if (this.granularFxNode instanceof AudioWorkletNode) {
      this.granularFxNode.port.postMessage({ type: 'reset' });
    }
    if (this.reverbPreConditionerNode) {
      this.reverbPreConditionerNode.port.postMessage({ type: 'reset' });
    }
    if (this.reverbNode && (this.reverbNode as any).port) {
      (this.reverbNode as AudioWorkletNode).port.postMessage({ type: 'reset' });
    }
    if (this.driftProcessorNode instanceof AudioWorkletNode) {
      this.driftProcessorNode.port.postMessage({ type: 'reset' });
    }
  }

  getSonicParityDebugState(): Record<string, unknown> {
    const state = this.sliderState;
    const water = state ? this.resolveWaterSoundscapeState(state) : null;
    return {
      engineMode: 'web-ts',
      running: this.isRunning,
      soundscapesWasmReady: this.soundscapesWasmReady,
      soundscapes: state ? {
        parityFixture: this.isSoundscapeParityFixture(state),
        textures: this.getEarthTextureDebugState(),
        waterStarted: this._scWaterStarted,
        waterEnabled: state.waterEnabled,
        waterSignalActive: this.getWaterFamilySendScale(state) > 0.0001,
        waterLevel: state.waterLevel,
        waterPreset: this.getWaterSoundscapePresetIndex(state),
        waterSeed: this.isSoundscapeParityFixture(state) ? 12345 : 'no-change',
        waterParams: water ? {
          intensity: water.waterIntensity,
          distance: water.waterDistance,
          hardDropBaseFreq: water.waterHardDropBaseFreq ?? water.waterBaseFreq,
          waterDropBaseFreq: water.waterWaterDropBaseFreq ?? water.waterBaseFreq,
          dropSize: water.waterDropSize,
          hardness: water.waterHardness,
          glassThickness: water.waterGlassThickness,
          layerMix: [
            water.waterLayerHardDrops,
            water.waterLayerWaterDrops,
            water.waterLayerTurbulence,
            water.waterLayerBubbling,
            water.waterLayerSurf,
            water.waterLayerChannels,
          ],
          surf: [
            water.waterSurfDuration,
            water.waterSurfInterval,
            water.waterSurfFoam,
            water.waterSurfProximity,
            water.waterSurfDepth,
            water.waterSurfBody,
            water.waterSurfSpray,
            water.waterSurfFoamBright,
          ],
          densityLoop: [
            water.waterDensityHardSend,
            water.waterDensityWaterSend,
            water.waterDensityBubbleSend,
            water.waterDensityFeedback,
            water.waterDensityTone,
            water.waterDensityRing,
            water.waterDensityWet,
          ],
          channels: [water.waterChannelsMorph, water.waterChannelsSpeed],
        } : null,
        insectsStarted: this._scInsects1Started,
        insects2Started: this._scInsects2Started,
        insectsEnabled: state.insectsEnabled,
        insects2Enabled: state.insects2Enabled,
        insectsSeed: this.isSoundscapeParityFixture(state) ? 12345 : 'no-change',
        insects2Seed: this.isSoundscapeParityFixture(state) ? 67890 : 'no-change',
      } : null,
      granular: {
        currentBucket: this.currentBucket,
        currentSeed: this.currentSeed,
        randomSeedMaterial: this.lastGranularRandomSeedMaterial,
        randomSequencePreview: this.lastGranularRandomSequencePreview,
        activeGrains: this.granularActiveGrainCount,
        writeHead: this.granularWriteHeadPosition,
        voicePositions: this.granularVoicePositions,
      },
    };
  }

  /** Tear down the temporary one-shot drum synth and clear its timer */
  private disposeTempDrumSynth(): void {
    if (this.tempDrumSynthTimer !== null) {
      clearTimeout(this.tempDrumSynthTimer);
      this.tempDrumSynthTimer = null;
    }
    if (this.tempDrumSynth) {
      try { this.tempDrumSynth.dispose(); } catch { /* ignore */ }
      this.tempDrumSynth = null;
    }
    if (this.tempDrumGain) {
      try { this.tempDrumGain.disconnect(); } catch { /* ignore */ }
      this.tempDrumGain = null;
    }
    if (this.tempDrumReverb) {
      try { this.tempDrumReverb.disconnect(); } catch { /* ignore */ }
      this.tempDrumReverb = null;
    }
  }

  // Play a silent buffer to unlock iOS audio context
  private unlockAudioContext(): void {
    if (!this.ctx) return;

    // Create and play a silent buffer
    const buffer = this.ctx.createBuffer(1, 1, 22050);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.ctx.destination);
    source.start(0);
  }

  private attachAudioContextMonitoring(): void {
    if (!this.ctx) return;
    this.ctx.onstatechange = () => {
      if (!this.ctx) return;
      const shouldResume = this.ctx.state === 'suspended' && (
        this.isRunning ||
        this.synthEuclidStarting ||
        this.synthEuclidScheduleTimer !== null ||
        this.granularTempoSyncTimer !== null ||
        this.drumSynth !== null
      );
      if (shouldResume) {
        this.ctx.resume().then(() => {
          console.log('AudioContext auto-resumed after interruption');
        }).catch(e => console.warn('Auto-resume failed:', e));
      }
    };
  }

  async start(sliderState: SliderState, _coreOptions?: unknown): Promise<void> {
    this.clearSoftStopCleanupTimers();
    if (this.isRunning || this.isStarting) return;
    this.isStarting = true;

    this.sliderState = sliderState;
    this.sourceSliderState = sliderState;
    // Eagerly compute the initial harmony seed snapshot.
    this._sliderStateJsonCache = harmonySeedPayloadJsonFromState(sliderState);
    this._sliderStateJsonDirty = false;

    if (this.graphBootstrapped && !this.hasRequiredBootCapabilities(sliderState)) {
      this.forceHardGraphTeardown = true;
      try {
        this.stop();
      } finally {
        this.forceHardGraphTeardown = false;
      }
    }

    // If a drum-only context exists from independent drum mode, tear it down.
    // We need a fresh context for the full audio graph (worklets can't be re-added).
      if (this.ctx && !this.graphBootstrapped) {
      if (this.drumSynth) {
        this.drumSynth.dispose();
        this.drumSynth = null;
      }
      if (this.padWasmNode) {
        try { this.padWasmNode.port.postMessage({ type: 'destroy' }); } catch { /* */ }
        try { this.padWasmNode.port.close(); } catch { /* */ }
        try { this.padWasmNode.disconnect(); } catch { /* */ }
      }
      this.ctx.close();
      this.ctx = null;
      this.graphBootstrapped = false;
      this.masterGain = null;
      this.limiter = null;
      this.outputGain = null;
      if (this.satPreGain) {
        try { this.satPreGain.disconnect(); } catch { /* */ }
        this.satPreGain = null;
      }
      if (this.satWaveshaper) {
        try { this.satWaveshaper.disconnect(); } catch { /* */ }
        this.satWaveshaper = null;
      }
      if (this.satPostTone) {
        try { this.satPostTone.disconnect(); } catch { /* */ }
        this.satPostTone = null;
      }
      if (this.satPostGain) {
        try { this.satPostGain.disconnect(); } catch { /* */ }
        this.satPostGain = null;
      }
      this.lastMasterSatMode = null;
      this.disposeDriftNodes();
      this.disposeEndCompressorNodes();
      this.disposeSidechainTargetNodes();
      this.reverbNode = null;
      this.reverbOutputGain = null;
      this.sharedDelayA?.dispose();
      this.sharedDelayA = null;
      this.sharedDelayB?.dispose();
      this.sharedDelayB = null;
      this.sharedDelayGranularLinksWired = false;
      // Null lead chain (createAudioGraph will recreate them)
      this.leadGain = null;
      this.leadFilter = null;
      this.leadDry = null;
      this.pad1DelayASend = null;
      this.pad1DelayBSend = null;
      this.pad2DelayASend = null;
      this.pad2DelayBSend = null;
      this.lead1DelayASend = null;
      this.lead1DelayBSend = null;
      this.lead2DelayASend = null;
      this.lead2DelayBSend = null;
      this.drumDelayASend = null;
      this.drumDelayBSend = null;
      this.granularDelayASend = null;
      this.sharedGranularDelayBSend = null;
      this.granularFxModuleContext = null;
      // Null pad synth chain
      this.synthBus = null;
      this.dryBus = null;
      this.pad1ReverbSend = null;
      this.pad2ReverbSend = null;
      this.synthDirect = null;
      this.padWasmNode = null;
      this.padWasmReady = false;
      this.padWasmInitPromise = null;
      this.oceanDelayASend = null;
      this.oceanDelayBSend = null;
      this.waterDelayASend = null;
      this.waterDelayBSend = null;
      this.insectsDelayASend = null;
      this.insectsDelayBSend = null;
      this.voices = [];
      this.resetIndependentSynthContextState();
      this.resetBootCapabilities();
      this.resetWorkletParamCaches();
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!this.ctx) {
      if (!AudioContextClass) {
        console.error('Web Audio API not supported');
        this.isStarting = false;
        throw new Error('Web Audio API not supported in this browser');
      }
      // Use 'playback' latency hint on mobile to request larger audio buffers.
      // It trades a little immediacy for fewer underruns/dropouts on constrained devices.
      const prefersStableMobileBuffers = isMobileDevice();
      this.ctx = new AudioContextClass(prefersStableMobileBuffers ? { latencyHint: 'playback' } : undefined);
      console.log('AudioContext created, state:', this.ctx.state, 'sampleRate:', this.ctx.sampleRate, 'baseLatency:', (this.ctx as any).baseLatency);
      this.attachAudioContextMonitoring();
    }

    // iOS Safari requires resume to be called in response to user interaction
    if (this.ctx.state === 'suspended') {
      console.log('AudioContext suspended, attempting resume...');
      await this.ctx.resume();
      console.log('AudioContext resumed, state:', this.ctx.state);
    }
    this.ensureTransportAnchors();

    // iOS audio unlock with silent buffer
    this.unlockAudioContext();

    // Register worklets with error handling
    // Legacy JS granular worklet REMOVED — all granular processing now handled by Granular FX WASM engine
    if (!this.graphBootstrapped) {
      const requiredBootCapabilities = this.getRequiredBootCapabilities(sliderState);
      const lead1RouteActive = this.isLead1RouteActive(sliderState);
      const lead2RouteActive = this.isLead2RouteActive(sliderState);
      // Eager-load the shared space stack so the first spectral-freeze toggle
      // can switch routing in-place instead of hard-restarting the audio graph.
      const shouldLoadReverb = true;
      const shouldLoadSpectralFreeze = true;
      // Load soundscapes eagerly on first boot so enabling water/insects later
      // can start them in-place without rebuilding the whole audio graph.
      const shouldLoadSoundscapes = true;
      const shouldLoadGranular = requiredBootCapabilities.granular;
      const shouldLoadPadWasm = this.isAnyPadSourceActive(sliderState);
      const shouldLoadLeadFm = lead1RouteActive || lead2RouteActive;
      const shouldLoadDrumWasm = !!sliderState.drumEnabled || !!sliderState.drumEuclidMasterEnabled;

      console.log('Loading worklets...');
      await Promise.all([
      shouldLoadReverb ? (async () => {
        try {
          const reverbWasmUrl = getWorkletUrl('kessho_reverb.wasm');
          const reverbWasmResp = await fetch(reverbWasmUrl);
          if (!reverbWasmResp.ok) throw new Error(`Reverb WASM fetch failed: ${reverbWasmResp.status}`);
          const preconditionerLoad = this.ctx!.audioWorklet.addModule(reverbPreconditionerWorkletUrl)
            .then(() => { this.reverbPreConditionerLoaded = true; })
            .catch((e) => {
              this.reverbPreConditionerLoaded = false;
              console.warn('Reverb preconditioner worklet unavailable, falling back to native DynamicsCompressorNode:', e);
            });
          const [binary] = await Promise.all([
            reverbWasmResp.arrayBuffer(),
            this.ctx!.audioWorklet.addModule(reverbWasmWorkletUrl),
            preconditionerLoad,
          ]);
          this.wasmReverbBinary = binary;
          console.log('Reverb WASM worklet loaded (%d KB)', Math.round(binary.byteLength / 1024));
        } catch (e) {
          console.warn('Reverb WASM load failed (non-fatal, reverb will be unavailable):', e);
        }
      })() : Promise.resolve(),
      shouldLoadSpectralFreeze ? (async () => {
        try {
          const sfWasmUrl = getWorkletUrl('kessho_spectral_freeze.wasm');
          const sfWasmResp = await fetch(sfWasmUrl);
          if (!sfWasmResp.ok) return;
          const [binary] = await Promise.all([
            sfWasmResp.arrayBuffer(),
            this.ctx!.audioWorklet.addModule(spectralFreezeWorkletUrl),
          ]);
          this.wasmSpectralFreezeBinary = binary;
          console.log('Spectral Freeze WASM worklet loaded (%d KB)', Math.round(binary.byteLength / 1024));
        } catch (e) {
          console.warn('Spectral Freeze WASM load failed (non-fatal):', e);
        }
      })() : Promise.resolve(),
      shouldLoadSoundscapes ? (async () => {
        try {
          const scWasmUrl = getWorkletUrl('kessho_soundscapes.wasm');
          const scWasmResp = await fetch(scWasmUrl);
          await this.ctx!.audioWorklet.addModule(soundscapesWorkletUrl);
          console.log('Soundscapes WASM worklet loaded');
          if (scWasmResp.ok) {
            this.wasmSoundscapesBinary = await scWasmResp.arrayBuffer();
            console.log('Soundscapes WASM binary loaded (%d KB)', Math.round(this.wasmSoundscapesBinary.byteLength / 1024));
          } else {
            console.warn('Soundscapes WASM binary not available');
          }
        } catch (e) {
          console.warn('Soundscapes (water/insects) worklet not available:', e);
        }
      })() : Promise.resolve(),
      shouldLoadGranular ? (async () => {
        try {
          const wasmUrl = getWorkletUrl('kessho_granular.wasm');
          const wasmResp = await fetch(wasmUrl);
          if (!wasmResp.ok) throw new Error(`WASM fetch failed: ${wasmResp.status}`);
          const [binary] = await Promise.all([
            wasmResp.arrayBuffer(),
            this.ctx!.audioWorklet.addModule(granularFxWasmWorkletUrl),
          ]);
          this.wasmGranularBinary = binary;
          this.granularFxModuleContext = this.ctx;
          console.log('Granular FX WASM worklet loaded (%d KB)', Math.round(binary.byteLength / 1024));
        } catch (e) {
          this.granularFxModuleContext = null;
          console.error('Failed to load WASM granular:', e);
          console.warn('Granular FX will be unavailable — WASM binary could not be loaded');
        }
      })() : Promise.resolve(),
      shouldLoadPadWasm ? (async () => {
        try {
          const padWasmUrl = getWorkletUrl('kessho_pad.wasm');
          const padResp = await fetch(padWasmUrl);
          if (!padResp.ok) return;
          const [binary] = await Promise.all([
            padResp.arrayBuffer(),
            this.ctx!.audioWorklet.addModule(padSynthWasmWorkletUrl),
          ]);
          this.wasmPadBinary = binary;
          this.padWasmModuleContext = this.ctx;
          console.log('Pad Synth WASM worklet loaded (%d KB)', Math.round(binary.byteLength / 1024));
        } catch (e) {
          console.warn('Pad Synth WASM load failed (non-fatal, JS voices will be used):', e);
        }
      })() : Promise.resolve(),
      shouldLoadLeadFm ? (async () => {
        try {
          const leadFmWasmUrl = getWorkletUrl('kessho_lead_fm.wasm');
          const leadFmResp = await fetch(leadFmWasmUrl);
          if (!leadFmResp.ok) return;
          const [binary] = await Promise.all([
            leadFmResp.arrayBuffer(),
            this.ctx!.audioWorklet.addModule(leadFmWasmWorkletUrl),
          ]);
          this.wasmLeadFmBinary = binary;
          console.log('Lead FM WASM worklet loaded (%d KB)', Math.round(binary.byteLength / 1024));
        } catch (e) {
          console.warn('Lead FM WASM load failed (non-fatal, JS synthesis will be used):', e);
        }
      })() : Promise.resolve(),
      shouldLoadDrumWasm ? (async () => {
        try {
          const drumWasmUrl = getWorkletUrl('kessho_drum.wasm');
          const drumResp = await fetch(drumWasmUrl);
          if (!drumResp.ok) return;
          const [binary] = await Promise.all([
            drumResp.arrayBuffer(),
            this.ctx!.audioWorklet.addModule(drumSynthWasmWorkletUrl),
          ]);
          this.wasmDrumBinary = binary;
          console.log('Drum Synth WASM worklet loaded (%d KB)', Math.round(binary.byteLength / 1024));
        } catch (e) {
          console.warn('Drum Synth WASM load failed (non-fatal, JS synthesis will be used):', e);
        }
      })() : Promise.resolve(),
      ]);

      this.bootCapabilities = {
        reverb: shouldLoadReverb,
        spectralFreeze: shouldLoadSpectralFreeze,
        soundscapes: true,
        granular: !!this.wasmGranularBinary && this.granularFxModuleContext === this.ctx,
      };

      // Create audio graph
      await this.createAudioGraph();
      await this.preloadStartupEarthTextures(sliderState);
      await this.waitForStartupRuntimeReadiness(sliderState);
    }

    // Initialize harmony (sets rng)
    this.initializeHarmony();

    // Create drum synth (always fresh — any prior drum-only instance was torn down above)
    if (!this.drumSynth && this.ctx && this.rng && this.masterGain && this.reverbNode) {
      this.drumSynth = new DrumSynth(
        this.ctx,
        this.masterGain,
        (this.reverbInputBus ?? this.reverbNode),
        this.sliderState!,
        this.rng,
        () => this.ensureTransportAnchors(),
      );
      if (this.drumWasmNode) {
        this.drumSynth.setWasmNode(this.drumWasmNode, this.drumWasmReady);
      }
      this.wireDrumSynthCallbacks();
      this.wireDrumGranularSend();
      this.wireDrumDelaySends(this.ctx);
    } else if (this.drumSynth) {
      this.drumSynth.updateParams(this.sliderState!);
      this.wireDrumSynthCallbacks();
    }

    // Pad audio is WASM-only; do not start legacy JS oscillator voices.

    // Start phrase scheduling
    this.schedulePhraseUpdates();

    // Start lead morph random-walk updates only when auto morph is actually enabled.
    this.syncLeadMorphRandomWalk();

    // Start lead Euclidean scheduler if enabled
    this.stopSynthEuclidScheduler(); // Reset if already running from independent start
    if (this.sliderState?.synthEuclideanMasterEnabled) {
      this.startSynthEuclidScheduler();
    }
    this.stopGranularTempoSyncScheduler();
    if (this.hasGranularTempoSyncVoices(this.sliderState)) {
      this.startGranularTempoSyncScheduler();
    }
    // Start random lead scheduling if enabled
    if (this.sliderState?.leadRandomEnabled && this.isLeadRandomSourceEnabled(this.sliderState)) {
      this.startLeadMelody((this.sliderState.leadRandomSyncPolicy ?? 'nextPhrase') === 'nextPhrase');
    }

    // Start drum synth if enabled
    if (this.drumSynth) {
      this.drumSynth.start();
    }

    this.isRunning = true;
    this.isStarting = false;

    // Media session is now handled in App.tsx for proper iOS support.
    // Apply params after the startup guard is lowered and while the transport is
    // marked running so self-running soundscape layers can start immediately.
    this.applyParams(this.sliderState!);

    this.notifyStateChange();
  }

  stop(): void {
    if (!this.isRunning && !this.forceHardGraphTeardown) return;

    this.clearSoftStopCleanupTimers();
    this.clearPadChordTriggerTimers();

    // Stop CPU perf monitor interval (must be cleared here — survives start/stop otherwise)
    if (this.synthPerfTimer !== null) {
      clearInterval(this.synthPerfTimer);
      this.synthPerfTimer = null;
    }

    // Cancel any pending RAF-batched applyParams
    if (this._applyParamsRaf !== null) {
      cancelAnimationFrame(this._applyParamsRaf);
      this._applyParamsRaf = null;
      this._applyParamsDirty = false;
    }
    if (this._stateChangeNotifyRaf !== null) {
      cancelAnimationFrame(this._stateChangeNotifyRaf);
      this._stateChangeNotifyRaf = null;
    }
    if (this.granularWorkletDispatchTimer !== null) {
      clearTimeout(this.granularWorkletDispatchTimer);
      this.granularWorkletDispatchTimer = null;
    }
    this.pendingGranularWorkletUpdate = null;

    // Stop phrase timer
    if (this.phraseTimer !== null) {
      clearTimeout(this.phraseTimer);
      this.phraseTimer = null;
    }
    this.nextHarmonyEventWallSec = null;

    // Stop lead Euclidean scheduler
    this.stopSynthEuclidScheduler();
    // Stop granular tempo-sync scheduler
    this.stopGranularTempoSyncScheduler();
    this.granularWriteHeadPosition = 0;
    this.granularVoicePositions = [0, 0, 0, 0];
    this.granularActiveGrainCount = 0;
    this.granularVisualEvents = [];
    // Stop lead random melody timer
    if (this.leadMelodyTimer !== null) {
      clearTimeout(this.leadMelodyTimer);
      this.leadMelodyTimer = null;
    }
    for (const timeout of this.leadNoteTimeouts) clearTimeout(timeout);
    this.leadNoteTimeouts = [];

    // Clear tracked voice release and ratchet timers
    for (const t of this.voiceReleaseTimers) clearTimeout(t);
    this.voiceReleaseTimers.clear();
    for (const t of this.ratchetTimers) clearTimeout(t);
    this.ratchetTimers.clear();
    for (let i = 0; i < this.synthVoiceNoteOffTimers.length; i++) {
      const timerId = this.synthVoiceNoteOffTimers[i];
      if (timerId !== null) clearTimeout(timerId);
      this.synthVoiceNoteOffTimers[i] = null;
      const restoreTimerId = this.manualPadRouteRestoreTimers[i];
      if (restoreTimerId !== null) clearTimeout(restoreTimerId);
      this.manualPadRouteRestoreTimers[i] = null;
    }
    // Stop lead morph random-walk timer
    if (this.leadMorphTimer !== null) {
      clearInterval(this.leadMorphTimer);
      this.leadMorphTimer = null;
    }
    this.stopJourneyMorphClock();

    const now = this.ctx?.currentTime ?? 0;

    if (this.graphBootstrapped && !this.forceHardGraphTeardown) {
      this.cancelPianoPriorityWarmup();
      this.softStopGraphSources(now);
      this.isRunning = false;
      this.notifyStateChange();
      return;
    }

    for (const voice of Array.from(this.activePianoVoices)) {
      try { voice.source.stop(); } catch { /* ignore stale piano source */ }
      try { voice.source.disconnect(); } catch { /* ignore stale piano source */ }
      try { voice.gain.disconnect(); } catch { /* ignore stale piano gain */ }
      try { voice.filter?.disconnect(); } catch { /* ignore stale piano filter */ }
    }
    this.activePianoVoices.clear();

    // Stop voices
    for (const voice of this.voices) {
      try {
        voice.osc1.stop();
        voice.osc2.stop();
        voice.osc3.stop();
        voice.osc4.stop();
        voice.noise?.stop();
      } catch {
        // Ignore
      }
    }
    this.voices = [];

    this.oceanTexturePlayer?.dispose();
    this.oceanTexturePlayer = null;
    if (this.oceanSourceBus) {
      try { this.oceanSourceBus.disconnect(); } catch { /* */ }
      this.oceanSourceBus = null;
    }
    if (this.oceanPreFaderBus) {
      try { this.oceanPreFaderBus.disconnect(); } catch { /* */ }
      this.oceanPreFaderBus = null;
    }
    if (this.oceanFilter) {
      try { this.oceanFilter.disconnect(); } catch { /* */ }
      this.oceanFilter = null;
    }
    if (this.oceanLevelGain) {
      try { this.oceanLevelGain.disconnect(); } catch { /* */ }
      this.oceanLevelGain = null;
    }
    if (this.oceanGateGain) {
      try { this.oceanGateGain.disconnect(); } catch { /* */ }
      this.oceanGateGain = null;
    }
    if (this.natureBus) {
      try { this.natureBus.disconnect(); } catch { /* */ }
      this.natureBus = null;
    }
    if (this.natureLevelGain) {
      try { this.natureLevelGain.disconnect(); } catch { /* */ }
      this.natureLevelGain = null;
    }
    for (const key of ['natureReverbSendTap', 'natureDelayASendTap', 'natureDelayBSendTap', 'natureGranularSendTap'] as const) {
      if (this[key]) {
        try { this[key]?.disconnect(); } catch { /* */ }
        this[key] = null;
      }
    }
    this.birdsTexture = this.destroyEarthTextureRuntime(this.birdsTexture);
    this.birds2Texture = this.destroyEarthTextureRuntime(this.birds2Texture);
    this.frogsTexture = this.destroyEarthTextureRuntime(this.frogsTexture);

    // Disconnect soundscapes WASM worklet + gain nodes
    if (this.soundscapesNode) {
      try { this.soundscapesNode.port.close(); } catch { /* */ }
      try { this.soundscapesNode.disconnect(); } catch { /* */ }
      this.soundscapesNode = null;
    }
    this.soundscapesWasmReady = false;
    this._scWaterStarted = false;
    this._scInsects1Started = false;
    this._scInsects2Started = false;
    this._scInsects1Engine = -1;
    this._scInsects2Engine = -1;
    this._scWaterPreset = -1;
    if (this.waterPreFaderBus) {
      try { this.waterPreFaderBus.disconnect(); } catch { /* */ }
      this.waterPreFaderBus = null;
    }
    if (this.waterGateGain) {
      try { this.waterGateGain.disconnect(); } catch { /* */ }
      this.waterGateGain = null;
    }
    if (this.waterLevelGain) {
      try { this.waterLevelGain.disconnect(); } catch { /* */ }
      this.waterLevelGain = null;
    }
    if (this.waterReverbSend) {
      try { this.waterReverbSend.disconnect(); } catch { /* */ }
      this.waterReverbSend = null;
    }
    if (this.insectsPreFaderBus) {
      try { this.insectsPreFaderBus.disconnect(); } catch { /* */ }
      this.insectsPreFaderBus = null;
    }
    if (this.insectsLevelGain) {
      try { this.insectsLevelGain.disconnect(); } catch { /* */ }
      this.insectsLevelGain = null;
    }
    if (this.granularWaterSend) {
      try { this.granularWaterSend.disconnect(); } catch { /* */ }
      this.granularWaterSend = null;
    }
    if (this.granularInsectsSend) {
      try { this.granularInsectsSend.disconnect(); } catch { /* */ }
      this.granularInsectsSend = null;
    }
    if (this.oceanReverbSendNode) {
      try { this.oceanReverbSendNode.disconnect(); } catch { /* */ }
      this.oceanReverbSendNode = null;
    }
    if (this.insectsReverbSendNode) {
      try { this.insectsReverbSendNode.disconnect(); } catch { /* */ }
      this.insectsReverbSendNode = null;
    }
    if (this.earthBus) {
      try { this.earthBus.disconnect(); } catch { /* */ }
      this.earthBus = null;
    }
    if (this.earthLevelGain) {
      try { this.earthLevelGain.disconnect(); } catch { /* */ }
      this.earthLevelGain = null;
    }
    this.resetWorkletParamCaches();

    // Tear down reverb WASM worklet (free WASM heap + close port)
    if (this.reverbNode) {
      try { (this.reverbNode as AudioWorkletNode).port.postMessage({ type: 'destroy' }); } catch { /* */ }
      try { (this.reverbNode as AudioWorkletNode).port.close(); } catch { /* */ }
      try { this.reverbNode.disconnect(); } catch { /* */ }
      this.reverbNode = null;
    }
    if (this.reverbPreMakeupGain) {
      try { this.reverbPreMakeupGain.disconnect(); } catch { /* */ }
      this.reverbPreMakeupGain = null;
    }
    if (this.reverbPreConditionerNode) {
      try { this.reverbPreConditionerNode.port.postMessage({ type: 'reset' }); } catch { /* */ }
      try { this.reverbPreConditionerNode.port.close(); } catch { /* */ }
      try { this.reverbPreConditionerNode.disconnect(); } catch { /* */ }
      this.reverbPreConditionerNode = null;
    }
    if (this.reverbPreCompressor) {
      try { this.reverbPreCompressor.disconnect(); } catch { /* */ }
      this.reverbPreCompressor = null;
    }

    // Tear down spectral freeze WASM worklet
    if (this.spectralFreezeNode) {
      try { this.spectralFreezeNode.port.postMessage({ type: 'destroy' }); } catch { /* */ }
      try { this.spectralFreezeNode.port.close(); } catch { /* */ }
      try { this.spectralFreezeNode.disconnect(); } catch { /* */ }
      this.spectralFreezeNode = null;
    }

    // Tear down pad synth WASM worklet
    if (this.padWasmNode) {
      try { this.padWasmNode.port.postMessage({ type: 'destroy' }); } catch { /* */ }
      try { this.padWasmNode.port.close(); } catch { /* */ }
      try { this.padWasmNode.disconnect(); } catch { /* */ }
      this.padWasmNode = null;
      this.padWasmReady = false;
      this.padWasmInitPromise = null;
    }

    // Tear down lead FM WASM worklet
    if (this.leadFmWasmNode) {
      try { this.leadFmWasmNode.port.postMessage({ type: 'allNotesOff' }); } catch { /* */ }
      try { this.leadFmWasmNode.port.postMessage({ type: 'destroy' }); } catch { /* */ }
      try { this.leadFmWasmNode.port.close(); } catch { /* */ }
      try { this.leadFmWasmNode.disconnect(); } catch { /* */ }
      this.leadFmWasmNode = null;
      this.leadFmWasmReady = false;
    }

    // Tear down drum synth WASM worklet
    if (this.drumWasmNode) {
      try { this.drumWasmNode.port.postMessage({ type: 'destroy' }); } catch { /* */ }
      try { this.drumWasmNode.port.close(); } catch { /* */ }
      try { this.drumWasmNode.disconnect(); } catch { /* */ }
      this.drumWasmNode = null;
      this.drumWasmReady = false;
    }

    if (this.reverbOutputGain) {
      try { this.reverbOutputGain.disconnect(); } catch { /* */ }
      this.reverbOutputGain = null;
    }
    if (this.satPreGain) { try { this.satPreGain.disconnect(); } catch { /* */ } this.satPreGain = null; }
    if (this.satWaveshaper) { try { this.satWaveshaper.disconnect(); } catch { /* */ } this.satWaveshaper = null; }
    if (this.satPostTone) { try { this.satPostTone.disconnect(); } catch { /* */ } this.satPostTone = null; }
    if (this.satPostGain) { try { this.satPostGain.disconnect(); } catch { /* */ } this.satPostGain = null; }
    this.lastMasterSatMode = null;
    this.disposeDriftNodes();
    this.disposeEndCompressorNodes();
    this.disposeSidechainTargetNodes();
    this.sharedDelayA?.dispose();
    this.sharedDelayA = null;
    this.sharedDelayB?.dispose();
    this.sharedDelayB = null;
    this.sharedDelayGranularLinksWired = false;

    // Disconnect synth bus chains
    if (this.synthBus) { try { this.synthBus.disconnect(); } catch { /* */ } this.synthBus = null; }
    if (this.dryBus) { try { this.dryBus.disconnect(); } catch { /* */ } this.dryBus = null; }
    if (this.pad1ReverbSend) { try { this.pad1ReverbSend.disconnect(); } catch { /* */ } this.pad1ReverbSend = null; }
    if (this.pad2ReverbSend) { try { this.pad2ReverbSend.disconnect(); } catch { /* */ } this.pad2ReverbSend = null; }
    if (this.synthDirect) { try { this.synthDirect.disconnect(); } catch { /* */ } this.synthDirect = null; }
    if (this.diffuseInputBus) { try { this.diffuseInputBus.disconnect(); } catch { /* */ } this.diffuseInputBus = null; }
    if (this.diffuseHighpass) { try { this.diffuseHighpass.disconnect(); } catch { /* */ } this.diffuseHighpass = null; }
    if (this.diffuseLowpass) { try { this.diffuseLowpass.disconnect(); } catch { /* */ } this.diffuseLowpass = null; }
    if (this.diffuseSpreadBus) { try { this.diffuseSpreadBus.disconnect(); } catch { /* */ } this.diffuseSpreadBus = null; }
    if (this.diffuseOutputGain) { try { this.diffuseOutputGain.disconnect(); } catch { /* */ } this.diffuseOutputGain = null; }
    if (this.diffuseReverbSend) { try { this.diffuseReverbSend.disconnect(); } catch { /* */ } this.diffuseReverbSend = null; }
    this.disposeVoiceSpatialChain(this.pad1SpatialChain);
    this.pad1SpatialChain = null;
    this.disposeVoiceSpatialChain(this.pad2SpatialChain);
    this.pad2SpatialChain = null;

    // Disconnect lead synth chain
    if (this.leadGain) { try { this.leadGain.disconnect(); } catch { /* */ } this.leadGain = null; }
    if (this.leadFilter) { try { this.leadFilter.disconnect(); } catch { /* */ } this.leadFilter = null; }
    if (this.leadDry) { try { this.leadDry.disconnect(); } catch { /* */ } this.leadDry = null; }
    if (this.leadWasmLevelGain) { try { this.leadWasmLevelGain.disconnect(); } catch { /* */ } this.leadWasmLevelGain = null; }
    if (this.leadWasmLead2LevelGain) { try { this.leadWasmLead2LevelGain.disconnect(); } catch { /* */ } this.leadWasmLead2LevelGain = null; }
    if (this.lead1ReverbSend) { try { this.lead1ReverbSend.disconnect(); } catch { /* */ } this.lead1ReverbSend = null; }
    if (this.lead2ReverbSend) { try { this.lead2ReverbSend.disconnect(); } catch { /* */ } this.lead2ReverbSend = null; }
    if (this.pianoBus) { try { this.pianoBus.disconnect(); } catch { /* */ } this.pianoBus = null; }
    if (this.pianoLevelGain) { try { this.pianoLevelGain.disconnect(); } catch { /* */ } this.pianoLevelGain = null; }
    if (this.pianoReverbSend) { try { this.pianoReverbSend.disconnect(); } catch { /* */ } this.pianoReverbSend = null; }
    this.disposeVoiceSpatialChain(this.lead1SpatialChain);
    this.lead1SpatialChain = null;
    this.disposeVoiceSpatialChain(this.lead2SpatialChain);
    this.lead2SpatialChain = null;
    this.disposeVoiceSpatialChain(this.pianoSpatialChain);
    this.pianoSpatialChain = null;
    if (this.pad1DelayASend) { try { this.pad1DelayASend.disconnect(); } catch { /* */ } this.pad1DelayASend = null; }
    if (this.pad1DelayBSend) { try { this.pad1DelayBSend.disconnect(); } catch { /* */ } this.pad1DelayBSend = null; }
    if (this.pad2DelayASend) { try { this.pad2DelayASend.disconnect(); } catch { /* */ } this.pad2DelayASend = null; }
    if (this.pad2DelayBSend) { try { this.pad2DelayBSend.disconnect(); } catch { /* */ } this.pad2DelayBSend = null; }
    if (this.lead1DelayASend) { try { this.lead1DelayASend.disconnect(); } catch { /* */ } this.lead1DelayASend = null; }
    if (this.lead1DelayBSend) { try { this.lead1DelayBSend.disconnect(); } catch { /* */ } this.lead1DelayBSend = null; }
    if (this.lead2DelayASend) { try { this.lead2DelayASend.disconnect(); } catch { /* */ } this.lead2DelayASend = null; }
    if (this.lead2DelayBSend) { try { this.lead2DelayBSend.disconnect(); } catch { /* */ } this.lead2DelayBSend = null; }
    if (this.pianoDelayASend) { try { this.pianoDelayASend.disconnect(); } catch { /* */ } this.pianoDelayASend = null; }
    if (this.pianoDelayBSend) { try { this.pianoDelayBSend.disconnect(); } catch { /* */ } this.pianoDelayBSend = null; }
    if (this.drumDelayASend) { try { this.drumDelayASend.disconnect(); } catch { /* */ } this.drumDelayASend = null; }
    if (this.drumDelayBSend) { try { this.drumDelayBSend.disconnect(); } catch { /* */ } this.drumDelayBSend = null; }

    // Tear down Granular FX node + routing gains (prevent orphan worklet processing)
    if (this.granularFxNode) {
      // Tell WASM worklet to free heap before disconnecting
      try { this.granularFxNode.port.postMessage({ type: 'destroy' }); } catch { /* */ }
      try { this.granularFxNode.port.onmessage = null; } catch { /* */ }
      try { this.granularFxNode.port.close(); } catch { /* */ }
      try { this.granularFxNode.disconnect(); } catch { /* */ }
      this.granularFxNode = null;
      this.lastGranularUiActiveSent = null;
    }
    if (this.granularFxInputGain) { try { this.granularFxInputGain.disconnect(); } catch { /* */ } this.granularFxInputGain = null; }
    if (this.granularFxReverbSend) { try { this.granularFxReverbSend.disconnect(); } catch { /* */ } this.granularFxReverbSend = null; }
    if (this.granularFxReverbLPF) { try { this.granularFxReverbLPF.disconnect(); } catch { /* */ } this.granularFxReverbLPF = null; }
    if (this.granularFxReverbCompressor) { try { this.granularFxReverbCompressor.disconnect(); } catch { /* */ } this.granularFxReverbCompressor = null; }
    if (this.granularFxOutputLPF) { try { this.granularFxOutputLPF.disconnect(); } catch { /* */ } this.granularFxOutputLPF = null; }
    if (this.granularFxDirect) { try { this.granularFxDirect.disconnect(); } catch { /* */ } this.granularFxDirect = null; }

    // Stop granular delay vibrato oscillators (prevent orphaned oscillator leak)
    for (const osc of this.granularDelayVibratoOscs) {
      try { osc.stop(); osc.disconnect(); } catch { /* */ }
    }
    this.granularDelayVibratoOscs = [];
    for (const depth of this.granularDelayVibratoDepths) {
      try { depth.disconnect(); } catch { /* */ }
    }
    this.granularDelayVibratoDepths = [];
    // Disconnect granular delay tap nodes
    for (const tap of this.granularDelayTapNodes) {
      try { tap.disconnect(); } catch { /* */ }
    }
    this.granularDelayTapNodes = [];
    for (const gain of this.granularDelayTapGains) {
      try { gain.disconnect(); } catch { /* */ }
    }
    this.granularDelayTapGains = [];
    for (const panner of this.granularDelayTapPanners) {
      try { panner.disconnect(); } catch { /* */ }
    }
    this.granularDelayTapPanners = [];

    // Disconnect granular delay infrastructure nodes (input/output/feedback/tone)
    if (this.granularDelaySendGain) { try { this.granularDelaySendGain.disconnect(); } catch { /* */ } this.granularDelaySendGain = null; }
    if (this.granularDelayInputNode) { try { this.granularDelayInputNode.disconnect(); } catch { /* */ } this.granularDelayInputNode = null; }
    if (this.granularDelayOutputGain) { try { this.granularDelayOutputGain.disconnect(); } catch { /* */ } this.granularDelayOutputGain = null; }
    if (this.granularDelayDirectGain) { try { this.granularDelayDirectGain.disconnect(); } catch { /* */ } this.granularDelayDirectGain = null; }
    if (this.granularDelayReverbSendGain) { try { this.granularDelayReverbSendGain.disconnect(); } catch { /* */ } this.granularDelayReverbSendGain = null; }
    if (this.granularDelayFeedbackGain) { try { this.granularDelayFeedbackGain.disconnect(); } catch { /* */ } this.granularDelayFeedbackGain = null; }
    if (this.granularDelayToneFilter) { try { this.granularDelayToneFilter.disconnect(); } catch { /* */ } this.granularDelayToneFilter = null; }
    if (this.granularDelayASend) { try { this.granularDelayASend.disconnect(); } catch { /* */ } this.granularDelayASend = null; }
    if (this.sharedGranularDelayBSend) { try { this.sharedGranularDelayBSend.disconnect(); } catch { /* */ } this.sharedGranularDelayBSend = null; }

    // Disconnect per-source send gains
    if (this.granularPad1Send) { try { this.granularPad1Send.disconnect(); } catch { /* */ } this.granularPad1Send = null; }
    if (this.granularPad2Send) { try { this.granularPad2Send.disconnect(); } catch { /* */ } this.granularPad2Send = null; }
    if (this.granularLead1Send) { try { this.granularLead1Send.disconnect(); } catch { /* */ } this.granularLead1Send = null; }
    if (this.granularLead2Send) { try { this.granularLead2Send.disconnect(); } catch { /* */ } this.granularLead2Send = null; }
    if (this.granularPianoSend) { try { this.granularPianoSend.disconnect(); } catch { /* */ } this.granularPianoSend = null; }
    if (this.granularDrumSend) { try { this.granularDrumSend.disconnect(); } catch { /* */ } this.granularDrumSend = null; }
    if (this.granularWavesSend) { try { this.granularWavesSend.disconnect(); } catch { /* */ } this.granularWavesSend = null; }
    if (this.oceanDelayASend) { try { this.oceanDelayASend.disconnect(); } catch { /* */ } this.oceanDelayASend = null; }
    if (this.oceanDelayBSend) { try { this.oceanDelayBSend.disconnect(); } catch { /* */ } this.oceanDelayBSend = null; }
    if (this.waterDelayASend) { try { this.waterDelayASend.disconnect(); } catch { /* */ } this.waterDelayASend = null; }
    if (this.waterDelayBSend) { try { this.waterDelayBSend.disconnect(); } catch { /* */ } this.waterDelayBSend = null; }
    if (this.insectsDelayASend) { try { this.insectsDelayASend.disconnect(); } catch { /* */ } this.insectsDelayASend = null; }
    if (this.insectsDelayBSend) { try { this.insectsDelayBSend.disconnect(); } catch { /* */ } this.insectsDelayBSend = null; }

    // Stop drum synth and close everything
    if (this.drumSynth) {
      this.drumSynth.dispose();
      this.drumSynth = null;
    }

    // Clean up any pending temp drum synth from preview tapping
    this.disposeTempDrumSynth();

    // Close AudioContext — full teardown
    this.disposeDriftNodes();
    this.disposeEndCompressorNodes();
    this.disposeSidechainTargetNodes();
    this.ctx?.close();
    this.ctx = null;
    this.graphBootstrapped = false;
    this.resetBootCapabilities();
    this.masterGain = null;
    this.limiter = null;
    this.outputGain = null;
    this.reverbNode = null;
    this.reverbOutputGain = null;
    this.reverbPreCompressor = null;
    this.reverbPreMakeupGain = null;
    this.reverbPreConditionerNode = null;
    this.reverbPreConditionerLoaded = false;
    this.reverbInputBus = null;
    this.reverbDirectSend = null;
    this.transportAnchors = null;
    this.prevSynthEuclidLaneEnabled = [false, false, false, false];
    resetSequencerResumeRuntimeState(this.synthResumeRuntime);

    this.isRunning = false;
    this.notifyStateChange();
  }

  /** Fully tear down drum synth and audio context (for page unload, etc.) */
  dispose(): void {
    if (this.granularWorkletDispatchTimer !== null) {
      clearTimeout(this.granularWorkletDispatchTimer);
      this.granularWorkletDispatchTimer = null;
    }
    this.pendingGranularWorkletUpdate = null;
    this.stopRuntimeRandomWalk();
    this.stopRuntimeAutoMorph();
    this.stopJourneyMorphClock();
    this.cancelPianoPriorityWarmup();
    this.stop();
  }

  updateParams(sliderState: SliderState, _coreOptions?: unknown): void {
    // Always update stored state and CoF config, even when not running
    const prevSourceState = this.sourceSliderState;
    this.sourceSliderState = sliderState;
    if (prevSourceState !== sliderState) {
      this.syncRuntimeAutoMorphSource(sliderState, prevSourceState);
    }
    const walkedState = this.getEffectiveRuntimeRandomWalkState(sliderState);
    const effectiveState = this.getEffectiveRuntimeAutoMorphState(walkedState);
    const prevState = this.sliderState;
    const oldSeedWindow = this.sliderState?.seedWindow;
    this.sliderState = effectiveState;
    this._sliderStateJsonDirty = true;
    this.syncLeadMorphRandomWalk();
    this.syncRuntimeRandomWalk();
    this.syncRuntimeAutoMorph();
    this.ensureTransportAnchors();

    const harmonyTransportChanged = !!prevState && (
      prevState.transportPrimaryClock !== effectiveState.transportPrimaryClock ||
      prevState.phraseLength !== effectiveState.phraseLength ||
      prevState.sequencerMasterBPM !== effectiveState.sequencerMasterBPM ||
      prevState.chordRate !== effectiveState.chordRate ||
      prevState.harmonyClockSource !== effectiveState.harmonyClockSource ||
      prevState.transportBarsPerPhrase !== effectiveState.transportBarsPerPhrase ||
      prevState.transportBeatsPerBar !== effectiveState.transportBeatsPerBar ||
      prevState.chordProgressionClockSource !== effectiveState.chordProgressionClockSource ||
      prevState.chordProgressionPhraseMultiplier !== effectiveState.chordProgressionPhraseMultiplier ||
      !areBooleanArraysEqual(prevState.chordProgressionStepEnabled, effectiveState.chordProgressionStepEnabled)
    );
    const leadTimingChanged = !!prevState && (
      prevState.transportPrimaryClock !== effectiveState.transportPrimaryClock ||
      prevState.leadRandomClockSource !== effectiveState.leadRandomClockSource ||
      prevState.phraseLength !== effectiveState.phraseLength ||
      prevState.sequencerMasterBPM !== effectiveState.sequencerMasterBPM ||
      prevState.transportBarsPerPhrase !== effectiveState.transportBarsPerPhrase ||
      prevState.transportBeatsPerBar !== effectiveState.transportBeatsPerBar
    );
    const synthBeatTransportChanged = !!prevState && (
      prevState.transportPrimaryClock !== effectiveState.transportPrimaryClock ||
      prevState.phraseLength !== effectiveState.phraseLength ||
      prevState.sequencerMasterBPM !== effectiveState.sequencerMasterBPM ||
      prevState.transportBeatsPerBar !== effectiveState.transportBeatsPerBar ||
      prevState.transportBarsPerPhrase !== effectiveState.transportBarsPerPhrase ||
      prevState.synthEuclidClockSource !== effectiveState.synthEuclidClockSource ||
      prevState.synthEuclidJoinPolicy !== effectiveState.synthEuclidJoinPolicy
    );
    const drumBeatTransportChanged = !!prevState && (
      prevState.transportPrimaryClock !== effectiveState.transportPrimaryClock ||
      prevState.phraseLength !== effectiveState.phraseLength ||
      prevState.sequencerMasterBPM !== effectiveState.sequencerMasterBPM ||
      prevState.transportBeatsPerBar !== effectiveState.transportBeatsPerBar ||
      prevState.transportBarsPerPhrase !== effectiveState.transportBarsPerPhrase ||
      prevState.drumEuclidClockSource !== effectiveState.drumEuclidClockSource ||
      prevState.drumEuclidJoinPolicy !== effectiveState.drumEuclidJoinPolicy
    );

    // Update Circle of Fifths config from slider state
    this.cofConfig.enabled = effectiveState.cofDriftEnabled ?? false;
    this.cofConfig.driftRate = effectiveState.cofDriftRate ?? 2;
    this.cofConfig.direction = effectiveState.cofDriftDirection ?? 'cw';
    this.cofConfig.range = effectiveState.cofDriftRange ?? 3;
    // Reset step if CoF is disabled
    if (!this.cofConfig.enabled) {
      this.cofConfig.currentStep = 0;
      this.cofConfig.phraseCounter = 0;
    }

    // If engine is in the middle of starting, skip all audio operations.
    // start() will apply params with the final sliderState when ready.
    if (this.isStarting) return;
    if (this.graphRebuildPromise) return;
    if (this.isRunning && this.graphBootstrapped && !this.hasRequiredBootCapabilities(effectiveState)) {
      void this.rebuildGraphForState(this.sourceSliderState ?? sliderState);
      return;
    }

    // Drum synth operates independently of master play (synchronous)
    if (effectiveState.drumEnabled || effectiveState.drumEuclidMasterEnabled) {
      this.ensureDrumSynth(effectiveState);
    }
    if (this.drumSynth) {
      this.drumSynth.updateParams(effectiveState);
    }
    // Forward drum params to WASM worklet (if active)
    this.sendDrumWasmParams(effectiveState);
    this.sendDrumWasmDelay(effectiveState);

    // If drum is completely off and synth sequencer is off and engine isn't running, tear down context
    if (!this.isRunning && !this.isStarting && !this.graphBootstrapped && !effectiveState.drumEnabled && !effectiveState.drumEuclidMasterEnabled && !effectiveState.synthEuclideanMasterEnabled) {
      if (this.drumSynth) {
        this.drumSynth.dispose();
        this.drumSynth = null;
      }
      if (this.ctx) {
        if (this.padWasmNode) {
          try { this.padWasmNode.port.postMessage({ type: 'destroy' }); } catch { /* */ }
          try { this.padWasmNode.port.close(); } catch { /* */ }
          try { this.padWasmNode.disconnect(); } catch { /* */ }
        }
        this.ctx.close();
        this.ctx = null;
        this.graphBootstrapped = false;
        this.resetBootCapabilities();
        this.resetWorkletParamCaches();
        this.transportAnchors = null;
        this.nextHarmonyEventWallSec = null;
        this.masterGain = null;
        this.limiter = null;
        this.outputGain = null;
        this.satPreGain = null;
        this.satWaveshaper = null;
        this.satPostTone = null;
        this.satPostGain = null;
        this.lastMasterSatMode = null;
        this.disposeDriftNodes();
        this.disposeEndCompressorNodes();
        this.disposeSidechainTargetNodes();
        this.reverbNode = null;
        this.reverbOutputGain = null;
        this.reverbPreCompressor = null;
        this.reverbPreMakeupGain = null;
        this.reverbPreConditionerNode = null;
        this.reverbPreConditionerLoaded = false;
        this.reverbInputBus = null;
        this.reverbDirectSend = null;
        this.sharedDelayA?.dispose();
        this.sharedDelayA = null;
        this.sharedDelayB?.dispose();
        this.sharedDelayB = null;
        this.sharedDelayGranularLinksWired = false;
        // Null lead chain so ensureSynthChain() recreates them with the new context
        this.leadGain = null;
        this.leadFilter = null;
        this.leadDry = null;
        this.pad1DelayASend = null;
        this.pad1DelayBSend = null;
        this.pad2DelayASend = null;
        this.pad2DelayBSend = null;
        this.lead1DelayASend = null;
        this.lead1DelayBSend = null;
        this.lead2DelayASend = null;
        this.lead2DelayBSend = null;
        this.drumDelayASend = null;
        this.drumDelayBSend = null;
        this.granularDelayASend = null;
        this.sharedGranularDelayBSend = null;
        // Null pad synth chain
        this.synthBus = null;
        this.dryBus = null;
        this.pad1ReverbSend = null;
        this.pad2ReverbSend = null;
        this.synthDirect = null;
        this.oceanDelayASend = null;
        this.oceanDelayBSend = null;
        this.waterDelayASend = null;
        this.waterDelayBSend = null;
        this.insectsDelayASend = null;
        this.insectsDelayBSend = null;
        this.oceanTexturePlayer = null;
        this.oceanSourceBus = null;
        this.oceanPreFaderBus = null;
        this.birdsTexture = null;
        this.birds2Texture = null;
        this.frogsTexture = null;
        this.padWasmNode = null;
        this.padWasmReady = false;
        this.padWasmInitPromise = null;
        this.voices = [];
        this.resetIndependentSynthContextState();
      }
    }

    // Synth Euclidean scheduler operates independently of master play (like drum sequencer)
    if (effectiveState.synthEuclideanMasterEnabled && !this.synthEuclidScheduleTimer && !this.synthEuclidStarting) {
      this.startSynthEuclidScheduler();
    } else if (!effectiveState.synthEuclideanMasterEnabled && (this.synthEuclidScheduleTimer || this.synthEuclidStarting)) {
      this.stopSynthEuclidScheduler();
    }

    if (this.isRunning && harmonyTransportChanged) {
      const harmonyPolicy = effectiveState.harmonySyncPolicy ?? 'nextPhrase';
      if (harmonyPolicy === 'restartNow') {
        if (effectiveState.harmonyClockSource === 'localPhrase') {
          this.resetLocalPhraseAnchor();
        } else if (effectiveState.harmonyClockSource === 'localBeat') {
          this.resetLocalBeatAnchor();
        }
        this.initializeHarmony();
        this.schedulePhraseUpdates();
      } else if (harmonyPolicy === 'nextPhrase') {
        this.schedulePhraseUpdates();
      }
    }

    if (this.isRunning && leadTimingChanged && effectiveState.leadRandomEnabled && this.isLeadRandomSourceEnabled(effectiveState)) {
      const leadPolicy = effectiveState.leadRandomSyncPolicy ?? 'nextPhrase';
      this.startLeadMelody(leadPolicy === 'nextPhrase');
    }

    if (this.synthEuclidScheduleTimer && synthBeatTransportChanged) {
      invalidatePendingSequencerResumeBoundaries(this.synthResumeRuntime);
      const resetCounters = (effectiveState.synthEuclidJoinPolicy ?? 'bar') === 'bar';
      if (effectiveState.synthEuclidClockSource === 'localBeat') {
        this.resetLocalBeatAnchor();
      }
      this.resetSynthEuclidTransportAlignment(resetCounters);
    }

    if (this.drumSynth && drumBeatTransportChanged) {
      this.drumSynth.resetTransportAlignment((effectiveState.drumEuclidJoinPolicy ?? 'bar') === 'bar');
    }

    if (this.isRunning && this.hasGranularTempoSyncVoices(effectiveState) && !this.granularTempoSyncTimer) {
      this.startGranularTempoSyncScheduler();
    } else if ((!this.isRunning || !this.hasGranularTempoSyncVoices(effectiveState)) && this.granularTempoSyncTimer) {
      this.stopGranularTempoSyncScheduler();
    }

    // Apply non-drum audio parameters if engine is running OR synth Euclidean is active
    // (Euclidean synth runs independently of master play, but needs continuous param updates)
    if (!this.ctx || (!this.isRunning && !effectiveState.synthEuclideanMasterEnabled)) return;

    const padActive = this.isAnyPadSourceActive(effectiveState);
    if (padActive && !this.padWasmNode) {
      void this.ensurePadWasmForIndependentSynth();
    }

    // If pad output just became fully inactive, release all active synth voices immediately.
    // Euclidean synth lanes can keep pad voices active even when the pad engine toggle is off.
    if (!padActive && this._lastPadEnabled !== false) {
      const now = this.ctx.currentTime;
      const release = Math.max(0.001, effectiveState.synthRelease || 1.0);
      this.voices.forEach((voice) => {
        if (voice.active) {
          voice.envelope.gain.cancelScheduledValues(now);
          voice.envelope.gain.setTargetAtTime(0, now, release / 4);
          voice.active = false;
        }
      });
      this.postPadWasmAllNotesOff();
    }
    this._lastPadEnabled = padActive;

    // If synth chord sequencer was just disabled, silence all synth voices
    // BUT only if no Euclidean lanes are using synth sources
    if (effectiveState.synthChordSequencerEnabled !== true) {
      this.clearPadChordTriggerTimers();
      const isLeadSrc = (s: string) => this.isNonPadMelodicSource(s);
      const euclideanUsesSynth = [
        effectiveState.synthEuclid1Enabled && !isLeadSrc(effectiveState.synthEuclid1Source),
        effectiveState.synthEuclid2Enabled && !isLeadSrc(effectiveState.synthEuclid2Source),
        effectiveState.synthEuclid3Enabled && !isLeadSrc(effectiveState.synthEuclid3Source),
        effectiveState.synthEuclid4Enabled && !isLeadSrc(effectiveState.synthEuclid4Source),
      ].some(Boolean);

      if (!euclideanUsesSynth) {
        this.killAllPadVoicesNow();
      }
    }

    // Schedule applyParams via RAF batching — coalesces rapid updates into 1/frame
    this._applyParamsDirty = true;
    if (this._applyParamsRaf === null) {
      this._applyParamsRaf = requestAnimationFrame(() => {
        this._applyParamsRaf = null;
        if (this._applyParamsDirty && this.sliderState) {
          this._applyParamsDirty = false;
          this.applyParams(this.sliderState);
        }
      });
    }

    // (drum synth params already updated above, before isRunning guard)

    // Only recompute seed if seedWindow setting changed (not on every param change)
    if (oldSeedWindow !== effectiveState.seedWindow) {
      this.recomputeSeed();
    }
  }

  pushMidiMessage(_message: KesshoMidiMessage): void {
    // The legacy web engine keeps MIDI as a UI routing layer. Product and smoke
    // hosts override this method to feed normalized MIDI events into their engines.
  }

  private async createAudioGraph(): Promise<void> {
    if (!this.ctx) return;

    const ctx = this.ctx;

    // Master chain
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = (this.sliderState?.masterVolume ?? DEFAULT_MASTER_VOLUME) * MASTER_OUTPUT_TRIM;

    // Limiter (dynamics compressor configured as limiter)
    this.limiter = this.createMasterLimiter(ctx);
    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = 1;
    this.wireMasterOutputChain(ctx);

    // Synth bus (before granular)
    this.synthBus = ctx.createGain();

    // Dry bus (bypass granular) - just a splitter, level controlled by synthDirect
    this.dryBus = ctx.createGain();
    this.dryBus.gain.value = 1.0;

    // Per-pad reverb sends and direct gain (independent, not crossfade)
    this.pad1ReverbSend = ctx.createGain();
    this.pad1ReverbSend.gain.value = this.sliderState?.pad1ReverbSend ?? 0.7;
    this.pad2ReverbSend = ctx.createGain();
    this.pad2ReverbSend.gain.value = this.sliderState?.pad2ReverbSend ?? 0.7;

    this.synthDirect = ctx.createGain();
    this.synthDirect.gain.value = 1.0;  // Level is per-voice via mixerGain

    // All granular processing is handled by the Granular FX WASM engine.
    // The synthBus → dryBus → synthDirect → masterGain path remains for dry pad signal.

    // Reverb WASM worklet
    if (this.wasmReverbBinary) {
      this.reverbNode = new AudioWorkletNode(ctx, 'reverb-wasm', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.reverbNode.port.onmessage = (e) => {
        if (e.data.type === 'perf') this.handlePerfMessage(e.data);
        else if (e.data.type === 'wasmReady') console.log('Reverb WASM engine initialized');
      };
      // Send WASM binary to reverb worklet
      const reverbBin = this.wasmReverbBinary;
      this.wasmReverbBinary = null;
      this.reverbNode.port.postMessage({ type: 'wasmBinary', binary: reverbBin }, [reverbBin]);
    } else {
      // Silent fallback until the reverb runtime is loaded or intentionally unavailable.
      const fallbackReverb = ctx.createGain();
      fallbackReverb.gain.value = 0;
      this.reverbNode = fallbackReverb as any;
      console.warn('Reverb WASM unavailable — using silent fallback (no reverb)');
    }

    // Reverb output level
    this.reverbOutputGain = ctx.createGain();
    this.reverbOutputGain.gain.value = (this.sliderState?.reverbLevel ?? 0.5) * ENGINE_TRIMS.reverb;

    // Reverb input bus — collects all reverb sources (gain stays at 1.0)
    this.reverbInputBus = ctx.createGain();
    this.reverbInputBus.gain.value = 1.0;

    // Shared pre-reverb dynamics: use a deterministic worklet when available so
    // browser and core parity are not at the mercy of native compressor internals.
    if (this.reverbPreConditionerLoaded) {
      this.reverbPreConditionerNode = new AudioWorkletNode(ctx, 'reverb-preconditioner', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.reverbInputBus.connect(this.reverbPreConditionerNode);
    } else {
      this.reverbPreCompressor = this.createSharedReverbPreCompressor(ctx);
      this.reverbPreMakeupGain = ctx.createGain();
      this.reverbPreMakeupGain.gain.value = this.sliderState?.reverbPreCompMakeup ?? DEFAULT_REVERB_PRE_COMP.makeup;
      this.reverbInputBus.connect(this.reverbPreCompressor);
      this.reverbPreCompressor.connect(this.reverbPreMakeupGain);
    }

    // Direct send — crossfade-controlled path from sources to reverb (used in pre-mode)
    this.reverbDirectSend = ctx.createGain();
    this.reverbDirectSend.gain.value = 1.0;

    // Spectral Freeze WASM worklet
    if (this.wasmSpectralFreezeBinary) {
      this.spectralFreezeNode = new AudioWorkletNode(ctx, 'spectral-freeze-wasm', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      this.spectralFreezeNode.port.onmessage = (e) => {
        if (e.data.type === 'perf') this.handlePerfMessage(e.data);
        else if (e.data.type === 'wasmReady') console.log('Spectral Freeze WASM engine initialized');
      };
      const sfBin = this.wasmSpectralFreezeBinary;
      this.wasmSpectralFreezeBinary = null;
      this.spectralFreezeNode.port.postMessage({ type: 'wasmBinary', binary: sfBin }, [sfBin]);
    }

    // Pad Synth WASM worklet — 6 outputs:
    // [0]=main stereo, [1]=legacy combined reverb send,
    // [2]=Pad 1 pre-fader, [3]=Pad 2 pre-fader,
    // [4]=Pad 1 post-level, [5]=Pad 2 post-level
    if (this.wasmPadBinary) {
      this.createPadWasmNode(ctx);
    }

    // Lead FM WASM worklet — 2 outputs: [0]=lead1 stereo, [1]=lead2 stereo (includes shared internal delay)
    if (this.wasmLeadFmBinary) {
      this.leadFmWasmNode = new AudioWorkletNode(ctx, 'lead-fm-wasm', {
        numberOfInputs: 0,
        numberOfOutputs: 2,
        outputChannelCount: [2, 2],
      });
      this.leadFmWasmNode.port.onmessage = (e) => {
        if (e.data.type === 'wasmReady') {
          this.leadFmWasmReady = true;
          console.log('Lead FM WASM engine initialized');
          // Send initial morphed preset params so WASM has sane defaults
          const initMorphed = morphPresets(
            this.lead1PresetA, this.lead1PresetB,
            0.5, this.sliderState?.lead1AlgorithmMode ?? 'snap',
          );
          this.leadFmWasmNode!.port.postMessage({ type: 'params', params: initMorphed });
          // Send initial delay params
          if (this.sliderState) this.sendLeadFmWasmDelay(this.sliderState);
        } else if (e.data.type === 'perf') {
          this.handlePerfMessage(e.data);
        }
      };
      const leadFmBin = this.wasmLeadFmBinary;
      this.wasmLeadFmBinary = null;
      this.leadFmWasmNode.port.postMessage({ type: 'wasmBinary', binary: leadFmBin }, [leadFmBin]);
    }

    // Drum Synth WASM worklet — 2 outputs: [0]=main stereo, [1]=reverb send
    if (this.wasmDrumBinary) {
      this.drumWasmNode = new AudioWorkletNode(ctx, 'drum-synth-wasm', {
        numberOfInputs: 0,
        numberOfOutputs: 2,
        outputChannelCount: [2, 2],
      });
      this.drumWasmNode.port.onmessage = (e) => {
        if (e.data.type === 'wasmReady') {
          this.drumWasmReady = true;
          console.log('Drum Synth WASM engine initialized');
          // Send initial drum params
          if (this.sliderState) this.sendDrumWasmParams(this.sliderState);
          // Notify DrumSynth that WASM is ready for triggers
          if (this.drumSynth) this.drumSynth.setWasmNode(this.drumWasmNode, true);
        } else if (e.data.type === 'perf') {
          this.handlePerfMessage(e.data);
        }
      };
      const drumBin = this.wasmDrumBinary;
      this.wasmDrumBinary = null;
      this.drumWasmNode.port.postMessage({ type: 'wasmBinary', binary: drumBin }, [drumBin]);
    }

    // Lead synth (Rhodes/Bell)
    this.leadGain = ctx.createGain();
    this.leadGain.gain.value = this.sliderState
      ? ((this.isLead1RouteActive(this.sliderState) || this.isLead2RouteActive(this.sliderState) || this.usesRandomLeadPath(this.sliderState)) ? 1.0 : 0)
      : 0;

    this.leadFilter = ctx.createBiquadFilter();
    this.leadFilter.type = 'lowpass';
    this.leadFilter.frequency.value = 4000;
    this.leadFilter.Q.value = 0.7;

    this.leadDry = ctx.createGain();
    this.leadDry.gain.value = 1.0; // Dry-path level lives on lead1/2LevelGain and WASM lead level gains

    // Per-lead reverb sends (tapped from lead1Bus/lead2Bus before shared filter)
    this.lead1ReverbSend = ctx.createGain();
    this.lead1ReverbSend.gain.value = this.sliderState?.lead1ReverbSend ?? 0.5;
    this.lead2ReverbSend = ctx.createGain();
    this.lead2ReverbSend.gain.value = this.sliderState?.lead2ReverbSend ?? 0.5;

    // Soundscapes WASM worklet — water + insects
    // 3 outputs: [0]=water stereo, [1]=insects dry stereo, [2]=insects pre-fader stereo
    if (this.wasmSoundscapesBinary) {
      this.soundscapesNode = new AudioWorkletNode(ctx, 'soundscapes-wasm', {
        numberOfInputs: 0,
        numberOfOutputs: 3,
        outputChannelCount: [2, 2, 2],
      });
      const binary = this.wasmSoundscapesBinary;
      this.wasmSoundscapesBinary = null;
      this.soundscapesNode.port.postMessage({ type: 'wasmBinary', binary }, [binary]);
      this.soundscapesNode.port.onmessage = (e) => {
        if (e.data.type === 'wasmReady') {
          this.soundscapesWasmReady = true;
          console.log('Soundscapes WASM engine initialized');
          if (this.sliderState) {
            this.scheduleApplyParamsRefresh();
          }
        } else if (e.data.type === 'perf') {
          this.handlePerfMessage(e.data);
        } else if (e.data.type === 'surfTrigger' && this.onGranularSHTrigger) {
          this.onGranularSHTrigger(e.data.positions ?? {});
        }
      };
    }

    // Earth master bus: all Earth engines feed earthBus → earthLevelGain → masterGain
    this.earthBus = ctx.createGain();
    this.earthBus.gain.value = 1.0;
    this.earthLevelGain = ctx.createGain();
    this.earthLevelGain.gain.value = this.sliderState?.earthLevel ?? 1.0;

    // Soundscapes gain nodes — pre-fader buses for reverb/granular taps
    this.waterPreFaderBus = ctx.createGain();
    this.waterPreFaderBus.gain.value = 1.0;
    this.waterGateGain = ctx.createGain();
    this.waterGateGain.gain.value = 0;
    this.waterLevelGain = ctx.createGain();
    this.waterLevelGain.gain.value = 0;
    this.waterReverbSend = ctx.createGain();
    this.waterReverbSend.gain.value = 0;

    this.insectsPreFaderBus = ctx.createGain();
    this.insectsPreFaderBus.gain.value = 1.0;
    this.insectsLevelGain = ctx.createGain();
    this.insectsLevelGain.gain.value = 0;

    this.oceanLevelGain = ctx.createGain();
    this.oceanLevelGain.gain.value = this.sliderState?.oceanSampleLevel ?? 0;

    this.oceanReverbSendNode = ctx.createGain();
    this.oceanReverbSendNode.gain.value = this.sliderState?.oceanReverbSend ?? 0.2;

    this.insectsReverbSendNode = ctx.createGain();
    this.insectsReverbSendNode.gain.value = this.sliderState?.insectsReverbSend ?? 0.15;

    this.natureBus = ctx.createGain();
    this.natureBus.gain.value = 1.0;
    this.natureLevelGain = ctx.createGain();
    this.natureLevelGain.gain.value = this.sliderState?.natureLevel ?? 1.0;
    this.natureReverbSendTap = ctx.createGain();
    this.natureReverbSendTap.gain.value = 1.0;
    this.natureDelayASendTap = ctx.createGain();
    this.natureDelayASendTap.gain.value = 1.0;
    this.natureDelayBSendTap = ctx.createGain();
    this.natureDelayBSendTap.gain.value = 1.0;
    this.natureGranularSendTap = ctx.createGain();
    this.natureGranularSendTap.gain.value = 1.0;

    const soundscapeParityFixture = this.isSoundscapeParityFixture(this.sliderState);

    this.oceanSourceBus = ctx.createGain();
    this.oceanSourceBus.gain.value = 1.0;
    this.oceanGateGain = ctx.createGain();
    this.oceanGateGain.gain.value = 0;
    this.oceanTexturePlayer = new EarthTexturePlayer(ctx, this.oceanSourceBus, {
      fileName: 'Ghetary-Waves-Rocks_120s_m_441_cl-normalized.ogg',
      sliceDuration: 22,
      fadeTime: 5.5,
      density: 0.38,
      randomSeed: this.createEarthTextureSeed('ocean'),
      parityDeterministic: soundscapeParityFixture,
    });

    this.birdsTexture = this.createEarthTextureRuntime(ctx, {
      fileName: 'Alps Birds 2_noiseremoval_441_m.ogg',
      sliceDuration: 20,
      fadeTime: 3.2,
      density: 0.45,
      randomSeed: this.createEarthTextureSeed('birds'),
      delayMs: 13,
      sideGain: 0.42,
      centerGain: 0.56,
      initialLevel: this.sliderState?.birdsLevel ?? 0,
      initialReverbSend: this.sliderState?.natureReverbSend ?? 0.18,
      dryDestination: this.natureBus,
      parityDryBypass: soundscapeParityFixture,
      parityDeterministic: soundscapeParityFixture,
    });
    this.birdsTexture.reverbSend.connect(this.natureReverbSendTap);
    this.birds2Texture = this.createEarthTextureRuntime(ctx, {
      fileName: 'Fujian Birds 2_441_m_normalized.ogg',
      sliceDuration: 20,
      fadeTime: 3.1,
      density: 0.48,
      randomSeed: this.createEarthTextureSeed('birds2'),
      delayMs: 15,
      sideGain: 0.45,
      centerGain: 0.5,
      initialLevel: this.sliderState?.birds2Level ?? 0,
      initialReverbSend: this.sliderState?.natureReverbSend ?? 0.18,
      dryDestination: this.natureBus,
      parityDryBypass: soundscapeParityFixture,
      parityDeterministic: soundscapeParityFixture,
    });
    this.birds2Texture.reverbSend.connect(this.natureReverbSendTap);
    this.frogsTexture = this.createEarthTextureRuntime(ctx, {
      fileName: 'Fujian_Frogs_m_441_normalized.ogg',
      sliceDuration: 18,
      fadeTime: 2.6,
      density: 0.52,
      randomSeed: this.createEarthTextureSeed('frogs'),
      delayMs: 12,
      sideGain: 0.36,
      centerGain: 0.68,
      initialLevel: this.sliderState?.frogsLevel ?? 0,
      initialReverbSend: this.sliderState?.natureReverbSend ?? 0.18,
      dryDestination: this.natureBus,
      parityDryBypass: soundscapeParityFixture,
      parityDeterministic: soundscapeParityFixture,
    });
    this.frogsTexture.reverbSend.connect(this.natureReverbSendTap);

    // Granular FX (unified granular engine)
    const canCreateGranularFx = !!this.wasmGranularBinary && this.granularFxModuleContext === ctx;
    if (canCreateGranularFx) {
      try {
      this.granularFxNode = new AudioWorkletNode(ctx, 'granular-fx-wasm', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
        channelCountMode: 'explicit',  // always deliver 2 channels even if sources are mono
      });
      // Listen for position updates and perf reports from worklet
      this.granularFxNode.port.onmessage = (e) => {
        if (e.data.type === 'position') {
          this.granularWriteHeadPosition = e.data.writeHead;
          this.granularVoicePositions = e.data.voices;
          this.granularActiveGrainCount = e.data.activeGrains ?? 0;
          if (e.data.waveform) {
            this.granularBufferWaveform = e.data.waveform;
          }
          if (Array.isArray(e.data.grainEvents)) {
            this.granularVisualEvents = e.data.grainEvents;
          }
        } else if (e.data.type === 'perf') {
          this.handlePerfMessage(e.data);
        } else if (e.data.type === 'wasmReady') {
          console.log('Granular FX WASM engine initialized');
        }
      };

      // Send WASM binary to worklet
      if (this.wasmGranularBinary) {
        const toTransfer = this.wasmGranularBinary;
        this.wasmGranularBinary = null;
        this.granularFxNode.port.postMessage(
          { type: 'wasmBinary', binary: toTransfer },
          [toTransfer] // transfer ownership
        );
      }
      this.lastGranularUiActiveSent = null;
      this.syncGranularUiActive();

      // Send enablePerf immediately if monitoring is active
      if (this.perfMonitorEnabled) {
        this.granularFxNode.port.postMessage({ type: 'enablePerf', enabled: true });
      }

      this.granularFxInputGain = ctx.createGain();
      this.granularFxInputGain.gain.value = 1.0;

      this.granularFxReverbSend = ctx.createGain();
      this.granularFxReverbSend.gain.value = (this.sliderState?.granularReverbSend ?? 0.3) * ENGINE_TRIMS.granular;

      // Pre-reverb LPF (darkens reverb trail without affecting dry output)
      this.granularFxReverbLPF = ctx.createBiquadFilter();
      this.granularFxReverbLPF.type = 'lowpass';
      this.granularFxReverbLPF.frequency.value = this.sliderState?.granularReverbLPF ?? 4000;
      this.granularFxReverbLPF.Q.value = 0.7;

      // Pre-reverb compressor (tames transient peaks before they hit reverb)
      this.granularFxReverbCompressor = ctx.createDynamicsCompressor();
      this.granularFxReverbCompressor.threshold.value = -24;
      this.granularFxReverbCompressor.ratio.value = 4;
      this.granularFxReverbCompressor.attack.value = 0.003;
      this.granularFxReverbCompressor.release.value = 0.25;
      this.granularFxReverbCompressor.knee.value = 6;

      // Output LPF (tames overall brightness on dry path)
      this.granularFxOutputLPF = ctx.createBiquadFilter();
      this.granularFxOutputLPF.type = 'lowpass';
      this.granularFxOutputLPF.frequency.value = this.sliderState?.granularOutputLPF ?? 12000;
      this.granularFxOutputLPF.Q.value = 0.7;

      this.granularFxDirect = ctx.createGain();
      this.granularFxDirect.gain.value = this.sliderState?.granularEnabled
        ? (this.sliderState?.granularLevel ?? 0.5) * ENGINE_TRIMS.granular
        : 0;

      // Per-source send gain nodes (each source → granularFxInputGain)
      this.granularPad1Send = ctx.createGain();
      this.granularPad1Send.gain.value = this.sliderState?.granularPad1Send ?? 1.0;

      this.granularPad2Send = ctx.createGain();
      this.granularPad2Send.gain.value = this.sliderState?.granularPad2Send ?? 0.0;

      this.granularLead1Send = ctx.createGain();
      this.granularLead1Send.gain.value = this.sliderState?.granularLead1Send ?? 0.0;

      this.granularLead2Send = ctx.createGain();
      this.granularLead2Send.gain.value = this.sliderState?.granularLead2Send ?? 0.0;

      this.granularPianoSend = ctx.createGain();
      this.granularPianoSend.gain.value = this.sliderState?.granularPianoSend ?? 0.0;

      this.granularDrumSend = ctx.createGain();
      this.granularDrumSend.gain.value = this.sliderState?.granularDrumSend ?? 0.0;

      this.granularWavesSend = ctx.createGain();
      this.granularWavesSend.gain.value = this.sliderState?.granularWavesSend ?? 0.0;

      this.granularWaterSend = ctx.createGain();
      this.granularWaterSend.gain.value = this.sliderState?.granularWaterSend ?? 0.0;

      this.granularInsectsSend = ctx.createGain();
      this.granularInsectsSend.gain.value = this.sliderState?.granularInsectsSend ?? 0.0;

      // Note: randomSequence is sent later via sendGranularRandomSequence()
      // (rng is not yet initialized at this point)
      } catch (e) {
        console.warn('Granular FX worklet not available:', e);
      }
    } else if (this.sliderState && this.getRequiredBootCapabilities(this.sliderState).granular) {
      console.warn('Granular FX skipped because its WASM worklet was not loaded');
    }

    // Pad audio is WASM-only. Legacy JS oscillator voices stay dormant so WASM
    // init/routing mistakes are audible instead of being hidden by a fallback.

    // Create pad split buses (post-fader for main mix, pre-fader for granular)
    this.pad1Bus = ctx.createGain();
    this.pad1Bus.gain.value = 1.0;
    this.pad2Bus = ctx.createGain();
    this.pad2Bus.gain.value = 1.0;
    this.pad1PreFaderBus = ctx.createGain();
    this.pad1PreFaderBus.gain.value = 1.0;
    this.pad2PreFaderBus = ctx.createGain();
    this.pad2PreFaderBus.gain.value = 1.0;
    this.lead1Bus = ctx.createGain();
    this.lead1Bus.gain.value = 1.0;
    this.lead2Bus = ctx.createGain();
    this.lead2Bus.gain.value = 1.0;
    this.pianoBus = ctx.createGain();
    this.pianoBus.gain.value = 1.0;
    this.lead1LevelGain = ctx.createGain();
    this.lead1LevelGain.gain.value = this.sliderState?.lead1Level ?? 0.8;
    this.lead2LevelGain = ctx.createGain();
    this.lead2LevelGain.gain.value = this.sliderState?.lead2Level ?? 0.6;
    this.pianoLevelGain = ctx.createGain();
    this.pianoLevelGain.gain.value = (this.sliderState?.pianoLevel ?? 0.75) * ENGINE_TRIMS.piano;
    this.pianoReverbSend = ctx.createGain();
    this.pianoReverbSend.gain.value = this.sliderState?.pianoReverbSend ?? 0.35;

    // Connect graph:
    // Voices -> mixerGain -> Pad1Bus/Pad2Bus -> post LPF/width -> SynthBus (post-fader main mix)
    // Voices -> envelope  -> Pad1PreFaderBus/Pad2PreFaderBus -> GranularPadSend (pre-fader granular)
    // Lead notes -> Lead1Bus/Lead2Bus -> dry faders -> post LPF/width -> LeadVoiceLevel -> LeadDry
    // Piano notes -> PianoBus -> dry fader -> post LPF/width -> Master

    this.leadVoiceLevel = ctx.createGain();
    this.leadVoiceLevel.gain.value = ENGINE_TRIMS.lead;
    this.leadVoiceLevel.connect(this.leadDry);
    this.leadDry.connect(this.masterGain);
    this.ensureDiffuseBus(ctx);

    this.pad1SpatialChain = this.createVoiceSpatialChain(ctx, {
      initialPostLpf: applyDistanceValue('padPostLPF', this.sliderState!, 'pad1'),
      initialStereoWidth: applyDistanceValue('padStereoWidth', this.sliderState!, 'pad1'),
      initialDiffuseSend: applyDistanceValue('padDiffuseSend', this.sliderState!, 'pad1'),
      dryDestination: this.getSidechainTargetInput(ctx, 'pad1', this.synthBus!),
      postLpfSlope: 24,
    });
    this.pad2SpatialChain = this.createVoiceSpatialChain(ctx, {
      initialPostLpf: applyDistanceValue('pad2PostLPF', this.sliderState!, 'pad2'),
      initialStereoWidth: applyDistanceValue('pad2StereoWidth', this.sliderState!, 'pad2'),
      initialDiffuseSend: applyDistanceValue('pad2DiffuseSend', this.sliderState!, 'pad2'),
      dryDestination: this.getSidechainTargetInput(ctx, 'pad2', this.synthBus!),
      postLpfSlope: 24,
    });
    this.lead1SpatialChain = this.createVoiceSpatialChain(ctx, {
      initialPostLpf: this.getLeadPostLpfCutoff(this.sliderState!, 'lead1'),
      initialStereoWidth: applyDistanceValue('lead1StereoWidth', this.sliderState!, 'lead1'),
      initialDiffuseSend: applyDistanceValue('lead1DiffuseSend', this.sliderState!, 'lead1'),
      dryDestination: this.getSidechainTargetInput(ctx, 'lead1', this.leadVoiceLevel!),
      postLpfSlope: 24,
    });
    this.lead2SpatialChain = this.createVoiceSpatialChain(ctx, {
      initialPostLpf: this.getLeadPostLpfCutoff(this.sliderState!, 'lead2'),
      initialStereoWidth: applyDistanceValue('lead2StereoWidth', this.sliderState!, 'lead2'),
      initialDiffuseSend: applyDistanceValue('lead2DiffuseSend', this.sliderState!, 'lead2'),
      dryDestination: this.getSidechainTargetInput(ctx, 'lead2', this.leadVoiceLevel!),
      postLpfSlope: 24,
    });
    this.pianoSpatialChain = this.createVoiceSpatialChain(ctx, {
      initialPostLpf: applyDistanceValue('pianoPostLPF', this.sliderState!, 'piano'),
      initialStereoWidth: applyDistanceValue('pianoStereoWidth', this.sliderState!, 'piano'),
      initialDiffuseSend: applyDistanceValue('pianoDiffuseSend', this.sliderState!, 'piano'),
      dryDestination: this.getSidechainTargetInput(ctx, 'piano', this.masterGain!),
      postLpfSlope: 24,
    });

    // Route voices to pad buses based on pad2VoiceAssign
    const pad2Assign = this.sliderState?.pad2Enabled
      ? (this.sliderState?.pad2VoiceAssign ?? 0)
      : 0;
    this.lastPad2VoiceAssign = pad2Assign;
    const pad1Bus = this.pad1Bus;
    const pad2Bus = this.pad2Bus;
    const pad1PreFaderBus = this.pad1PreFaderBus;
    const pad2PreFaderBus = this.pad2PreFaderBus;
    if (!pad1Bus || !pad2Bus || !pad1PreFaderBus || !pad2PreFaderBus) return;
    this.voices.forEach((voice, i) => {
      const isPad2 = (pad2Assign & (1 << i)) !== 0;
      // Post-fader: mixerGain → pad bus (for main mix)
      voice.mixerGain.connect(isPad2 ? pad2Bus : pad1Bus);
      // Pre-fader: envelope → pre-fader bus (for granular, independent of pad level)
      voice.envelope.connect(isPad2 ? pad2PreFaderBus : pad1PreFaderBus);
    });

    // Both pad buses feed their per-pad post chains before the shared synth dry bus.
    this.pad1Bus.connect(this.pad1SpatialChain.postLpf);
    this.pad2Bus.connect(this.pad2SpatialChain.postLpf);

    // Pad WASM node outputs (parallel to JS oscillator path — JS voices silenced when WASM active)
    // [2]/[3] remain pre-fader send taps, while [4]/[5] feed the post-voice dry chains.
    if (this.padWasmNode) {
      this.padWasmNode.connect(this.pad1Bus!, 4);           // output[4] pad 1 post-level → pad1 chain
      this.padWasmNode.connect(this.pad2Bus!, 5);           // output[5] pad 2 post-level → pad2 chain
      if (this.pad1ReverbSend) this.padWasmNode.connect(this.pad1ReverbSend, 2);
      if (this.pad2ReverbSend) this.padWasmNode.connect(this.pad2ReverbSend, 3);
    }

    // Lead buses feed through per-lead dry faders into their post chains.
    // Reverb + delay + granular sends tap from lead1Bus/lead2Bus before the dry-path
    // level gains so FX can still be heard with dry level at 0.
    this.lead1Bus.connect(this.lead1LevelGain);
    this.lead1LevelGain.connect(this.lead1SpatialChain!.postLpf);
    this.lead2Bus.connect(this.lead2LevelGain);
    this.lead2LevelGain.connect(this.lead2SpatialChain!.postLpf);
    this.pianoBus.connect(this.pianoLevelGain);
    this.pianoLevelGain.connect(this.pianoSpatialChain!.postLpf);

    // Per-lead reverb sends (tapped from lead buses before the dry path)
    this.lead1Bus.connect(this.lead1ReverbSend);
    this.lead1ReverbSend.connect(this.reverbInputBus);
    this.lead2Bus.connect(this.lead2ReverbSend);
    this.lead2ReverbSend.connect(this.reverbInputBus);
    this.pianoBus.connect(this.pianoReverbSend);
    this.pianoReverbSend.connect(this.reverbInputBus);
    this.ensureSharedDelayBuses(ctx);
    this.ensurePadDelaySends(ctx);
    this.ensureLeadDelaySends(ctx);
    this.ensurePianoDelaySends(ctx);

    this.synthBus.connect(this.dryBus);

    // Legacy JS granular path REMOVED — synthBus no longer feeds granulatorInputGain
    // Dry signal path preserved: synthBus → dryBus → synthDirect → masterGain

    // Granular FX signal path (now the sole granular engine):
    // Pad1PreFaderBus -> GranularPad1Send  ─┐  (pre-fader: independent of pad level)
    // Pad2PreFaderBus -> GranularPad2Send  ─┤
    // Lead1Bus        -> GranularLead1Send ─┐
    // Lead2Bus        -> GranularLead2Send ─┤
    // PianoBus        -> GranularPianoSend ─┼─> GranularFxInput -> granularFxNode -> granularFxReverbSend -> Reverb
    // DrumMaster      -> GranularDrumSend  ─┤                                -> granularFxDirect -> Master
    // OceanFilter     -> GranularWavesSend ─┘
    if (this.granularFxNode && this.granularFxInputGain && this.granularFxReverbSend && this.granularFxDirect) {
      // Per-source sends → granular input mixer (pad sends are pre-fader)
      if (this.granularPad1Send && this.pad1PreFaderBus) {
        this.pad1PreFaderBus.connect(this.granularPad1Send);
        if (this.padWasmNode) this.padWasmNode.connect(this.granularPad1Send, 2);
        this.granularPad1Send.connect(this.granularFxInputGain);
      }
      if (this.granularPad2Send && this.pad2PreFaderBus) {
        this.pad2PreFaderBus.connect(this.granularPad2Send);
        if (this.padWasmNode) this.padWasmNode.connect(this.granularPad2Send, 3);
        this.granularPad2Send.connect(this.granularFxInputGain);
      }
      if (this.granularLead1Send && this.lead1Bus) {
        this.lead1Bus.connect(this.granularLead1Send);
        this.granularLead1Send.connect(this.granularFxInputGain);
      }
      if (this.granularLead2Send && this.lead2Bus) {
        this.lead2Bus.connect(this.granularLead2Send);
        this.granularLead2Send.connect(this.granularFxInputGain);
      }
      if (this.granularPianoSend && this.pianoBus) {
        this.pianoBus.connect(this.granularPianoSend);
        this.granularPianoSend.connect(this.granularFxInputGain);
      }
      // DrumSynth send is connected in wireDrumGranularSend() after drumSynth creation
      // Waves send is connected below after oceanFilter creation

      this.granularFxInputGain.connect(this.granularFxNode);
      // Reverb path: node → LPF → compressor → reverbSend gain → reverb
      this.granularFxNode.connect(this.granularFxReverbLPF!);
      this.granularFxReverbLPF!.connect(this.granularFxReverbCompressor!);
      this.granularFxReverbCompressor!.connect(this.granularFxReverbSend);
      this.granularFxReverbSend.connect(this.reverbInputBus);
      // Dry path: node → output LPF → direct gain → master
      this.granularFxNode.connect(this.granularFxOutputLPF!);
      this.granularFxOutputLPF!.connect(this.granularFxDirect);
      this.granularFxDirect.connect(this.getSidechainTargetInput(ctx, 'granular', this.masterGain));

      // Shared delay buses — first slice keeps the current lead/granular controls as the frontend.
      this.ensureSharedDelayBuses(ctx);
      this.ensureGranularDelaySends(ctx);
    }

    // Pre-fader reverb sends: tap from per-pad buses (independent of pad level)
    if (this.pad1PreFaderBus && this.pad1ReverbSend) this.pad1PreFaderBus.connect(this.pad1ReverbSend);
    if (this.pad2PreFaderBus && this.pad2ReverbSend) this.pad2PreFaderBus.connect(this.pad2ReverbSend);
    this.dryBus.connect(this.synthDirect);

    this.pad1ReverbSend?.connect(this.reverbInputBus);
    this.pad2ReverbSend?.connect(this.reverbInputBus);
    this.synthDirect.connect(this.masterGain);

    // Reverb output to master (always connected)
    this.reverbOutputGain.connect(this.getSidechainTargetInput(ctx, 'reverb', this.masterGain));

    // Spectral Freeze routing sets up reverbInputBus → reverbNode → reverbOutputGain
    // (and optionally inserts spectralFreezeNode in pre or post position)
    this.applySpectralFreezeRouting();

    this.connectLeadFmWasmOutputs(ctx);

    // Drum Synth WASM node outputs (parallel to JS DrumSynth — JS drums silenced when WASM active)
    if (this.drumWasmNode) {
      this.drumWasmNode.connect(this.masterGain, 0);       // output[0] main → master
      this.drumWasmNode.connect(this.reverbInputBus, 1);   // output[1] reverb send
      // Tap main output into granular FX (post-fader; JS drums use pre-fader but WASM has no 3rd output)
      if (this.granularDrumSend && this.granularFxInputGain) {
        this.drumWasmNode.connect(this.granularDrumSend, 0);
      }
    }

    // ── Earth routing: Waves + Birds + Frogs + Water + Insects → earthBus → earthLevelGain → masterGain ──
    // All Earth engine sends (reverb, granular) are pre-fader — tapped before per-engine
    // level gains so that turning a fader down doesn't kill send tails.

    // Waves: oceanSourceBus → oceanFilter → stereo widen → oceanPreFaderBus
    //      → [oceanReverbSend, granularWavesSend, oceanLevelGain → earthBus]
    this.oceanFilter = ctx.createBiquadFilter();
    this.oceanFilter.type = this.sliderState?.oceanFilterType ?? 'lowpass';
    this.oceanFilter.frequency.value = this.sliderState?.oceanFilterCutoff ?? 8000;
    this.oceanFilter.Q.value = 0.5 + (this.sliderState?.oceanFilterResonance ?? 0.1) * 10;
    if (this.isSoundscapeParityFixture(this.sliderState)) {
      this.oceanPreFaderBus = ctx.createGain();
      this.oceanPreFaderBus.gain.value = 1;
    } else {
      this.oceanPreFaderBus = this.createHaasWidenedBus(ctx, this.oceanFilter, {
        delayMs: 10,
        sideGain: 0.24,
        centerGain: 0.8,
        pan: 0.85,
      });
    }

    this.oceanSourceBus!.connect(this.oceanGateGain!);
    if (this.isSoundscapeParityFixture(this.sliderState)) {
      this.oceanGateGain!.connect(this.oceanPreFaderBus);
    } else {
      this.oceanGateGain!.connect(this.oceanFilter);
    }
    // Reverb send (pre-fader — taps after filter and widening, before oceanLevelGain)
    if (this.oceanReverbSendNode) {
      this.oceanPreFaderBus.connect(this.oceanReverbSendNode);
      this.oceanReverbSendNode.connect(this.reverbInputBus);
    }
    // Granular send (pre-fader)
    if (this.granularWavesSend && this.granularFxInputGain) {
      this.oceanPreFaderBus.connect(this.granularWavesSend);
      this.granularWavesSend.connect(this.granularFxInputGain);
    }
    // Dry path → earthBus
    this.oceanPreFaderBus.connect(this.oceanLevelGain!);
    this.oceanLevelGain!.connect(this.earthBus!);

    // Birds / Frogs texture slots are created pre-wired for dry + reverb in createEarthTextureRuntime().
    if (this.natureBus && this.natureLevelGain) {
      this.natureBus.connect(this.natureLevelGain);
      this.natureLevelGain.connect(this.earthBus!);
    }
    // Granular and shared delay taps are attached here once the global FX buses exist.
    this.ensureEarthGranularSends(ctx);

    // Water: soundscapesNode[0] → waterPreFaderBus → [waterReverbSend, granularWaterSend, waterLevelGain → earthBus]
    this.waterPreFaderBus!.connect(this.waterLevelGain!);
    this.waterLevelGain!.connect(this.earthBus!);
    // Reverb send (pre-fader)
    this.waterPreFaderBus!.connect(this.waterReverbSend!);
    this.waterReverbSend!.connect(this.reverbInputBus);
    // Granular send (pre-fader)
    if (this.granularWaterSend && this.granularFxInputGain) {
      this.waterPreFaderBus!.connect(this.granularWaterSend);
      this.granularWaterSend.connect(this.granularFxInputGain);
    }

    // Insects: soundscapesNode[2] → insectsPreFaderBus → [insectsReverbSend, granularInsectsSend]
    //          soundscapesNode[1] → insectsLevelGain → earthBus
    this.insectsLevelGain!.connect(this.earthBus!);
    // Reverb send (pre-fader)
    if (this.insectsReverbSendNode) {
      this.insectsPreFaderBus!.connect(this.insectsReverbSendNode);
      this.insectsReverbSendNode.connect(this.reverbInputBus);
    }
    // Granular send (pre-fader)
    if (this.granularInsectsSend && this.granularFxInputGain) {
      this.insectsPreFaderBus!.connect(this.granularInsectsSend);
      this.granularInsectsSend.connect(this.granularFxInputGain);
    }

    // earthBus → earthLevelGain → masterGain
    this.earthBus!.connect(this.earthLevelGain!);
    this.earthLevelGain!.connect(this.masterGain);

    // Soundscapes WASM → pre-fader buses
    if (this.soundscapesNode) {
      this.soundscapesNode.connect(this.waterGateGain!, 0);        // output[0] water
      this.waterGateGain!.connect(this.waterPreFaderBus!);
      this.soundscapesNode.connect(this.insectsLevelGain!, 1);     // output[1] insects dry
      this.soundscapesNode.connect(this.insectsPreFaderBus!, 2);   // output[2] insects pre-fader
    }
    this.ensureSharedDelayBuses(ctx);
    this.ensureEarthDelaySends(ctx);

    this.wireMasterOutputChain(ctx);

    // Detect iOS specifically - only iOS needs MediaStream routing for
    // lock-screen/background media session continuity.
    const isIOS = isIOSLikeDevice();
    const isMobile = isMobileDevice();
    this.isMobile = isMobile || isIOS;

    try { this.limiter.disconnect(); } catch { /* */ }
    try { this.outputGain?.disconnect(); } catch { /* */ }

    if (this.outputGain) {
      this.limiter.connect(this.outputGain);
    }

    if (isIOS) {
      // On iOS: route through MediaStreamDestination only.
      // The HTML audio element will play this stream for lock-screen/background continuity.
      // Do NOT also connect to ctx.destination or you get double audio!
      this.mediaStreamDest = ctx.createMediaStreamDestination();
      (this.outputGain ?? this.limiter).connect(this.mediaStreamDest);
      console.log('iOS detected: Audio routed through MediaStream only (for media session continuity)');
    } else {
      // Non-iOS: connect directly to destination for lowest-latency/stable output.
      (this.outputGain ?? this.limiter).connect(ctx.destination);
      this.mediaStreamDest = null;
      console.log('Non-iOS detected: Audio routed directly to destination');
    }

    // Preload the waves texture so first enable is fast. Other nature layers load on demand.
    this.preloadEarthTextures();

    // Note: DrumSynth is created in start() after initializeHarmony() sets rng

    // Apply initial params
    this.applyParams(this.sliderState!);

    // Re-send enablePerf if CPU overlay is active (nodes were just created)
    if (this.perfMonitorEnabled) {
      this.sendEnablePerfToWorklets(true);
    }
    this.graphBootstrapped = true;
  }

  private createSaturationCurve(hardness: number): Float32Array<ArrayBuffer> {
    const samples = 256;
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    const drive = 1 + hardness * 3;

    for (let i = 0; i < samples; i++) {
      const x = (i / (samples - 1)) * 2 - 1;
      // Soft clip with variable drive
      curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }

    return curve;
  }

  /**
   * Compute LFO value for any waveshape. Mutates `ls` in place for stateful shapes.
   * Returns scaled value in -depth..+depth (or 0 if dest is 'none').
   */
  private computeLfoValue(
    now: number, rate: number, depth: number, wave: string, dest: string,
    ls: { shValue: number; shLastPhase: number; smoothTarget: number; smoothCurrent: number; rwPos: number; rwVel: number; rwLast: number }
  ): number {
    if (dest === 'none' || depth <= 0) return 0;
    const phase = (now * rate) % 1;
    let v = 0;
    switch (wave) {
      case 'sine':
        v = Math.sin(phase * Math.PI * 2); break;
      case 'triangle':
        v = phase < 0.25 ? phase * 4 : phase < 0.75 ? 2 - phase * 4 : phase * 4 - 4; break;
      case 'sawtooth':
        v = 2 * phase - 1; break;
      case 'square':
        v = phase < 0.5 ? 1 : -1; break;
      case 'sampleHold':
        if (phase < ls.shLastPhase) ls.shValue = Math.random() * 2 - 1;
        ls.shLastPhase = phase;
        v = ls.shValue; break;
      case 'randomSmooth':
        if (phase < ls.shLastPhase) ls.smoothTarget = Math.random() * 2 - 1;
        ls.shLastPhase = phase;
        ls.smoothCurrent += (ls.smoothTarget - ls.smoothCurrent) * 0.05;
        v = ls.smoothCurrent; break;
      case 'randomWalk': {
        const rwNow = performance.now();
        const elapsedMs = ls.rwLast > 0 ? this.capMainThreadModulationDelta(rwNow - ls.rwLast) : 100;
        if (elapsedMs >= 100) {
          ls.rwLast = rwNow;
          const stepCount = Math.max(
            1,
            Math.min(
              RANDOM_WALK_MAX_CATCHUP_STEPS,
              Math.round(elapsedMs / 100) || 1,
            ),
          );
          const spd = rate > 0 ? 0.02 * rate : 0;
          for (let step = 0; step < stepCount; step += 1) {
            ls.rwVel += (Math.random() - 0.5) * spd * 2;
            ls.rwVel *= 0.92;
            const mx = spd * 4;
            ls.rwVel = Math.max(-mx, Math.min(mx, ls.rwVel));
            ls.rwPos += ls.rwVel;
            ls.rwPos = Math.max(0, Math.min(1, ls.rwPos));
          }
        }
        v = (ls.rwPos - 0.5) * 2; break;
      }
      default:
        v = Math.sin(phase * Math.PI * 2);
    }
    return v * depth;
  }

  private initializeHarmony(): void {
    if (!this.sliderState) return;
    this.ensureTransportAnchors();

    // Compute seed based on time bucket only (not slider values)
    this.currentBucket = getUtcBucket(this.sliderState.seedWindow);
    this.currentSeed = computeGranularRuntimeSeed(this.currentBucket);
    this.lastGranularRandomSeedMaterial = granularRuntimeSeedMaterial(this.currentBucket);
    this.rng = createRng(this.lastGranularRandomSeedMaterial);

    // Create harmony state with full params (CoF + progression)
    const effectiveHarmonyPhraseSeconds = this.getEffectiveHarmonyPhraseSeconds(this.sliderState);
    this.harmonyState = createHarmonyState(
      `${this.currentBucket}|${this.sliderStateJson}|E_ROOT`,
      this.sliderState.tension,
      chordIntervalSecondsFromState(this.sliderState.chordRate, effectiveHarmonyPhraseSeconds),
      this.sliderState.voicingSpread,
      this.sliderState.detune,
      this.sliderState.scaleMode,
      this.sliderState.manualScale,
      this.sliderState.rootNote ?? 4,
      effectiveHarmonyPhraseSeconds,
      this.getHarmonyParams()
    );

    // Sync effective root
    this.effectiveRoot = this.harmonyState.effectiveRoot;

    if (this.sliderState.synthChordSequencerEnabled === true) {
      this.applyChord(this.harmonyState.currentChord.frequencies);
    }

    // Send random sequence to granulator and granular
    this.sendGranulatorRandomSequence();
    this.sendGranularRandomSequence();

    this.notifyStateChange();
  }

  // Lock/unlock seed to prevent changes during morphing
  setSeedLocked(locked: boolean): void {
    this.seedLocked = locked;
  }

  private recomputeSeed(): void {
    if (!this.sliderState) return;
    if (this.seedLocked) return; // Don't recompute if locked

    this.currentBucket = getUtcBucket(this.sliderState.seedWindow);
    this.currentSeed = computeGranularRuntimeSeed(this.currentBucket);
    this.lastGranularRandomSeedMaterial = granularRuntimeSeedMaterial(this.currentBucket);
    this.rng = createRng(this.lastGranularRandomSeedMaterial);

    // Send new random sequence to granular (legacy granulator removed)
    this.sendGranularRandomSequence();

    this.notifyStateChange();
  }

  private sendGranulatorRandomSequence(): void {
    // Legacy JS granular engine removed — this is now a no-op
    // Random sequences for grain scheduling are sent via sendGranularRandomSequence()
    return;
  }

  private sendGranularRandomSequence(): void {
    if (!this.granularFxNode || !this.lastGranularRandomSeedMaterial) return;

    const sequence = generateRandomSequence(createRng(this.lastGranularRandomSeedMaterial), 4096);
    this.lastGranularRandomSequencePreview = Array.from(sequence.slice(0, 8));
    this.granularFxNode.port.postMessage({
      type: 'randomSequence',
      sequence,
    });
  }

  private schedulePhraseUpdates(): void {
    if (!this.sliderState) return;
    if (this.phraseTimer !== null) {
      clearTimeout(this.phraseTimer);
      this.phraseTimer = null;
    }

    const anchors = this.ensureTransportAnchors();
    this.chordSubTickCount = 0;

    const scheduleNext = () => {
      if (!this.sliderState) return;
      const nowWallSec = Date.now() / 1000;
      const phraseLength = this.getEffectiveHarmonyPhraseSeconds(this.sliderState);
      const chordsPerPhrase = resolveChordsPerPhrase(this.sliderState.chordRate, phraseLength);
      const clockSource = this.sliderState.harmonyClockSource ?? 'globalPhrase';

      if (chordsPerPhrase > 1) {
        // Sub-phrase mode: multiple chord changes per phrase
        const subInterval = phraseLength / chordsPerPhrase;
        this.nextHarmonyEventWallSec = nowWallSec + subInterval;

        this.phraseTimer = window.setTimeout(() => {
          this.chordSubTickCount++;
          const isPhraseBoundary = this.chordSubTickCount >= chordsPerPhrase;
          if (isPhraseBoundary) {
            this.chordSubTickCount = 0;
          }
          this.onHarmonyTick(isPhraseBoundary);
          scheduleNext();
        }, subInterval * 1000);
      } else {
        // Normal mode: timer fires at phrase boundaries
        const timeUntilNext = getTimeUntilNextBoundaryWall(clockSource, phraseLength, anchors, nowWallSec);
        this.nextHarmonyEventWallSec = nowWallSec + timeUntilNext;
        this.phraseTimer = window.setTimeout(() => {
          this.onHarmonyTick(true);
          scheduleNext();
        }, timeUntilNext * 1000);
      }
    };

    // First tick: align to next phrase boundary
    const nowWallSec = Date.now() / 1000;
    const phraseLength = this.getEffectiveHarmonyPhraseSeconds(this.sliderState);
    const clockSource = this.sliderState.harmonyClockSource ?? 'globalPhrase';
    const timeUntilNext = getTimeUntilNextBoundaryWall(clockSource, phraseLength, anchors, nowWallSec);
    this.nextHarmonyEventWallSec = nowWallSec + timeUntilNext;
    this.phraseTimer = window.setTimeout(() => {
      this.chordSubTickCount = 0;
      this.onHarmonyTick(true); // First tick is always a phrase boundary
      scheduleNext();
    }, timeUntilNext * 1000);
  }

  private getEffectiveRuntimeRandomWalkState(baseState: SliderState): SliderState {
    const walkEntries = Object.entries(this.runtimeWalkRanges);
    if (walkEntries.length === 0) {
      return baseState;
    }

    const nextState = { ...baseState } as SliderState;
    const nextStateRecord = nextState as unknown as Record<string, SliderState[keyof SliderState]>;

    for (const [key, range] of walkEntries) {
      if (!range) continue;
      const position = this.runtimeWalkStates.get(key)?.position ?? 0.5;
      const paramKey = key as keyof SliderState;
      const numericValue = quantize(paramKey, range.min + position * (range.max - range.min));
      nextStateRecord[key] = getStateValueFromSliderNumber(paramKey, numericValue) as SliderState[keyof SliderState];
    }

    if (this.runtimeWalkRanges.padMorph) {
      const presetA = getPadPreset(nextState.padPresetA as string, 'pad1');
      const presetB = getPadPreset(nextState.padPresetB as string, 'pad1');
      if (presetA && presetB) {
        const morphed = morphPadPresets(presetA, presetB, nextState.padMorph as number);
        for (const key of PAD_PRESET_PARAM_KEYS) {
          if (key in morphed) {
            nextStateRecord[key] = morphed[key] as SliderState[keyof SliderState];
          }
        }
      }
    }

    if (this.runtimeWalkRanges.pad2Morph) {
      const presetA = getPadPreset(nextState.pad2PresetA as string, 'pad2');
      const presetB = getPadPreset(nextState.pad2PresetB as string, 'pad2');
      if (presetA && presetB) {
        const morphed = morphPadPresets(presetA, presetB, nextState.pad2Morph as number);
        for (const key of PAD_PRESET_PARAM_KEYS) {
          if (key in morphed) {
            const pad2Key = PAD1_TO_PAD2_ENGINE[key];
            if (pad2Key) {
              nextStateRecord[pad2Key] = morphed[key] as SliderState[keyof SliderState];
            }
          }
        }
      }
    }

    if (this.runtimeWalkRanges.waterMorph) {
      const morphed = morphWaterPresets(
        nextState.waterMorphA as number,
        nextState.waterMorphB as number,
        nextState.waterMorph as number,
      );
      for (const key of WATER_MORPH_PARAM_KEYS) {
        if (key in morphed) {
          nextStateRecord[key] = morphed[key] as SliderState[keyof SliderState];
        }
      }
      nextState.waterPreset = (nextState.waterMorph as number) < 0.5
        ? (nextState.waterMorphA as number)
        : (nextState.waterMorphB as number);
    }

    const drumWalkMorphMap: Record<string, DrumVoiceType> = {
      drumSubMorph: 'sub',
      drumKickMorph: 'kick',
      drumClickMorph: 'click',
      drumBeepHiMorph: 'beepHi',
      drumBeepLoMorph: 'beepLo',
      drumNoiseMorph: 'noise',
      drumMembraneMorph: 'membrane',
    };
    for (const [morphKey, voice] of Object.entries(drumWalkMorphMap)) {
      if (!(morphKey in this.runtimeWalkRanges)) continue;
      Object.assign(nextState, applyMorphToState(nextState, voice));
    }

    return nextState;
  }

  private startRuntimeRandomWalk(): void {
    if (this.runtimeRandomWalkTimer !== null) {
      clearInterval(this.runtimeRandomWalkTimer);
      this.runtimeRandomWalkTimer = null;
    }

    this.runtimeRandomWalkLastUpdateMs = performance.now();
    this.runtimeRandomWalkTimer = window.setInterval(() => {
      const now = performance.now();
      const sourceState = this.sourceSliderState;
      if (!sourceState) {
        this.runtimeRandomWalkLastUpdateMs = now;
        return;
      }

      const shouldAnimate = this.shouldRunMainThreadModulation();
      if (!shouldAnimate) {
        this.runtimeRandomWalkLastUpdateMs = now;
        return;
      }

      const elapsedMs = this.capMainThreadModulationDelta(now - this.runtimeRandomWalkLastUpdateMs);
      this.runtimeRandomWalkLastUpdateMs = now;

      const speed = Math.max(0.01, sourceState.randomWalkSpeed ?? 1);
      const globalWalk = sourceState.randomWalkMode === 'globalWalk';
      const localStepCount = globalWalk
        ? 1
        : Math.max(
          1,
          Math.min(
            RANDOM_WALK_MAX_CATCHUP_STEPS,
            Math.round(elapsedMs / RUNTIME_RANDOM_WALK_INTERVAL_MS) || 1,
          ),
        );
      const movedKeys = new Set<string>();

      for (const key of Object.keys(this.runtimeWalkRanges)) {
        const walkState = this.runtimeWalkStates.get(key) ?? { position: 0.5, velocity: 0 };
        let nextPosition = walkState.position;
        let nextVelocity = walkState.velocity;

        if (globalWalk) {
          nextPosition = sampleGlobalWalkPosition(key, speed, sourceState.seedWindow, this.getRuntimeWalkWallTimeSec());
          nextVelocity = 0;
        } else {
          for (let step = 0; step < localStepCount; step += 1) {
            nextVelocity += (Math.random() - 0.5) * 0.01 * speed;
            nextVelocity *= 0.98;
            nextVelocity = Math.max(-0.05 * speed, Math.min(0.05 * speed, nextVelocity));
            nextPosition += nextVelocity;

            if (nextPosition < 0) {
              nextPosition = 0;
              nextVelocity = Math.abs(nextVelocity);
            } else if (nextPosition > 1) {
              nextPosition = 1;
              nextVelocity = -Math.abs(nextVelocity);
            }
          }
        }

        if (Math.abs(walkState.position - nextPosition) > 0.0005 || Math.abs(walkState.velocity - nextVelocity) > 0.0005) {
          movedKeys.add(key);
          this.runtimeWalkStates.set(key, {
            position: nextPosition,
            velocity: nextVelocity,
          });
        }
      }

      if (movedKeys.size === 0) return;
      this.emitRuntimeWalkPositions();
      const nextEffectiveState = this.getEffectiveRuntimeAutoMorphState(
        this.getEffectiveRuntimeRandomWalkState(sourceState),
      );
      if (getChangedRuntimeWalkParameterKeys(this.sliderState, nextEffectiveState, movedKeys).length === 0) return;
      this.updateParams(sourceState);
    }, RUNTIME_RANDOM_WALK_INTERVAL_MS);
  }

  private stopRuntimeRandomWalk(): void {
    if (this.runtimeRandomWalkTimer !== null) {
      clearInterval(this.runtimeRandomWalkTimer);
      this.runtimeRandomWalkTimer = null;
    }
    this.runtimeRandomWalkLastUpdateMs = 0;
  }

  private syncRuntimeRandomWalk(): void {
    const hasRuntimeWalks = Object.keys(this.runtimeWalkRanges).length > 0;
    if (!hasRuntimeWalks || !this.sourceSliderState) {
      this.stopRuntimeRandomWalk();
      this.emitRuntimeWalkPositions(true);
      return;
    }

    if (this.runtimeRandomWalkTimer === null) {
      this.startRuntimeRandomWalk();
    }
  }

  private syncRuntimeAutoMorphSource(baseState: SliderState, prevBaseState: SliderState | null): void {
    const syncPadState = (
      pad: 'pad1' | 'pad2',
      nextValue: number | undefined,
      autoEnabled: boolean,
      prevValue: number | undefined,
      prevAutoEnabled: boolean,
    ) => {
      if (prevBaseState && nextValue === prevValue && autoEnabled === prevAutoEnabled) return;
      const nextPhase = clampUnitInterval(nextValue);
      const target = this.padAutoMorphStates[pad];
      target.phase = nextPhase;
      if (!autoEnabled || nextPhase <= 0.001 || nextPhase >= 0.999) {
        target.direction = nextPhase >= 0.999 ? -1 : 1;
      }
    };

    syncPadState(
      'pad1',
      baseState.padMorph,
      !!baseState.padMorphAuto,
      prevBaseState?.padMorph,
      !!prevBaseState?.padMorphAuto,
    );
    syncPadState(
      'pad2',
      baseState.pad2Morph,
      !!baseState.pad2MorphAuto,
      prevBaseState?.pad2Morph,
      !!prevBaseState?.pad2MorphAuto,
    );

    for (const voice of DRUM_AUTO_MORPH_VOICES) {
      const keys = VOICE_MORPH_KEYS[voice];
      const nextMorph = clampUnitInterval(baseState[keys.morph] as number | undefined);
      const prevMorph = clampUnitInterval(prevBaseState?.[keys.morph] as number | undefined);
      const autoEnabled = !!baseState[keys.auto];
      const prevAutoEnabled = !!prevBaseState?.[keys.auto];
      if (prevBaseState && nextMorph === prevMorph && autoEnabled === prevAutoEnabled) continue;
      this.drumAutoMorphValues[voice] = nextMorph;
      this.drumAutoMorphManager.setVoiceState(voice, nextMorph);
    }
  }

  private getEffectiveRuntimeAutoMorphState(baseState: SliderState): SliderState {
    const pad1AutoActive = !!baseState.padMorphAuto;
    const pad2AutoActive = !!baseState.pad2MorphAuto;
    const anyDrumAutoActive = DRUM_AUTO_MORPH_VOICES.some((voice) => !!baseState[VOICE_MORPH_KEYS[voice].auto]);
    if (!pad1AutoActive && !pad2AutoActive && !anyDrumAutoActive) {
      return baseState;
    }

    const nextState = { ...baseState } as SliderState;
    const nextStateRecord = nextState as unknown as Record<string, SliderState[keyof SliderState]>;

    const applyPadMorphRuntime = (pad: 'pad1' | 'pad2') => {
      const morphKey = pad === 'pad2' ? 'pad2Morph' : 'padMorph';
      const presetAKey = pad === 'pad2' ? 'pad2PresetA' : 'padPresetA';
      const presetBKey = pad === 'pad2' ? 'pad2PresetB' : 'padPresetB';
      const effectiveMorph = clampUnitInterval(this.padAutoMorphStates[pad].phase);
      nextStateRecord[morphKey] = effectiveMorph as SliderState[keyof SliderState];

      const presetA = getPadPreset(nextState[presetAKey] as string, pad);
      const presetB = getPadPreset(nextState[presetBKey] as string, pad);
      if (!presetA || !presetB) return;

      const morphed = morphPadPresets(presetA, presetB, effectiveMorph);
      for (const key of PAD_PRESET_PARAM_KEYS) {
        if (!(key in morphed)) continue;
        const targetKey = (pad === 'pad2' ? PAD1_TO_PAD2_ENGINE[key] : key) as keyof SliderState;
        nextStateRecord[targetKey as string] = morphed[key] as SliderState[keyof SliderState];
      }
    };

    if (pad1AutoActive) applyPadMorphRuntime('pad1');
    if (pad2AutoActive) applyPadMorphRuntime('pad2');

    if (anyDrumAutoActive) {
      for (const voice of DRUM_AUTO_MORPH_VOICES) {
        const keys = VOICE_MORPH_KEYS[voice];
        if (!nextState[keys.auto]) continue;
        nextStateRecord[keys.morph as string] = clampUnitInterval(this.drumAutoMorphValues[voice]) as SliderState[keyof SliderState];
        Object.assign(nextStateRecord, applyMorphToState(nextState, voice));
      }
    }

    return nextState;
  }

  private startRuntimeAutoMorph(): void {
    if (this.autoMorphTimer !== null) {
      clearInterval(this.autoMorphTimer);
      this.autoMorphTimer = null;
    }

    let lastPadUpdateTime = performance.now();
    this.autoMorphTimer = window.setInterval(() => {
      const baseState = this.sourceSliderState;
      if (!baseState) return;

      const now = performance.now();
      const canAnimate = this.shouldRunMainThreadModulation();
      if (!canAnimate) {
        lastPadUpdateTime = now;
        this.drumAutoMorphManager.syncClock(now);
        return;
      }

      const deltaTime = this.capMainThreadModulationDelta(now - lastPadUpdateTime) / 1000;
      lastPadUpdateTime = now;
      let runtimeChanged = false;

      const updatePad = (pad: 'pad1' | 'pad2'): number | null => {
        const autoEnabled = pad === 'pad1' ? !!baseState.padMorphAuto : !!baseState.pad2MorphAuto;
        if (!autoEnabled) return null;

        const phraseLengthSeconds = Math.max(0.001, baseState.phraseLength ?? 16);
        const phrasesPerSweep = Math.max(
          1,
          pad === 'pad1' ? (baseState.padMorphSpeed ?? 8) : (baseState.pad2MorphSpeed ?? 8),
        );
        const cyclesPerMinute = 120 / (phrasesPerSweep * phraseLengthSeconds);
        const target = this.padAutoMorphStates[pad];
        const result = updateAutoMorph(target.phase, target.direction, 'pingpong', cyclesPerMinute, deltaTime);
        const nextMorph = clampUnitInterval(result.morph);
        if (Math.abs(target.phase - nextMorph) > 0.0005 || target.direction !== (result.direction as 1 | -1)) {
          runtimeChanged = true;
        }
        target.phase = nextMorph;
        target.direction = result.direction as 1 | -1;
        return nextMorph;
      };

      const nextPad1Morph = updatePad('pad1');
      const nextPad2Morph = updatePad('pad2');
      if (nextPad1Morph !== null) this.onPadMorphTrigger?.(nextPad1Morph);
      if (nextPad2Morph !== null) this.onPad2MorphTrigger?.(nextPad2Morph);

      const nextDrumMorphs = this.drumAutoMorphManager.update(baseState, now);
      for (const voice of DRUM_AUTO_MORPH_VOICES) {
        const keys = VOICE_MORPH_KEYS[voice];
        if (!baseState[keys.auto]) continue;
        const nextMorph = clampUnitInterval(nextDrumMorphs.get(voice) ?? this.drumAutoMorphValues[voice]);
        if (Math.abs(this.drumAutoMorphValues[voice] - nextMorph) > 0.0005) {
          runtimeChanged = true;
          this.drumAutoMorphValues[voice] = nextMorph;
        }
        this.onDrumMorphTrigger?.(voice, nextMorph);
      }

      if (!runtimeChanged || !this.sourceSliderState) return;
      this.updateParams(this.sourceSliderState);
    }, 80);
  }

  private stopRuntimeAutoMorph(): void {
    if (this.autoMorphTimer !== null) {
      clearInterval(this.autoMorphTimer);
      this.autoMorphTimer = null;
    }
  }

  private syncRuntimeAutoMorph(): void {
    const sourceState = this.sourceSliderState;
    const autoMorphEnabled = !!sourceState && (
      sourceState.padMorphAuto ||
      sourceState.pad2MorphAuto ||
      DRUM_AUTO_MORPH_VOICES.some((voice) => !!sourceState[VOICE_MORPH_KEYS[voice].auto])
    );

    if (!autoMorphEnabled) {
      this.stopRuntimeAutoMorph();
      return;
    }

    if (this.autoMorphTimer === null) {
      this.startRuntimeAutoMorph();
    }
  }

  private startLeadMorphRandomWalk(): void {
    if (this.leadMorphTimer !== null) {
      clearInterval(this.leadMorphTimer);
      this.leadMorphTimer = null;
    }

    const updateIntervalMs = 100;
    let lastUpdateMs = performance.now();
    this.leadMorphTimer = window.setInterval(() => {
      const now = performance.now();
      if (!this.sliderState) {
        lastUpdateMs = now;
        return;
      }

      const canAnimate = this.shouldRunMainThreadModulation();
      if (!canAnimate) {
        lastUpdateMs = now;
        return;
      }

      const elapsedMs = this.capMainThreadModulationDelta(now - lastUpdateMs);
      lastUpdateMs = now;
      const stepCount = Math.max(
        1,
        Math.min(
          RANDOM_WALK_MAX_CATCHUP_STEPS,
          Math.round(elapsedMs / updateIntervalMs) || 1,
        ),
      );

      const updateLead = (lead: 1 | 2): number | null => {
        const randomWalkEnabled = lead === 1 ? this.sliderState!.lead1MorphAuto : this.sliderState!.lead2MorphAuto;
        if (!randomWalkEnabled) return null;

        const walkState = lead === 1 ? this.leadMorphWalkStates.lead1 : this.leadMorphWalkStates.lead2;
        const phr = Math.max(1, Math.min(32, Number.isFinite(lead === 1 ? this.sliderState!.lead1MorphSpeed : this.sliderState!.lead2MorphSpeed)
          ? (lead === 1 ? this.sliderState!.lead1MorphSpeed : this.sliderState!.lead2MorphSpeed)
          : 8));

        // Parity methodology: same momentum+bounce walk shape as the app-wide random walk,
        // with phrase-speed semantics (higher phrases = slower movement).
        const speedFactor = 1 / phr;

        if (!walkState.initialized) {
          walkState.position = Math.random();
          walkState.velocity = 0;
          walkState.initialized = true;
        }

        for (let step = 0; step < stepCount; step += 1) {
          walkState.velocity += (Math.random() - 0.5) * 0.01 * speedFactor;
          walkState.velocity *= 0.98;
          walkState.velocity = Math.max(-0.05 * speedFactor, Math.min(0.05 * speedFactor, walkState.velocity));
          walkState.position += walkState.velocity;

          if (walkState.position < 0) {
            walkState.position = 0;
            walkState.velocity = Math.abs(walkState.velocity);
          } else if (walkState.position > 1) {
            walkState.position = 1;
            walkState.velocity = -Math.abs(walkState.velocity);
          }
        }

        return walkState.position;
      };

      const lead1Pos = updateLead(1);
      const lead2Pos = updateLead(2);

      if (this.onLeadMorphTrigger && (lead1Pos !== null || lead2Pos !== null)) {
        this.onLeadMorphTrigger({
          lead1: lead1Pos ?? -1,
          lead2: lead2Pos ?? -1,
        });
      }
    }, updateIntervalMs);
  }

  private stopLeadMorphRandomWalk(): void {
    if (this.leadMorphTimer !== null) {
      clearInterval(this.leadMorphTimer);
      this.leadMorphTimer = null;
    }
  }

  private syncLeadMorphRandomWalk(): void {
    const autoMorphEnabled = !!this.sliderState && (this.sliderState.lead1MorphAuto || this.sliderState.lead2MorphAuto);
    if (!this.isRunning || !autoMorphEnabled) {
      this.stopLeadMorphRandomWalk();
      return;
    }
    if (this.leadMorphTimer === null) {
      this.startLeadMorphRandomWalk();
    }
  }

  /** Build HarmonyParams from current sliderState */
  private getHarmonyParams(): Partial<HarmonyParams> {
    const s = this.sliderState!;
    return {
      cofDriftEnabled: s.cofDriftEnabled ?? false,
      cofDriftRate: s.cofDriftRate ?? 2,
      cofDriftDirection: s.cofDriftDirection ?? 'cw',
      cofDriftRange: s.cofDriftRange ?? 3,
      chordProgressionEnabled: s.chordProgressionEnabled ?? false,
      chordProgressionPattern: s.chordProgressionPattern ?? [0, 3, 4, 0],
      chordProgressionSteps: s.chordProgressionSteps ?? 4,
      chordProgressionStepEnabled: s.chordProgressionStepEnabled ?? [true, true, true, true],
      chordProgressionPhraseMultiplier: s.chordProgressionPhraseMultiplier ?? 1,
    };
  }

  /**
   * Called on every harmony tick. When isPhraseBoundary is true, also runs
   * phrase-level effects (granulator reseed, drum scale sync, reverb coupling).
   * Sub-phrase ticks only generate chord changes.
   */
  private onHarmonyTick(isPhraseBoundary: boolean): void {
    if (!this.harmonyState || !this.sliderState) return;

    const nowWallSec = Date.now() / 1000;
    const phraseIndex = this.getCurrentHarmonyPhraseIndex(nowWallSec);
    const progressionPhraseIndex = this.getCurrentProgressionPhraseIndex(nowWallSec);
    const homeRoot = this.sliderState.rootNote ?? 4;
    const effectivePhraseLength = this.getEffectiveHarmonyPhraseSeconds(this.sliderState);

    // Update harmony state — CoF drift, chord progression, voice leading,
    // and resolution arcs are now handled internally by the harmony module
    const prevChord = this.harmonyState.currentChord;
    this.harmonyState = updateHarmonyState(
      this.harmonyState,
      `${this.currentBucket}|${this.sliderStateJson}|E_ROOT`,
      phraseIndex,
      this.sliderState.tension,
      chordIntervalSecondsFromState(this.sliderState.chordRate, effectivePhraseLength),
      this.sliderState.voicingSpread,
      this.sliderState.detune,
      this.sliderState.scaleMode,
      this.sliderState.manualScale,
      homeRoot,
      effectivePhraseLength,
      this.getHarmonyParams(),
      progressionPhraseIndex,
      isPhraseBoundary
    );

    // Sync CoF state back to sliderState for UI
    if (this.sliderState.cofCurrentStep !== this.harmonyState.cof.currentStep) {
      this.sliderState = {
        ...this.sliderState,
        cofCurrentStep: this.harmonyState.cof.currentStep
      };
    }

    // Update effective root from harmony module
    this.effectiveRoot = this.harmonyState.effectiveRoot;

    // Sync cofConfig for backward compatibility with any code that reads it
    this.cofConfig.currentStep = this.harmonyState.cof.currentStep;
    this.cofConfig.phraseCounter = this.harmonyState.cof.phraseCounter;

    // Apply new chord with crossfade (if synth chord sequencer is enabled)
    if (this.sliderState.synthChordSequencerEnabled === true) {
      // Only crossfade if chord actually changed
      const chordChanged = prevChord.midiNotes.join(',') !== this.harmonyState.currentChord.midiNotes.join(',');
      this.applyChord(this.harmonyState.currentChord.frequencies, chordChanged);
    }

    // Phrase-boundary-only effects: granulator reseed, scale sync, reverb coupling
    if (isPhraseBoundary) {
      this.sendGranulatorRandomSequence();
      this.sendGranularRandomSequence();

      if (this.drumSynth) {
        const intervals = this.harmonyState.scaleFamily?.intervals ?? [];
        this.drumSynth.setScaleIntervals([...intervals]);
      }

      // Reverb harmony coupling — trigger transient modulations
      {
        const chordChanged = prevChord.midiNotes.join(',') !== this.harmonyState.currentChord.midiNotes.join(',');
        if (chordChanged && this.sliderState.reverbChordWash) {
          this.reverbWashBoost = 1.0;
        }
        const curTension = this.harmonyState.chordTension ?? 0;
        if (this.sliderState.reverbResolutionBloom && curTension < this.prevReverbTension - 0.15) {
          this.reverbBloomBoost = 1.0;
        }
        this.prevReverbTension = curTension;
      }
    }

    this.notifyStateChange();
  }

  private applyChord(frequencies: number[], _crossfade = false): void {
    if (!this.ctx || !this.sliderState || !this.rng) return;

    const state = this.buildPadTriggerState('pad1', this.sliderState) ?? this.getEffectivePadState(this.sliderState);
    if (!this.padWasmNode) {
      this.warnPadWasmUnavailable('applyChord');
      return;
    }
    this.clearPadChordTriggerTimers();
    this.sendPadWasmParams(state);

    // Build set of voice indices owned by active Euclidean synth lanes
    // so we don't overwrite their notes/envelopes
    const euclidOwnedVoices = new Set<number>();
    if (state.synthEuclideanMasterEnabled) {
      const sources = [state.synthEuclid1Source, state.synthEuclid2Source, state.synthEuclid3Source, state.synthEuclid4Source];
      const enables = [state.synthEuclid1Enabled, state.synthEuclid2Enabled, state.synthEuclid3Enabled, state.synthEuclid4Enabled];
      const voiceMasks = [state.synthEuclid1VoiceMask, state.synthEuclid2VoiceMask, state.synthEuclid3VoiceMask, state.synthEuclid4VoiceMask];
      for (const li of SYNTH_LANE_INDICES) {
        const source = sources[li];
        if (enables[li] && source?.startsWith('synth')) {
          const vi = parseInt(source.replace('synth', ''), 10) - 1;
          if (vi >= 0 && vi < PAD_VOICE_COUNT) euclidOwnedVoices.add(vi);
        } else if (enables[li] && (source === 'pad1' || source === 'pad2')) {
          const mask = (voiceMasks[li] ?? 1) & PAD_VOICE_MASK_ALL;
          for (let vi = 0; vi < PAD_VOICE_COUNT; vi += 1) {
            if ((mask & (1 << vi)) !== 0) euclidOwnedVoices.add(vi);
          }
        }
      }
    }

    const triggerIntervalSeconds = this.getPadChordTriggerIntervalSeconds(state);
    const waveSpread = state.waveSpread * triggerIntervalSeconds;
    const rng = this.rng; // Capture for use in loop
    const pad2Assign = (state.pad2VoiceAssign ?? 0) & PAD_VOICE_MASK_ALL;
    const voiceMask = ((state.synthVoiceMask ?? 63) & PAD_VOICE_MASK_ALL) & ~pad2Assign;
    const octaveShift = state.synthOctave || 0; // Octave shift (-2 to +2)
    const octaveMultiplier = Math.pow(2, octaveShift); // 0.25, 0.5, 1, 2, or 4

    // Apply octave shift to all frequencies
    frequencies = frequencies.map(f => f * octaveMultiplier);

    // Filter frequencies based on voice mask - only include notes for enabled voices
    const enabledFrequencies: number[] = [];
    for (let i = 0; i < Math.min(PAD_VOICE_COUNT, frequencies.length); i++) {
      if (voiceMask & (1 << i)) {
        enabledFrequencies.push(frequencies[i] ?? frequencies[0] ?? 440);
      }
    }
    // If mask would result in no voices, use at least the first frequency
    if (enabledFrequencies.length === 0) {
      enabledFrequencies.push(frequencies[0] ?? 440);
    }

    // Generate random stagger offsets for each WASM voice using the RNG for determinism.
    const voiceOffsets = Array.from({ length: PAD_VOICE_COUNT }, () => rng() * waveSpread);
    // Sort offsets so voices come in at staggered but consistent intervals
    voiceOffsets.sort((a, b) => a - b);

    let padChordTriggered = false;
    for (let i = 0; i < PAD_VOICE_COUNT; i += 1) {
      // Skip voices owned by Euclidean synth lanes — scheduler drives them
      if (euclidOwnedVoices.has(i)) {
        continue;
      }

      const isVoiceEnabled = (voiceMask & (1 << i)) !== 0;

      if (!isVoiceEnabled) {
        this.postPadWasmNoteOff(i);
        continue;
      }

      // Map enabled voice index to the filtered frequency list
      let enabledIndex = 0;
      for (let j = 0; j < i; j++) {
        if (voiceMask & (1 << j)) enabledIndex++;
      }
      const freq = enabledFrequencies[enabledIndex % enabledFrequencies.length] ?? frequencies[0] ?? 440;
      const voiceDelay = voiceOffsets[i] ?? 0; // Staggered entry time for this voice
      const holdSeconds = this.getPadEnvelopeGateSeconds(state, 'pad1', voiceDelay, triggerIntervalSeconds);

      padChordTriggered = true;
      const padNode = this.padWasmNode;
      const trigger = () => {
        if (!this.isRunning || this.sliderState?.synthChordSequencerEnabled !== true || this.padWasmNode !== padNode) {
          return;
        }
        padNode?.port.postMessage({
          type: 'noteOn',
          voiceIndex: i,
          frequency: freq,
          velocity: 1,
          holdSeconds,
        });
      };
      const delayMs = Math.max(0, voiceDelay * 1000);
      if (delayMs > 1) {
        const timerId = window.setTimeout(() => {
          this.padChordTriggerTimers.delete(timerId);
          trigger();
        }, delayMs);
        this.padChordTriggerTimers.add(timerId);
      } else {
        trigger();
      }
    }

    if (padChordTriggered) {
      this.reportFxOnset('pad1', 'padChord');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WASM Synth Parameter Forwarding
  // ═══════════════════════════════════════════════════════════════════════════

  /** Create the pad WASM AudioWorkletNode, set up handlers, and send the binary. */
  private createPadWasmNode(ctx: AudioContext): void {
    if (!this.wasmPadBinary) return;
    this.padWasmNode = new AudioWorkletNode(ctx, 'pad-synth-wasm', {
      numberOfInputs: 0,
      numberOfOutputs: 6,
      outputChannelCount: [2, 2, 2, 2, 2, 2],
    });
    this.padWasmReady = false;
    this.padWasmNode.onprocessorerror = () => {
      console.error('[PadSynth-WASM] processorerror fired');
    };
    this.padWasmNode.port.onmessage = (e) => {
      if (e.data.type === 'wasmReady') {
        this.padWasmReady = true;
        this.padWasmUnavailableWarned = false;
        if (this.sliderState) {
          this.sendPadWasmParams(this.sliderState);
          const pad2Assign = (this.sliderState.pad2VoiceAssign ?? 0) & PAD_VOICE_MASK_ALL;
          for (let i = 0; i < PAD_VOICE_COUNT; i++) {
            const isPad2 = (pad2Assign & (1 << i)) !== 0;
            this.padWasmNode?.port.postMessage({ type: 'voicePad', voiceIndex: i, pad: isPad2 ? 1 : 0 });
          }
        }
      } else if (e.data.type === 'perf') {
        this.handlePerfMessage(e.data);
      } else if (e.data.type === 'error') {
        console.error(`[PadSynth-WASM] ${e.data.stage}: ${e.data.message}`);
      }
    };
    const padBin = this.wasmPadBinary;
    this.wasmPadBinary = null;
    this.padWasmNode.port.postMessage({ type: 'wasmBinary', binary: padBin }, [padBin]);
  }

  /** Forward pad synth params to WASM worklet. The worklet handles pad1/pad2 key extraction. */
  private sendPadWasmParams(s: SliderState): void {
    if (!this.padWasmNode) return;
    this.postCachedWorkletMessage(
      'pad:params',
      this.padWasmNode,
      {
        type: 'params',
        params: {
          ...s,
          synthLevel: (s.synthLevel ?? 0.6) * ENGINE_TRIMS.pad,
          pad2Level: (s.pad2Level ?? 0.6) * ENGINE_TRIMS.pad,
        },
      },
      {
        synthLevel: (s.synthLevel ?? 0.6) * ENGINE_TRIMS.pad,
        pad2Level: (s.pad2Level ?? 0.6) * ENGINE_TRIMS.pad,
        padMorph: s.padMorph,
        pad2Morph: s.pad2Morph,
        ...Object.fromEntries(PAD_PRESET_PARAM_KEYS.map((key) => [key, s[key as keyof SliderState]])),
        ...Object.fromEntries(Object.values(PAD1_TO_PAD2_ENGINE).map((key) => [key, s[key as keyof SliderState]])),
      }
    );
  }

  /** Ensure pad WASM exists when synth Euclid runs without full engine start(). */
  private async ensurePadWasmForIndependentSynth(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.padWasmNode || !this.synthBus) return;
    if (this.padWasmInitPromise) return this.padWasmInitPromise;

    this.padWasmInitPromise = (async () => {
      try {
        if (this.padWasmModuleContext !== ctx) {
          await ctx.audioWorklet.addModule(padSynthWasmWorkletUrl);
          this.padWasmModuleContext = ctx;
        }

        if (!this.wasmPadBinary) {
          const padWasmUrl = getWorkletUrl('kessho_pad.wasm');
          const padResp = await fetch(padWasmUrl);
          if (!padResp.ok) throw new Error(`Pad WASM fetch failed: ${padResp.status}`);
          this.wasmPadBinary = await padResp.arrayBuffer();
        }

        this.createPadWasmNode(ctx);

        if (this.pad1Bus) {
          this.padWasmNode!.connect(this.pad1Bus, 4);
        }
        if (this.pad2Bus) {
          this.padWasmNode!.connect(this.pad2Bus, 5);
        }
        if (this.pad1ReverbSend) {
          this.padWasmNode!.connect(this.pad1ReverbSend, 2);
        }
        if (this.pad2ReverbSend) {
          this.padWasmNode!.connect(this.pad2ReverbSend, 3);
        }
        if (this.granularPad1Send) {
          this.padWasmNode!.connect(this.granularPad1Send, 2);
        }
        if (this.granularPad2Send) {
          this.padWasmNode!.connect(this.granularPad2Send, 3);
        }
        if (this.pad1DelayASend) {
          this.padWasmNode!.connect(this.pad1DelayASend, 2);
        }
        if (this.pad2DelayASend) {
          this.padWasmNode!.connect(this.pad2DelayASend, 3);
        }
        if (this.pad1DelayBSend) {
          this.padWasmNode!.connect(this.pad1DelayBSend, 2);
        }
        if (this.pad2DelayBSend) {
          this.padWasmNode!.connect(this.pad2DelayBSend, 3);
        }
      } catch (e) {
        console.warn('Independent pad WASM init failed; JS fallback is disabled:', e);
        this.warnPadWasmUnavailable('ensurePadWasmForIndependentSynth');
      } finally {
        this.padWasmInitPromise = null;
      }
    })();

    return this.padWasmInitPromise;
  }

  private async waitForPadWasmReady(timeoutMs = 1000): Promise<void> {
    await this.waitForWorkletReady(() => this.padWasmNode, () => this.padWasmReady, timeoutMs);
  }

  /** Ensure lead WASM exists when manual/random lead starts from a lead-disabled graph. */
  private async ensureLeadFmWasmForIndependentSynth(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.leadFmWasmNode || !this.lead1SpatialChain || !this.lead2SpatialChain) return;
    if (this.leadFmWasmInitPromise) return this.leadFmWasmInitPromise;

    this.leadFmWasmInitPromise = (async () => {
      try {
        if (this.leadFmWasmModuleContext !== ctx) {
          await ctx.audioWorklet.addModule(leadFmWasmWorkletUrl);
          this.leadFmWasmModuleContext = ctx;
        }

        if (!this.wasmLeadFmBinary) {
          const leadFmWasmUrl = getWorkletUrl('kessho_lead_fm.wasm');
          const leadFmResp = await fetch(leadFmWasmUrl);
          if (!leadFmResp.ok) throw new Error(`Lead FM WASM fetch failed: ${leadFmResp.status}`);
          this.wasmLeadFmBinary = await leadFmResp.arrayBuffer();
        }

        this.createLeadFmWasmNode(ctx);
        this.connectLeadFmWasmOutputs(ctx);
      } catch (error) {
        console.warn('Independent lead FM WASM init failed; JS fallback will be used:', error);
      } finally {
        this.leadFmWasmInitPromise = null;
      }
    })();

    return this.leadFmWasmInitPromise;
  }

  private createLeadFmWasmNode(ctx: AudioContext): void {
    if (!this.wasmLeadFmBinary || this.leadFmWasmNode) return;

    this.leadFmWasmNode = new AudioWorkletNode(ctx, 'lead-fm-wasm', {
      numberOfInputs: 0,
      numberOfOutputs: 2,
      outputChannelCount: [2, 2],
    });
    this.leadFmWasmReady = false;
    this.leadFmWasmNode.port.onmessage = (event) => {
      if (event.data.type === 'wasmReady') {
        this.leadFmWasmReady = true;
        const initMorphed = morphPresets(
          this.lead1PresetA,
          this.lead1PresetB,
          0.5,
          this.sliderState?.lead1AlgorithmMode ?? 'snap',
        );
        this.leadFmWasmNode!.port.postMessage({ type: 'params', params: initMorphed });
        if (this.sliderState) this.sendLeadFmWasmDelay(this.sliderState);
      } else if (event.data.type === 'perf') {
        this.handlePerfMessage(event.data);
      }
    };

    const leadFmBin = this.wasmLeadFmBinary;
    this.wasmLeadFmBinary = null;
    this.leadFmWasmNode.port.postMessage({ type: 'wasmBinary', binary: leadFmBin }, [leadFmBin]);
  }

  private connectLeadFmWasmOutputs(ctx: AudioContext): void {
    if (!this.leadFmWasmNode || !this.lead1SpatialChain || !this.lead2SpatialChain) return;

    if (this.leadWasmLevelGain) {
      try { this.leadFmWasmNode.disconnect(this.leadWasmLevelGain, 0); } catch { /* noop */ }
      try { this.leadWasmLevelGain.disconnect(); } catch { /* noop */ }
    }
    if (this.leadWasmLead2LevelGain) {
      try { this.leadFmWasmNode.disconnect(this.leadWasmLead2LevelGain, 1); } catch { /* noop */ }
      try { this.leadWasmLead2LevelGain.disconnect(); } catch { /* noop */ }
    }
    if (this.lead1ReverbSend) try { this.leadFmWasmNode.disconnect(this.lead1ReverbSend, 0); } catch { /* noop */ }
    if (this.granularLead1Send) try { this.leadFmWasmNode.disconnect(this.granularLead1Send, 0); } catch { /* noop */ }
    if (this.lead1DelayASend) try { this.leadFmWasmNode.disconnect(this.lead1DelayASend, 0); } catch { /* noop */ }
    if (this.lead1DelayBSend) try { this.leadFmWasmNode.disconnect(this.lead1DelayBSend, 0); } catch { /* noop */ }
    if (this.lead2ReverbSend) try { this.leadFmWasmNode.disconnect(this.lead2ReverbSend, 1); } catch { /* noop */ }
    if (this.granularLead2Send) try { this.leadFmWasmNode.disconnect(this.granularLead2Send, 1); } catch { /* noop */ }
    if (this.lead2DelayASend) try { this.leadFmWasmNode.disconnect(this.lead2DelayASend, 1); } catch { /* noop */ }
    if (this.lead2DelayBSend) try { this.leadFmWasmNode.disconnect(this.lead2DelayBSend, 1); } catch { /* noop */ }

    this.leadWasmLevelGain = ctx.createGain();
    this.leadWasmLevelGain.gain.value = this.sliderState?.lead1Level ?? 0.8;
    this.leadFmWasmNode.connect(this.leadWasmLevelGain, 0);
    this.leadWasmLevelGain.connect(this.lead1SpatialChain.postLpf);
    if (this.lead1ReverbSend) this.leadFmWasmNode.connect(this.lead1ReverbSend, 0);
    if (this.granularLead1Send) this.leadFmWasmNode.connect(this.granularLead1Send, 0);
    if (this.lead1DelayASend) this.leadFmWasmNode.connect(this.lead1DelayASend, 0);
    if (this.lead1DelayBSend) this.leadFmWasmNode.connect(this.lead1DelayBSend, 0);

    this.leadWasmLead2LevelGain = ctx.createGain();
    this.leadWasmLead2LevelGain.gain.value = this.sliderState?.lead2Level ?? 0.6;
    this.leadFmWasmNode.connect(this.leadWasmLead2LevelGain, 1);
    this.leadWasmLead2LevelGain.connect(this.lead2SpatialChain.postLpf);
    if (this.lead2ReverbSend) this.leadFmWasmNode.connect(this.lead2ReverbSend, 1);
    if (this.granularLead2Send) this.leadFmWasmNode.connect(this.granularLead2Send, 1);
    if (this.lead2DelayASend) this.leadFmWasmNode.connect(this.lead2DelayASend, 1);
    if (this.lead2DelayBSend) this.leadFmWasmNode.connect(this.lead2DelayBSend, 1);
  }

  private async waitForLeadFmWasmReady(timeoutMs = 1000): Promise<void> {
    await this.waitForWorkletReady(() => this.leadFmWasmNode, () => this.leadFmWasmReady, timeoutMs);
  }

  private async waitForDrumWasmReady(timeoutMs = 1000): Promise<void> {
    await this.waitForWorkletReady(() => this.drumWasmNode, () => this.drumWasmReady, timeoutMs);
  }

  private async waitForSoundscapesWasmReady(timeoutMs = 1000): Promise<void> {
    await this.waitForWorkletReady(() => this.soundscapesNode, () => this.soundscapesWasmReady, timeoutMs);
  }

  /** Voice type name prefixes for drum slider state extraction. */
  private static readonly DRUM_VOICE_PREFIXES: Record<string, string> = {
    drumSub: 'sub', drumKick: 'kick', drumClick: 'click',
    drumBeepHi: 'beepHi', drumBeepLo: 'beepLo',
    drumNoise: 'noise', drumMembrane: 'membrane',
  };

  /** Forward drum params to WASM worklet. Extracts per-voice param sets from sliderState. */
  private sendDrumWasmParams(s: SliderState): void {
    if (!this.drumWasmNode || !this.drumWasmReady) return;
    const port = this.drumWasmNode.port;
    // Per-voice params: strip 'drumSub'/'drumKick'/etc. prefix, lowercase first char
    for (const [prefix, voice] of Object.entries(AudioEngine.DRUM_VOICE_PREFIXES)) {
      const voiceParams: Record<string, unknown> = {};
      for (const key of Object.keys(s)) {
        if (key.startsWith(prefix) && key.length > prefix.length) {
          const rest = key.slice(prefix.length);
          const paramName = rest.charAt(0).toLowerCase() + rest.slice(1);
          voiceParams[paramName] = (s as unknown as Record<string, unknown>)[key];
        }
      }
      if (Object.keys(voiceParams).length > 0) {
        port.postMessage({ type: 'params', voice, params: voiceParams });
      }
    }
    // Global drum params (S&H aware for drumReverbSend)
    port.postMessage({
      type: 'params',
      params: { masterLevel: s.drumLevel, reverbSend: this.shSampledValues['drumReverbSend'] ?? s.drumReverbSend },
    });
  }

  /** Forward lead FM delay params to WASM worklet. */
  private sendLeadFmWasmDelay(s: SliderState): void {
    if (!this.leadFmWasmNode || !this.leadFmWasmReady) return;
    this.leadFmWasmNode.port.postMessage({
      type: 'delay',
      params: {
        enabled: false,
        timeL: s.delayATime ?? 375,
        timeR: (s.delayATime ?? 375) * (s.delayASpread ?? 1.5),
        feedback: 0,
        mix: 0,
        filter: s.delayAFilter ?? 2000,
        send: 0,
      },
    });
  }

  /** Forward drum delay params to WASM worklet. */
  private sendDrumWasmDelay(s: SliderState): void {
    if (!this.drumWasmNode || !this.drumWasmReady) return;
    if (this.sharedDelayA) {
      this.drumWasmNode.port.postMessage({
        type: 'delay',
        params: {
          enabled: false,
          timeL: 0,
          timeR: 0,
          feedback: 0,
          mix: 0,
          filter: 0,
        },
      });
      return;
    }
    const bpm = getSharedSequencerBpm(s);
    const noteToSec = (note: string, bpm: number) => {
      const beat = 60 / bpm;
      const map: Record<string, number> = {
        '1/4': beat, '1/8': beat / 2, '1/8d': beat * 0.75,
        '1/16': beat / 4, '1/4d': beat * 1.5, '1/2': beat * 2,
        '3/16': beat * 0.375, '1/32': beat / 8,
      };
      return map[note] ?? beat / 2;
    };
    this.drumWasmNode.port.postMessage({
      type: 'delay',
      params: {
        enabled: s.drumDelayEnabled ?? false,
        timeL: noteToSec(s.drumDelayNoteL ?? '1/8d', bpm),
        timeR: noteToSec(s.drumDelayNoteR ?? '1/4', bpm),
        feedback: s.drumDelayFeedback ?? 0.4,
        mix: s.drumDelayMix ?? 0.3,
        filter: 500 * Math.pow(32, s.drumDelayFilter ?? 0.5),
      },
    });
  }

  /**
   * Trigger a single synth voice with a specific frequency.
   * Used by Euclidean sequencer to play individual synth notes.
   * @param voiceIndex Which voice (0-7) to trigger
   * @param frequency Note frequency in Hz
   * @param velocity Volume/intensity (0-1)
   * @param noteDuration Optional duration in seconds; if provided, schedules release after this time
   */
  triggerSynthVoice(voiceIndex: number, frequency: number, velocity: number, noteDuration?: number, padParamsOverride?: SliderState): void {
    if (!this.ctx || !this.sliderState || voiceIndex < 0 || voiceIndex >= PAD_VOICE_COUNT) return;
    // Euclidean synth lanes can target pad voices even when the pad engine toggle is off.
    if (!this.isAnyPadSourceActive(this.sliderState)) return;

    const isPad2Voice = this.sliderState.pad2Enabled && ((this.sliderState.pad2VoiceAssign ?? 0) & (1 << voiceIndex)) !== 0;
    // Don't bake pad level into velocity — WASM C++ applies level to main output only
    // (reverb and granular pre-fader outputs are independent of pad level).
    const clampedVelocity = Math.max(0, Math.min(1, velocity));
    if (clampedVelocity < 0.001) return;
    this.reportFxOnset(isPad2Voice ? 'pad2' : 'pad1', 'padEuclid');

    if (!this.padWasmNode) {
      this.warnPadWasmUnavailable('triggerSynthVoice');
      return;
    }

    if (padParamsOverride) {
      this.sendPadWasmParams(padParamsOverride);
    }
    this.synthVoiceNoteGen[voiceIndex] = (this.synthVoiceNoteGen[voiceIndex] ?? 0) + 1;
    this.padWasmNode.port.postMessage({
      type: 'noteOn',
      voiceIndex,
      frequency,
      velocity: clampedVelocity,
      holdSeconds: noteDuration ?? 0,
    });
  }

  // Current spectral freeze routing mode (to detect changes)
  private currentSpectralFreezeRouting: 'pre' | 'post' | null = null;

  /**
   * Wire spectral freeze node into the audio graph.
   *
   * Pre-reverb routing:
   *   reverbInputBus → pre-comp/makeup → spectralFreezeNode → reverbNode
   *   reverbInputBus → pre-comp/makeup → reverbDirectSend  → reverbNode
   *   reverbNode → reverbOutputGain
   *
   * Post-reverb routing:
   *   reverbInputBus → pre-comp/makeup → reverbNode → spectralFreezeNode → reverbOutputGain
   *
   * Disabled:
   *   reverbInputBus → pre-comp/makeup → reverbNode → reverbOutputGain
   */
  private applySpectralFreezeRouting(): void {
    const reverbSourceNode = this.reverbPreConditionerNode ?? this.reverbPreMakeupGain ?? this.reverbPreCompressor ?? this.reverbInputBus;
    if (!this.reverbNode || !this.reverbOutputGain || !this.reverbInputBus || !this.reverbDirectSend || !reverbSourceNode) return;
    const state = this.sliderState;
    const routing = state?.spectralFreezeRouting ?? 'pre';
    const enabled = state?.spectralFreezeEnabled ?? false;

    // ── Tear down all variable connections ──
    // Disconnect spectral freeze node outputs
    if (this.spectralFreezeNode) {
      try { this.spectralFreezeNode.disconnect(); } catch (_) { /* */ }
    }
    // Disconnect conditioned reverb source → spectralFreezeNode (pre-mode input)
    if (this.spectralFreezeNode) {
      try { reverbSourceNode.disconnect(this.spectralFreezeNode); } catch (_) { /* */ }
    }
    // Disconnect conditioned reverb source → reverbNode / reverbDirectSend
    try { reverbSourceNode.disconnect(this.reverbNode); } catch (_) { /* */ }
    try { reverbSourceNode.disconnect(this.reverbDirectSend); } catch (_) { /* */ }
    // Disconnect reverbDirectSend → reverbNode
    try { this.reverbDirectSend.disconnect(this.reverbNode); } catch (_) { /* */ }
    // Disconnect reverbNode outputs
    try { this.reverbNode.disconnect(); } catch (_) { /* */ }

    // reverbInputBus gain always stays at 1 — crossfade is on reverbDirectSend
    this.reverbInputBus.gain.value = 1.0;

    if (!enabled || !this.spectralFreezeNode) {
      // ── Disabled: direct routing ──
      // conditioned reverb source → reverbNode → reverbOutputGain
      reverbSourceNode.connect(this.reverbNode);
      this.reverbNode.connect(this.reverbOutputGain);
      this.reverbDirectSend.gain.value = 0;  // unused
      this.currentSpectralFreezeRouting = null;
      return;
    }

    if (routing === 'pre') {
      // ── Pre-reverb ──
      // Path 1 (frozen): conditioned reverb source → spectralFreezeNode → reverbNode
      reverbSourceNode.connect(this.spectralFreezeNode);
      this.spectralFreezeNode.connect(this.reverbNode);

      // Path 2 (live crossfade): conditioned reverb source → reverbDirectSend → reverbNode
      // crossfade=1 means "fully frozen" = no live bleed, crossfade=0 = full live signal
      reverbSourceNode.connect(this.reverbDirectSend);
      this.reverbDirectSend.connect(this.reverbNode);
      const crossfade = state?.spectralFreezeReverbCrossfade ?? 0.5;
      this.reverbDirectSend.gain.value = 1.0 - crossfade;

      // Reverb output
      this.reverbNode.connect(this.reverbOutputGain);
    } else {
      // ── Post-reverb ──
      // conditioned reverb source → reverbNode → spectralFreezeNode → reverbOutputGain
      reverbSourceNode.connect(this.reverbNode);
      this.reverbNode.connect(this.spectralFreezeNode);
      this.spectralFreezeNode.connect(this.reverbOutputGain);
      this.reverbDirectSend.gain.value = 0;  // unused
    }

    this.currentSpectralFreezeRouting = routing;
  }

  private applyParams(state: SliderState): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const smoothTime = this.getParamSmoothTime(0.05);

    // Helper: guard against NaN/Infinity in audio param values (crash prevention)
    const fin = (v: number, fallback: number): number => Number.isFinite(v) ? v : fallback;

    // ── S&H: 10Hz engine-side re-sampling for dual-range params ──
    const shNow = performance.now();
    if (shNow - this.shLastSampleTime >= 100) {
      this.shLastSampleTime = shNow;
      const shPositions: Record<string, number> = {};
      for (const key of Object.keys(this.dualRanges)) {
        if (
          this.isFxOwnershipDrivenKey(key) ||
          this.isPianoTriggerDrivenKey(key) ||
          this.isPadTriggerDrivenKey(key) ||
          key === 'grainSize' ||
          key === 'waterSurfDuration' ||
          key === 'waterSurfInterval' ||
          key === 'waterSurfFoam' ||
          key === 'waterSurfProximity' ||
          key === 'waterSurfDepth' ||
          key === 'waterSurfBody' ||
          key === 'waterSurfSpray' ||
          key === 'waterSurfFoamBright'
        ) continue; // Surf + grainSize use worklet-side/per-wave sampling
        if (key.startsWith('lead') || key.startsWith('granularLead')) continue; // Lead keys use per-trigger sampling in playLeadNote
        const range = this.dualRanges[key];
        if (range) {
          const sampled = range.min + Math.random() * (range.max - range.min);
          this.shSampledValues[key] = sampled;
          // Normalized 0-1 position within the range
          const span = range.max - range.min;
          shPositions[key] = span > 0 ? (sampled - range.min) / span : 0.5;
        }
      }
      // Clean stale keys no longer in dualRanges
      for (const key of Object.keys(this.shSampledValues)) {
        if (key.startsWith('lead') || key.startsWith('granularLead')) {
          if (!this.dualRanges[key]) delete this.shSampledValues[key];
          continue; // active lead keys are managed per-trigger in playLeadNote
        }
        if (this.isPadTriggerDrivenKey(key)) {
          if (!this.dualRanges[key]) delete this.shSampledValues[key];
          continue; // pad keys hold their last trigger value until the next pad onset
        }
        if (this.isPianoTriggerDrivenKey(key)) {
          if (!this.dualRanges[key]) delete this.shSampledValues[key];
          continue; // piano keys hold their last trigger value until the next piano onset
        }
        if (this.isFxOwnershipDrivenKey(key)) {
          if (!this.dualRanges[key]) delete this.shSampledValues[key];
          continue; // owned FX keys hold their last value until the next qualifying onset
        }
        if (
          !this.dualRanges[key] ||
          key === 'grainSize' ||
          key === 'waterSurfDuration' ||
          key === 'waterSurfInterval' ||
          key === 'waterSurfFoam' ||
          key === 'waterSurfProximity' ||
          key === 'waterSurfDepth' ||
          key === 'waterSurfBody' ||
          key === 'waterSurfSpray' ||
          key === 'waterSurfFoamBright'
        ) {
          delete this.shSampledValues[key];
        }
      }
      if (Object.keys(shPositions).length > 0 && this.onGranularSHTrigger) {
        this.onGranularSHTrigger(shPositions);
      }
    }
    // S&H value helper: sampled value if available, else fallback to state value
    const shv = (k: string, v: number) => this.shv(k, v);
    const padState = this.getEffectivePadState(state);

    // Master volume
    this.masterGain?.gain.setTargetAtTime(fin(state.masterVolume, DEFAULT_MASTER_VOLUME) * MASTER_OUTPUT_TRIM, now, smoothTime);
    this.applyMasterSaturation(state, now);
    this.applyDynamics(state, now);
    this.applySidechainTargetGains(state, now, smoothTime);

    // Voice parameters
    // Filter cutoff modulates between filterCutoffMin and filterCutoffMax
    const minCutoff = Math.min(
      shv('filterCutoffMin', padState.filterCutoffMin ?? 200),
      shv('filterCutoffMax', padState.filterCutoffMax ?? 8000),
    );
    const maxCutoff = Math.max(
      shv('filterCutoffMin', padState.filterCutoffMin ?? 200),
      shv('filterCutoffMax', padState.filterCutoffMax ?? 8000),
    );

    // ── LFO computation (Phase 2: all waveshapes, all destinations) ──
    const lfoDepth = shv('padLfo1Depth', padState.padLfo1Depth ?? 0);
    const lfoDest = padState.padLfo1Dest ?? 'none';
    const lfoRate = shv('padLfo1Rate', padState.padLfo1Rate ?? 0.5);
    const lfoWave = padState.padLfo1Wave ?? 'sine';

    // Filter cutoff sits at center of min/max range; LFO adds modulation on top
    const modAmount = 0.5;
    const cutoff = minCutoff + (maxCutoff - minCutoff) * modAmount;

    // Q (bandwidth/angle) is set directly from filterQ
    const filterQ = shv('filterQ', padState.filterQ);

    // Resonance adds a peak boost at the cutoff frequency, modulated by hardness
    const resonanceBoost = shv('filterResonance', padState.filterResonance) * (0.7 + shv('hardness', padState.hardness) * 0.6);

    // Combined Q: base Q plus resonance boost
    // At very low cutoffs, increase Q for more aggressive filtering
    const lowCutoffBoost = cutoff < 200 ? (1 - cutoff / 200) * 4 : 0;
    const effectiveQ = filterQ + resonanceBoost * 8 + lowCutoffBoost;

    // Warmth: low shelf boost (0 to +8dB)
    const warmthGain = shv('warmth', padState.warmth) * 8;

    // Presence: peaking EQ (-6dB to +6dB) - helps cut or boost mids
    // At 0.5 = neutral, below = cut harsh mids, above = boost presence
    const presenceGain = (shv('presence', padState.presence) - 0.5) * 12;

    // Pad oscillator params
    const oscAWave = (padState.padOscAWave ?? 'sawtooth') as OscillatorType;
    const oscBWave = (padState.padOscBWave ?? 'triangle') as OscillatorType;
    const subEnabled = padState.padSubEnabled ?? false;
    const oscALevel = shv('padOscALevel', padState.padOscALevel ?? 0.6);
    const oscBLevel = shv('padOscBLevel', padState.padOscBLevel ?? 0.4);

    // Osc Mix crossfade: 0=A only, 0.5=both full, 1=B only
    const oscMix = shv('padOscMix', padState.padOscMix ?? 0.5);
    const aMix = Math.min(1, 2 * (1 - oscMix));
    const bMix = Math.min(1, 2 * oscMix);
    const effectiveALevel = oscALevel * aMix;
    const effectiveBLevel = oscBLevel * bMix;

    // ── LFO value computation (via helper) ──
    const lfoValue = this.computeLfoValue(now, lfoRate, lfoDepth, lfoWave, lfoDest, this.lfo1State);

    // Store for UI visualization (real engine value)
    this.currentLfoValue = lfoValue;

    // ── LFO 2 value computation (via helper) ──
    const lfo2Depth = shv('padLfo2Depth', padState.padLfo2Depth ?? 0);
    const lfo2Dest = padState.padLfo2Dest ?? 'none';
    const lfo2Rate = shv('padLfo2Rate', padState.padLfo2Rate ?? 0.5);
    const lfo2Wave = padState.padLfo2Wave ?? 'sine';
    const lfo2Value = this.computeLfoValue(now, lfo2Rate, lfo2Depth, lfo2Wave, lfo2Dest, this.lfo2State);
    this.currentLfo2Value = lfo2Value;

    // ── Build Pad 1 derived param set ──
    const lfo1FiltMod = lfoDest === 'filterCutoff' ? lfoValue * (maxCutoff - minCutoff) * 0.5 : 0;
    const lfo2FiltMod = lfo2Dest === 'filterCutoff' ? lfo2Value * (maxCutoff - minCutoff) * 0.5 : 0;
    let modEnvFilterMod = 0, modEnvPitchCents = 0;
    if ((padState.padModEnvEnabled ?? false) && (shv('padModEnvDepth', padState.padModEnvDepth ?? 0)) !== 0) {
      const mDest = padState.padModEnvDest ?? 'filterCutoff';
      if (mDest === 'filterCutoff' || mDest === 'pitch') {
        const mA = shv('padModEnvAttack', padState.padModEnvAttack ?? 0.1);
        const mD = shv('padModEnvDecay', padState.padModEnvDecay ?? 0.3);
        const mS = shv('padModEnvSustain', padState.padModEnvSustain ?? 0);
        const mCycle = mA + mD + 1, mPh = (now % mCycle) / mCycle;
        const mAP = mA / mCycle, mDP = (mA + mD) / mCycle;
        let mV = mPh < mAP ? mPh / mAP : mPh < mDP ? 1 - (1 - mS) * ((mPh - mAP) / (mDP - mAP)) : mS;
        mV *= shv('padModEnvDepth', padState.padModEnvDepth ?? 0);
        if (mDest === 'filterCutoff') modEnvFilterMod = mV * (maxCutoff - minCutoff) * 0.5;
        else modEnvPitchCents = mV * 400;
      }
    }

    const p1FilterCutoffWithoutEnv = fin(Math.max(20, Math.min(20000, cutoff + lfo1FiltMod + lfo2FiltMod)), 1000);
    const p1 = {
      oscAWave, oscBWave, subEnabled, subWave: (padState.padSubWave ?? 'sine') as OscillatorType,
      effectiveALevel: fin(effectiveALevel, 0), effectiveBLevel: fin(effectiveBLevel, 0),
      subLevel: fin(shv('padSubLevel', padState.padSubLevel ?? 0.3), 0.3), noiseLevel: fin(shv('padNoiseLevel', padState.padNoiseLevel ?? 0.15), 0.15),
      fbEnabled: padState.padFilterBEnabled ?? false,
      filterType: padState.filterType as BiquadFilterType,
      finalCutoff: fin(Math.max(20, Math.min(20000, cutoff + lfo1FiltMod + lfo2FiltMod + modEnvFilterMod)), 1000),
      effectiveQ: fin(effectiveQ, 1),
      warmthGain: fin(warmthGain, 0), presenceGain: fin(presenceGain, 0),
      lfoAmpMod: fin(1 + (lfoDest === 'amplitude' ? lfoValue * 0.5 : 0) + (lfo2Dest === 'amplitude' ? lfo2Value * 0.5 : 0), 1),
      lfoPitchCents: fin((lfoDest === 'pitch' ? lfoValue * 200 : 0) + (lfo2Dest === 'pitch' ? lfo2Value * 200 : 0) + modEnvPitchCents, 0),
      lfoOscBMod: fin((lfoDest === 'oscBLevel' ? lfoValue * 0.5 : 0) + (lfo2Dest === 'oscBLevel' ? lfo2Value * 0.5 : 0), 0),
      lfoFilterBMod: fin((lfoDest === 'filterBCutoff' ? lfoValue * 2000 : 0) + (lfo2Dest === 'filterBCutoff' ? lfo2Value * 2000 : 0), 0),
      lfoDest, lfo2Dest,
      modEnvEnabled: padState.padModEnvEnabled ?? false, modEnvDest: padState.padModEnvDest ?? 'filterCutoff',
      oscADetune: shv('padOscADetune', padState.padOscADetune ?? shv('detune', padState.detune)),
      oscBDetune: shv('padOscBDetune', padState.padOscBDetune ?? shv('detune', padState.detune)),
      filterBType: (padState.padFilterBType ?? 'highpass') as BiquadFilterType,
      filterBFreq: fin(shv('padFilterBCutoff', padState.padFilterBCutoff ?? 200), 200),
      filterBResBoost: fin(shv('padFilterBResonance', padState.padFilterBResonance ?? 0.2) * 6, 0), filterBQ: fin(shv('padFilterBQ', padState.padFilterBQ ?? 1), 1),
      filterRouting: padState.padFilterRouting ?? 'series',
      hardness: fin(shv('hardness', padState.hardness), 0.5),
    };

    this.currentFilterFreq = p1.finalCutoff;
    this.currentPad1FilterFreq = p1FilterCutoffWithoutEnv;
    this.currentPad1LfoValue = lfoValue;

    // ── Build Pad 2 derived param set (only when enabled + voices assigned) ──
    const pad2Assign = state.pad2VoiceAssign ?? 0;
    const pad2On = state.pad2Enabled === true;
    let p2 = p1;
    let p2l1ValForUi = 0;
    let p2FilterCutoffForUi = p1FilterCutoffWithoutEnv;
    if (pad2On) {
      const p2l1Dest = (padState.pad2Lfo1Dest ?? 'none') as string;
      const p2l2Dest = (padState.pad2Lfo2Dest ?? 'none') as string;
      const p2l1Val = this.computeLfoValue(now, shv('pad2Lfo1Rate', padState.pad2Lfo1Rate ?? 0.5), shv('pad2Lfo1Depth', padState.pad2Lfo1Depth ?? 0), padState.pad2Lfo1Wave ?? 'sine', p2l1Dest, this.pad2Lfo1State);
      const p2l2Val = this.computeLfoValue(now, shv('pad2Lfo2Rate', padState.pad2Lfo2Rate ?? 0.5), shv('pad2Lfo2Depth', padState.pad2Lfo2Depth ?? 0), padState.pad2Lfo2Wave ?? 'sine', p2l2Dest, this.pad2Lfo2State);
      p2l1ValForUi = p2l1Val;

      const minC2 = Math.min(shv('pad2FilterCutoffMin', padState.pad2FilterCutoffMin), shv('pad2FilterCutoffMax', padState.pad2FilterCutoffMax));
      const maxC2 = Math.max(shv('pad2FilterCutoffMin', padState.pad2FilterCutoffMin), shv('pad2FilterCutoffMax', padState.pad2FilterCutoffMax));
      const cut2 = minC2 + (maxC2 - minC2) * 0.5;
      const res2 = shv('pad2FilterResonance', padState.pad2FilterResonance) * (0.7 + shv('pad2Hardness', padState.pad2Hardness) * 0.6);
      const lcb2 = cut2 < 200 ? (1 - cut2 / 200) * 4 : 0;

      let me2FMod = 0, me2PCents = 0;
      if ((padState.pad2ModEnvEnabled ?? false) && (shv('pad2ModEnvDepth', padState.pad2ModEnvDepth ?? 0)) !== 0) {
        const md = padState.pad2ModEnvDest ?? 'filterCutoff';
        if (md === 'filterCutoff' || md === 'pitch') {
          const mA = shv('pad2ModEnvAttack', padState.pad2ModEnvAttack ?? 0.1);
          const mD = shv('pad2ModEnvDecay', padState.pad2ModEnvDecay ?? 0.3);
          const mS = shv('pad2ModEnvSustain', padState.pad2ModEnvSustain ?? 0);
          const mCy = mA + mD + 1, mPh = (now % mCy) / mCy, mAP = mA / mCy, mDP = (mA + mD) / mCy;
          let mV = mPh < mAP ? mPh / mAP : mPh < mDP ? 1 - (1 - mS) * ((mPh - mAP) / (mDP - mAP)) : mS;
          mV *= shv('pad2ModEnvDepth', padState.pad2ModEnvDepth ?? 0);
          if (md === 'filterCutoff') me2FMod = mV * (maxC2 - minC2) * 0.5; else me2PCents = mV * 400;
        }
      }

      const oscMix2 = shv('pad2OscMix', padState.pad2OscMix ?? 0.5);
      const aMx2 = Math.min(1, 2 * (1 - oscMix2)), bMx2 = Math.min(1, 2 * oscMix2);

      const p2FilterCutoffWithoutEnv = fin(Math.max(20, Math.min(20000, cut2 + (p2l1Dest === 'filterCutoff' ? p2l1Val * (maxC2 - minC2) * 0.5 : 0) + (p2l2Dest === 'filterCutoff' ? p2l2Val * (maxC2 - minC2) * 0.5 : 0))), 1000);
      p2FilterCutoffForUi = p2FilterCutoffWithoutEnv;
      p2 = {
        oscAWave: (padState.pad2OscAWave ?? 'sawtooth') as OscillatorType,
        oscBWave: (padState.pad2OscBWave ?? 'triangle') as OscillatorType,
        subEnabled: padState.pad2SubEnabled ?? false,
        subWave: (padState.pad2SubWave ?? 'sine') as OscillatorType,
        effectiveALevel: fin(shv('pad2OscALevel', padState.pad2OscALevel ?? 0.6) * aMx2, 0),
        effectiveBLevel: fin(shv('pad2OscBLevel', padState.pad2OscBLevel ?? 0.4) * bMx2, 0),
        subLevel: fin(shv('pad2SubLevel', padState.pad2SubLevel ?? 0.3), 0.3), noiseLevel: fin(shv('pad2NoiseLevel', padState.pad2NoiseLevel ?? 0.15), 0.15),
        fbEnabled: padState.pad2FilterBEnabled ?? false,
        filterType: (padState.pad2FilterType ?? 'lowpass') as BiquadFilterType,
        finalCutoff: fin(Math.max(20, Math.min(20000, cut2 + (p2l1Dest === 'filterCutoff' ? p2l1Val * (maxC2 - minC2) * 0.5 : 0) + (p2l2Dest === 'filterCutoff' ? p2l2Val * (maxC2 - minC2) * 0.5 : 0) + me2FMod)), 1000),
        effectiveQ: fin(shv('pad2FilterQ', padState.pad2FilterQ) + res2 * 8 + lcb2, 1),
        warmthGain: fin(shv('pad2Warmth', padState.pad2Warmth) * 8, 0),
        presenceGain: fin((shv('pad2Presence', padState.pad2Presence) - 0.5) * 12, 0),
        lfoAmpMod: fin(1 + (p2l1Dest === 'amplitude' ? p2l1Val * 0.5 : 0) + (p2l2Dest === 'amplitude' ? p2l2Val * 0.5 : 0), 1),
        lfoPitchCents: fin((p2l1Dest === 'pitch' ? p2l1Val * 200 : 0) + (p2l2Dest === 'pitch' ? p2l2Val * 200 : 0) + me2PCents, 0),
        lfoOscBMod: fin((p2l1Dest === 'oscBLevel' ? p2l1Val * 0.5 : 0) + (p2l2Dest === 'oscBLevel' ? p2l2Val * 0.5 : 0), 0),
        lfoFilterBMod: fin((p2l1Dest === 'filterBCutoff' ? p2l1Val * 2000 : 0) + (p2l2Dest === 'filterBCutoff' ? p2l2Val * 2000 : 0), 0),
        lfoDest: p2l1Dest as typeof p1.lfoDest, lfo2Dest: p2l2Dest as typeof p1.lfo2Dest,
        modEnvEnabled: padState.pad2ModEnvEnabled ?? false, modEnvDest: padState.pad2ModEnvDest ?? 'filterCutoff',
        oscADetune: shv('pad2OscADetune', padState.pad2OscADetune ?? shv('detune', padState.detune)),
        oscBDetune: shv('pad2OscBDetune', padState.pad2OscBDetune ?? shv('detune', padState.detune)),
        filterBType: (padState.pad2FilterBType ?? 'highpass') as BiquadFilterType,
        filterBFreq: fin(shv('pad2FilterBCutoff', padState.pad2FilterBCutoff ?? 200), 200),
        filterBResBoost: fin(shv('pad2FilterBResonance', padState.pad2FilterBResonance ?? 0.2) * 6, 0), filterBQ: fin(shv('pad2FilterBQ', padState.pad2FilterBQ ?? 1), 1),
        filterRouting: padState.pad2FilterRouting ?? 'series',
        hardness: fin(shv('pad2Hardness', padState.pad2Hardness), 0.5),
      };
    }
    this.currentPad2FilterFreq = p2FilterCutoffForUi;
    this.currentPad2LfoValue = p2l1ValForUi;

    // ── Re-route voices between pad1Bus/pad2Bus when assignment changes ──
    const effectivePad2Assign = pad2On ? pad2Assign : 0;
    if (this.pad1Bus && this.pad2Bus && effectivePad2Assign !== this.lastPad2VoiceAssign) {
      const pad1Bus = this.pad1Bus;
      const pad2Bus = this.pad2Bus;
      const pad1PreFaderBus = this.pad1PreFaderBus;
      const pad2PreFaderBus = this.pad2PreFaderBus;
      for (let i = 0; i < PAD_VOICE_COUNT; i += 1) {
        const wasPad2 = (this.lastPad2VoiceAssign & (1 << i)) !== 0;
        const isPad2 = (effectivePad2Assign & (1 << i)) !== 0;
        if (wasPad2 !== isPad2) {
          this.padWasmNode?.port.postMessage({ type: 'voicePad', voiceIndex: i, pad: isPad2 ? 1 : 0 });
        }
      }
      this.voices.forEach((voice, i) => {
        const wasPad2 = (this.lastPad2VoiceAssign & (1 << i)) !== 0;
        const isPad2 = (effectivePad2Assign & (1 << i)) !== 0;
        if (wasPad2 !== isPad2) {
          // Re-route post-fader (mixerGain → pad bus)
          try { voice.mixerGain.disconnect(wasPad2 ? pad2Bus : pad1Bus); } catch (_e) { /* ignore */ }
          voice.mixerGain.connect(isPad2 ? pad2Bus : pad1Bus);
          // Re-route pre-fader (envelope → pre-fader bus for granular)
          if (pad1PreFaderBus && pad2PreFaderBus) {
            try { voice.envelope.disconnect(wasPad2 ? pad2PreFaderBus : pad1PreFaderBus); } catch (_e) { /* ignore */ }
            voice.envelope.connect(isPad2 ? pad2PreFaderBus : pad1PreFaderBus);
          }
        }
      });
      this.lastPad2VoiceAssign = effectivePad2Assign;
    }

    // ── Unified voice loop (per-voice pad selection) ──
    this.voices.forEach((voice, i) => {
      const p = (pad2On && (pad2Assign & (1 << i))) ? p2 : p1;

      // Waveforms
      voice.osc1.type = p.oscAWave;
      voice.osc2.type = p.oscAWave;
      voice.osc3.type = p.oscBWave;
      voice.osc4.type = p.subEnabled ? p.subWave : p.oscBWave;

      // Levels (with osc mix crossfade)
      // Use cancelAndHoldAtTime + setValueAtTime for zero targets to ensure silence
      // (setTargetAtTime asymptotically approaches zero but never reaches it)
      const osc1Target = p.effectiveALevel;
      const osc2Target = p.effectiveALevel * 0.8;
      const oscBFinal = Math.max(0, p.effectiveBLevel + p.lfoOscBMod);
      const osc4Target = p.subEnabled ? p.subLevel : oscBFinal * 0.8;
      if (osc1Target < 0.001) {
        voice.osc1Gain.gain.cancelScheduledValues(now);
        voice.osc1Gain.gain.setTargetAtTime(0, now, 0.01);
      } else {
        voice.osc1Gain.gain.setTargetAtTime(osc1Target, now, smoothTime);
      }
      if (osc2Target < 0.001) {
        voice.osc2Gain.gain.cancelScheduledValues(now);
        voice.osc2Gain.gain.setTargetAtTime(0, now, 0.01);
      } else {
        voice.osc2Gain.gain.setTargetAtTime(osc2Target, now, smoothTime);
      }
      if (oscBFinal < 0.001) {
        voice.osc3Gain.gain.cancelScheduledValues(now);
        voice.osc3Gain.gain.setTargetAtTime(0, now, 0.01);
      } else {
        voice.osc3Gain.gain.setTargetAtTime(oscBFinal, now, smoothTime);
      }
      if (osc4Target < 0.001) {
        voice.osc4Gain.gain.cancelScheduledValues(now);
        voice.osc4Gain.gain.setTargetAtTime(0, now, 0.01);
      } else {
        voice.osc4Gain.gain.setTargetAtTime(osc4Target, now, smoothTime);
      }

      // LFO → amplitude
      if (p.lfoDest === 'amplitude' || p.lfo2Dest === 'amplitude') {
        voice.modEnvGain.gain.setTargetAtTime(Math.max(0, p.lfoAmpMod), now, smoothTime);
      }

      // LFO → pitch
      if (p.lfoDest === 'pitch' || p.lfo2Dest === 'pitch' || (p.modEnvEnabled && p.modEnvDest === 'pitch')) {
        voice.osc1.detune.setTargetAtTime(p.lfoPitchCents, now, smoothTime);
        voice.osc2.detune.setTargetAtTime(p.lfoPitchCents - p.oscADetune, now, smoothTime);
        voice.osc3.detune.setTargetAtTime(p.lfoPitchCents + p.oscBDetune, now, smoothTime);
        voice.osc4.detune.setTargetAtTime(p.lfoPitchCents, now, smoothTime);
      }

      // Main filter (A)
      voice.filter.type = p.filterType;
      voice.filter.frequency.setTargetAtTime(p.finalCutoff, now, smoothTime);
      voice.filter.Q.setTargetAtTime(p.effectiveQ, now, smoothTime);

      // Filter B
      if (p.fbEnabled) {
        voice.filterB.type = p.filterBType;
        voice.filterB.frequency.setTargetAtTime(fin(Math.max(20, Math.min(20000, p.filterBFreq + p.lfoFilterBMod)), 200), now, smoothTime);
        voice.filterB.Q.setTargetAtTime(fin(p.filterBQ + p.filterBResBoost, 1), now, smoothTime);
      } else {
        voice.filterB.type = 'lowpass';
        voice.filterB.frequency.setTargetAtTime(20000, now, smoothTime);
        voice.filterB.Q.setTargetAtTime(0.1, now, smoothTime);
      }

      // Filter routing
      if (p.filterRouting === 'bOnly') {
        voice.filter.type = 'lowpass';
        voice.filter.frequency.setTargetAtTime(20000, now, smoothTime);
        voice.filter.Q.setTargetAtTime(0.1, now, smoothTime);
      } else if (p.filterRouting === 'aOnly' && p.fbEnabled) {
        voice.filterB.type = 'lowpass';
        voice.filterB.frequency.setTargetAtTime(20000, now, smoothTime);
        voice.filterB.Q.setTargetAtTime(0.1, now, smoothTime);
      }

      // EQ
      voice.warmthFilter.gain.setTargetAtTime(p.warmthGain, now, smoothTime);
      voice.presenceFilter.gain.setTargetAtTime(p.presenceGain, now, smoothTime);

      // Noise
      voice.noiseGain.gain.setTargetAtTime(p.noiseLevel * 0.1, now, smoothTime);

      // Per-voice mixer level (pad 1 = synthLevel, pad 2 = pad2Level)
      const voiceLevel = (pad2On && (pad2Assign & (1 << i)))
        ? shv('pad2Level', padState.pad2Level ?? 0.6)
        : shv('synthLevel', padState.synthLevel ?? 0.6);
      voice.mixerGain.gain.setTargetAtTime((voiceLevel ?? 0.6) * ENGINE_TRIMS.pad, now, smoothTime);
    });

    // ── Legacy JS saturation curves (only if the dormant fallback graph exists) ──
    if (this.voices.length > 0) {
      const pad1Hardness = shv('hardness', padState.hardness);
      if (pad1Hardness !== this.lastHardness) {
        this.lastHardness = pad1Hardness;
        const curve1 = this.createSaturationCurve(pad1Hardness);
        this.voices.forEach((voice, i) => {
          if (!(pad2On && (pad2Assign & (1 << i)))) voice.saturation.curve = curve1;
        });
      }
      const pad2Hardness = shv('pad2Hardness', padState.pad2Hardness);
      if (pad2On && pad2Hardness !== this.pad2LastHardness) {
        this.pad2LastHardness = pad2Hardness;
        const curve2 = this.createSaturationCurve(pad2Hardness);
        this.voices.forEach((voice, i) => {
          if (pad2Assign & (1 << i)) voice.saturation.curve = curve2;
        });
      }
    }

    // Forward pad params to WASM worklet (if active)
    this.sendPadWasmParams(padState);

    // Legacy JS granular engine REMOVED — all granular processing via Granular FX WASM engine
    // granularLevel and granularReverbSend now control the Granular FX output levels

    const pad1Active = state.padEnabled !== false || this.euclideanUsesPadSource(state);
    const pad2Active = state.pad2Enabled ?? false;
    const lead1WetActive = this.isLead1RouteActive(state);
    const lead2WetActive = this.isLead2RouteActive(state);
    const pianoWetActive = this.isPianoRouteActive(state);
    const lead1Lvl = applyDistanceValue('lead1Level', state, 'lead1');
    const lead2Lvl = applyDistanceValue('lead2Level', state, 'lead2');
    const pianoLvl = applyDistanceValue('pianoLevel', state, 'piano');
    const pad1ReverbLevel = shv('pad1ReverbSend', padState.pad1ReverbSend ?? 0);
    const pad2ReverbLevel = shv('pad2ReverbSend', padState.pad2ReverbSend ?? 0);
    const lead1ReverbLevel = applyDistanceValue('lead1ReverbSend', state, 'lead1');
    const lead2ReverbLevel = applyDistanceValue('lead2ReverbSend', state, 'lead2');
    const pianoReverbLevel = applyDistanceValue('pianoReverbSend', state, 'piano');
    const pad1PostLpf = applyDistanceValue('padPostLPF', state, 'pad1');
    const pad2PostLpf = applyDistanceValue('pad2PostLPF', state, 'pad2');
    const lead1PostLpf = this.getLeadPostLpfCutoff(state, 'lead1');
    const lead2PostLpf = this.getLeadPostLpfCutoff(state, 'lead2');
    const pianoPostLpf = applyDistanceValue('pianoPostLPF', state, 'piano');
    const pad1StereoWidth = applyDistanceValue('padStereoWidth', state, 'pad1');
    const pad2StereoWidth = applyDistanceValue('pad2StereoWidth', state, 'pad2');
    const lead1StereoWidth = applyDistanceValue('lead1StereoWidth', state, 'lead1');
    const lead2StereoWidth = applyDistanceValue('lead2StereoWidth', state, 'lead2');
    const pianoStereoWidth = applyDistanceValue('pianoStereoWidth', state, 'piano');
    const pad1DiffuseSend = applyDistanceValue('padDiffuseSend', state, 'pad1');
    const pad2DiffuseSend = applyDistanceValue('pad2DiffuseSend', state, 'pad2');
    const lead1DiffuseSend = applyDistanceValue('lead1DiffuseSend', state, 'lead1');
    const lead2DiffuseSend = applyDistanceValue('lead2DiffuseSend', state, 'lead2');
    const pianoDiffuseSend = applyDistanceValue('pianoDiffuseSend', state, 'piano');
    const granularBusArmed = this.isGranularBusArmed(state, lead1WetActive, lead2WetActive, pianoWetActive);
    const oceanLayerActive = this.isOceanLayerFadeActive(state, now);
    const waterLayerActive = this.isWaterLayerFadeActive(state, now);
    const insectsLayerActive = this.isInsectsLayerFadeActive(state, now);
    const lead1RoutingActive = !!lead1WetActive;
    const lead2RoutingActive = !!lead2WetActive;
    const pianoRoutingActive = !!pianoWetActive;
    const delayBState = this.getSharedDelayBState(
      state,
      pad1Active,
      pad2Active,
      lead1RoutingActive,
      lead2RoutingActive,
      pianoRoutingActive,
      granularBusArmed,
    );
    const delayBEnabled = delayBState.delayBEnabled;
    this.sharedGranularDelayBSend?.gain.setTargetAtTime(delayBState.granularDelaySourceLevel, now, smoothTime);
    this.sharedDelayB?.update(delayBState.params, now, smoothTime);

    if (pianoWetActive) {
      this.startPianoPriorityWarmup();
    } else {
      this.cancelPianoPriorityWarmup();
    }

    // Granular FX (Granular) parameters
    if (this.granularFxNode) {
      const granularEnabled = granularBusArmed;
      const macroModel = computeGranularMacroModel(state, (key, fallback) => shv(key as string, fallback));
      // Use granularLevel as the Granular FX output level (replaces hardcoded 1.0)
      const granularOutputLevel = granularEnabled ? shv('granularLevel', state.granularLevel) * ENGINE_TRIMS.granular * macroModel.directLevelScale : 0;
      this.granularFxDirect?.gain.setTargetAtTime(granularOutputLevel, now, smoothTime);
      // Use granularReverbSend as the Granular FX reverb send level (S&H aware)
      const granularRevSend = (granularEnabled && state.reverbEnabled) ? shv('granularReverbSend', state.granularReverbSend) * ENGINE_TRIMS.granular : 0;
      this.granularFxReverbSend?.gain.setTargetAtTime(granularRevSend, now, smoothTime);
      this.granularFxReverbLPF?.frequency.setTargetAtTime(macroModel.finalReverbLPF, now, smoothTime);
      this.granularFxOutputLPF?.frequency.setTargetAtTime(macroModel.finalOutputLPF, now, smoothTime);

      // Granular now idles when the whole bus is unused, but the individual source sends
      // themselves are driven by the routing matrix rather than extra per-source gates.
      const pad1Send = (granularEnabled && pad1Active) ? shv('granularPad1Send', padState.granularPad1Send ?? 1.0) : 0;
      const pad2Send = (granularEnabled && pad2Active) ? shv('granularPad2Send', padState.granularPad2Send ?? 0.0) : 0;
      const lead1Send = (granularEnabled && lead1RoutingActive) ? shv('granularLead1Send', state.granularLead1Send ?? 0.0) : 0;
      const lead2Send = (granularEnabled && lead2RoutingActive) ? shv('granularLead2Send', state.granularLead2Send ?? 0.0) : 0;
      const pianoSend = (granularEnabled && pianoRoutingActive) ? shv('granularPianoSend', state.granularPianoSend ?? 0.0) : 0;
      const drumSend = (granularEnabled && state.drumEnabled) ? (state.granularDrumSend ?? 0.0) : 0;
      const wavesSend = (granularEnabled && oceanLayerActive) ? (state.granularWavesSend ?? 0.0) : 0;
      const waterSend = (granularEnabled && waterLayerActive)
        ? this.scaleEarthSend(state.granularWaterSend ?? 0.0, this.getWaterFamilySendScale(state))
        : 0;
      const insectsSend = (granularEnabled && insectsLayerActive)
        ? this.scaleEarthSend(state.granularInsectsSend ?? 0.0, this.getInsectsSharedMasterScale(state))
        : 0;
      this.granularPad1Send?.gain.setTargetAtTime(pad1Send, now, smoothTime);
      this.granularPad2Send?.gain.setTargetAtTime(pad2Send, now, smoothTime);
      this.granularLead1Send?.gain.setTargetAtTime(lead1Send, now, smoothTime);
      this.granularLead2Send?.gain.setTargetAtTime(lead2Send, now, smoothTime);
      this.granularPianoSend?.gain.setTargetAtTime(pianoSend, now, smoothTime);
      this.granularDrumSend?.gain.setTargetAtTime(drumSend, now, smoothTime);
      this.granularWavesSend?.gain.setTargetAtTime(wavesSend, now, smoothTime);
      this.granularWaterSend?.gain.setTargetAtTime(waterSend, now, smoothTime);
      this.granularInsectsSend?.gain.setTargetAtTime(insectsSend, now, smoothTime);

      const granularInternalDryWet = granularEnabled ? 1 : 0;
      const granularGlobalParams: GranularWorkletGlobalParams = {
        enabled: granularEnabled,
        freeze: state.granularFreeze,
        freezeWithFeedback: false,
        dryWet: granularInternalDryWet,
        feedback: shv('granularFeedback', state.granularFeedback),
        feedbackLPF: shv('granularFeedbackLPF', state.granularFeedbackLPF),
        bufferSeconds: shv('granularBufferSeconds', state.granularBufferSeconds),
        grainShape: state.granularShape ?? 'triangle',
      };
      const granularSpaceParams: GranularWorkletSpaceParams = {
        busDiffusion: macroModel.busDiffusion,
        timingRandomness: macroModel.timingRandomness,
        quality: state.granularQuality ?? 'balanced',
        maxGrains: shv('granularMaxGrains', state.granularMaxGrains),
        sprayMacro: shv('granularSprayMacro', state.granularSprayMacro),
        cloudMacro: shv('granularCloudMacro', state.granularCloudMacro),
        pitchMacro: shv('granularPitchMacro', state.granularPitchMacro),
      };
      const granularVoiceParams: GranularWorkletVoiceParams = {
        voiceEnabled: [state.granularV1Enabled, state.granularV2Enabled, state.granularV3Enabled, state.granularV4Enabled],
        voiceMode: [state.granularV1Mode, state.granularV2Mode, state.granularV3Mode, state.granularV4Mode],
        voiceSlice: [state.granularV1Slice, state.granularV2Slice, state.granularV3Slice, state.granularV4Slice],
        voiceSpeed: macroModel.voiceSpeed,
        voiceScanRate: macroModel.voiceScanRate,
        voiceReverse: [state.granularV1Reverse, state.granularV2Reverse, state.granularV3Reverse, state.granularV4Reverse],
        voicePitch: macroModel.voicePitch,
        voiceAttack: macroModel.voiceAttack,
        voiceDecay: macroModel.voiceDecay,
        voiceBlur: macroModel.voiceBlur,
        voiceGrainOct: macroModel.voiceGrainOct,
        voiceSpray: macroModel.voiceSpray,
        voiceDensity: macroModel.voiceDensity,
        voiceGrainSize: macroModel.voiceGrainSize,
        voicePan: [shv('granularV1Pan', state.granularV1Pan), shv('granularV2Pan', state.granularV2Pan), shv('granularV3Pan', state.granularV3Pan), shv('granularV4Pan', state.granularV4Pan)],
        voiceGain: [shv('granularV1Gain', state.granularV1Gain), shv('granularV2Gain', state.granularV2Gain), shv('granularV3Gain', state.granularV3Gain), shv('granularV4Gain', state.granularV4Gain)],
        voicePosLFORate: macroModel.voicePosLFORate,
        voicePosLFODepth: macroModel.voicePosLFODepth,
        voicePanLFORate: macroModel.voicePanLFORate,
        voiceStereoSpread: [shv('granularV1StereoSpread', state.granularV1StereoSpread), shv('granularV2StereoSpread', state.granularV2StereoSpread), shv('granularV3StereoSpread', state.granularV3StereoSpread), shv('granularV4StereoSpread', state.granularV4StereoSpread)],
        voiceReverseLFORate: macroModel.voiceReverseLFORate,
        voiceWriteFollow: [shv('granularV1WriteFollow', state.granularV1WriteFollow), shv('granularV2WriteFollow', state.granularV2WriteFollow), shv('granularV3WriteFollow', state.granularV3WriteFollow), shv('granularV4WriteFollow', state.granularV4WriteFollow)],
        voiceRecordLFORate: [shv('granularV1RecordLFORate', state.granularV1RecordLFORate), shv('granularV2RecordLFORate', state.granularV2RecordLFORate), shv('granularV3RecordLFORate', state.granularV3RecordLFORate), shv('granularV4RecordLFORate', state.granularV4RecordLFORate)],
        voicePositionSpray: macroModel.voicePositionSpray,
        voiceTimingSpray: macroModel.voiceTimingSpray,
        voiceLookback: [shv('granularV1Lookback', state.granularV1Lookback), shv('granularV2Lookback', state.granularV2Lookback), shv('granularV3Lookback', state.granularV3Lookback), shv('granularV4Lookback', state.granularV4Lookback)],
        voiceWriteGuard: [shv('granularV1WriteGuard', state.granularV1WriteGuard), shv('granularV2WriteGuard', state.granularV2WriteGuard), shv('granularV3WriteGuard', state.granularV3WriteGuard), shv('granularV4WriteGuard', state.granularV4WriteGuard)],
        voicePitchMode: [state.granularV1PitchMode, state.granularV2PitchMode, state.granularV3PitchMode, state.granularV4PitchMode],
        voicePitchSpread: [shv('granularV1PitchSpread', state.granularV1PitchSpread), shv('granularV2PitchSpread', state.granularV2PitchSpread), shv('granularV3PitchSpread', state.granularV3PitchSpread), shv('granularV4PitchSpread', state.granularV4PitchSpread)],
        voicePitchJitter: macroModel.voicePitchJitter,
        voicePitchQuantize: [shv('granularV1PitchQuantize', state.granularV1PitchQuantize), shv('granularV2PitchQuantize', state.granularV2PitchQuantize), shv('granularV3PitchQuantize', state.granularV3PitchQuantize), shv('granularV4PitchQuantize', state.granularV4PitchQuantize)],
        voiceReverseChance: [shv('granularV1ReverseChance', state.granularV1ReverseChance), shv('granularV2ReverseChance', state.granularV2ReverseChance), shv('granularV3ReverseChance', state.granularV3ReverseChance), shv('granularV4ReverseChance', state.granularV4ReverseChance)],
        voiceBloom: macroModel.voiceBloom,
        voiceGlide: [shv('granularV1Glide', state.granularV1Glide), shv('granularV2Glide', state.granularV2Glide), shv('granularV3Glide', state.granularV3Glide), shv('granularV4Glide', state.granularV4Glide)],
        voiceCloudStyle: [state.granularV1CloudStyle, state.granularV2CloudStyle, state.granularV3CloudStyle, state.granularV4CloudStyle],
        voiceAnchorPattern: [state.granularV1AnchorPattern, state.granularV2AnchorPattern, state.granularV3AnchorPattern, state.granularV4AnchorPattern],
        voiceLoopCrossfade: [shv('granularV1LoopCrossfade', state.granularV1LoopCrossfade), shv('granularV2LoopCrossfade', state.granularV2LoopCrossfade), shv('granularV3LoopCrossfade', state.granularV3LoopCrossfade), shv('granularV4LoopCrossfade', state.granularV4LoopCrossfade)],
        tempoGated: [
          this.isGranularTempoSyncVoiceActive(state, 0),
          this.isGranularTempoSyncVoiceActive(state, 1),
          this.isGranularTempoSyncVoiceActive(state, 2),
          this.isGranularTempoSyncVoiceActive(state, 3),
        ],
      };
      const granularHarmonyParams: GranularWorkletHarmonyParams = {
        scaleIntervals: this.harmonyState?.scaleFamily?.intervals ? [...this.harmonyState.scaleFamily.intervals] : [],
        chordPitches: this.harmonyState?.currentChord?.midiNotes
          ? this.harmonyState.currentChord.midiNotes.map(n => n % 12)
          : [],
        chordBias: shv('granularChordBias', state.granularChordBias ?? 0),
      };
      const granularLegacyParams: GranularWorkletLegacyParams = {
        legacyJitter: shv('granularLegacyJitter', state.granularLegacyJitter),
        legacyProbability: shv('granularLegacyProbability', state.granularLegacyProbability),
        legacyPitchMode: state.granularLegacyPitchMode,
        legacyPitchSpread: shv('granularLegacyPitchSpread', state.granularLegacyPitchSpread),
        legacyMaxGrains: shv('granularLegacyMaxGrains', state.granularLegacyMaxGrains),
        legacyFeedback: shv('granularLegacyFeedback', state.granularLegacyFeedback),
      };
      this.queueGranularWorkletUpdate({
        global: granularGlobalParams,
        space: granularSpaceParams,
        voices: granularVoiceParams,
        harmony: granularHarmonyParams,
        legacy: granularLegacyParams,
      });

      // The old granular-local multitap nodes are left disconnected while the shared Delay B
      // takes over, so keep their gains pinned to zero in case a fallback path instantiated them.
      this.granularDelaySendGain?.gain.setTargetAtTime(0, now, smoothTime);
      this.granularDelayDirectGain?.gain.setTargetAtTime(0, now, smoothTime);
      this.granularDelayReverbSendGain?.gain.setTargetAtTime(0, now, smoothTime);
      this.granularDelayFeedbackGain?.gain.setTargetAtTime(0, now, smoothTime);
    }

    // Synth levels (independent: direct level and per-pad reverb sends)
    // Per-voice mixerGain controls pad 1 vs pad 2 level
    // synthDirect acts as pad-active mute gate
    // Pad reverb sends are additive, not crossfaded.
    // When reverbEnabled is false, mute reverb sends to save CPU
    const padActive = pad1Active || pad2Active;
    // When spectral freeze is active, attenuate the dry direct path so the
    // frozen pad isn't masked by the live pad signal modulating through.
    // Reverb Crossfade=1 → fully frozen → mute dry, Crossfade=0 → full dry.
    const sfEnabled = state.spectralFreezeEnabled ?? false;
    const sfActive = state.spectralFreezeActive ?? false;
    const sfCrossfade = state.spectralFreezeReverbCrossfade ?? 1.0;
    const dryGain = (sfEnabled && sfActive) ? (1.0 - sfCrossfade) : 1.0;
    this.setVoiceSpatialChainState(this.pad1SpatialChain, {
      active: pad1Active,
      postLpf: pad1PostLpf,
      stereoWidth: pad1StereoWidth,
      diffuseSend: pad1DiffuseSend,
      now,
      smoothTime,
    });
    this.setVoiceSpatialChainState(this.pad2SpatialChain, {
      active: pad2Active,
      postLpf: pad2PostLpf,
      stereoWidth: pad2StereoWidth,
      diffuseSend: pad2DiffuseSend,
      now,
      smoothTime,
    });
    this.setVoiceSpatialChainState(this.lead1SpatialChain, {
      active: lead1WetActive,
      postLpf: lead1PostLpf,
      stereoWidth: lead1StereoWidth,
      diffuseSend: lead1DiffuseSend,
      now,
      smoothTime,
    });
    this.setVoiceSpatialChainState(this.lead2SpatialChain, {
      active: lead2WetActive,
      postLpf: lead2PostLpf,
      stereoWidth: lead2StereoWidth,
      diffuseSend: lead2DiffuseSend,
      now,
      smoothTime,
    });
    this.setVoiceSpatialChainState(this.pianoSpatialChain, {
      active: pianoWetActive,
      postLpf: pianoPostLpf,
      stereoWidth: pianoStereoWidth,
      diffuseSend: pianoDiffuseSend,
      now,
      smoothTime,
    });
    this.synthDirect?.gain.setTargetAtTime(padActive ? dryGain : 0, now, smoothTime);
    this.pad1ReverbSend?.gain.setTargetAtTime((pad1Active && state.reverbEnabled) ? pad1ReverbLevel : 0, now, smoothTime);
    this.pad2ReverbSend?.gain.setTargetAtTime((pad2Active && state.reverbEnabled) ? pad2ReverbLevel : 0, now, smoothTime);
    this.pad1DelayASend?.gain.setTargetAtTime(pad1Active ? shv('pad1DelayASend', padState.pad1DelayASend ?? 0) : 0, now, smoothTime);
    this.pad1DelayBSend?.gain.setTargetAtTime(pad1Active ? shv('pad1DelayBSend', padState.pad1DelayBSend ?? 0) : 0, now, smoothTime);
    this.pad2DelayASend?.gain.setTargetAtTime(pad2Active ? shv('pad2DelayASend', padState.pad2DelayASend ?? 0) : 0, now, smoothTime);
    this.pad2DelayBSend?.gain.setTargetAtTime(pad2Active ? shv('pad2DelayBSend', padState.pad2DelayBSend ?? 0) : 0, now, smoothTime);

    const lead1Fader = lead1WetActive ? lead1Lvl : 0;
    const lead2Fader = lead2WetActive ? lead2Lvl : 0;
    const pianoFader = pianoWetActive ? pianoLvl * ENGINE_TRIMS.piano : 0;
    this.lead1ReverbSend?.gain.setTargetAtTime((state.reverbEnabled && lead1WetActive) ? lead1ReverbLevel : 0, now, smoothTime);
    this.lead2ReverbSend?.gain.setTargetAtTime((state.reverbEnabled && lead2WetActive) ? lead2ReverbLevel : 0, now, smoothTime);
    this.pianoReverbSend?.gain.setTargetAtTime((state.reverbEnabled && pianoWetActive) ? pianoReverbLevel : 0, now, smoothTime);

    const sharedDelayAState = this.getSharedDelayAState(state, lead1WetActive, lead2WetActive, pianoWetActive, granularBusArmed, delayBEnabled);
    this.sharedDelayA?.update(sharedDelayAState, now, smoothTime);
    this.lead1DelayASend?.gain.setTargetAtTime(
      lead1WetActive ? shv('lead1DelayASend', state.lead1DelayASend ?? 0) : 0,
      now,
      smoothTime,
    );
    this.lead2DelayASend?.gain.setTargetAtTime(
      lead2WetActive ? shv('lead2DelayASend', state.lead2DelayASend ?? 0) : 0,
      now,
      smoothTime,
    );
    this.pianoDelayASend?.gain.setTargetAtTime(pianoWetActive ? shv('pianoDelayASend', state.pianoDelayASend ?? 0) : 0, now, smoothTime);
    this.lead1DelayBSend?.gain.setTargetAtTime(lead1WetActive ? shv('lead1DelayBSend', state.lead1DelayBSend ?? 0) : 0, now, smoothTime);
    this.lead2DelayBSend?.gain.setTargetAtTime(lead2WetActive ? shv('lead2DelayBSend', state.lead2DelayBSend ?? 0) : 0, now, smoothTime);
    this.pianoDelayBSend?.gain.setTargetAtTime(pianoWetActive ? shv('pianoDelayBSend', state.pianoDelayBSend ?? 0) : 0, now, smoothTime);
    const drumDelaySend = state.drumEnabled
      ? this.getDrumDelaySendProfile(state) * (state.drumDelayASend ?? 1)
      : 0;
    this.drumDelayASend?.gain.setTargetAtTime(drumDelaySend, now, smoothTime);
    this.drumDelayBSend?.gain.setTargetAtTime(state.drumEnabled ? (state.drumDelayBSend ?? 0) : 0, now, smoothTime);
    this.granularDelayASend?.gain.setTargetAtTime(granularBusArmed ? (state.granularDelayASend ?? 0) : 0, now, smoothTime);
    this.oceanDelayASend?.gain.setTargetAtTime(oceanLayerActive ? (state.oceanDelayASend ?? 0) : 0, now, smoothTime);
    this.oceanDelayBSend?.gain.setTargetAtTime(oceanLayerActive ? (state.oceanDelayBSend ?? 0) : 0, now, smoothTime);
    this.waterDelayASend?.gain.setTargetAtTime(
      waterLayerActive ? this.scaleEarthSend(state.waterDelayASend ?? 0, this.getWaterFamilySendScale(state)) : 0,
      now,
      smoothTime,
    );
    this.waterDelayBSend?.gain.setTargetAtTime(
      waterLayerActive ? this.scaleEarthSend(state.waterDelayBSend ?? 0, this.getWaterFamilySendScale(state)) : 0,
      now,
      smoothTime,
    );
    const insectsDelaySendActive = insectsLayerActive;
    this.insectsDelayASend?.gain.setTargetAtTime(
      insectsDelaySendActive ? this.scaleEarthSend(state.insDelayASend ?? 0, this.getInsectsSharedMasterScale(state)) : 0,
      now,
      smoothTime,
    );
    this.insectsDelayBSend?.gain.setTargetAtTime(
      insectsDelaySendActive ? this.scaleEarthSend(state.insDelayBSend ?? 0, this.getInsectsSharedMasterScale(state)) : 0,
      now,
      smoothTime,
    );

    // Per-lead dry-path level only. FX sends stay independent so lead can be fully wet at dry level 0.
    this.lead1LevelGain?.gain.setTargetAtTime(lead1Fader, now, smoothTime);
    // WASM lead per-lead dry-path levels (separate outputs, no longer needs max)
    this.leadWasmLevelGain?.gain.setTargetAtTime(lead1Fader, now, smoothTime);
    this.leadWasmLead2LevelGain?.gain.setTargetAtTime(lead2Fader, now, smoothTime);
    this.lead2LevelGain?.gain.setTargetAtTime(lead2Fader, now, smoothTime);
    this.pianoLevelGain?.gain.setTargetAtTime(pianoFader, now, smoothTime);

    // Forward lead FM delay params to WASM worklet (if active)
    this.sendLeadFmWasmDelay(state);

    // Reverb parameters (only update if enabled to save CPU)
    // Guard: reverbNode may be a dummy GainNode (no .port) when Euclidean runs standalone
    const reverbHasFeed = state.reverbEnabled && this.hasAnyReverbFeed(
      state,
      pad1Active,
      pad2Active,
      lead1WetActive,
      lead2WetActive,
      pianoWetActive,
      granularBusArmed,
      sharedDelayAState.enabled,
      delayBEnabled,
    );
    // Keep the shared reverb return audible while the engine is enabled so
    // long tails can decay naturally even after source sends fall to zero.
    const reverbReturnEnabled = !!state.reverbEnabled || !!state.spectralFreezeEnabled || reverbHasFeed;
    if (this.reverbNode && (this.reverbNode as any).port && reverbReturnEnabled) {
      // Per-engine tension → subtle additive offsets on decay/diffusion/shimmer
      const reverbT = getEffectiveTension(
        state.tension ?? 0.3,
        state.reverbTensionMode ?? 'bypass',
        state.reverbTensionValue ?? 0,
      );
      let effectiveDecay = shv('reverbDecay', state.reverbDecay ?? 0.5);
      let effectiveDiffusion = shv('reverbDiffusion', state.reverbDiffusion ?? 0.5);
      let effectiveShimmer = shv('reverbShimmer', state.reverbShimmer ?? 0);
      if (reverbT >= 0) {
        const tInvRev = 1 - reverbT;
        effectiveDecay    = Math.min(1, effectiveDecay + tInvRev * 0.15);
        effectiveDiffusion = Math.min(1, effectiveDiffusion + tInvRev * 0.1);
        effectiveShimmer  = Math.min(1, effectiveShimmer + reverbT * 0.08);
      }

      const parityReverbBoost = (key: string): number | null => {
        const raw = (state as unknown as Record<string, unknown>)[key];
        return typeof raw === 'number' && Number.isFinite(raw)
          ? Math.max(0, Math.min(1, raw))
          : null;
      };
      // ── Reverb Harmony Coupling ──
      // Chord wash — boost shimmer on chord change, then decay
      const parityWashBoost = parityReverbBoost('sonicParityReverbWashBoost');
      const washBoost = parityWashBoost ?? this.reverbWashBoost;
      if (washBoost > 0.001) {
        effectiveShimmer = Math.min(1, effectiveShimmer + washBoost * 0.15);
        if (parityWashBoost === null) {
          this.reverbWashBoost *= 0.92; // ~180ms decay at 60fps
        }
      }
      // Resolution bloom — boost decay+shimmer on tension resolution
      const parityBloomBoost = parityReverbBoost('sonicParityReverbBloomBoost');
      const bloomBoost = parityBloomBoost ?? this.reverbBloomBoost;
      if (bloomBoost > 0.001) {
        effectiveDecay = Math.min(1, effectiveDecay + bloomBoost * 0.12);
        effectiveShimmer = Math.min(1, effectiveShimmer + bloomBoost * 0.1);
        if (parityBloomBoost === null) {
          this.reverbBloomBoost *= 0.95; // ~300ms decay
        }
      }

      // Scale-aware shimmer pitch — quantize to nearest scale interval
      let shimmerPitch = shv('reverbShimmerPitch', state.reverbShimmerPitch ?? 12);
      if (state.reverbScaleShimmer && this.harmonyState?.scaleFamily?.intervals) {
        const si = this.harmonyState.scaleFamily.intervals;
        const octaves = Math.floor(shimmerPitch / 12);
        const rem = ((shimmerPitch % 12) + 12) % 12;
        let bestInterval = 0;
        let bestDist = 99;
        for (const interval of si) {
          const d = Math.abs(interval - rem);
          const dist = Math.min(d, 12 - d);
          if (dist < bestDist) { bestDist = dist; bestInterval = interval; }
        }
        shimmerPitch = octaves * 12 + bestInterval;
      }

      const reverbParams: Record<string, unknown> = {
          type: state.reverbType,
          quality: this.isMobile ? 'balanced' : state.reverbQuality,
          decay: effectiveDecay,
          size: shv('reverbSize', state.reverbSize),
          diffusion: effectiveDiffusion,
          modulation: shv('reverbModulation', state.reverbModulation),
          predelay: shv('predelay', state.predelay),
          damping: shv('damping', state.damping),
          width: shv('width', state.width),
          shimmer: effectiveShimmer,
          shimmerPitch: shimmerPitch,
          slowModRate: shv('reverbSlowModRate', state.reverbSlowModRate ?? 0.05),
          slowModDepth: shv('reverbSlowModDepth', state.reverbSlowModDepth ?? 0),
          reverse: shv('reverbReverse', state.reverbReverse ?? 0),
          reverseLength: shv('reverbReverseLength', state.reverbReverseLength ?? 2),
          chorusRate: shv('reverbChorusRate', state.reverbChorusRate ?? 0.5),
          chorusDepth: shv('reverbChorusDepth', state.reverbChorusDepth ?? 12),
          modCharacter: state.reverbModCharacter ?? 'hybrid',
          dampLow: shv('reverbDampLow', state.reverbDampLow ?? 0.1),
          dampHigh: shv('reverbDampHigh', state.reverbDampHigh ?? 0.3),
          crossoverFreq: shv('reverbCrossoverFreq', state.reverbCrossoverFreq ?? 800),
          inputTone: shv('reverbInputTone', state.reverbInputTone ?? 0),
          shimmerFeedback: shv('reverbShimmerFeedback', state.reverbShimmerFeedback ?? 0),
          bloom: shv('reverbBloom', state.reverbBloom ?? 0),
          warp: shv('reverbWarp', state.reverbWarp ?? 0),
          crossFeed: shv('reverbCrossFeed', state.reverbCrossFeed ?? 0),
          earlyReflections: shv('reverbEarlyReflections', state.reverbEarlyReflections ?? 0.3),
          airAbsorption: shv('reverbAirAbsorption', state.reverbAirAbsorption ?? 0.2),
          saturationMode: state.reverbSaturationMode === 'tape' ? 1 : state.reverbSaturationMode === 'tube' ? 2 : 0,
          transientSmooth: shv('reverbTransientSmooth', state.reverbTransientSmooth ?? 0),
          erLpFreq: shv('reverbErLpFreq', state.reverbErLpFreq ?? 2500),
      };
      // Dirty-gate: skip postMessage if all params are unchanged from last frame
      let reverbDirty = !this._prevReverbParams;
      if (!reverbDirty) {
        for (const k in reverbParams) {
          if (reverbParams[k] !== this._prevReverbParams![k]) { reverbDirty = true; break; }
        }
      }
      if (reverbDirty) {
        this._prevReverbParams = reverbParams;
        (this.reverbNode as any).port.postMessage({ type: 'params', params: reverbParams });
      }
    }

    // Reverb output level (mute if disabled)
    this.reverbOutputGain?.gain.setTargetAtTime(reverbReturnEnabled ? shv('reverbLevel', state.reverbLevel) * ENGINE_TRIMS.reverb : 0, now, smoothTime);

    const reverbPreCompThreshold = shv('reverbPreCompThreshold', state.reverbPreCompThreshold ?? DEFAULT_REVERB_PRE_COMP.threshold);
    const reverbPreCompKnee = shv('reverbPreCompKnee', state.reverbPreCompKnee ?? DEFAULT_REVERB_PRE_COMP.knee);
    const reverbPreCompRatio = shv('reverbPreCompRatio', state.reverbPreCompRatio ?? DEFAULT_REVERB_PRE_COMP.ratio);
    const reverbPreCompAttack = Math.max(0, Math.min(1, shv('reverbPreCompAttackMs', state.reverbPreCompAttackMs ?? DEFAULT_REVERB_PRE_COMP.attackMs) / 1000));
    const reverbPreCompRelease = Math.max(0, Math.min(1, shv('reverbPreCompReleaseMs', state.reverbPreCompReleaseMs ?? DEFAULT_REVERB_PRE_COMP.releaseMs) / 1000));
    const reverbPreCompMakeup = shv('reverbPreCompMakeup', state.reverbPreCompMakeup ?? DEFAULT_REVERB_PRE_COMP.makeup);
    if (this.reverbPreConditionerNode) {
      this.reverbPreConditionerNode.port.postMessage({
        type: 'params',
        thresholdDb: reverbPreCompThreshold,
        kneeDb: reverbPreCompKnee,
        ratio: reverbPreCompRatio,
        attackMs: reverbPreCompAttack * 1000,
        releaseMs: reverbPreCompRelease * 1000,
        inputMakeupGain: reverbPreCompMakeup,
      });
    } else {
      this.reverbPreCompressor?.threshold.setTargetAtTime(reverbPreCompThreshold, now, 0.05);
      this.reverbPreCompressor?.knee.setTargetAtTime(reverbPreCompKnee, now, 0.05);
      this.reverbPreCompressor?.ratio.setTargetAtTime(reverbPreCompRatio, now, 0.05);
      this.reverbPreCompressor?.attack.setTargetAtTime(reverbPreCompAttack, now, 0.05);
      this.reverbPreCompressor?.release.setTargetAtTime(reverbPreCompRelease, now, 0.05);
      this.reverbPreMakeupGain?.gain.setTargetAtTime(reverbPreCompMakeup, now, 0.08);
    }

    // Spectral Freeze parameters
    if (this.spectralFreezeNode && (this.spectralFreezeNode as any).port) {
      const sfFreeze = state.spectralFreezeActive ?? false;
      const sfSlushy = state.spectralFreezeSlushy ?? false;
      const sfSpeed = state.spectralFreezeSpeed ?? 0.3;
      const sfMix = state.spectralFreezeMix ?? 1.0;
      const sfDecay = 1.0 - (state.spectralFreezeDecay ?? 1.0);
      const sfPhaseJitter = state.spectralFreezePhaseJitter ?? 0.0;

      // Dirty-gate: skip postMessage if all 6 params unchanged
      if (!this._sfParamsInitialized ||
          sfFreeze !== this._prevSfFreeze || sfSlushy !== this._prevSfSlushy ||
          sfSpeed !== this._prevSfSpeed || sfMix !== this._prevSfMix ||
          sfDecay !== this._prevSfDecay || sfPhaseJitter !== this._prevSfPhaseJitter) {
        this._sfParamsInitialized = true;
        this._prevSfFreeze = sfFreeze;
        this._prevSfSlushy = sfSlushy;
        this._prevSfSpeed = sfSpeed;
        this._prevSfMix = sfMix;
        this._prevSfDecay = sfDecay;
        this._prevSfPhaseJitter = sfPhaseJitter;
        (this.spectralFreezeNode as any).port.postMessage({
          type: 'params',
          params: { freeze: sfFreeze, slushy: sfSlushy, speed: sfSpeed, mix: sfMix, decay: sfDecay, phaseJitter: sfPhaseJitter },
        });
      }

      // Re-apply routing if mode changed or enabled state changed
      const routing = state.spectralFreezeRouting ?? 'pre';
      const enabled = state.spectralFreezeEnabled ?? false;
      if (routing !== this.currentSpectralFreezeRouting || enabled !== (this.currentSpectralFreezeRouting !== null)) {
        this.applySpectralFreezeRouting();
      }

      // Update crossfade in pre-mode (controls reverbDirectSend, not reverbInputBus)
      // crossfade=1 → gain=0 (no live bleed), crossfade=0 → gain=1 (full live)
      if (enabled && routing === 'pre' && this.reverbDirectSend) {
        const crossfade = state.spectralFreezeReverbCrossfade ?? 0.5;
        this.reverbDirectSend.gain.setTargetAtTime(1.0 - crossfade, now, smoothTime);
      }
    }

    // Lead synth parameters — leadDry gates active/inactive; per-lead level on lead1/2LevelGain + WASM per-lead gains
    // Keep gain active if Euclidean sequencer is driving lead
    const leadActive =
      this.isLead1RouteActive(state) ||
      this.isLead2RouteActive(state) ||
      this.usesRandomLeadPath(state);
    this.leadDry?.gain.setTargetAtTime(leadActive ? 1.0 : 0, now, smoothTime);

    // Lead random scheduling (phrase-based, independent of Euclidean)
    if (state.leadRandomEnabled && this.isLeadRandomSourceEnabled(state) && this.leadMelodyTimer === null && this.isRunning) {
      this.startLeadMelody((state.leadRandomSyncPolicy ?? 'nextPhrase') === 'nextPhrase');
    } else if ((!state.leadRandomEnabled || !this.isLeadRandomSourceEnabled(state)) && this.leadMelodyTimer !== null) {
      clearTimeout(this.leadMelodyTimer);
      this.leadMelodyTimer = null;
      for (const timeout of this.leadNoteTimeouts) clearTimeout(timeout);
      this.leadNoteTimeouts = [];
    }

    // Load/update lead presets when selections change
    if (state.lead1PresetA !== this.lead1PresetAId && state.lead1PresetA !== this.leadPresetPendingIds.A) {
      void this.loadLeadPreset('A', state.lead1PresetA);
    }
    if (state.lead1PresetB !== this.lead1PresetBId && state.lead1PresetB !== this.leadPresetPendingIds.B) {
      void this.loadLeadPreset('B', state.lead1PresetB);
    }
    if (state.lead2PresetC !== this.lead2PresetCId && state.lead2PresetC !== this.leadPresetPendingIds.C) {
      void this.loadLeadPreset('C', state.lead2PresetC);
    }
    if (state.lead2PresetD !== this.lead2PresetDId && state.lead2PresetD !== this.leadPresetPendingIds.D) {
      void this.loadLeadPreset('D', state.lead2PresetD);
    }

    // Ocean filter parameters
    if (this.oceanFilter) {
      this.oceanFilter.type = state.oceanFilterType;
      this.oceanFilter.frequency.setTargetAtTime(state.oceanFilterCutoff, now, smoothTime);
      // Q: 0.5 to 10.5 based on resonance 0-1
      this.oceanFilter.Q.setTargetAtTime(0.5 + state.oceanFilterResonance * 10, now, smoothTime);
    }

    // ── Soundscapes WASM — water + insects + fire ──
    if (this.soundscapesNode && this.soundscapesWasmReady) {
      this.syncEarthFadeState(this.waterFadeState, state.waterEnabled, now, {
        onInit: (target) => this.setAudioParamImmediate(this.waterGateGain?.gain, target, now),
        onTransition: (current, target, endTime) => this.rampAudioParam(this.waterGateGain?.gain, current, target, now, endTime),
        onFadeOutComplete: () => {
          if (this._scWaterStarted && this.soundscapesNode) {
            this.soundscapesNode.port.postMessage({ type: 'waterStop' });
            this._scWaterStarted = false;
          }
        },
      });
      const waterSignalActive = this.getWaterFamilySendScale(state) > 0.0001;
      const water = this.resolveWaterSoundscapeState(state);
      if (this.isSoundscapeParityFixture(state)) {
        const waterSeed = { seed: 12345 };
        this.postCachedWorkletMessage('soundscapes:waterSeed', this.soundscapesNode, {
          type: 'waterSeed',
          ...waterSeed,
        }, waterSeed);
      }

      // Water start/stop follows the shared water level so dry and wet scale together.
      const waterShouldRun = this.isRunning && this.isEarthFadeActive(this.waterFadeState, now) && waterSignalActive;
      if (waterShouldRun && !this._scWaterStarted) {
        this.soundscapesNode.port.postMessage({ type: 'waterStart' });
        this._scWaterStarted = true;
      } else if (!waterShouldRun && this._scWaterStarted) {
        this.soundscapesNode.port.postMessage({ type: 'waterStop' });
        this._scWaterStarted = false;
      }

      // Water preset (snap to nearest endpoint of morph)
      const waterPresetIdx = this.getWaterSoundscapePresetIndex(state);
      if (waterPresetIdx !== this._scWaterPreset) {
        this.soundscapesNode.port.postMessage({ type: 'waterPreset', preset: waterPresetIdx });
        this._scWaterPreset = waterPresetIdx;
      }

      // Water synthesis params with dualRange min/max support
      const wInt = this.dualRanges['waterIntensity'];
      const wDist = this.dualRanges['waterDistance'];
      const wHardBf = this.dualRanges['waterHardDropBaseFreq'] ?? this.dualRanges['waterBaseFreq'];
      const wWaterBf = this.dualRanges['waterWaterDropBaseFreq'] ?? this.dualRanges['waterBaseFreq'];
      const wDs = this.dualRanges['waterDropSize'];
      const wHd = this.dualRanges['waterHardness'];
      const wGt = this.dualRanges['waterGlassThickness'];
      const waterParams = {
        intensityMin: wInt ? wInt.min : water.waterIntensity,
        intensityMax: wInt ? wInt.max : water.waterIntensity,
        distanceMin: wDist ? wDist.min : water.waterDistance,
        distanceMax: wDist ? wDist.max : water.waterDistance,
        hardDropBaseFreqMin: wHardBf ? wHardBf.min : (water.waterHardDropBaseFreq ?? water.waterBaseFreq),
        hardDropBaseFreqMax: wHardBf ? wHardBf.max : (water.waterHardDropBaseFreq ?? water.waterBaseFreq),
        waterDropBaseFreqMin: wWaterBf ? wWaterBf.min : (water.waterWaterDropBaseFreq ?? water.waterBaseFreq),
        waterDropBaseFreqMax: wWaterBf ? wWaterBf.max : (water.waterWaterDropBaseFreq ?? water.waterBaseFreq),
        dropSizeMin: wDs ? wDs.min : water.waterDropSize,
        dropSizeMax: wDs ? wDs.max : water.waterDropSize,
        hardnessMin: wHd ? wHd.min : water.waterHardness,
        hardnessMax: wHd ? wHd.max : water.waterHardness,
        glassThicknessMin: wGt ? wGt.min : water.waterGlassThickness,
        glassThicknessMax: wGt ? wGt.max : water.waterGlassThickness,
      };
      this.postCachedWorkletMessage('soundscapes:waterParams', this.soundscapesNode, {
        type: 'waterParams',
        params: waterParams,
      }, waterParams);

      const waterLayerDetailParams = {
        hardRate: shv('waterHardDropRate', water.waterHardDropRate),
        hardTone: shv('waterHardDropLPF', water.waterHardDropLPF),
        hardCharacter: shv('waterHardDropTone', water.waterHardDropTone),
        waterRate: shv('waterWaterDropRate', water.waterWaterDropRate),
        waterTone: shv('waterWaterDropLPF', water.waterWaterDropLPF),
        bubbleRate: shv('waterBubblingRate', water.waterBubblingRate),
        bubbleTone: shv('waterBubblingLPF', water.waterBubblingLPF),
      };
      this.postCachedWorkletMessage('soundscapes:waterLayerDetailParams', this.soundscapesNode, {
        type: 'waterLayerDetailParams',
        ...waterLayerDetailParams,
      }, waterLayerDetailParams);

      // Water layer mix
      const waterLayerMix = {
        hardDrops: water.waterLayerHardDrops,
        waterDrops: water.waterLayerWaterDrops,
        turbulence: water.waterLayerTurbulence,
        bubbling: water.waterLayerBubbling,
        surf: water.waterLayerSurf,
        channels: water.waterLayerChannels,
      };
      this.postCachedWorkletMessage('soundscapes:waterLayerMix', this.soundscapesNode, {
        type: 'waterLayerMix',
        ...waterLayerMix,
      }, waterLayerMix);

      // Density is not user-facing yet. Keep legacy drop/turbulence density, but
      // run surf/channels at full density so wave-oriented presets have full body.
      const waterLayerDensity = {
        hardDrops: 0.5,
        waterDrops: 0.5,
        turbulence: 0.5,
        bubbling: 0.5,
        surf: 1.0,
        channels: 1.0,
      };
      this.postCachedWorkletMessage('soundscapes:waterLayerDensity', this.soundscapesNode, {
        type: 'waterLayerDensity',
        ...waterLayerDensity,
      }, waterLayerDensity);

      // Surf params (wave-envelope driven 3-band noise)
      const sDur = this.dualRanges['waterSurfDuration'];
      const sInt = this.dualRanges['waterSurfInterval'];
      const sFoam = this.dualRanges['waterSurfFoam'];
      const sProx = this.dualRanges['waterSurfProximity'];
      const sDep = this.dualRanges['waterSurfDepth'];
      const sBody = this.dualRanges['waterSurfBody'];
      const sSpray = this.dualRanges['waterSurfSpray'];
      const sFoamBright = this.dualRanges['waterSurfFoamBright'];
      const surfParams = {
        durationMin: sDur ? sDur.min : water.waterSurfDuration,
        durationMax: sDur ? sDur.max : water.waterSurfDuration,
        intervalMin: sInt ? sInt.min : water.waterSurfInterval,
        intervalMax: sInt ? sInt.max : water.waterSurfInterval,
        foamMin: sFoam ? sFoam.min : water.waterSurfFoam,
        foamMax: sFoam ? sFoam.max : water.waterSurfFoam,
        proximityMin: sProx ? sProx.min : water.waterSurfProximity,
        proximityMax: sProx ? sProx.max : water.waterSurfProximity,
        depthMin: sDep ? sDep.min : water.waterSurfDepth,
        depthMax: sDep ? sDep.max : water.waterSurfDepth,
        bodyFreqMin: sBody ? sBody.min : water.waterSurfBody,
        bodyFreqMax: sBody ? sBody.max : water.waterSurfBody,
        sprayFreqMin: sSpray ? sSpray.min : water.waterSurfSpray,
        sprayFreqMax: sSpray ? sSpray.max : water.waterSurfSpray,
        foamBrightMin: sFoamBright ? sFoamBright.min : water.waterSurfFoamBright,
        foamBrightMax: sFoamBright ? sFoamBright.max : water.waterSurfFoamBright,
      };
      this.postCachedWorkletMessage('soundscapes:waterSurfParams', this.soundscapesNode, {
        type: 'waterSurfParams',
        ...surfParams,
      }, surfParams);

      // Channels params (stream↔wind morph)
      const cMorph = this.dualRanges['waterChannelsMorph'];
      const cSpeed = this.dualRanges['waterChannelsSpeed'];
      const channelsParams = {
        morph: cMorph ? (cMorph.min + cMorph.max) * 0.5 : water.waterChannelsMorph,
        speed: cSpeed ? (cSpeed.min + cSpeed.max) * 0.5 : water.waterChannelsSpeed,
      };
      this.postCachedWorkletMessage('soundscapes:waterChannelsParams', this.soundscapesNode, {
        type: 'waterChannelsParams',
        ...channelsParams,
      }, channelsParams);

      const densityLoopParams = {
        hardSend: shv('waterDensityHardSend', water.waterDensityHardSend),
        waterSend: shv('waterDensityWaterSend', water.waterDensityWaterSend),
        bubbleSend: shv('waterDensityBubbleSend', water.waterDensityBubbleSend),
        feedback: shv('waterDensityFeedback', water.waterDensityFeedback),
        tone: shv('waterDensityTone', water.waterDensityTone),
        ring: shv('waterDensityRing', water.waterDensityRing),
        wet: shv('waterDensityWet', water.waterDensityWet),
      };
      this.postCachedWorkletMessage('soundscapes:waterDensityLoopParams', this.soundscapesNode, {
        type: 'waterDensityLoopParams',
        ...densityLoopParams,
      }, densityLoopParams);

      // Insects dry and wet both follow the per-layer level plus the shared insects master.
      const insectsSharedMasterScale = this.getInsectsSharedMasterScale(state);
      const insects1EffectiveLevel = this.getEarthLayerOutputScale(state.insectsLevel, insectsSharedMasterScale);
      const insects2EffectiveLevel = this.getEarthLayerOutputScale(state.insects2Level, insectsSharedMasterScale);
      if (this.isSoundscapeParityFixture(state)) {
        const insectsSeed = { seed: 12345 };
        const insects2Seed = { seed: 67890 };
        this.postCachedWorkletMessage('soundscapes:insectsSeed', this.soundscapesNode, {
          type: 'insectsSeed',
          ...insectsSeed,
        }, insectsSeed);
        this.postCachedWorkletMessage('soundscapes:insects2Seed', this.soundscapesNode, {
          type: 'insects2Seed',
          ...insects2Seed,
        }, insects2Seed);
      }
      this.syncEarthFadeState(this.insects1FadeState, state.insectsEnabled, now, {
        onInit: (target) => {
          this.soundscapesNode?.port.postMessage({ type: 'insectsGate', enabled: target > 0.5, fadeSeconds: 0 });
        },
        onTransition: (_current, target) => {
          this.soundscapesNode?.port.postMessage({
            type: 'insectsGate',
            enabled: target > 0.5,
            fadeSeconds: EARTH_LAYER_FADE_SECONDS,
          });
        },
        onFadeOutComplete: () => {
          if (this._scInsects1Started && this.soundscapesNode) {
            this.soundscapesNode.port.postMessage({ type: 'insectsStop' });
            this._scInsects1Started = false;
          }
        },
      });
      const insects1ShouldRun = this.isRunning && this.isEarthFadeActive(this.insects1FadeState, now) && insects1EffectiveLevel > 0.0001;
      if (insects1ShouldRun && !this._scInsects1Started) {
        this.soundscapesNode.port.postMessage({ type: 'insectsStart' });
        this._scInsects1Started = true;
      } else if (!insects1ShouldRun && this._scInsects1Started) {
        this.soundscapesNode.port.postMessage({ type: 'insectsStop' });
        this._scInsects1Started = false;
      }

      // Insects 1 engine type
      if (state.insectsEngine !== this._scInsects1Engine) {
        this.soundscapesNode.port.postMessage({ type: 'insectsEngine', engine: state.insectsEngine });
        this._scInsects1Engine = state.insectsEngine;
      }

      const iDen = this.dualRanges['insectsDensity'];
      const iTemp = this.dualRanges['insectsTemperature'];
      const iDist = this.dualRanges['insectsDistance'];
      const iProx = this.dualRanges['insectsProximity'];
      const iAnti = this.dualRanges['insectsAntiphony'];
      const iCr = this.dualRanges['insectsClickRate'];
      const iMot = this.dualRanges['insectsMotion'];
      const insectsParams = {
        densityMin: iDen ? iDen.min : state.insectsDensity,
        densityMax: iDen ? iDen.max : state.insectsDensity,
        temperatureMin: iTemp ? iTemp.min : state.insectsTemperature,
        temperatureMax: iTemp ? iTemp.max : state.insectsTemperature,
        distanceMin: iDist ? iDist.min : state.insectsDistance,
        distanceMax: iDist ? iDist.max : state.insectsDistance,
        proximityMin: iProx ? iProx.min : state.insectsProximity,
        proximityMax: iProx ? iProx.max : state.insectsProximity,
        antiphonyMin: iAnti ? iAnti.min : state.insectsAntiphony,
        antiphonyMax: iAnti ? iAnti.max : state.insectsAntiphony,
        clickRateMin: iCr ? iCr.min : state.insectsClickRate,
        clickRateMax: iCr ? iCr.max : state.insectsClickRate,
        motionMin: iMot ? iMot.min : state.insectsMotion,
        motionMax: iMot ? iMot.max : state.insectsMotion,
      };
      this.postCachedWorkletMessage('soundscapes:insects1Params', this.soundscapesNode, {
        type: 'insectsParams',
        params: insectsParams,
      }, insectsParams);
      this.postCachedWorkletMessage('soundscapes:insects1Gain', this.soundscapesNode, {
        type: 'insectsGain',
        gain: state.insectsLevel,
      }, state.insectsLevel);

      // Insects 2 start/stop
      this.syncEarthFadeState(this.insects2FadeState, state.insects2Enabled, now, {
        onInit: (target) => {
          this.soundscapesNode?.port.postMessage({ type: 'insects2Gate', enabled: target > 0.5, fadeSeconds: 0 });
        },
        onTransition: (_current, target) => {
          this.soundscapesNode?.port.postMessage({
            type: 'insects2Gate',
            enabled: target > 0.5,
            fadeSeconds: EARTH_LAYER_FADE_SECONDS,
          });
        },
        onFadeOutComplete: () => {
          if (this._scInsects2Started && this.soundscapesNode) {
            this.soundscapesNode.port.postMessage({ type: 'insects2Stop' });
            this._scInsects2Started = false;
          }
        },
      });
      const insects2ShouldRun = this.isRunning && this.isEarthFadeActive(this.insects2FadeState, now) && insects2EffectiveLevel > 0.0001;
      if (insects2ShouldRun && !this._scInsects2Started) {
        this.soundscapesNode.port.postMessage({ type: 'insects2Start' });
        this._scInsects2Started = true;
      } else if (!insects2ShouldRun && this._scInsects2Started) {
        this.soundscapesNode.port.postMessage({ type: 'insects2Stop' });
        this._scInsects2Started = false;
      }

      // Insects 2 engine type
      if (state.insects2Engine !== this._scInsects2Engine) {
        this.soundscapesNode.port.postMessage({ type: 'insects2Engine', engine: state.insects2Engine });
        this._scInsects2Engine = state.insects2Engine;
      }

      const i2Den = this.dualRanges['insects2Density'];
      const i2Temp = this.dualRanges['insects2Temperature'];
      const i2Dist = this.dualRanges['insects2Distance'];
      const i2Prox = this.dualRanges['insects2Proximity'];
      const i2Anti = this.dualRanges['insects2Antiphony'];
      const i2Cr = this.dualRanges['insects2ClickRate'];
      const i2Mot = this.dualRanges['insects2Motion'];
      const insects2Params = {
        densityMin: i2Den ? i2Den.min : state.insects2Density,
        densityMax: i2Den ? i2Den.max : state.insects2Density,
        temperatureMin: i2Temp ? i2Temp.min : state.insects2Temperature,
        temperatureMax: i2Temp ? i2Temp.max : state.insects2Temperature,
        distanceMin: i2Dist ? i2Dist.min : state.insects2Distance,
        distanceMax: i2Dist ? i2Dist.max : state.insects2Distance,
        proximityMin: i2Prox ? i2Prox.min : state.insects2Proximity,
        proximityMax: i2Prox ? i2Prox.max : state.insects2Proximity,
        antiphonyMin: i2Anti ? i2Anti.min : state.insects2Antiphony,
        antiphonyMax: i2Anti ? i2Anti.max : state.insects2Antiphony,
        clickRateMin: i2Cr ? i2Cr.min : state.insects2ClickRate,
        clickRateMax: i2Cr ? i2Cr.max : state.insects2ClickRate,
        motionMin: i2Mot ? i2Mot.min : state.insects2Motion,
        motionMax: i2Mot ? i2Mot.max : state.insects2Motion,
      };
      this.postCachedWorkletMessage('soundscapes:insects2Params', this.soundscapesNode, {
        type: 'insects2Params',
        params: insects2Params,
      }, insects2Params);
      this.postCachedWorkletMessage('soundscapes:insects2Gain', this.soundscapesNode, {
        type: 'insects2Gain',
        gain: state.insects2Level,
      }, state.insects2Level);

    }

    // ── Earth master + texture engines ──
    // Keep these updates outside the soundscapes guard so ocean/nature work
    // even when the water/insects WASM engine is not loaded.
    this.earthLevelGain?.gain.setTargetAtTime(state.earthLevel ?? 1.0, now, smoothTime);

    // Water dry/wet levels stay at their live targets; the dedicated fade gate
    // handles the layer on/off motion.
    this.waterLevelGain?.gain.setTargetAtTime(this.getWaterFamilySendScale(state), now, smoothTime);
    this.waterReverbSend?.gain.setTargetAtTime(
      this.scaleEarthSend(shv('waterReverbSend', state.waterReverbSend), this.getWaterFamilySendScale(state)),
      now,
      smoothTime,
    );

    // Insects dry bus stays open while either insects layer is enabled or fading.
    this.insectsLevelGain?.gain.setTargetAtTime(
      insectsLayerActive ? this.getInsectsSharedMasterScale(state) : 0, now, smoothTime
    );
    this.natureLevelGain?.gain.setTargetAtTime(state.natureLevel ?? 1.0, now, smoothTime);

    const soundscapeParityFixture = this.isSoundscapeParityFixture(state);
    const oceanLevel = state.oceanSampleLevel ?? 0;
    const oceanReverb = shv('oceanReverbSend', state.oceanReverbSend);
    const oceanDelayA = state.oceanDelayASend ?? 0;
    const oceanDelayB = state.oceanDelayBSend ?? 0;
    this.syncEarthFadeState(this.oceanFadeState, state.oceanSampleEnabled, now, {
      onInit: (target) => this.setAudioParamImmediate(this.oceanGateGain?.gain, target, now),
      onTransition: (current, target, endTime) => this.rampAudioParam(this.oceanGateGain?.gain, current, target, now, endTime),
      onFadeOutComplete: () => this.oceanTexturePlayer?.stop(),
    });
    this.oceanLevelGain?.gain.setTargetAtTime(oceanLevel, now, smoothTime);
    this.oceanReverbSendNode?.gain.setTargetAtTime(oceanReverb, now, smoothTime);
    const oceanShouldRun = this.isRunning && this.isEarthFadeActive(this.oceanFadeState, now) && (
      oceanLevel > 0.0001 ||
      oceanReverb > 0.0001 ||
      oceanDelayA > 0.0001 ||
      oceanDelayB > 0.0001 ||
      (state.granularWavesSend ?? 0) > 0.0001
    );
    this.oceanTexturePlayer?.update({
      sliceDuration: state.oceanSliceDuration ?? 22,
      fadeTime: soundscapeParityFixture ? 0 : 5.5,
      density: state.oceanSliceDensity ?? 0.38,
      randomSeed: this.createEarthTextureSeed('ocean', state),
      parityDeterministic: soundscapeParityFixture,
    });
    if (oceanShouldRun) void this.oceanTexturePlayer?.start();
    else this.oceanTexturePlayer?.stop();

    this.updateEarthTextureRuntime(this.birdsTexture, {
      enabled: state.birdsEnabled,
      level: state.birdsLevel,
      masterLevel: state.natureLevel ?? 1.0,
      reverbSend: shv('natureReverbSend', state.natureReverbSend),
      delayASend: shv('natureDelayASend', state.natureDelayASend ?? 0),
      delayBSend: shv('natureDelayBSend', state.natureDelayBSend ?? 0),
      granularSend: shv('granularNatureSend', state.granularNatureSend ?? 0),
      sliceDuration: state.birdsSliceDuration ?? 20,
      density: state.birdsSliceDensity ?? 0.45,
      randomSeed: this.createEarthTextureSeed('birds', state),
      parityDeterministic: soundscapeParityFixture,
      smoothTime,
      now,
    });
    this.updateEarthTextureRuntime(this.birds2Texture, {
      enabled: state.birds2Enabled,
      level: state.birds2Level,
      masterLevel: state.natureLevel ?? 1.0,
      reverbSend: shv('natureReverbSend', state.natureReverbSend),
      delayASend: shv('natureDelayASend', state.natureDelayASend ?? 0),
      delayBSend: shv('natureDelayBSend', state.natureDelayBSend ?? 0),
      granularSend: shv('granularNatureSend', state.granularNatureSend ?? 0),
      sliceDuration: state.birds2SliceDuration ?? 20,
      density: state.birds2SliceDensity ?? 0.48,
      randomSeed: this.createEarthTextureSeed('birds2', state),
      parityDeterministic: soundscapeParityFixture,
      smoothTime,
      now,
    });
    this.updateEarthTextureRuntime(this.frogsTexture, {
      enabled: state.frogsEnabled,
      level: state.frogsLevel,
      masterLevel: state.natureLevel ?? 1.0,
      reverbSend: shv('natureReverbSend', state.natureReverbSend),
      delayASend: shv('natureDelayASend', state.natureDelayASend ?? 0),
      delayBSend: shv('natureDelayBSend', state.natureDelayBSend ?? 0),
      granularSend: shv('granularNatureSend', state.granularNatureSend ?? 0),
      sliceDuration: state.frogsSliceDuration ?? 18,
      density: state.frogsSliceDensity ?? 0.52,
      randomSeed: this.createEarthTextureSeed('frogs', state),
      parityDeterministic: soundscapeParityFixture,
      smoothTime,
      now,
    });

    // Insects reverb send (pre-fader) — S&H aware
    this.insectsReverbSendNode?.gain.setTargetAtTime(
      insectsLayerActive
        ? this.scaleEarthSend(shv('insectsReverbSend', state.insectsReverbSend), this.getInsectsSharedMasterScale(state))
        : 0,
      now,
      smoothTime,
    );
  }

  private preloadEarthTextures(): void {
    void this.oceanTexturePlayer?.ensureLoaded();
  }

  private updateEarthTextureRuntime(
    runtime: EarthTextureRuntime | null,
    options: {
      enabled: boolean;
      level: number;
      masterLevel?: number;
      reverbSend: number;
      delayASend: number;
      delayBSend: number;
      granularSend: number;
      sliceDuration: number;
      density: number;
      randomSeed?: string | null;
      parityDeterministic?: boolean;
      smoothTime: number;
      now: number;
    },
  ): void {
    if (!runtime) return;

    this.syncEarthFadeState(runtime.fadeState, options.enabled, options.now, {
      onInit: (target) => this.setAudioParamImmediate(runtime.gateGain.gain, target, options.now),
      onTransition: (current, target, endTime) => this.rampAudioParam(runtime.gateGain.gain, current, target, options.now, endTime),
      onFadeOutComplete: () => runtime.player.stop(),
    });

    const gateActive = this.isEarthFadeActive(runtime.fadeState, options.now);
    const routedActive = options.enabled || gateActive;
    const routedLevel = routedActive ? options.level : 0;
    const effectiveLevelScale = this.getEarthLayerOutputScale(routedLevel, options.masterLevel ?? 1);
    const routedReverbSend = routedActive ? this.scaleEarthSend(options.reverbSend, effectiveLevelScale) : 0;
    const routedDelayASend = routedActive ? this.scaleEarthSend(options.delayASend, effectiveLevelScale) : 0;
    const routedDelayBSend = routedActive ? this.scaleEarthSend(options.delayBSend, effectiveLevelScale) : 0;
    const routedGranularSend = routedActive ? this.scaleEarthSend(options.granularSend, effectiveLevelScale) : 0;

    runtime.levelGain.gain.setTargetAtTime(routedLevel, options.now, options.smoothTime);
    runtime.reverbSend.gain.setTargetAtTime(routedReverbSend, options.now, options.smoothTime);
    runtime.delayASend?.gain.setTargetAtTime(routedDelayASend, options.now, options.smoothTime);
    runtime.delayBSend?.gain.setTargetAtTime(routedDelayBSend, options.now, options.smoothTime);
    runtime.granularSend?.gain.setTargetAtTime(routedGranularSend, options.now, options.smoothTime);
    runtime.player.update({
      sliceDuration: options.sliceDuration,
      density: options.density,
      randomSeed: options.randomSeed,
      parityDeterministic: options.parityDeterministic === true,
    });

    const effectiveDryLevel = effectiveLevelScale;

    const wetActive =
      effectiveDryLevel > 0.0001 ||
      routedReverbSend > 0.0001 ||
      routedDelayASend > 0.0001 ||
      routedDelayBSend > 0.0001 ||
      routedGranularSend > 0.0001;

    if (this.isRunning && gateActive && wetActive) {
      void runtime.player.start();
    } else {
      runtime.player.stop();
    }
  }

  /**
   * Load or update a Lead 4op FM preset for a given slot.
   * Called by App.tsx when preset dropdown changes.
   */
  async loadLeadPreset(slot: 'A' | 'B' | 'C' | 'D', presetId: string): Promise<void> {
    const fallbackId = slot === 'B' || slot === 'D' ? 'gamelan' : 'soft_rhodes';
    this.leadPresetPendingIds[slot] = presetId;
    try {
      const preset = await loadLead4opFMPresetVerified(presetId, fallbackId);
      if (this.leadPresetPendingIds[slot] !== presetId) return;
      switch (slot) {
        case 'A': this.lead1PresetA = preset; this.lead1PresetAId = presetId; break;
        case 'B': this.lead1PresetB = preset; this.lead1PresetBId = presetId; break;
        case 'C': this.lead2PresetC = preset; this.lead2PresetCId = presetId; break;
        case 'D': this.lead2PresetD = preset; this.lead2PresetDId = presetId; break;
      }
    } finally {
      if (this.leadPresetPendingIds[slot] === presetId) {
        delete this.leadPresetPendingIds[slot];
      }
    }
  }

  /**
   * Get current morphed params for a lead (for UI ADSR display)
   */
  getLeadMorphedParams(lead: 1 | 2): Lead4opFMMorphedParams | null {
    if (!this.sliderState) return null;
    if (lead === 1) {
      const m1Range = this.dualRanges['lead1Morph'];
      const morphMid = m1Range ? (m1Range.min + m1Range.max) / 2 : (this.sliderState.lead1Morph ?? 0);
      const morphed = morphPresets(
        this.lead1PresetA,
        this.lead1PresetB,
        morphMid,
        this.sliderState.lead1AlgorithmMode,
      );
      if (this.sliderState.lead1UseCustomAdsr) {
        return {
          ...morphed,
          attack: this.sliderState.lead1Attack,
          decay: this.sliderState.lead1Decay,
          sustain: this.sliderState.lead1Sustain,
          release: this.sliderState.lead1Release,
        };
      }
      return morphed;
    } else {
      const m2Range = this.dualRanges['lead2Morph'];
      const morphMid = m2Range ? (m2Range.min + m2Range.max) / 2 : (this.sliderState.lead2Morph ?? 0);
      const morphed = morphPresets(
        this.lead2PresetC,
        this.lead2PresetD,
        morphMid,
        this.sliderState.lead2AlgorithmMode,
      );
      if (this.sliderState.lead2UseCustomAdsr) {
        return {
          ...morphed,
          attack: this.sliderState.lead2Attack,
          decay: this.sliderState.lead2Decay,
          sustain: this.sliderState.lead2Sustain,
          release: this.sliderState.lead2Release,
        };
      }
      return morphed;
    }
  }

  /**
   * Play a 4-operator FM lead note using morphed preset parameters.
   * Supports lead1 (Preset A↔B) and lead2 (Preset C↔D).
   * Vibrato, glide, and delay are shared and independent of presets.
   */
  /**
   * Play a single lead FM note.
   * `velocity` controls timbre (FM mod depth, transient energy) AND amplitude —
   * it is NOT the same as bus gain. Per-lead mix level lives on lead1LevelGain /
   * lead2LevelGain (post reverb/granular tap), so note loudness can change independently
   * of the dry mixer fader.
   */
  private playLeadNote(
    frequency: number,
    velocity: number = 0.8,
    leadSource: 'lead' | 'lead1' | 'lead2' = 'lead1',
    distanceOverride: number | null = null,
    manualAudition = false,
  ): void {
    if (!this.ctx || !this.leadGain || !this.sliderState) return;
    // Determine which lead to use and check if enabled
    const useLead2 = leadSource === 'lead2';
    const lead1Playable = this.isLead1RouteActive(this.sliderState);
    const lead2Playable = this.isLead2RouteActive(this.sliderState);
    if (useLead2) {
      if (!lead2Playable) return;
    } else if (!lead1Playable) {
      return;
    }
    this.updateLeadPostLpfForNote(useLead2 ? 'lead2' : 'lead1', frequency);

    // Compute morphed FM params.
    // Random Walk (when enabled) uses smooth momentum-based motion within min/max.
    // Otherwise fall back to per-trigger random within min/max.
    // Sub-sequencer morph override takes priority when set.
    const morphKey = useLead2 ? 'lead2Morph' : 'lead1Morph';
    const morphRange = this.dualRanges[morphKey];
    const rawMorphMin = morphRange ? morphRange.min : (this.sliderState[morphKey as keyof SliderState] as number ?? 0);
    const rawMorphMax = morphRange ? morphRange.max : (this.sliderState[morphKey as keyof SliderState] as number ?? 0);
    const morphMin = Math.min(rawMorphMin, rawMorphMax);
    const morphMax = Math.max(rawMorphMin, rawMorphMax);
    let morphT: number;
    if (this.synthMorphOverride !== null) {
      // Sub-sequencer morph: value is 0-1, used directly as preset morph position
      morphT = this.synthMorphOverride;
    } else {
      const randomWalkEnabled = useLead2 ? this.sliderState.lead2MorphAuto : this.sliderState.lead1MorphAuto;
      const walkState = useLead2 ? this.leadMorphWalkStates.lead2 : this.leadMorphWalkStates.lead1;
      const walkPos = walkState.initialized ? walkState.position : 0.5;
      morphT = randomWalkEnabled
        ? (morphMin + walkPos * (morphMax - morphMin))
        : (morphMin + Math.random() * (morphMax - morphMin));
    }
    const morphed = useLead2
      ? morphPresets(this.lead2PresetC, this.lead2PresetD, morphT, this.sliderState.lead2AlgorithmMode)
      : morphPresets(this.lead1PresetA, this.lead1PresetB, morphT, this.sliderState.lead1AlgorithmMode);
    const useCustomAdsr = useLead2 ? this.sliderState.lead2UseCustomAdsr : this.sliderState.lead1UseCustomAdsr;
    const effectiveMorphed = useCustomAdsr
      ? {
          ...morphed,
          attack: useLead2 ? this.sliderState.lead2Attack : this.sliderState.lead1Attack,
          decay: useLead2 ? this.sliderState.lead2Decay : this.sliderState.lead1Decay,
          sustain: useLead2 ? this.sliderState.lead2Sustain : this.sliderState.lead1Sustain,
          release: useLead2 ? this.sliderState.lead2Release : this.sliderState.lead1Release,
        }
      : morphed;

    const leadVoice = useLead2 ? 'lead2' : 'lead1';
    const leadDistance = Math.max(0, Math.min(1, distanceOverride ?? getVoiceDistanceValue(this.sliderState, leadVoice)));
    this.onLeadDistanceTrigger?.({
      lead1: useLead2 ? -1 : leadDistance,
      lead2: useLead2 ? leadDistance : -1,
    });
    let hold = useLead2 ? this.sliderState.lead2Hold : this.sliderState.lead1Hold;
    const distanceEnv = applyLeadDistanceEnvelope(
      useLead2 ? 'lead2' : 'lead1',
      {
        attack: effectiveMorphed.attack ?? 0.01,
        decay: effectiveMorphed.decay ?? 0.3,
        sustain: effectiveMorphed.sustain ?? 0.7,
        hold,
        release: effectiveMorphed.release ?? 0.5,
      },
      leadDistance,
    );
    effectiveMorphed.attack = distanceEnv.attack;
    effectiveMorphed.decay = distanceEnv.decay;
    effectiveMorphed.sustain = distanceEnv.sustain;
    effectiveMorphed.release = distanceEnv.release;
    hold = distanceEnv.hold ?? hold;

    // Apply ratchet factor to tighten ADSR for ratchet retrigs
    if (this.synthRatchetFactor < 1) {
      const rf = this.synthRatchetFactor;
      effectiveMorphed.attack = (effectiveMorphed.attack ?? 0.01) * rf;
      effectiveMorphed.decay = (effectiveMorphed.decay ?? 0.3) * rf;
      effectiveMorphed.release = (effectiveMorphed.release ?? 0.5) * rf;
    }

    // Notify UI of the triggered morph position (0-1 within the range)
    if (this.onLeadMorphTrigger) {
      // When sub-sequencer override is active, morphT is already 0-1 directly
      const morphPos = this.synthMorphOverride !== null || !morphRange
        ? morphT
        : (morphMax > morphMin ? (morphT - morphMin) / (morphMax - morphMin) : 0.5);
      if (useLead2) {
        this.onLeadMorphTrigger({ lead1: -1, lead2: morphPos }); // -1 = unchanged
      } else {
        this.onLeadMorphTrigger({ lead1: morphPos, lead2: -1 });
      }
    }

    // Per-note velocity drives both lead timbre and note loudness.

    // ── Per-trigger lead S&H: resample lead dual-range keys on each note trigger ──
    // Uses the existing dualRanges/shSampledValues system (excluded from 10Hz loop).
    const leadSHPositions: Record<string, number> = {};
    for (const key of Object.keys(this.dualRanges)) {
      if (key.startsWith('lead') || key.startsWith('granularLead')) {
        this.sampleDualRangeKey(key, leadSHPositions);
      }
    }
    this.emitOwnedSamplePositions(leadSHPositions);

    const effectiveVelocity = Math.max(0, Math.min(1.5, velocity));

    if (effectiveVelocity < 0.001) return;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.reportFxOnset(useLead2 ? 'lead2' : 'lead1', 'leadNote');

    // ─── Shared expression: vibrato & glide (NOT from presets) ───
    const vdRange = this.dualRanges['leadVibratoDepth'];
    const vibratoDepthMin = vdRange ? vdRange.min : (this.sliderState.leadVibratoDepth ?? 0);
    const vibratoDepthMax = vdRange ? vdRange.max : (this.sliderState.leadVibratoDepth ?? 0);
    const vibratoDepthNorm = vibratoDepthMin + Math.random() * (vibratoDepthMax - vibratoDepthMin);

    const vrRange = this.dualRanges['leadVibratoRate'];
    const vibratoRateMin = vrRange ? vrRange.min : (this.sliderState.leadVibratoRate ?? 0);
    const vibratoRateMax = vrRange ? vrRange.max : (this.sliderState.leadVibratoRate ?? 0);
    const vibratoRateNorm = vibratoRateMin + Math.random() * (vibratoRateMax - vibratoRateMin);

    const glRange = this.dualRanges['leadGlide'];
    const glideMin = glRange ? glRange.min : (this.sliderState.leadGlide ?? 0);
    const glideMax = glRange ? glRange.max : (this.sliderState.leadGlide ?? 0);
    const glide = glideMin + Math.random() * (glideMax - glideMin);

    // Notify UI of the triggered expression values
    if (this.onLeadExpressionTrigger) {
      this.onLeadExpressionTrigger({
        vibratoDepth: vibratoDepthMax > vibratoDepthMin
          ? (vibratoDepthNorm - vibratoDepthMin) / (vibratoDepthMax - vibratoDepthMin)
          : 0.5,
        vibratoRate: vibratoRateMax > vibratoRateMin
          ? (vibratoRateNorm - vibratoRateMin) / (vibratoRateMax - vibratoRateMin)
          : 0.5,
        glide: glideMax > glideMin
          ? (glide - glideMin) / (glideMax - glideMin)
          : 0.5,
      });
    }

    // ─── Shared delay (NOT from presets) ───
    const lead1DelayActive = this.isLead1RouteActive(this.sliderState) || (this.sliderState.leadRandomEnabled && this.getLeadRandomSource(this.sliderState) === 'lead1' && this.isLeadRandomSourceEnabled(this.sliderState));
    const lead2DelayActive = this.isLead2RouteActive(this.sliderState) || (this.sliderState.leadRandomEnabled && this.getLeadRandomSource(this.sliderState) === 'lead2' && this.isLeadRandomSourceEnabled(this.sliderState));
    const pianoDelayActive = this.isPianoRouteActive(this.sliderState);
    const granularBusArmed = this.isGranularBusArmed(this.sliderState, lead1DelayActive, lead2DelayActive, pianoDelayActive);
    const delayAState = this.getSharedDelayAState(
      this.sliderState,
      lead1DelayActive,
      lead2DelayActive,
      pianoDelayActive,
      granularBusArmed,
    );

    const smoothTime = 0.05;
    this.sharedDelayA?.update(delayAState, now, smoothTime);

    // ─── Apply vibrato via carrier frequency modulation ───
    // The 4op FM note function handles the core synthesis, but we need to
    // apply glide and vibrato by wrapping the frequency
    let noteFreq = frequency;
    if (glide > 0.01) {
      // Glide is handled per-note by starting at a random nearby frequency
      // The 4op FM note uses the target freq; we pre-offset and let it play
      noteFreq = frequency * (1 + (Math.random() - 0.5) * glide * 0.2);
    }

    // ─── Per-engine tension → timbre randomization ───
    // Higher tension adds random offsets to FM params (mod index, feedback, beat detune)
    const leadTension = getEffectiveTension(
      this.sliderState.tension ?? 0.3,
      this.sliderState.leadTensionMode ?? 'follow',
      this.sliderState.leadTensionValue ?? 0,
    );
    if (!manualAudition && leadTension > 0.05) {
      const spread = leadTension * 0.3; // max ±30% at tension=1
      const rOff = () => (Math.random() * 2 - 1) * spread;
      effectiveMorphed.mod1Index  = Math.max(0, effectiveMorphed.mod1Index  * (1 + rOff()));
      effectiveMorphed.mod2Index  = Math.max(0, effectiveMorphed.mod2Index  * (1 + rOff()));
      effectiveMorphed.mod1Feedback = Math.max(0, Math.min(1, (effectiveMorphed.mod1Feedback ?? 0) + rOff() * 0.15));
      effectiveMorphed.beatDetune = (effectiveMorphed.beatDetune ?? 0) + rOff() * 4;
      effectiveMorphed.carrier2Mix = Math.max(0, Math.min(1, (effectiveMorphed.carrier2Mix ?? 0.5) + rOff() * 0.2));
    }
    const noteLocalMorphed = this.applyLeadDistanceTimbre(effectiveMorphed, leadDistance);

    // WASM path: send morphed params + delay + noteOn to the lead FM worklet
    // WASM has separate outputs per lead — output[0]=lead1, output[1]=lead2.
    // Each output routes through its own level gain and pre-fader sends in the Web Audio graph.
    if (this.leadFmWasmReady && this.leadFmWasmNode) {
      const port = this.leadFmWasmNode.port;
      port.postMessage({ type: 'params', params: noteLocalMorphed });
      port.postMessage({
        type: 'delay',
        params: {
          enabled: false,
          timeL: 0,
          timeR: 0,
          feedback: 0,
          mix: 0,
          filter: this.sliderState.delayAFilter ?? 2000,
          send: 0,
        },
      });
      const gateHold = Math.max(0.02, (noteLocalMorphed.attack ?? 0.01) + (noteLocalMorphed.decay ?? 0.3) + Math.max(0, hold));
      port.postMessage({ type: 'noteOn', frequency: noteFreq, velocity: effectiveVelocity, hold: gateHold, leadIndex: useLead2 ? 1 : 0 });
      return;
    }

    // Play the 4op FM note — outputs into lead1Bus or lead2Bus for separate granular tapping
    const leadDest = useLead2
      ? (this.lead2Bus ?? this.leadGain)
      : (this.lead1Bus ?? this.leadGain);
    playLead4opFMNote(ctx, leadDest, noteFreq, effectiveVelocity, noteLocalMorphed, hold);

    // If glide, schedule frequency ramp on all carriers (handled inside playLead4opFMNote is per-note)
    // Vibrato: add LFO modulation if depth > threshold
    // (Vibrato is applied at the carrier level inside the note function is not possible after
    //  creation, so for shared vibrato we'd need to modify the approach slightly.
    //  For now, the note already plays without vibrato — vibrato will be added in a future iteration
    //  when the per-note function supports passing vibrato params.)
  }

  private getPianoPrioritySampleIndices(): number[] {
    return getManualPianoPrioritySampleIndices();
  }

  private markPianoBufferUsed(variant: PianoSampleVariant, index: number): void {
    this.pianoBufferLastUsed[variant].set(index, ++this.pianoBufferUseSequence);
  }

  private evictPianoBuffers(
    variant: PianoSampleVariant,
    protectedIndices: ReadonlySet<number> = new Set<number>(),
  ): void {
    const buffers = this.pianoBuffers[variant];
    const lastUsed = this.pianoBufferLastUsed[variant];
    while (buffers.size > PIANO_SAMPLE_CACHE_LIMIT_PER_VARIANT) {
      let evictionIndex: number | null = null;
      let evictionAge = Infinity;
      for (const index of buffers.keys()) {
        if (protectedIndices.has(index)) continue;
        const age = lastUsed.get(index) ?? 0;
        if (age < evictionAge) {
          evictionAge = age;
          evictionIndex = index;
        }
      }
      if (evictionIndex === null) break;
      buffers.delete(evictionIndex);
      lastUsed.delete(evictionIndex);
    }
  }

  private cancelPianoPriorityWarmup(): void {
    this.pianoPriorityWarmupGeneration += 1;
    this.pianoPriorityWarmupPromise = null;
  }

  private async loadPianoSample(variant: PianoSampleVariant, index: number): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    const safeIndex = Math.max(1, Math.min(PIANO_SAMPLE_COUNT, Math.round(index)));
    const targetMap = this.pianoBuffers[variant];
    const existing = targetMap.get(safeIndex);
    if (existing) {
      this.markPianoBufferUsed(variant, safeIndex);
      return existing;
    }

    const pending = this.pianoBufferPromises[variant].get(safeIndex);
    if (pending) return pending;

    const samplePath = getPianoSamplePath(variant, safeIndex);
    const ctx = this.ctx;
    const loadPromise = (async () => {
      try {
        const response = await fetch(resolvePublicSampleUrl(samplePath));
        if (!response.ok) {
          console.warn(`Piano sample not found: ${samplePath}`);
          return null;
        }
        const arrayBuffer = await response.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
        targetMap.set(safeIndex, decoded);
        this.markPianoBufferUsed(variant, safeIndex);
        const protectedIndices = new Set<number>([
          safeIndex,
          ...this.pianoBufferPromises[variant].keys(),
        ]);
        this.evictPianoBuffers(variant, protectedIndices);
        return decoded;
      } catch (error) {
        console.warn(`Failed to load piano sample ${samplePath}:`, error);
        return null;
      } finally {
        this.pianoBufferPromises[variant].delete(safeIndex);
      }
    })();

    this.pianoBufferPromises[variant].set(safeIndex, loadPromise);
    return loadPromise;
  }

  private async ensurePianoSamplePairLoaded(index: number): Promise<void> {
    await Promise.all([
      this.loadPianoSample('regular', index),
      this.loadPianoSample('short', index),
    ]);
  }

  private startPianoPriorityWarmup(): void {
    if (this.pianoPriorityWarmupPromise) return;
    const priorityIndices = this.getPianoPrioritySampleIndices();
    const generation = this.pianoPriorityWarmupGeneration + 1;
    this.pianoPriorityWarmupGeneration = generation;
    this.pianoPriorityWarmupPromise = (async () => {
      for (const index of priorityIndices) {
        if (generation !== this.pianoPriorityWarmupGeneration) break;
        if (!this.sliderState || !this.isPianoRouteActive(this.sliderState)) break;
        await this.ensurePianoSamplePairLoaded(index);
      }
    })().finally(() => {
      if (generation === this.pianoPriorityWarmupGeneration) {
        this.pianoPriorityWarmupPromise = null;
      }
    });
  }

  private async ensurePianoFocusSampleLoaded(focusMidi?: number): Promise<void> {
    this.startPianoPriorityWarmup();
    if (!this.ctx) return;
    const priorityIndices = this.getPianoPrioritySampleIndices();
    const fallbackIndex = priorityIndices[0] ?? 1;
    const focusIndex = focusMidi != null
      ? getNearestPianoSample(focusMidi).index
      : fallbackIndex;
    await this.ensurePianoSamplePairLoaded(focusIndex);
  }

  private getClosestLoadedPianoBuffer(
    targetIndex: number,
    variants: PianoSampleVariant[],
  ): { buffer: AudioBuffer; sampleMidi: number } | null {
    let bestMatch: { distance: number; buffer: AudioBuffer; sampleMidi: number; variant: PianoSampleVariant; index: number } | null = null;

    for (const variant of variants) {
      for (const [loadedIndex, buffer] of this.pianoBuffers[variant]) {
        const distance = Math.abs(loadedIndex - targetIndex);
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = {
            distance,
            buffer,
            sampleMidi: getPianoSampleMidi(loadedIndex),
            variant,
            index: loadedIndex,
          };
          if (distance === 0) {
            this.markPianoBufferUsed(variant, loadedIndex);
            return { buffer, sampleMidi: getPianoSampleMidi(loadedIndex) };
          }
        }
      }
    }

    if (!bestMatch) return null;
    this.markPianoBufferUsed(bestMatch.variant, bestMatch.index);
    return { buffer: bestMatch.buffer, sampleMidi: bestMatch.sampleMidi };
  }

  private playPianoNote(frequency: number, velocity = 0.8, distanceOverride: number | null = null): void {
    if (!this.sliderState) return;
    if (!this.ctx || !this.masterGain) {
      this.ensureSynthChain();
    }
    if (!this.ctx || !this.pianoBus || !this.pianoLevelGain) return;
    if (!this.isPianoRouteActive(this.sliderState)) return;

    const midiNote = frequencyToMidiNote(frequency);
    const preferredVariant = choosePianoSampleVariant(midiNote, velocity);
    const fallbackVariant: PianoSampleVariant = preferredVariant === 'regular' ? 'short' : 'regular';
    const { index, sampleMidi } = getNearestPianoSample(midiNote);
    let resolvedSampleMidi = sampleMidi;
    let buffer = this.pianoBuffers[preferredVariant].get(index)
      ?? this.pianoBuffers[fallbackVariant].get(index)
      ?? null;

    if (!buffer) {
      this.startPianoPriorityWarmup();
      void this.ensurePianoSamplePairLoaded(index);
      const fallbackBuffer = this.getClosestLoadedPianoBuffer(index, [preferredVariant, fallbackVariant]);
      if (!fallbackBuffer) return;
      buffer = fallbackBuffer.buffer;
      resolvedSampleMidi = fallbackBuffer.sampleMidi;
    } else {
      const loadedVariant = this.pianoBuffers[preferredVariant].has(index) ? preferredVariant : fallbackVariant;
      this.markPianoBufferUsed(loadedVariant, index);
    }

    const ctx = this.ctx;
    const now = ctx.currentTime;

    const pianoSHPositions: Record<string, number> = {};
    for (const key of PIANO_TRIGGER_HOLD_KEYS) {
      if (!this.dualRanges[key]) continue;
      this.sampleDualRangeKey(key, pianoSHPositions);
    }
    if (Object.keys(pianoSHPositions).length > 0) {
      this.emitOwnedSamplePositions(pianoSHPositions);
      this.scheduleApplyParamsRefresh();
    }

    this.reportFxOnset('piano', 'pianoNote');

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const playbackRate = Math.pow(2, (midiNote - resolvedSampleMidi) / 12);
    source.playbackRate.setValueAtTime(playbackRate, now);

    const gain = ctx.createGain();
    source.connect(gain);

    const baselinePianoDistance = getVoiceDistanceValue(this.sliderState, 'piano');
    const pianoDistance = Math.max(0, Math.min(1, distanceOverride ?? baselinePianoDistance));
    this.onPianoDistanceTrigger?.(pianoDistance);
    const pianoEnv = applyPianoDistanceEnvelope({
      attack: Math.max(0.001, this.shv('pianoAttack', this.sliderState.pianoAttack ?? 0.005)),
      decay: Math.max(0.01, this.shv('pianoDecay', this.sliderState.pianoDecay ?? 0.65)),
      sustain: Math.max(0, Math.min(1, this.shv('pianoSustain', this.sliderState.pianoSustain ?? 0.72))),
      hold: Math.max(0, this.shv('pianoHold', this.sliderState.pianoHold ?? 0.2)),
      release: Math.max(0.01, this.shv('pianoRelease', this.sliderState.pianoRelease ?? 1.4)),
    }, pianoDistance);
    const attack = Math.max(0.001, pianoEnv.attack);
    const decay = Math.max(0.01, pianoEnv.decay);
    const sustain = Math.max(0, Math.min(1, pianoEnv.sustain));
    const hold = Math.max(0, pianoEnv.hold ?? 0);
    const release = Math.max(0.01, pianoEnv.release);
    const noteFilterCutoff = applyDistanceValue('pianoPostLPF', this.sliderState, 'piano', pianoDistance);
    let noteFilter: BiquadFilterNode | null = null;
    if (pianoDistance > 1e-4) {
      noteFilter = ctx.createBiquadFilter();
      noteFilter.type = 'lowpass';
      noteFilter.frequency.setValueAtTime(Math.max(40, noteFilterCutoff), now);
      noteFilter.Q.value = 0.707;
      gain.connect(noteFilter);
      noteFilter.connect(this.pianoBus);
    } else {
      gain.connect(this.pianoBus);
    }
    const peak = Math.max(0, Math.min(1.25, velocity));
    const sustainLevel = peak * sustain;
    const attackEnd = now + attack;
    const decayEnd = attackEnd + decay;
    const holdEnd = decayEnd + hold;

    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, attackEnd);
    gain.gain.linearRampToValueAtTime(sustainLevel, decayEnd);
    gain.gain.setValueAtTime(sustainLevel, holdEnd);
    gain.gain.linearRampToValueAtTime(0.0001, holdEnd + release);

    const activeVoice: ActivePianoVoice = { source, gain, filter: noteFilter };
    this.activePianoVoices.add(activeVoice);

    source.onended = () => {
      this.activePianoVoices.delete(activeVoice);
      try { source.disconnect(); } catch { /* ignore stale piano source */ }
      try { gain.disconnect(); } catch { /* ignore stale piano gain */ }
      try { noteFilter?.disconnect(); } catch { /* ignore stale piano filter */ }
    };

    source.start(now);
    const sourceDuration = buffer.duration / Math.max(0.01, playbackRate);
    source.stop(now + Math.min(sourceDuration, attack + decay + hold + release + 0.25));
  }

  /**
   * Euclidean rhythm presets inspired by Indonesian gamelan and Steve Reich
   * These patterns reflect traditional colotomic structures, interlocking rhythms, and phasing
   */
  private readonly EUCLIDEAN_PRESETS: Record<string, { steps: number; hits: number; rotation: number; name: string }> = {
    // === GAMELAN PATTERNS ===
    // Lancaran - 16-beat cycle, gong on beat 16, kenong on 8, kempul on 4, 12
    'lancaran': { steps: 16, hits: 4, rotation: 0, name: 'Lancaran (16-beat)' },
    // Ketawang - 16-beat with 2 kenong, sparser
    'ketawang': { steps: 16, hits: 2, rotation: 0, name: 'Ketawang (sparse)' },
    // Ladrang - 32-beat cycle with specific accents
    'ladrang': { steps: 32, hits: 8, rotation: 0, name: 'Ladrang (32-beat)' },
    // Gangsaran - fast, dense 8-beat pattern
    'gangsaran': { steps: 8, hits: 4, rotation: 0, name: 'Gangsaran (fast)' },
    // Kotekan-style interlocking - 8 steps, 3 hits (common pattern)
    'kotekan': { steps: 8, hits: 3, rotation: 1, name: 'Kotekan (interlocking)' },
    // Kotekan counterpart - interlocks with kotekan when offset
    'kotekan2': { steps: 8, hits: 3, rotation: 4, name: 'Kotekan B (counter)' },
    // Srepegan - medium tempo 16-beat
    'srepegan': { steps: 16, hits: 6, rotation: 2, name: 'Srepegan (medium)' },
    // Sampak - fast 8-beat with 5 hits
    'sampak': { steps: 8, hits: 5, rotation: 0, name: 'Sampak (dense)' },
    // Ayak-ayakan - 16-beat with 3 hits, sparse and flowing
    'ayak': { steps: 16, hits: 3, rotation: 4, name: 'Ayak-ayakan (flowing)' },
    // Bonang panerus - high density interlocking
    'bonang': { steps: 12, hits: 5, rotation: 2, name: 'Bonang (12-beat)' },

    // === STEVE REICH / MINIMALIST PATTERNS ===
    // Classic phasing pattern from "Clapping Music"
    'clapping': { steps: 12, hits: 8, rotation: 0, name: 'Clapping Music (12/8)' },
    // Phase shifted version for polyrhythmic layering
    'clappingB': { steps: 12, hits: 8, rotation: 5, name: 'Clapping B (phase)' },
    // 3 against 4 polyrhythm base
    'poly3v4': { steps: 12, hits: 3, rotation: 0, name: '3 vs 4 (triplet)' },
    // 4 against 3 counterpart
    'poly4v3': { steps: 12, hits: 4, rotation: 0, name: '4 vs 3 (quarter)' },
    // 5 against 4 - quintuplet feel
    'poly5v4': { steps: 20, hits: 5, rotation: 0, name: '5 vs 4 (quint)' },
    // 7 beat additive pattern
    'additive7': { steps: 7, hits: 4, rotation: 0, name: 'Additive 7' },
    // 11 beat additive - prime number creates long cycle
    'additive11': { steps: 11, hits: 5, rotation: 0, name: 'Additive 11' },
    // 13 beat additive - longer prime cycle
    'additive13': { steps: 13, hits: 5, rotation: 0, name: 'Additive 13' },
    // Music for 18 Musicians inspired - 12 beat with 7 hits
    'reich18': { steps: 12, hits: 7, rotation: 3, name: 'Reich 18 (12/7)' },
    // Drumming-inspired pattern
    'drumming': { steps: 8, hits: 6, rotation: 1, name: 'Drumming (8/6)' },

    // === POLYRHYTHMIC COMBINATIONS ===
    // Very sparse - creates space
    'sparse': { steps: 16, hits: 1, rotation: 0, name: 'Sparse (16/1)' },
    // Ultra-dense - machine gun
    'dense': { steps: 8, hits: 7, rotation: 0, name: 'Dense (8/7)' },
    // Long cycle sparse
    'longSparse': { steps: 32, hits: 3, rotation: 0, name: 'Long Sparse (32/3)' },

    // Custom - uses slider values
    'custom': { steps: 16, hits: 4, rotation: 0, name: 'Custom' },
  };

  /**
   * Schedule sparse random melody notes for the lead synth (phrase-based).
   * Euclidean patterns are now handled by the continuous scheduler (startSynthEuclidScheduler).
   */
  private scheduleLeadMelody(): void {
    if (!this.sliderState || !this.harmonyState || !this.rng) return;
    const anchors = this.ensureTransportAnchors();

    // Clear any previously scheduled note timeouts
    for (const timeout of this.leadNoteTimeouts) clearTimeout(timeout);
    this.leadNoteTimeouts = [];

    if (!this.sliderState.leadRandomEnabled) {
      if (this.leadMelodyTimer !== null) {
        clearTimeout(this.leadMelodyTimer);
        this.leadMelodyTimer = null;
      }
      return;
    }

    if (!this.isLeadRandomSourceEnabled(this.sliderState)) {
      if (this.leadMelodyTimer !== null) {
        clearTimeout(this.leadMelodyTimer);
        this.leadMelodyTimer = null;
      }
      return;
    }

    const randomSource = this.getLeadRandomSource(this.sliderState);
    const rng = this.rng;
    const scale = this.harmonyState.scaleFamily;
    const rootNote = this.effectiveRoot;
    const baseOctaveOffset = this.sliderState.lead1Octave;
    const octaveRange = this.sliderState.lead1OctaveRange ?? 2;
    const phraseDuration = getPhraseDurationForClockSource(
      this.sliderState,
      this.sliderState.leadRandomClockSource ?? 'globalPhrase',
    ) * 1000;
    const density = this.sliderState.lead1Density;
    const notesThisPhrase = Math.max(1, Math.round(density * 3 + rng() * 2));
    const baseLow = 64 + (baseOctaveOffset * 12);
    const baseHigh = baseLow + (octaveRange * 12);

    const chordMidi = this.harmonyState.currentChord?.midiNotes;
    const leadT = getEffectiveTension(
      this.sliderState.tension ?? 0.3,
      this.sliderState.leadTensionMode ?? 'follow',
      this.sliderState.leadTensionValue ?? 0,
    );
    const leadChordBias = leadT < 0 ? 0.9 : 0.9 - leadT * 0.4;
    for (let i = 0; i < notesThisPhrase; i++) {
      const timing = rng() * phraseDuration;
      let availableNotes = getScaleNotesInRange(scale, Math.max(24, baseLow), Math.min(108, baseHigh), rootNote);
      if (availableNotes.length === 0) continue;
      const midiNote = pickChordWeightedNote(rng, availableNotes, chordMidi, leadChordBias);
      const frequency = midiToFreq(midiNote);
      const velocity = rngFloat(rng, 0.5, 0.9); // Per-note loudness + timbre; per-lead mix level still lives on lead1LevelGain
      const timeoutId = window.setTimeout(() => {
        const idx = this.leadNoteTimeouts.indexOf(timeoutId);
        if (idx > -1) this.leadNoteTimeouts.splice(idx, 1);
        if (randomSource === 'lead2') {
          this.playLeadNote(frequency, velocity, 'lead2');
        } else {
          this.playLeadNote(frequency, velocity, 'lead1');
        }
      }, timing);
      this.leadNoteTimeouts.push(timeoutId);
    }

    // Schedule next phrase
    const nowWallSec = Date.now() / 1000;
    const phraseSeconds = getPhraseDurationForClockSource(
      this.sliderState,
      this.sliderState.leadRandomClockSource ?? 'globalPhrase',
    );
    const timeUntilNextPhrase = getTimeUntilNextBoundaryWall(
      this.sliderState.leadRandomClockSource ?? 'globalPhrase',
      phraseSeconds,
      anchors,
      nowWallSec,
    ) * 1000;
    this.leadMelodyTimer = window.setTimeout(() => {
      this.scheduleLeadMelody();
    }, timeUntilNextPhrase);
  }

  /**
   * Start or restart random lead melody scheduling (phrase-based)
   */
  private startLeadMelody(deferToBoundary = false): void {
    if (this.leadMelodyTimer !== null) {
      clearTimeout(this.leadMelodyTimer);
      this.leadMelodyTimer = null;
    }
    for (const timeout of this.leadNoteTimeouts) clearTimeout(timeout);
    this.leadNoteTimeouts = [];

    if (this.sliderState?.leadRandomEnabled && this.isLeadRandomSourceEnabled(this.sliderState)) {
      if (deferToBoundary && this.sliderState) {
        const anchors = this.ensureTransportAnchors();
        const nowWallSec = Date.now() / 1000;
        const phraseSeconds = getPhraseDurationForClockSource(
          this.sliderState,
          this.sliderState.leadRandomClockSource ?? 'globalPhrase',
        );
        const delayMs = getTimeUntilNextBoundaryWall(
          this.sliderState.leadRandomClockSource ?? 'globalPhrase',
          phraseSeconds,
          anchors,
          nowWallSec,
        ) * 1000;
        this.leadMelodyTimer = window.setTimeout(() => {
          this.scheduleLeadMelody();
        }, delayMs);
      } else {
        this.scheduleLeadMelody();
      }
    }
  }

  /**
   * Ensure AudioContext, master output, and lead audio chain exist for independent operation.
   * Similar to ensureDrumSynth() — allows lead Euclidean to run without master engine start.
   */
  private ensureSynthChain(): void {
    if (this.ctx?.state === 'closed') {
      this.resetIndependentSynthContextState();
      this.ctx = null;
      this.graphBootstrapped = false;
      this.transportAnchors = null;
    }

    // Create AudioContext if needed
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const isIOSDevice = isIOSLikeDevice();
      this.ctx = new AudioContextClass(isIOSDevice ? { latencyHint: 'playback' } : undefined);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    // Create master output chain if needed
    if (!this.masterGain) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = (this.sliderState?.masterVolume ?? DEFAULT_MASTER_VOLUME) * MASTER_OUTPUT_TRIM;
      this.limiter = this.createMasterLimiter(this.ctx);
      this.wireMasterOutputChain(this.ctx);
      this.limiter.connect(this.ctx.destination);
    }
    // Dummy reverb node if real reverb not created yet
    if (!this.reverbNode) {
      const fallbackReverb = this.ctx.createGain();
      fallbackReverb.gain.value = 0;
      this.reverbNode = fallbackReverb as any;
    }
    // Create RNG if needed
    if (!this.rng) {
      const bucket = getUtcBucket(this.sliderState?.seedWindow as 'hour' | 'day' || 'hour');
      const seed = computeSeed(bucket, JSON.stringify(this.sliderState));
      this.rng = createRng(String(seed));
    }
    // Create harmony state if needed (for scale/note selection)
    if (!this.harmonyState && this.sliderState) {
      this.ensureTransportAnchors();
      this.currentBucket = getUtcBucket(this.sliderState.seedWindow);
      this.currentSeed = computeGranularRuntimeSeed(this.currentBucket);
      const effectiveHarmonyPhraseSeconds = this.getEffectiveHarmonyPhraseSeconds(this.sliderState);
      this.harmonyState = createHarmonyState(
        `${this.currentBucket}|${this.sliderStateJson}|E_ROOT`,
        this.sliderState.tension,
        chordIntervalSecondsFromState(this.sliderState.chordRate, effectiveHarmonyPhraseSeconds),
        this.sliderState.voicingSpread,
        this.sliderState.detune,
        this.sliderState.scaleMode,
        this.sliderState.manualScale,
        this.sliderState.rootNote ?? 4,
        effectiveHarmonyPhraseSeconds,
        this.getHarmonyParams()
      );
      // Independent sequencer/manual-audition startup does not pass through
      // initializeHarmony(), so publish the newly-created preview state here.
      // This keeps stopped UI harmony context intact after the independent
      // transport is stopped without booting the full master graph.
      this.notifyStateChange();
    }
    // Create lead audio chain if not exists
    if (!this.leadGain) {
      const ctx = this.ctx;
      this.leadGain = ctx.createGain();
      const leadActive = !!this.sliderState && (this.isLead1RouteActive(this.sliderState) || this.isLead2RouteActive(this.sliderState));
      this.leadGain.gain.value = leadActive ? 1.0 : 0;
      this.leadFilter = ctx.createBiquadFilter();
      this.leadFilter.type = 'lowpass';
      this.leadFilter.frequency.value = 4000;
      this.leadFilter.Q.value = 0.7;
      this.leadDry = ctx.createGain();
      this.leadDry.gain.value = leadActive ? 1.0 : 0;
      this.ensureDiffuseBus(ctx);
      // Connect lead signal path (pre-fader reverb: leadLevel is the shared master, leadVoiceLevel provides final trim)
      this.leadVoiceLevel = ctx.createGain();
      this.leadVoiceLevel.gain.value = ENGINE_TRIMS.lead;
      this.leadVoiceLevel.connect(this.leadDry);
      this.leadDry.connect(this.masterGain);

      // Create lead split buses for separate granular tapping + per-lead reverb sends
      if (!this.lead1Bus) {
        this.lead1Bus = ctx.createGain();
        this.lead1Bus.gain.value = 1.0;
      }
      if (!this.lead1LevelGain) {
        this.lead1LevelGain = ctx.createGain();
        this.lead1LevelGain.gain.value = this.sliderState?.lead1Level ?? 0.8;
      }
      this.lead1SpatialChain = this.createVoiceSpatialChain(ctx, {
        initialPostLpf: this.getLeadPostLpfCutoff(this.sliderState!, 'lead1'),
        initialStereoWidth: applyDistanceValue('lead1StereoWidth', this.sliderState!, 'lead1'),
        initialDiffuseSend: applyDistanceValue('lead1DiffuseSend', this.sliderState!, 'lead1'),
        dryDestination: this.getSidechainTargetInput(ctx, 'lead1', this.leadVoiceLevel!),
        postLpfSlope: 24,
      });
      this.lead1Bus.connect(this.lead1LevelGain);
      this.lead1LevelGain.connect(this.lead1SpatialChain!.postLpf);
      if (!this.lead2Bus) {
        this.lead2Bus = ctx.createGain();
        this.lead2Bus.gain.value = 1.0;
      }
      if (!this.lead2LevelGain) {
        this.lead2LevelGain = ctx.createGain();
        this.lead2LevelGain.gain.value = this.sliderState?.lead2Level ?? 0.6;
      }
      this.lead2SpatialChain = this.createVoiceSpatialChain(ctx, {
        initialPostLpf: this.getLeadPostLpfCutoff(this.sliderState!, 'lead2'),
        initialStereoWidth: applyDistanceValue('lead2StereoWidth', this.sliderState!, 'lead2'),
        initialDiffuseSend: applyDistanceValue('lead2DiffuseSend', this.sliderState!, 'lead2'),
        dryDestination: this.getSidechainTargetInput(ctx, 'lead2', this.leadVoiceLevel!),
        postLpfSlope: 24,
      });
      this.lead2Bus.connect(this.lead2LevelGain);
      this.lead2LevelGain.connect(this.lead2SpatialChain!.postLpf);
      // Per-lead reverb sends (bus → send → reverb)
      const reverbDestination = this.getReverbSendDestination();
      this.lead1ReverbSend = ctx.createGain();
      this.lead1ReverbSend.gain.value = this.sliderState?.lead1ReverbSend ?? 0.5;
      this.lead1Bus.connect(this.lead1ReverbSend);
      if (reverbDestination) this.lead1ReverbSend.connect(reverbDestination);
      this.lead2ReverbSend = ctx.createGain();
      this.lead2ReverbSend.gain.value = this.sliderState?.lead2ReverbSend ?? 0.5;
      this.lead2Bus.connect(this.lead2ReverbSend);
      if (reverbDestination) this.lead2ReverbSend.connect(reverbDestination);
      this.ensureLeadDelaySends(ctx);

      // WASM lead connections (if WASM node exists, per-lead output routing)
      if (this.leadFmWasmNode) {
        // Lead 1 dry: output[0] → level gain → post chain → lead dry output
        this.leadWasmLevelGain = ctx.createGain();
        this.leadWasmLevelGain.gain.value = this.sliderState?.lead1Level ?? 0.8;
        this.leadFmWasmNode.connect(this.leadWasmLevelGain, 0);
        this.leadWasmLevelGain.connect(this.lead1SpatialChain!.postLpf);
        // Lead 1 pre-fader sends
        this.leadFmWasmNode.connect(this.lead1ReverbSend, 0);
        if (this.granularLead1Send) {
          this.leadFmWasmNode.connect(this.granularLead1Send, 0);
        }
        if (this.lead1DelayASend) {
          this.leadFmWasmNode.connect(this.lead1DelayASend, 0);
        }
        if (this.lead1DelayBSend) {
          this.leadFmWasmNode.connect(this.lead1DelayBSend, 0);
        }

        // Lead 2 dry: output[1] → level gain → post chain → lead dry output
        this.leadWasmLead2LevelGain = ctx.createGain();
        this.leadWasmLead2LevelGain.gain.value = this.sliderState?.lead2Level ?? 0.6;
        this.leadFmWasmNode.connect(this.leadWasmLead2LevelGain, 1);
        this.leadWasmLead2LevelGain.connect(this.lead2SpatialChain!.postLpf);
        // Lead 2 pre-fader sends
        this.leadFmWasmNode.connect(this.lead2ReverbSend, 1);
        if (this.granularLead2Send) {
          this.leadFmWasmNode.connect(this.granularLead2Send, 1);
        }
        if (this.lead2DelayASend) {
          this.leadFmWasmNode.connect(this.lead2DelayASend, 1);
        }
        if (this.lead2DelayBSend) {
          this.leadFmWasmNode.connect(this.lead2DelayBSend, 1);
        }
      }
    }

    if (!this.pianoBus) {
      const ctx = this.ctx;
      this.pianoBus = ctx.createGain();
      this.pianoBus.gain.value = 1.0;
      this.pianoLevelGain = ctx.createGain();
      this.pianoLevelGain.gain.value = (this.sliderState?.pianoLevel ?? 0.75) * ENGINE_TRIMS.piano;
      this.ensureDiffuseBus(ctx);
      this.pianoSpatialChain = this.createVoiceSpatialChain(ctx, {
        initialPostLpf: applyDistanceValue('pianoPostLPF', this.sliderState!, 'piano'),
        initialStereoWidth: applyDistanceValue('pianoStereoWidth', this.sliderState!, 'piano'),
        initialDiffuseSend: applyDistanceValue('pianoDiffuseSend', this.sliderState!, 'piano'),
        dryDestination: this.getSidechainTargetInput(ctx, 'piano', this.masterGain!),
        postLpfSlope: 24,
      });
      this.pianoBus.connect(this.pianoLevelGain);
      this.pianoLevelGain.connect(this.pianoSpatialChain!.postLpf);
      this.pianoReverbSend = ctx.createGain();
      this.pianoReverbSend.gain.value = this.sliderState?.pianoReverbSend ?? 0.35;
      const reverbDestination = this.getReverbSendDestination();
      if (reverbDestination) {
        this.pianoBus.connect(this.pianoReverbSend);
        this.pianoReverbSend.connect(reverbDestination);
      }
      this.ensurePianoDelaySends(ctx);
      if (this.granularPianoSend && this.granularFxInputGain) {
        this.pianoBus.connect(this.granularPianoSend);
        this.granularPianoSend.connect(this.granularFxInputGain);
      }
    }

    // Create pad synth voice chain if not exists (for independent pad voice triggering)
    if (!this.synthBus && this.ctx && this.masterGain) {
      const ctx = this.ctx;
      this.synthBus = ctx.createGain();
      this.dryBus = ctx.createGain();
      this.dryBus.gain.value = 1.0;
      this.pad1ReverbSend = ctx.createGain();
      this.pad1ReverbSend.gain.value = this.sliderState?.pad1ReverbSend ?? 0.7;
      this.pad2ReverbSend = ctx.createGain();
      this.pad2ReverbSend.gain.value = this.sliderState?.pad2ReverbSend ?? 0.7;
      this.synthDirect = ctx.createGain();
      this.synthDirect.gain.value = 1.0;  // Level is per-voice via mixerGain
      this.ensureDiffuseBus(ctx);
      // Create pad split buses for separate granular tapping
      if (!this.pad1Bus) {
        this.pad1Bus = ctx.createGain();
        this.pad1Bus.gain.value = 1.0;
      }
      if (!this.pad2Bus) {
        this.pad2Bus = ctx.createGain();
        this.pad2Bus.gain.value = 1.0;
      }
      this.pad1SpatialChain = this.createVoiceSpatialChain(ctx, {
        initialPostLpf: applyDistanceValue('padPostLPF', this.sliderState!, 'pad1'),
        initialStereoWidth: applyDistanceValue('padStereoWidth', this.sliderState!, 'pad1'),
        initialDiffuseSend: applyDistanceValue('padDiffuseSend', this.sliderState!, 'pad1'),
        dryDestination: this.getSidechainTargetInput(ctx, 'pad1', this.synthBus!),
        postLpfSlope: 24,
      });
      this.pad2SpatialChain = this.createVoiceSpatialChain(ctx, {
        initialPostLpf: applyDistanceValue('pad2PostLPF', this.sliderState!, 'pad2'),
        initialStereoWidth: applyDistanceValue('pad2StereoWidth', this.sliderState!, 'pad2'),
        initialDiffuseSend: applyDistanceValue('pad2DiffuseSend', this.sliderState!, 'pad2'),
        dryDestination: this.getSidechainTargetInput(ctx, 'pad2', this.synthBus!),
        postLpfSlope: 24,
      });
      this.pad1Bus.connect(this.pad1SpatialChain!.postLpf);
      this.pad2Bus.connect(this.pad2SpatialChain!.postLpf);
      if (!this.pad1PreFaderBus) {
        this.pad1PreFaderBus = ctx.createGain();
        this.pad1PreFaderBus.gain.value = 1.0;
      }
      if (!this.pad2PreFaderBus) {
        this.pad2PreFaderBus = ctx.createGain();
        this.pad2PreFaderBus.gain.value = 1.0;
      }
      // Connect: synthBus → dryBus → synthDirect → masterGain (skip granular for independent mode)
      this.synthBus.connect(this.dryBus);
      // Pre-fader reverb sends: tap from per-pad buses (independent of pad level)
      if (this.pad1PreFaderBus && this.pad1ReverbSend) this.pad1PreFaderBus.connect(this.pad1ReverbSend);
      if (this.pad2PreFaderBus && this.pad2ReverbSend) this.pad2PreFaderBus.connect(this.pad2ReverbSend);
      this.dryBus.connect(this.synthDirect);
      const reverbDestination = this.getReverbSendDestination();
      if (reverbDestination) {
        this.pad1ReverbSend?.connect(reverbDestination);
        this.pad2ReverbSend?.connect(reverbDestination);
      }
      this.synthDirect.connect(this.masterGain);
    }

    // Pad note generation is WASM-only; keep the legacy JS voice graph uncreated.
  }

  /**
   * Start continuous lead Euclidean scheduler (look-ahead pattern, like drum sequencer).
   * Runs independently of master engine start/stop.
   */
  private startSynthEuclidScheduler(): void {
    if (this.synthEuclidScheduleTimer || this.synthEuclidStarting) return; // Already running or booting

    this.synthEuclidStarting = true;
    void (async () => {
      try {
        this.ensureSynthChain();

        if (this.ctx?.state === 'suspended') {
          try {
            await this.ctx.resume();
          } catch (e) {
            console.warn('Synth Euclid context resume failed:', e);
          }
        }
        this.attachAudioContextMonitoring();
        this.unlockAudioContext();

        const usesSynthVoices = !!this.sliderState && [
          this.sliderState.synthEuclid1Enabled && this.sliderState.synthEuclid1Source.startsWith('synth'),
          this.sliderState.synthEuclid2Enabled && this.sliderState.synthEuclid2Source.startsWith('synth'),
          this.sliderState.synthEuclid3Enabled && this.sliderState.synthEuclid3Source.startsWith('synth'),
          this.sliderState.synthEuclid4Enabled && this.sliderState.synthEuclid4Source.startsWith('synth'),
        ].some(Boolean);
        if (usesSynthVoices) {
          await this.ensurePadWasmForIndependentSynth();
        }

        if (!this.ctx || !this.sliderState || !this.sliderState.synthEuclideanMasterEnabled || this.synthEuclidScheduleTimer || !this.synthEuclidStarting) {
          return;
        }

        // Reset step positions
        this.synthEuclidCurrentStep = [0, 0, 0, 0];
        this.synthEuclidHitCounts = [0, 0, 0, 0];
        this.clearSynthEuclidVisualTimers(true);
        this.synthEuclidStepIndex = [0, 0, 0, 0];
        this.synthEuclidTotalStepCounts = [0, 0, 0, 0];
        this.resetSynthEuclidEvolveBarCounters();

        this.synthEuclidNextStepTime = [0, 0, 0, 0];
        this.prevSynthEuclidLaneEnabled = [false, false, false, false];
        resetSequencerResumeRuntimeState(this.synthResumeRuntime);
        this.ensureTransportAnchors();

        const scheduleSynthEuclid = () => {
          try {
            if (!this.ctx || !this.sliderState || !this.sliderState.synthEuclideanMasterEnabled) {
              this.stopSynthEuclidScheduler();
              return;
            }

            const now = this.ctx.currentTime;
            const nowWallSec = Date.now() / 1000;
            const anchors = this.ensureTransportAnchors();
            const lookAhead = 0.1; // 100ms look-ahead
            const scheduleUntil = now + lookAhead;

            const timeJumpThreshold = 0.5;

            const baseBPM = getSharedSequencerBpm(this.sliderState);
            const tempo = this.sliderState.synthEuclideanTempo ?? 1;
            const beatDuration = 60 / (baseBPM * tempo); // Base beat duration, scaled by tempo multiplier

            const clockDivToSec = (clockDiv: ClockDivision) => clockDivToSeconds(clockDiv, beatDuration);

            const scale = this.harmonyState?.scaleFamily;
            const rootNote = this.effectiveRoot;
            const rng = this.rng;
            if (!rng) {
              this.synthEuclidScheduleTimer = window.setTimeout(scheduleSynthEuclid, 50);
              return;
            }

            // Read lane params fresh each tick (so changes take effect seamlessly)
            const laneParams = [
              { enabled: true, muted: resolveSequencerLaneAudibility(this.sliderState, 'synth', 1).muted, preset: this.sliderState.synthEuclid1Preset, steps: this.sliderState.synthEuclid1Steps, hits: this.sliderState.synthEuclid1Hits, rotation: this.sliderState.synthEuclid1Rotation, noteMin: this.sliderState.synthEuclid1NoteMin, noteMax: this.sliderState.synthEuclid1NoteMax, level: this.sliderState.synthEuclid1Level, probability: this.sliderState.synthEuclid1Probability ?? 1.0, source: (this.sliderState.synthEuclid1Source ?? 'lead') as string },
              { enabled: true, muted: resolveSequencerLaneAudibility(this.sliderState, 'synth', 2).muted, preset: this.sliderState.synthEuclid2Preset, steps: this.sliderState.synthEuclid2Steps, hits: this.sliderState.synthEuclid2Hits, rotation: this.sliderState.synthEuclid2Rotation, noteMin: this.sliderState.synthEuclid2NoteMin, noteMax: this.sliderState.synthEuclid2NoteMax, level: this.sliderState.synthEuclid2Level, probability: this.sliderState.synthEuclid2Probability ?? 1.0, source: (this.sliderState.synthEuclid2Source ?? 'lead') as string },
              { enabled: true, muted: resolveSequencerLaneAudibility(this.sliderState, 'synth', 3).muted, preset: this.sliderState.synthEuclid3Preset, steps: this.sliderState.synthEuclid3Steps, hits: this.sliderState.synthEuclid3Hits, rotation: this.sliderState.synthEuclid3Rotation, noteMin: this.sliderState.synthEuclid3NoteMin, noteMax: this.sliderState.synthEuclid3NoteMax, level: this.sliderState.synthEuclid3Level, probability: this.sliderState.synthEuclid3Probability ?? 1.0, source: (this.sliderState.synthEuclid3Source ?? 'lead') as string },
              { enabled: true, muted: resolveSequencerLaneAudibility(this.sliderState, 'synth', 4).muted, preset: this.sliderState.synthEuclid4Preset, steps: this.sliderState.synthEuclid4Steps, hits: this.sliderState.synthEuclid4Hits, rotation: this.sliderState.synthEuclid4Rotation, noteMin: this.sliderState.synthEuclid4NoteMin, noteMax: this.sliderState.synthEuclid4NoteMax, level: this.sliderState.synthEuclid4Level, probability: this.sliderState.synthEuclid4Probability ?? 1.0, source: (this.sliderState.synthEuclid4Source ?? 'lead') as string },
            ] as const;

        for (const laneIndex of SYNTH_LANE_INDICES) {
          const lane = laneParams[laneIndex];
          const wasEnabled = this.prevSynthEuclidLaneEnabled[laneIndex];
          const justEnabled = lane.enabled && !wasEnabled;
          // Resolve pattern params
          let steps: number, hits: number, rotation: number;
          if (lane.preset === 'custom') {
            steps = lane.steps; hits = lane.hits; rotation = lane.rotation;
          } else {
            const preset = this.EUCLIDEAN_PRESETS[lane.preset] ?? this.EUCLIDEAN_PRESETS.lancaran!;
            steps = preset.steps; hits = preset.hits;
            rotation = (preset.rotation + lane.rotation) % steps;
          }

          // Generate pattern (recalculated each tick so changes are seamless)
          const basePattern = seqEuclidean(steps, hits, rotation);
          const toggleMap = this.synthStepOverrides.triggerToggles[laneIndex];
          const pattern = toggleMap && toggleMap.size > 0
            ? basePattern.map((hit, i) => toggleMap.has(i) ? toggleMap.get(i)! : hit)
            : basePattern;

          // Sub-lane overrides (direction state read once — stable across steps)
          const ov = this.synthStepOverrides;

          // Ensure trig condition counters are initialized for this lane
          if (this.synthTrigConditionCounters[laneIndex].length < steps) {
            this.synthTrigConditionCounters[laneIndex] = new Array(steps).fill(0);
          }

          const laneClockDiv = this.synthEuclidClockDivs[laneIndex] ?? '1/8';
          const laneStepDuration = clockDivToSec(laneClockDiv);
          const laneClockSource = this.sliderState.synthEuclidClockSource ?? 'localBeat';
          const joinPolicy = this.sliderState.synthEuclidJoinPolicy ?? 'bar';
          const isMutedAt = updateSequencerResumeRuntimeLane({
            state: this.synthResumeRuntime,
            laneIndex,
            requestedMuted: lane.muted,
            policy: sequencerResumeQuantizationForLane(this.sliderState, 'synth', laneIndex + 1),
            now,
            nextBoundaryTime: (policy) => policy === 'nextBar'
              ? getNextBarBoundaryCtxTime(laneClockSource, this.sliderState!, anchors, nowWallSec, now)
              : getNextBeatGridCtxTime(
                laneClockSource,
                60 / Math.max(1, getEffectiveSequencerBpm(this.sliderState!)),
                anchors,
                nowWallSec,
                now,
              ),
          });
          if (justEnabled && joinPolicy === 'bar') {
            this.synthEuclidCurrentStep[laneIndex] = 0;
            this.synthEuclidHitCounts[laneIndex] = 0;
            this.synthEuclidStepIndex[laneIndex] = 0;
            this.synthEuclidTotalStepCounts[laneIndex] = 0;
            this.synthTrigConditionCounters[laneIndex] = [];
            this.synthEuclidNextStepTime[laneIndex] = getNextBarBoundaryCtxTime(
              laneClockSource,
              this.sliderState,
              anchors,
              nowWallSec,
              now,
            );
          } else if (justEnabled || this.synthEuclidNextStepTime[laneIndex] <= 0 || now - this.synthEuclidNextStepTime[laneIndex] > timeJumpThreshold) {
            this.synthEuclidNextStepTime[laneIndex] = getNextBeatGridCtxTime(
              laneClockSource,
              laneStepDuration,
              anchors,
              nowWallSec,
              now,
            );
          }

          // Advance while within look-ahead window
          while (this.synthEuclidNextStepTime[laneIndex] < scheduleUntil) {
            const stepInPattern = this.synthEuclidStepIndex[laneIndex] % steps;
            const laneSwing = this.synthEuclidSwings[laneIndex] ?? 0;
            const swingOffset = (this.synthEuclidStepIndex[laneIndex] % 2 === 1) ? laneStepDuration * laneSwing * 0.5 : 0;
            const scheduleTime = this.synthEuclidNextStepTime[laneIndex] + swingOffset;
            const delayMs = Math.max(0, (scheduleTime - now) * 1000);

            // Update step position for UI (synchronous, like drum sequencer)
            this.synthEuclidCurrentStep[laneIndex] = stepInPattern;

            // Track total steps for bar-boundary detection
            this.synthEuclidTotalStepCounts[laneIndex] += 1;

            // Evolve at bar boundaries (step 0 after at least one full cycle)
            if (stepInPattern === 0 && this.synthEuclidTotalStepCounts[laneIndex] > 1) {
              const bar = Math.floor(this.synthEuclidTotalStepCounts[laneIndex] / steps);
              const evolveConfig = this.synthEvolveConfigs[laneIndex];
              if (evolveConfig?.enabled) {
                // Use pad tension when lane source is a pad voice, synth tension otherwise
                const isPadSource = lane.source.startsWith('synth');
                const evolveTension = isPadSource
                  ? getEffectiveTension(
                      this.sliderState!.tension ?? 0.3,
                      this.sliderState!.padTensionMode ?? 'follow',
                      this.sliderState!.padTensionValue ?? 0,
                    )
                  : getEffectiveTension(
                      this.sliderState!.tension ?? 0.3,
                      this.sliderState!.synthEuclidTensionMode ?? 'follow',
                      this.sliderState!.synthEuclidTensionValue ?? 0,
                    );
                const laneOv = this.extractSynthLaneOverrides(laneIndex);
                // Convert pitch from absolute MIDI → relative offsets for evolve
                const ps = this.synthPitchSettings[laneIndex];
                if (laneOv.pitch && ps && ps.mode !== 'noteRange') {
                  laneOv.pitch = this.midiToOffsets(laneOv.pitch, ps);
                }
                const si = ps?.mode === 'semitones' ? (SCALES[ps.scale] || [0, 2, 4, 5, 7, 9, 11]) : undefined;
                // Pass current noteRange bounds (from override or sliderState) for noteRange mode evolution
                const nrOverride = this.synthNoteRangeOverrides[laneIndex];
                const currentNoteMin = nrOverride ? nrOverride.min : lane.noteMin;
                const currentNoteMax = nrOverride ? nrOverride.max : lane.noteMax;
                // Filter evolve's enabledSubLanes by the UI sub-lane enabled state
                const uiEnabled = this.synthSubLaneEnabled[laneIndex] ?? {};
                const evolveEnabledSubs = (evolveConfig.enabledSubLanes ?? ['pitch', 'expression', 'morph', 'distance', 'probability', 'ratchet'])
                  .filter(sl => (
                    sl === 'probability' || sl === 'ratchet' || uiEnabled[sl] === true
                  ) && (sl !== 'ratchet' || (uiEnabled.expression === true && uiEnabled.ratchet !== false)));
                if (!this.synthEvolveStates[laneIndex].homePitchSettings && ps) this.synthEvolveStates[laneIndex].homePitchSettings = { ...ps };
                const result = evolveSynthLane(
                  laneOv,
                  { ...evolveConfig, enabledSubLanes: evolveEnabledSubs },
                  this.synthEvolveStates[laneIndex],
                  bar,
                  rng,
                  { effectiveTension: Math.max(0, evolveTension), swing: this.synthEuclidSwings[laneIndex], steps, scaleIntervals: si, pitchMode: ps?.mode, noteRangeMin: currentNoteMin, noteRangeMax: currentNoteMax },
                );
                if (result.changed) {
                  // Convert pitch from relative offsets → absolute MIDI for engine storage/scheduling
                  const offsetOverrides = result.overrides;
                  const midiOverrides: SynthLaneOverrides = { ...offsetOverrides };
                  if (offsetOverrides.pitch && ps && ps.mode !== 'noteRange') {
                    midiOverrides.pitch = this.offsetsToMidi(offsetOverrides.pitch, ps);
                  }
                  this.applySynthLaneOverrides(laneIndex, midiOverrides);
                  this.synthEuclidSwings[laneIndex] = result.swing;
                  this.onSynthEvolveTrigger?.(laneIndex);
                  // Push evolved overrides back to UI as offsets (no reverse conversion needed)
                  const subLaneStates = synthEvolvedSubLaneStatePatch(offsetOverrides);
                  this.onSynthEvolveOverridesChanged?.(laneIndex, {
                    ...offsetOverrides,
                    swing: result.swing,
                    ...(Object.keys(subLaneStates).length > 0 ? { subLaneStates } : {}),
                  });
                  // Handle noteRange evolution: store overrides and notify UI
                  if (result.noteRangeMin !== undefined && result.noteRangeMax !== undefined) {
                    this.synthNoteRangeOverrides[laneIndex] = { min: result.noteRangeMin, max: result.noteRangeMax };
                    this.onSynthNoteRangeEvolved?.(laneIndex, result.noteRangeMin, result.noteRangeMax);
                  }
                }
              }
            }

            if (pattern[stepInPattern]) {
              // Read sub-lane arrays fresh each step (so evolve changes take effect immediately)
              // Gate on per-lane enabled state — disabled sub-lanes are treated as absent
              const slEnabled = this.synthSubLaneEnabled[laneIndex] ?? {};
              const pitchOffsets = slEnabled.pitch === true ? ov.pitch[laneIndex] : null;
              const pitchDir = ov.pitchDirection[laneIndex] ?? 'forward';
              const pitchSteps = pitchOffsets?.length ?? 0;
              const exprArr = slEnabled.expression === true ? ov.expression[laneIndex] : null;
              const exprRange = slEnabled.expression === true ? ov.expressionRanges[laneIndex] : null;
              const exprDir = ov.expressionDirection[laneIndex] ?? 'forward';
              const exprSteps = exprArr?.length ?? 0;
              const morphArr = slEnabled.morph === true ? ov.morph[laneIndex] : null;
              const morphRange = slEnabled.morph === true ? ov.morphRanges[laneIndex] : null;
              const morphDir = ov.morphDirection[laneIndex] ?? 'forward';
              const morphSteps = morphArr?.length ?? 0;
              const distanceArr = slEnabled.distance === true ? ov.distance[laneIndex] : null;
              const distanceRange = slEnabled.distance === true ? ov.distanceRanges[laneIndex] : null;
              const distanceDir = ov.distanceDirection[laneIndex] ?? 'forward';
              const distanceSteps = distanceArr?.length ?? 0;
              const probArr = ov.probability[laneIndex];
              const ratchetArr = slEnabled.expression === true && slEnabled.ratchet !== false ? ov.ratchet[laneIndex] : null;
              const trigCondArr = ov.trigCondition[laneIndex];

              // Synchronously increment hit count for sub-lane accuracy
              this.synthEuclidHitCounts[laneIndex]++;

              // Trig condition gate (Elektron-style n:N)
              const tc: [number, number] = (trigCondArr && trigCondArr[stepInPattern]) ? trigCondArr[stepInPattern] : [1, 1];
              this.synthTrigConditionCounters[laneIndex][stepInPattern] =
                (this.synthTrigConditionCounters[laneIndex][stepInPattern] ?? 0) + 1;
              const visitCount = this.synthTrigConditionCounters[laneIndex][stepInPattern] ?? 0;
              const trigCondPassed = tc[1] <= 1 || (((visitCount - 1) % tc[1]) + 1 === tc[0]);

              // Per-step probability (from sub-lane, multiplied with lane probability)
              const stepProb = Math.max(0, Math.min(1, probArr ? (probArr[stepInPattern] ?? 1) : 1));

              if (trigCondPassed && rng() <= lane.probability * stepProb) {
                // Note selection via pitch sub-lane
                let midiNote: number | undefined;
                let pitchIdx: number | null = null;
                if (pitchOffsets && pitchSteps > 0) {
                  const pitchBindingMode = this.synthPitchBindingModes[laneIndex] ?? 'polyrhythmic';
                  pitchIdx = pitchBindingMode === 'sequence'
                    ? seqLaneIndex(
                        { enabled: true, steps: pitchSteps, direction: pitchDir, _ppForward: true },
                        stepInPattern
                      )
                    : seqLaneIndex(
                        { enabled: true, steps: pitchSteps, direction: pitchDir, _ppForward: true },
                        this.synthEuclidHitCounts[laneIndex] - 1
                  );
                  // pitchOffsets are pre-converted to absolute MIDI notes by SynthPage
                  // Use the MIDI note directly — no noteMin/Max clamp (user chose these notes explicitly)
                  const pitchValue = pitchOffsets[pitchIdx];
                  if (typeof pitchValue === 'number' && Number.isFinite(pitchValue) && pitchValue >= 0) {
                    midiNote = Math.max(24, Math.min(108, pitchValue));
                  }
                } else if (scale) {
                  // Use evolved noteRange overrides if available, else fall back to lane params
                  const nrOv = this.synthNoteRangeOverrides[laneIndex];
                  const effNoteMin = nrOv ? nrOv.min : lane.noteMin;
                  const effNoteMax = nrOv ? nrOv.max : lane.noteMax;
                  const pitchSettings = this.synthPitchSettings[laneIndex];
                  const rangeScale = pitchSettings && pitchSettings.scale !== 'Harmony'
                    ? {
                        name: pitchSettings.scale,
                        intervals: SCALES[pitchSettings.scale] || SCALES.Major,
                        tensionLevel: 'consonant' as const,
                        tensionValue: 0,
                      }
                    : scale;
                  const rangeRoot = pitchSettings && pitchSettings.scale !== 'Harmony'
                    ? ((Math.round(pitchSettings.root) % 12) + 12) % 12
                    : rootNote;
                  let availableNotes = getScaleNotesInRange(rangeScale, Math.max(24, effNoteMin), Math.min(108, effNoteMax), rangeRoot);
                  if (availableNotes.length === 0) {
                    const midPoint = (effNoteMin + effNoteMax) / 2;
                    const allScaleNotes = getScaleNotesInRange(rangeScale, 24, 108, rangeRoot);
                    if (allScaleNotes.length > 0) {
                      let nearest = allScaleNotes[0] ?? midPoint;
                      let nearestDist = Math.abs((allScaleNotes[0] ?? midPoint) - midPoint);
                      for (const sn of allScaleNotes) {
                        const d = Math.abs(sn - midPoint);
                        if (d < nearestDist) { nearestDist = d; nearest = sn; }
                      }
                      availableNotes = [nearest];
                    }
                  }
                  if (availableNotes.length > 0) {
                    const synthLeadT = getEffectiveTension(
                      this.sliderState!.tension ?? 0.3,
                      this.sliderState!.synthEuclidTensionMode ?? 'follow',
                      this.sliderState!.synthEuclidTensionValue ?? 0,
                    );
                    midiNote = pickChordWeightedNote(rng, availableNotes, this.harmonyState?.currentChord?.midiNotes, 0.9 - (synthLeadT < 0 ? 0 : synthLeadT) * 0.4);
                  }
                }

                const playStepNotes = pitchIdx !== null ? ov.playNotes[laneIndex]?.[pitchIdx] : null;
                const triggerNotes = playStepNotes && playStepNotes.length > 0
                  ? playStepNotes
                  : midiNote !== undefined
                    ? [{ midi: midiNote, offsetMs: 0, velocity: 1, voiceIndex: 0 }]
                    : [];

                if (triggerNotes.length > 0) {

                  // Expression/velocity sub-lane: dynamics × lane level.
                  // This is note velocity (timbre + amplitude), NOT bus gain.
                  // Per-lead mix level lives on lead1LevelGain/lead2LevelGain nodes.
                  let velocity: number;
                  if (exprRange) {
                    velocity = Math.max(0, Math.min(1, exprRange.min + rng() * (exprRange.max - exprRange.min))) * lane.level;
                  } else if (exprArr && exprSteps > 0) {
                    const exprIdx = seqLaneIndex(
                      { enabled: true, steps: exprSteps, direction: exprDir, _ppForward: true },
                      this.synthEuclidHitCounts[laneIndex] - 1
                    );
                    velocity = Math.max(0, Math.min(1, exprArr[exprIdx] ?? 1.0)) * lane.level;
                  } else {
                    velocity = 1.0 * lane.level;
                  }

                  // Morph sub-lane: set temporary override for playLeadNote
                  if (morphRange) {
                    this.synthMorphOverride = morphRange.min + rng() * (morphRange.max - morphRange.min);
                  } else if (morphArr && morphSteps > 0) {
                    const morphIdx = seqLaneIndex(
                      { enabled: true, steps: morphSteps, direction: morphDir, _ppForward: true },
                      this.synthEuclidHitCounts[laneIndex] - 1
                    );
                    this.synthMorphOverride = morphArr[morphIdx % morphSteps] ?? null;
                  } else {
                    this.synthMorphOverride = null;
                  }

                  let distanceValue: number | null = null;
                  if (distanceRange) {
                    distanceValue = distanceRange.min + rng() * (distanceRange.max - distanceRange.min);
                  } else if (distanceArr && distanceSteps > 0) {
                    const distanceIdx = seqLaneIndex(
                      { enabled: true, steps: distanceSteps, direction: distanceDir, _ppForward: true },
                      this.synthEuclidHitCounts[laneIndex] - 1
                    );
                    distanceValue = distanceArr[distanceIdx % distanceSteps] ?? 0;
                  }
                  const capturedDistanceOverride = distanceValue == null
                    ? null
                    : Math.max(0, Math.min(1, distanceValue));

                  const noteSource = lane.source;

                  // Ratchet sub-lane: polyrhythmic — indexed by hit count like expression
                  const ratchetSteps = ratchetArr?.length ?? 0;
                  let ratchetRaw: number | undefined;
                  if (ratchetArr && ratchetSteps > 0) {
                    const ratchetIdx = seqLaneIndex(
                      { enabled: true, steps: ratchetSteps, direction: exprDir, _ppForward: true },
                      this.synthEuclidHitCounts[laneIndex] - 1
                    );
                    ratchetRaw = ratchetArr[ratchetIdx];
                  }
                  const ratchet = clampSequencerRatchet(ratchetRaw);

                  const capturedMorphOverride = this.synthMorphOverride;
                  const ratchetFactor = 1 / ratchet;
                  const ratchetClockDiv = this.synthEuclidClockDivs[laneIndex] ?? '1/8';
                  const ratchetStepDuration = clockDivToSec(ratchetClockDiv);
                  const ratchetWindow = ratchetStepDuration / ratchet;

                  for (let r = 0; r < ratchet; r++) {
                    const ratchetDelayMs = delayMs + r * ratchetWindow * 1000;
                    if (isMutedAt(now + ratchetDelayMs / 1000)) continue;
                    for (const note of triggerNotes) {
                      const frequency = midiToFreq(note.midi);
                      const noteVelocity = Math.max(0, Math.min(1, velocity * note.velocity));
                      const rDelayMs = ratchetDelayMs + note.offsetMs;
                      const ratchetTimerId = window.setTimeout(() => {
                        this.ratchetTimers.delete(ratchetTimerId);
                        this.synthMorphOverride = capturedMorphOverride;
                        this.synthRatchetFactor = ratchetFactor;
                        if (noteSource === 'lead' || noteSource === 'lead1') {
                          this.playLeadNote(frequency, noteVelocity, 'lead1', capturedDistanceOverride);
                        } else if (noteSource === 'lead2') {
                          this.playLeadNote(frequency, noteVelocity, 'lead2', capturedDistanceOverride);
                        } else if (noteSource === 'piano') {
                          this.playPianoNote(frequency, noteVelocity, capturedDistanceOverride);
                        } else if (noteSource.startsWith('synth')) {
                          const parsedVoiceIndex = Number.parseInt(noteSource.replace('synth', ''), 10) - 1;
                          const baseVoiceIndex = Number.isFinite(parsedVoiceIndex) ? Math.max(0, parsedVoiceIndex) : 0;
                          const voiceCount = Math.max(1, this.voices.length);
                          const voiceIndex = triggerNotes.length > 1
                            ? (baseVoiceIndex + note.voiceIndex) % voiceCount
                            : baseVoiceIndex;
                          // Determine if this voice belongs to Pad 2
                          const isPad2 = this.sliderState?.pad2Enabled &&
                            ((this.sliderState?.pad2VoiceAssign ?? 0) & (1 << voiceIndex)) !== 0;
                          const padParamsOverride = this.sliderState
                            ? (this.buildPadTriggerState(
                                isPad2 ? 'pad2' : 'pad1',
                                this.sliderState,
                                capturedMorphOverride,
                                capturedDistanceOverride
                              ) ?? undefined)
                            : undefined;
                          const padTriggerState = padParamsOverride ?? this.sliderState;
                          // Use correct pad's ADSR for ratchet note duration
                          const rAttack = isPad2
                            ? (padTriggerState?.pad2Attack ?? 0.1)
                            : (padTriggerState?.synthAttack ?? 0.1);
                          const rDecay = isPad2
                            ? (padTriggerState?.pad2Decay ?? 0.3)
                            : (padTriggerState?.synthDecay ?? 0.3);
                          const rHold = isPad2
                            ? (padTriggerState?.pad2Hold ?? 1)
                            : (padTriggerState?.synthHold ?? 1);
                          const synthAttack = rAttack * ratchetFactor;
                          const synthDecay = rDecay * ratchetFactor;
                          const noteDuration = synthAttack + synthDecay + Math.max(0, rHold) * ratchetFactor;
                          this.triggerSynthVoice(voiceIndex, frequency, noteVelocity, noteDuration, padParamsOverride);
                        }
                        this.synthMorphOverride = null;
                        this.synthRatchetFactor = 1;
                      }, rDelayMs);
                      this.ratchetTimers.add(ratchetTimerId);
                    }
                  }
                }
              }
            }

            this.queueSynthEuclidVisualStep(
              laneIndex,
              stepInPattern,
              this.synthEuclidHitCounts[laneIndex],
              delayMs,
            );

            // Advance the clock grid without swing. Swing only delays the event
            // scheduled for the current offbeat, matching Product and drums.
            this.synthEuclidStepIndex[laneIndex]++;
            this.synthEuclidNextStepTime[laneIndex] += laneStepDuration;
          }
          this.prevSynthEuclidLaneEnabled[laneIndex] = true;
        }

            // Re-schedule in 50ms
            this.synthEuclidScheduleTimer = window.setTimeout(scheduleSynthEuclid, 50);
          } catch (e) {
            console.error('[Lead Euclid] Scheduler error:', e);
            this.synthEuclidScheduleTimer = window.setTimeout(scheduleSynthEuclid, 100);
          }
        };

        scheduleSynthEuclid();
      } finally {
        this.synthEuclidStarting = false;
      }
    })();
  }

  /**
   * Stop the continuous lead Euclidean scheduler
   */
  private stopSynthEuclidScheduler(): void {
    this.synthEuclidStarting = false; // Cancel any in-flight async startup
    if (this.synthEuclidScheduleTimer) {
      clearTimeout(this.synthEuclidScheduleTimer);
      this.synthEuclidScheduleTimer = null;
    }
    this.clearSynthEuclidVisualTimers(true);
    this.synthMorphOverride = null; // Clear morph sub-lane override so slider control resumes
    this.synthNoteRangeOverrides = [null, null, null, null]; // Clear noteRange overrides so slider control resumes
    this.synthEuclidCurrentStep = [0, 0, 0, 0];
    this.synthEuclidHitCounts = [0, 0, 0, 0];
    this.synthEuclidStepIndex = [0, 0, 0, 0];
    this.synthEuclidTotalStepCounts = [0, 0, 0, 0];
    this.resetSynthEuclidEvolveBarCounters();
    this.synthEuclidNextStepTime = [0, 0, 0, 0];
    this.prevSynthEuclidLaneEnabled = [false, false, false, false];
    resetSequencerResumeRuntimeState(this.synthResumeRuntime);
    this.synthTrigConditionCounters = [[], [], [], []];
    this.onSynthStepPositionChange?.([0, 0, 0, 0], [0, 0, 0, 0]);

    // Clear tracked ratchet and voice release timers (prevent firing after stop)
    for (const t of this.ratchetTimers) clearTimeout(t);
    this.ratchetTimers.clear();
    for (const t of this.voiceReleaseTimers) clearTimeout(t);
    this.voiceReleaseTimers.clear();
    for (let i = 0; i < this.synthVoiceNoteOffTimers.length; i++) {
      const timerId = this.synthVoiceNoteOffTimers[i];
      if (timerId !== null) clearTimeout(timerId);
      this.synthVoiceNoteOffTimers[i] = null;
    }
    // Bump all voice note generations so in-flight WASM noteOff timers are invalidated
    this.synthVoiceNoteGen = this.synthVoiceNoteGen.map(gen => gen + 1) as Hex<number>;

    // Release all active synth voices so they don't drone after sequencer stops
    if (this.ctx) {
      const now = this.ctx.currentTime;
      const release = Math.max(0.001, this.sliderState?.synthRelease ?? 1.0);
      this.voices.forEach((voice) => {
        if (voice.active) {
          voice.envelope.gain.cancelScheduledValues(now);
          voice.envelope.gain.setTargetAtTime(0, now, release / 4);
          voice.active = false;
        }
      });
      this.postPadWasmAllNotesOff();
    }

    // Also reset WASM lead FM so long release tails do not ring after stop.
    if (this.leadFmWasmReady && this.leadFmWasmNode) {
      this.leadFmWasmNode.port.postMessage({ type: 'reset' });
    }

  }

  private startGranularTempoSyncScheduler(): void {
    if (this.granularTempoSyncTimer) return;
    if (!this.ctx || !this.sliderState) return;

    this.granularTempoSyncNextStepTime = [0, 0, 0, 0];

    const scheduleTempoSync = () => {
      try {
        if (!this.ctx || !this.sliderState || !this.hasGranularTempoSyncVoices(this.sliderState)) {
          this.stopGranularTempoSyncScheduler();
          return;
        }

        const nowTime = this.ctx.currentTime;
        const lookAhead = 0.1;
        const scheduleUntil = nowTime + lookAhead;
        const baseBPM = getSharedSequencerBpm(this.sliderState);
        const beatDuration = 60 / baseBPM;

        for (const voiceIndex of SYNTH_LANE_INDICES) {
          if (!this.isGranularTempoSyncVoiceActive(this.sliderState, voiceIndex)) {
            this.granularTempoSyncNextStepTime[voiceIndex] = 0;
            continue;
          }

          const voiceNum = voiceIndex + 1;
          const clockDiv = (this.sliderState[`granularV${voiceNum}TempoDiv` as keyof SliderState] as ClockDivision | undefined) ?? '1/8';
          const stepDuration = clockDivToSeconds(clockDiv, beatDuration);

          if (this.granularTempoSyncNextStepTime[voiceIndex] <= 0 || nowTime - this.granularTempoSyncNextStepTime[voiceIndex] > 0.5) {
            this.granularTempoSyncNextStepTime[voiceIndex] = alignSequencerTime(nowTime, stepDuration);
          }

          while (this.granularTempoSyncNextStepTime[voiceIndex] < scheduleUntil) {
            const scheduleTime = this.granularTempoSyncNextStepTime[voiceIndex];
            const delayMs = Math.max(0, (scheduleTime - nowTime) * 1000);
            const scheduledVoice = voiceIndex;

            window.setTimeout(() => {
              if (this.granularFxNode && this.sliderState && this.isGranularTempoSyncVoiceActive(this.sliderState, scheduledVoice)) {
                this.granularFxNode.port.postMessage({
                  type: 'granularTrigger',
                  voice: scheduledVoice,
                  velocity: 1,
                });
              }
            }, delayMs);

            this.granularTempoSyncNextStepTime[voiceIndex] += stepDuration;
          }
        }

        this.granularTempoSyncTimer = window.setTimeout(scheduleTempoSync, 50);
      } catch (e) {
        console.error('[Granular Tempo Sync] Scheduler error:', e);
        this.granularTempoSyncTimer = window.setTimeout(scheduleTempoSync, 100);
      }
    };

    scheduleTempoSync();
  }

  private stopGranularTempoSyncScheduler(): void {
    if (this.granularTempoSyncTimer) {
      clearTimeout(this.granularTempoSyncTimer);
      this.granularTempoSyncTimer = null;
    }
    this.granularTempoSyncNextStepTime = [0, 0, 0, 0];
  }

  getState(): EngineState {
    return {
      isRunning: this.isRunning,
      harmonyState: this.harmonyState,
      currentSeed: this.currentSeed,
      currentBucket: this.currentBucket,
      currentFilterFreq: this.currentFilterFreq,
      currentLfoValue: this.currentLfoValue,
      currentLfo2Value: this.currentLfo2Value,
      cofCurrentStep: this.harmonyState?.cof.currentStep ?? this.cofConfig.currentStep,
      fxOwners: this.getFxOwnerDebugState(),
      transportDebug: this.getTransportDebugStateInternal(),
    };
  }

  // Recording support - get audio context
  getAudioContext(): AudioContext | null {
    return this.ctx;
  }

  // Recording support - get limiter node (final output before destination)
  getLimiterNode(): DynamicsCompressorNode | null {
    return this.limiter;
  }

  setOutputGain(target: number, durationSeconds = 0): void {
    const ctx = this.ctx;
    const gain = this.outputGain?.gain;
    if (!ctx || !gain) return;
    const now = ctx.currentTime;
    const value = Math.max(0, Math.min(1, Number.isFinite(target) ? target : 1));
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    if (durationSeconds > 0) {
      gain.linearRampToValueAtTime(value, now + Math.max(0.01, durationSeconds));
    } else {
      gain.setValueAtTime(value, now);
    }
  }

  getDynamicsAnalyser(key: DynamicsAnalyserKey): AnalyserNode | null {
    const analyser = this.dynamicsAnalysers[key];
    return analyser && analyser.context === this.ctx ? analyser : null;
  }

  getDynamicsVisualTelemetry(): DynamicsVisualTelemetrySnapshot {
    const contextTime = this.ctx?.currentTime ?? 0;
    this.pruneSidechainVisualEvents(contextTime);
    const reduction = this.endCompCompressor?.reduction;
    const reductionValue = typeof reduction === 'number' ? reduction : 0;
    const nativeReductionDb = Number.isFinite(reductionValue)
      ? Math.max(0, reductionValue < 0 ? -reductionValue : reductionValue)
      : 0;
    const endCompHandledByWorklet = Boolean(
      this.sliderState &&
      resolveDynamicsTargets(this.sliderState, this.ctx?.sampleRate ?? 44100).routing.endChainActive &&
      this.driftProcessorNodeMode === 'worklet',
    );
    return {
      contextTime,
      endCompHandledByWorklet,
      endCompReductionDb: endCompHandledByWorklet
        ? Math.max(0, this.dynamicsWorkletTelemetry?.endReductionDb ?? 0)
        : nativeReductionDb,
      worklet: this.dynamicsWorkletTelemetry,
      sidechainEvents: this.sidechainVisualEvents.slice(),
    };
  }

  // ===== STEM RECORDING SUPPORT =====
  // Routing-level taps expose the same signal each row's Level control affects.
  // Dynamics captures the post-master-dynamics, pre-limiter print.

  private getDynamicsRecordableNode(): AudioNode | null {
    return this.endCompOutputGain ?? this.satPostGain ?? this.driftOutputGain ?? this.masterGain;
  }

  getRecordableBusNodes(): Record<DiagnosticRecordTrackId, RecordableTrackSource> {
    const activeDrumWasmNode = this.drumWasmNode;
    const reverbConditionedSource = this.reverbPreConditionerNode ?? this.reverbPreMakeupGain ?? this.reverbPreCompressor ?? this.reverbInputBus;
    const spectralFreezeInputNode = (this.sliderState?.spectralFreezeRouting ?? 'pre') === 'post'
      ? this.reverbNode
      : reverbConditionedSource;
    return {
      pad1: { node: this.pad1SpatialChain?.output ?? (this.padWasmNode ? this.padWasmNode : this.pad1Bus), outputIndex: this.pad1SpatialChain ? undefined : (this.padWasmNode ? 4 : undefined) },
      pad1Dry: { node: this.pad1SpatialChain?.output ?? (this.padWasmNode ? this.padWasmNode : this.pad1Bus), outputIndex: this.pad1SpatialChain ? undefined : (this.padWasmNode ? 4 : undefined) },
      pad1ReverbSend: { node: this.pad1ReverbSend },
      pad1DelayASend: { node: this.pad1DelayASend },
      pad1DelayBSend: { node: this.pad1DelayBSend },
      pad1GranularSend: { node: this.granularPad1Send },
      pad2: { node: this.pad2SpatialChain?.output ?? (this.padWasmNode ? this.padWasmNode : this.pad2Bus), outputIndex: this.pad2SpatialChain ? undefined : (this.padWasmNode ? 5 : undefined) },
      pad2Dry: { node: this.pad2SpatialChain?.output ?? (this.padWasmNode ? this.padWasmNode : this.pad2Bus), outputIndex: this.pad2SpatialChain ? undefined : (this.padWasmNode ? 5 : undefined) },
      pad2ReverbSend: { node: this.pad2ReverbSend },
      pad2DelayASend: { node: this.pad2DelayASend },
      pad2DelayBSend: { node: this.pad2DelayBSend },
      pad2GranularSend: { node: this.granularPad2Send },
      lead1: { node: this.lead1SpatialChain?.output ?? this.leadWasmLevelGain ?? this.lead1LevelGain },
      lead1Dry: { node: this.lead1SpatialChain?.output ?? this.leadWasmLevelGain ?? this.lead1LevelGain },
      lead1ReverbSend: { node: this.lead1ReverbSend },
      lead1DelayASend: { node: this.lead1DelayASend },
      lead1DelayBSend: { node: this.lead1DelayBSend },
      lead1GranularSend: { node: this.granularLead1Send },
      lead2: { node: this.lead2SpatialChain?.output ?? this.leadWasmLead2LevelGain ?? this.lead2LevelGain },
      lead2Dry: { node: this.lead2SpatialChain?.output ?? this.leadWasmLead2LevelGain ?? this.lead2LevelGain },
      lead2ReverbSend: { node: this.lead2ReverbSend },
      lead2DelayASend: { node: this.lead2DelayASend },
      lead2DelayBSend: { node: this.lead2DelayBSend },
      lead2GranularSend: { node: this.granularLead2Send },
      sample1: { node: null },
      sample2: { node: null },
      pianoDry: { node: this.pianoSpatialChain?.output ?? this.pianoLevelGain },
      pianoReverbSend: { node: this.pianoReverbSend },
      pianoDelayASend: { node: this.pianoDelayASend },
      pianoDelayBSend: { node: this.pianoDelayBSend },
      pianoGranularSend: { node: this.granularPianoSend },
      diffuseInput: { node: this.diffuseInputBus },
      diffuseOutput: { node: this.diffuseOutputGain },
      diffuseDirectOut: { node: this.diffuseOutputGain },
      diffuseOut: { node: this.diffuseOutputGain },
      diffuseReverbSend: { node: this.diffuseReverbSend },
      pad1DiffuseSend: { node: this.pad1SpatialChain?.diffuseSend ?? null },
      padDiffuseSend: { node: this.pad1SpatialChain?.diffuseSend ?? null },
      pad2DiffuseSend: { node: this.pad2SpatialChain?.diffuseSend ?? null },
      lead1DiffuseSend: { node: this.lead1SpatialChain?.diffuseSend ?? null },
      lead2DiffuseSend: { node: this.lead2SpatialChain?.diffuseSend ?? null },
      pianoDiffuseSend: { node: this.pianoSpatialChain?.diffuseSend ?? null },
      drums: activeDrumWasmNode
        ? { node: activeDrumWasmNode, outputIndex: 0 }
        : { node: this.drumSynth?.getMasterGain() ?? null },
      drumDry: activeDrumWasmNode
        ? { node: activeDrumWasmNode, outputIndex: 0 }
        : { node: this.drumSynth?.getMasterGain() ?? null },
      drumReverbSend: activeDrumWasmNode
        ? { node: activeDrumWasmNode, outputIndex: 1 }
        : { node: this.drumSynth?.getReverbSend() ?? null },
      drumDelayASend: { node: this.drumDelayASend },
      drumDelayBSend: { node: this.drumDelayBSend },
      drumGranularSend: { node: this.granularDrumSend },
      granular: { node: this.granularFxDirect },
      pad1Pre: { node: this.padWasmNode ?? this.pad1PreFaderBus, outputIndex: this.padWasmNode ? 2 : undefined },
      reverbFeed: { node: reverbConditionedSource },
      waves: { node: this.oceanLevelGain },
      oceanDry: { node: this.oceanLevelGain },
      wavesDry: { node: this.oceanLevelGain },
      water: { node: this.waterLevelGain },
      waterDry: { node: this.waterLevelGain },
      insects: { node: this.insectsLevelGain },
      insectsDry: { node: this.insectsLevelGain },
      nature: { node: this.natureLevelGain },
      natureDry: { node: this.natureLevelGain },
      oceanReverbSend: { node: this.oceanReverbSendNode },
      wavesReverbSend: { node: this.oceanReverbSendNode },
      oceanDelayASend: { node: this.oceanDelayASend },
      wavesDelayASend: { node: this.oceanDelayASend },
      oceanDelayBSend: { node: this.oceanDelayBSend },
      wavesDelayBSend: { node: this.oceanDelayBSend },
      oceanGranularSend: { node: this.granularWavesSend },
      wavesGranularSend: { node: this.granularWavesSend },
      granularWavesSend: { node: this.granularWavesSend },
      waterReverbSend: { node: this.waterReverbSend },
      waterDelayASend: { node: this.waterDelayASend },
      waterDelayBSend: { node: this.waterDelayBSend },
      waterGranularSend: { node: this.granularWaterSend },
      granularWaterSend: { node: this.granularWaterSend },
      insectsReverbSend: { node: this.insectsReverbSendNode },
      insectsDelayASend: { node: this.insectsDelayASend },
      insDelayASend: { node: this.insectsDelayASend },
      insectsDelayBSend: { node: this.insectsDelayBSend },
      insDelayBSend: { node: this.insectsDelayBSend },
      insectsGranularSend: { node: this.granularInsectsSend },
      granularInsectsSend: { node: this.granularInsectsSend },
      natureReverbSend: { node: this.natureReverbSendTap },
      natureDelayASend: { node: this.natureDelayASendTap },
      natureDelayBSend: { node: this.natureDelayBSendTap },
      natureGranularSend: { node: this.natureGranularSendTap },
      granularNatureSend: { node: this.natureGranularSendTap },
      soundscapeStem: { node: this.earthLevelGain },
      earthStem: { node: this.earthLevelGain },
      delayAOut: { node: this.sharedDelayA?.getDirectOutputNode() ?? null },
      delayAOutput: { node: this.sharedDelayA?.getDirectOutputNode() ?? null },
      delayADirectOut: { node: this.sharedDelayA?.getDirectOutputNode() ?? null },
      delayAReverbSend: { node: this.sharedDelayA?.getReverbSendNode() ?? null },
      delayAToDelayBSend: { node: this.sharedDelayA?.getDelayBSendNode() ?? null },
      delayAToBSend: { node: this.sharedDelayA?.getDelayBSendNode() ?? null },
      delayAToGranularSend: { node: this.sharedDelayA?.getGranularSendNode() ?? null },
      delayAGranularSend: { node: this.sharedDelayA?.getGranularSendNode() ?? null },
      delayBOut: { node: this.sharedDelayB?.getDirectOutputNode() ?? null },
      delayBOutput: { node: this.sharedDelayB?.getDirectOutputNode() ?? null },
      delayBDirectOut: { node: this.sharedDelayB?.getDirectOutputNode() ?? null },
      delayBReverbSend: { node: this.sharedDelayB?.getReverbSendNode() ?? null },
      delayBToDelayASend: { node: this.sharedDelayB?.getDelayASendNode() ?? null },
      delayBToASend: { node: this.sharedDelayB?.getDelayASendNode() ?? null },
      delayBToGranularSend: { node: this.sharedDelayB?.getGranularSendNode() ?? null },
      delayBGranularSend: { node: this.sharedDelayB?.getGranularSendNode() ?? null },
      granularOutput: { node: this.granularFxDirect },
      granularDirectOut: { node: this.granularFxDirect },
      granularFxDirect: { node: this.granularFxDirect },
      granularReverbSend: { node: this.granularFxReverbSend },
      granularFxReverbSend: { node: this.granularFxReverbSend },
      granularToDelayASend: { node: this.granularDelayASend },
      granularDelayASend: { node: this.granularDelayASend },
      granularToDelayBSend: { node: this.sharedGranularDelayBSend },
      granularDelayBSend: { node: this.sharedGranularDelayBSend },
      reverb: { node: this.reverbOutputGain },
      reverbOutput: { node: this.reverbOutputGain },
      reverbReturn: { node: this.reverbOutputGain },
      reverbPreconditionerOut: { node: reverbConditionedSource },
      reverbPreconditionerOutput: { node: reverbConditionedSource },
      reverbConditionedInput: { node: reverbConditionedSource },
      spectralFreezeInput: { node: spectralFreezeInputNode },
      spectralFreezeOutput: { node: this.spectralFreezeNode },
      sidechainPad1Input: { node: this.sidechainTargets.pad1?.input ?? null },
      sidechainPad1Output: { node: this.sidechainTargets.pad1?.output ?? null },
      sidechainPad1GainTrace: { node: this.getSidechainTargetGainTraceNode('pad1') },
      sidechainPad2Input: { node: this.sidechainTargets.pad2?.input ?? null },
      sidechainPad2Output: { node: this.sidechainTargets.pad2?.output ?? null },
      sidechainPad2GainTrace: { node: this.getSidechainTargetGainTraceNode('pad2') },
      sidechainLead1Input: { node: this.sidechainTargets.lead1?.input ?? null },
      sidechainLead1Output: { node: this.sidechainTargets.lead1?.output ?? null },
      sidechainLead1GainTrace: { node: this.getSidechainTargetGainTraceNode('lead1') },
      sidechainLead2Input: { node: this.sidechainTargets.lead2?.input ?? null },
      sidechainLead2Output: { node: this.sidechainTargets.lead2?.output ?? null },
      sidechainLead2GainTrace: { node: this.getSidechainTargetGainTraceNode('lead2') },
      sidechainPianoInput: { node: this.sidechainTargets.piano?.input ?? null },
      sidechainPianoOutput: { node: this.sidechainTargets.piano?.output ?? null },
      sidechainPianoGainTrace: { node: this.getSidechainTargetGainTraceNode('piano') },
      sidechainGranularInput: { node: this.sidechainTargets.granular?.input ?? null },
      sidechainGranularOutput: { node: this.sidechainTargets.granular?.output ?? null },
      sidechainGranularGainTrace: { node: this.getSidechainTargetGainTraceNode('granular') },
      sidechainDelayAInput: { node: this.sidechainTargets.delayA?.input ?? null },
      sidechainDelayAOutput: { node: this.sidechainTargets.delayA?.output ?? null },
      sidechainDelayAGainTrace: { node: this.getSidechainTargetGainTraceNode('delayA') },
      sidechainDelayBInput: { node: this.sidechainTargets.delayB?.input ?? null },
      sidechainDelayBOutput: { node: this.sidechainTargets.delayB?.output ?? null },
      sidechainDelayBGainTrace: { node: this.getSidechainTargetGainTraceNode('delayB') },
      sidechainReverbInput: { node: this.sidechainTargets.reverb?.input ?? null },
      sidechainReverbOutput: { node: this.sidechainTargets.reverb?.output ?? null },
      sidechainReverbGainTrace: { node: this.getSidechainTargetGainTraceNode('reverb') },
      dynamics: { node: this.getDynamicsRecordableNode() },
      reverbInput: { node: this.reverbInputBus },
      delayAInput: { node: this.sharedDelayA?.input ?? null },
      delayBInput: { node: this.sharedDelayB?.input ?? null },
      granularInput: { node: this.granularFxInputGain },
      dynamicsInput: { node: this.masterGain },
      dynamicsOutput: { node: this.getDynamicsRecordableNode() },
      masterPreLimiter: { node: this.getDynamicsRecordableNode() },
      masterPostLimiter: { node: this.limiter },
    };
  }

  getAllStemNodes(): Record<DiagnosticRecordTrackId, RecordableTrackSource> {
    return this.getRecordableBusNodes();
  }
}

// Singleton instance
export const audioEngine = new AudioEngine();

// Expose engine for console debugging
(window as unknown as Record<string, unknown>).__engine = audioEngine;
