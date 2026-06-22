import { useCallback } from 'react';
import { referenceAudioEngineDebug } from '../audio/reference/ReferenceAudioEngineDebugCompat';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { productEngine } from '../audio/product/ProductEngineProxy';
import type { EarthTextureDebugState } from '../audio/engineSharedTypes';
import type { TransportDebugSnapshot } from '../audio/transport';
import type { SliderState } from './state';

type LeadMorphedParams = { attack: number; decay: number; sustain: number; release: number } | null;
type ReferenceAudioContextState = 'suspended' | 'running' | 'closed' | 'interrupted';

const EMPTY_EARTH_TEXTURE_DEBUG_STATE: EarthTextureDebugState = {
  waves: null,
  birds: null,
  birds2: null,
  frogs: null,
};

function isReferenceRuntimeNotReady(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('unavailable before web-ts has initialized');
}

function readOptionalReferenceDebugValue<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch (error) {
    if (isReferenceRuntimeNotReady(error)) return fallback;
    throw error;
  }
}

export type SelectedAudioEngineDebugSurface = {
  getSelectedGranularBufferWaveform: () => Float32Array | null;
  getSelectedReferenceAudioContextState: () => ReferenceAudioContextState | null;
  disposeSelectedReferenceEngine: () => void;
  getSelectedTransportDebugState: () => TransportDebugSnapshot | null;
  getEarthTextureDebugState: () => EarthTextureDebugState;
  getSelectedLeadMorphedParams: (lead: 1 | 2) => LeadMorphedParams;
  getSelectedDrumVoiceAnalyser: (voice: unknown) => AnalyserNode | undefined;
  getSelectedDynamicsAnalyser: (key: unknown) => AnalyserNode | null;
  referenceDrumVoiceAnalyser: ((voice: unknown) => AnalyserNode | undefined) | undefined;
  referenceDynamicsAnalyser: ((key: unknown) => AnalyserNode | null) | undefined;
  liveLeadMorphedParamsAvailable: boolean;
  liveWaveformTelemetryAvailable: boolean;
  textureDebugAvailable: boolean;
  updateSelectedReferenceParams: (nextState: SliderState, metadata: { presetId: string; presetName: string }) => void;
};

export function useSelectedAudioEngineDebugSurface(
  audioEngineRuntimeMode: AudioEngineRuntimeMode,
): SelectedAudioEngineDebugSurface {
  const getSelectedGranularBufferWaveform = useCallback((): Float32Array | null => {
    if (audioEngineRuntimeMode === 'core-product') {
      return productEngine.getTelemetry()?.granularBufferWaveform ?? null;
    }
    return referenceAudioEngineDebug.getGranularBufferWaveform();
  }, [audioEngineRuntimeMode]);

  const getSelectedReferenceAudioContextState = useCallback((): ReferenceAudioContextState | null => {
    if (audioEngineRuntimeMode === 'core-product') return null;
    return (referenceAudioEngineDebug.getAudioContext()?.state ?? null) as ReferenceAudioContextState | null;
  }, [audioEngineRuntimeMode]);

  const disposeSelectedReferenceEngine = useCallback((): void => {
    if (audioEngineRuntimeMode === 'core-product') return;
    referenceAudioEngineDebug.dispose?.();
  }, [audioEngineRuntimeMode]);

  const getSelectedTransportDebugState = useCallback((): TransportDebugSnapshot | null => (
    audioEngineRuntimeMode === 'core-product'
      ? productEngine.getProductState().transportDebug
      : referenceAudioEngineDebug.getTransportDebugState()
  ), [audioEngineRuntimeMode]);

  const getEarthTextureDebugState = useCallback((): EarthTextureDebugState => (
    audioEngineRuntimeMode === 'core-product'
      ? productEngine.getTelemetry()?.earthTextureDebugState ?? EMPTY_EARTH_TEXTURE_DEBUG_STATE
      : referenceAudioEngineDebug.getEarthTextureDebugState()
  ), [audioEngineRuntimeMode]);

  const getSelectedLeadMorphedParams = useCallback((lead: 1 | 2): LeadMorphedParams => (
    audioEngineRuntimeMode === 'core-product'
      ? null
      : readOptionalReferenceDebugValue(() => referenceAudioEngineDebug.getLeadMorphedParams(lead), null)
  ), [audioEngineRuntimeMode]);

  const getSelectedDrumVoiceAnalyser = useCallback((voice: unknown): AnalyserNode | undefined => (
    audioEngineRuntimeMode === 'core-product' ? undefined : referenceAudioEngineDebug.getDrumVoiceAnalyser(voice)
  ), [audioEngineRuntimeMode]);

  const getSelectedDynamicsAnalyser = useCallback((key: unknown): AnalyserNode | null => (
    audioEngineRuntimeMode === 'core-product' ? null : referenceAudioEngineDebug.getDynamicsAnalyser(key)
  ), [audioEngineRuntimeMode]);

  const updateSelectedReferenceParams = useCallback((nextState: SliderState, metadata: { presetId: string; presetName: string }): void => {
    if (audioEngineRuntimeMode === 'core-product') return;
    referenceAudioEngineDebug.updateParams(nextState, metadata);
  }, [audioEngineRuntimeMode]);

  const referenceRuntimeActive = audioEngineRuntimeMode !== 'core-product';

  return {
    getSelectedGranularBufferWaveform,
    getSelectedReferenceAudioContextState,
    disposeSelectedReferenceEngine,
    getSelectedTransportDebugState,
    getEarthTextureDebugState,
    getSelectedLeadMorphedParams,
    getSelectedDrumVoiceAnalyser,
    getSelectedDynamicsAnalyser,
    referenceDrumVoiceAnalyser: referenceRuntimeActive ? getSelectedDrumVoiceAnalyser : undefined,
    referenceDynamicsAnalyser: referenceRuntimeActive ? getSelectedDynamicsAnalyser : undefined,
    liveLeadMorphedParamsAvailable: referenceRuntimeActive,
    liveWaveformTelemetryAvailable: referenceRuntimeActive || audioEngineRuntimeMode === 'core-product',
    textureDebugAvailable: referenceRuntimeActive || audioEngineRuntimeMode === 'core-product',
    updateSelectedReferenceParams,
  };
}
