import { useSelectedAudioEngineMacRecovery } from './useSelectedAudioEngineMacRecovery';

type ProductRuntimeMacRecoveryOptions = Parameters<typeof useSelectedAudioEngineMacRecovery>[0];

export function useProductRuntimeMacRecovery(options: ProductRuntimeMacRecoveryOptions): void {
  useSelectedAudioEngineMacRecovery(options);
}
