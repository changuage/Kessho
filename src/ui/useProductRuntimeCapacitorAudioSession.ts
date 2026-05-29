import { useSelectedAudioEngineCapacitorAudioSession } from './useSelectedAudioEngineCapacitorAudioSession';
import type { SliderState } from './state';

type ProductRuntimeNativeDualRanges = Record<string, { min: number; max: number }>;

type ProductRuntimeCapacitorAudioSessionOptions = {
  active: boolean;
  setActive: (active: boolean) => void;
  title: string;
  playbackIsRunning: boolean;
  isJourneyPlaying: boolean;
  state: SliderState;
  dualRanges: ProductRuntimeNativeDualRanges;
  startProductPlayback: () => void | Promise<void>;
  stopProductPlayback: () => void;
};

export function useProductRuntimeCapacitorAudioSession({
  startProductPlayback,
  stopProductPlayback,
  ...options
}: ProductRuntimeCapacitorAudioSessionOptions): void {
  // TODO(product-runtime-compat-10C): Capacitor session diagnostics still delegate to the
  // selected-runtime remote command handler while product surfaces expose product playback names.
  useSelectedAudioEngineCapacitorAudioSession({
    ...options,
    startPlayback: startProductPlayback,
    stopPlayback: stopProductPlayback,
  });
}
