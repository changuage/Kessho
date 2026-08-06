import assert from 'node:assert/strict';
import test from 'node:test';
import { CORE_PRODUCT_TRANSIENT_AUDITION_FLAG, createCoreProductLiveNoteEvent } from './CoreProductHostMidi';

const timing = {
  sampleRate: 48_000,
  currentTimeSeconds: 10,
  timestampOriginSeconds: 9,
};

test('computer keyboard and UI live notes are always immediate', () => {
  const event = createCoreProductLiveNoteEvent({
    kind: 'live-note-on',
    eventID: 'key-a',
    source: 'computer-keyboard',
    instrument: 'lead1',
    channel: null,
    note: 60,
    velocity: 0.8,
    // Deliberately far in the future relative to the audio clock.
    timestampMs: 20_000,
  }, timing);
  assert.equal(event.sampleOffset, 0);
  assert.equal(event.flags, CORE_PRODUCT_TRANSIENT_AUDITION_FLAG + 3);
  assert.notEqual(event.paramId, 0);
});

test('live-note owner tokens pair releases without conflating identical pitches', () => {
  const make = (eventID: string, kind: 'live-note-on' | 'live-note-off') =>
    createCoreProductLiveNoteEvent({
      kind,
      eventID,
      source: 'ui-pad',
      instrument: 'lead1',
      channel: 0,
      note: 60,
      velocity: kind === 'live-note-on' ? 0.8 : 0,
      timestampMs: 10_000,
    }, timing);
  const firstOn = make('pointer-1', 'live-note-on');
  const firstOff = make('pointer-1', 'live-note-off');
  const secondOn = make('pointer-2', 'live-note-on');
  assert.equal(firstOn.paramId, firstOff.paramId);
  assert.notEqual(firstOn.paramId, secondOn.paramId);
});

test('hardware MIDI live notes retain timestamp scheduling', () => {
  const event = createCoreProductLiveNoteEvent({
    kind: 'live-note-on',
    eventID: 'midi-a',
    source: 'midi',
    instrument: 'lead1',
    channel: 0,
    note: 60,
    velocity: 0.8,
    timestampMs: 20_000,
  }, timing);
  assert.equal(event.sampleOffset, 48_000);
  assert.equal(event.flags, 3);
});
