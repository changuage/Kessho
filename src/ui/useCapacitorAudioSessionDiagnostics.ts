import { useEffect, useRef } from 'react';
import {
  addCapacitorAudioSessionRemoteCommandListener,
  getCapacitorAudioSessionStatus,
  isCapacitorAudioSessionAvailable,
  setCapacitorAudioSessionNowPlaying,
  shouldUseCapacitorAudioSessionDiagnostics,
  syncCapacitorAudioSessionState,
  type KesshoRemoteCommand,
} from '../native/capacitorAudioSession';
import type { SliderState } from './state';

type NativeDualRanges = Record<string, { min: number; max: number }>;

export type CapacitorAudioSessionRemoteCommand = KesshoRemoteCommand;

type UseCapacitorAudioSessionDiagnosticsOptions = {
  active: boolean;
  setActive: (active: boolean) => void;
  title: string;
  isPlaying: boolean;
  state: SliderState;
  dualRanges: NativeDualRanges;
  onRemoteCommand: (command: KesshoRemoteCommand) => void;
};

export function useCapacitorAudioSessionDiagnostics({
  active,
  setActive,
  title,
  isPlaying,
  state,
  dualRanges,
  onRemoteCommand,
}: UseCapacitorAudioSessionDiagnosticsOptions): void {
  const remoteCommandHandlerRef = useRef(onRemoteCommand);

  remoteCommandHandlerRef.current = onRemoteCommand;

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    let cleanupRemoteCommandListener: (() => Promise<void>) | null = null;

    const setupAudioSessionDiagnostics = () => {
      if (cancelled) return;
      if (!shouldUseCapacitorAudioSessionDiagnostics()) {
        return;
      }
      if (!isCapacitorAudioSessionAvailable()) {
        retryTimer = window.setTimeout(setupAudioSessionDiagnostics, 250);
        return;
      }

      setActive(true);

      void getCapacitorAudioSessionStatus().catch((error) => {
        console.warn('Failed to read Capacitor audio-session status:', error);
      });

      void addCapacitorAudioSessionRemoteCommandListener((command) => {
        if (cancelled) return;
        remoteCommandHandlerRef.current(command);
      }).then((cleanup) => {
        if (cancelled) {
          void cleanup?.();
          return;
        }
        cleanupRemoteCommandListener = cleanup ?? null;
      });
    };

    setupAudioSessionDiagnostics();

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      if (cleanupRemoteCommandListener) void cleanupRemoteCommandListener();
    };
  }, [setActive]);

  useEffect(() => {
    if (!active) return;
    void setCapacitorAudioSessionNowPlaying({
      title,
      artist: 'Kessho',
      album: 'Kessho Capacitor',
      isLiveStream: true,
      isPlaying,
      elapsedTime: 0,
    });
  }, [active, isPlaying, title]);

  useEffect(() => {
    if (!active) return;
    void syncCapacitorAudioSessionState({
      state,
      dualRanges,
    });
  }, [active, dualRanges, state]);
}
