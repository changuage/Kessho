import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from 'react';
import {
  createCoreProductAnchorWalkerPerformanceEvent,
  type CoreProductEvent,
} from '../audio/coreProductEvents';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { AnchorWalkerPerformanceEvent } from './sequencer/anchorWalkerTypes';
import type {
  ProductRecordedNoteCaptureRequest,
  ProductRecordedNoteCaptureSubscription,
} from '../audio/product/ProductEngineTypes';
import type { SliderState } from './state';
import type { ProductRuntimeTelemetrySurface } from './productRuntimeConstruction';
import type { SynthSequenceVariationBank } from './sequencer/synthSequenceVariations';

export type ProductRuntimeSynthPageEvents = {
  sendProductAnchorWalkerPerformanceEvent: (
    laneIndex: number,
    event: AnchorWalkerPerformanceEvent,
  ) => void;
  setRecordedNoteCapture: (request: ProductRecordedNoteCaptureRequest) => void;
  subscribeRecordedNoteCapture: ProductRecordedNoteCaptureSubscription;
  recordedNoteCaptureAvailable: boolean;
  getRecordedNoteCaptureClockBeat: () => number | null;
  activeSynthSequenceVariationIndices: readonly (number | null)[];
  commitSynthSequenceVariationBank: (laneIndex: number, bank: SynthSequenceVariationBank) => Promise<boolean>;
  getProductArpAudibleTelemetry: () => { steps: readonly number[]; midis: readonly number[] };
};

const EMPTY_ARP_AUDIBLE_TELEMETRY = { steps: [] as readonly number[], midis: [] as readonly number[] };

export function useProductRuntimeSynthPageEvents(
  productRuntimeTelemetry: ProductRuntimeTelemetrySurface,
  stateRef: MutableRefObject<SliderState>,
): ProductRuntimeSynthPageEvents {
  const productRuntimeActive = productRuntimeTelemetry.available;
  const sendProductAnchorWalkerPerformanceEvent = useCallback((
    laneIndex: number,
    event: AnchorWalkerPerformanceEvent,
  ): void => {
    if (!productRuntimeActive) return;
    let performanceEvent: CoreProductEvent;
    try {
      performanceEvent = createCoreProductAnchorWalkerPerformanceEvent('synth', laneIndex, event.action, {
          delta: event.delta,
          velocity: event.velocity,
          midi: event.midi,
        });
    } catch (error) {
      console.warn('Failed to create Anchor Walker performance event', error);
      return;
    }
    void productEngine.enqueueRealtimeEvents([performanceEvent])
      .then(() => productEngine.requestVisualTelemetryAfterRender())
      .catch((error: unknown) => {
        console.warn('Failed to enqueue Anchor Walker performance event', error);
      });
  }, [productRuntimeActive, stateRef]);

  const getProductArpAudibleTelemetry = useCallback(() => {
    if (!productRuntimeActive) return EMPTY_ARP_AUDIBLE_TELEMETRY;
    const telemetry = productRuntimeTelemetry.getTelemetry();
    return {
      steps: telemetry?.synthArpCurrentSteps ?? EMPTY_ARP_AUDIBLE_TELEMETRY.steps,
      midis: telemetry?.synthArpCurrentMidis ?? EMPTY_ARP_AUDIBLE_TELEMETRY.midis,
    };
  }, [productRuntimeActive, productRuntimeTelemetry]);

  const setRecordedNoteCapture = useCallback((request: ProductRecordedNoteCaptureRequest): void => {
    if (!productRuntimeActive) return;
    productEngine.setRecordedNoteCapture(request);
  }, [productRuntimeActive]);

  const subscribeRecordedNoteCapture = useCallback<ProductRecordedNoteCaptureSubscription>((listener) => {
    if (!productRuntimeActive) return () => undefined;
    return productEngine.subscribeRecordedNoteCapture(listener);
  }, [productRuntimeActive]);

  const getRecordedNoteCaptureClockBeat = useCallback((): number | null => {
    if (!productRuntimeActive) return null;
    return productEngine.getRecordedNoteCaptureClockBeat();
  }, [productRuntimeActive]);

  const commitSynthSequenceVariationBank = useCallback((
    laneIndex: number,
    bank: SynthSequenceVariationBank,
  ): Promise<boolean> => {
    if (!productRuntimeActive) {
      return Promise.reject(new Error('Product runtime is unavailable for synth variation bank commit'));
    }
    return productEngine.commitSynthSequenceVariationBank(laneIndex, bank);
  }, [productRuntimeActive]);

  const [activeSynthSequenceVariationIndices, setActiveSynthSequenceVariationIndices] = useState<readonly (number | null)[]>(
    () => productRuntimeActive
      ? productEngine.getActiveSynthSequenceVariationIndices()
      : [null, null, null, null],
  );

  useEffect(() => {
    if (!productRuntimeActive) {
      setActiveSynthSequenceVariationIndices([null, null, null, null]);
      return undefined;
    }
    return productEngine.subscribeSynthSequenceVariationRuntime((next) => {
      setActiveSynthSequenceVariationIndices((previous) => {
        if (previous.length === next.length && previous.every((value, index) => value === next[index])) return previous;
        return next;
      });
    });
  }, [productRuntimeActive]);

  return useMemo(() => ({
    getProductArpAudibleTelemetry,
    getRecordedNoteCaptureClockBeat,
    activeSynthSequenceVariationIndices,
    commitSynthSequenceVariationBank,
    recordedNoteCaptureAvailable: productRuntimeActive,
    sendProductAnchorWalkerPerformanceEvent,
    setRecordedNoteCapture,
    subscribeRecordedNoteCapture,
  }), [
    getProductArpAudibleTelemetry,
    getRecordedNoteCaptureClockBeat,
    activeSynthSequenceVariationIndices,
    commitSynthSequenceVariationBank,
    productRuntimeActive,
    sendProductAnchorWalkerPerformanceEvent,
    setRecordedNoteCapture,
    subscribeRecordedNoteCapture,
  ]);
}
