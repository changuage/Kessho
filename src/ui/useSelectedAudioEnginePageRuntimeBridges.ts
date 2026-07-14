import { useMemo } from 'react';
import type { CoreProductGranularVisualEvent } from '../audio/coreProductTelemetry';
import type { DynamicsVisualTelemetrySnapshot, EarthTextureDebugState } from '../audio/engineSharedTypes';
import { useDrumPageRuntimeBridge } from './useDrumPageRuntimeBridge';
import { useDrumPageSequencerBridge } from './useDrumPageSequencerBridge';
import { useSynthPageSequencerBridge } from './useSynthPageSequencerBridge';
import type {
  ProductSynthAnchorWalkerVisualStateCallback,
  ProductSynthOrbitVisualStateCallback,
} from '../audio/product/ProductEngineTypes';
import type { SliderState } from './state';
import type { RuntimeManualTriggerSurface } from './useProductRuntimeManualTriggers';

export type SelectedAudioEnginePageRuntimeBridgeOptions =
  Parameters<typeof useSynthPageSequencerBridge>[0] &
  Parameters<typeof useDrumPageSequencerBridge>[0] &
  Parameters<typeof useDrumPageRuntimeBridge>[0] & {
    productRuntimeDebugAnalysers: {
      drumVoiceAnalyser?: ((voice: unknown) => AnalyserNode | undefined) | undefined;
      dynamicsAnalyser?: ((key: unknown) => AnalyserNode | null) | undefined;
    };
    productRuntimeManualTriggers: RuntimeManualTriggerSurface;
    getEarthTextureDebugState: () => EarthTextureDebugState;
    getSelectedLeadMorphedParams: (lead: 1 | 2) => { attack: number; decay: number; sustain: number; release: number } | null;
    getSelectedDynamicsVisualTelemetry: () => DynamicsVisualTelemetrySnapshot;
    getSelectedGranularActiveGrainCount: () => number;
    getSelectedGranularBufferWaveform: () => Float32Array | null;
    getSelectedGranularVoicePositions: () => readonly number[];
    getSelectedGranularVisualEvents: () => readonly CoreProductGranularVisualEvent[];
    getSelectedGranularWriteHeadPosition: () => number;
    getSelectedPadFilterFreq: (pad: 'pad1' | 'pad2') => number;
    getSelectedPadLfoValue: (pad: 'pad1' | 'pad2') => number;
    liveLeadMorphedParamsAvailable: boolean;
    liveWaveformTelemetryAvailable: boolean;
    onRequestPlaybackStart: (statePatch?: Partial<SliderState>) => void;
    setSelectedDrumEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
    setSelectedDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
    setSelectedDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
    setSelectedGranularUiActive: (active: boolean) => void;
    setSelectedSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
    setSelectedSynthAnchorWalkerVisualStateCallback: (callback: ProductSynthAnchorWalkerVisualStateCallback | null) => void;
    setSelectedSynthOrbitVisualStateCallback: (callback: ProductSynthOrbitVisualStateCallback | null) => void;
    setSelectedSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[], arpSteps?: number[]) => void) | null) => void;
    textureDebugAvailable: boolean;
  };

export function useSelectedAudioEnginePageRuntimeBridges(options: SelectedAudioEnginePageRuntimeBridgeOptions) {
  const synthPageSequencerBridge = useSynthPageSequencerBridge(options);
  const drumPageSequencerBridge = useDrumPageSequencerBridge(options);
  const drumPageRuntimeBridge = useDrumPageRuntimeBridge(options);
  const synthPageRuntimeProps = useMemo(() => ({
    getLeadMorphedParams: options.getSelectedLeadMorphedParams,
    liveLeadMorphedParamsAvailable: options.liveLeadMorphedParamsAvailable,
    liveSourceTelemetryAvailable: true,
    onRequestPlaybackStart: options.onRequestPlaybackStart,
    onAuditionNote: options.productRuntimeManualTriggers.auditionSynthNote,
    onLiveNoteStart: options.productRuntimeManualTriggers.startSynthLiveNote,
    onLiveNoteStop: options.productRuntimeManualTriggers.stopSynthLiveNote,
    getPadFilterFreq: options.getSelectedPadFilterFreq,
    getPadLfoValue: options.getSelectedPadLfoValue,
    setStepPositionCallback: options.setSelectedSynthStepPositionCallback,
    setOrbitVisualStateCallback: options.setSelectedSynthOrbitVisualStateCallback,
    setAnchorWalkerVisualStateCallback: options.setSelectedSynthAnchorWalkerVisualStateCallback,
    setEvolveTriggerCallback: options.setSelectedSynthEvolveTriggerCallback,
  }), [
    options.getSelectedLeadMorphedParams,
    options.getSelectedPadFilterFreq,
    options.getSelectedPadLfoValue,
    options.liveLeadMorphedParamsAvailable,
    options.onRequestPlaybackStart,
    options.productRuntimeManualTriggers.auditionSynthNote,
    options.productRuntimeManualTriggers.startSynthLiveNote,
    options.productRuntimeManualTriggers.stopSynthLiveNote,
    options.setSelectedSynthEvolveTriggerCallback,
    options.setSelectedSynthAnchorWalkerVisualStateCallback,
    options.setSelectedSynthOrbitVisualStateCallback,
    options.setSelectedSynthStepPositionCallback,
  ]);
  const drumPageRuntimeProps = useMemo(() => ({
    triggerVoice: options.productRuntimeManualTriggers.triggerDrumVoice,
    getAnalyserNode: options.productRuntimeDebugAnalysers.drumVoiceAnalyser,
    preloadAudioEngine: drumPageRuntimeBridge.preloadAudioEngine,
    onRequestPlaybackStart: options.onRequestPlaybackStart,
    setStepPositionCallback: options.setSelectedDrumStepPositionCallback,
    setEvolveTriggerCallback: options.setSelectedDrumEvolveTriggerCallback,
    setTriggerCallback: options.setSelectedDrumTriggerCallback,
  }), [
    drumPageRuntimeBridge.preloadAudioEngine,
    options.productRuntimeDebugAnalysers.drumVoiceAnalyser,
    options.onRequestPlaybackStart,
    options.setSelectedDrumEvolveTriggerCallback,
    options.setSelectedDrumStepPositionCallback,
    options.setSelectedDrumTriggerCallback,
    options.productRuntimeManualTriggers.triggerDrumVoice,
  ]);
  const dynamicsPageRuntimeProps = useMemo(() => ({
    getDynamicsAnalyser: options.productRuntimeDebugAnalysers.dynamicsAnalyser,
    getDynamicsTelemetry: options.getSelectedDynamicsVisualTelemetry,
  }), [
    options.getSelectedDynamicsVisualTelemetry,
    options.productRuntimeDebugAnalysers.dynamicsAnalyser,
  ]);
  const visualizerPageRuntimeProps = useMemo(() => ({
    getActiveGrains: options.getSelectedGranularActiveGrainCount,
  }), [options.getSelectedGranularActiveGrainCount]);
  const granularPageRuntimeProps = useMemo(() => ({
    getActiveGrainCount: options.getSelectedGranularActiveGrainCount,
    getWriteHeadPosition: options.getSelectedGranularWriteHeadPosition,
    getVoicePositions: options.getSelectedGranularVoicePositions,
    getVisualEvents: options.getSelectedGranularVisualEvents,
    getBufferWaveform: options.getSelectedGranularBufferWaveform,
    setGranularUiActive: options.setSelectedGranularUiActive,
    liveBufferTelemetryAvailable: true,
    liveWaveformTelemetryAvailable: options.liveWaveformTelemetryAvailable,
  }), [
    options.getSelectedGranularActiveGrainCount,
    options.getSelectedGranularBufferWaveform,
    options.getSelectedGranularVoicePositions,
    options.getSelectedGranularVisualEvents,
    options.getSelectedGranularWriteHeadPosition,
    options.liveWaveformTelemetryAvailable,
    options.setSelectedGranularUiActive,
  ]);
  const earthPageRuntimeProps = useMemo(() => ({
    getEarthTextureDebugState: options.getEarthTextureDebugState,
    textureDebugAvailable: options.textureDebugAvailable,
  }), [
    options.getEarthTextureDebugState,
    options.textureDebugAvailable,
  ]);

  return useMemo(() => ({
    drumPageRuntimeProps,
    drumPageRuntimeBridge,
    drumPageSequencerBridge,
    dynamicsPageRuntimeProps,
    earthPageRuntimeProps,
    granularPageRuntimeProps,
    synthPageRuntimeProps,
    synthPageSequencerBridge,
    visualizerPageRuntimeProps,
  }), [
    drumPageRuntimeProps,
    drumPageRuntimeBridge,
    drumPageSequencerBridge,
    dynamicsPageRuntimeProps,
    earthPageRuntimeProps,
    granularPageRuntimeProps,
    synthPageRuntimeProps,
    synthPageSequencerBridge,
    visualizerPageRuntimeProps,
  ]);
}
