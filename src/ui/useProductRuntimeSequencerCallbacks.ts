import { useSelectedAudioEngineSequencerCallbacks } from './useSelectedAudioEngineSequencerCallbacks';

type ProductRuntimeSequencerCallbacksMode = Parameters<typeof useSelectedAudioEngineSequencerCallbacks>[0];

export function useProductRuntimeSequencerCallbacks(audioEngineRuntimeMode: ProductRuntimeSequencerCallbacksMode) {
  return useSelectedAudioEngineSequencerCallbacks(audioEngineRuntimeMode);
}
