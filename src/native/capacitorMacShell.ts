export type KesshoMacNativeOptimizations = {
  webViewShell: boolean;
  loopbackStaticServer: boolean;
  coreMidiRouting: boolean;
  appNapSuppressionWhilePlaying: boolean;
  idleSystemSleepPreventionWhilePlaying: boolean;
  assetMemoryCache: boolean;
  coreAudioOutputDiagnostics?: boolean;
};

export type KesshoMacAudioOutputStatus = {
  available: boolean;
  deviceID: number;
  outputName: string;
  transportType: string;
  transportCode: number;
  isAirPlay: boolean;
  sampleRate: number | null;
  bufferFrameSize: number | null;
};

export type KesshoMacShellStatus = {
  available: boolean;
  platform: 'macos';
  webRoot: string;
  isPlaybackActive: boolean;
  performanceActivityActive: boolean;
  nativeOptimizations: KesshoMacNativeOptimizations;
  audioOutput?: KesshoMacAudioOutputStatus;
};

type CapacitorListenerHandle = {
  remove: () => Promise<void> | void;
};

type KesshoMacShellPlugin = {
  getStatus: () => Promise<KesshoMacShellStatus>;
  getAudioOutputStatus: () => Promise<KesshoMacAudioOutputStatus>;
  openSoundSettings: () => Promise<{ opened: boolean }>;
  setPlaybackState: (options: { isPlaying: boolean; title?: string }) => Promise<KesshoMacShellStatus>;
  addListener: (
    eventName: 'audioOutputChanged',
    listener: (status: KesshoMacAudioOutputStatus) => void,
  ) => Promise<CapacitorListenerHandle>;
};

type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
};

function getCapacitorRuntime(): CapacitorRuntime | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { Capacitor?: CapacitorRuntime }).Capacitor ?? null;
}

export function isCapacitorMacShell(): boolean {
  return getCapacitorRuntime()?.getPlatform?.() === 'macos';
}

function getMacShellPlugin(): KesshoMacShellPlugin | null {
  if (!isCapacitorMacShell()) return null;
  const plugin = getCapacitorRuntime()?.Plugins?.KesshoMacShell;
  if (!plugin) return null;
  return plugin as KesshoMacShellPlugin;
}

export async function getCapacitorMacShellStatus(): Promise<KesshoMacShellStatus | null> {
  const plugin = getMacShellPlugin();
  if (!plugin) return null;
  return plugin.getStatus();
}

export async function getCapacitorMacAudioOutputStatus(): Promise<KesshoMacAudioOutputStatus | null> {
  const plugin = getMacShellPlugin();
  if (!plugin?.getAudioOutputStatus) return null;
  return plugin.getAudioOutputStatus();
}

export async function addCapacitorMacAudioOutputChangedListener(
  listener: (status: KesshoMacAudioOutputStatus) => void,
): Promise<(() => Promise<void>) | null> {
  const plugin = getMacShellPlugin();
  if (!plugin?.addListener) return null;
  const handle = await plugin.addListener('audioOutputChanged', listener);
  return async () => { await handle.remove(); };
}

export async function openCapacitorMacSoundSettings(): Promise<boolean> {
  const plugin = getMacShellPlugin();
  if (!plugin?.openSoundSettings) return false;
  const result = await plugin.openSoundSettings();
  return result.opened;
}

export async function setCapacitorMacPlaybackState(
  options: { isPlaying: boolean; title?: string },
): Promise<KesshoMacShellStatus | null> {
  const plugin = getMacShellPlugin();
  if (!plugin) return null;
  return plugin.setPlaybackState(options);
}
