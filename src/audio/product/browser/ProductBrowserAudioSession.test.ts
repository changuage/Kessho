import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ProductBrowserAudioSession,
  type BrowserAudioSession,
  type BrowserAudioSessionState,
  type BrowserAudioSessionType,
} from './ProductBrowserAudioSession';

class FakeAudioSession extends EventTarget implements BrowserAudioSession {
  type: BrowserAudioSessionType = 'auto';
  state: BrowserAudioSessionState = 'inactive';

  transitionTo(state: BrowserAudioSessionState): void {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

function fakeNavigator(audioSession: BrowserAudioSession): Navigator {
  return { audioSession } as unknown as Navigator;
}

test('requests playback only while browser playback is active', () => {
  const audioSession = new FakeAudioSession();
  const controller = new ProductBrowserAudioSession(() => undefined, {
    navigator: fakeNavigator(audioSession),
    nativeShell: false,
  });

  controller.setPlaybackRequested(true);
  assert.equal(audioSession.type, 'playback');
  controller.setPlaybackRequested(false);
  assert.equal(audioSession.type, 'auto');
  controller.dispose();
  assert.equal(audioSession.type, 'auto');
});

test('does not steal an active play-and-record capture session', () => {
  const audioSession = new FakeAudioSession();
  audioSession.type = 'play-and-record';
  const controller = new ProductBrowserAudioSession(() => undefined, {
    navigator: fakeNavigator(audioSession),
    nativeShell: false,
  });

  controller.setPlaybackRequested(true);
  assert.equal(audioSession.type, 'play-and-record');
  controller.setPlaybackRequested(false);
  assert.equal(audioSession.type, 'play-and-record');
  controller.dispose();
  assert.equal(audioSession.type, 'play-and-record');
});

test('resumes once for one interrupted-to-active transition when playback is requested', () => {
  const audioSession = new FakeAudioSession();
  let resumeCount = 0;
  const controller = new ProductBrowserAudioSession(() => { resumeCount += 1; }, {
    navigator: fakeNavigator(audioSession),
    nativeShell: false,
  });
  controller.setPlaybackRequested(true);

  audioSession.transitionTo('active');
  audioSession.transitionTo('interrupted');
  audioSession.transitionTo('active');
  audioSession.transitionTo('active');
  assert.equal(resumeCount, 1);

  controller.setPlaybackRequested(false);
  audioSession.transitionTo('interrupted');
  audioSession.transitionTo('active');
  assert.equal(resumeCount, 1);
});

test('does not claim the browser session inside a native shell', () => {
  const audioSession = new FakeAudioSession();
  let resumeCount = 0;
  const controller = new ProductBrowserAudioSession(() => { resumeCount += 1; }, {
    navigator: fakeNavigator(audioSession),
    nativeShell: true,
  });

  controller.setPlaybackRequested(true);
  audioSession.transitionTo('interrupted');
  audioSession.transitionTo('active');
  assert.equal(audioSession.type, 'auto');
  assert.equal(resumeCount, 0);
});

test('dispose removes interruption ownership', () => {
  const audioSession = new FakeAudioSession();
  let resumeCount = 0;
  const controller = new ProductBrowserAudioSession(() => { resumeCount += 1; }, {
    navigator: fakeNavigator(audioSession),
    nativeShell: false,
  });
  controller.setPlaybackRequested(true);
  controller.dispose();
  audioSession.transitionTo('interrupted');
  audioSession.transitionTo('active');
  assert.equal(resumeCount, 0);
  assert.equal(audioSession.type, 'auto');
});
