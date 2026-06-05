import { useCallback } from 'react';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { DynamicsVisualTelemetrySnapshot } from '../audio/engineSharedTypes';
import type { CoreProductGranularVisualEvent } from '../audio/coreProductTelemetry';
import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';

type SelectedAudioEngineTelemetrySurface = {
  getSelectedGranularActiveGrainCount: () => number;
  getSelectedGranularWriteHeadPosition: () => number;
  getSelectedGranularVoicePositions: () => readonly number[];
  getSelectedGranularVisualEvents: () => readonly CoreProductGranularVisualEvent[];
  getSelectedDynamicsVisualTelemetry: () => DynamicsVisualTelemetrySnapshot;
  getSelectedPadFilterFreq: (pad: 'pad1' | 'pad2') => number;
  getSelectedPadLfoValue: (pad: 'pad1' | 'pad2') => number;
  pushSelectedMidiMessage: (message: KesshoMidiMessage) => void;
  setSelectedGranularUiActive: (active: boolean) => void;
  setSelectedVisualTelemetryActive: (active: boolean) => void;
};

export function useSelectedAudioEngineTelemetrySurface(
  audioEngineRuntimeMode: AudioEngineRuntimeMode,
): SelectedAudioEngineTelemetrySurface {
  const getSelectedGranularActiveGrainCount = useCallback((): number => {
    if (audioEngineRuntimeMode === 'core-product') {
      return productEngine.getTelemetry()?.activeGrains ?? 0;
    }
    return selectedProductRuntime.getGranularActiveGrainCount();
  }, [audioEngineRuntimeMode]);

  const getSelectedGranularWriteHeadPosition = useCallback((): number => {
    if (audioEngineRuntimeMode === 'core-product') {
      return productEngine.getTelemetry()?.granularWriteHeadPosition ?? 0;
    }
    return selectedProductRuntime.getGranularWriteHeadPosition();
  }, [audioEngineRuntimeMode]);

  const getSelectedGranularVoicePositions = useCallback((): readonly number[] => {
    if (audioEngineRuntimeMode === 'core-product') {
      return productEngine.getTelemetry()?.granularVoicePositions ?? [0, 0, 0, 0];
    }
    return selectedProductRuntime.getGranularVoicePositions();
  }, [audioEngineRuntimeMode]);

  const getSelectedGranularVisualEvents = useCallback((): readonly CoreProductGranularVisualEvent[] => {
    if (audioEngineRuntimeMode === 'core-product') {
      return productEngine.getTelemetry()?.granularVisualEvents ?? [];
    }
    return selectedProductRuntime.getGranularVisualEvents();
  }, [audioEngineRuntimeMode]);

  const getSelectedDynamicsVisualTelemetry = useCallback((): DynamicsVisualTelemetrySnapshot => {
    if (audioEngineRuntimeMode === 'core-product') {
      return productEngine.getDynamicsVisualTelemetry() as DynamicsVisualTelemetrySnapshot;
    }
    return selectedProductRuntime.getDynamicsVisualTelemetry();
  }, [audioEngineRuntimeMode]);

  const getSelectedPadFilterFreq = useCallback((pad: 'pad1' | 'pad2'): number => {
    try {
      if (audioEngineRuntimeMode === 'core-product') {
        const telemetry = productEngine.getTelemetry();
        return pad === 'pad2' ? telemetry?.pad2FilterFreq ?? 0 : telemetry?.pad1FilterFreq ?? 0;
      }
      return selectedProductRuntime.getCurrentPadFilterFreq(pad);
    } catch {
      return 0;
    }
  }, [audioEngineRuntimeMode]);

  const getSelectedPadLfoValue = useCallback((pad: 'pad1' | 'pad2'): number => {
    try {
      if (audioEngineRuntimeMode === 'core-product') {
        const telemetry = productEngine.getTelemetry();
        return pad === 'pad2' ? telemetry?.pad2Lfo1Value ?? 0 : telemetry?.pad1Lfo1Value ?? 0;
      }
      return selectedProductRuntime.getCurrentPadLfoValue(pad);
    } catch {
      return 0;
    }
  }, [audioEngineRuntimeMode]);

  const pushSelectedMidiMessage = useCallback((message: KesshoMidiMessage): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.pushMidiMessage(message);
      return;
    }
    selectedProductRuntime.pushMidiMessage(message);
  }, [audioEngineRuntimeMode]);

  const setSelectedGranularUiActive = useCallback((active: boolean): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setGranularUiActive(active);
      return;
    }
    selectedProductRuntime.setGranularUiActive(active);
  }, [audioEngineRuntimeMode]);

  const setSelectedVisualTelemetryActive = useCallback((active: boolean): void => {
    if (audioEngineRuntimeMode === 'core-product') {
      productEngine.setVisualTelemetryActive(active);
      return;
    }
    selectedProductRuntime.setVisualTelemetryActive(active);
  }, [audioEngineRuntimeMode]);

  return {
    getSelectedGranularActiveGrainCount,
    getSelectedGranularWriteHeadPosition,
    getSelectedGranularVoicePositions,
    getSelectedGranularVisualEvents,
    getSelectedDynamicsVisualTelemetry,
    getSelectedPadFilterFreq,
    getSelectedPadLfoValue,
    pushSelectedMidiMessage,
    setSelectedGranularUiActive,
    setSelectedVisualTelemetryActive,
  };
}
