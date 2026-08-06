import type { ProductManualSynthSource } from '../../audio/product/ProductEngineTypes';

// Product Core deliberately trims Lead to 0.59 after synthesis while Pad is
// mixed at unity. Harmony audition compensates before note-on so changing the
// preview instrument does not produce a large loudness jump. This is scoped to
// auditioning; authored source levels and the running mix remain untouched.
const HARMONY_AUDITION_VELOCITY_SCALE: Readonly<Record<ProductManualSynthSource, number>> = {
  pad1: 0.59,
  pad2: 0.59,
  lead1: 1,
  lead2: 1,
  sample1: 1,
  sample2: 1,
};

export function harmonyAuditionVelocity(
  source: ProductManualSynthSource,
  velocity: number,
): number {
  const normalized = Number.isFinite(velocity) ? velocity : 0;
  return Math.max(0, Math.min(1, normalized * HARMONY_AUDITION_VELOCITY_SCALE[source]));
}
