import type { ProductRuntimeSelectionMode } from '../audio/product/ProductAudioRuntimeSelection';
import { useSelectedAudioEngineMediaSession } from './useSelectedAudioEngineMediaSession';

type UseProductRuntimeMediaSessionOptions = {
  productRuntimeMode: ProductRuntimeSelectionMode;
  resumeProductRuntime: () => void | Promise<void>;
  suspendProductRuntime: () => void | Promise<void>;
  stopProductRuntime: () => void | Promise<void>;
};

type ProductRuntimeMediaSession = {
  setupProductIOSMediaSession: () => void;
  connectProductMediaSessionToAudio: () => void;
  stopProductIOSMediaSession: () => void;
};

export function useProductRuntimeMediaSession({
  productRuntimeMode,
  resumeProductRuntime,
  suspendProductRuntime,
  stopProductRuntime,
}: UseProductRuntimeMediaSessionOptions): ProductRuntimeMediaSession {
  // TODO(product-runtime-compat-10C): keep media-session reference runtime behavior behind this
  // compatibility facade until the underlying helpers use product runtime naming directly.
  const selectedMediaSession = useSelectedAudioEngineMediaSession({
    audioEngineRuntimeMode: productRuntimeMode,
    resumeSelectedAudioEngine: resumeProductRuntime,
    suspendSelectedAudioEngine: suspendProductRuntime,
    stopSelectedAudioEngine: stopProductRuntime,
  });

  return {
    setupProductIOSMediaSession: selectedMediaSession.setupSelectedIOSMediaSession,
    connectProductMediaSessionToAudio: selectedMediaSession.connectSelectedMediaSessionToAudio,
    stopProductIOSMediaSession: selectedMediaSession.stopSelectedIOSMediaSession,
  };
}
