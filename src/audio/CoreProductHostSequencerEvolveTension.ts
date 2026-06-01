import type { CoreProductSnapshot } from './coreProductSnapshot';
import type { CoreProductTelemetrySnapshot } from './coreProductTelemetry';
import { getEffectiveTension } from './harmony';
import type { SequencerKind } from './CoreProductHostSequencerAdapter';

const finiteNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const boundedUnit = (value: unknown, fallback: number): number =>
  Math.max(0, Math.min(1, finiteNumber(value, fallback)));

function tensionMode(value: unknown, fallback: 'follow' | 'locked' | 'bypass'): 'follow' | 'locked' | 'bypass' {
  return value === 'locked' || value === 'bypass' || value === 'follow' ? value : fallback;
}

export function coreProductSynthSequencerEffectiveEvolveTension(
  state: Record<string, unknown> | null,
  targetSourceId: number,
): number {
  const padSource = targetSourceId === 1 || targetSourceId === 2;
  const modeKey = padSource ? 'padTensionMode' : 'synthEuclidTensionMode';
  const valueKey = padSource ? 'padTensionValue' : 'synthEuclidTensionValue';
  return Math.max(0, getEffectiveTension(
    boundedUnit(state?.tension, 0.3),
    tensionMode(state?.[modeKey], 'follow'),
    finiteNumber(state?.[valueKey], 0),
  ));
}

export function coreProductDrumSequencerEffectiveEvolveTension(state: Record<string, unknown> | null): number {
  return Math.max(0, getEffectiveTension(
    boundedUnit(state?.tension, 0.3),
    tensionMode(state?.drumTensionMode, 'bypass'),
    finiteNumber(state?.drumTensionValue, 0),
  ));
}

export function coreProductSequencerEffectiveEvolveTension(options: {
  sequencer: SequencerKind;
  laneIndex: number;
  latestSliderState: Record<string, unknown> | null;
  latestProductSnapshot: CoreProductSnapshot | null;
  telemetry: CoreProductTelemetrySnapshot;
}): number {
  if (options.sequencer === 'drum') return coreProductDrumSequencerEffectiveEvolveTension(options.latestSliderState);
  const targetSourceId =
    options.telemetry.sequencerUiState?.synthLanes[options.laneIndex]?.targetSourceId ??
    options.latestProductSnapshot?.synthLanes[options.laneIndex]?.targetSourceId ??
    1;
  return coreProductSynthSequencerEffectiveEvolveTension(options.latestSliderState, targetSourceId);
}
