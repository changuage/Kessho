import type { NativeProductRendererDiagnosticStatus } from './useCapacitorAudioSessionDiagnostics';
import { useCapacitorAudioSessionDiagnostics } from './useCapacitorAudioSessionDiagnostics';
import { useProductRuntimeRemoteCommandPlayback } from './useProductRuntimeRemoteCommandPlayback';
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
}: ProductRuntimeCapacitorAudioSessionOptions): NativeProductRendererDiagnosticStatus {
  const onRemoteCommand = useProductRuntimeRemoteCommandPlayback({
    playbackIsRunning: options.playbackIsRunning,
    startPlayback: startProductPlayback,
    stopPlayback: stopProductPlayback,
  });
  return useCapacitorAudioSessionDiagnostics({
    ...options,
    isPlaying: options.playbackIsRunning || options.isJourneyPlaying,
    onRemoteCommand,
  });
}
