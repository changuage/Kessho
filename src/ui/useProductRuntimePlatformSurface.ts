import { useProductRuntimeCapacitorAudioSession } from './useProductRuntimeCapacitorAudioSession';
import { useProductRuntimeMacAudioStatus } from './useProductRuntimeMacAudioStatus';

type ProductRuntimePlatformSurfaceOptions =
  Parameters<typeof useProductRuntimeMacAudioStatus>[0] &
  Parameters<typeof useProductRuntimeCapacitorAudioSession>[0];

export function useProductRuntimePlatformSurface(options: ProductRuntimePlatformSurfaceOptions) {
  const macAudioStatus = useProductRuntimeMacAudioStatus(options);

  useProductRuntimeCapacitorAudioSession(options);

  return macAudioStatus;
}
