import { useRuntimeWalkSync } from './useRuntimeWalkSync';
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
  useRuntimeWalkSync({
    ...options,
    runtimeSupportsRangeKey: productRuntimeSupportsRangeKey,
    setRuntimeWalkPositionsCallback: setProductRuntimeWalkPositionsCallback,
    setRuntimeWalkRanges: setProductRuntimeWalkRanges,
  });
}
