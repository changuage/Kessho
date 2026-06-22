import { useSelectedAudioEngineRuntimeWalkSync } from './useSelectedAudioEngineRuntimeWalkSync';
import type { SliderMode, SliderState } from './state';

type ProductRuntimeWalkRange = { min: number; max: number };

export type ProductRuntimeWalkSyncOptions = {
  dualSliderRanges: Partial<Record<keyof SliderState, ProductRuntimeWalkRange | undefined>>;
  productRuntimeSupportsRangeKey: (key: string) => boolean;
  randomWalkMode: SliderState['randomWalkMode'];
  randomWalkSpeed: SliderState['randomWalkSpeed'];
  setProductRuntimeWalkPositionsCallback: (callback: ((positions: Record<string, number>) => void) | null) => void;
  setProductRuntimeWalkRanges: (ranges: Partial<Record<string, ProductRuntimeWalkRange>>) => void;
  shouldMirrorRuntimeWalkPositions: boolean;
  sliderModes: Record<string, SliderMode>;
};

export function useProductRuntimeWalkSync({
  productRuntimeSupportsRangeKey,
  setProductRuntimeWalkPositionsCallback,
  setProductRuntimeWalkRanges,
  ...options
}: ProductRuntimeWalkSyncOptions): void {
  // TODO(product-fallback-retire:runtime-walk-sync): owner=product-runtime, remove-by=runtime-compat-closure, guard=core:product:no-temporary-runtime-compat
  // Selected runtime walk sync remains the compatibility
  // implementation while product range support is exposed through product-named props.
  useSelectedAudioEngineRuntimeWalkSync({
    ...options,
    selectedRuntimeSupportsRangeKey: productRuntimeSupportsRangeKey,
    setSelectedRuntimeWalkPositionsCallback: setProductRuntimeWalkPositionsCallback,
    setSelectedRuntimeWalkRanges: setProductRuntimeWalkRanges,
  });
}
