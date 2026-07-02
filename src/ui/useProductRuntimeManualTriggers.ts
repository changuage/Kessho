import { useCallback, useRef, type MutableRefObject } from 'react';
import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { ProductDrumVoice, ProductManualSynthNote, ProductManualSynthSource } from '../audio/product/ProductEngineTypes';
import type { ManualSynthNoteOptions } from '../audio/engineSharedTypes';
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
  auditionSynthNote: (note: ManualSynthNoteOptions) => void;
  auditionSynthNoteWithState: (note: ManualSynthNoteOptions, externalState: SliderState) => void;
  triggerDrumVoice: (voice: ProductDrumVoice, options?: ProductDrumVoiceTriggerOptions) => void;
  triggerDrumVoiceWithState: (voice: ProductDrumVoice, externalState: SliderState, velocity?: number) => void;
};

const DEFAULT_MANUAL_DRUM_VELOCITY = 0.8;
const MANUAL_SYNTH_SOURCE_IDS: Record<ProductManualSynthSource, number> = {
  pad1: CORE_PRODUCT_SOURCE_IDS.pad1,
  pad2: CORE_PRODUCT_SOURCE_IDS.pad2,
  lead1: CORE_PRODUCT_SOURCE_IDS.lead1,
  lead2: CORE_PRODUCT_SOURCE_IDS.lead2,
  sample1: CORE_PRODUCT_SOURCE_IDS.sample1,
  sample2: CORE_PRODUCT_SOURCE_IDS.sample2,
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

function requireProductManualSynthNote(note: ManualSynthNoteOptions): ProductManualSynthNote {
  if (!Object.prototype.hasOwnProperty.call(MANUAL_SYNTH_SOURCE_IDS, note.source)) {
    throw new Error(`Product Core manual synth source is not supported: ${String(note.source)}`);
  }
  return note as ProductManualSynthNote;
}

export function useProductRuntimeManualTriggers({
  productRuntimeMode,
  stateRef,
}: ProductRuntimeManualTriggersOptions): ProductRuntimeManualTriggers {
  const productRuntimeActive = productRuntimeMode === 'core-product';
  const productRuntimeActiveRef = useRef(productRuntimeActive);
  const previousSynthAuditionSourceRef = useRef<ProductManualSynthSource | null>(null);
  const synthAuditionQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const synthAuditionRequestRef = useRef(0);
  productRuntimeActiveRef.current = productRuntimeActive;

  const stopPreviousSynthAudition = useCallback((): void => {
    const previousSource = previousSynthAuditionSourceRef.current;
    if (!previousSource) return;
    previousSynthAuditionSourceRef.current = null;
    if (!productRuntimeActiveRef.current) return;
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
    if (!productRuntimeActiveRef.current) return;
    const requestId = synthAuditionRequestRef.current + 1;
    synthAuditionRequestRef.current = requestId;
    const queued = synthAuditionQueueRef.current.catch(() => undefined).then(async () => {
      if (!productRuntimeActiveRef.current) return;
      stopPreviousSynthAudition();
      if (!productRuntimeActiveRef.current) return;
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

  const auditionSynthNote = useCallback((note: ManualSynthNoteOptions): void => {
    if (!productRuntimeActive) return;
    const productNote = requireProductManualSynthNote(note);
    const externalState = stateRef.current;
    const triggerCritical = shouldWaitForManualTriggerSnapshot();
    queueSynthAudition(productNote, () => (
      commitProductControlActionThenTrigger(
        productEngine,
        externalState,
        {
          type: 'manual-trigger/request',
          source: productNote.source,
          kind: 'synth-note',
          note: productNote,
          velocity: productNote.velocity,
        },
        (_revision, resolvedSliders) => productEngine.auditionSynthNote(productNote, resolvedSliders),
        manualTriggerCommitOptions(triggerCritical),
      )
    ));
  }, [productRuntimeActive, queueSynthAudition, stateRef]);

  const triggerDrumVoice = useCallback((voice: ProductDrumVoice, options: ProductDrumVoiceTriggerOptions = {}): void => {
    if (!productRuntimeActive) return;
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
  }, [productRuntimeActive, stateRef]);

  const auditionSynthNoteWithState = useCallback((note: ManualSynthNoteOptions, externalState: SliderState): void => {
    if (!productRuntimeActive) return;
    const productNote = requireProductManualSynthNote(note);
    // Preset-pool preview needs the candidate state exactly; Product Control can reapply
    // synth morph endpoints and mask pad/lead preset parameters from the auditioned preset.
    queueSynthAudition(productNote, () => productEngine.auditionSynthNote(productNote, externalState));
  }, [productRuntimeActive, queueSynthAudition]);

  const triggerDrumVoiceWithState = useCallback((
    voice: ProductDrumVoice,
    externalState: SliderState,
    velocity: number = DEFAULT_MANUAL_DRUM_VELOCITY,
  ): void => {
    if (!productRuntimeActive) return;
    // Preset-pool preview needs the candidate state exactly; Product Control can reapply
    // endpoint overrides and mask envelope or tone changes from the auditioned preset.
    void productEngine.triggerDrumVoice(voice, velocity, externalState);
  }, [productRuntimeActive]);

  return {
    auditionSynthNote,
    auditionSynthNoteWithState,
    triggerDrumVoice,
    triggerDrumVoiceWithState,
  };
}
