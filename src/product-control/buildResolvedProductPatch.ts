import type { ProductSnapshotPatch } from '../audio/product/ProductEngineTypes';
import type { SliderState } from '../ui/state';

export function buildResolvedProductPatch(sliders: SliderState): ProductSnapshotPatch {
  return { ...sliders };
}
