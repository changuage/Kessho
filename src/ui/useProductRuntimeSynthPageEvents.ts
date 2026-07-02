import { useCallback, useMemo, type MutableRefObject } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import {
  createCoreProductAnchorWalkerPerformanceEvent,
  createCoreProductGeneratedSequencerCaptureEvent,
  type CoreProductGeneratedSequencerCaptureMode,
} from '../audio/coreProductEvents';
import type { GeneratedSequencerCaptureEvent } from '../audio/coreProductGeneratedSequencerCaptureTypes';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { AnchorWalkerPerformanceEvent } from './sequencer/anchorWalkerTypes';
import type { GeneratedCaptureStepCommit } from './sequencer/commitGeneratedCaptureToEuclid';
import {
  buildProductGeneratedCaptureStepCommitEvents,
  generatedCaptureStepPatchForState,
} from './sequencer/generatedCaptureProductCommit';
import { commitProductControlActionForProduct } from '../product-control';
import type { SliderState } from './state';

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
  commitProductGeneratedSequencerCaptureToStep: (
    commit: GeneratedCaptureStepCommit,
  ) => void;
  getProductGeneratedSequencerCaptureTelemetry: () => ProductGeneratedSequencerCaptureTelemetry;
};

const EMPTY_GENERATED_CAPTURE_TELEMETRY: ProductGeneratedSequencerCaptureTelemetry = {
  events: [],
  overflowCount: 0,
};

export function useProductRuntimeSynthPageEvents(
  productRuntimeMode: ProductRuntimeSelectionMode,
  stateRef: MutableRefObject<SliderState>,
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

  const commitProductGeneratedSequencerCaptureToStep = useCallback((commit: GeneratedCaptureStepCommit): void => {
    if (!productRuntimeActive) return;
    try {
      const patch = generatedCaptureStepPatchForState(stateRef.current, commit);
      const events = buildProductGeneratedCaptureStepCommitEvents(commit);
      void commitProductControlActionForProduct(
        productEngine,
        stateRef.current,
        {
          type: 'sequencer/edit',
          patch,
          triggerCritical: true,
        },
        {
          reason: 'sequencer-control-change',
          triggerCritical: true,
          productEvents: events,
          applyMode: 'event',
        },
      ).catch((error) => {
        console.warn('Product generated capture Step handoff failed', error);
      });
    } catch (error) {
      console.warn('Failed to commit generated capture Step handoff', error);
    }
  }, [productRuntimeActive, stateRef]);

  return useMemo(() => ({
    commitProductGeneratedSequencerCaptureToStep,
    getProductGeneratedSequencerCaptureTelemetry,
    sendProductAnchorWalkerPerformanceEvent,
    setProductGeneratedSequencerCaptureEnabled,
  }), [
    commitProductGeneratedSequencerCaptureToStep,
    getProductGeneratedSequencerCaptureTelemetry,
    sendProductAnchorWalkerPerformanceEvent,
    setProductGeneratedSequencerCaptureEnabled,
  ]);
}
