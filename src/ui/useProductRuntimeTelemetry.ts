import { useCallback, useEffect } from 'react';
import { isCoreProductRangeKeySupported } from '../audio/coreProductEvents';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { ProductDynamicsVisualTelemetry } from '../audio/product/ProductEngineTypes';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { CoreProductGranularVisualEvent } from '../audio/coreProductTelemetry';
import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';
import { useDocumentVisibility } from './hooks/useDocumentVisibility';

type ProductRuntimeTelemetryUiMode = 'snowflake' | 'advanced' | 'journey';

type ProductRuntimeTelemetryOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  uiMode: ProductRuntimeTelemetryUiMode;
};

type ProductRuntimeTelemetry = {
  getProductGranularActiveGrainCount: () => number;
  getProductGranularWriteHeadPosition: () => number;
  getProductGranularVoicePositions: () => readonly number[];
  getProductGranularVisualEvents: () => readonly CoreProductGranularVisualEvent[];
  getProductDynamicsVisualTelemetry: () => ProductDynamicsVisualTelemetry;
  getProductPadFilterFreq: (pad: 'pad1' | 'pad2') => number;
  getProductPadLfoValue: (pad: 'pad1' | 'pad2') => number;
  pushProductMidiMessage: (message: KesshoMidiMessage) => void;
  setProductGranularUiActive: (active: boolean) => void;
  setProductVisualTelemetryActive: (active: boolean) => void;
  productRuntimeSupportsRangeKey: (key: string) => boolean;
};

export function useProductRuntimeTelemetry({
  uiMode,
}: ProductRuntimeTelemetryOptions): ProductRuntimeTelemetry {
  const documentVisible = useDocumentVisibility();

  const getProductGranularActiveGrainCount = useCallback((): number => {
    return productEngine.getTelemetry()?.activeGrains ?? 0;
  }, []);

  const getProductGranularWriteHeadPosition = useCallback((): number => {
    return productEngine.getTelemetry()?.granularWriteHeadPosition ?? 0;
  }, []);

  const getProductGranularVoicePositions = useCallback((): readonly number[] => {
    return productEngine.getTelemetry()?.granularVoicePositions ?? [0, 0, 0, 0];
  }, []);

  const getProductGranularVisualEvents = useCallback((): readonly CoreProductGranularVisualEvent[] => {
    return productEngine.getTelemetry()?.granularVisualEvents ?? [];
  }, []);

  const getProductDynamicsVisualTelemetry = useCallback((): ProductDynamicsVisualTelemetry => {
    return productEngine.getDynamicsVisualTelemetry();
  }, []);

  const getProductPadFilterFreq = useCallback((pad: 'pad1' | 'pad2'): number => {
    const telemetry = productEngine.getTelemetry();
    return pad === 'pad2' ? telemetry?.pad2FilterFreq ?? 0 : telemetry?.pad1FilterFreq ?? 0;
  }, []);

  const getProductPadLfoValue = useCallback((pad: 'pad1' | 'pad2'): number => {
    const telemetry = productEngine.getTelemetry();
    return pad === 'pad2' ? telemetry?.pad2Lfo1Value ?? 0 : telemetry?.pad1Lfo1Value ?? 0;
  }, []);

  const pushProductMidiMessage = useCallback((message: KesshoMidiMessage): void => {
    productEngine.pushMidiMessage(message);
  }, []);

  const setProductGranularUiActive = useCallback((active: boolean): void => {
    productEngine.setGranularUiActive(active);
  }, []);

  const setProductVisualTelemetryActive = useCallback((active: boolean): void => {
    productEngine.setVisualTelemetryActive(active);
  }, []);

  const productRuntimeSupportsRangeKey = useCallback((key: string): boolean => {
    return isCoreProductRangeKeySupported(key);
  }, []);

  useEffect(() => {
    const active = uiMode === 'advanced' && documentVisible;
    productEngine.setVisualTelemetryActive(active);
    return () => {
      productEngine.setVisualTelemetryActive(false);
    };
  }, [documentVisible, uiMode]);

  return {
    getProductGranularActiveGrainCount,
    getProductGranularWriteHeadPosition,
    getProductGranularVoicePositions,
    getProductGranularVisualEvents,
    getProductDynamicsVisualTelemetry,
    getProductPadFilterFreq,
    getProductPadLfoValue,
    pushProductMidiMessage,
    setProductGranularUiActive,
    setProductVisualTelemetryActive,
    productRuntimeSupportsRangeKey,
  };
}
