import type { ProductLiveNoteEvent, ProductLiveNoteInstrument } from '../../audio/product/liveNoteEvents';
import { createMidiID, type KesshoMidiMessage } from './midiTypes';

export function midiChannelToProductLiveNoteInstrument(channel: number | null): ProductLiveNoteInstrument | null {
  switch (channel ?? 0) {
    case 1: return 'lead2';
    case 2: return 'pad1';
    case 3: return 'pad2';
    case 4: return 'sample1';
    case 5: return null; // Soundscape is supported by the raw Product MIDI path only.
    case 6: return 'sample2';
    case 9: return 'drum';
    default: return 'lead1';
  }
}

export function midiLiveNoteInputId(message: KesshoMidiMessage): string | null {
  const note = message.data1;
  if (typeof note !== 'number' || !Number.isFinite(note)) return null;
  const endpoint = typeof message.endpointUniqueID === 'number' && Number.isFinite(message.endpointUniqueID)
    ? String(message.endpointUniqueID)
    : message.endpointName?.trim() || 'unknown';
  return `midi:${endpoint}:${message.channel ?? 'omni'}:${Math.max(0, Math.min(127, Math.round(note)))}`;
}

export function midiMessageToProductLiveNoteEvent(
  message: KesshoMidiMessage,
  instrument: ProductLiveNoteInstrument | null = midiChannelToProductLiveNoteInstrument(message.channel ?? null),
): ProductLiveNoteEvent | null {
  if (message.kind !== 'noteOn' && message.kind !== 'noteOff') return null;
  if (!instrument) return null;
  const note = message.data1;
  if (typeof note !== 'number' || !Number.isFinite(note)) return null;
  const velocityByte = message.kind === 'noteOff' ? 0 : message.data2 ?? 0;
  const velocity = Math.max(0, Math.min(1, velocityByte / 127));
  return {
    kind: message.kind === 'noteOff' || velocityByte <= 0 ? 'live-note-off' : 'live-note-on',
    eventID: createMidiID('live-note'),
    source: 'midi',
    instrument,
    channel: message.channel ?? null,
    note: Math.max(0, Math.min(127, Math.round(note))),
    velocity,
    timestampMs: Number.isFinite(message.timestamp) ? message.timestamp * 1000 : Date.now(),
    timestampHostTime: message.timestampHostTime,
  };
}
