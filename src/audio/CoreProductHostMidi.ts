import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';
import type { ProductLiveNoteEvent, ProductLiveNoteInstrument } from './product/liveNoteEvents';
import { toKesshoCoreMidiEventPayload, type KesshoCoreMidiTimingOptions } from './coreMidiEvents';
import {
  CORE_PRODUCT_SOURCE_IDS,
  CORE_PRODUCT_TRANSIENT_MIDI_AUDITION_FLAG,
  createCoreProductMidiEvent,
  type CoreProductEvent,
} from './coreProductEvents';

const MAX_SAMPLE_OFFSET = 0x3fffffff;
/** Marks a live UI note as an ephemeral audition, without mutating source state. */
export const CORE_PRODUCT_TRANSIENT_AUDITION_FLAG = CORE_PRODUCT_TRANSIENT_MIDI_AUDITION_FLAG;

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, numeric));
}

function clamp01(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, numeric));
}

function liveNoteOwnerToken(eventID: string): number {
  // Stable FNV-1a token keeps concurrent pointers/devices independent without
  // carrying strings across the fixed-size realtime event ABI.
  let hash = 0x811c9dc5;
  for (let index = 0; index < eventID.length; index += 1) {
    hash ^= eventID.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const token = hash >>> 0;
  return token === 0 ? 1 : token;
}

function liveNoteSourceId(instrument: ProductLiveNoteInstrument): number {
  switch (instrument) {
    case 'pad1': return CORE_PRODUCT_SOURCE_IDS.pad1;
    case 'pad2': return CORE_PRODUCT_SOURCE_IDS.pad2;
    case 'lead1': return CORE_PRODUCT_SOURCE_IDS.lead1;
    case 'lead2': return CORE_PRODUCT_SOURCE_IDS.lead2;
    case 'drum': return CORE_PRODUCT_SOURCE_IDS.drum;
    case 'sample2': return CORE_PRODUCT_SOURCE_IDS.sample2;
    case 'sample1':
    default: return CORE_PRODUCT_SOURCE_IDS.sample1;
  }
}

function liveNoteSampleOffset(event: ProductLiveNoteEvent, options?: KesshoCoreMidiTimingOptions): number {
  // Computer keyboard and UI/touch events are generated against the browser
  // event loop. Their wall-clock timestamps are useful for harmony grouping,
  // but must never become future audio scheduling offsets: enqueue them at the
  // current render quantum. Hardware MIDI retains its timestamp scheduling.
  if (event.source !== 'midi') return 0;
  if (!options) return 0;
  const sampleRate = options.sampleRate;
  if (typeof sampleRate !== 'number' || !Number.isFinite(sampleRate) || sampleRate <= 0) return 0;
  const currentTimeSeconds = typeof options.currentTimeSeconds === 'number' && Number.isFinite(options.currentTimeSeconds)
    ? options.currentTimeSeconds
    : 0;
  if (typeof event.timestampAudioFrame === 'number' && Number.isFinite(event.timestampAudioFrame)) {
    return clampInteger(event.timestampAudioFrame - Math.round(currentTimeSeconds * sampleRate), 0, 0, MAX_SAMPLE_OFFSET);
  }
  if (typeof event.timestampMs === 'number' && Number.isFinite(event.timestampMs) && typeof options.timestampOriginSeconds === 'number' && Number.isFinite(options.timestampOriginSeconds)) {
    return clampInteger(((event.timestampMs / 1000) - options.timestampOriginSeconds - currentTimeSeconds) * sampleRate, 0, 0, MAX_SAMPLE_OFFSET);
  }
  return 0;
}

export function createCoreProductHostMidiEvent(
  message: KesshoMidiMessage,
  options: KesshoCoreMidiTimingOptions,
): CoreProductEvent {
  const payload = toKesshoCoreMidiEventPayload(message, options);
  return createCoreProductMidiEvent({
    sampleOffset: payload.sampleOffset,
    status: payload.status,
    channel: payload.channel,
    data1: payload.data1,
    data2: payload.data2,
    normalizedValue: payload.normalizedValue,
    rawSize: payload.rawBytes.length,
  });
}

export function createCoreProductLiveNoteEvent(
  event: ProductLiveNoteEvent,
  options?: KesshoCoreMidiTimingOptions,
): CoreProductEvent {
  const channel = clampInteger(event.channel, 0, 0, 15);
  const velocity = clamp01(event.velocity);
  const noteOff = event.kind === 'live-note-off';
  const productEvent = createCoreProductMidiEvent({
    sampleOffset: liveNoteSampleOffset(event, options),
    targetId: liveNoteSourceId(event.instrument),
    ownerToken: liveNoteOwnerToken(event.eventID),
    status: (noteOff ? 0x80 : 0x90) | channel,
    channel,
    data1: clampInteger(event.note, 60, 0, 127),
    data2: noteOff ? 0 : clampInteger(velocity * 127, 0, 0, 127),
    normalizedValue: noteOff ? 0 : velocity,
    rawSize: 3,
  });
  if (event.source !== 'midi') {
    // Keep the raw MIDI byte count in the low bits while carrying audition
    // semantics out-of-band. Product Core consumes this flag transiently and
    // must not persist SourceEnabled state for a UI key press.
    productEvent.flags = CORE_PRODUCT_TRANSIENT_AUDITION_FLAG + (productEvent.flags ?? 0);
  }
  return productEvent;
}
