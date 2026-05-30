import { useCapacitorAudioSessionDiagnostics } from './useCapacitorAudioSessionDiagnostics';
import type { NativeProductRendererDiagnosticStatus } from './useCapacitorAudioSessionDiagnostics';
import { useSelectedAudioEngineRemoteCommandPlayback } from './useSelectedAudioEngineRemoteCommandPlayback';
import type { SliderState } from './state';

type NativeDualRanges = Record<string, { min: number; max: number }>;

type SelectedAudioEngineCapacitorAudioSessionOptions = {
  active: boolean;
  setActive: (active: boolean) => void;
  title: string;
  playbackIsRunning: boolean;
  isJourneyPlaying: boolean;
  state: SliderState;
  dualRanges: NativeDualRanges;
  startPlayback: () => void | Promise<void>;
  stopPlayback: () => void;
};

export function useSelectedAudioEngineCapacitorAudioSession({
  active,
  setActive,
  title,
  playbackIsRunning,
  isJourneyPlaying,
  state,
  dualRanges,
  startPlayback,
  stopPlayback,
}: SelectedAudioEngineCapacitorAudioSessionOptions): NativeProductRendererDiagnosticStatus {
  const handleCapacitorAudioSessionRemoteCommand = useSelectedAudioEngineRemoteCommandPlayback({
    playbackIsRunning,
    startPlayback,
    stopPlayback,
  });

  return useCapacitorAudioSessionDiagnostics({
    active,
    setActive,
    title,
    isPlaying: playbackIsRunning || isJourneyPlaying,
    state,
    dualRanges,
    onRemoteCommand: handleCapacitorAudioSessionRemoteCommand,
  });
}
