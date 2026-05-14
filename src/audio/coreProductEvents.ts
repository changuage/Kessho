import { KESSHO_PRODUCT_EVENT_IDS } from './generated/kesshoProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';
import { KESSHO_PRODUCT_DRUM_VOICE_COUNT } from './generated/kesshoProductSchema';
import { delayNoteToSeconds } from './delayBuses';
import { getIndexedDelayDivisionValue, type IndexedDelayDivisionKey } from '../ui/state';

export type CoreProductEvent = {
  sampleOffset?: number;
  eventKind: number;
  targetId?: number;
  index?: number;
  paramId?: number;
  value?: number;
  value2?: number;
  value3?: number;
  value4?: number;
  flags?: number;
};

export const CORE_PRODUCT_SOURCE_IDS = Object.freeze({
  pad1: 1,
  pad2: 2,
  lead1: 3,
  lead2: 4,
  drum: 5,
  piano: 6,
  soundscape: 7,
} as const);

export const CORE_PRODUCT_MODULATION_RANGE_MODE = Object.freeze({
  off: 0,
  sampleHold: 1,
  randomWalk: 2,
} as const);

export const CORE_PRODUCT_MODULATION_RANGE_FLAGS = Object.freeze({
  active: 1,
} as const);

export const CORE_PRODUCT_SEQUENCER_IDS = Object.freeze({
  synth: 1,
  drum: 2,
} as const);

export const CORE_PRODUCT_STEP_TOGGLE_FLAGS = Object.freeze({
  active: 1,
  clearLane: 2,
  clearField: 4,
} as const);

export const CORE_PRODUCT_STEP_VALUE_FIELDS = Object.freeze({
  trigger: 0 << 8,
  probability: 1 << 8,
  ratchet: 2 << 8,
  trigCondition: 3 << 8,
  midiNote: 4 << 8,
  expression: 5 << 8,
  morph: 6 << 8,
  distance: 7 << 8,
  subLaneConfig: 8 << 8,
} as const);

export const CORE_PRODUCT_SUBLANE_DIRECTIONS = Object.freeze({
  forward: 0,
  reverse: 1,
  pingpong: 2,
} as const);

export const CORE_PRODUCT_DRUM_RANGE_TARGET_BASE = 1000;

const VALID_SOURCE_IDS = new Set<number>(Object.values(CORE_PRODUCT_SOURCE_IDS));
const VALID_SEQUENCER_IDS = new Set<number>(Object.values(CORE_PRODUCT_SEQUENCER_IDS));
const VALID_PARAM_IDS = new Set<number>(Object.values(KESSHO_PRODUCT_PARAM_IDS));
const VALID_STEP_FIELDS = new Set<number>(Object.values(CORE_PRODUCT_STEP_VALUE_FIELDS));
const VALID_SUBLANE_DIRECTIONS = new Set<number>(Object.values(CORE_PRODUCT_SUBLANE_DIRECTIONS));

function productBridgeError(message: string): Error {
  return new Error(`Invalid Core Product bridge event: ${message}`);
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw productBridgeError(`${label} must be a finite number`);
  }
  return value;
}

function requireIntegerInRange(value: unknown, label: string, min: number, max: number): number {
  const numeric = requireFiniteNumber(value, label);
  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    throw productBridgeError(`${label} must be an integer in [${min}, ${max}]`);
  }
  return numeric;
}

function requireUnitValue(value: unknown, label: string): number {
  const numeric = requireFiniteNumber(value, label);
  if (numeric < 0 || numeric > 1) {
    throw productBridgeError(`${label} must be in [0, 1]`);
  }
  return numeric;
}

function requirePositiveUnitValue(value: unknown, label: string): number {
  const numeric = requireUnitValue(value, label);
  if (numeric <= 0) {
    throw productBridgeError(`${label} must be greater than zero`);
  }
  return numeric;
}

function requireNumberInRange(value: unknown, label: string, min: number, max: number): number {
  const numeric = requireFiniteNumber(value, label);
  if (numeric < min || numeric > max) {
    throw productBridgeError(`${label} must be in [${min}, ${max}]`);
  }
  return numeric;
}

function requirePositiveFinite(value: unknown, label: string): number {
  const numeric = requireFiniteNumber(value, label);
  if (numeric <= 0) {
    throw productBridgeError(`${label} must be greater than zero`);
  }
  return numeric;
}

function requireSourceId(sourceId: unknown, label = 'sourceId'): number {
  const value = requireIntegerInRange(sourceId, label, 1, CORE_PRODUCT_SOURCE_IDS.soundscape);
  if (!VALID_SOURCE_IDS.has(value)) {
    throw productBridgeError(`${label} is not a known product source: ${String(sourceId)}`);
  }
  return value;
}

function requireDrumVoiceIndex(voiceIndex: unknown, label = 'voiceIndex'): number {
  return requireIntegerInRange(voiceIndex, label, 0, KESSHO_PRODUCT_DRUM_VOICE_COUNT - 1);
}

function requireSequencerId(sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS): number {
  if (!Object.prototype.hasOwnProperty.call(CORE_PRODUCT_SEQUENCER_IDS, sequencer)) {
    throw productBridgeError(`sequencer is not known: ${String(sequencer)}`);
  }
  const sequencerId = CORE_PRODUCT_SEQUENCER_IDS[sequencer];
  if (!VALID_SEQUENCER_IDS.has(sequencerId)) {
    throw productBridgeError(`sequencer id is not known: ${String(sequencerId)}`);
  }
  return sequencerId;
}

function requireParamId(paramId: unknown, label = 'paramId'): number {
  const value = requireIntegerInRange(paramId, label, 1, Number.MAX_SAFE_INTEGER);
  if (!VALID_PARAM_IDS.has(value)) {
    throw productBridgeError(`${label} is not a known product param: ${String(paramId)}`);
  }
  return value;
}

function requireStepField(field: unknown): CoreProductStepValueField {
  const value = requireIntegerInRange(field, 'field', 0, 8 << 8);
  if (!VALID_STEP_FIELDS.has(value)) {
    throw productBridgeError(`field is not a known sequencer step field: ${String(field)}`);
  }
  return value as CoreProductStepValueField;
}

function requireSubLaneDirection(direction: unknown): CoreProductSubLaneDirection {
  const value = requireIntegerInRange(direction, 'direction', 0, 2);
  if (!VALID_SUBLANE_DIRECTIONS.has(value)) {
    throw productBridgeError(`direction is not a known sub-lane direction: ${String(direction)}`);
  }
  return value as CoreProductSubLaneDirection;
}

export type CoreProductModulationRangeMode =
  (typeof CORE_PRODUCT_MODULATION_RANGE_MODE)[keyof typeof CORE_PRODUCT_MODULATION_RANGE_MODE];

export type CoreProductStepValueField =
  (typeof CORE_PRODUCT_STEP_VALUE_FIELDS)[keyof typeof CORE_PRODUCT_STEP_VALUE_FIELDS];

export type CoreProductSubLaneDirection =
  (typeof CORE_PRODUCT_SUBLANE_DIRECTIONS)[keyof typeof CORE_PRODUCT_SUBLANE_DIRECTIONS];

export type CoreProductRangeTarget = {
  targetId: number;
  paramId: number;
  controlId: number;
  mapValue?: (value: number, context: CoreProductRangeValueContext) => number;
};

export type CoreProductRangeValueContext = {
  bpm?: number;
};

type CoreProductRangeTargetResolver = (key: string) => CoreProductRangeTarget[];
type ProductParamIdName = keyof typeof KESSHO_PRODUCT_PARAM_IDS;

function stableControlId(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function sourceTarget(
  sourceId: number,
  paramId: number,
  key: string,
  mapValue?: (value: number, context: CoreProductRangeValueContext) => number,
): CoreProductRangeTarget {
  return { targetId: requireSourceId(sourceId), paramId: requireParamId(paramId), controlId: stableControlId(key), mapValue };
}

function drumTarget(voiceIndex: number, paramId: number, key: string): CoreProductRangeTarget {
  return {
    targetId: CORE_PRODUCT_DRUM_RANGE_TARGET_BASE + requireDrumVoiceIndex(voiceIndex),
    paramId: requireParamId(paramId),
    controlId: stableControlId(key),
  };
}

function productParamTarget(
  paramId: number,
  key: string,
  mapValue?: (value: number, context: CoreProductRangeValueContext) => number,
): CoreProductRangeTarget {
  return { targetId: 0, paramId: requireParamId(paramId), controlId: stableControlId(key), mapValue };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizedToDelayAModRateHz(value: number): number {
  return clamp(value, 0, 1) * 5;
}

function normalizedToDelayAModDepthMs(value: number): number {
  return clamp(value, 0, 1) * 50;
}

function normalizedToDelayACrossFeedFilterHz(value: number): number {
  return 200 + clamp(value, 0, 1) * 7800;
}

function spectralFreezeRoutingValue(value: number | string): number {
  return value === 'post' || Number(value) >= 0.5 ? 1 : 0;
}

function contextBpm(context: CoreProductRangeValueContext): number {
  return clamp(context.bpm ?? 120, 1, 400);
}

function indexedDelayDivisionMs(key: IndexedDelayDivisionKey, minMs: number) {
  return (value: number, context: CoreProductRangeValueContext): number => {
    const division = getIndexedDelayDivisionValue(key, value);
    return clamp(delayNoteToSeconds(division, contextBpm(context)) * 1000, minMs, 5000);
  };
}

const GRANULAR_VOICE_RANGE_PARAM_SUFFIXES = [
  ['Speed', 'Speed'],
  ['ScanRate', 'ScanRate'],
  ['Pitch', 'Pitch'],
  ['WriteFollow', 'WriteFollow'],
  ['Density', 'Density'],
  ['GrainSize', 'GrainSizeMs'],
  ['Spray', 'Spray'],
  ['GrainOct', 'GrainOctaveProbability'],
  ['Attack', 'AttackSeconds'],
  ['Decay', 'DecaySeconds'],
  ['Gain', 'Gain'],
  ['Pan', 'Pan'],
  ['Blur', 'Blur'],
  ['StereoSpread', 'StereoSpread'],
  ['PosLFORate', 'PositionLfoRate'],
  ['PosLFODepth', 'PositionLfoDepth'],
  ['PanLFORate', 'PanLfoRate'],
  ['ReverseLFORate', 'ReverseLfoRate'],
  ['RecordLFORate', 'RecordLfoRate'],
] as const;

function granularVoiceRangeTargets(): Record<string, CoreProductRangeTargetResolver> {
  const targets: Record<string, CoreProductRangeTargetResolver> = {};
  for (const voiceNumber of [1, 2, 3, 4] as const) {
    for (const [stateSuffix, paramSuffix] of GRANULAR_VOICE_RANGE_PARAM_SUFFIXES) {
      const stateKey = `granularV${voiceNumber}${stateSuffix}`;
      const paramName = `FxGranularV${voiceNumber}${paramSuffix}` as ProductParamIdName;
      targets[stateKey] = (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS[paramName], key)];
    }
  }
  return targets;
}

const RANGE_KEY_TARGETS: Record<string, CoreProductRangeTargetResolver> = {
  ...granularVoiceRangeTargets(),
  synthLevel: (key) => [
    sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, `${key}:pad1`),
    sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, `${key}:pad2`),
  ],
  pad2Level: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key)],
  leadLevel: (key) => [
    sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, `${key}:lead1`),
    sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, `${key}:lead2`),
  ],
  lead1Level: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key)],
  lead2Level: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key)],
  drumLevel: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.drum, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key)],
  pianoLevel: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.piano, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key)],
  natureLevel: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key)],
  oceanSampleLevel: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key)],
  waterLevel: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key)],
  insectsSharedLevel: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceLevel, key)],
  padMorph: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceMorph, key)],
  pad2Morph: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceMorph, key)],
  lead1Morph: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceMorph, key)],
  lead2Morph: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceMorph, key)],
  waterMorph: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceMorph, key)],
  padDistance: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceDistance, key)],
  pad2Distance: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceDistance, key)],
  lead1Distance: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceDistance, key)],
  lead2Distance: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceDistance, key)],
  pianoDistance: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.piano, KESSHO_PRODUCT_PARAM_IDS.SourceDistance, key)],
  padExpression: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceExpression, key)],
  pad2Expression: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceExpression, key)],
  lead1Expression: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceExpression, key)],
  lead2Expression: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceExpression, key)],
  padPostLPF: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfHz, key)],
  pad2PostLPF: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfHz, key)],
  lead1PostLPF: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfHz, key)],
  lead2PostLPF: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfHz, key)],
  pianoPostLPF: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.piano, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfHz, key)],
  padStereoWidth: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceStereoWidth, key)],
  pad2StereoWidth: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceStereoWidth, key)],
  lead1StereoWidth: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceStereoWidth, key)],
  lead2StereoWidth: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceStereoWidth, key)],
  pianoStereoWidth: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.piano, KESSHO_PRODUCT_PARAM_IDS.SourceStereoWidth, key)],
  lead1PostLPFKeyTracking: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfKeyTracking, key)],
  lead2PostLPFKeyTracking: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourcePostLpfKeyTracking, key)],
  pad1ReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  pad2ReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  lead1ReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  lead2ReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  drumReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.drum, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  pianoReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.piano, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  natureReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  oceanReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  waterReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  insectsReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  pad1DelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  pad2DelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  lead1DelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  lead2DelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  drumDelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.drum, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  pianoDelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.piano, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  natureDelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  oceanDelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  waterDelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  insDelayASend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)],
  pad1DelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  pad2DelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  lead1DelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  lead2DelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  drumDelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.drum, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  pianoDelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.piano, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  natureDelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  oceanDelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  waterDelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  insDelayBSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceDelayBSend, key)],
  granularPad1Send: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularPad2Send: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularLead1Send: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularLead2Send: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularDrumSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.drum, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularPianoSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.piano, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularNatureSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularWavesSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularWaterSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  granularInsectsSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceGranularSend, key)],
  padDiffuseSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceDiffuseSend, key)],
  pad2DiffuseSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceDiffuseSend, key)],
  lead1DiffuseSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceDiffuseSend, key)],
  lead2DiffuseSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceDiffuseSend, key)],
  pianoDiffuseSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.piano, KESSHO_PRODUCT_PARAM_IDS.SourceDiffuseSend, key)],
  masterVolume: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.MasterGain, controlId: stableControlId(key) }],
  masterLimiterCeilingDb: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.MasterLimiterCeilingDb, key)],
  masterSatDrive: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.MasterSaturationDrive, controlId: stableControlId(key) }],
  masterSatTone: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.MasterSaturationTone, controlId: stableControlId(key) }],
  granularLevel: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxGranularMix, controlId: stableControlId(key) }],
  delayAMix: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDelayAMix, controlId: stableControlId(key) }],
  drumDelayNoteL: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayATimeLeftMs, key, indexedDelayDivisionMs('drumDelayNoteL', 10)),
  ],
  drumDelayNoteR: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayATimeRightMs, key, indexedDelayDivisionMs('drumDelayNoteR', 10)),
  ],
  delayAFeedback: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayAFeedback, key)],
  delayAFilter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayAFilterHz, key)],
  delayAModRate: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayAModRateHz, key, normalizedToDelayAModRateHz)],
  delayAModDepth: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayAModDepthMs, key, normalizedToDelayAModDepthMs)],
  delayADuck: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayADuck, key)],
  delayAWidth: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayAWidth, key)],
  delayACrossFeedFilter: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayACrossFeedFilterHz, key, normalizedToDelayACrossFeedFilterHz),
  ],
  delayBMix: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDelayBMix, controlId: stableControlId(key) }],
  granularDelayMix: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBMix, key)],
  granularDelayTime: (key) => [
    productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBBaseTimeMs, key, indexedDelayDivisionMs('granularDelayTime', 20)),
  ],
  granularDelayActivity: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBActivity, key)],
  granularDelayRepeats: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBRepeats, key)],
  granularDelayFilter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBTone, key)],
  granularDelayVibrato: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBVibrato, key)],
  delayBWarpIntensity: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBWarpIntensity, key)],
  delayBSpread: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDelayBSpread, key)],
  delayAToBSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDelayAToDelayB, key)],
  delayBToASend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDelayBToDelayA, key)],
  delayAReverbSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDelayToReverb, key)],
  delayAGranularSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDelayAToGranular, key)],
  delayBGranularSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDelayBToGranular, key)],
  granularDelayASend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingGranularToDelayA, key)],
  granularDelayBSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingGranularToDelayB, key)],
  granularReverbSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingGranularToReverb, key)],
  granularDelayReverbSend: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.RoutingDelayBToReverb, key)],
  reverbLevel: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxReverbMix, controlId: stableControlId(key) }],
  reverbDecay: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbDecay, key)],
  reverbSize: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbSize, key)],
  damping: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbDamping, key)],
  reverbDiffusion: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbDiffusion, key)],
  reverbModulation: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbModulation, key)],
  predelay: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbPredelayMs, key)],
  width: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbWidth, key)],
  reverbShimmer: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbShimmerAmount, key)],
  reverbShimmerPitch: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbShimmerPitch, key)],
  reverbSlowModRate: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbSlowRateHz, key)],
  reverbSlowModDepth: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbSlowDepth, key)],
  reverbReverse: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbReverseAmount, key)],
  reverbReverseLength: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbReverseLengthSec, key)],
  reverbChorusRate: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbChorusRateHz, key)],
  reverbChorusDepth: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbChorusDepth, key)],
  reverbDampLow: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbDampLow, key)],
  reverbDampHigh: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbDampHigh, key)],
  reverbCrossoverFreq: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbCrossoverHz, key)],
  reverbInputTone: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbInputTone, key)],
  reverbShimmerFeedback: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbShimmerFeedback, key)],
  reverbWarp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbWarp, key)],
  reverbCrossFeed: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbCrossFeed, key)],
  reverbEarlyReflections: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbEarlyReflections, key)],
  reverbAirAbsorption: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbAirAbsorption, key)],
  reverbTransientSmooth: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbTransientSmooth, key)],
  reverbErLpFreq: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbErLpFreq, key)],
  reverbPreCompThreshold: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompThreshold, key)],
  reverbPreCompKnee: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompKnee, key)],
  reverbPreCompRatio: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompRatio, key)],
  reverbPreCompAttackMs: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompAttackMs, key)],
  reverbPreCompReleaseMs: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompReleaseMs, key)],
  reverbPreCompMakeup: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxReverbPreCompMakeup, key)],
  spectralFreezeMix: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeMix, controlId: stableControlId(key) }],
  spectralFreezeSpeed: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeSpeed, key)],
  spectralFreezeDecay: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeDecay, key)],
  spectralFreezePhaseJitter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezePhaseJitter, key)],
  spectralFreezeRouting: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeRouting, key, spectralFreezeRoutingValue)],
  spectralFreezeReverbCrossfade: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeReverbCrossfade, key)],
  dynamicsDrive: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDrive, controlId: stableControlId(key) }],
  characterMix: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterMix, key)],
  characterAge: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterAge, key)],
  characterBias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterBias, key)],
  characterLpgAmount: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterLpgAmount, key)],
  characterDepth: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterDepth, key)],
  characterRate: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterRate, key)],
  characterDamp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterDamp, key)],
  characterEnvFollow: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterEnvFollow, key)],
  characterStereo: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterStereo, key)],
  characterResonance: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsCharacterResonance, key)],
  degradeMix: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeMix, key)],
  degradeAge: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeAge, key)],
  degradeGeneration: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeGeneration, key)],
  degradeAlias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeAlias, key)],
  degradeWow: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeWow, key)],
  degradeFlutter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeFlutter, key)],
  degradeDrift: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeDrift, key)],
  degradeNoise: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeNoise, key)],
  degradeHp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeHp, key)],
  degradeLp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeLp, key)],
  degradeTone: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeTone, key)],
  degradeSaturation: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeSaturation, key)],
  degradeCorrosion: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDegradeCorrosion, key)],
  degradeModSlowWow: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowWow, key)],
  degradeModSlowFlutter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowFlutter, key)],
  degradeModSlowLp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowLp, key)],
  degradeModSlowWet: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowWet, key)],
  degradeModSlowDropout: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowDropout, key)],
  degradeModSlowAlias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModSlowAlias, key)],
  degradeModFlutterWow: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterWow, key)],
  degradeModFlutterFlutter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterFlutter, key)],
  degradeModFlutterLp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterLp, key)],
  degradeModFlutterWet: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterWet, key)],
  degradeModFlutterDropout: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterDropout, key)],
  degradeModFlutterAlias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModFlutterAlias, key)],
  degradeModRandomWow: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomWow, key)],
  degradeModRandomFlutter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomFlutter, key)],
  degradeModRandomLp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomLp, key)],
  degradeModRandomWet: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomWet, key)],
  degradeModRandomDropout: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomDropout, key)],
  degradeModRandomAlias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModRandomAlias, key)],
  degradeModEnvWow: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvWow, key)],
  degradeModEnvFlutter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvFlutter, key)],
  degradeModEnvLp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvLp, key)],
  degradeModEnvWet: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvWet, key)],
  degradeModEnvDropout: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvDropout, key)],
  degradeModEnvAlias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModEnvAlias, key)],
  degradeModNoiseWow: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseWow, key)],
  degradeModNoiseFlutter: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseFlutter, key)],
  degradeModNoiseLp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseLp, key)],
  degradeModNoiseWet: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseWet, key)],
  degradeModNoiseDropout: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseDropout, key)],
  degradeModNoiseAlias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsModNoiseAlias, key)],
  dynamicsSaturationDrive: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationDrive, key)],
  dynamicsSaturationTone: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationTone, key)],
  dynamicsSaturationBias: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsSaturationBias, key)],
  endCompThreshold: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompThreshold, key)],
  endCompKnee: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompKnee, key)],
  endCompRatio: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompRatio, key)],
  endCompAttackMs: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompAttackMs, key)],
  endCompReleaseMs: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompReleaseMs, key)],
  endCompMakeup: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompMakeup, key)],
  endCompMix: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompMix, key)],
  endCompDetectorHp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompDetectorHp, key)],
  endCompDetectorTilt: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompDetectorTilt, key)],
  endCompAutoMakeup: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompAutoMakeup, key)],
  endCompProgramRelease: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxDynamicsEndCompProgramRelease, key)],
  sidechainKeyAWeight: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainKeyAWeight, key)],
  sidechainKeyBWeight: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainKeyBWeight, key)],
  sidechainAmount: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainAmount, key)],
  sidechainThreshold: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainThreshold, key)],
  sidechainRatio: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainRatio, key)],
  sidechainKnee: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainKnee, key)],
  sidechainAttackMs: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainAttackMs, key)],
  sidechainHoldMs: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainHoldMs, key)],
  sidechainReleaseMs: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainReleaseMs, key)],
  sidechainMakeup: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainMakeup, key)],
  sidechainMix: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainMix, key)],
  sidechainCurve: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainCurve, key)],
  sidechainDetectorHp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainDetectorHp, key)],
  sidechainDetectorLp: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainDetectorLp, key)],
  sidechainPad1Target: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainPad1Target, key)],
  sidechainPad2Target: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainPad2Target, key)],
  sidechainLead1Target: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainLead1Target, key)],
  sidechainLead2Target: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainLead2Target, key)],
  sidechainPianoTarget: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainPianoTarget, key)],
  sidechainGranularTarget: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainGranularTarget, key)],
  sidechainDelayATarget: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainDelayATarget, key)],
  sidechainDelayBTarget: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainDelayBTarget, key)],
  sidechainReverbTarget: (key) => [productParamTarget(KESSHO_PRODUCT_PARAM_IDS.FxSidechainReverbTarget, key)],
};

const DRUM_RUNTIME_RANGE_VOICES: Array<[RegExp, number]> = [
  [/^drumSub/, 0],
  [/^drumKick/, 1],
  [/^drumClick/, 2],
  [/^drumBeepHi/, 3],
  [/^drumBeepLo/, 4],
  [/^drumNoise/, 5],
  [/^drumMembrane/, 6],
];

function resolveCoreProductDrumRuntimeRangeTargets(key: string): CoreProductRangeTarget[] {
  const voiceIndex = DRUM_RUNTIME_RANGE_VOICES.find(([pattern]) => pattern.test(key))?.[1];
  if (voiceIndex === undefined) return [];
  if (/Morph$/.test(key)) {
    return [drumTarget(voiceIndex, KESSHO_PRODUCT_PARAM_IDS.SourceMorph, key)];
  }
  if (/Expression/i.test(key)) {
    return [drumTarget(voiceIndex, KESSHO_PRODUCT_PARAM_IDS.SourceExpression, key)];
  }
  if (/DelaySend/i.test(key)) {
    return [drumTarget(voiceIndex, KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend, key)];
  }
  if (/Distance/i.test(key)) {
    return [drumTarget(voiceIndex, KESSHO_PRODUCT_PARAM_IDS.SourceDistance, key)];
  }
  return [];
}

export function resolveCoreProductRangeTargets(key: string): CoreProductRangeTarget[] {
  return RANGE_KEY_TARGETS[key]?.(key) ?? resolveCoreProductDrumRuntimeRangeTargets(key);
}

export function isCoreProductRangeKeySupported(key: string): boolean {
  return resolveCoreProductRangeTargets(key).length > 0;
}

export function resolveCoreProductDrumMorphRangeTarget(voiceIndex: number, key: string): CoreProductRangeTarget {
  return drumTarget(voiceIndex, KESSHO_PRODUCT_PARAM_IDS.SourceMorph, key);
}

export function resolveCoreProductDrumParamRangeTarget(
  voiceIndex: number,
  paramName: 'distance' | 'expression' | 'delayA',
  key: string,
): CoreProductRangeTarget {
  return drumTarget(
    voiceIndex,
    paramName === 'expression'
      ? KESSHO_PRODUCT_PARAM_IDS.SourceExpression
      : paramName === 'delayA'
      ? KESSHO_PRODUCT_PARAM_IDS.SourceDelayASend
      : KESSHO_PRODUCT_PARAM_IDS.SourceDistance,
    key,
  );
}

export function createCoreProductStartEvent(): CoreProductEvent {
  return { eventKind: KESSHO_PRODUCT_EVENT_IDS.Start };
}

export function createCoreProductStopEvent(): CoreProductEvent {
  return { eventKind: KESSHO_PRODUCT_EVENT_IDS.Stop };
}

export function createCoreProductManualNoteEvent(
  sourceId: number,
  midi: number,
  velocity: number,
  durationMs: number,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.ManualNoteOn,
    targetId: requireSourceId(sourceId),
    value: requireNumberInRange(midi, 'midi', 0, 127),
    value2: requirePositiveUnitValue(velocity, 'velocity'),
    value3: requirePositiveFinite(durationMs, 'durationMs') / 1000,
  };
}

export function createCoreProductDrumTriggerEvent(voiceIndex: number, velocity: number): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.TriggerDrumVoice,
    targetId: requireDrumVoiceIndex(voiceIndex),
    value: requirePositiveUnitValue(velocity, 'velocity'),
  };
}

export function createCoreProductSourcePresetEvent(sourceId: number, presetId: number): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSourcePreset,
    targetId: requireSourceId(sourceId),
    value: requireIntegerInRange(presetId, 'presetId', 1, Number.MAX_SAFE_INTEGER),
  };
}

export function createCoreProductJourneyEvent(enabled: boolean): CoreProductEvent {
  return {
    eventKind: enabled
      ? KESSHO_PRODUCT_EVENT_IDS.StartJourneyMorphClock
      : KESSHO_PRODUCT_EVENT_IDS.StopJourneyMorphClock,
  };
}

export function createCoreProductJourneyStateEvent(
  enabled: boolean,
  phase = 0,
  rateBars = 8,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetJourneyState,
    value: enabled ? 1 : 0,
    value2: requireUnitValue(phase, 'phase'),
    value3: requirePositiveFinite(rateBars, 'rateBars'),
  };
}

export function createCoreProductParamEvent(
  paramId: number,
  value: number,
  targetId = 0,
  index = 0,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetParam,
    targetId: requireIntegerInRange(targetId, 'targetId', 0, Number.MAX_SAFE_INTEGER),
    index: requireIntegerInRange(index, 'index', 0, Number.MAX_SAFE_INTEGER),
    paramId: requireParamId(paramId),
    value: requireFiniteNumber(value, 'value'),
  };
}

export function createCoreProductModulationRangeEvent(
  target: CoreProductRangeTarget,
  range: { min: number; max: number } | null,
  mode: CoreProductModulationRangeMode,
  currentValue = 0,
  context: CoreProductRangeValueContext = {},
): CoreProductEvent {
  const targetId = requireIntegerInRange(target.targetId, 'target.targetId', 0, Number.MAX_SAFE_INTEGER);
  const paramId = requireParamId(target.paramId, 'target.paramId');
  const controlId = requireIntegerInRange(target.controlId, 'target.controlId', 1, Number.MAX_SAFE_INTEGER);
  if (!Object.values(CORE_PRODUCT_MODULATION_RANGE_MODE).includes(mode)) {
    throw productBridgeError(`modulation range mode is not known: ${String(mode)}`);
  }
  const hasRange = !!range && Number.isFinite(range.min) && Number.isFinite(range.max);
  const mapValue = target.mapValue ?? ((value: number) => value);
  const min = hasRange ? mapValue(Math.min(range.min, range.max), context) : 0;
  const max = hasRange ? mapValue(Math.max(range.min, range.max), context) : 0;
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetModulationRange,
    targetId,
    index: controlId,
    paramId,
    value: min,
    value2: max,
    value3: hasRange ? mode : CORE_PRODUCT_MODULATION_RANGE_MODE.off,
    value4: mapValue(currentValue, context),
    flags: hasRange ? CORE_PRODUCT_MODULATION_RANGE_FLAGS.active : 0,
  };
}

export function createCoreProductSequencerStepEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
  stepIndex: number,
  enabled: boolean,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    paramId: requireIntegerInRange(stepIndex, 'stepIndex', 0, 63),
    value: enabled ? 1 : 0,
    flags: CORE_PRODUCT_STEP_TOGGLE_FLAGS.active,
  };
}

export function createCoreProductSequencerLaneParamEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
  paramId: number,
  value: number,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    paramId: requireParamId(paramId),
    value: requireFiniteNumber(value, 'value'),
  };
}

export function createCoreProductSequencerStepValueEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
  stepIndex: number,
  field: CoreProductStepValueField,
  value: number,
  value2 = 0,
): CoreProductEvent {
  const validatedField = requireStepField(field);
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    paramId: requireIntegerInRange(stepIndex, 'stepIndex', 0, 63),
    value: requireFiniteNumber(value, 'value'),
    value2: requireFiniteNumber(value2, 'value2'),
    flags: CORE_PRODUCT_STEP_TOGGLE_FLAGS.active | validatedField,
  };
}

export function createCoreProductSequencerSubLaneConfigEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
  field: CoreProductStepValueField,
  steps: number,
  direction: CoreProductSubLaneDirection,
  enabled = true,
): CoreProductEvent {
  const validatedField = requireStepField(field);
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    paramId: requireIntegerInRange(validatedField / (1 << 8), 'field index', 0, 15),
    value: enabled ? 1 : 0,
    value2: requireIntegerInRange(steps, 'steps', 1, 64),
    value3: requireSubLaneDirection(direction),
    flags: CORE_PRODUCT_STEP_TOGGLE_FLAGS.active | CORE_PRODUCT_STEP_VALUE_FIELDS.subLaneConfig,
  };
}

export function createCoreProductSequencerClearStepsEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    flags: CORE_PRODUCT_STEP_TOGGLE_FLAGS.clearLane,
  };
}

export function createCoreProductSequencerResetHomeEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.ResetSequencerLaneHome,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
  };
}

export function createCoreProductSequencerDiceEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
  intensity = 1,
  seed = 0,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.DiceSequencerLane,
    targetId: requireSequencerId(sequencer),
    index: requireIntegerInRange(laneIndex, 'laneIndex', 0, 15),
    value: requireUnitValue(intensity, 'intensity'),
    value2: requireIntegerInRange(seed, 'seed', 0, 0xffffffff),
  };
}

export function createCoreProductMidiEvent(event: {
  sampleOffset?: number;
  targetId?: number;
  status: number;
  channel?: number;
  data1?: number;
  data2?: number;
  normalizedValue?: number;
  rawSize?: number;
}): CoreProductEvent {
  const status = requireIntegerInRange(event.status, 'status', 0, 255);
  const inferredChannel = status < 0xf0 ? status & 0x0f : 0;
  const channel = requireIntegerInRange(event.channel ?? inferredChannel, 'channel', 0, 15);
  const targetId = event.targetId === undefined ? 0 : requireSourceId(event.targetId, 'targetId');
  return {
    sampleOffset: requireIntegerInRange(event.sampleOffset ?? 0, 'sampleOffset', 0, Number.MAX_SAFE_INTEGER),
    eventKind: KESSHO_PRODUCT_EVENT_IDS.MidiEvent,
    targetId,
    index: channel,
    value: status,
    value2: requireIntegerInRange(event.data1 ?? 0, 'data1', 0, 127),
    value3: requireIntegerInRange(event.data2 ?? 0, 'data2', 0, 127),
    value4: requireUnitValue(event.normalizedValue ?? 0, 'normalizedValue'),
    flags: requireIntegerInRange(event.rawSize ?? 0, 'rawSize', 0, 16),
  };
}
