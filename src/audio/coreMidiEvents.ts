import type { KesshoMidiMessage } from '../native/capacitorMidiRouting';

export interface KesshoCoreMidiEventPayload {
  sampleOffset: number;
  sourceId: number;
  status: number;
  channel: number;
  data1: number;
  data2: number;
  normalizedValue: number;
  rawBytes: number[];
}

export interface KesshoCoreMidiTimingOptions {
  sampleRate: number;
  currentTimeSeconds?: number;
  timestampOriginSeconds?: number;
  maxSampleOffset?: number;
}

const MAX_RAW_BYTES = 16;
const DEFAULT_MAX_SAMPLE_OFFSET = 0x3fffffff;

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, numeric));
}

function clamp01(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, numeric));
}

function unsignedSourceId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.abs(Math.round(value)) >>> 0;
}

function normalizedMidiValue(message: KesshoMidiMessage): number {
  switch (message.kind) {
    case 'noteOff':
      return 0;
    case 'noteOn':
    case 'controlChange':
    case 'polyPressure':
      return clamp01((message.data2 ?? 0) / 127);
    case 'programChange':
    case 'channelPressure':
      return clamp01((message.data1 ?? 0) / 127);
    case 'pitchBend': {
      const lsb = clampInteger(message.data1, 0, 0, 127);
      const msb = clampInteger(message.data2, 64, 0, 127);
      return clamp01((lsb + msb * 128) / 16383);
    }
    default:
      return clamp01((message.data2 ?? message.data1 ?? 0) / 127);
  }
}

export function midiSampleOffset(
  message: Pick<KesshoMidiMessage, 'timestamp'>,
  options: KesshoCoreMidiTimingOptions,
): number {
  const sampleRate = Math.max(1, Number.isFinite(options.sampleRate) ? options.sampleRate : 48000);
  const maxSampleOffset = clampInteger(
    options.maxSampleOffset,
    DEFAULT_MAX_SAMPLE_OFFSET,
    0,
    DEFAULT_MAX_SAMPLE_OFFSET,
  );
  if (
    typeof message.timestamp !== 'number' ||
    !Number.isFinite(message.timestamp) ||
    typeof options.timestampOriginSeconds !== 'number' ||
    !Number.isFinite(options.timestampOriginSeconds)
  ) {
    return 0;
  }

  const currentTime = typeof options.currentTimeSeconds === 'number' && Number.isFinite(options.currentTimeSeconds)
    ? options.currentTimeSeconds
    : 0;
  const eventTime = message.timestamp - options.timestampOriginSeconds;
  const deltaSeconds = Math.max(0, eventTime - currentTime);
  return Math.min(maxSampleOffset, Math.round(deltaSeconds * sampleRate));
}

export function toKesshoCoreMidiEventPayload(
  message: KesshoMidiMessage,
  options: KesshoCoreMidiTimingOptions,
): KesshoCoreMidiEventPayload {
  const rawBytes = Array.isArray(message.rawBytes)
    ? message.rawBytes.slice(0, MAX_RAW_BYTES).map((byte) => clampInteger(byte, 0, 0, 255))
    : [];
  const status = clampInteger(message.status ?? rawBytes[0], rawBytes[0] ?? 0, 0, 255);
  const data1 = clampInteger(message.data1 ?? rawBytes[1], rawBytes[1] ?? 0, 0, 255);
  const data2 = clampInteger(message.data2 ?? rawBytes[2], rawBytes[2] ?? 0, 0, 255);
  const channel = clampInteger(message.channel, status < 0xf0 ? status & 0x0f : 0, 0, 255);

  return {
    sampleOffset: midiSampleOffset(message, options),
    sourceId: unsignedSourceId(message.endpointUniqueID),
    status,
    channel,
    data1,
    data2,
    normalizedValue: normalizedMidiValue(message),
    rawBytes,
  };
}
