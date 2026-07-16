import { isCapacitorNativeShell } from '../../../native/capacitorAudioSession';

export type BrowserAudioSessionState = 'inactive' | 'active' | 'interrupted';

export type BrowserAudioSession = EventTarget & {
  type: 'auto' | 'playback';
  state?: BrowserAudioSessionState;
};

type NavigatorWithAudioSession = Navigator & {
  audioSession?: BrowserAudioSession;
};

function currentNavigator(): NavigatorWithAudioSession | null {
  return typeof navigator === 'undefined' ? null : navigator as NavigatorWithAudioSession;
}

export function setBrowserPlaybackSession(active: boolean): void {
  if (isCapacitorNativeShell()) return;
  const session = currentNavigator()?.audioSession;
  if (!session) return;
  session.type = active ? 'playback' : 'auto';
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
    if (this.session) this.session.type = requested ? 'playback' : 'auto';
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.playbackRequested = false;
    if (this.session) {
      this.session.type = 'auto';
      this.session.removeEventListener('statechange', this.handleStateChange);
    }
  }
}
