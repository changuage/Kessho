import type { LaneDirection } from '../../sequencerLaneDirection';
import type { SequencerKind, SequencerStepValueConfig } from '../../CoreProductHostSequencerAdapter';
import { CORE_PRODUCT_SUBLANE_DIRECTIONS, type CoreProductStepValueField, type CoreProductSubLaneDirection } from '../../coreProductEvents';
import { type CoreProductSequencerHomeState } from '../../CoreProductHostSequencerHome';
import { getCoreProductSequencerLaneSwing } from '../../CoreProductHostSequencerSwing';
import { coreProductSynthNoteRangeHome } from '../../CoreProductHostSynthNoteRangeEvolve';
import { normalizeSequencerPitchSettings, type SequencerPitchSettings } from '../../sequencerPitchSettings';
import { ensureCoreProductSequencerLaneCache, selectCoreProductSequencerCache, type CoreProductSequencerCacheState } from './CoreProductSequencerCacheBridge';

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
  const laneValues = values[options.laneIndex] ?? [];
  const laneConfigs = configs[options.laneIndex] ?? [];
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
  const drumPitchSettings = options.drumPitchSettings ??
    (Array.isArray(options.adapterState.drumPitchSettings) ? options.adapterState.drumPitchSettings[options.laneIndex] : undefined);
  const pitchSettings = options.sequencer === 'synth'
    ? normalizeSequencerPitchSettings(synthPitchSettings)
    : drumPitchSettings
      ? normalizeSequencerPitchSettings(drumPitchSettings)
      : null;
  const pitchSubLaneState = options.pitchState
    ? {
      ...(typeof options.pitchState.steps === 'number' && Number.isFinite(options.pitchState.steps)
        ? { steps: options.pitchState.steps }
        : {}),
      ...(options.pitchState.direction
        ? { direction: options.pitchState.direction }
        : {}),
      ...(typeof options.pitchState.scaleQuantize === 'boolean'
        ? { scaleQuantize: false }
        : {}),
    }
    : null;
  options.capture(options.sequencer, options.laneIndex, {
    toggles: toggles[options.laneIndex] ?? [],
    values: laneValues,
    configs: laneConfigs.length > 0 ? laneConfigs : inferCoreProductHomeConfigs(laneValues),
    swing: getCoreProductSequencerLaneSwing(options.adapterState, options.latestSliderState, options.sequencer, options.laneIndex),
    ...(noteRange ? { noteRange } : {}),
    ...(pitchSettings ? { pitchSettings } : {}),
    ...(pitchSubLaneState ? { pitchSubLaneState } : {}),
  }, { force: options.force, requireContent: options.requireContent });
}

function inferCoreProductHomeConfigs(values: { step: number; field: CoreProductStepValueField }[]): SequencerStepValueConfig[] {
  const maxStepByField = new Map<CoreProductStepValueField, number>();
  const direction = CORE_PRODUCT_SUBLANE_DIRECTIONS.forward as CoreProductSubLaneDirection;
  for (const value of values) {
    if (!Number.isInteger(value.step) || value.step < 0) continue;
    maxStepByField.set(value.field, Math.max(maxStepByField.get(value.field) ?? -1, value.step));
  }
  return Array.from(maxStepByField, ([field, maxStep]) => ({
    field,
    steps: Math.max(1, Math.min(64, maxStep + 1)),
    direction,
  }));
}
