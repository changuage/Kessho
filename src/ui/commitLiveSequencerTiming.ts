import type { MutableRefObject } from 'react';

import { isCoreProductLiveSequencerTimingEvent } from '../audio/coreProductEvents';
import type { ProductEnginePort } from '../audio/product/ProductEnginePort';
import type { ProductEvent } from '../audio/product/ProductEngineTypes';
import { commitProductControlActionForProduct } from '../product-control';
import type { SliderState } from './state';

type CommitLiveSequencerTimingOptions = {
  engine: ProductEnginePort;
  stateRef: MutableRefObject<SliderState>;
  patch: Readonly<Record<string, unknown>>;
  events: readonly ProductEvent[];
};

/**
 * Sends phase-preserving lane timing changes directly to the audio runtime.
 * Revision/persistence bookkeeping follows asynchronously and never gates the
 * audible timing change behind a trigger-critical snapshot acknowledgement.
 */
export function commitLiveSequencerTiming({
  engine,
  stateRef,
  patch,
  events,
}: CommitLiveSequencerTimingOptions): void {
  if (events.length === 0) return;
  if (!events.every(isCoreProductLiveSequencerTimingEvent)) {
    throw new Error('Live sequencer timing commits only accept live lane timing events');
  }

  engine.enqueueEvents(events);

  void commitProductControlActionForProduct(
    engine,
    stateRef.current,
    {
      type: 'sequencer/edit',
      patch,
      triggerCritical: false,
    },
    {
      reason: 'sequencer-control-change',
      triggerCritical: false,
      syncVisibleSliders: false,
      applyMode: 'event',
    },
  ).catch((error) => {
    console.warn('Product live sequencer timing persistence failed:', error);
  });
}
