import type { SequencerKind } from './CoreProductHostSequencerAdapter';
import { normalizeSequencerSwing } from './sequencerSwing';

function hashUnit(seed: number): number {
  let x = seed >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 0x1_0000_0000;
}

export function clampSequencerSwing(value: number): number {
  return normalizeSequencerSwing(value);
}

export function evolveCoreProductSequencerSwing(current: number, evolution: number, seed: number): number {
  return clampSequencerSwing(current + (hashUnit(seed ^ 0x5f356495) * 2 - 1) * 0.03 * evolution);
}

export function coreProductSequencerSwingKey(sequencer: SequencerKind, laneIndex: number): string {
  return `${sequencer === 'synth' ? 'synthEuclid' : 'drumEuclid'}${laneIndex + 1}Swing`;
}

export function getCoreProductSequencerLaneSwing(
  adapterState: Record<string, unknown>,
  latestSliderState: Record<string, unknown> | null,
  sequencer: SequencerKind,
  laneIndex: number,
): number {
  const source = latestSliderState ? { ...latestSliderState, ...adapterState } : adapterState;
  const value = source[coreProductSequencerSwingKey(sequencer, laneIndex)];
  if (typeof value === 'number' && Number.isFinite(value)) return clampSequencerSwing(value);
  const fallback = sequencer === 'drum' ? source.drumEuclidSwing : undefined;
  return typeof fallback === 'number' && Number.isFinite(fallback)
    ? clampSequencerSwing(fallback / 100)
    : 0;
}

export function patchCoreProductSequencerLaneSwing(
  adapterState: Record<string, unknown>,
  sequencer: SequencerKind,
  laneIndex: number,
  swing: number,
): { adapterState: Record<string, unknown>; swing: number } {
  const normalized = clampSequencerSwing(swing);
  return {
    adapterState: {
      ...adapterState,
      [coreProductSequencerSwingKey(sequencer, laneIndex)]: normalized,
    },
    swing: normalized,
  };
}
