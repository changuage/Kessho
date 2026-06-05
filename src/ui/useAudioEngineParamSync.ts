import { useCallback, useEffect, useRef } from 'react';
import { referenceAudioEngineDebug } from '../audio/reference/ReferenceAudioEngineDebugCompat';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { ProductSnapshotPatchReason } from '../audio/product/ProductEngineTypes';
import { commitVisibleSliderStateForProduct } from '../product-control';
import { collectChangedStatePatch } from './audioEngineStatePatch';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import type { SliderState } from './state';

const CORE_PRODUCT_PARAM_UPDATE_INTERVAL_MS = 33;

export type AudioEngineParamUpdateOptions = {
  immediate?: boolean;
  reason?: ProductSnapshotPatchReason;
  forceFullSnapshot?: boolean;
  triggerCritical?: boolean;
};

const FX_CONTROL_KEY_PATTERNS: readonly RegExp[] = [
  /^(reverb|delayA|delayB)([A-Z]|$)/,
  /^granular(?!Level$)([A-Z]|$)/,
  /^(dynamics|sidechain|character|degrade|spectralFreeze|endComp)([A-Z]|$)/,
  /(ReverbSend|DelayASend|DelayBSend|GranularSend)$/,
];

const MORPH_CONTROL_KEY_PATTERNS: readonly RegExp[] = [
  /(Morph|Distance|Expression)$/,
  /(MorphAuto|MorphSpeed|MorphMode)$/,
  /^waterMorph[AB]?$/,
  /^waterChannelsMorph$/,
  /^insects2?Distance$/,
];

const TRANSPORT_CONTROL_KEY_PATTERNS: readonly RegExp[] = [
  /^transport(PrimaryClock|BarsPerPhrase|BeatsPerBar)$/,
  /^sequencerMasterBPM$/,
  /^(synth|drum)EuclidBaseBPM$/,
  /(ClockSource|JoinPolicy|SyncPolicy)$/,
];

const SEQUENCER_CONTROL_KEY_PATTERNS: readonly RegExp[] = [
  /^synthEuclidean/,
  /^synthEuclid[1-4]/,
  /^drumEuclid/,
  /^chordProgression/,
];

function isFxControlPatchKey(key: string): boolean {
  return FX_CONTROL_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function isMorphControlPatchKey(key: string): boolean {
  return MORPH_CONTROL_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function isTransportControlPatchKey(key: string): boolean {
  return TRANSPORT_CONTROL_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function isSequencerControlPatchKey(key: string): boolean {
  return SEQUENCER_CONTROL_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function inferProductPatchReason(
  patch: Partial<SliderState>,
  explicitReason?: ProductSnapshotPatchReason,
): ProductSnapshotPatchReason {
  if (explicitReason) return explicitReason;
  const keys = Object.keys(patch);
  if (keys.length > 0 && keys.some(isMorphControlPatchKey)) return 'morph-control-change';
  if (keys.length > 0 && keys.some(isTransportControlPatchKey)) return 'transport-change';
  if (keys.length > 0 && keys.some(isSequencerControlPatchKey)) return 'sequencer-control-change';
  return keys.length > 0 && keys.some(isFxControlPatchKey) ? 'fx-control-change' : 'ui-control-change';
}

function requiresResolvedCommit(
  reason: ProductSnapshotPatchReason,
  options?: AudioEngineParamUpdateOptions,
): boolean {
  return options?.triggerCritical === true
    || options?.immediate === true
    || options?.forceFullSnapshot === true
    || reason === 'preset-load'
    || reason === 'morph-control-change';
}

function shouldFlushImmediatelyForResolvedCommit(
  previousState: SliderState | null,
  nextState: SliderState,
  options?: AudioEngineParamUpdateOptions,
): boolean {
  if (options?.immediate || options?.triggerCritical || options?.forceFullSnapshot) return true;
  if (!previousState) return false;
  const patch = collectChangedStatePatch(previousState, nextState);
  const reason = inferProductPatchReason(patch, options?.reason);
  return reason === 'preset-load' || reason === 'morph-control-change';
}

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
      const reason = inferProductPatchReason(patch, options?.reason);
      if (requiresResolvedCommit(reason, options)) {
        void commitVisibleSliderStateForProduct(productEngine, nextState, {
          reason,
          triggerCritical: options?.triggerCritical ?? true,
        }).catch((error) => {
          console.warn('Product resolved-state commit failed:', error);
        });
        return;
      }
      productEngine.updateSnapshotPatch(reason, patch);
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
    if (
      audioEngineRuntimeMode !== 'core-product'
      || options?.immediate
      || shouldFlushImmediatelyForResolvedCommit(lastAppliedAudioEngineStateRef.current, nextState, options)
    ) {
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
