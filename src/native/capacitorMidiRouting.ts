import {
  DEFAULT_STATE,
  getParamInfo,
  getStateValueFromSliderNumber,
  quantize,
  type SliderState,
} from '../ui/state';

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
  manufacturer?: string;
  isConnected: boolean;
};

export type KesshoMidiMessage = {
  timestamp: number;
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
};

export type KesshoMidiBinding = {
  id: string;
  enabled: boolean;
  source: KesshoMidiControlSource;
  targetKey: keyof SliderState;
  targetLabel: string;
  minimumValue: number;
  maximumValue: number;
  curve: KesshoMidiValueCurve;
  createdAt: string;
  updatedAt: string;
};

export type KesshoMidiRoutingProfile = {
  version: 1;
  connectedInputIDs: number[];
  bindings: KesshoMidiBinding[];
};

type CapacitorListenerHandle = {
  remove: () => Promise<void> | void;
};

type KesshoMidiRoutingPlugin = {
  getStatus: () => Promise<KesshoMidiStatus>;
  start: () => Promise<KesshoMidiStatus>;
  stop: () => Promise<KesshoMidiStatus>;
  refreshInputs: () => Promise<KesshoMidiInputSnapshot>;
  connectInput: (options: { uniqueID: number }) => Promise<KesshoMidiInputSnapshot>;
  disconnectInput: (options: { uniqueID: number }) => Promise<KesshoMidiInputSnapshot>;
  disconnectAllInputs: () => Promise<KesshoMidiInputSnapshot>;
  setConnectedInputs: (options: { uniqueIDsJson: string }) => Promise<KesshoMidiInputSnapshot>;
  addListener(
    eventName: 'midiMessage',
    listener: (event: KesshoMidiMessage) => void,
  ): Promise<CapacitorListenerHandle>;
  addListener(
    eventName: 'inputsChanged',
    listener: (event: KesshoMidiInputSnapshot) => void,
  ): Promise<CapacitorListenerHandle>;
};

type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
};

export type KesshoMidiRouteTarget = {
  key: keyof SliderState;
  label: string;
};

const PLUGIN_NAME = 'KesshoMidiRouting';
const MIDI_ROUTING_PROFILE_KEY = 'kessho.capacitorMidiRouting.v1';

const DEFAULT_MIDI_ROUTE_TARGETS = [
  { key: 'masterVolume', label: 'Master Volume' },
  { key: 'tension', label: 'Global Tension' },
  { key: 'randomness', label: 'Randomness' },
  { key: 'synthLevel', label: 'Pad 1 Level' },
  { key: 'pad2Level', label: 'Pad 2 Level' },
  { key: 'lead1Level', label: 'Lead 1 Level' },
  { key: 'lead2Level', label: 'Lead 2 Level' },
  { key: 'pianoLevel', label: 'Piano Level' },
  { key: 'drumLevel', label: 'Drum Level' },
  { key: 'granularLevel', label: 'Granular Level' },
  { key: 'oceanSampleLevel', label: 'Waves Level' },
  { key: 'waterLevel', label: 'Water Level' },
  { key: 'reverbLevel', label: 'Reverb Level' },
  { key: 'pad1ReverbSend', label: 'Pad 1 Reverb' },
  { key: 'pad2ReverbSend', label: 'Pad 2 Reverb' },
  { key: 'lead1ReverbSend', label: 'Lead 1 Reverb' },
  { key: 'lead2ReverbSend', label: 'Lead 2 Reverb' },
  { key: 'pianoReverbSend', label: 'Piano Reverb' },
  { key: 'drumReverbSend', label: 'Drum Reverb' },
  { key: 'delayAMix', label: 'Delay A Mix' },
  { key: 'delayAFeedback', label: 'Delay A Feedback' },
  { key: 'delayAModDepth', label: 'Delay A Mod Depth' },
  { key: 'delayADuck', label: 'Delay A Duck' },
  { key: 'delayBWarpIntensity', label: 'Delay B Warp' },
  { key: 'sidechainAmount', label: 'Sidechain Amount' },
  { key: 'characterMix', label: 'Character Mix' },
  { key: 'characterBias', label: 'Character Bias' },
  { key: 'characterLpgAmount', label: 'Character LPG Open' },
  { key: 'degradeHp', label: 'Dynamics HP' },
  { key: 'degradeLp', label: 'Dynamics LP' },
  { key: 'degradeMix', label: 'Degrade Mix' },
  { key: 'masterSatDrive', label: 'Master Drive' },
] as const satisfies readonly KesshoMidiRouteTarget[];

function getCapacitorRuntime(): CapacitorRuntime | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Capacitor?: CapacitorRuntime }).Capacitor ?? null;
}

export function isCapacitorNativeShell(): boolean {
  const capacitor = getCapacitorRuntime();
  if (!capacitor) return false;
  if (typeof capacitor.isNativePlatform === 'function') {
    return capacitor.isNativePlatform();
  }
  const platform = capacitor.getPlatform?.();
  return platform === 'ios' || platform === 'android' || platform === 'macos';
}

export function getCapacitorMidiRoutingPlugin(): KesshoMidiRoutingPlugin | null {
  const capacitor = getCapacitorRuntime();
  const plugin = capacitor?.Plugins?.[PLUGIN_NAME];
  if (!plugin) return null;
  return plugin as KesshoMidiRoutingPlugin;
}

export function isCapacitorMidiRoutingAvailable(): boolean {
  return isCapacitorNativeShell() && !!getCapacitorMidiRoutingPlugin();
}

export async function getCapacitorMidiRoutingStatus(): Promise<KesshoMidiStatus | null> {
  const plugin = getCapacitorMidiRoutingPlugin();
  if (!plugin) return null;
  return plugin.getStatus();
}

export async function startCapacitorMidiRouting(): Promise<KesshoMidiStatus | null> {
  const plugin = getCapacitorMidiRoutingPlugin();
  if (!plugin) return null;
  return plugin.start();
}

export async function refreshCapacitorMidiInputs(): Promise<KesshoMidiInputSnapshot | null> {
  const plugin = getCapacitorMidiRoutingPlugin();
  if (!plugin) return null;
  return plugin.refreshInputs();
}

export async function connectCapacitorMidiInput(uniqueID: number): Promise<KesshoMidiInputSnapshot | null> {
  const plugin = getCapacitorMidiRoutingPlugin();
  if (!plugin) return null;
  return plugin.connectInput({ uniqueID });
}

export async function disconnectCapacitorMidiInput(uniqueID: number): Promise<KesshoMidiInputSnapshot | null> {
  const plugin = getCapacitorMidiRoutingPlugin();
  if (!plugin) return null;
  return plugin.disconnectInput({ uniqueID });
}

export async function setCapacitorMidiConnectedInputs(uniqueIDs: number[]): Promise<KesshoMidiInputSnapshot | null> {
  const plugin = getCapacitorMidiRoutingPlugin();
  if (!plugin) return null;
  return plugin.setConnectedInputs({ uniqueIDsJson: JSON.stringify(uniqueIDs) });
}

export async function disconnectAllCapacitorMidiInputs(): Promise<KesshoMidiInputSnapshot | null> {
  const plugin = getCapacitorMidiRoutingPlugin();
  if (!plugin) return null;
  return plugin.disconnectAllInputs();
}

export async function addCapacitorMidiMessageListener(
  listener: (message: KesshoMidiMessage) => void,
): Promise<(() => Promise<void>) | null> {
  const plugin = getCapacitorMidiRoutingPlugin();
  if (!plugin) return null;
  const handle = await plugin.addListener('midiMessage', listener);
  return async () => {
    await handle.remove();
  };
}

export async function addCapacitorMidiInputsChangedListener(
  listener: (snapshot: KesshoMidiInputSnapshot) => void,
): Promise<(() => Promise<void>) | null> {
  const plugin = getCapacitorMidiRoutingPlugin();
  if (!plugin) return null;
  const handle = await plugin.addListener('inputsChanged', listener);
  return async () => {
    await handle.remove();
  };
}

export function getAvailableMidiRouteTargets(): KesshoMidiRouteTarget[] {
  return DEFAULT_MIDI_ROUTE_TARGETS.filter((target) => getParamInfo(target.key) !== null);
}

export function getMidiRouteTargetLabel(key: keyof SliderState): string {
  return DEFAULT_MIDI_ROUTE_TARGETS.find((target) => target.key === key)?.label ?? String(key);
}

export function getMidiRouteTargetRange(key: keyof SliderState): { min: number; max: number } | null {
  const info = getParamInfo(key);
  if (!info) return null;
  return { min: info.min, max: info.max };
}

export function loadKesshoMidiRoutingProfile(): KesshoMidiRoutingProfile {
  if (typeof window === 'undefined') {
    return createEmptyMidiRoutingProfile();
  }

  try {
    const raw = window.localStorage.getItem(MIDI_ROUTING_PROFILE_KEY);
    if (!raw) return createEmptyMidiRoutingProfile();
    const parsed = JSON.parse(raw) as Partial<KesshoMidiRoutingProfile>;
    const connectedInputIDs = Array.isArray(parsed.connectedInputIDs)
      ? parsed.connectedInputIDs.filter((value): value is number => Number.isFinite(value))
      : [];
    const bindings = Array.isArray(parsed.bindings)
      ? parsed.bindings.map(parseMidiBinding).filter((binding): binding is KesshoMidiBinding => !!binding)
      : [];
    return {
      version: 1,
      connectedInputIDs,
      bindings,
    };
  } catch {
    return createEmptyMidiRoutingProfile();
  }
}

export function saveKesshoMidiRoutingProfile(profile: KesshoMidiRoutingProfile): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MIDI_ROUTING_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Routing should keep working even if persistence is unavailable.
  }
}

export function createMidiBindingFromMessage(
  message: KesshoMidiMessage,
  targetKey: keyof SliderState,
): KesshoMidiBinding | null {
  const range = getMidiRouteTargetRange(targetKey);
  if (!range) return null;
  const now = new Date().toISOString();
  return {
    id: createRouteID(),
    enabled: true,
    source: sourceFromMidiMessage(message),
    targetKey,
    targetLabel: getMidiRouteTargetLabel(targetKey),
    minimumValue: range.min,
    maximumValue: range.max,
    curve: 'linear',
    createdAt: now,
    updatedAt: now,
  };
}

export function routeMidiMessageToParameter(
  message: KesshoMidiMessage,
  binding: KesshoMidiBinding,
): { key: keyof SliderState; value: number } | null {
  if (!binding.enabled || !bindingMatchesMessage(binding, message)) return null;
  const range = getMidiRouteTargetRange(binding.targetKey);
  if (!range) return null;
  const normalized = applyMidiCurve(normalizeMidiMessageValue(message), binding.curve);
  const minimumValue = Number.isFinite(binding.minimumValue) ? binding.minimumValue : range.min;
  const maximumValue = Number.isFinite(binding.maximumValue) ? binding.maximumValue : range.max;
  const rawValue = minimumValue + normalized * (maximumValue - minimumValue);
  const stateValue = getStateValueFromSliderNumber(binding.targetKey, quantize(binding.targetKey, rawValue));
  if (typeof stateValue !== 'number') return null;
  return { key: binding.targetKey, value: stateValue };
}

export function sourceFromMidiMessage(message: KesshoMidiMessage): KesshoMidiControlSource {
  return {
    kind: message.kind,
    channel: message.channel ?? null,
    number: midiControlNumberForMessage(message),
    endpointUniqueID: message.endpointUniqueID ?? null,
  };
}

export function formatMidiSourceLabel(source: KesshoMidiControlSource): string {
  const channel = typeof source.channel === 'number' ? ` Ch ${source.channel + 1}` : '';
  const number = typeof source.number === 'number' ? ` #${source.number}` : '';
  return `${formatMidiKind(source.kind)}${channel}${number}`;
}

export function formatMidiMessageLabel(message: KesshoMidiMessage | null): string {
  if (!message) return 'No MIDI message yet';
  const source = sourceFromMidiMessage(message);
  const endpoint = message.endpointName ? ` - ${message.endpointName}` : '';
  const value = normalizeMidiMessageValue(message);
  return `${formatMidiSourceLabel(source)} - ${Math.round(value * 127)}/127${endpoint}`;
}

function createEmptyMidiRoutingProfile(): KesshoMidiRoutingProfile {
  return {
    version: 1,
    connectedInputIDs: [],
    bindings: [],
  };
}

function parseMidiBinding(value: unknown): KesshoMidiBinding | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<KesshoMidiBinding>;
  const targetKey = record.targetKey;
  if (typeof targetKey !== 'string') return null;
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_STATE, targetKey)) return null;
  const typedTargetKey = targetKey as keyof SliderState;
  const range = getMidiRouteTargetRange(typedTargetKey);
  if (!range) return null;
  const source = parseMidiSource(record.source);
  if (!source) return null;
  const now = new Date().toISOString();
  return {
    id: typeof record.id === 'string' && record.id ? record.id : createRouteID(),
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
    source,
    targetKey: typedTargetKey,
    targetLabel: typeof record.targetLabel === 'string' && record.targetLabel
      ? record.targetLabel
      : getMidiRouteTargetLabel(typedTargetKey),
    minimumValue: typeof record.minimumValue === 'number' && Number.isFinite(record.minimumValue)
      ? record.minimumValue
      : range.min,
    maximumValue: typeof record.maximumValue === 'number' && Number.isFinite(record.maximumValue)
      ? record.maximumValue
      : range.max,
    curve: parseMidiCurve(record.curve),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now,
  };
}

function parseMidiSource(value: unknown): KesshoMidiControlSource | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<KesshoMidiControlSource>;
  if (!isMidiMessageKind(record.kind)) return null;
  return {
    kind: record.kind,
    channel: typeof record.channel === 'number' && Number.isFinite(record.channel) ? record.channel : null,
    number: typeof record.number === 'number' && Number.isFinite(record.number) ? record.number : null,
    endpointUniqueID: typeof record.endpointUniqueID === 'number' && Number.isFinite(record.endpointUniqueID)
      ? record.endpointUniqueID
      : null,
  };
}

function bindingMatchesMessage(binding: KesshoMidiBinding, message: KesshoMidiMessage): boolean {
  const source = binding.source;
  const messageNumber = midiControlNumberForMessage(message);
  return source.kind === message.kind &&
    (source.channel == null || source.channel === message.channel) &&
    (source.number == null || source.number === messageNumber) &&
    (source.endpointUniqueID == null || source.endpointUniqueID === message.endpointUniqueID);
}

function midiControlNumberForMessage(message: KesshoMidiMessage): number | null {
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

function normalizeMidiMessageValue(message: KesshoMidiMessage): number {
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

function applyMidiCurve(value: number, curve: KesshoMidiValueCurve): number {
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

function parseMidiCurve(value: unknown): KesshoMidiValueCurve {
  return value === 'exponential' || value === 'logarithmic' || value === 'stepped' || value === 'linear'
    ? value
    : 'linear';
}

function isMidiMessageKind(value: unknown): value is KesshoMidiMessageKind {
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

function formatMidiKind(kind: KesshoMidiMessageKind): string {
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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function createRouteID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `midi-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
