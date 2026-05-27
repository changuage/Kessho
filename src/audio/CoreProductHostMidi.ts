import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';
import { toKesshoCoreMidiEventPayload, type KesshoCoreMidiTimingOptions } from './coreMidiEvents';
import { createCoreProductMidiEvent, type CoreProductEvent } from './coreProductEvents';

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
