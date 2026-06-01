import type { ProductLiveNoteEvent, ProductLiveNoteInstrument } from '../../audio/product/liveNoteEvents';
import { createMidiID, type KesshoMidiMessage } from './midiTypes';

export function midiMessageToProductLiveNoteEvent(
  message: KesshoMidiMessage,
  instrument: ProductLiveNoteInstrument = 'piano',
): ProductLiveNoteEvent | null {
  if (message.kind !== 'noteOn' && message.kind !== 'noteOff') return null;
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
