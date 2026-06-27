import { useCallback, useMemo } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import {
  createCoreProductAnchorWalkerPerformanceEvent,
  createCoreProductGeneratedSequencerCaptureEvent,
  type CoreProductGeneratedSequencerCaptureMode,
} from '../audio/coreProductEvents';
import type { GeneratedSequencerCaptureEvent } from '../audio/coreProductGeneratedSequencerCaptureTypes';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { AnchorWalkerPerformanceEvent } from './sequencer/anchorWalkerTypes';

export type ProductGeneratedSequencerCaptureRequest = {
  enabled: boolean;
  sourceLaneIndex: number;
  targetLaneIndex: number;
  sourceMode: CoreProductGeneratedSequencerCaptureMode;
};

export type ProductGeneratedSequencerCaptureTelemetry = {
  events: readonly GeneratedSequencerCaptureEvent[];
  overflowCount: number;
};

export type ProductRuntimeSynthPageEvents = {
  sendProductAnchorWalkerPerformanceEvent: (
    laneIndex: number,
    event: AnchorWalkerPerformanceEvent,
  ) => void;
  setProductGeneratedSequencerCaptureEnabled: (
    request: ProductGeneratedSequencerCaptureRequest,
  ) => void;
  getProductGeneratedSequencerCaptureTelemetry: () => ProductGeneratedSequencerCaptureTelemetry;
};

const EMPTY_GENERATED_CAPTURE_TELEMETRY: ProductGeneratedSequencerCaptureTelemetry = {
  events: [],
  overflowCount: 0,
};

export function useProductRuntimeSynthPageEvents(
  productRuntimeMode: ProductRuntimeSelectionMode,
): ProductRuntimeSynthPageEvents {
  const productRuntimeActive = productRuntimeMode === 'core-product';

  const sendProductAnchorWalkerPerformanceEvent = useCallback((
    laneIndex: number,
    event: AnchorWalkerPerformanceEvent,
  ): void => {
    if (!productRuntimeActive) return;
    try {
      productEngine.enqueueEvent(createCoreProductAnchorWalkerPerformanceEvent('synth', laneIndex, event.action, {
        delta: event.delta,
        velocity: event.velocity,
        midi: event.midi,
      }));
    } catch (error) {
      console.warn('Failed to enqueue Anchor Walker performance event', error);
    }
  }, [productRuntimeActive]);

  const setProductGeneratedSequencerCaptureEnabled = useCallback((
    request: ProductGeneratedSequencerCaptureRequest,
  ): void => {
    if (!productRuntimeActive) return;
    try {
      productEngine.enqueueEvent(createCoreProductGeneratedSequencerCaptureEvent(request));
    } catch (error) {
      console.warn('Failed to enqueue generated sequencer capture event', error);
    }
  }, [productRuntimeActive]);

  const getProductGeneratedSequencerCaptureTelemetry = useCallback((): ProductGeneratedSequencerCaptureTelemetry => {
    if (!productRuntimeActive) return EMPTY_GENERATED_CAPTURE_TELEMETRY;
    const telemetry = productEngine.getTelemetry();
    return {
      events: telemetry?.generatedSequencerCaptureEvents ?? [],
      overflowCount: telemetry?.generatedSequencerCaptureOverflowCount ?? 0,
    };
  }, [productRuntimeActive]);

  return useMemo(() => ({
    getProductGeneratedSequencerCaptureTelemetry,
    sendProductAnchorWalkerPerformanceEvent,
    setProductGeneratedSequencerCaptureEnabled,
  }), [
    getProductGeneratedSequencerCaptureTelemetry,
    sendProductAnchorWalkerPerformanceEvent,
    setProductGeneratedSequencerCaptureEnabled,
  ]);
}
