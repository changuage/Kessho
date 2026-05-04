import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const source = readFileSync(resolve(root, 'KesshoiOS/Kessho/MIDI/MIDIManager.swift'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const callbackMatch = source.match(/private func receive\(packetList: UnsafePointer<MIDIPacketList>\) \{([\s\S]*?)\n    private func receive\(_ snapshots:/);
assert(callbackMatch, 'Could not locate MIDI packet-list callback handoff');
const callbackBody = callbackMatch[1];

assert(
  source.includes('private struct MIDIPacketSnapshot') &&
    callbackBody.includes('MIDIPacketSnapshot') &&
    callbackBody.includes('DispatchQueue.main.async'),
  'CoreMIDI callback must copy packet bytes and hand off before touching manager state'
);

for (const unsafeRead of ['connectedInputIDs', 'endpointNamesByID', 'sourceRefsByID', 'isStarted']) {
  assert(
    !callbackBody.includes(unsafeRead),
    `CoreMIDI callback must not read mutable manager state directly (${unsafeRead})`
  );
}

console.log('Native MIDI threading checks passed');
