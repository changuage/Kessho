import { useSelectedAudioEngineCapacitorAudioSession } from './useSelectedAudioEngineCapacitorAudioSession';

type ProductRuntimeCapacitorAudioSessionOptions = Parameters<typeof useSelectedAudioEngineCapacitorAudioSession>[0];

export function useProductRuntimeCapacitorAudioSession(options: ProductRuntimeCapacitorAudioSessionOptions): void {
  useSelectedAudioEngineCapacitorAudioSession(options);
}
