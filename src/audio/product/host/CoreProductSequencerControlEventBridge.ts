import { KESSHO_PRODUCT_EVENT_IDS } from '../../generated/kesshoProductEvents';
import type { CoreProductEvent } from '../../coreProductEvents';
import type { SequencerKind } from '../../CoreProductHostSequencerAdapter';

type CoreProductSequencerControlEventOptions = {
  event: CoreProductEvent;
  sequencer: SequencerKind;
  laneIndex: number;
  restoreLaneHome: (sequencer: SequencerKind, laneIndex: number) => boolean;
  armManualDice: (sequencer: SequencerKind, laneIndex: number) => void;
  postControlEvent: (event: CoreProductEvent) => void;
  publish: (name: string, laneIndex: number) => void;
};

export function handleCoreProductSequencerControlEvent(options: CoreProductSequencerControlEventOptions): boolean {
  if (options.event.eventKind === KESSHO_PRODUCT_EVENT_IDS.ResetSequencerLaneHome) {
    if (options.restoreLaneHome(options.sequencer, options.laneIndex)) return true;
    if (options.sequencer === 'synth') return true;
    options.postControlEvent(options.event);
    return true;
  }

  if (options.event.eventKind === KESSHO_PRODUCT_EVENT_IDS.DiceSequencerLane) {
    options.armManualDice(options.sequencer, options.laneIndex);
    options.postControlEvent(options.event);
    options.publish(options.sequencer === 'synth' ? 'synthEuclidEvolve' : 'drumEuclidEvolve', options.laneIndex);
    return true;
  }

  return false;
}
