import { useEffect } from 'react';

import type { SliderMode, SliderState } from './state';
import { replaceRuntimeWalkPositions } from './runtimeSliderState';
import { useDocumentVisibility } from './hooks/useDocumentVisibility';

type ProductRange = { min: number; max: number };

type RuntimeWalkSyncOptions = {
  dualSliderRanges: Partial<Record<keyof SliderState, ProductRange | undefined>>;
  randomWalkMode: SliderState['randomWalkMode'];
  randomWalkSpeed: SliderState['randomWalkSpeed'];
  selectedRuntimeSupportsRangeKey: (key: string) => boolean;
  setSelectedRuntimeWalkPositionsCallback: (callback: ((positions: Record<string, number>) => void) | null) => void;
  setSelectedRuntimeWalkRanges: (ranges: Partial<Record<string, ProductRange>>) => void;
  shouldMirrorRuntimeWalkPositions: boolean;
  sliderModes: Record<string, SliderMode>;
};

export function useSelectedAudioEngineRuntimeWalkSync({
  dualSliderRanges,
  randomWalkMode,
  randomWalkSpeed,
  selectedRuntimeSupportsRangeKey,
  setSelectedRuntimeWalkPositionsCallback,
  setSelectedRuntimeWalkRanges,
  shouldMirrorRuntimeWalkPositions,
  sliderModes,
}: RuntimeWalkSyncOptions): void {
  const documentVisible = useDocumentVisibility();

  useEffect(() => {
    const walkRanges: Record<string, ProductRange> = {};
    Object.entries(sliderModes).forEach(([key, mode]) => {
      if (mode !== 'walk') return;
      if (!selectedRuntimeSupportsRangeKey(key)) return;
      const range = dualSliderRanges[key as keyof SliderState];
      if (range) {
        walkRanges[key] = range;
      }
    });
    setSelectedRuntimeWalkRanges(walkRanges);
  }, [
    dualSliderRanges,
    randomWalkMode,
    randomWalkSpeed,
    selectedRuntimeSupportsRangeKey,
    setSelectedRuntimeWalkRanges,
    sliderModes,
  ]);

  useEffect(() => {
    if (!shouldMirrorRuntimeWalkPositions || !documentVisible) {
      setSelectedRuntimeWalkPositionsCallback(null);
      return;
    }

    setSelectedRuntimeWalkPositionsCallback((positions) => {
      replaceRuntimeWalkPositions(positions);
    });

    return () => {
      setSelectedRuntimeWalkPositionsCallback(null);
    };
  }, [documentVisible, setSelectedRuntimeWalkPositionsCallback, shouldMirrorRuntimeWalkPositions]);
}
