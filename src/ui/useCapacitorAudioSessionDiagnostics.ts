import { useEffect, useRef, useState } from 'react';
import {
  addCapacitorAudioSessionEventListener,
  addCapacitorAudioSessionRemoteCommandListener,
  getCapacitorAudioSessionStatus,
  isCapacitorAudioSessionAvailable,
  probeNativeProductRendererForDiagnostics,
  setCapacitorAudioSessionNowPlaying,
  shouldUseCapacitorAudioSessionDiagnostics,
  shouldUseNativeProductRendererDiagnostics,
  syncCapacitorAudioSessionState,
  type KesshoAudioSessionEventPayload,
  type KesshoNativeProductRendererProbeStatus,
  type KesshoRemoteCommand,
} from '../native/capacitorAudioSession';
import type { SliderState } from './state';

type NativeDualRanges = Record<string, { min: number; max: number }>;

export type CapacitorAudioSessionRemoteCommand = KesshoRemoteCommand;

export type NativeProductRendererDiagnosticStatus = {
  active: boolean;
  bridgeAvailable: boolean;
  rendererPrepared: boolean;
  rendererRunning: boolean;
  probePeak: number | null;
  probeRms: number | null;
  probeRenderedFrames: number | null;
  probeSampleRate: number | null;
  routeChangeCount: number;
  interruptionBeginCount: number;
  interruptionEndCount: number;
  mediaServicesResetCount: number;
  lastRouteChangeReason: string | null;
  lastInterruptionType: string | null;
  lastAudioSessionEvent: string | null;
  lastRemoteCommand: KesshoRemoteCommand | null;
  remoteCommandCount: number;
  lastError: string | null;
};

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
}: UseCapacitorAudioSessionDiagnosticsOptions): NativeProductRendererDiagnosticStatus {
  const remoteCommandHandlerRef = useRef(onRemoteCommand);
  const [nativeDiagnosticStatus, setNativeDiagnosticStatus] = useState<NativeProductRendererDiagnosticStatus>({
    active: false,
    bridgeAvailable: false,
    rendererPrepared: false,
    rendererRunning: false,
    probePeak: null,
    probeRms: null,
    probeRenderedFrames: null,
    probeSampleRate: null,
    routeChangeCount: 0,
    interruptionBeginCount: 0,
    interruptionEndCount: 0,
    mediaServicesResetCount: 0,
    lastRouteChangeReason: null,
    lastInterruptionType: null,
    lastAudioSessionEvent: null,
    lastRemoteCommand: null,
    remoteCommandCount: 0,
    lastError: null,
  });

  remoteCommandHandlerRef.current = onRemoteCommand;

  const applyProbeStatus = (status: KesshoNativeProductRendererProbeStatus): void => {
    setNativeDiagnosticStatus((prev) => ({
      ...prev,
      active: true,
      bridgeAvailable: true,
      rendererPrepared: status.nativeProductRendererPrepared,
      rendererRunning: status.nativeProductRendererRunning,
      probePeak: status.nativeProductRendererProbePeak,
      probeRms: status.nativeProductRendererProbeRms,
      probeRenderedFrames: status.nativeProductRendererProbeRenderedFrames,
      probeSampleRate: status.nativeProductRendererProbeSampleRate,
      lastError: null,
    }));
  };

  const applyAudioSessionEvent = (event: KesshoAudioSessionEventPayload): void => {
    setNativeDiagnosticStatus((prev) => ({
      ...prev,
      active: true,
      bridgeAvailable: true,
      routeChangeCount: event.routeChangeCount ?? prev.routeChangeCount,
      interruptionBeginCount: event.interruptionBeginCount ?? prev.interruptionBeginCount,
      interruptionEndCount: event.interruptionEndCount ?? prev.interruptionEndCount,
      mediaServicesResetCount: event.mediaServicesResetCount ?? prev.mediaServicesResetCount,
      lastRouteChangeReason: event.reason ?? prev.lastRouteChangeReason,
      lastInterruptionType: event.interruptionType ?? prev.lastInterruptionType,
      lastAudioSessionEvent: event.type,
      lastError: null,
    }));
  };

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    let cleanupRemoteCommandListener: (() => Promise<void>) | null = null;
    let cleanupAudioSessionEventListener: (() => Promise<void>) | null = null;

    const setupAudioSessionDiagnostics = () => {
      if (cancelled) return;
      if (!shouldUseCapacitorAudioSessionDiagnostics()) {
        setNativeDiagnosticStatus((prev) => ({ ...prev, active: false }));
        return;
      }
      if (!isCapacitorAudioSessionAvailable()) {
        setNativeDiagnosticStatus((prev) => ({ ...prev, active: true, bridgeAvailable: false }));
        retryTimer = window.setTimeout(setupAudioSessionDiagnostics, 250);
        return;
      }

      setActive(true);
      setNativeDiagnosticStatus((prev) => ({ ...prev, active: true, bridgeAvailable: true, lastError: null }));

      void getCapacitorAudioSessionStatus()
        .then((status) => {
          if (!status || cancelled) return;
          setNativeDiagnosticStatus((prev) => ({
            ...prev,
            active: true,
            bridgeAvailable: true,
            rendererPrepared: status.nativeProductRendererPrepared ?? prev.rendererPrepared,
            rendererRunning: status.nativeProductRendererRunning ?? prev.rendererRunning,
            probePeak: status.nativeProductRendererProbePeak ?? prev.probePeak,
            probeRms: status.nativeProductRendererProbeRms ?? prev.probeRms,
            probeRenderedFrames: status.nativeProductRendererProbeRenderedFrames ?? prev.probeRenderedFrames,
            routeChangeCount: status.routeChangeCount ?? prev.routeChangeCount,
            interruptionBeginCount: status.interruptionBeginCount ?? prev.interruptionBeginCount,
            interruptionEndCount: status.interruptionEndCount ?? prev.interruptionEndCount,
            mediaServicesResetCount: status.mediaServicesResetCount ?? prev.mediaServicesResetCount,
            lastRouteChangeReason: status.lastRouteChangeReason ?? prev.lastRouteChangeReason,
            lastInterruptionType: status.lastInterruptionType ?? prev.lastInterruptionType,
            lastError: status.lastNativeProductRendererError && status.lastNativeProductRendererError !== 'none'
              ? status.lastNativeProductRendererError
              : null,
          }));
        })
        .catch((error) => {
          if (cancelled) return;
          setNativeDiagnosticStatus((prev) => ({
            ...prev,
            active: true,
            bridgeAvailable: false,
            lastError: error instanceof Error ? error.message : String(error),
          }));
          console.warn('Failed to read Capacitor audio-session status:', error);
        });
      if (shouldUseNativeProductRendererDiagnostics()) {
        void probeNativeProductRendererForDiagnostics()
          .then((status) => {
            if (!status || cancelled) return;
            applyProbeStatus(status);
            console.info('Native Product Core renderer probe:', {
              peak: status.nativeProductRendererProbePeak,
              rms: status.nativeProductRendererProbeRms,
              renderedFrames: status.nativeProductRendererProbeRenderedFrames,
              sampleRate: status.nativeProductRendererProbeSampleRate,
            });
          })
          .catch((error) => {
            if (!cancelled) {
              setNativeDiagnosticStatus((prev) => ({
                ...prev,
                active: true,
                bridgeAvailable: true,
                lastError: error instanceof Error ? error.message : String(error),
              }));
              console.warn('Failed to probe native Product Core renderer:', error);
            }
          });
      }

      void addCapacitorAudioSessionRemoteCommandListener((command) => {
        if (cancelled) return;
        setNativeDiagnosticStatus((prev) => ({
          ...prev,
          active: true,
          bridgeAvailable: true,
          lastRemoteCommand: command,
          remoteCommandCount: prev.remoteCommandCount + 1,
          lastError: null,
        }));
        remoteCommandHandlerRef.current(command);
      }).then((cleanup) => {
        if (cancelled) {
          void cleanup?.();
          return;
        }
        cleanupRemoteCommandListener = cleanup ?? null;
      });
      void addCapacitorAudioSessionEventListener((event) => {
        if (cancelled) return;
        applyAudioSessionEvent(event);
      }).then((cleanup) => {
        if (cancelled) {
          void cleanup?.();
          return;
        }
        cleanupAudioSessionEventListener = cleanup ?? null;
      });
    };

    setupAudioSessionDiagnostics();

    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
      if (cleanupRemoteCommandListener) void cleanupRemoteCommandListener();
      if (cleanupAudioSessionEventListener) void cleanupAudioSessionEventListener();
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

  return nativeDiagnosticStatus;
}
