import type {
  KesshoMidiInputSnapshot,
  KesshoMidiMessage,
  KesshoMidiStatus,
} from './midi/midiTypes';

export type {
  KesshoMidiEndpointInfo,
  KesshoMidiInputSnapshot,
  KesshoMidiMessage,
  KesshoMidiMessageKind,
  KesshoMidiStatus,
} from './midi/midiTypes';

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
    eventName: 'midiMessages',
    listener: (event: { messages: KesshoMidiMessage[] }) => void,
  ): Promise<CapacitorListenerHandle>;
  addListener(
    eventName: 'midiActivity',
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

const PLUGIN_NAME = 'KesshoMidiRouting';

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

export async function stopCapacitorMidiRouting(): Promise<KesshoMidiStatus | null> {
  const plugin = getCapacitorMidiRoutingPlugin();
  if (!plugin) return null;
  return plugin.stop();
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
  const [messageHandle, batchHandle] = await Promise.all([
    plugin.addListener('midiMessage', listener),
    plugin.addListener('midiMessages', ({ messages }) => messages.forEach(listener)),
  ]);
  return async () => {
    await Promise.all([messageHandle.remove(), batchHandle.remove()]);
  };
}

export async function addCapacitorMidiActivityListener(
  listener: (message: KesshoMidiMessage) => void,
): Promise<(() => Promise<void>) | null> {
  const plugin = getCapacitorMidiRoutingPlugin();
  if (!plugin) return null;
  const handle = await plugin.addListener('midiActivity', listener);
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
