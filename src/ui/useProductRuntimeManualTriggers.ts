import { useCallback, useRef, type MutableRefObject } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { ProductDrumVoice, ProductManualSynthNote, ProductManualSynthSource } from '../audio/product/ProductEngineTypes';
import { CORE_PRODUCT_SOURCE_IDS, createCoreProductManualNoteKillEvent } from '../audio/coreProductEvents';
import { commitProductControlActionThenTrigger } from '../product-control';
import type { SliderState } from './state';

type ProductRuntimeManualTriggersOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  stateRef: MutableRefObject<SliderState>;
};

export type ProductDrumVoiceTriggerOptions = {
  velocity?: number;
  statePatch?: Partial<SliderState>;
  triggerCritical?: boolean;
};

type ProductRuntimeManualTriggers = {
  auditionSynthNote: (note: ProductManualSynthNote) => void;
  auditionSynthNoteWithState: (note: ProductManualSynthNote, externalState: SliderState) => void;
  triggerDrumVoice: (voice: ProductDrumVoice, options?: ProductDrumVoiceTriggerOptions) => void;
  triggerDrumVoiceWithState: (voice: ProductDrumVoice, externalState: SliderState, velocity?: number) => void;
};

const DEFAULT_MANUAL_DRUM_VELOCITY = 0.8;
const MANUAL_SYNTH_SOURCE_IDS: Record<ProductManualSynthSource, number> = {
  pad1: CORE_PRODUCT_SOURCE_IDS.pad1,
  pad2: CORE_PRODUCT_SOURCE_IDS.pad2,
  lead1: CORE_PRODUCT_SOURCE_IDS.lead1,
  lead2: CORE_PRODUCT_SOURCE_IDS.lead2,
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

export function useProductRuntimeManualTriggers({
  stateRef,
}: ProductRuntimeManualTriggersOptions): ProductRuntimeManualTriggers {
  const previousSynthAuditionSourceRef = useRef<ProductManualSynthSource | null>(null);
  const synthAuditionQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const synthAuditionRequestRef = useRef(0);

  const stopPreviousSynthAudition = useCallback((): void => {
    const previousSource = previousSynthAuditionSourceRef.current;
    if (!previousSource) return;
    previousSynthAuditionSourceRef.current = null;
    try {
      productEngine.enqueueEvent(createCoreProductManualNoteKillEvent(MANUAL_SYNTH_SOURCE_IDS[previousSource]));
    } catch {
      // The previous audition may belong to a runtime that has since been stopped or reloaded.
    }
  }, []);

  const queueSynthAudition = useCallback((
    note: ProductManualSynthNote,
    run: () => Promise<unknown>,
  ): void => {
    const requestId = synthAuditionRequestRef.current + 1;
    synthAuditionRequestRef.current = requestId;
    const queued = synthAuditionQueueRef.current.catch(() => undefined).then(async () => {
      stopPreviousSynthAudition();
      previousSynthAuditionSourceRef.current = note.source;
      await run();
    });
    synthAuditionQueueRef.current = queued;
    void queued.catch(() => {
      if (synthAuditionRequestRef.current === requestId && previousSynthAuditionSourceRef.current === note.source) {
        previousSynthAuditionSourceRef.current = null;
      }
    });
  }, [stopPreviousSynthAudition]);

  const auditionSynthNote = useCallback((note: ProductManualSynthNote): void => {
    const externalState = stateRef.current;
    const triggerCritical = shouldWaitForManualTriggerSnapshot();
    queueSynthAudition(note, () => (
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
  }, [queueSynthAudition, stateRef]);

  const triggerDrumVoice = useCallback((voice: ProductDrumVoice, options: ProductDrumVoiceTriggerOptions = {}): void => {
    const velocity = options.velocity ?? DEFAULT_MANUAL_DRUM_VELOCITY;
    const externalState = options.statePatch
      ? { ...stateRef.current, ...options.statePatch } as SliderState
      : stateRef.current;
    const triggerCritical = options.triggerCritical ?? shouldWaitForManualTriggerSnapshot();
    void commitProductControlActionThenTrigger(
      productEngine,
      externalState,
      {
        type: 'manual-trigger/request',
        source: `drum:${String(voice)}`,
        kind: 'drum-voice',
        voice,
        velocity,
      },
      (_revision, resolvedSliders) => productEngine.triggerDrumVoice(voice, velocity, resolvedSliders),
      manualTriggerCommitOptions(triggerCritical),
    );
  }, [stateRef]);

  const auditionSynthNoteWithState = useCallback((note: ProductManualSynthNote, externalState: SliderState): void => {
    // Preset-pool preview needs the candidate state exactly; Product Control can reapply
    // synth morph endpoints and mask pad/lead preset parameters from the auditioned preset.
    queueSynthAudition(note, () => productEngine.auditionSynthNote(note, externalState));
  }, [queueSynthAudition]);

  const triggerDrumVoiceWithState = useCallback((
    voice: ProductDrumVoice,
    externalState: SliderState,
    velocity: number = DEFAULT_MANUAL_DRUM_VELOCITY,
  ): void => {
    // Preset-pool preview needs the candidate state exactly; Product Control can reapply
    // endpoint overrides and mask envelope or tone changes from the auditioned preset.
    void productEngine.triggerDrumVoice(voice, velocity, externalState);
  }, []);

  return {
    auditionSynthNote,
    auditionSynthNoteWithState,
    triggerDrumVoice,
    triggerDrumVoiceWithState,
  };
}
