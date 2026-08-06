import assert from 'node:assert/strict';
import type { KesshoMidiMessage } from '../../native/midi/midiTypes';
import { subscribeHarmonyMidiCapture } from '../harmony/harmonyDraftChord';
import { publishHarmonyMidiCaptureFromMessage } from './midiHarmonyCapture';

const noteOn: KesshoMidiMessage = {
  timestamp: 1,
  kind: 'noteOn',
  status: 0x90,
  channel: 1,
  data1: 60,
  data2: 100,
  rawBytes: [0x90, 60, 100],
};
const noteOff: KesshoMidiMessage = {
  ...noteOn,
  timestamp: 2,
  kind: 'noteOff',
  status: 0x80,
  data2: 0,
  rawBytes: [0x80, 60, 0],
};
const sustainDown: KesshoMidiMessage = {
  ...noteOn,
  timestamp: 3,
  kind: 'controlChange',
  status: 0xb0,
  data1: 64,
  data2: 127,
  rawBytes: [0xb0, 64, 127],
};
const sustainUp: KesshoMidiMessage = {
  ...sustainDown,
  timestamp: 4,
  data2: 0,
  rawBytes: [0xb0, 64, 0],
};

const captured: unknown[] = [];
const unsubscribe = subscribeHarmonyMidiCapture((event) => captured.push(event));
try {
  assert.deepEqual(publishHarmonyMidiCaptureFromMessage(noteOn), {
    kind: 'noteOn', midi: 60, velocity: 100 / 127, timestampMs: 1000,
  });
  assert.deepEqual(publishHarmonyMidiCaptureFromMessage(noteOff), {
    kind: 'noteOff', midi: 60, timestampMs: 2000,
  });
  assert.deepEqual(publishHarmonyMidiCaptureFromMessage(sustainDown), {
    kind: 'sustain', down: true, timestampMs: 3000,
  });
  assert.deepEqual(publishHarmonyMidiCaptureFromMessage(sustainUp), {
    kind: 'sustain', down: false, timestampMs: 4000,
  });
  assert.equal(publishHarmonyMidiCaptureFromMessage({ ...sustainDown, data1: 1 }), null);
} finally {
  unsubscribe();
}

assert.deepEqual(captured, [
  { kind: 'noteOn', midi: 60, velocity: 100 / 127, timestampMs: 1000 },
  { kind: 'noteOff', midi: 60, timestampMs: 2000 },
  { kind: 'sustain', down: true, timestampMs: 3000 },
  { kind: 'sustain', down: false, timestampMs: 4000 },
]);
assert.equal(captured.length, 4, 'each hardware message must publish at most one Harmony capture event');
console.log('MIDI Harmony capture publication tests passed');
