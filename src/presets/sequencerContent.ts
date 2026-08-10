import {
  DRUM_EUCLIDEAN_LANE_COUNT,
  SYNTH_EUCLIDEAN_LANE_COUNT,
} from '../audio/sequencerLaneCounts';
import type { PitchBindingMode } from '../audio/drumSeqTypes';
import type { ProductPlayConfig } from '../audio/productPlaySequencer';
import type {
  SerializedEvolveConfig,
  SerializedPitchSettings,
  SerializedStepOverrides,
  SerializedSubLaneState,
  SliderState,
} from '../ui/state';
import type { PresetVersionMetadata } from './types';
import type { PresetContentCandidate, PresetContentNodeType } from './contentNodes';
import { PARAM_REGISTRY } from './ParamRegistry';

export type SequencerPageKind = 'synth' | 'drum';
export type SequencerSubLaneContentKind =
  | 'pitch'
  | 'expression'
  | 'morph'
  | 'distance'
  | 'nudge'
  | 'slice'
  | 'reverse';

export const SEQUENCER_SUB_LANE_CONTENT_KINDS: readonly SequencerSubLaneContentKind[] = [
  'pitch',
  'expression',
  'morph',
  'distance',
  'nudge',
  'slice',
  'reverse',
];

export interface SequencerContentComponent {
  componentSlot: 'trigger' | 'control' | SequencerSubLaneContentKind;
  contentType: PresetContentNodeType;
  content: Record<string, unknown>;
}

export interface SynthSequencerSlotBinding {
  kind: 'synth';
  enabled: boolean;
  solo: boolean;
  level: number;
  source: unknown;
  voiceMask: number;
}

export interface DrumSequencerSlotBinding {
  kind: 'drum';
  enabled: boolean;
  solo: boolean;
  level: number;
  targets: Record<string, boolean>;
}

export type SequencerSlotBinding = SynthSequencerSlotBinding | DrumSequencerSlotBinding;

export interface SequencerContentGroup {
  kind: SequencerPageKind;
  laneIndex: number;
  components: SequencerContentComponent[];
  binding: SequencerSlotBinding;
}

const STEP_OVERRIDE_FIELD_BY_SUB_LANE: Record<SequencerSubLaneContentKind, keyof SerializedStepOverrides> = {
  pitch: 'pitch',
  expression: 'expression',
  morph: 'morph',
  distance: 'distance',
  nudge: 'nudge',
  slice: 'slice',
  reverse: 'reverse',
};

const DIRECTION_FIELD_BY_SUB_LANE: Record<SequencerSubLaneContentKind, keyof SerializedStepOverrides> = {
  pitch: 'pitchDirection',
  expression: 'expressionDirection',
  morph: 'morphDirection',
  distance: 'distanceDirection',
  nudge: 'nudgeDirection',
  slice: 'sliceDirection',
  reverse: 'reverseDirection',
};

const RANGE_FIELD_BY_SUB_LANE: Partial<Record<SequencerSubLaneContentKind, keyof SerializedStepOverrides>> = {
  expression: 'expressionRanges',
  morph: 'morphRanges',
  distance: 'distanceRanges',
};

function laneCount(kind: SequencerPageKind): number {
  return kind === 'synth' ? SYNTH_EUCLIDEAN_LANE_COUNT : DRUM_EUCLIDEAN_LANE_COUNT;
}

function assertLaneIndex(kind: SequencerPageKind, laneIndex: number): void {
  if (!Number.isInteger(laneIndex) || laneIndex < 0 || laneIndex >= laneCount(kind)) {
    throw new Error(`Invalid ${kind} sequencer lane index: ${laneIndex}`);
  }
}

function stateRecord(state: SliderState | Record<string, unknown>): Record<string, unknown> {
  return state as unknown as Record<string, unknown>;
}

function lanePrefix(kind: SequencerPageKind, laneIndex: number): string {
  return `${kind}Euclid${laneIndex + 1}`;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(finiteNumber(value, fallback))));
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function laneArrayValue<T>(value: readonly T[] | undefined, laneIndex: number): T | undefined {
  return value?.[laneIndex];
}

function metadataStepOverrides(
  metadata: PresetVersionMetadata | undefined,
  kind: SequencerPageKind,
): SerializedStepOverrides | undefined {
  return kind === 'synth' ? metadata?.synthStepOverrides : metadata?.drumStepOverrides;
}

function metadataSubLaneStates(
  metadata: PresetVersionMetadata | undefined,
  kind: SequencerPageKind,
): Record<string, SerializedSubLaneState>[] | undefined {
  return kind === 'synth' ? metadata?.synthSubLaneStates : metadata?.drumSubLaneStates;
}

function trimValues<T>(values: T[] | null | undefined, steps: number): T[] | undefined {
  if (!Array.isArray(values) || values.length === 0) return undefined;
  return values.slice(0, Math.max(1, steps));
}

function extractTriggerContent(
  state: Record<string, unknown>,
  metadata: PresetVersionMetadata | undefined,
  kind: SequencerPageKind,
  laneIndex: number,
): Record<string, unknown> {
  const prefix = lanePrefix(kind, laneIndex);
  const overrides = metadataStepOverrides(metadata, kind);
  const steps = integer(state[`${prefix}Steps`], 16, 1, 32);
  const triggerClip = laneArrayValue(overrides?.triggerClips, laneIndex);
  const triggerToggles = laneArrayValue(overrides?.triggerToggles, laneIndex);
  const probability = trimValues(laneArrayValue(overrides?.probability, laneIndex), steps);
  const ratchet = trimValues(laneArrayValue(overrides?.ratchet, laneIndex), steps);
  const trigCondition = trimValues(laneArrayValue(overrides?.trigCondition, laneIndex), steps);
  const content: Record<string, unknown> = {
    generatorPreset: typeof state[`${prefix}Preset`] === 'string' ? state[`${prefix}Preset`] : 'custom',
    steps,
    hits: integer(state[`${prefix}Hits`], 4, 0, steps),
    rotation: integer(state[`${prefix}Rotation`], 0, 0, Math.max(0, steps - 1)),
    baseProbability: finiteNumber(state[`${prefix}Probability`], 1),
    ...(triggerClip ? { triggerClip } : {}),
    ...(triggerToggles && triggerToggles.length > 0 ? { triggerToggles } : {}),
    ...(probability ? { probability } : {}),
    ...(ratchet ? { ratchet } : {}),
    ...(trigCondition ? { trigCondition } : {}),
  };
  const velocityMin = finiteNumber(state[`${prefix}VelocityMin`], 0.5);
  const velocityMax = finiteNumber(state[`${prefix}VelocityMax`], 1);
  content.velocityRange = {
    min: Math.min(velocityMin, velocityMax),
    max: Math.max(velocityMin, velocityMax),
  };
  return content;
}

function normalizedSubLaneState(
  value: SerializedSubLaneState | undefined,
  valuesLength: number,
): SerializedSubLaneState {
  const steps = integer(value?.steps, Math.max(1, valuesLength), 1, 32);
  const direction = value?.direction === 'reverse' || value?.direction === 'pingpong'
    ? value.direction
    : 'forward';
  const rangeMin = finiteNumber(value?.rangeMin, 0);
  const rangeMax = finiteNumber(value?.rangeMax, 1);
  return {
    enabled: value?.enabled === true,
    steps,
    direction,
    ...(value?.valueMode === 'range' ? {
      valueMode: 'range',
      rangeMin: Math.min(rangeMin, rangeMax),
      rangeMax: Math.max(rangeMin, rangeMax),
    } : { valueMode: 'sequence' }),
    ...(value?.followTriggerHits !== undefined ? { followTriggerHits: value.followTriggerHits } : {}),
  };
}

function extractSubLaneContent(
  state: Record<string, unknown>,
  metadata: PresetVersionMetadata | undefined,
  kind: SequencerPageKind,
  laneIndex: number,
  subLane: SequencerSubLaneContentKind,
): Record<string, unknown> | null {
  const overrides = metadataStepOverrides(metadata, kind);
  const subLaneStates = metadataSubLaneStates(metadata, kind);
  const valuesField = STEP_OVERRIDE_FIELD_BY_SUB_LANE[subLane];
  const rawValues = laneArrayValue(
    overrides?.[valuesField] as (number[] | null)[] | undefined,
    laneIndex,
  );
  const rawState = subLaneStates?.[laneIndex]?.[subLane];
  if (rawState?.enabled !== true && (!Array.isArray(rawValues) || rawValues.length === 0)) return null;

  const subLaneState = normalizedSubLaneState(rawState, rawValues?.length ?? 0);
  const values = trimValues(rawValues, subLaneState.steps) ?? [];
  const directionField = DIRECTION_FIELD_BY_SUB_LANE[subLane];
  const serializedDirection = laneArrayValue(
    overrides?.[directionField] as SerializedSubLaneState['direction'][] | undefined,
    laneIndex,
  );
  const rangeField = RANGE_FIELD_BY_SUB_LANE[subLane];
  const serializedRange = rangeField
    ? laneArrayValue(
        overrides?.[rangeField] as ({ min: number; max: number } | null)[] | undefined,
        laneIndex,
      )
    : undefined;
  const content: Record<string, unknown> = {
    kind: subLane,
    enabled: true,
    steps: subLaneState.steps,
    direction: serializedDirection ?? subLaneState.direction,
    valueMode: subLaneState.valueMode ?? 'sequence',
    ...(subLaneState.followTriggerHits !== undefined
      ? { followTriggerHits: subLaneState.followTriggerHits }
      : {}),
    ...(subLaneState.valueMode === 'range'
      ? {
          range: serializedRange ?? {
            min: subLaneState.rangeMin ?? 0,
            max: subLaneState.rangeMax ?? 1,
          },
        }
      : { values }),
  };

  if (subLane === 'pitch') {
    const settings = laneArrayValue(
      kind === 'synth' ? metadata?.synthPitchSettings : metadata?.drumPitchSettings,
      laneIndex,
    );
    const prefix = lanePrefix(kind, laneIndex);
    content.pitch = {
      mode: settings?.mode ?? 'semitones',
      root: integer(settings?.root, 60, 0, 127),
      scale: settings?.scale ?? 'Major',
      ...(kind === 'synth'
        ? {
            bindingMode: laneArrayValue(metadata?.synthPitchBindingModes, laneIndex) ?? 'polyrhythmic',
            register: {
              min: integer(state[`${prefix}NoteMin`], 60, 0, 127),
              max: integer(state[`${prefix}NoteMax`], 72, 0, 127),
            },
          }
        : {}),
    };
  }
  return content;
}

function extractControlContent(
  metadata: PresetVersionMetadata | undefined,
  kind: SequencerPageKind,
  laneIndex: number,
): Record<string, unknown> {
  const clockDiv = laneArrayValue(
    kind === 'synth' ? metadata?.synthClockDivs : metadata?.drumClockDivs,
    laneIndex,
  ) ?? '1/8';
  const swing = laneArrayValue(
    kind === 'synth' ? metadata?.synthSwings : metadata?.drumSwings,
    laneIndex,
  ) ?? 0;
  const linked = laneArrayValue(
    kind === 'synth' ? metadata?.synthLinked : metadata?.drumLinked,
    laneIndex,
  ) ?? false;
  const evolve = laneArrayValue(
    kind === 'synth' ? metadata?.synthEvolveConfigs : metadata?.drumEvolveConfigs,
    laneIndex,
  );
  const playConfig = kind === 'synth'
    ? laneArrayValue(
        metadata?.synthPlayConfigs
          ?? ((metadata as Record<string, unknown> | undefined)?.synthArpConfigs as ProductPlayConfig[] | undefined),
        laneIndex,
      )
    : undefined;
  return {
    clockDiv,
    swing,
    linked,
    ...(evolve ? { evolve } : {}),
    ...(playConfig ? { playConfig } : {}),
  };
}

function extractBinding(
  state: Record<string, unknown>,
  kind: SequencerPageKind,
  laneIndex: number,
): SequencerSlotBinding {
  const prefix = lanePrefix(kind, laneIndex);
  if (kind === 'synth') {
    return {
      kind,
      enabled: booleanValue(state[`${prefix}Enabled`]),
      solo: booleanValue(state[`${prefix}Solo`]),
      level: finiteNumber(state[`${prefix}Level`], 0.8),
      source: state[`${prefix}Source`] ?? 'lead',
      voiceMask: integer(state[`${prefix}VoiceMask`], 128, 1, 255),
    };
  }
  const targets: Record<string, boolean> = {};
  for (const target of ['Sub', 'Kick', 'Click', 'BeepHi', 'BeepLo', 'Noise', 'Membrane']) {
    targets[target.charAt(0).toLowerCase() + target.slice(1)] = booleanValue(state[`${prefix}Target${target}`]);
  }
  return {
    kind,
    enabled: booleanValue(state[`${prefix}Enabled`]),
    solo: booleanValue(state[`${prefix}Solo`]),
    level: finiteNumber(state[`${prefix}Level`], 0.8),
    targets,
  };
}

export function buildSequencerContentGroup(options: {
  state: SliderState | Record<string, unknown>;
  metadata?: PresetVersionMetadata;
  kind: SequencerPageKind;
  laneIndex: number;
}): SequencerContentGroup {
  const { kind, laneIndex, metadata } = options;
  assertLaneIndex(kind, laneIndex);
  const state = stateRecord(options.state);
  const components: SequencerContentComponent[] = [
    {
      componentSlot: 'trigger',
      contentType: 'sequencerTrigger',
      content: extractTriggerContent(state, metadata, kind, laneIndex),
    },
  ];
  for (const subLane of SEQUENCER_SUB_LANE_CONTENT_KINDS) {
    const content = extractSubLaneContent(state, metadata, kind, laneIndex, subLane);
    if (content) {
      components.push({
        componentSlot: subLane,
        contentType: 'sequencerSubLane',
        content,
      });
    }
  }
  components.push({
    componentSlot: 'control',
    contentType: 'sequencerLaneControl',
    content: extractControlContent(metadata, kind, laneIndex),
  });
  return {
    kind,
    laneIndex,
    components,
    binding: extractBinding(state, kind, laneIndex),
  };
}

export function sequencerContentCandidates(group: SequencerContentGroup): PresetContentCandidate[] {
  return group.components.map((component) => ({
    id: `${group.kind}.${group.laneIndex}.${component.componentSlot}`,
    contentType: component.contentType,
    content: component.content,
  }));
}

function cloneMetadata(metadata: PresetVersionMetadata | undefined): PresetVersionMetadata {
  return metadata ? structuredClone(metadata) : {};
}

function setLaneArrayValue<T>(
  current: readonly T[] | undefined,
  laneIndex: number,
  count: number,
  value: T,
): T[] {
  return Array.from({ length: count }, (_, index) => index === laneIndex ? value : current?.[index] as T);
}

function setOverrideLane(
  overrides: SerializedStepOverrides,
  field: keyof SerializedStepOverrides,
  laneIndex: number,
  count: number,
  value: unknown,
): void {
  const current = overrides[field] as unknown[] | undefined;
  (overrides as Record<string, unknown>)[field] = Array.from(
    { length: count },
    (_, index) => index === laneIndex ? value : current?.[index] ?? null,
  );
}

export function applySequencerContentComponents(options: {
  state: SliderState | Record<string, unknown>;
  metadata?: PresetVersionMetadata;
  kind: SequencerPageKind;
  laneIndex: number;
  components: readonly SequencerContentComponent[];
}): { statePatch: Record<string, unknown>; metadata: PresetVersionMetadata } {
  const { kind, laneIndex } = options;
  assertLaneIndex(kind, laneIndex);
  const count = laneCount(kind);
  const prefix = lanePrefix(kind, laneIndex);
  const statePatch: Record<string, unknown> = {};
  const metadata = cloneMetadata(options.metadata);
  const overridesKey = kind === 'synth' ? 'synthStepOverrides' : 'drumStepOverrides';
  const overrides: SerializedStepOverrides = { ...(metadata[overridesKey] ?? {}) };
  const seen = new Set<string>();

  for (const component of options.components) {
    if (seen.has(component.componentSlot)) throw new Error(`Duplicate sequencer component: ${component.componentSlot}`);
    seen.add(component.componentSlot);
    const content = component.content;
    if (component.componentSlot === 'trigger') {
      statePatch[`${prefix}Preset`] = content.generatorPreset ?? 'custom';
      statePatch[`${prefix}Steps`] = content.steps;
      statePatch[`${prefix}Hits`] = content.hits;
      statePatch[`${prefix}Rotation`] = content.rotation;
      statePatch[`${prefix}Probability`] = content.baseProbability;
      if (kind === 'drum' && content.velocityRange && typeof content.velocityRange === 'object') {
        const range = content.velocityRange as { min?: unknown; max?: unknown };
        statePatch[`${prefix}VelocityMin`] = range.min;
        statePatch[`${prefix}VelocityMax`] = range.max;
      }
      for (const [contentKey, overrideField] of [
        ['triggerClip', 'triggerClips'],
        ['triggerToggles', 'triggerToggles'],
        ['probability', 'probability'],
        ['ratchet', 'ratchet'],
        ['trigCondition', 'trigCondition'],
      ] as const) {
        if (content[contentKey] !== undefined) {
          setOverrideLane(overrides, overrideField, laneIndex, count, content[contentKey]);
        }
      }
      continue;
    }
    if (component.componentSlot === 'control') {
      const clockKey = kind === 'synth' ? 'synthClockDivs' : 'drumClockDivs';
      const swingKey = kind === 'synth' ? 'synthSwings' : 'drumSwings';
      const linkedKey = kind === 'synth' ? 'synthLinked' : 'drumLinked';
      const evolveKey = kind === 'synth' ? 'synthEvolveConfigs' : 'drumEvolveConfigs';
      metadata[clockKey] = setLaneArrayValue(metadata[clockKey], laneIndex, count, content.clockDiv as never) as never;
      metadata[swingKey] = setLaneArrayValue(metadata[swingKey], laneIndex, count, content.swing as number) as never;
      metadata[linkedKey] = setLaneArrayValue(metadata[linkedKey], laneIndex, count, content.linked as boolean) as never;
      if (content.evolve) {
        metadata[evolveKey] = setLaneArrayValue(
          metadata[evolveKey],
          laneIndex,
          count,
          content.evolve as SerializedEvolveConfig,
        ) as never;
      }
      if (kind === 'synth' && content.playConfig) {
        const existingPlayConfigs = metadata.synthPlayConfigs
          ?? ((metadata as Record<string, unknown>).synthArpConfigs as ProductPlayConfig[] | undefined);
        metadata.synthPlayConfigs = setLaneArrayValue(
          existingPlayConfigs,
          laneIndex,
          count,
          content.playConfig as never,
        ) as never;
        delete (metadata as Record<string, unknown>).synthArpConfigs;
      }
      continue;
    }

    const subLane = component.componentSlot as SequencerSubLaneContentKind;
    const subLaneState: SerializedSubLaneState = {
      enabled: true,
      steps: integer(content.steps, 1, 1, 32),
      direction: content.direction === 'reverse' || content.direction === 'pingpong'
        ? content.direction
        : 'forward',
      ...(content.valueMode === 'range' ? { valueMode: 'range' } : { valueMode: 'sequence' }),
      ...(content.followTriggerHits !== undefined
        ? { followTriggerHits: Boolean(content.followTriggerHits) }
        : {}),
    };
    if (content.range && typeof content.range === 'object') {
      const range = content.range as { min?: unknown; max?: unknown };
      subLaneState.rangeMin = finiteNumber(range.min, 0);
      subLaneState.rangeMax = finiteNumber(range.max, 1);
    }
    const statesKey = kind === 'synth' ? 'synthSubLaneStates' : 'drumSubLaneStates';
    const currentStates = metadata[statesKey] ?? [];
    const laneState = { ...(currentStates[laneIndex] ?? {}), [subLane]: subLaneState };
    metadata[statesKey] = setLaneArrayValue(currentStates, laneIndex, count, laneState) as never;
    if (content.values !== undefined) {
      setOverrideLane(overrides, STEP_OVERRIDE_FIELD_BY_SUB_LANE[subLane], laneIndex, count, content.values);
    }
    setOverrideLane(overrides, DIRECTION_FIELD_BY_SUB_LANE[subLane], laneIndex, count, subLaneState.direction);
    if (content.range !== undefined && RANGE_FIELD_BY_SUB_LANE[subLane]) {
      setOverrideLane(overrides, RANGE_FIELD_BY_SUB_LANE[subLane]!, laneIndex, count, content.range);
    }
    if (subLane === 'pitch' && content.pitch && typeof content.pitch === 'object') {
      const pitch = content.pitch as Record<string, unknown>;
      const settings: SerializedPitchSettings = {
        mode: pitch.mode === 'notes' || pitch.mode === 'noteRange' ? pitch.mode : 'semitones',
        root: integer(pitch.root, 60, 0, 127),
        scale: typeof pitch.scale === 'string' ? pitch.scale as SerializedPitchSettings['scale'] : 'Major',
      };
      const pitchKey = kind === 'synth' ? 'synthPitchSettings' : 'drumPitchSettings';
      metadata[pitchKey] = setLaneArrayValue(metadata[pitchKey], laneIndex, count, settings) as never;
      if (kind === 'synth') {
        metadata.synthPitchBindingModes = setLaneArrayValue(
          metadata.synthPitchBindingModes,
          laneIndex,
          count,
          (pitch.bindingMode === 'linked' || pitch.bindingMode === 'sequence'
            ? pitch.bindingMode
            : 'polyrhythmic') as PitchBindingMode,
        );
        if (pitch.register && typeof pitch.register === 'object') {
          const register = pitch.register as Record<string, unknown>;
          const low = integer(register.min, 60, 0, 127);
          const high = integer(register.max, 72, 0, 127);
          statePatch[`${prefix}NoteMin`] = Math.min(low, high);
          statePatch[`${prefix}NoteMax`] = Math.max(low, high);
        }
      }
    }
  }
  metadata[overridesKey] = overrides;
  return { statePatch, metadata };
}

export function stripSequencerStateFromSoundContent(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => {
      const scope = PARAM_REGISTRY[key]?.scope;
      return scope !== 'synthEuclidean'
        && scope !== 'drumEuclidean'
        && key !== 'synthSequencerFaces'
        && key !== 'synthSequencerChain'
        && key !== 'drumSequencerChain';
    }),
  );
}

const SEQUENCER_SLOT_BINDING_SUFFIX = /^(?:Enabled|Solo|Level|Source|VoiceMask|ResumeQuantization|NoteMin|NoteMax|Target[A-Z][A-Za-z0-9]*)$/;

export function stripPortableSequencerContentFromL4Override(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([key]) => {
    const match = /^(?:synth|drum)Euclid[1-9][0-9]*(.+)$/.exec(key);
    return !match || SEQUENCER_SLOT_BINDING_SUFFIX.test(match[1] ?? '');
  }));
}

const SEQUENCER_METADATA_FIELDS: readonly (keyof PresetVersionMetadata)[] = [
  'drumEvolveConfigs', 'synthEvolveConfigs', 'drumStepOverrides', 'synthStepOverrides',
  'drumClockDivs', 'synthClockDivs', 'drumSwings', 'synthSwings', 'drumLinked', 'synthLinked',
  'drumSubLaneStates', 'synthSubLaneStates', 'synthPlayConfigs', 'drumPitchSettings',
  'synthPitchSettings', 'synthPitchBindingModes',
];

export function stripSequencerMetadataFromSoundContent(
  metadata: PresetVersionMetadata | undefined,
): PresetVersionMetadata | undefined {
  if (!metadata) return undefined;
  const stripped = { ...metadata };
  for (const field of SEQUENCER_METADATA_FIELDS) delete stripped[field];
  // Legacy Play metadata is decode-only; do not carry it into authored sound
  // content even when a caller passes an unnormalized old object.
  delete (stripped as Record<string, unknown>).synthArpConfigs;
  return Object.keys(stripped).length > 0 ? stripped : undefined;
}
