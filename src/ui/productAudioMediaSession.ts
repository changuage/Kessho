type ProductMediaSessionControls = {
  resumeProductRuntime: () => void | Promise<void>;
  suspendProductRuntime: () => void | Promise<void>;
  stopProductRuntime: () => void | Promise<void>;
};

export function setupProductIOSMediaSession({
  resumeProductRuntime,
  suspendProductRuntime,
  stopProductRuntime,
}: ProductMediaSessionControls): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;

  if (typeof MediaMetadata !== 'undefined') {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: 'Generative Ambient',
      artist: 'Kessho',
      album: 'Ambient Dreams',
    });
  }

  navigator.mediaSession.playbackState = 'playing';
  navigator.mediaSession.setActionHandler('play', () => {
    void resumeProductRuntime();
    navigator.mediaSession.playbackState = 'playing';
  });
  navigator.mediaSession.setActionHandler('pause', () => {
    void suspendProductRuntime();
    navigator.mediaSession.playbackState = 'paused';
  });
  navigator.mediaSession.setActionHandler('stop', () => {
    void stopProductRuntime();
    navigator.mediaSession.playbackState = 'none';
  });
}

export function connectProductMediaSessionToAudio(): void {}

export function stopProductIOSMediaSession(): void {
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none';
  }
}
