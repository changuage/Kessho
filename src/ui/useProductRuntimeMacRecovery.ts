import { useSelectedAudioEngineMacRecovery } from './useSelectedAudioEngineMacRecovery';

type SelectedRuntimeMacRecoveryOptions = Parameters<typeof useSelectedAudioEngineMacRecovery>[0];
type ProductRuntimeMacRecoveryOptions = Omit<SelectedRuntimeMacRecoveryOptions, 'audioEngineRuntimeMode'> & {
  productRuntimeMode: SelectedRuntimeMacRecoveryOptions['audioEngineRuntimeMode'];
};

export function useProductRuntimeMacRecovery({
  productRuntimeMode,
  ...options
}: ProductRuntimeMacRecoveryOptions): void {
  useSelectedAudioEngineMacRecovery({
    ...options,
    audioEngineRuntimeMode: productRuntimeMode,
  });
}
