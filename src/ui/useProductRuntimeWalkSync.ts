import { useSelectedAudioEngineRuntimeWalkSync } from './useSelectedAudioEngineRuntimeWalkSync';

type ProductRuntimeWalkSyncOptions = Parameters<typeof useSelectedAudioEngineRuntimeWalkSync>[0];

export function useProductRuntimeWalkSync(options: ProductRuntimeWalkSyncOptions): void {
  useSelectedAudioEngineRuntimeWalkSync(options);
}
