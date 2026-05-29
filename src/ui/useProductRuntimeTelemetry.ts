import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { ProductDynamicsVisualTelemetry } from '../audio/product/ProductEngineTypes';
import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';
import { useSelectedAudioEngineRuntimeTelemetry } from './useSelectedAudioEngineRuntimeTelemetry';

type ProductRuntimeTelemetryUiMode = 'snowflake' | 'advanced' | 'journey';

type ProductRuntimeTelemetryOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  uiMode: ProductRuntimeTelemetryUiMode;
};

type ProductRuntimeTelemetry = {
  getProductGranularActiveGrainCount: () => number;
  getProductGranularWriteHeadPosition: () => number;
  getProductGranularVoicePositions: () => readonly number[];
  getProductDynamicsVisualTelemetry: () => ProductDynamicsVisualTelemetry;
  getProductPadFilterFreq: (pad: 'pad1' | 'pad2') => number;
  getProductPadLfoValue: (pad: 'pad1' | 'pad2') => number;
  pushProductMidiMessage: (message: KesshoMidiMessage) => void;
  setProductGranularUiActive: (active: boolean) => void;
  setProductVisualTelemetryActive: (active: boolean) => void;
  productRuntimeSupportsRangeKey: (key: string) => boolean;
};

export function useProductRuntimeTelemetry({
  productRuntimeMode,
  ...options
}: ProductRuntimeTelemetryOptions): ProductRuntimeTelemetry {
  // TODO(product-runtime-compat-10A): selected telemetry names are translated here while the
  // lower-level telemetry surface still supports reference runtime compatibility.
  const {
    getSelectedGranularActiveGrainCount,
    getSelectedGranularWriteHeadPosition,
    getSelectedGranularVoicePositions,
    getSelectedDynamicsVisualTelemetry,
    getSelectedPadFilterFreq,
    getSelectedPadLfoValue,
    pushSelectedMidiMessage,
    setSelectedGranularUiActive,
    setSelectedVisualTelemetryActive,
    selectedRuntimeSupportsRangeKey,
  } = useSelectedAudioEngineRuntimeTelemetry({
    ...options,
    audioEngineRuntimeMode: productRuntimeMode,
  });

  return {
    getProductGranularActiveGrainCount: getSelectedGranularActiveGrainCount,
    getProductGranularWriteHeadPosition: getSelectedGranularWriteHeadPosition,
    getProductGranularVoicePositions: getSelectedGranularVoicePositions,
    getProductDynamicsVisualTelemetry: getSelectedDynamicsVisualTelemetry,
    getProductPadFilterFreq: getSelectedPadFilterFreq,
    getProductPadLfoValue: getSelectedPadLfoValue,
    pushProductMidiMessage: pushSelectedMidiMessage,
    setProductGranularUiActive: setSelectedGranularUiActive,
    setProductVisualTelemetryActive: setSelectedVisualTelemetryActive,
    productRuntimeSupportsRangeKey: selectedRuntimeSupportsRangeKey,
  };
}
