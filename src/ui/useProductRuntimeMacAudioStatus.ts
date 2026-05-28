import { useCapacitorMacAudioStatus } from './useCapacitorMacAudioStatus';

type CapacitorMacAudioStatusOptions = Parameters<typeof useCapacitorMacAudioStatus>[0];
type ProductRuntimeMacAudioStatusOptions = Omit<CapacitorMacAudioStatusOptions, 'preloadSelectedAudioEngine'> & {
  preloadProductRuntime: CapacitorMacAudioStatusOptions['preloadSelectedAudioEngine'];
};

export function useProductRuntimeMacAudioStatus({
  preloadProductRuntime,
  ...options
}: ProductRuntimeMacAudioStatusOptions) {
  return useCapacitorMacAudioStatus({
    ...options,
    preloadSelectedAudioEngine: preloadProductRuntime,
  });
}
