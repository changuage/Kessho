import { useProductRuntimeCapacitorAudioSession } from './useProductRuntimeCapacitorAudioSession';
import { useProductRuntimeMacAudioStatus } from './useProductRuntimeMacAudioStatus';

type ProductRuntimePlatformSurfaceOptions =
  Parameters<typeof useProductRuntimeMacAudioStatus>[0] &
  Omit<Parameters<typeof useProductRuntimeCapacitorAudioSession>[0], 'startProductPlayback' | 'stopProductPlayback'> & {
    startProductPlayback: Parameters<typeof useProductRuntimeCapacitorAudioSession>[0]['startProductPlayback'];
    stopProductPlayback: Parameters<typeof useProductRuntimeCapacitorAudioSession>[0]['stopProductPlayback'];
  };

export function useProductRuntimePlatformSurface(options: ProductRuntimePlatformSurfaceOptions) {
  const macAudioStatus = useProductRuntimeMacAudioStatus(options);

  const nativeProductRendererDiagnosticStatus = useProductRuntimeCapacitorAudioSession(options);

  return {
    ...macAudioStatus,
    nativeProductRendererDiagnosticStatus,
  };
}
