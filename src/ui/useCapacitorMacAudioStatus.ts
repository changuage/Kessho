import { useCallback, useEffect, useState } from 'react';
import {
  getCapacitorMacAudioOutputStatus,
  openCapacitorMacSoundSettings,
  setCapacitorMacPlaybackState,
  type KesshoMacAudioOutputStatus,
} from '../native/capacitorMacShell';
import { useVisibleInterval } from './hooks/useVisibleInterval';

const MAC_AIRPLAY_PERFORMANCE_STORAGE_KEY = 'kessho:mac-airplay-performance:v1';

function readMacAirPlayPerformancePinned(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const queryMode = params.get('airplayPerformance') ?? params.get('airplayMode');
    if (queryMode === 'on' || queryMode === '1' || queryMode === 'true') {
      window.localStorage.setItem(MAC_AIRPLAY_PERFORMANCE_STORAGE_KEY, 'on');
      return true;
    }
    if (queryMode === 'off' || queryMode === '0' || queryMode === 'false') {
      window.localStorage.setItem(MAC_AIRPLAY_PERFORMANCE_STORAGE_KEY, 'off');
      return false;
    }
    return window.localStorage.getItem(MAC_AIRPLAY_PERFORMANCE_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function writeMacAirPlayPerformancePinned(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MAC_AIRPLAY_PERFORMANCE_STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Ignore storage failures; the mode still applies for this session.
  }
}

type UseCapacitorMacAudioStatusOptions = {
  macShellAvailable: boolean;
  playbackIsRunning: boolean;
  isJourneyPlaying: boolean;
  title: string;
  preloadProductRuntime: () => Promise<unknown>;
};

type CapacitorMacAudioStatus = {
  macAudioOutputStatus: KesshoMacAudioOutputStatus | null;
  macAirPlayPerformanceActive: boolean;
  handleMacAirPlayPerformanceToggle: () => void;
  openMacSoundSettings: () => void;
};

export function useCapacitorMacAudioStatus({
  macShellAvailable,
  playbackIsRunning,
  isJourneyPlaying,
  title,
  preloadProductRuntime,
}: UseCapacitorMacAudioStatusOptions): CapacitorMacAudioStatus {
  const [macAudioOutputStatus, setMacAudioOutputStatus] = useState<KesshoMacAudioOutputStatus | null>(null);
  const [macAirPlayPerformancePinned, setMacAirPlayPerformancePinned] = useState(readMacAirPlayPerformancePinned);
  const macDetectedAirPlay = macAudioOutputStatus?.isAirPlay === true;
  const macAirPlayPerformanceActive = macShellAvailable && (macDetectedAirPlay || macAirPlayPerformancePinned);

  const refreshMacAudioOutputStatus = useCallback(async () => {
    if (!macShellAvailable) return;
    try {
      const status = await getCapacitorMacAudioOutputStatus();
      if (status) setMacAudioOutputStatus(status);
    } catch (error) {
      console.warn('Failed to read macOS audio output status:', error);
    }
  }, [macShellAvailable]);

  useVisibleInterval(refreshMacAudioOutputStatus, playbackIsRunning ? 1500 : 5000, {
    enabled: macShellAvailable,
    pauseWhenHidden: false,
  });

  useEffect(() => {
    if (!macShellAvailable) return;
    void preloadProductRuntime();
  }, [macShellAvailable, preloadProductRuntime]);

  const handleMacAirPlayPerformanceToggle = useCallback(() => {
    setMacAirPlayPerformancePinned((prev) => {
      const next = !prev;
      writeMacAirPlayPerformancePinned(next);
      return next;
    });
  }, []);

  const openMacSoundSettings = useCallback((): void => {
    void openCapacitorMacSoundSettings();
  }, []);

  useEffect(() => {
    void setCapacitorMacPlaybackState({
      isPlaying: playbackIsRunning || isJourneyPlaying,
      title,
    }).catch((error) => {
      console.warn('Failed to sync macOS native playback activity:', error);
    });
  }, [playbackIsRunning, isJourneyPlaying, title]);

  useEffect(() => {
    return () => {
      void setCapacitorMacPlaybackState({ isPlaying: false });
    };
  }, []);

  return {
    macAudioOutputStatus,
    macAirPlayPerformanceActive,
    handleMacAirPlayPerformanceToggle,
    openMacSoundSettings,
  };
}
