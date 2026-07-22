import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProductEngineLifecycleState } from '../audio/product/ProductEngineTypes';

type WakeLockSentinelLike = EventTarget & {
  readonly released: boolean;
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: 'screen') => Promise<WakeLockSentinelLike>;
  };
};

export type ProductRuntimeBackgroundPageStatus = 'foreground' | 'hidden';
export type ProductRuntimeWakeLockStatus = 'unsupported' | 'inactive' | 'active' | 'released' | 'failed';
export type ProductRuntimeMediaSessionStatus = 'unsupported' | 'ready' | 'active' | 'paused' | 'stopped';

export type ProductRuntimeBackgroundAudioStatus = {
  playbackActive: boolean;
  pageStatus: ProductRuntimeBackgroundPageStatus;
  lifecycleEvent: string;
  productLifecycleState: ProductEngineLifecycleState;
  wakeLockStatus: ProductRuntimeWakeLockStatus;
  mediaSessionStatus: ProductRuntimeMediaSessionStatus;
  resumeAttemptCount: number;
  lastResumeReason: string | null;
  lastError: string | null;
  limitation: string;
};

type UseProductRuntimeBackgroundAudioSupportOptions = {
  productRuntimeSupportsBackgroundResume: boolean;
  getProductLifecycleState: () => ProductEngineLifecycleState;
  playbackActive: boolean;
  resumeProductRuntime: () => void | Promise<void>;
};

const BACKGROUND_AUDIO_LIMITATION = 'Browser/mobile background audio is best-effort; screen lock and app switch playback are not guaranteed.';

function currentPageStatus(): ProductRuntimeBackgroundPageStatus {
  if (typeof document === 'undefined') return 'foreground';
  return document.visibilityState === 'visible' ? 'foreground' : 'hidden';
}

function wakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean((navigator as WakeLockNavigator).wakeLock?.request);
}

function mediaSessionSupported(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
}

export function useProductRuntimeBackgroundAudioSupport({
  productRuntimeSupportsBackgroundResume,
  getProductLifecycleState,
  playbackActive,
  resumeProductRuntime,
}: UseProductRuntimeBackgroundAudioSupportOptions) {
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const wakeLockWantedRef = useRef(false);
  const resumeProductRuntimeRef = useRef(resumeProductRuntime);
  const [pageStatus, setPageStatus] = useState<ProductRuntimeBackgroundPageStatus>(() => currentPageStatus());
  const [lifecycleEvent, setLifecycleEvent] = useState('init');
  const [productLifecycleState, setProductLifecycleState] = useState<ProductEngineLifecycleState>(() => getProductLifecycleState());
  const [wakeLockStatus, setWakeLockStatus] = useState<ProductRuntimeWakeLockStatus>(() => wakeLockSupported() ? 'inactive' : 'unsupported');
  const [mediaSessionStatus, setMediaSessionStatus] = useState<ProductRuntimeMediaSessionStatus>(() => mediaSessionSupported() ? 'ready' : 'unsupported');
  const [resumeAttemptCount, setResumeAttemptCount] = useState(0);
  const [lastResumeReason, setLastResumeReason] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    resumeProductRuntimeRef.current = resumeProductRuntime;
  }, [resumeProductRuntime]);

  const refreshProductLifecycleState = useCallback((): void => {
    setProductLifecycleState(getProductLifecycleState());
  }, [getProductLifecycleState]);

  const releaseVisiblePageWakeLock = useCallback(async (): Promise<void> => {
    wakeLockWantedRef.current = false;
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    if (!sentinel || sentinel.released) {
      setWakeLockStatus(wakeLockSupported() ? 'released' : 'unsupported');
      return;
    }
    try {
      await sentinel.release();
      setWakeLockStatus('released');
    } catch (error) {
      setWakeLockStatus('failed');
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const requestVisiblePageWakeLock = useCallback(async (): Promise<void> => {
    wakeLockWantedRef.current = true;
    if (!wakeLockSupported()) {
      setWakeLockStatus('unsupported');
      return;
    }
    if (currentPageStatus() !== 'foreground') {
      setWakeLockStatus('released');
      return;
    }
    try {
      const sentinel = await (navigator as WakeLockNavigator).wakeLock!.request('screen');
      wakeLockRef.current = sentinel;
      setWakeLockStatus('active');
      setLastError(null);
      sentinel.addEventListener('release', () => {
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
        setWakeLockStatus(wakeLockSupported() ? 'released' : 'unsupported');
      }, { once: true });
    } catch (error) {
      setWakeLockStatus('failed');
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const attemptGracefulResume = useCallback((reason: string): void => {
    if (!productRuntimeSupportsBackgroundResume || !playbackActive) return;
    setResumeAttemptCount((count) => count + 1);
    setLastResumeReason(reason);
    try {
      void Promise.resolve(resumeProductRuntimeRef.current()).then(refreshProductLifecycleState);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }, [playbackActive, productRuntimeSupportsBackgroundResume, refreshProductLifecycleState]);

  useEffect(() => {
    setMediaSessionStatus(mediaSessionSupported() ? playbackActive ? 'active' : 'ready' : 'unsupported');
    refreshProductLifecycleState();
  }, [playbackActive, refreshProductLifecycleState]);

  useEffect(() => {
    if (playbackActive) return;
    wakeLockWantedRef.current = false;
    void releaseVisiblePageWakeLock();
    setMediaSessionStatus(mediaSessionSupported() ? 'stopped' : 'unsupported');
  }, [playbackActive, releaseVisiblePageWakeLock]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;

    const markLifecycle = (eventName: string): void => {
      setLifecycleEvent(eventName);
      refreshProductLifecycleState();
      if (eventName === 'pageshow' || eventName === 'resume') {
        attemptGracefulResume(eventName);
      }
    };
    const handlePageHide = (): void => markLifecycle('pagehide');
    const handlePageShow = (): void => markLifecycle('pageshow');
    const handleFreeze = (): void => markLifecycle('freeze');
    const handleResume = (): void => markLifecycle('resume');
    const handleVisibilityChange = (): void => {
      const nextStatus = currentPageStatus();
      setPageStatus(nextStatus);
      setLifecycleEvent(nextStatus === 'foreground' ? 'foreground' : 'hidden');
      refreshProductLifecycleState();
      if (nextStatus === 'foreground') {
        attemptGracefulResume('visibilitychange');
        if (wakeLockWantedRef.current) void requestVisiblePageWakeLock();
      } else if (wakeLockRef.current) {
        const shouldReacquireWhenVisible = wakeLockWantedRef.current;
        void releaseVisiblePageWakeLock().finally(() => {
          wakeLockWantedRef.current = shouldReacquireWhenVisible;
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('freeze', handleFreeze);
    document.addEventListener('resume', handleResume);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('freeze', handleFreeze);
      document.removeEventListener('resume', handleResume);
    };
  }, [
    attemptGracefulResume,
    refreshProductLifecycleState,
    releaseVisiblePageWakeLock,
    requestVisiblePageWakeLock,
  ]);

  const status = useMemo<ProductRuntimeBackgroundAudioStatus>(() => ({
    playbackActive,
    pageStatus,
    lifecycleEvent,
    productLifecycleState,
    wakeLockStatus: wakeLockSupported() ? wakeLockStatus : 'unsupported',
    mediaSessionStatus,
    resumeAttemptCount,
    lastResumeReason,
    lastError,
    limitation: BACKGROUND_AUDIO_LIMITATION,
  }), [
    lifecycleEvent,
    lastError,
    lastResumeReason,
    mediaSessionStatus,
    pageStatus,
    playbackActive,
    productLifecycleState,
    resumeAttemptCount,
    wakeLockStatus,
  ]);

  return {
    backgroundAudioStatus: status,
    requestVisiblePageWakeLock,
    releaseVisiblePageWakeLock,
  };
}
