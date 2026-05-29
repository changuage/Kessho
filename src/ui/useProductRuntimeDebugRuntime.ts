import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineDebugRuntime } from './useSelectedAudioEngineDebugRuntime';

type ProductRuntimeDebugRuntime = Omit<
  ReturnType<typeof useSelectedAudioEngineDebugRuntime>,
  'selectedAudioEngineDebugAnalysers'
> & {
  productRuntimeDebugAnalysers: ReturnType<
    typeof useSelectedAudioEngineDebugRuntime
  >['selectedAudioEngineDebugAnalysers'];
};

export function useProductRuntimeDebugRuntime(
  productRuntimeMode: ProductRuntimeSelectionMode,
): ProductRuntimeDebugRuntime {
  const debugRuntime = useSelectedAudioEngineDebugRuntime(productRuntimeMode);
  const { selectedAudioEngineDebugAnalysers, ...productDebugRuntime } = debugRuntime;

  return {
    ...productDebugRuntime,
    productRuntimeDebugAnalysers: selectedAudioEngineDebugAnalysers,
  };
}
