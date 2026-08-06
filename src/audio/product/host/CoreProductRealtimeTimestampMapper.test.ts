import assert from 'node:assert/strict';
import test from 'node:test';
import { CoreProductRealtimeTimestampMapper } from './CoreProductRealtimeTimestampMapper';

function context(currentTime: number, state: AudioContextState = 'running'): AudioContext {
  return { currentTime, sampleRate: 48_000, state } as AudioContext;
}

test('browser live-note timestamps do not establish a MIDI clock epoch', () => {
  const mapper = new CoreProductRealtimeTimestampMapper();
  const audio = context(4);
  const live = mapper.liveNoteContext({ source: 'computer-keyboard', timestampMs: 100_000 }, audio);
  assert.equal(live.timestampOriginSeconds, undefined);
  const midi = mapper.midiContext({ timestamp: 5 }, audio);
  assert.equal(midi.timestampOriginSeconds, 1);
});

test('audio clock discontinuity causes MIDI timestamp recalibration', () => {
  const mapper = new CoreProductRealtimeTimestampMapper();
  const first = mapper.midiContext({ timestamp: 10 }, context(9));
  assert.equal(first.timestampOriginSeconds, 1);
  const recalibrated = mapper.midiContext({ timestamp: 20 }, context(2));
  assert.equal(recalibrated.timestampOriginSeconds, 18);
});

test('explicit reset clears the host/audio timestamp epoch', () => {
  const mapper = new CoreProductRealtimeTimestampMapper();
  mapper.midiContext({ timestamp: 10 }, context(9));
  mapper.reset();
  assert.equal(mapper.midiContext({ timestamp: 30 }, context(5)).timestampOriginSeconds, 25);
});

test('suspended audio context rebases MIDI timestamps', () => {
  const mapper = new CoreProductRealtimeTimestampMapper();
  mapper.midiContext({ timestamp: 10 }, context(9));
  const suspended = mapper.midiContext({ timestamp: 20 }, context(9, 'suspended'));
  assert.equal(suspended.timestampOriginSeconds, 11);
});
