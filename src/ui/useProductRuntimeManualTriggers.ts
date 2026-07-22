import { useCallback, useRef, type MutableRefObject } from 'react';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { ProductDrumVoice, ProductManualSynthNote, ProductManualSynthSource } from '../audio/product/ProductEngineTypes';
import type { ManualSynthNoteOptions } from '../audio/engineSharedTypes';
import { createCoreProductManualNoteKillEvent, createCoreProductParamEvent } from '../audio/coreProductEvents';
import { KESSHO_PRODUCT_PARAM_IDS } from '../audio/generated/kesshoProductParams';
import type { ProductLiveNoteEvent } from '../audio/product/liveNoteEvents';
import { MANUAL_SYNTH_SOURCE_CONFIG, isProductManualSynthSource } from '../audio/product/manualSynthSources';
import { commitProductControlActionThenTrigger } from '../product-control';
import type { SliderState } from './state';

type ProductRuntimeManualTriggersOptions = {
  productRuntimeCore: boolean;
  stateRef: MutableRefObject<SliderState>;
};

export type ProductDrumVoiceTriggerOptions = {
  velocity?: number;
  statePatch?: Partial<SliderState>;
  triggerCritical?: boolean;
};

export type ProductRuntimeManualTriggers = {
  auditionSynthNote: (note: ManualSynthNoteOptions) => void;
  startSynthLiveNote: (event: ProductLiveNoteEvent) => Promise<void>;
  stopSynthLiveNote: (event: ProductLiveNoteEvent) => void;
  auditionSynthNoteWithState: (note: ManualSynthNoteOptions, externalState: SliderState) => void;
  triggerDrumVoice: (voice: ProductDrumVoice, options?: ProductDrumVoiceTriggerOptions) => void;
  triggerDrumVoiceWithState: (voice: ProductDrumVoice, externalState: SliderState, velocity?: number) => void;
};

export type RuntimeManualTriggerSurface = Pick<
  ProductRuntimeManualTriggers,
  'auditionSynthNote' | 'startSynthLiveNote' | 'stopSynthLiveNote' | 'triggerDrumVoice'
>;

const DEFAULT_MANUAL_DRUM_VELOCITY = 0.8;
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
  if (!isProductManualSynthSource(note.source)) {
    throw new Error(`Product Core manual synth source is not supported: ${String(note.source)}`);
  }
  return note as ProductManualSynthNote;
}

export function useProductRuntimeManualTriggers({
  productRuntimeCore,
  stateRef,
}: ProductRuntimeManualTriggersOptions): ProductRuntimeManualTriggers {
  const productRuntimeActive = productRuntimeCore;
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
      productEngine.enqueueEvent(createCoreProductManualNoteKillEvent(MANUAL_SYNTH_SOURCE_CONFIG[previousSource].sourceId));
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

  const startSynthLiveNote = useCallback(async (event: ProductLiveNoteEvent): Promise<void> => {
    if (!productRuntimeActive || event.kind !== 'live-note-on' || !isProductManualSynthSource(event.instrument)) return;
    const source = event.instrument;
    const enabledKey = MANUAL_SYNTH_SOURCE_CONFIG[source].enabledKey as keyof SliderState;
    // UI keyboard preview historically enables a disabled source for audition.
    // Preserve that behavior with one cheap realtime event while running; cold
    // startup still commits once so the source configuration and assets are ready.
    // Hardware MIDI keeps native channel routing and does not auto-enable sources.
    if (event.source !== 'midi' && !Boolean(stateRef.current[enabledKey])) {
      if (productEngine.getLifecycleState() !== 'running') {
        const externalState = { ...stateRef.current, [enabledKey]: true } as SliderState;
        const productNote: ProductManualSynthNote = {
          source,
          midi: event.note,
          velocity: event.velocity,
        };
        await commitProductControlActionThenTrigger(
          productEngine,
          externalState,
          {
            type: 'manual-trigger/request',
            source,
            kind: 'synth-note',
            note: productNote,
            velocity: event.velocity,
          },
          () => productEngine.enqueueLiveNoteEvent(event),
          manualTriggerCommitOptions(false),
        );
        return;
      }
      productEngine.enqueueEvent(createCoreProductParamEvent(
        KESSHO_PRODUCT_PARAM_IDS.SourceEnabled,
        1,
        MANUAL_SYNTH_SOURCE_CONFIG[source].sourceId,
      ));
    }
    productEngine.enqueueLiveNoteEvent(event);
  }, [productRuntimeActive, stateRef]);

  const stopSynthLiveNote = useCallback((event: ProductLiveNoteEvent): void => {
    if (!productRuntimeActive || event.kind !== 'live-note-off') return;
    productEngine.enqueueLiveNoteEvent(event);
  }, [productRuntimeActive]);

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
    startSynthLiveNote,
    stopSynthLiveNote,
    auditionSynthNoteWithState,
    triggerDrumVoice,
    triggerDrumVoiceWithState,
  };
}
