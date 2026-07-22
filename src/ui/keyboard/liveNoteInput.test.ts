import assert from 'node:assert/strict';
import { LiveNoteInputController } from './liveNoteInput';
import type { ProductLiveNoteEvent } from '../../audio/product/liveNoteEvents';
import {
  midiChannelToProductLiveNoteInstrument,
  midiLiveNoteInputId,
  midiMessageToProductLiveNoteEvent,
} from '../../native/midi/midiLiveNoteAdapter';
import type { KesshoMidiMessage } from '../../native/midi/midiTypes';

const started: ProductLiveNoteEvent[] = [];
const stopped: ProductLiveNoteEvent[] = [];
let releaseStart: () => void = () => {};
const controller = new LiveNoteInputController({
  start: (event) => {
    started.push(event);
    return new Promise<void>((resolve) => { releaseStart = resolve; });
  },
  stop: (event) => stopped.push(event),
  onStartFailure: () => {},
});

assert.equal(controller.noteOn('keyboard:KeyA', {
  source: 'computer-keyboard',
  instrument: 'lead1',
  note: 60.2,
  velocity: 1.5,
  timestampMs: 100,
}).status, 'started');
assert.equal(controller.noteOn('keyboard:KeyA', {
  source: 'computer-keyboard',
  instrument: 'lead1',
  note: 61,
  velocity: 0.5,
}).status, 'duplicate', 'held input should suppress repeated note-on');
assert.equal(controller.activeCount(), 1);
assert.equal(started[0]?.note, 60);
assert.equal(started[0]?.velocity, 1);

assert.equal(controller.noteOff('keyboard:KeyA', 250), true);
assert.equal(stopped.length, 0, 'note-off should wait until asynchronous note-on preparation finishes');
releaseStart();
await Promise.resolve();
await Promise.resolve();
assert.equal(stopped.length, 1);
assert.equal(stopped[0]?.kind, 'live-note-off');
assert.equal(stopped[0]?.eventID, started[0]?.eventID);
assert.equal(stopped[0]?.velocity, 0);
assert.equal(stopped[0]?.timestampMs, 250);

controller.setCallbacks({
  start: async (event) => { started.push(event); },
  stop: (event) => stopped.push(event),
  onStartFailure: () => {},
});
controller.noteOn('pointer:1', { source: 'ui-pad', instrument: 'pad1', note: 64, velocity: 0.8 });
controller.noteOn('pointer:2', { source: 'ui-pad', instrument: 'pad1', note: 67, velocity: 0.8 });
controller.releaseAll(500);
await Promise.resolve();
await Promise.resolve();
assert.equal(controller.activeCount(), 0);
assert.equal(stopped.length, 3, 'releaseAll should stop every active input');

const stopDestinations: string[] = [];
const runtimeAffinityController = new LiveNoteInputController({
  start: async () => undefined,
  stop: () => stopDestinations.push('runtime-a'),
  onStartFailure: () => {},
});
runtimeAffinityController.noteOn('keyboard:KeyS', {
  source: 'computer-keyboard',
  instrument: 'lead1',
  note: 62,
  velocity: 0.8,
});
runtimeAffinityController.setCallbacks({
  start: async () => undefined,
  stop: () => stopDestinations.push('runtime-b'),
  onStartFailure: () => {},
});
runtimeAffinityController.noteOff('keyboard:KeyS');
await Promise.resolve();
await Promise.resolve();
assert.deepEqual(stopDestinations, ['runtime-a'], 'note-off must return to the runtime that accepted note-on');

const synchronousFailureController = new LiveNoteInputController({
  start: () => { throw new Error('synchronous start failure'); },
  stop: () => { throw new Error('stop should not run'); },
  onStartFailure: (result) => {
    assert.equal(result.status, 'failed');
  },
});
assert.equal(synchronousFailureController.noteOn('pointer:failed', {
  source: 'ui-pad',
  instrument: 'pad1',
  note: 64,
  velocity: 0.8,
}).status, 'failed', 'synchronous start failures are returned and reported');
assert.equal(synchronousFailureController.activeCount(), 0);

const stopFailureController = new LiveNoteInputController({
  start: async () => undefined,
  stop: () => { throw new Error('synchronous stop failure'); },
  onStartFailure: () => {},
});
stopFailureController.noteOn('pointer:stop-failure', {
  source: 'ui-pad',
  instrument: 'pad1',
  note: 65,
  velocity: 0.8,
});
assert.equal(stopFailureController.noteOff('pointer:stop-failure'), true);
await Promise.resolve();
await Promise.resolve();
assert.equal(stopFailureController.activeCount(), 0, 'stop failures must not restore a released input');

const midiNoteOn: KesshoMidiMessage = {
  timestamp: 1,
  timestampHostTime: 111,
  kind: 'noteOn',
  status: 0x90,
  channel: 1,
  data1: 60,
  data2: 100,
  rawBytes: [0x90, 60, 100],
  endpointUniqueID: 42,
  endpointName: 'Controller A',
};
const midiNoteOff: KesshoMidiMessage = {
  ...midiNoteOn,
  timestamp: 2,
  timestampHostTime: 222,
  kind: 'noteOff',
  status: 0x80,
  data2: 0,
  rawBytes: [0x80, 60, 0],
};
assert.equal(midiLiveNoteInputId(midiNoteOn), 'midi:42:1:60');
assert.equal(midiLiveNoteInputId(midiNoteOff), midiLiveNoteInputId(midiNoteOn), 'MIDI note-on/off must share an owned input ID');
assert.notEqual(
  midiLiveNoteInputId({ ...midiNoteOn, endpointUniqueID: 43 }),
  midiLiveNoteInputId(midiNoteOn),
  'matching notes from different MIDI endpoints must remain independently owned',
);
assert.equal(midiMessageToProductLiveNoteEvent(midiNoteOn)?.kind, 'live-note-on');
assert.equal(midiMessageToProductLiveNoteEvent(midiNoteOn)?.instrument, 'lead2');
assert.equal(midiMessageToProductLiveNoteEvent({ ...midiNoteOn, data2: 0 })?.kind, 'live-note-off');
assert.equal(midiChannelToProductLiveNoteInstrument(0), 'lead1');
assert.equal(midiChannelToProductLiveNoteInstrument(2), 'pad1');
assert.equal(midiChannelToProductLiveNoteInstrument(4), 'sample1');
assert.equal(midiChannelToProductLiveNoteInstrument(5), null, 'soundscape must retain the raw MIDI path');
assert.equal(midiChannelToProductLiveNoteInstrument(9), 'drum');
assert.equal(midiMessageToProductLiveNoteEvent({ ...midiNoteOn, channel: 5 }), null);

const midiStopped: ProductLiveNoteEvent[] = [];
const midiController = new LiveNoteInputController({
  start: async () => undefined,
  stop: (event) => midiStopped.push(event),
  onStartFailure: () => {},
});
midiController.noteOn('midi:42:1:60', {
  source: 'midi',
  instrument: 'sample1',
  note: 60,
  velocity: 100 / 127,
  channel: 1,
  timestampMs: 1000,
  timestampHostTime: 111,
});
midiController.noteOff('midi:42:1:60', { timestampMs: 2000, timestampHostTime: 222 });
await Promise.resolve();
await Promise.resolve();
assert.equal(midiStopped[0]?.timestampHostTime, 222, 'MIDI note-off must retain its own host timestamp');

console.log('Live note input controller tests passed');
