import { useRef, type MutableRefObject } from 'react';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { useVisibleInterval } from './hooks/useVisibleInterval';
import type { SliderState } from './state';
import { useSelectedAudioEngineDebugSurface } from './useSelectedAudioEngineDebugSurface';
import { useSelectedAudioEngineLifecycle } from './useSelectedAudioEngineLifecycle';

type SelectedAudioEngineMacRecoveryOptions = {
  audioEngineRuntimeMode: AudioEngineRuntimeMode;
  macShellAvailable: boolean;
  playbackIsRunning: boolean;
  stateRef: MutableRefObject<SliderState>;
};

export function useSelectedAudioEngineMacRecovery({
  audioEngineRuntimeMode,
  macShellAvailable,
  playbackIsRunning,
  stateRef,
}: SelectedAudioEngineMacRecoveryOptions): void {
  const recoveryInFlightRef = useRef(false);
  const {
    getSelectedReferenceAudioContextState,
    disposeSelectedReferenceEngine,
  } = useSelectedAudioEngineDebugSurface(audioEngineRuntimeMode);
  const {
    startSelectedAudioEngine,
    resumeSelectedAudioEngine,
  } = useSelectedAudioEngineLifecycle(audioEngineRuntimeMode);

  useVisibleInterval(() => {
    if (!macShellAvailable || !playbackIsRunning || recoveryInFlightRef.current) return;
    const contextState = getSelectedReferenceAudioContextState();
    if (!contextState || contextState === 'running') return;

    recoveryInFlightRef.current = true;
    const recover = async () => {
      try {
        if (contextState === 'closed') {
          disposeSelectedReferenceEngine();
          await startSelectedAudioEngine(stateRef.current);
        } else {
          await resumeSelectedAudioEngine();
        }
      } catch (error) {
        console.warn('macOS audio context recovery failed:', error);
      } finally {
        recoveryInFlightRef.current = false;
      }
    };
    void recover();
  }, 2000, {
    enabled: macShellAvailable && playbackIsRunning,
    pauseWhenHidden: false,
  });
}
