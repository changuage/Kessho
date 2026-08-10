import { useRuntimeWalkSync } from './useRuntimeWalkSync';
import type { SliderMode, SliderState } from './state';
import type { DualSliderConfigMap, ModulationSourceConfig } from './sliderSystem/dualConfigReducer';
import type { ProductRuntimeModulationRangeMap } from '../audio/product/ProductEngineTypes';

type ProductRuntimeWalkRange = { min: number; max: number };

export type ProductRuntimeWalkSyncOptions = {
  dualSliderRanges: Partial<Record<keyof SliderState, ProductRuntimeWalkRange | undefined>>;
  dualConfigs?: DualSliderConfigMap<string>;
  isRuntimeRangeKeyEligible?: (key: string) => boolean;
  productRuntimeSupportsRangeKey: (key: string) => boolean;
  modulationSourceA: ModulationSourceConfig;
  modulationSourceB: ModulationSourceConfig;
  setProductRuntimeWalkPositionsCallback: (callback: ((positions: Record<string, number>) => void) | null) => void;
  setProductRuntimeWalkRanges: (ranges: Partial<Record<string, ProductRuntimeWalkRange>>) => void;
  setProductRuntimeModulationRanges?: (ranges: ProductRuntimeModulationRangeMap) => void;
  shouldMirrorRuntimeWalkPositions: boolean;
  sliderModes: Record<string, SliderMode>;
};

export function useProductRuntimeWalkSync({
  productRuntimeSupportsRangeKey,
  setProductRuntimeWalkPositionsCallback,
  setProductRuntimeWalkRanges,
  setProductRuntimeModulationRanges,
  ...options
}: ProductRuntimeWalkSyncOptions): void {
  useRuntimeWalkSync({
    ...options,
    runtimeSupportsRangeKey: productRuntimeSupportsRangeKey,
    setRuntimeWalkPositionsCallback: setProductRuntimeWalkPositionsCallback,
    setRuntimeWalkRanges: setProductRuntimeWalkRanges,
    setRuntimeModulationRanges: setProductRuntimeModulationRanges,
  });
}
