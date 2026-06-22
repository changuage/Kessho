import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { EarthTextureDebugState } from '../audio/engineSharedTypes';
import type { TransportDebugSnapshot } from '../audio/transport';
import { useSelectedAudioEngineDebugRuntime } from './useSelectedAudioEngineDebugRuntime';
import type { SliderState } from './state';

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
  updateProductReferenceParams: (nextState: SliderState, metadata: { presetId: string; presetName: string }) => void;
};

export function useProductRuntimeDebugRuntime(
  productRuntimeMode: ProductRuntimeSelectionMode,
): ProductRuntimeDebugRuntime {
  // TODO(product-fallback-retire:runtime-debug-runtime): owner=product-runtime, remove-by=runtime-compat-closure, guard=core:product:no-temporary-runtime-compat
  // Keep selected debug/runtime names isolated here until
  // the debug surface itself is product-owned.
  const {
    getSelectedGranularBufferWaveform: getProductGranularBufferWaveform,
    getSelectedTransportDebugState: getProductTransportDebugState,
    getSelectedLeadMorphedParams: getProductLeadMorphedParams,
    selectedAudioEngineDebugAnalysers: productRuntimeDebugAnalysers,
    updateSelectedReferenceParams: updateProductReferenceParams,
    ...productDebugRuntime
  } = useSelectedAudioEngineDebugRuntime(productRuntimeMode);

  return {
    ...productDebugRuntime,
    getProductGranularBufferWaveform,
    getProductTransportDebugState,
    getProductLeadMorphedParams,
    productRuntimeDebugAnalysers,
    updateProductReferenceParams,
  };
}
