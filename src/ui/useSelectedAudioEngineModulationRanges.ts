import { useCallback } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';
import type { ProductDrumVoice } from '../audio/product/ProductEngineTypes';

type ProductRange = { min: number; max: number };

type SelectedAudioEngineModulationRanges = {
  setSelectedRuntimeWalkPositionsCallback: (callback: ((positions: Record<string, number>) => void) | null) => void;
  setSelectedDrumMorphRange: (voice: ProductDrumVoice, range: ProductRange | null) => void;
  setSelectedDrumParamSHRange: (key: string, range: ProductRange | null) => void;
  setSelectedDualRanges: (ranges: Partial<Record<string, ProductRange>>) => void;
  setSelectedRuntimeWalkRanges: (ranges: Partial<Record<string, ProductRange>>) => void;
};

export function useSelectedAudioEngineModulationRanges(
  audioEngineRuntimeMode: AudioEngineRuntimeMode,
): SelectedAudioEngineModulationRanges {
  const setSelectedRuntimeWalkPositionsCallback = useCallback((callback: ((positions: Record<string, number>) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setRuntimeWalkPositionsCallback(callback);
      return;
    }
    selectedProductRuntime.setRuntimeWalkPositionsCallback(callback);
  }, [audioEngineRuntimeMode]);

  const setSelectedDrumMorphRange = useCallback((voice: ProductDrumVoice, range: ProductRange | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setDrumMorphRange(voice, range);
      return;
    }
    selectedProductRuntime.setDrumMorphRange(voice, range);
  }, [audioEngineRuntimeMode]);

  const setSelectedDrumParamSHRange = useCallback((key: string, range: ProductRange | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setDrumParamSHRange(key, range);
      return;
    }
    selectedProductRuntime.setDrumParamSHRange(key, range);
  }, [audioEngineRuntimeMode]);

  const setSelectedDualRanges = useCallback((ranges: Partial<Record<string, ProductRange>>): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setDualRanges(ranges);
      return;
    }
    selectedProductRuntime.setDualRanges(ranges);
  }, [audioEngineRuntimeMode]);

  const setSelectedRuntimeWalkRanges = useCallback((ranges: Partial<Record<string, ProductRange>>): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setRuntimeWalkRanges(ranges);
      return;
    }
    selectedProductRuntime.setRuntimeWalkRanges(ranges);
  }, [audioEngineRuntimeMode]);

  return {
    setSelectedRuntimeWalkPositionsCallback,
    setSelectedDrumMorphRange,
    setSelectedDrumParamSHRange,
    setSelectedDualRanges,
    setSelectedRuntimeWalkRanges,
  };
}
