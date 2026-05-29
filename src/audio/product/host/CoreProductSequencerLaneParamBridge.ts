import {
  createCoreProductSequencerLaneParamEvent,
  type CoreProductEvent,
} from '../../coreProductEvents';
import type { SequencerKind } from '../../CoreProductHostSequencerAdapter';
import {
  normalizeSequencerPitchBindingMode,
  sequencerPitchBindingModeFromEventId,
} from '../../sequencerPitchBinding';

export function patchCoreProductSequencerLaneAdapterParam(
  adapterState: Record<string, unknown>,
  sequencer: SequencerKind,
  laneIndex: number,
  suffix: 'ClockDivision' | 'Swing',
  value: number,
): Record<string, unknown> {
  if (laneIndex < 0 || laneIndex >= 16) return adapterState;
  const prefix = sequencer === 'synth' ? 'synthEuclid' : 'drumEuclid';
  return { ...adapterState, [`${prefix}${laneIndex + 1}${suffix}`]: value };
}

export function applyCoreProductSequencerLaneParamSet(options: {
  adapterState: Record<string, unknown>;
  sequencer: SequencerKind;
  suffix: 'ClockDivision' | 'Swing';
  values: unknown[];
  paramId: number;
  mapValue: (value: unknown) => number;
  runtimeReady: boolean;
  post: (event: CoreProductEvent) => void;
}): Record<string, unknown> {
  const prefix = options.sequencer === 'synth' ? 'synthEuclid' : 'drumEuclid';
  const patch: Record<string, unknown> = {};
  for (let index = 0; index < Math.min(options.values.length, 4); index += 1) {
    patch[`${prefix}${index + 1}${options.suffix}`] = options.mapValue(options.values[index]);
  }
  if (options.runtimeReady) {
    for (let laneIndex = 0; laneIndex < Math.min(options.values.length, 16); laneIndex += 1) {
      options.post(createCoreProductSequencerLaneParamEvent(options.sequencer, laneIndex, options.paramId, options.mapValue(options.values[laneIndex])));
    }
  }
  return { ...options.adapterState, ...patch };
}

export function patchCoreProductSynthPitchBindingModeFromEvent(
  adapterState: Record<string, unknown>,
  laneIndex: number,
  event: CoreProductEvent,
): Record<string, unknown> {
  if (laneIndex < 0 || laneIndex >= 16) return adapterState;
  const existing = Array.isArray(adapterState.synthPitchBindingModes)
    ? adapterState.synthPitchBindingModes
    : [];
  const laneCount = Math.max(4, Math.min(16, Math.max(existing.length, laneIndex + 1)));
  const modes = Array.from({ length: laneCount }, (_, index) =>
    normalizeSequencerPitchBindingMode(existing[index])
  );
  modes[laneIndex] = sequencerPitchBindingModeFromEventId(
    event.value2,
    event.value === 1 ? 'sequence' : 'polyrhythmic',
  );
  return { ...adapterState, synthPitchBindingModes: modes };
}
