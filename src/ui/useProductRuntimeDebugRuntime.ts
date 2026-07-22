import type { EarthTextureDebugState } from '../audio/engineSharedTypes';
import type { TransportDebugSnapshot } from '../audio/transport';
import { useCallback } from 'react';
import type { ProductRuntimeStateSurface, ProductRuntimeTelemetrySurface } from './productRuntimeConstruction';

type ProductLeadMorphedParams = { attack: number; decay: number; sustain: number; release: number } | null;

type ProductRuntimeDebugAnalysers = {
  drumVoiceAnalyser: ((voice: unknown) => AnalyserNode | undefined) | undefined;
  dynamicsAnalyser: ((key: unknown) => AnalyserNode | null) | undefined;
};

type ProductRuntimeDebugRuntime = {
  getProductGranularBufferWaveform: () => Float32Array | null;
  getProductTransportDebugState: () => TransportDebugSnapshot | null;
  getEarthTextureDebugState: () => EarthTextureDebugState;
  getProductLeadMorphedParams: (lead: 1 | 2) => ProductLeadMorphedParams;
  productRuntimeDebugAnalysers: ProductRuntimeDebugAnalysers;
  liveLeadMorphedParamsAvailable: boolean;
  liveWaveformTelemetryAvailable: boolean;
  textureDebugAvailable: boolean;
};

type ProductRuntimeDebugRuntimeOptions = {
  productRuntimeState: ProductRuntimeStateSurface;
  productRuntimeTelemetry: ProductRuntimeTelemetrySurface;
};

export function useProductRuntimeDebugRuntime({
  productRuntimeState,
  productRuntimeTelemetry,
}: ProductRuntimeDebugRuntimeOptions): ProductRuntimeDebugRuntime {
  return {
    getProductGranularBufferWaveform: useCallback(
      () => productRuntimeTelemetry.getTelemetry()?.granularBufferWaveform ?? null,
      [productRuntimeTelemetry],
    ),
    getProductTransportDebugState: useCallback(
      () => productRuntimeState.getTransportDebugState() as TransportDebugSnapshot | null,
      [productRuntimeState],
    ),
    getEarthTextureDebugState: useCallback(() => (
      productRuntimeTelemetry.getTelemetry()?.earthTextureDebugState ?? { waves: null, birds: null, birds2: null, frogs: null }
    ), [productRuntimeTelemetry]),
    getProductLeadMorphedParams: useCallback(() => null, []),
    productRuntimeDebugAnalysers: { drumVoiceAnalyser: undefined, dynamicsAnalyser: undefined },
    liveLeadMorphedParamsAvailable: false,
    liveWaveformTelemetryAvailable: productRuntimeTelemetry.available,
    textureDebugAvailable: productRuntimeTelemetry.available,
  };
}
