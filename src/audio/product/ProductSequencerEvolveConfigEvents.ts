import {
  CORE_PRODUCT_DICE_FLAGS,
  CORE_PRODUCT_EVOLVE_FLAGS,
  CORE_PRODUCT_HOST_PARAM_IDS,
  CORE_PRODUCT_SEQUENCER_IDS,
  type CoreProductEvent,
} from '../coreProductEvents';
import {
  evolveMethodFlagsForEvolveConfig,
  normalizeEvolveConfigs,
  type NormalizedSequencerEvolveConfig,
  type SequencerEvolveKind,
} from '../CoreProductHostSequencerEvolveConfig';
import { KESSHO_PRODUCT_EVENT_IDS } from '../generated/kesshoProductEvents';

export function createCoreProductSequencerEvolveConfigEvents(
  sequencer: SequencerEvolveKind,
  configs: unknown,
): CoreProductEvent[] {
  const normalized = normalizeEvolveConfigs(configs, sequencer);
  const events: CoreProductEvent[] = [createClearEvolveConfigsEvent(sequencer)];
  for (let laneIndex = 0; laneIndex < normalized.length; laneIndex += 1) {
    const config = normalized[laneIndex];
    if (config) events.push(createEvolveConfigEvent(sequencer, laneIndex, config));
  }
  return events;
}

function createClearEvolveConfigsEvent(sequencer: SequencerEvolveKind): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane,
    targetId: CORE_PRODUCT_SEQUENCER_IDS[sequencer],
    index: 0,
    paramId: CORE_PRODUCT_HOST_PARAM_IDS.SequencerEvolveConfig,
    value: -1,
  };
}

function createEvolveConfigEvent(
  sequencer: SequencerEvolveKind,
  laneIndex: number,
  config: NormalizedSequencerEvolveConfig,
): CoreProductEvent {
  return {
    eventKind: KESSHO_PRODUCT_EVENT_IDS.SetSequencerLane,
    targetId: CORE_PRODUCT_SEQUENCER_IDS[sequencer],
    index: laneIndex,
    paramId: CORE_PRODUCT_HOST_PARAM_IDS.SequencerEvolveConfig,
    value: config.enabled ? 1 : 0,
    value2: config.evolution,
    value3: config.everyBars,
    value4: config.writeOffset === 'auto' ? -1 : config.writeOffset,
    flags: evolveMethodFlagsForEvolveConfig(config) | enabledSubLaneFlags(config),
  };
}

function enabledSubLaneFlags(config: NormalizedSequencerEvolveConfig): number {
  if (!config.enabledSubLanes) return 0;
  let flags = CORE_PRODUCT_EVOLVE_FLAGS.evolveConfigSubLaneMask;
  for (const lane of config.enabledSubLanes) {
    if (lane === 'probability') flags |= CORE_PRODUCT_DICE_FLAGS.probability;
    else if (lane === 'ratchet') flags |= CORE_PRODUCT_DICE_FLAGS.ratchet;
    else if (lane === 'pitch') flags |= CORE_PRODUCT_DICE_FLAGS.midiNote;
    else if (lane === 'expression') flags |= CORE_PRODUCT_DICE_FLAGS.expression;
    else if (lane === 'morph') flags |= CORE_PRODUCT_DICE_FLAGS.morph;
    else if (lane === 'distance') flags |= CORE_PRODUCT_DICE_FLAGS.distance;
  }
  return flags;
}
