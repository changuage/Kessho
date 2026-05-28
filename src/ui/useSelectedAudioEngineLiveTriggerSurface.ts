import { useCallback } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { AudioEngineRuntimeMode } from '../audio/product/ProductAudioRuntimeSelection';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';

type LeadMorph = { lead1: number; lead2: number };
type LeadDistance = { lead1: number; lead2: number };

type SelectedAudioEngineLiveTriggerSurface = {
  setSelectedLeadExpressionCallback: (callback: ((expression: Record<string, number>) => void) | null) => void;
  setSelectedLeadMorphCallback: (callback: ((morph: LeadMorph) => void) | null) => void;
  setSelectedPadMorphTriggerCallback: (callback: ((morphPosition: number) => void) | null) => void;
  setSelectedPad2MorphTriggerCallback: (callback: ((morphPosition: number) => void) | null) => void;
  setSelectedLeadDistanceCallback: (callback: ((distance: LeadDistance) => void) | null) => void;
  setSelectedPadDistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setSelectedPad2DistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setSelectedPianoDistanceTriggerCallback: (callback: ((distance: number) => void) | null) => void;
  setSelectedLeadDelayCallback: (callback: ((delay: Record<string, number | string>) => void) | null) => void;
  setSelectedDrumMorphTriggerCallback: (callback: ((voice: unknown, morphPosition: number) => void) | null) => void;
  setSelectedDrumParamSHTriggerCallback: (callback: ((voice: unknown, key: string, position: number) => void) | null) => void;
  setSelectedGranularSHTriggerCallback: (callback: ((positions: Record<string, number>) => void) | null) => void;
};

export function useSelectedAudioEngineLiveTriggerSurface(
  audioEngineRuntimeMode: AudioEngineRuntimeMode,
): SelectedAudioEngineLiveTriggerSurface {
  const setSelectedLeadExpressionCallback = useCallback((callback: ((expression: Record<string, number>) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setLeadExpressionCallback(callback);
      return;
    }
    selectedProductRuntime.setLeadExpressionCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedLeadMorphCallback = useCallback((callback: ((morph: LeadMorph) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setLeadMorphCallback(callback);
      return;
    }
    selectedProductRuntime.setLeadMorphCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedPadMorphTriggerCallback = useCallback((callback: ((morphPosition: number) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setPadMorphTriggerCallback(callback);
      return;
    }
    selectedProductRuntime.setPadMorphTriggerCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedPad2MorphTriggerCallback = useCallback((callback: ((morphPosition: number) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setPad2MorphTriggerCallback(callback);
      return;
    }
    selectedProductRuntime.setPad2MorphTriggerCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedLeadDistanceCallback = useCallback((callback: ((distance: LeadDistance) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setLeadDistanceCallback(callback);
      return;
    }
    selectedProductRuntime.setLeadDistanceCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedPadDistanceTriggerCallback = useCallback((callback: ((distance: number) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setPadDistanceTriggerCallback(callback);
      return;
    }
    selectedProductRuntime.setPadDistanceTriggerCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedPad2DistanceTriggerCallback = useCallback((callback: ((distance: number) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setPad2DistanceTriggerCallback(callback);
      return;
    }
    selectedProductRuntime.setPad2DistanceTriggerCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedPianoDistanceTriggerCallback = useCallback((callback: ((distance: number) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setPianoDistanceTriggerCallback(callback);
      return;
    }
    selectedProductRuntime.setPianoDistanceTriggerCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedLeadDelayCallback = useCallback((callback: ((delay: Record<string, number | string>) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setLeadDelayCallback(callback);
      return;
    }
    selectedProductRuntime.setLeadDelayCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedDrumMorphTriggerCallback = useCallback((callback: ((voice: unknown, morphPosition: number) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setDrumMorphTriggerCallback(callback);
      return;
    }
    selectedProductRuntime.setDrumMorphTriggerCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedDrumParamSHTriggerCallback = useCallback((callback: ((voice: unknown, key: string, position: number) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setDrumParamSHTriggerCallback(callback);
      return;
    }
    selectedProductRuntime.setDrumParamSHTriggerCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  const setSelectedGranularSHTriggerCallback = useCallback((callback: ((positions: Record<string, number>) => void) | null): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setGranularSHTriggerCallback(callback);
      return;
    }
    selectedProductRuntime.setGranularSHTriggerCallback(callback ?? (() => {}));
  }, [audioEngineRuntimeMode]);

  return {
    setSelectedLeadExpressionCallback,
    setSelectedLeadMorphCallback,
    setSelectedPadMorphTriggerCallback,
    setSelectedPad2MorphTriggerCallback,
    setSelectedLeadDistanceCallback,
    setSelectedPadDistanceTriggerCallback,
    setSelectedPad2DistanceTriggerCallback,
    setSelectedPianoDistanceTriggerCallback,
    setSelectedLeadDelayCallback,
    setSelectedDrumMorphTriggerCallback,
    setSelectedDrumParamSHTriggerCallback,
    setSelectedGranularSHTriggerCallback,
  };
}
