import { useCallback, useEffect } from 'react';
import { isCoreProductRangeKeySupported } from '../audio/coreProductEvents';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import type { ProductDynamicsVisualTelemetry, ProductSimpleSequencerVisualPlanActive } from '../audio/product/ProductEngineTypes';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { CoreProductGranularVisualEvent } from '../audio/coreProductTelemetry';
import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';

type ProductRuntimeTelemetryOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
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
  setProductSimpleSequencerVisualPlanActive: (active: ProductSimpleSequencerVisualPlanActive) => void;
  setProductVisualTelemetryActive: (active: boolean) => void;
  productRuntimeSupportsRangeKey: (key: string) => boolean;
};

const EMPTY_PRODUCT_DYNAMICS_VISUAL_TELEMETRY: ProductDynamicsVisualTelemetry = {
  contextTime: 0,
  endCompHandledByWorklet: false,
  endCompReductionDb: 0,
  worklet: null,
  sidechainEvents: [],
};

export function useProductRuntimeTelemetry({
  productRuntimeMode,
}: ProductRuntimeTelemetryOptions): ProductRuntimeTelemetry {
  const productRuntimeActive = productRuntimeMode === 'core-product';

  const getProductGranularActiveGrainCount = useCallback((): number => {
    if (!productRuntimeActive) return 0;
    return productEngine.getTelemetry()?.activeGrains ?? 0;
  }, [productRuntimeActive]);

  const getProductGranularWriteHeadPosition = useCallback((): number => {
    if (!productRuntimeActive) return 0;
    return productEngine.getTelemetry()?.granularWriteHeadPosition ?? 0;
  }, [productRuntimeActive]);

  const getProductGranularVoicePositions = useCallback((): readonly number[] => {
    if (!productRuntimeActive) return [0, 0, 0, 0];
    return productEngine.getTelemetry()?.granularVoicePositions ?? [0, 0, 0, 0];
  }, [productRuntimeActive]);

  const getProductGranularVisualEvents = useCallback((): readonly CoreProductGranularVisualEvent[] => {
    if (!productRuntimeActive) return [];
    return productEngine.getTelemetry()?.granularVisualEvents ?? [];
  }, [productRuntimeActive]);

  const getProductDynamicsVisualTelemetry = useCallback((): ProductDynamicsVisualTelemetry => {
    if (!productRuntimeActive) return EMPTY_PRODUCT_DYNAMICS_VISUAL_TELEMETRY;
    return productEngine.getDynamicsVisualTelemetry();
  }, [productRuntimeActive]);

  const getProductPadFilterFreq = useCallback((pad: 'pad1' | 'pad2'): number => {
    if (!productRuntimeActive) return 0;
    const telemetry = productEngine.getTelemetry();
    return pad === 'pad2' ? telemetry?.pad2FilterFreq ?? 0 : telemetry?.pad1FilterFreq ?? 0;
  }, [productRuntimeActive]);

  const getProductPadLfoValue = useCallback((pad: 'pad1' | 'pad2'): number => {
    if (!productRuntimeActive) return 0;
    const telemetry = productEngine.getTelemetry();
    return pad === 'pad2' ? telemetry?.pad2Lfo1Value ?? 0 : telemetry?.pad1Lfo1Value ?? 0;
  }, [productRuntimeActive]);

  const pushProductMidiMessage = useCallback((message: KesshoMidiMessage): void => {
    if (!productRuntimeActive) return;
    productEngine.pushMidiMessage(message);
  }, [productRuntimeActive]);

  const setProductGranularUiActive = useCallback((active: boolean): void => {
    if (!productRuntimeActive) return;
    productEngine.setGranularUiActive(active);
  }, [productRuntimeActive]);

  const setProductVisualTelemetryActive = useCallback((active: boolean): void => {
    if (!productRuntimeActive) return;
    productEngine.setVisualTelemetryActive(active);
  }, [productRuntimeActive]);

  const setProductSimpleSequencerVisualPlanActive = useCallback((active: ProductSimpleSequencerVisualPlanActive): void => {
    if (!productRuntimeActive) return;
    productEngine.setSimpleSequencerVisualPlanActive(active);
  }, [productRuntimeActive]);

  const productRuntimeSupportsRangeKey = useCallback((key: string): boolean => {
    return productRuntimeMode !== 'core-product' || isCoreProductRangeKeySupported(key);
  }, [productRuntimeMode]);

  useEffect(() => {
    if (productRuntimeMode !== 'core-product') {
      productEngine.setVisualTelemetryActive(false);
    }
    return () => {
      productEngine.setVisualTelemetryActive(false);
    };
  }, [productRuntimeMode]);

  useEffect(() => {
    if (productRuntimeMode !== 'core-product') {
      productEngine.setSimpleSequencerVisualPlanActive({ padChord: false, randomTiming: false });
      return;
    }
    return () => {
      productEngine.setSimpleSequencerVisualPlanActive({ padChord: false, randomTiming: false });
    };
  }, [productRuntimeMode]);

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
    setProductSimpleSequencerVisualPlanActive,
    setProductVisualTelemetryActive,
    productRuntimeSupportsRangeKey,
  };
}
