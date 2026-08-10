import { useEffect } from 'react';

import type { SliderMode, SliderState } from './state';
import { replaceRuntimeWalkPositions } from './runtimeSliderState';
import { useDocumentVisibility } from './hooks/useDocumentVisibility';
import { selectEligibleRuntimeRanges } from './runtimeModulationEligibility';
import type { DualSliderConfigMap, ModulationSourceConfig } from './sliderSystem/dualConfigReducer';
import type { ProductRuntimeModulationRangeMap } from '../audio/product/ProductEngineTypes';

type ProductRange = { min: number; max: number };

export type RuntimeWalkSyncOptions = {
  dualSliderRanges: Partial<Record<keyof SliderState, ProductRange | undefined>>;
  dualConfigs?: DualSliderConfigMap<string>;
  isRuntimeRangeKeyEligible?: (key: string) => boolean;
  modulationSourceA: ModulationSourceConfig;
  modulationSourceB: ModulationSourceConfig;
  runtimeSupportsRangeKey: (key: string) => boolean;
  setRuntimeWalkPositionsCallback: (callback: ((positions: Record<string, number>) => void) | null) => void;
  setRuntimeWalkRanges: (ranges: Partial<Record<string, ProductRange>>) => void;
  setRuntimeModulationRanges?: (ranges: ProductRuntimeModulationRangeMap) => void;
  shouldMirrorRuntimeWalkPositions: boolean;
  sliderModes: Record<string, SliderMode>;
};

export function useRuntimeWalkSync({
  dualSliderRanges,
  dualConfigs,
  modulationSourceA,
  modulationSourceB,
  isRuntimeRangeKeyEligible = () => true,
  runtimeSupportsRangeKey,
  setRuntimeWalkPositionsCallback,
  setRuntimeWalkRanges,
  setRuntimeModulationRanges,
  shouldMirrorRuntimeWalkPositions,
  sliderModes,
}: RuntimeWalkSyncOptions): void {
  const documentVisible = useDocumentVisibility();

  useEffect(() => {
    if (dualConfigs && setRuntimeModulationRanges) {
      const runtimeRanges: ProductRuntimeModulationRangeMap = {};
      for (const [key, config] of Object.entries(dualConfigs)) {
        if (!config) continue;
        const source = config.source === 'a' ? modulationSourceA : modulationSourceB;
        if (source.type !== 'walk' && source.type !== 'shape') continue;
        if (!isRuntimeRangeKeyEligible(key) || !runtimeSupportsRangeKey(key)) continue;
        const [min, max] = config.range;
        if (source.type === 'walk') {
          runtimeRanges[key] = {
            min,
            max,
            modulation: {
              mode: 'walk',
              source: config.source,
              relationship: source.walk.relationship,
              speed: source.walk.speed,
            },
          };
          continue;
        }
        runtimeRanges[key] = {
          min,
          max,
            modulation: {
              mode: 'shape',
              source: config.source,
              shape: source.shape.shape,
              timing: source.shape.timing,
          },
        };
      }
      setRuntimeModulationRanges(runtimeRanges);
      return;
    }
    const walkRanges = selectEligibleRuntimeRanges(
      dualSliderRanges as Partial<Record<string, ProductRange>>,
      sliderModes,
      'walk',
      isRuntimeRangeKeyEligible,
      runtimeSupportsRangeKey,
    );
    setRuntimeWalkRanges(walkRanges);
  }, [
    dualSliderRanges,
    dualConfigs,
    isRuntimeRangeKeyEligible,
    modulationSourceA,
    modulationSourceB,
    runtimeSupportsRangeKey,
    setRuntimeWalkRanges,
    setRuntimeModulationRanges,
    sliderModes,
  ]);

  useEffect(() => {
    if (!shouldMirrorRuntimeWalkPositions || !documentVisible) {
      setRuntimeWalkPositionsCallback(null);
      return;
    }

    setRuntimeWalkPositionsCallback((positions) => {
      replaceRuntimeWalkPositions(positions);
    });

    return () => {
      setRuntimeWalkPositionsCallback(null);
    };
  }, [documentVisible, setRuntimeWalkPositionsCallback, shouldMirrorRuntimeWalkPositions]);
}
