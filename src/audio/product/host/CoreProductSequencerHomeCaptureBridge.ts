import type { LaneDirection } from '../../sequencerLaneDirection';
import type { SequencerKind } from '../../CoreProductHostSequencerAdapter';
import { type CoreProductSequencerHomeState } from '../../CoreProductHostSequencerHome';
import { getCoreProductSequencerLaneSwing } from '../../CoreProductHostSequencerSwing';
import { coreProductSynthNoteRangeHome } from '../../CoreProductHostSynthNoteRangeEvolve';
import { normalizeSequencerPitchSettings, type SequencerPitchSettings } from '../../sequencerPitchSettings';
import {
  ensureCoreProductSequencerLaneCache,
  selectCoreProductSequencerCache,
  type CoreProductSequencerCacheState,
} from './CoreProductSequencerCacheBridge';

type CoreProductSequencerHomeCaptureOptions = {
  sequencer: SequencerKind;
  laneIndex: number;
  force: boolean;
  requireContent: boolean;
  cache: CoreProductSequencerCacheState;
  adapterState: Record<string, unknown>;
  latestSliderState: Record<string, unknown> | null;
  synthNoteRangeOverrides: ({ min: number; max: number } | null)[];
  drumPitchSettings?: SequencerPitchSettings | null;
  pitchState?: { steps?: number; direction?: LaneDirection; scaleQuantize?: boolean } | null;
  capture: (
    sequencer: SequencerKind,
    laneIndex: number,
    state: CoreProductSequencerHomeState,
    options: { force?: boolean; requireContent?: boolean },
  ) => void;
};

export function captureCoreProductSequencerHomeLane(options: CoreProductSequencerHomeCaptureOptions): void {
  if (!Number.isInteger(options.laneIndex) || options.laneIndex < 0 || options.laneIndex >= 16) return;
  ensureCoreProductSequencerLaneCache(options.cache, options.sequencer, options.laneIndex);
  const { toggles, values, configs } = selectCoreProductSequencerCache(options.cache, options.sequencer);
  const noteRange = options.sequencer === 'synth'
    ? coreProductSynthNoteRangeHome({
      laneIndex: options.laneIndex,
      state: options.latestSliderState,
      pitchSettings: options.adapterState.synthPitchSettings,
      current: options.synthNoteRangeOverrides[options.laneIndex],
    })
    : null;
  const synthPitchSettings = Array.isArray(options.adapterState.synthPitchSettings)
    ? options.adapterState.synthPitchSettings[options.laneIndex]
    : undefined;
  const pitchSettings = options.sequencer === 'synth'
    ? normalizeSequencerPitchSettings(synthPitchSettings)
    : options.drumPitchSettings
      ? normalizeSequencerPitchSettings(options.drumPitchSettings)
      : null;
  const pitchSubLaneState = options.pitchState
    ? {
      steps: options.pitchState.steps,
      direction: options.pitchState.direction,
      scaleQuantize: options.pitchState.scaleQuantize,
    }
    : null;
  options.capture(options.sequencer, options.laneIndex, {
    toggles: toggles[options.laneIndex] ?? [],
    values: values[options.laneIndex] ?? [],
    configs: configs[options.laneIndex] ?? [],
    swing: getCoreProductSequencerLaneSwing(options.adapterState, options.latestSliderState, options.sequencer, options.laneIndex),
    ...(noteRange ? { noteRange } : {}),
    ...(pitchSettings ? { pitchSettings } : {}),
    ...(pitchSubLaneState ? { pitchSubLaneState } : {}),
  }, { force: options.force, requireContent: options.requireContent });
}
