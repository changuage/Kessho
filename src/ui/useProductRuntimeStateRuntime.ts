import { useSelectedAudioEngineStateRuntime } from './useSelectedAudioEngineStateRuntime';

type SelectedRuntimeStateRuntimeOptions = Parameters<typeof useSelectedAudioEngineStateRuntime>[0];
type ProductRuntimeStateRuntimeOptions = Omit<SelectedRuntimeStateRuntimeOptions, 'audioEngineRuntimeMode'> & {
  productRuntimeMode: SelectedRuntimeStateRuntimeOptions['audioEngineRuntimeMode'];
};

export function useProductRuntimeStateRuntime({
  productRuntimeMode,
  ...options
}: ProductRuntimeStateRuntimeOptions): void {
  useSelectedAudioEngineStateRuntime({
    ...options,
    audioEngineRuntimeMode: productRuntimeMode,
  });
}
