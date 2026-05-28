import { useMemo } from 'react';
import type { SelectedAudioEnginePageRuntimeBridgeOptions } from './useSelectedAudioEnginePageRuntimeBridges';

export type SelectedAudioEnginePageTelemetryRuntimeProps = Pick<
  SelectedAudioEnginePageRuntimeBridgeOptions,
  | 'productRuntimeDebugAnalysers'
  | 'getEarthTextureDebugState'
  | 'getSelectedLeadMorphedParams'
  | 'getSelectedDynamicsVisualTelemetry'
  | 'getSelectedGranularActiveGrainCount'
  | 'getSelectedGranularBufferWaveform'
  | 'getSelectedGranularVoicePositions'
  | 'getSelectedGranularWriteHeadPosition'
  | 'getSelectedPadFilterFreq'
  | 'getSelectedPadLfoValue'
  | 'liveLeadMorphedParamsAvailable'
  | 'liveWaveformTelemetryAvailable'
  | 'setSelectedGranularUiActive'
  | 'textureDebugAvailable'
>;

export function useSelectedAudioEnginePageTelemetryRuntimeProps({
  productRuntimeDebugAnalysers,
  getEarthTextureDebugState,
  getSelectedLeadMorphedParams,
  getSelectedDynamicsVisualTelemetry,
  getSelectedGranularActiveGrainCount,
  getSelectedGranularBufferWaveform,
  getSelectedGranularVoicePositions,
  getSelectedGranularWriteHeadPosition,
  getSelectedPadFilterFreq,
  getSelectedPadLfoValue,
  liveLeadMorphedParamsAvailable,
  liveWaveformTelemetryAvailable,
  setSelectedGranularUiActive,
  textureDebugAvailable,
}: SelectedAudioEnginePageTelemetryRuntimeProps): SelectedAudioEnginePageTelemetryRuntimeProps {
  return useMemo(() => ({
    productRuntimeDebugAnalysers,
    getEarthTextureDebugState,
    getSelectedLeadMorphedParams,
    getSelectedDynamicsVisualTelemetry,
    getSelectedGranularActiveGrainCount,
    getSelectedGranularBufferWaveform,
    getSelectedGranularVoicePositions,
    getSelectedGranularWriteHeadPosition,
    getSelectedPadFilterFreq,
    getSelectedPadLfoValue,
    liveLeadMorphedParamsAvailable,
    liveWaveformTelemetryAvailable,
    setSelectedGranularUiActive,
    textureDebugAvailable,
  }), [
    getEarthTextureDebugState,
    getSelectedDynamicsVisualTelemetry,
    getSelectedGranularActiveGrainCount,
    getSelectedGranularBufferWaveform,
    getSelectedGranularVoicePositions,
    getSelectedGranularWriteHeadPosition,
    getSelectedLeadMorphedParams,
    getSelectedPadFilterFreq,
    getSelectedPadLfoValue,
    liveLeadMorphedParamsAvailable,
    liveWaveformTelemetryAvailable,
    productRuntimeDebugAnalysers,
    setSelectedGranularUiActive,
    textureDebugAvailable,
  ]);
}
