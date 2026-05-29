import { useMemo } from 'react';
import type { DynamicsVisualTelemetrySnapshot, EarthTextureDebugState } from '../audio/engineSharedTypes';

export type ProductRuntimePageDebugAnalysers = {
  drumVoiceAnalyser?: ((voice: unknown) => AnalyserNode | undefined) | undefined;
  dynamicsAnalyser?: ((key: unknown) => AnalyserNode | null) | undefined;
};

export type ProductRuntimePageTelemetryProps = {
  productRuntimeDebugAnalysers: ProductRuntimePageDebugAnalysers;
  getEarthTextureDebugState: () => EarthTextureDebugState;
  getProductLeadMorphedParams: (lead: 1 | 2) => { attack: number; decay: number; sustain: number; release: number } | null;
  getProductDynamicsVisualTelemetry: () => DynamicsVisualTelemetrySnapshot;
  getProductGranularActiveGrainCount: () => number;
  getProductGranularBufferWaveform: () => Float32Array | null;
  getProductGranularVoicePositions: () => readonly number[];
  getProductGranularWriteHeadPosition: () => number;
  getProductPadFilterFreq: (pad: 'pad1' | 'pad2') => number;
  getProductPadLfoValue: (pad: 'pad1' | 'pad2') => number;
  liveLeadMorphedParamsAvailable: boolean;
  liveWaveformTelemetryAvailable: boolean;
  setProductGranularUiActive: (active: boolean) => void;
  textureDebugAvailable: boolean;
};

export function useProductRuntimePageTelemetryProps({
  productRuntimeDebugAnalysers,
  getEarthTextureDebugState,
  getProductLeadMorphedParams,
  getProductDynamicsVisualTelemetry,
  getProductGranularActiveGrainCount,
  getProductGranularBufferWaveform,
  getProductGranularVoicePositions,
  getProductGranularWriteHeadPosition,
  getProductPadFilterFreq,
  getProductPadLfoValue,
  liveLeadMorphedParamsAvailable,
  liveWaveformTelemetryAvailable,
  setProductGranularUiActive,
  textureDebugAvailable,
}: ProductRuntimePageTelemetryProps): ProductRuntimePageTelemetryProps {
  return useMemo(() => ({
    productRuntimeDebugAnalysers,
    getEarthTextureDebugState,
    getProductLeadMorphedParams,
    getProductDynamicsVisualTelemetry,
    getProductGranularActiveGrainCount,
    getProductGranularBufferWaveform,
    getProductGranularVoicePositions,
    getProductGranularWriteHeadPosition,
    getProductPadFilterFreq,
    getProductPadLfoValue,
    liveLeadMorphedParamsAvailable,
    liveWaveformTelemetryAvailable,
    setProductGranularUiActive,
    textureDebugAvailable,
  }), [
    getEarthTextureDebugState,
    getProductDynamicsVisualTelemetry,
    getProductGranularActiveGrainCount,
    getProductGranularBufferWaveform,
    getProductGranularVoicePositions,
    getProductGranularWriteHeadPosition,
    getProductLeadMorphedParams,
    getProductPadFilterFreq,
    getProductPadLfoValue,
    liveLeadMorphedParamsAvailable,
    liveWaveformTelemetryAvailable,
    productRuntimeDebugAnalysers,
    setProductGranularUiActive,
    textureDebugAvailable,
  ]);
}
