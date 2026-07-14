export type KesshoMidiMessageKind =
  | 'noteOn'
  | 'noteOff'
  | 'controlChange'
  | 'programChange'
  | 'pitchBend'
  | 'channelPressure'
  | 'polyPressure'
  | 'systemExclusive'
  | 'unknown';

export type KesshoMidiEndpointInfo = {
  uniqueID: number;
  name: string;
  displayName?: string;
  manufacturer?: string;
  transport?: 'usb' | 'bluetooth' | 'network' | 'virtual' | 'other' | 'unknown';
  isBluetooth?: boolean;
  isNetworkSession?: boolean;
  persistentIdentity?: string;
  isConnected: boolean;
  lastSeenAt?: string;
};

export type KesshoMidiMessage = {
  timestamp: number;
  timestampMs?: number;
  timestampHostTime?: number;
  kind: KesshoMidiMessageKind;
  status: number;
  channel?: number;
  data1?: number;
  data2?: number;
  rawBytes: number[];
  endpointUniqueID?: number;
  endpointName?: string;
};

export type KesshoMidiStatus = {
  available: boolean;
  isStarted: boolean;
  inputCount: number;
  connectedInputIDs: number[];
  hotplugEventCount?: number;
  reconnectAttemptCount?: number;
  reconnectSuccessCount?: number;
  receivedMessageCount?: number;
  droppedActivityEventCount?: number;
  lastErrorMessage?: string | null;
};

export type KesshoMidiInputSnapshot = {
  inputs: KesshoMidiEndpointInfo[];
  connectedInputIDs: number[];
};

export type KesshoMidiValueCurve = 'linear' | 'exponential' | 'logarithmic' | 'stepped';

export type KesshoMidiControlSource = {
  kind: KesshoMidiMessageKind;
  channel?: number | null;
  number?: number | null;
  endpointUniqueID?: number | null;
  endpointName?: string | null;
};

export function midiControlNumberForMessage(message: KesshoMidiMessage): number | null {
  switch (message.kind) {
    case 'controlChange':
    case 'noteOn':
    case 'noteOff':
    case 'polyPressure':
    case 'programChange':
      return typeof message.data1 === 'number' ? message.data1 : null;
    default:
      return null;
  }
}

export function sourceFromMidiMessage(message: KesshoMidiMessage): KesshoMidiControlSource {
  return {
    kind: message.kind,
    channel: message.channel ?? null,
    number: midiControlNumberForMessage(message),
    endpointUniqueID: message.endpointUniqueID ?? null,
    endpointName: message.endpointName ?? null,
  };
}

export function sameMidiControlSource(left: KesshoMidiControlSource, right: KesshoMidiControlSource): boolean {
  return left.kind === right.kind &&
    (left.channel ?? null) === (right.channel ?? null) &&
    (left.number ?? null) === (right.number ?? null) &&
    (left.endpointUniqueID ?? null) === (right.endpointUniqueID ?? null);
}

export function normalizeMidiMessageValue(message: KesshoMidiMessage): number {
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
      const lsb = message.data1 ?? 0;
      const msb = message.data2 ?? 64;
      return clamp01((lsb + msb * 128) / 16383);
    }
    default:
      return clamp01((message.data2 ?? message.data1 ?? 0) / 127);
  }
}

export function applyMidiCurve(value: number, curve: KesshoMidiValueCurve): number {
  const clamped = clamp01(value);
  switch (curve) {
    case 'exponential':
      return clamped * clamped;
    case 'logarithmic':
      return Math.sqrt(clamped);
    case 'stepped':
      return Math.round(clamped * 16) / 16;
    case 'linear':
    default:
      return clamped;
  }
}

export function isMidiMessageKind(value: unknown): value is KesshoMidiMessageKind {
  return value === 'noteOn' ||
    value === 'noteOff' ||
    value === 'controlChange' ||
    value === 'programChange' ||
    value === 'pitchBend' ||
    value === 'channelPressure' ||
    value === 'polyPressure' ||
    value === 'systemExclusive' ||
    value === 'unknown';
}

export function formatMidiKind(kind: KesshoMidiMessageKind): string {
  switch (kind) {
    case 'noteOn':
      return 'Note On';
    case 'noteOff':
      return 'Note Off';
    case 'controlChange':
      return 'CC';
    case 'programChange':
      return 'Program';
    case 'pitchBend':
      return 'Pitch Bend';
    case 'channelPressure':
      return 'Pressure';
    case 'polyPressure':
      return 'Poly Pressure';
    case 'systemExclusive':
      return 'SysEx';
    default:
      return 'MIDI';
  }
}

export function formatMidiSourceLabel(source: KesshoMidiControlSource): string {
  const channel = typeof source.channel === 'number' ? ` Ch ${source.channel + 1}` : '';
  const number = typeof source.number === 'number' ? ` ${source.number}` : '';
  const endpoint = source.endpointName ? ` from ${source.endpointName}` : '';
  return `${formatMidiKind(source.kind)}${number}${channel}${endpoint}`;
}

export function formatMidiMessageLabel(message: KesshoMidiMessage | null): string {
  if (!message) return 'No MIDI message yet';
  const source = sourceFromMidiMessage(message);
  const value = normalizeMidiMessageValue(message);
  return `${formatMidiSourceLabel(source)} · ${Math.round(value * 127)}/127`;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function createMidiID(prefix = 'midi'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
