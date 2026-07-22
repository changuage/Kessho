import { useEffect } from 'react';

import type { SliderMode, SliderState } from './state';
import { replaceRuntimeWalkPositions } from './runtimeSliderState';
import { useDocumentVisibility } from './hooks/useDocumentVisibility';

type ProductRange = { min: number; max: number };

export type RuntimeWalkSyncOptions = {
  dualSliderRanges: Partial<Record<keyof SliderState, ProductRange | undefined>>;
  randomWalkMode: SliderState['randomWalkMode'];
  randomWalkSpeed: SliderState['randomWalkSpeed'];
  runtimeSupportsRangeKey: (key: string) => boolean;
  setRuntimeWalkPositionsCallback: (callback: ((positions: Record<string, number>) => void) | null) => void;
  setRuntimeWalkRanges: (ranges: Partial<Record<string, ProductRange>>) => void;
  shouldMirrorRuntimeWalkPositions: boolean;
  sliderModes: Record<string, SliderMode>;
};

export function useRuntimeWalkSync({
  dualSliderRanges,
  randomWalkMode,
  randomWalkSpeed,
  runtimeSupportsRangeKey,
  setRuntimeWalkPositionsCallback,
  setRuntimeWalkRanges,
  shouldMirrorRuntimeWalkPositions,
  sliderModes,
}: RuntimeWalkSyncOptions): void {
  const documentVisible = useDocumentVisibility();

  useEffect(() => {
    const walkRanges: Record<string, ProductRange> = {};
    Object.entries(sliderModes).forEach(([key, mode]) => {
      if (mode !== 'walk') return;
      if (!runtimeSupportsRangeKey(key)) return;
      const range = dualSliderRanges[key as keyof SliderState];
      if (range) {
        walkRanges[key] = range;
      }
    });
    setRuntimeWalkRanges(walkRanges);
  }, [
    dualSliderRanges,
    randomWalkMode,
    randomWalkSpeed,
    runtimeSupportsRangeKey,
    setRuntimeWalkRanges,
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
