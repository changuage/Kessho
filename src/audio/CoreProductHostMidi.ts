import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';
import type { ProductLiveNoteEvent, ProductLiveNoteInstrument } from './product/liveNoteEvents';
import { toKesshoCoreMidiEventPayload, type KesshoCoreMidiTimingOptions } from './coreMidiEvents';
import { CORE_PRODUCT_SOURCE_IDS, createCoreProductMidiEvent, type CoreProductEvent } from './coreProductEvents';

const MAX_SAMPLE_OFFSET = 0x3fffffff;

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, numeric));
}

function clamp01(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, numeric));
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
  if (!options) return 0;
  const sampleRate = Math.max(1, Number.isFinite(options.sampleRate) ? options.sampleRate : 48000);
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
  return createCoreProductMidiEvent({
    sampleOffset: liveNoteSampleOffset(event, options),
    targetId: liveNoteSourceId(event.instrument),
    status: (noteOff ? 0x80 : 0x90) | channel,
    channel,
    data1: clampInteger(event.note, 60, 0, 127),
    data2: noteOff ? 0 : clampInteger(velocity * 127, 0, 0, 127),
    normalizedValue: noteOff ? 0 : velocity,
    rawSize: 3,
  });
}
