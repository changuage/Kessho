import {
  createCoreProductSequencerLaneParamEvent,
  type CoreProductEvent,
} from '../../coreProductEvents';
import type { NormalizedSequencerEvolveConfig } from '../../CoreProductHostSequencerEvolveConfig';
import { evolveCoreProductSynthNoteRange } from '../../CoreProductHostSynthNoteRangeEvolve';
import { KESSHO_PRODUCT_PARAM_IDS } from '../../generated/kesshoProductParams';

type NoteRange = { min: number; max: number };

export function evolveCoreProductSequencerSynthNoteRange(options: {
  laneIndex: number;
  config: NormalizedSequencerEvolveConfig;
  seed: number;
  latestSliderState: Record<string, unknown> | null;
  synthPitchSettings: unknown;
  synthNoteRangeOverrides: (NoteRange | null)[];
  runtimeReady: boolean;
  restoreHomeNoteRange: (laneIndex: number) => NoteRange | null;
  setSynthNoteRangeOverride: (laneIndex: number, range: NoteRange) => void;
  post: (event: CoreProductEvent) => void;
  publish: (laneIndex: number, noteMin: number, noteMax: number) => void;
}): { handled: boolean; changed: boolean } {
  const home = options.restoreHomeNoteRange(options.laneIndex);
  const evolved = evolveCoreProductSynthNoteRange({
    laneIndex: options.laneIndex,
    config: options.config,
    seed: options.seed,
    state: options.latestSliderState,
    pitchSettings: options.synthPitchSettings,
    current: options.synthNoteRangeOverrides[options.laneIndex],
    home,
  });
  if (evolved.range && typeof evolved.midiNote === 'number') {
    options.setSynthNoteRangeOverride(options.laneIndex, evolved.range);
    if (options.runtimeReady) {
      options.post(createCoreProductSequencerLaneParamEvent('synth', options.laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMidiNote, evolved.midiNote));
    }
    options.publish(options.laneIndex, evolved.range.min, evolved.range.max);
  }
  return { handled: evolved.handled, changed: !!evolved.range };
}
