import { useCallback, useEffect, useRef } from 'react';
import { referenceAudioEngineDebug } from '../audio/reference/ReferenceAudioEngineDebugCompat';
import {
  type AudioEngineRuntimeMode,
} from '../audio/product/ProductAudioRuntimeSelection';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { ProductSnapshotPatchReason } from '../audio/product/ProductEngineTypes';
import { collectChangedStatePatch } from './audioEngineStatePatch';
import type { SliderState } from './state';

const CORE_PRODUCT_PARAM_UPDATE_INTERVAL_MS = 33;

type AudioEngineParamUpdateOptions = {
  immediate?: boolean;
  reason?: ProductSnapshotPatchReason;
  forceFullSnapshot?: boolean;
};

export function useAudioEngineParamSync(audioEngineRuntimeMode: AudioEngineRuntimeMode): ((
  nextState: SliderState,
  options?: AudioEngineParamUpdateOptions,
) => void) {
  const pendingAudioEngineStateRef = useRef<SliderState | null>(null);
  const pendingAudioEngineUpdateOptionsRef = useRef<AudioEngineParamUpdateOptions | undefined>(undefined);
  const lastAppliedAudioEngineStateRef = useRef<SliderState | null>(null);
  const audioEngineUpdateTimerRef = useRef<number | null>(null);
  const lastAudioEngineUpdateMsRef = useRef(0);

  const applyAudioEngineStateUpdate = useCallback((nextState: SliderState, options?: AudioEngineParamUpdateOptions) => {
    if (audioEngineRuntimeMode === 'core-product') {
      const previousState = lastAppliedAudioEngineStateRef.current;
      const patch = previousState && !options?.forceFullSnapshot
        ? collectChangedStatePatch(previousState, nextState)
        : { ...nextState };
      lastAppliedAudioEngineStateRef.current = nextState;
      if (previousState && Object.keys(patch).length === 0) return;
      productEngine.updateSnapshotPatch(options?.reason ?? 'ui-control-change', patch);
      return;
    }
    lastAppliedAudioEngineStateRef.current = nextState;
    referenceAudioEngineDebug.updateParams(nextState);
  }, [audioEngineRuntimeMode]);

  const flushAudioEngineParamUpdate = useCallback(() => {
    audioEngineUpdateTimerRef.current = null;
    const nextState = pendingAudioEngineStateRef.current;
    const options = pendingAudioEngineUpdateOptionsRef.current;
    pendingAudioEngineStateRef.current = null;
    pendingAudioEngineUpdateOptionsRef.current = undefined;
    if (!nextState) return;
    lastAudioEngineUpdateMsRef.current = performance.now();
    applyAudioEngineStateUpdate(nextState, options);
  }, [applyAudioEngineStateUpdate]);

  const scheduleAudioEngineParamUpdate = useCallback((
    nextState: SliderState,
    options?: AudioEngineParamUpdateOptions,
  ) => {
    if (audioEngineRuntimeMode !== 'core-product' || options?.immediate) {
      pendingAudioEngineStateRef.current = null;
      pendingAudioEngineUpdateOptionsRef.current = undefined;
      if (audioEngineUpdateTimerRef.current !== null) {
        window.clearTimeout(audioEngineUpdateTimerRef.current);
        audioEngineUpdateTimerRef.current = null;
      }
      lastAudioEngineUpdateMsRef.current = performance.now();
      applyAudioEngineStateUpdate(nextState, options);
      return;
    }

    pendingAudioEngineStateRef.current = nextState;
    pendingAudioEngineUpdateOptionsRef.current = options;
    if (audioEngineUpdateTimerRef.current !== null) return;

    const now = performance.now();
    const elapsedMs = now - lastAudioEngineUpdateMsRef.current;
    const delayMs = Math.max(0, CORE_PRODUCT_PARAM_UPDATE_INTERVAL_MS - elapsedMs);
    audioEngineUpdateTimerRef.current = window.setTimeout(flushAudioEngineParamUpdate, delayMs);
  }, [audioEngineRuntimeMode, applyAudioEngineStateUpdate, flushAudioEngineParamUpdate]);

  useEffect(() => () => {
    if (audioEngineUpdateTimerRef.current !== null) {
      window.clearTimeout(audioEngineUpdateTimerRef.current);
      audioEngineUpdateTimerRef.current = null;
    }
    pendingAudioEngineStateRef.current = null;
    pendingAudioEngineUpdateOptionsRef.current = undefined;
    lastAppliedAudioEngineStateRef.current = null;
  }, []);

  return scheduleAudioEngineParamUpdate;
}
