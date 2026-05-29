import { referenceAudioEngineDebug } from '../audio/reference/ReferenceAudioEngineDebugCompat';
import type { AudioEngineRuntimeMode } from './audioEngineRuntimeMode';
import { isIOSLikeDevice } from '../platform';

type IOSMediaSessionEngineControls = {
  resumeSelectedAudioEngine: () => void | Promise<void>;
  suspendSelectedAudioEngine: () => void | Promise<void>;
};

let mediaSessionAudio: HTMLAudioElement | null = null;

export function setupIOSMediaSession({
  resumeSelectedAudioEngine,
  suspendSelectedAudioEngine,
}: IOSMediaSessionEngineControls): void {
  if (!('mediaSession' in navigator)) return;

  if (!mediaSessionAudio) {
    mediaSessionAudio = new Audio();
    mediaSessionAudio.loop = false;
    mediaSessionAudio.volume = 1.0;
    (mediaSessionAudio as any).webkitPreservesPitch = false;
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: 'Generative Ambient',
    artist: 'Kessho',
    album: 'Ambient Dreams',
  });

  navigator.mediaSession.playbackState = 'playing';

  navigator.mediaSession.setActionHandler('play', () => {
    void mediaSessionAudio?.play();
    void resumeSelectedAudioEngine();
    navigator.mediaSession.playbackState = 'playing';
  });

  navigator.mediaSession.setActionHandler('pause', () => {
    mediaSessionAudio?.pause();
    void suspendSelectedAudioEngine();
    navigator.mediaSession.playbackState = 'paused';
  });
}

export function connectMediaSessionToWebAudio(audioEngineRuntimeMode: AudioEngineRuntimeMode): void {
  if (!mediaSessionAudio) return;
  if (audioEngineRuntimeMode === 'core-product') return;

  if (!isIOSLikeDevice()) {
    console.log('Skipping MediaStream audio element on non-iOS devices');
    return;
  }

  const stream = referenceAudioEngineDebug.getMediaStream();
  if (stream) {
    mediaSessionAudio.srcObject = stream;
    mediaSessionAudio.play().catch(e => console.log('Media stream play failed:', e));
    console.log('MediaStream connected to audio element for background playback');
  }
}

export function stopIOSMediaSession(): void {
  if (mediaSessionAudio) {
    mediaSessionAudio.pause();
    mediaSessionAudio.srcObject = null;
  }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none';
  }
}
