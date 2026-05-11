import { KESSHO_PRODUCT_EVENT_IDS } from './generated/kesshoProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from './generated/kesshoProductParams';

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
};

function stableControlId(key: string): number {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) || 1;
}

function sourceTarget(sourceId: number, paramId: number, key: string): CoreProductRangeTarget {
  return { targetId: sourceId, paramId, controlId: stableControlId(key) };
}

function drumTarget(voiceIndex: number, paramId: number, key: string): CoreProductRangeTarget {
  return {
    targetId: CORE_PRODUCT_DRUM_RANGE_TARGET_BASE + Math.max(0, voiceIndex | 0),
    paramId,
    controlId: stableControlId(key),
  };
}

const RANGE_KEY_TARGETS: Record<string, (key: string) => CoreProductRangeTarget[]> = {
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
  pad1ReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad1, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  pad2ReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.pad2, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  lead1ReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead1, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  lead2ReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.lead2, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  drumReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.drum, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  pianoReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.piano, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  natureReverbSend: (key) => [sourceTarget(CORE_PRODUCT_SOURCE_IDS.soundscape, KESSHO_PRODUCT_PARAM_IDS.SourceReverbSend, key)],
  masterVolume: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.MasterGain, controlId: stableControlId(key) }],
  masterSatDrive: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.MasterSaturationDrive, controlId: stableControlId(key) }],
  masterSatTone: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.MasterSaturationTone, controlId: stableControlId(key) }],
  granularLevel: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxGranularMix, controlId: stableControlId(key) }],
  delayAMix: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDelayAMix, controlId: stableControlId(key) }],
  delayBMix: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDelayBMix, controlId: stableControlId(key) }],
  reverbLevel: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxReverbMix, controlId: stableControlId(key) }],
  spectralFreezeMix: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxSpectralFreezeMix, controlId: stableControlId(key) }],
  dynamicsDrive: (key) => [{ targetId: 0, paramId: KESSHO_PRODUCT_PARAM_IDS.FxDynamicsDrive, controlId: stableControlId(key) }],
};

export function resolveCoreProductRangeTargets(key: string): CoreProductRangeTarget[] {
  return RANGE_KEY_TARGETS[key]?.(key) ?? [];
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
  velocity = 0.8,
  durationMs = 180,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.ManualNoteOn,
    targetId: sourceId,
    value: midi,
    value2: velocity,
    value3: Math.max(1, durationMs) / 1000,
  };
}

export function createCoreProductDrumTriggerEvent(voiceIndex: number, velocity = 0.8): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.TriggerDrumVoice,
    targetId: voiceIndex,
    value: velocity,
  };
}

export function createCoreProductSourcePresetEvent(sourceId: number, presetId: number): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSourcePreset,
    targetId: sourceId,
    value: Math.max(0, Math.round(Number.isFinite(presetId) ? presetId : 0)),
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
    value2: Math.max(0, Math.min(1, Number.isFinite(phase) ? phase : 0)),
    value3: Math.max(0.25, Math.min(128, Number.isFinite(rateBars) ? rateBars : 8)),
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
    targetId,
    index,
    paramId,
    value,
  };
}

export function createCoreProductModulationRangeEvent(
  target: CoreProductRangeTarget,
  range: { min: number; max: number } | null,
  mode: CoreProductModulationRangeMode,
  currentValue = 0,
): CoreProductEvent {
  const hasRange = !!range && Number.isFinite(range.min) && Number.isFinite(range.max);
  const min = hasRange ? Math.min(range.min, range.max) : 0;
  const max = hasRange ? Math.max(range.min, range.max) : 0;
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetModulationRange,
    targetId: target.targetId,
    index: target.controlId,
    paramId: target.paramId,
    value: min,
    value2: max,
    value3: hasRange ? mode : CORE_PRODUCT_MODULATION_RANGE_MODE.off,
    value4: currentValue,
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
    targetId: CORE_PRODUCT_SEQUENCER_IDS[sequencer],
    index: Math.max(0, Math.min(15, Math.round(laneIndex))),
    paramId: Math.max(0, Math.min(63, Math.round(stepIndex))),
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
    targetId: CORE_PRODUCT_SEQUENCER_IDS[sequencer],
    index: Math.max(0, Math.min(15, Math.round(laneIndex))),
    paramId,
    value,
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
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
    targetId: CORE_PRODUCT_SEQUENCER_IDS[sequencer],
    index: Math.max(0, Math.min(15, Math.round(laneIndex))),
    paramId: Math.max(0, Math.min(63, Math.round(stepIndex))),
    value,
    value2,
    flags: CORE_PRODUCT_STEP_TOGGLE_FLAGS.active | field,
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
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
    targetId: CORE_PRODUCT_SEQUENCER_IDS[sequencer],
    index: Math.max(0, Math.min(15, Math.round(laneIndex))),
    paramId: Math.max(0, Math.min(15, Math.round(field / (1 << 8)))),
    value: enabled ? 1 : 0,
    value2: Math.max(1, Math.min(64, Math.round(steps))),
    value3: Math.max(0, Math.min(2, Math.round(direction))),
    flags: CORE_PRODUCT_STEP_TOGGLE_FLAGS.active | CORE_PRODUCT_STEP_VALUE_FIELDS.subLaneConfig,
  };
}

export function createCoreProductSequencerClearStepsEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerStep,
    targetId: CORE_PRODUCT_SEQUENCER_IDS[sequencer],
    index: Math.max(0, Math.min(15, Math.round(laneIndex))),
    flags: CORE_PRODUCT_STEP_TOGGLE_FLAGS.clearLane,
  };
}

export function createCoreProductSequencerResetHomeEvent(
  sequencer: keyof typeof CORE_PRODUCT_SEQUENCER_IDS,
  laneIndex: number,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.ResetSequencerLaneHome,
    targetId: CORE_PRODUCT_SEQUENCER_IDS[sequencer],
    index: Math.max(0, Math.min(15, Math.round(laneIndex))),
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
    targetId: CORE_PRODUCT_SEQUENCER_IDS[sequencer],
    index: Math.max(0, Math.min(15, Math.round(laneIndex))),
    value: Math.max(0, Math.min(1, Number.isFinite(intensity) ? intensity : 1)),
    value2: Math.max(0, Math.min(0xffffffff, Math.round(Number.isFinite(seed) ? seed : 0))),
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
  const status = Math.max(0, Math.min(255, Math.round(event.status || 0)));
  const inferredChannel = status < 0xf0 ? status & 0x0f : 0;
  const channel = Math.max(0, Math.min(15, Math.round(event.channel ?? inferredChannel)));
  return {
    sampleOffset: Math.max(0, Math.round(event.sampleOffset ?? 0)),
    eventKind: KESSHO_PRODUCT_EVENT_IDS.MidiEvent,
    targetId: event.targetId ?? 0,
    index: channel,
    value: status,
    value2: Math.max(0, Math.min(127, Math.round(event.data1 ?? 0))),
    value3: Math.max(0, Math.min(127, Math.round(event.data2 ?? 0))),
    value4: Math.max(0, Math.min(1, event.normalizedValue ?? 0)),
    flags: Math.max(0, Math.min(16, Math.round(event.rawSize ?? 0))),
  };
}
