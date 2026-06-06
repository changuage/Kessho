import {
  CORE_PRODUCT_DICE_FLAGS,
  CORE_PRODUCT_EVOLVE_FLAGS,
  CORE_PRODUCT_HOST_PARAM_IDS,
  type CoreProductEvent,
} from '../../coreProductEvents';
import {
  evolveMethodsForFlags,
  type NormalizedSequencerEvolveConfig,
  type SequencerEvolveKind,
} from '../../CoreProductHostSequencerEvolveConfig';
import type { SequencerKind } from '../../CoreProductHostSequencerAdapter';
import { KESSHO_PRODUCT_EVENT_IDS } from '../../generated/kesshoProductEvents';

type EvolveConfigEventResult = {
  handled: boolean;
  adapterState: Record<string, unknown>;
};

export function applyCoreProductSequencerEvolveConfigEvent(options: {
  event: CoreProductEvent;
  sequencer: SequencerKind;
  laneIndex: number;
  adapterState: Record<string, unknown>;
}): EvolveConfigEventResult {
  const { event, sequencer, laneIndex, adapterState } = options;
  if (event.eventKind !== KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane) return { handled: false, adapterState };
  if (event.paramId !== CORE_PRODUCT_HOST_PARAM_IDS.SequencerEvolveConfig) return { handled: false, adapterState };
  const key = sequencer === 'synth' ? 'synthEuclidEvolveConfigs' : 'drumEuclidEvolveConfigs';
  if (typeof event.value === 'number' && event.value < 0) return { handled: true, adapterState: { ...adapterState, [key]: [] } };
  const configs = Array.isArray(adapterState[key]) ? [...adapterState[key] as NormalizedSequencerEvolveConfig[]] : [];
  while (configs.length <= laneIndex && configs.length < 4) configs.push(defaultDisabledConfig(sequencer));
  if (laneIndex >= 0 && laneIndex < 4) configs[laneIndex] = configFromEvent(event, sequencer);
  return { handled: true, adapterState: { ...adapterState, [key]: configs } };
}

function configFromEvent(event: CoreProductEvent, sequencer: SequencerEvolveKind): NormalizedSequencerEvolveConfig {
  const flags = event.flags ?? 0;
  return {
    enabled: event.value === 1,
    evolution: boundedNumber(event.value2, 0.25, 0, 1),
    everyBars: Math.max(1, Math.round(boundedNumber(event.value3, 4, 1, 1024))),
    writeOffset: typeof event.value4 === 'number' && Number.isFinite(event.value4) && event.value4 >= 0 ? Math.round(event.value4) : 'auto',
    mutationMode: (flags & CORE_PRODUCT_EVOLVE_FLAGS.mutationStrict) !== 0 ? 'strict' : 'biased',
    methods: evolveMethodsForFlags(flags, sequencer),
    ...enabledSubLanesFromFlags(flags),
  };
}

function defaultDisabledConfig(sequencer: SequencerEvolveKind): NormalizedSequencerEvolveConfig {
  return configFromEvent({ eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane, value: 0, flags: 0 }, sequencer);
}

function enabledSubLanesFromFlags(flags: number): { enabledSubLanes?: string[] } {
  if ((flags & CORE_PRODUCT_EVOLVE_FLAGS.evolveConfigSubLaneMask) === 0) return {};
  const lanes: string[] = [];
  if ((flags & CORE_PRODUCT_DICE_FLAGS.probability) !== 0) lanes.push('probability');
  if ((flags & CORE_PRODUCT_DICE_FLAGS.ratchet) !== 0) lanes.push('ratchet');
  if ((flags & CORE_PRODUCT_DICE_FLAGS.midiNote) !== 0) lanes.push('pitch');
  if ((flags & CORE_PRODUCT_DICE_FLAGS.expression) !== 0) lanes.push('expression');
  if ((flags & CORE_PRODUCT_DICE_FLAGS.morph) !== 0) lanes.push('morph');
  if ((flags & CORE_PRODUCT_DICE_FLAGS.distance) !== 0) lanes.push('distance');
  return { enabledSubLanes: lanes };
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, numeric));
}
