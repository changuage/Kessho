import {
  useSelectedAudioEnginePageTelemetryRuntimeProps,
} from './useSelectedAudioEnginePageTelemetryRuntimeProps';
import type { DynamicsVisualTelemetrySnapshot, EarthTextureDebugState } from '../audio/engineSharedTypes';

export type ProductRuntimePageDebugAnalysers = {
  drumVoiceAnalyser?: ((voice: unknown) => AnalyserNode | undefined) | undefined;
  dynamicsAnalyser?: ((key: unknown) => AnalyserNode | null) | undefined;
};

export type ProductRuntimePageTelemetryProps = {
  productRuntimeDebugAnalysers: ProductRuntimePageDebugAnalysers;
  getEarthTextureDebugState: () => EarthTextureDebugState;
  getSelectedLeadMorphedParams: (lead: 1 | 2) => { attack: number; decay: number; sustain: number; release: number } | null;
  getSelectedDynamicsVisualTelemetry: () => DynamicsVisualTelemetrySnapshot;
  getSelectedGranularActiveGrainCount: () => number;
  getSelectedGranularBufferWaveform: () => Float32Array | null;
  getSelectedGranularVoicePositions: () => readonly number[];
  getSelectedGranularWriteHeadPosition: () => number;
  getSelectedPadFilterFreq: (pad: 'pad1' | 'pad2') => number;
  getSelectedPadLfoValue: (pad: 'pad1' | 'pad2') => number;
  liveLeadMorphedParamsAvailable: boolean;
  liveWaveformTelemetryAvailable: boolean;
  setSelectedGranularUiActive: (active: boolean) => void;
  textureDebugAvailable: boolean;
};

export function useProductRuntimePageTelemetryProps(options: ProductRuntimePageTelemetryProps) {
  return useSelectedAudioEnginePageTelemetryRuntimeProps(options);
}
