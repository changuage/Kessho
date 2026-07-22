import { useCallback, useEffect } from 'react';
import type { ProductDynamicsVisualTelemetry, ProductSimpleSequencerVisualPlanActive } from '../audio/product/ProductEngineTypes';
import type { CoreProductGranularVisualEvent } from '../audio/coreProductTelemetry';
import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';
import type { ProductRuntimeTelemetrySurface } from './productRuntimeConstruction';

type ProductRuntimeTelemetryOptions = {
  productRuntimeTelemetry: ProductRuntimeTelemetrySurface;
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
  productRuntimeTelemetry,
}: ProductRuntimeTelemetryOptions): ProductRuntimeTelemetry {
  const getProductGranularActiveGrainCount = useCallback((): number => {
    return productRuntimeTelemetry.getTelemetry()?.activeGrains ?? 0;
  }, [productRuntimeTelemetry]);

  const getProductGranularWriteHeadPosition = useCallback((): number => {
    return productRuntimeTelemetry.getTelemetry()?.granularWriteHeadPosition ?? 0;
  }, [productRuntimeTelemetry]);

  const getProductGranularVoicePositions = useCallback((): readonly number[] => {
    return productRuntimeTelemetry.getTelemetry()?.granularVoicePositions ?? [0, 0, 0, 0];
  }, [productRuntimeTelemetry]);

  const getProductGranularVisualEvents = useCallback((): readonly CoreProductGranularVisualEvent[] => {
    return productRuntimeTelemetry.getTelemetry()?.granularVisualEvents ?? [];
  }, [productRuntimeTelemetry]);

  const getProductDynamicsVisualTelemetry = useCallback((): ProductDynamicsVisualTelemetry => {
    if (!productRuntimeTelemetry.available) return EMPTY_PRODUCT_DYNAMICS_VISUAL_TELEMETRY;
    return productRuntimeTelemetry.getDynamicsVisualTelemetry();
  }, [productRuntimeTelemetry]);

  const getProductPadFilterFreq = useCallback((pad: 'pad1' | 'pad2'): number => {
    const telemetry = productRuntimeTelemetry.getTelemetry();
    return pad === 'pad2' ? telemetry?.pad2FilterFreq ?? 0 : telemetry?.pad1FilterFreq ?? 0;
  }, [productRuntimeTelemetry]);

  const getProductPadLfoValue = useCallback((pad: 'pad1' | 'pad2'): number => {
    const telemetry = productRuntimeTelemetry.getTelemetry();
    return pad === 'pad2' ? telemetry?.pad2Lfo1Value ?? 0 : telemetry?.pad1Lfo1Value ?? 0;
  }, [productRuntimeTelemetry]);

  const pushProductMidiMessage = useCallback((message: KesshoMidiMessage): void => {
    productRuntimeTelemetry.pushMidiMessage(message);
  }, [productRuntimeTelemetry]);

  const setProductGranularUiActive = useCallback((active: boolean): void => {
    if (!productRuntimeTelemetry.available) return;
    productRuntimeTelemetry.setGranularUiActive(active);
  }, [productRuntimeTelemetry]);

  const setProductVisualTelemetryActive = useCallback((active: boolean): void => {
    if (!productRuntimeTelemetry.available) return;
    productRuntimeTelemetry.setVisualTelemetryActive(active);
  }, [productRuntimeTelemetry]);

  const setProductSimpleSequencerVisualPlanActive = useCallback((active: ProductSimpleSequencerVisualPlanActive): void => {
    if (!productRuntimeTelemetry.available) return;
    productRuntimeTelemetry.setSimpleSequencerVisualPlanActive(active);
  }, [productRuntimeTelemetry]);

  const productRuntimeSupportsRangeKey = useCallback((key: string): boolean => {
    return productRuntimeTelemetry.supportsRangeKey(key);
  }, [productRuntimeTelemetry]);

  useEffect(() => {
    if (!productRuntimeTelemetry.available) return undefined;
    productRuntimeTelemetry.setVisualTelemetryActive(false);
    return () => {
      productRuntimeTelemetry.setVisualTelemetryActive(false);
    };
  }, [productRuntimeTelemetry]);

  useEffect(() => {
    if (!productRuntimeTelemetry.available) return undefined;
    productRuntimeTelemetry.setSimpleSequencerVisualPlanActive({ padChord: false, randomTiming: false });
    return () => {
      productRuntimeTelemetry.setSimpleSequencerVisualPlanActive({ padChord: false, randomTiming: false });
    };
  }, [productRuntimeTelemetry]);

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
