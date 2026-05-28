import { useSelectedAudioEngineStateRuntime } from './useSelectedAudioEngineStateRuntime';

type ProductRuntimeStateRuntimeOptions = Parameters<typeof useSelectedAudioEngineStateRuntime>[0];

export function useProductRuntimeStateRuntime(options: ProductRuntimeStateRuntimeOptions): void {
  useSelectedAudioEngineStateRuntime(options);
}
