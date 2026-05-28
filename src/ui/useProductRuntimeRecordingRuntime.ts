import { useSelectedAudioEngineRecordingRuntime } from './useSelectedAudioEngineRecordingRuntime';

type ProductRuntimeRecordingRuntimeMode = Parameters<typeof useSelectedAudioEngineRecordingRuntime>[0];

export function useProductRuntimeRecordingRuntime(audioEngineRuntimeMode: ProductRuntimeRecordingRuntimeMode) {
  return useSelectedAudioEngineRecordingRuntime(audioEngineRuntimeMode);
}
