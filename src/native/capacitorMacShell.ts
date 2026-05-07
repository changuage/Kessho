export type KesshoMacNativeOptimizations = {
  webViewShell: boolean;
  loopbackStaticServer: boolean;
  coreMidiRouting: boolean;
  appNapSuppressionWhilePlaying: boolean;
  idleSystemSleepPreventionWhilePlaying: boolean;
  assetMemoryCache: boolean;
};

export type KesshoMacShellStatus = {
  available: boolean;
  platform: 'macos';
  webRoot: string;
  isPlaybackActive: boolean;
  performanceActivityActive: boolean;
  nativeOptimizations: KesshoMacNativeOptimizations;
};

type KesshoMacShellPlugin = {
  getStatus: () => Promise<KesshoMacShellStatus>;
  setPlaybackState: (options: { isPlaying: boolean; title?: string }) => Promise<KesshoMacShellStatus>;
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

export async function setCapacitorMacPlaybackState(
  options: { isPlaying: boolean; title?: string },
): Promise<KesshoMacShellStatus | null> {
  const plugin = getMacShellPlugin();
  if (!plugin) return null;
  return plugin.setPlaybackState(options);
}
