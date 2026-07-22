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
import type { AdvancedTab } from '../app/appNavigation';

type PageBridgeOptions =
  Parameters<typeof useSynthPageSequencerBridge>[0] &
  Parameters<typeof useDrumPageSequencerBridge>[0] &
  Parameters<typeof useDrumPageRuntimeBridge>[0];

export type ProductRuntimePageBridgeOptions = PageBridgeOptions & {
    activeTab: AdvancedTab;
    productRuntimeDebugAnalysers: {
      drumVoiceAnalyser?: ((voice: unknown) => AnalyserNode | undefined) | undefined;
      dynamicsAnalyser?: ((key: unknown) => AnalyserNode | null) | undefined;
    };
    productRuntimeManualTriggers: RuntimeManualTriggerSurface;
    getEarthTextureDebugState: () => EarthTextureDebugState;
    getProductLeadMorphedParams: (lead: 1 | 2) => { attack: number; decay: number; sustain: number; release: number } | null;
    getProductDynamicsVisualTelemetry: () => DynamicsVisualTelemetrySnapshot;
    getProductGranularActiveGrainCount: () => number;
    getProductGranularBufferWaveform: () => Float32Array | null;
    getProductGranularVoicePositions: () => readonly number[];
    getProductGranularVisualEvents: () => readonly CoreProductGranularVisualEvent[];
    getProductGranularWriteHeadPosition: () => number;
    getProductPadFilterFreq: (pad: 'pad1' | 'pad2') => number;
    getProductPadLfoValue: (pad: 'pad1' | 'pad2') => number;
    liveLeadMorphedParamsAvailable: boolean;
    liveWaveformTelemetryAvailable: boolean;
    onRequestPlaybackStart: (statePatch?: Partial<SliderState>) => void;
    setProductDrumEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
    setProductDrumStepPositionCallback: (callback: ((steps: number[], hitCounts: number[]) => void) | null) => void;
    setProductDrumTriggerCallback: (callback: ((voice: string, velocity: number) => void) | null) => void;
    setProductGranularUiActive: (active: boolean) => void;
    setProductSynthEvolveTriggerCallback: (callback: ((laneIndex: number) => void) | null) => void;
    setProductSynthAnchorWalkerVisualStateCallback?: (callback: ProductSynthAnchorWalkerVisualStateCallback | null) => void;
    setProductSynthOrbitVisualStateCallback?: (callback: ProductSynthOrbitVisualStateCallback | null) => void;
    setProductSynthStepPositionCallback: (callback: ((steps: number[], hitCounts: number[], arpSteps?: number[]) => void) | null) => void;
    textureDebugAvailable: boolean;
  };

export function useProductRuntimePageBridgesCore(options: ProductRuntimePageBridgeOptions) {
  const synthPageSequencerBridge = useSynthPageSequencerBridge(options);
  const drumPageSequencerBridge = useDrumPageSequencerBridge(options);
  const drumPageRuntimeBridge = useDrumPageRuntimeBridge(options);
  const synthPageRuntimeProps = useMemo(() => ({
    getLeadMorphedParams: options.getProductLeadMorphedParams,
    liveLeadMorphedParamsAvailable: options.liveLeadMorphedParamsAvailable,
    liveSourceTelemetryAvailable: true,
    onRequestPlaybackStart: options.onRequestPlaybackStart,
    onLiveNoteStart: options.productRuntimeManualTriggers.startSynthLiveNote,
    onLiveNoteStop: options.productRuntimeManualTriggers.stopSynthLiveNote,
    getPadFilterFreq: options.getProductPadFilterFreq,
    getPadLfoValue: options.getProductPadLfoValue,
    setStepPositionCallback: options.setProductSynthStepPositionCallback,
    setOrbitVisualStateCallback: options.setProductSynthOrbitVisualStateCallback,
    setAnchorWalkerVisualStateCallback: options.setProductSynthAnchorWalkerVisualStateCallback,
    setEvolveTriggerCallback: options.setProductSynthEvolveTriggerCallback,
  }), [
    options.getProductLeadMorphedParams,
    options.getProductPadFilterFreq,
    options.getProductPadLfoValue,
    options.liveLeadMorphedParamsAvailable,
    options.onRequestPlaybackStart,
    options.productRuntimeManualTriggers.auditionSynthNote,
    options.productRuntimeManualTriggers.startSynthLiveNote,
    options.productRuntimeManualTriggers.stopSynthLiveNote,
    options.setProductSynthEvolveTriggerCallback,
    options.setProductSynthAnchorWalkerVisualStateCallback,
    options.setProductSynthOrbitVisualStateCallback,
    options.setProductSynthStepPositionCallback,
  ]);
  const drumPageRuntimeProps = useMemo(() => ({
    triggerVoice: options.productRuntimeManualTriggers.triggerDrumVoice,
    getAnalyserNode: options.productRuntimeDebugAnalysers.drumVoiceAnalyser,
    preloadAudioEngine: drumPageRuntimeBridge.preloadAudioEngine,
    onRequestPlaybackStart: options.onRequestPlaybackStart,
    setStepPositionCallback: options.setProductDrumStepPositionCallback,
    setEvolveTriggerCallback: options.setProductDrumEvolveTriggerCallback,
    setTriggerCallback: options.setProductDrumTriggerCallback,
  }), [
    drumPageRuntimeBridge.preloadAudioEngine,
    options.productRuntimeDebugAnalysers.drumVoiceAnalyser,
    options.onRequestPlaybackStart,
    options.setProductDrumEvolveTriggerCallback,
    options.setProductDrumStepPositionCallback,
    options.setProductDrumTriggerCallback,
    options.productRuntimeManualTriggers.triggerDrumVoice,
  ]);
  const dynamicsPageRuntimeProps = useMemo(() => ({
    getDynamicsAnalyser: options.productRuntimeDebugAnalysers.dynamicsAnalyser,
    getDynamicsTelemetry: options.getProductDynamicsVisualTelemetry,
  }), [
    options.getProductDynamicsVisualTelemetry,
    options.productRuntimeDebugAnalysers.dynamicsAnalyser,
  ]);
  const visualizerPageRuntimeProps = useMemo(() => ({
    getActiveGrains: options.getProductGranularActiveGrainCount,
  }), [options.getProductGranularActiveGrainCount]);
  const granularPageRuntimeProps = useMemo(() => ({
    getActiveGrainCount: options.getProductGranularActiveGrainCount,
    getWriteHeadPosition: options.getProductGranularWriteHeadPosition,
    getVoicePositions: options.getProductGranularVoicePositions,
    getVisualEvents: options.getProductGranularVisualEvents,
    getBufferWaveform: options.getProductGranularBufferWaveform,
    setGranularUiActive: options.setProductGranularUiActive,
    liveBufferTelemetryAvailable: true,
    liveWaveformTelemetryAvailable: options.liveWaveformTelemetryAvailable,
  }), [
    options.getProductGranularActiveGrainCount,
    options.getProductGranularBufferWaveform,
    options.getProductGranularVoicePositions,
    options.getProductGranularVisualEvents,
    options.getProductGranularWriteHeadPosition,
    options.liveWaveformTelemetryAvailable,
    options.setProductGranularUiActive,
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
