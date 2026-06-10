import { isIOSLikeDevice, isMobileDevice } from '../platform';
import { productHarmonyScaleIdFromName } from './coreProductHarmonyScaleIds';
import { booleanFromState, clamp, numberFromState } from './coreProductSnapshotState';
import { getEffectiveTension } from './harmony';
import { createRng, getUtcBucket } from './rng';
import { getScaleByName, selectScaleFamily } from './scales';

function resolveHarmonyScaleName(state: Record<string, unknown> | undefined, tension: number): string {
  const manualScale = typeof state?.manualScale === 'string' ? state.manualScale : 'Major (Ionian)';
  if (state?.scaleMode === 'manual' && getScaleByName(manualScale)) return manualScale;
  const seedWindow = state?.seedWindow === 'day' ? 'day' : 'hour';
  return selectScaleFamily(createRng(`${getUtcBucket(seedWindow)}|E_ROOT`), tension).name;
}

export function scaleIdFromState(state: Record<string, unknown> | undefined, tension: number): number {
  return productHarmonyScaleIdFromName(resolveHarmonyScaleName(state, tension));
}

function reverbTensionModeFromState(state: Record<string, unknown> | undefined): 'follow' | 'locked' | 'bypass' {
  const mode = state?.reverbTensionMode;
  if (mode === 'follow' || mode === 'locked') return mode;
  return 'bypass';
}

function navigatorFromGlobal(): Navigator | null {
  return typeof navigator === 'undefined' ? null : navigator;
}

export function shouldUseMobileReverbQualityOverride(state: Record<string, unknown> | undefined): boolean {
  const forced = state?.coreProductMobileDevice ?? state?.sonicParityMobileDevice;
  if (typeof forced === 'boolean') return forced;
  const nav = navigatorFromGlobal();
  return nav ? isMobileDevice(nav) || isIOSLikeDevice(nav) : false;
}

function resolveHarmonyScaleIntervals(state: Record<string, unknown> | undefined, tension: number): readonly number[] | undefined {
  try {
    return getScaleByName(resolveHarmonyScaleName(state, tension))?.intervals;
  } catch {
    return undefined;
  }
}

function quantizeShimmerPitchToScale(pitch: number, intervals: readonly number[] | undefined): number {
  if (!intervals || intervals.length === 0) return pitch;
  const octaves = Math.floor(pitch / 12);
  const rem = ((pitch % 12) + 12) % 12;
  let bestInterval = intervals[0] ?? 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const interval of intervals) {
    const distance = Math.abs(interval - rem);
    const circularDistance = Math.min(distance, 12 - distance);
    if (circularDistance < bestDistance) {
      bestDistance = circularDistance;
      bestInterval = interval;
    }
  }
  return octaves * 12 + bestInterval;
}

export function resolveReverbSnapshotParams(state: Record<string, unknown> | undefined, tension: number) {
  const reverbTension = getEffectiveTension(
    tension,
    reverbTensionModeFromState(state),
    numberFromState(state, 'reverbTensionValue', 0),
  );
  let decay = clamp(numberFromState(state, 'reverbDecay', 0.9), 0, 1);
  let diffusion = clamp(numberFromState(state, 'reverbDiffusion', 1), 0, 1);
  let shimmer = clamp(numberFromState(state, 'reverbShimmer', 0), 0, 1);
  let shimmerPitch = clamp(numberFromState(state, 'reverbShimmerPitch', 12), -24, 24);

  if (reverbTension >= 0) {
    const inverse = 1 - reverbTension;
    decay = clamp(decay + inverse * 0.15, 0, 1);
    diffusion = clamp(diffusion + inverse * 0.1, 0, 1);
    shimmer = clamp(shimmer + reverbTension * 0.08, 0, 1);
  }

  const washBoost = clamp(numberFromState(state, 'sonicParityReverbWashBoost', 0), 0, 1);
  if (washBoost > 0.001) shimmer = clamp(shimmer + washBoost * 0.15, 0, 1);
  const bloomBoost = clamp(numberFromState(state, 'sonicParityReverbBloomBoost', 0), 0, 1);
  if (bloomBoost > 0.001) {
    decay = clamp(decay + bloomBoost * 0.12, 0, 1);
    shimmer = clamp(shimmer + bloomBoost * 0.1, 0, 1);
  }

  if (booleanFromState(state, 'reverbScaleShimmer', false)) {
    shimmerPitch = clamp(quantizeShimmerPitchToScale(shimmerPitch, resolveHarmonyScaleIntervals(state, tension)), -24, 24);
  }
  return { decay, diffusion, shimmer, shimmerPitch };
}
