import { isCapacitorNativeShell } from '../../../native/capacitorAudioSession';

export type BrowserAudioSessionState = 'inactive' | 'active' | 'interrupted';
export type BrowserAudioSessionType = 'auto' | 'playback' | 'play-and-record';

export type BrowserAudioSession = EventTarget & {
  type: BrowserAudioSessionType;
  state?: BrowserAudioSessionState;
};

type NavigatorWithAudioSession = Navigator & {
  audioSession?: BrowserAudioSession;
};

function currentNavigator(): NavigatorWithAudioSession | null {
  return typeof navigator === 'undefined' ? null : navigator as NavigatorWithAudioSession;
}

function setPlaybackTypeWithoutStealingCapture(session: BrowserAudioSession, requested: boolean): void {
  // A browser microphone owner may have explicitly selected play-and-record.
  // Product playback must not downgrade that category to playback while input
  // capture is active, otherwise WebKit rejects getUserMedia() with
  // "AudioSession category is not compatible with audio capture".
  if (session.type === 'play-and-record') return;
  session.type = requested ? 'playback' : 'auto';
}

export function setBrowserPlaybackSession(active: boolean): void {
  if (isCapacitorNativeShell()) return;
  const session = currentNavigator()?.audioSession;
  if (!session) return;
  setPlaybackTypeWithoutStealingCapture(session, active);
}

export class ProductBrowserAudioSession {
  private readonly session: BrowserAudioSession | null;
  private playbackRequested = false;
  private previousState: BrowserAudioSessionState | undefined;
  private disposed = false;

  private readonly handleStateChange = (): void => {
    const nextState = this.session?.state;
    const wasInterrupted = this.previousState === 'interrupted';
    this.previousState = nextState;
    if (wasInterrupted && nextState === 'active' && this.playbackRequested && !this.disposed) {
      this.onInterruptionEnded();
    }
  };

  constructor(
    private readonly onInterruptionEnded: () => void,
    options: {
      navigator?: NavigatorWithAudioSession | null;
      nativeShell?: boolean;
    } = {},
  ) {
    const nativeShell = options.nativeShell ?? isCapacitorNativeShell();
    this.session = nativeShell ? null : (options.navigator ?? currentNavigator())?.audioSession ?? null;
    this.previousState = this.session?.state;
    this.session?.addEventListener('statechange', this.handleStateChange);
  }

  setPlaybackRequested(requested: boolean): void {
    if (this.disposed) return;
    this.playbackRequested = requested;
    if (this.session) setPlaybackTypeWithoutStealingCapture(this.session, requested);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.playbackRequested = false;
    if (this.session) {
      // Do not clear a capture category owned by another browser subsystem.
      if (this.session.type !== 'play-and-record') this.session.type = 'auto';
      this.session.removeEventListener('statechange', this.handleStateChange);
    }
  }
}
