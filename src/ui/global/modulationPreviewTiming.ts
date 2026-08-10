import type {
  DualSliderShapeDivision,
  ModulationSourceConfig,
} from '../sliderSystem/dualConfigReducer';

export type ModulationPreviewClock = {
  barDurationSec: number;
  phraseDurationSec: number;
};

const DIVISION_DURATION_MULTIPLIER: Record<DualSliderShapeDivision, number> = {
  '4x': 4,
  '2x': 2,
  '1': 1,
  '1/2': 1 / 2,
  '1/4': 1 / 4,
  '1/8': 1 / 8,
  '1/16': 1 / 16,
};

export function getModulationPreviewDurationSec(
  source: ModulationSourceConfig,
  clock: ModulationPreviewClock,
): number {
  if (source.type === 'shape') {
    if (source.shape.timing.mode === 'sync') {
      const referenceDuration = source.shape.timing.reference === 'bar'
        ? clock.barDurationSec
        : clock.phraseDurationSec;
      return Math.max(0.05, referenceDuration * DIVISION_DURATION_MULTIPLIER[source.shape.timing.division]);
    }

    // Free/Link keep their own phase behavior, but Speed is expressed as
    // cycles per effective project phrase (1x = one cycle per phrase).
    return Math.max(0.05, clock.phraseDurationSec / Math.max(0.01, source.shape.timing.speed));
  }

  if (source.type === 'walk') {
    // A walk does not have a cycle; this is a four-second preview window at 1x.
    return Math.max(0.2, 4 / Math.max(0.01, source.walk.speed));
  }

  // Sample & Hold is trigger-driven, so its static preview uses a neutral window.
  return 4;
}
