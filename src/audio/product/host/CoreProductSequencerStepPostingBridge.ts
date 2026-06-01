import {
  CORE_PRODUCT_STEP_TOGGLE_FLAGS,
  CORE_PRODUCT_STEP_VALUE_FIELDS,
  createCoreProductSequencerClearStepsEvent,
  createCoreProductSequencerStepEvent,
  createCoreProductSequencerStepValueEvent,
  createCoreProductSequencerSubLaneConfigEvent,
  type CoreProductEvent,
  type CoreProductStepValueField,
} from '../../coreProductEvents';
import type { SequencerKind, SequencerStepValueConfig, SequencerStepValueOverride } from '../../CoreProductHostSequencerAdapter';
import { coreProductSynthMidiToUiPitch } from '../../CoreProductHostSynthPitch';
import {
  coreProductSequencerLaneCacheCount,
  selectCoreProductSequencerCache,
  type CoreProductSequencerCacheState,
} from './CoreProductSequencerCacheBridge';

export function coreProductStepValueFieldSubLaneKey(field: CoreProductStepValueField): string | null {
  switch (field) {
    case CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote:
      return 'pitch';
    case CORE_PRODUCT_STEP_VALUE_FIELDS.expression:
      return 'expression';
    case CORE_PRODUCT_STEP_VALUE_FIELDS.morph:
      return 'morph';
    case CORE_PRODUCT_STEP_VALUE_FIELDS.distance:
      return 'distance';
    default:
      return null;
  }
}

export function coreProductStepValueFieldEnabled(
  synthSubLaneEnabled: Record<string, boolean>[],
  drumSubLaneEnabled: Record<string, boolean>[],
  sequencer: SequencerKind,
  laneIndex: number,
  field: CoreProductStepValueField,
): boolean {
  const key = coreProductStepValueFieldSubLaneKey(field);
  if (!key) return true;
  const lanes = sequencer === 'synth' ? synthSubLaneEnabled : drumSubLaneEnabled;
  return lanes[laneIndex]?.[key] === true;
}

export function createCoreProductEvolvedStepValuePayload(options: {
  sequencer: SequencerKind;
  laneIndex: number;
  field: CoreProductStepValueField;
  overrides: SequencerStepValueOverride[];
  baseMidi: number;
  synthPitchSettings?: unknown;
}): { key: 'pitch' | 'expression' | 'morph' | 'distance'; values: number[] } | null {
  const key = coreProductStepValueFieldSubLaneKey(options.field);
  if (key !== 'pitch' && key !== 'expression' && key !== 'morph' && key !== 'distance') return null;
  const entries = options.overrides.filter(isStepValueOverride).filter((entry) => entry.field === options.field).sort((left, right) => left.step - right.step);
  if (entries.length === 0) return null;
  const values = entries.map((entry) => entry.value);
  return {
    key,
    values: options.field === CORE_PRODUCT_STEP_VALUE_FIELDS.midiNote
      ? options.sequencer === 'synth'
        ? coreProductSynthMidiToUiPitch(values, options.synthPitchSettings, options.laneIndex, options.baseMidi)
        : values.map((value) => Math.round(value - options.baseMidi))
      : values,
  };
}

export function postCoreProductSequencerStepValueOverrides(options: {
  sequencer: SequencerKind;
  laneIndex: number;
  overrides: SequencerStepValueOverride[];
  fields: CoreProductStepValueField[];
  synthSubLaneEnabled: Record<string, boolean>[];
  drumSubLaneEnabled: Record<string, boolean>[];
  post: (event: CoreProductEvent) => void;
}): void {
  const changed = new Set(options.fields);
  for (const stepValue of options.overrides) {
    if (!isStepValueOverride(stepValue)) continue;
    if (!changed.has(stepValue.field)) continue;
    if (!coreProductStepValueFieldEnabled(options.synthSubLaneEnabled, options.drumSubLaneEnabled, options.sequencer, options.laneIndex, stepValue.field)) continue;
    options.post(createCoreProductSequencerStepValueEvent(options.sequencer, options.laneIndex, stepValue.step, stepValue.field, stepValue.value, stepValue.value2 ?? 0, stepValue.range ? CORE_PRODUCT_STEP_TOGGLE_FLAGS.rangeValue : 0));
  }
}

export function syncCoreProductSequencerStepState(options: {
  sequencer: SequencerKind;
  cache: CoreProductSequencerCacheState;
  forceClear: boolean;
  synthSubLaneEnabled: Record<string, boolean>[];
  drumSubLaneEnabled: Record<string, boolean>[];
  post: (event: CoreProductEvent) => void;
}): void {
  const { toggles, values, configs } = selectCoreProductSequencerCache(options.cache, options.sequencer);
  const laneCount = coreProductSequencerLaneCacheCount(options.cache, options.sequencer);
  for (let laneIndex = 0; laneIndex < laneCount; laneIndex += 1) {
    const laneToggles = toggles[laneIndex] ?? [];
    const activeStepValues = (values[laneIndex] ?? [])
      .filter(isStepValueOverride)
      .filter((stepValue) => coreProductStepValueFieldEnabled(options.synthSubLaneEnabled, options.drumSubLaneEnabled, options.sequencer, laneIndex, stepValue.field));
    const activeStepConfigs = (configs[laneIndex] ?? [])
      .filter(isStepValueConfig)
      .filter((config) => coreProductStepValueFieldEnabled(options.synthSubLaneEnabled, options.drumSubLaneEnabled, options.sequencer, laneIndex, config.field));
    if (options.forceClear || laneToggles.length > 0 || activeStepValues.length > 0 || activeStepConfigs.length > 0) options.post(createCoreProductSequencerClearStepsEvent(options.sequencer, laneIndex));
    for (const config of activeStepConfigs) options.post(createCoreProductSequencerSubLaneConfigEvent(options.sequencer, laneIndex, config.field, config.steps, config.direction));
    for (const toggle of laneToggles) options.post(createCoreProductSequencerStepEvent(options.sequencer, laneIndex, toggle.step, toggle.value));
    for (const stepValue of activeStepValues) options.post(createCoreProductSequencerStepValueEvent(options.sequencer, laneIndex, stepValue.step, stepValue.field, stepValue.value, stepValue.value2 ?? 0, stepValue.range ? CORE_PRODUCT_STEP_TOGGLE_FLAGS.rangeValue : 0));
  }
}

function isStepValueOverride(entry: SequencerStepValueOverride | null | undefined): entry is SequencerStepValueOverride {
  return typeof entry === 'object' && entry !== null && typeof entry.field === 'number';
}

function isStepValueConfig(entry: SequencerStepValueConfig | null | undefined): entry is SequencerStepValueConfig {
  return typeof entry === 'object' && entry !== null && typeof entry.field === 'number';
}
