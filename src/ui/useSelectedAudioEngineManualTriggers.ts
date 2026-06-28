import { useCallback, useRef, type MutableRefObject } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { selectedProductRuntime } from '../audio/product/SelectedProductRuntime';
import type { ProductDrumVoice, ProductManualSynthNote, ProductManualSynthSource } from '../audio/product/ProductEngineTypes';
import { CORE_PRODUCT_SOURCE_IDS, createCoreProductManualNoteKillEvent } from '../audio/coreProductEvents';
import { commitProductControlActionThenTrigger } from '../product-control';
import type { SliderState } from './state';

type UseSelectedAudioEngineManualTriggersOptions = {
  audioEngineRuntimeMode: AudioEngineRuntimeMode;
  stateRef: MutableRefObject<SliderState>;
};

type SelectedAudioEngineManualTriggers = {
  auditionSynthNote: (note: ProductManualSynthNote) => void;
  triggerDrumVoice: (voice: ProductDrumVoice) => void;
};

const MANUAL_SYNTH_SOURCE_IDS: Record<ProductManualSynthSource, number> = {
  pad1: CORE_PRODUCT_SOURCE_IDS.pad1,
  pad2: CORE_PRODUCT_SOURCE_IDS.pad2,
  lead1: CORE_PRODUCT_SOURCE_IDS.lead1,
  lead2: CORE_PRODUCT_SOURCE_IDS.lead2,
  sample1: CORE_PRODUCT_SOURCE_IDS.sample1,
  sample2: CORE_PRODUCT_SOURCE_IDS.sample2,
  piano: CORE_PRODUCT_SOURCE_IDS.piano,
};

function shouldWaitForManualTriggerSnapshot(): boolean {
  return productEngine.getLifecycleState() === 'running';
}

function manualTriggerCommitOptions(triggerCritical: boolean): {
  triggerCritical: boolean;
  forceFullSnapshot: boolean;
} {
  return {
    triggerCritical,
    forceFullSnapshot: triggerCritical,
  };
}

export function useSelectedAudioEngineManualTriggers({
  audioEngineRuntimeMode,
  stateRef,
}: UseSelectedAudioEngineManualTriggersOptions): SelectedAudioEngineManualTriggers {
  const previousCoreProductSynthAuditionSourceRef = useRef<ProductManualSynthSource | null>(null);
  const coreProductSynthAuditionQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const coreProductSynthAuditionRequestRef = useRef(0);

  const stopPreviousCoreProductSynthAudition = useCallback((): void => {
    const previousSource = previousCoreProductSynthAuditionSourceRef.current;
    if (!previousSource) return;
    previousCoreProductSynthAuditionSourceRef.current = null;
    try {
      productEngine.enqueueEvent(createCoreProductManualNoteKillEvent(MANUAL_SYNTH_SOURCE_IDS[previousSource]));
    } catch {
      // The previous audition may belong to a runtime that has since been stopped or reloaded.
    }
  }, []);

  const queueCoreProductSynthAudition = useCallback((
    note: ProductManualSynthNote,
    run: () => Promise<unknown>,
  ): void => {
    const requestId = coreProductSynthAuditionRequestRef.current + 1;
    coreProductSynthAuditionRequestRef.current = requestId;
    const queued = coreProductSynthAuditionQueueRef.current.catch(() => undefined).then(async () => {
      stopPreviousCoreProductSynthAudition();
      previousCoreProductSynthAuditionSourceRef.current = note.source;
      await run();
    });
    coreProductSynthAuditionQueueRef.current = queued;
    void queued.catch(() => {
      if (
        coreProductSynthAuditionRequestRef.current === requestId &&
        previousCoreProductSynthAuditionSourceRef.current === note.source
      ) {
        previousCoreProductSynthAuditionSourceRef.current = null;
      }
    });
  }, [stopPreviousCoreProductSynthAudition]);

  const auditionSynthNote = useCallback((note: ProductManualSynthNote): void => {
    const externalState = stateRef.current;
    if (audioEngineRuntimeMode === 'core-product') {
      const triggerCritical = shouldWaitForManualTriggerSnapshot();
      queueCoreProductSynthAudition(note, () => (
        commitProductControlActionThenTrigger(
          productEngine,
          externalState,
          {
            type: 'manual-trigger/request',
            source: note.source,
            kind: 'synth-note',
            note,
            velocity: note.velocity,
          },
          (_revision, resolvedSliders) => productEngine.auditionSynthNote(note, resolvedSliders),
          manualTriggerCommitOptions(triggerCritical),
        )
      ));
      return;
    }
    void selectedProductRuntime.auditionSynthNote(note, externalState);
  }, [audioEngineRuntimeMode, queueCoreProductSynthAudition, stateRef]);

  const triggerDrumVoice = useCallback((voice: ProductDrumVoice): void => {
    const externalState = stateRef.current;
    if (audioEngineRuntimeMode === 'core-product') {
      const triggerCritical = shouldWaitForManualTriggerSnapshot();
      void commitProductControlActionThenTrigger(
        productEngine,
        externalState,
        {
          type: 'manual-trigger/request',
          source: `drum:${String(voice)}`,
          kind: 'drum-voice',
          voice,
          velocity: 0.8,
        },
        (_revision, resolvedSliders) => productEngine.triggerDrumVoice(voice, 0.8, resolvedSliders),
        manualTriggerCommitOptions(triggerCritical),
      );
      return;
    }
    void selectedProductRuntime.triggerDrumVoice(voice, 0.8, externalState);
  }, [audioEngineRuntimeMode, stateRef]);

  return {
    auditionSynthNote,
    triggerDrumVoice,
  };
}
