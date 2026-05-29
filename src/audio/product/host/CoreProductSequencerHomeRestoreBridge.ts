import {
  createCoreProductSequencerLaneParamEvent,
  type CoreProductEvent,
  type CoreProductStepValueField,
} from '../../coreProductEvents';
import type { SequencerKind } from '../../CoreProductHostSequencerAdapter';
import {
  coreProductSequencerHomePayload,
  postCoreProductSequencerLaneStepState,
  type CoreProductSequencerHomeState,
} from '../../CoreProductHostSequencerHome';
import { patchCoreProductSequencerLaneSwing } from '../../CoreProductHostSequencerSwing';
import { KESSHO_PRODUCT_PARAM_IDS } from '../../generated/kesshoProductParams';
import {
  ensureCoreProductSequencerLaneCache,
  selectCoreProductSequencerCache,
  type CoreProductSequencerCacheState,
} from './CoreProductSequencerCacheBridge';

type CoreProductSequencerHomeRestoreOptions = {
  sequencer: SequencerKind;
  laneIndex: number;
  cache: CoreProductSequencerCacheState;
  adapterState: Record<string, unknown>;
  runtimeReady: boolean;
  restoreHome: (sequencer: SequencerKind, laneIndex: number) => CoreProductSequencerHomeState | null;
  fieldEnabled: (field: CoreProductStepValueField) => boolean;
  post: (event: CoreProductEvent) => void;
  publish: (name: string, laneIndex: number, ...args: unknown[]) => void;
  setSynthNoteRangeOverride: (laneIndex: number, value: { min: number; max: number } | null) => void;
  synthBaseMidi: (laneIndex: number) => number;
  drumBaseMidi: (laneIndex: number) => number;
  synthPitchSettings?: unknown;
};

export function restoreCoreProductSequencerLaneHome(
  options: CoreProductSequencerHomeRestoreOptions,
): { restored: boolean; adapterState: Record<string, unknown> } {
  const laneIndex = Math.max(0, Math.min(15, Math.trunc(options.laneIndex)));
  const home = options.restoreHome(options.sequencer, laneIndex);
  if (!home) return { restored: false, adapterState: options.adapterState };

  ensureCoreProductSequencerLaneCache(options.cache, options.sequencer, laneIndex);
  const { toggles, values, configs } = selectCoreProductSequencerCache(options.cache, options.sequencer);
  toggles[laneIndex] = home.toggles;
  values[laneIndex] = home.values;
  configs[laneIndex] = home.configs;

  const swingPatch = patchCoreProductSequencerLaneSwing(options.adapterState, options.sequencer, laneIndex, home.swing);
  const restored = { ...home, swing: swingPatch.swing };

  if (options.runtimeReady) {
    postCoreProductSequencerLaneStepState({
      sequencer: options.sequencer,
      laneIndex,
      state: restored,
      fieldEnabled: options.fieldEnabled,
      post: options.post,
    });
  }

  if (options.sequencer === 'synth') {
    options.setSynthNoteRangeOverride(laneIndex, null);
    if (home.noteRange) {
      const midiNote = (home.noteRange.min + home.noteRange.max) * 0.5;
      if (options.runtimeReady) {
        options.post(createCoreProductSequencerLaneParamEvent('synth', laneIndex, KESSHO_PRODUCT_PARAM_IDS.SequencerLaneMidiNote, midiNote));
      }
      options.publish('synthNoteRangeEvolved', laneIndex, home.noteRange.min, home.noteRange.max);
    }
  }

  const baseMidi = options.sequencer === 'synth' ? options.synthBaseMidi(laneIndex) : options.drumBaseMidi(laneIndex);
  options.publish(
    options.sequencer === 'synth' ? 'synthEvolveOverrides' : 'drumEvolveOverrides',
    laneIndex,
    coreProductSequencerHomePayload(options.sequencer, laneIndex, restored, baseMidi, options.synthPitchSettings),
  );

  return { restored: true, adapterState: swingPatch.adapterState };
}
