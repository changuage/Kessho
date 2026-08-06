import { DEFAULT_STATE, type SliderState } from '../ui/state';

export type NativeDualRange = {
  min: number;
  max: number;
};

export type KesshoRemoteCommand = 'play' | 'pause' | 'togglePlayPause';

export type KesshoAudioSessionEventPayload = {
  type: 'routeChange' | 'interruption' | 'mediaServicesReset';
  reason?: string;
  interruptionType?: string;
  routeChangeCount?: number;
  interruptionBeginCount?: number;
  interruptionEndCount?: number;
  mediaServicesResetCount?: number;
};

export type KesshoNowPlayingPayload = {
  title: string;
  artist?: string;
  album?: string;
  isLiveStream?: boolean;
  isPlaying?: boolean;
  elapsedTime?: number;
};

export type KesshoAudioSessionStatePayload = {
  state: SliderState;
  dualRanges?: Record<string, NativeDualRange>;
};

type NativeStateRecord = Record<string, unknown>;

type CapacitorListenerHandle = {
  remove: () => Promise<void> | void;
};

type KesshoAudioSessionStatus = {
  available: boolean;
  mode: 'capacitor-platform-session';
  isPlaying: boolean;
  supportsBackgroundAudio: boolean;
  nativeProductRendererPrepared?: boolean;
  nativeProductRendererRunning?: boolean;
  nativeProductRendererStartCount?: number;
  nativeProductRendererStopCount?: number;
  nativeProductRendererProbePeak?: number;
  nativeProductRendererProbeRms?: number;
  nativeProductRendererProbeRenderedFrames?: number;
  lastNativeProductRendererError?: string;
  routeChangeCount?: number;
  interruptionBeginCount?: number;
  interruptionEndCount?: number;
  mediaServicesResetCount?: number;
  lastRouteChangeReason?: string;
  lastInterruptionType?: string;
  iosAudioSession?: KesshoIOSAudioSessionTelemetry;
};

export type KesshoIOSAudioSessionTelemetry = {
  preferredSampleRate?: number;
  preferredBufferDurationMs?: number;
  actualSampleRate?: number;
  actualBufferDurationMs?: number;
  actualBufferSizeFrames?: number;
  routeSummary?: string;
  silentSwitchPolicy?: string;
  foregroundCount?: number;
  backgroundCount?: number;
  protectedDataUnavailableCount?: number;
  protectedDataAvailableCount?: number;
  lastAppLifecycleEvent?: string;
  routeChangeCount?: number;
  interruptionBeginCount?: number;
  interruptionEndCount?: number;
  mediaServicesResetCount?: number;
  lastRouteChangeReason?: string;
  lastInterruptionType?: string;
  nativeRendererPrep?: Record<string, unknown>;
  lastNativeProductRendererError?: string;
};

export type KesshoNativeProductRendererProbeStatus = {
  nativeProductRendererPrepared: boolean;
  nativeProductRendererRunning: boolean;
  nativeProductRendererProbePeak: number;
  nativeProductRendererProbeRms: number;
  nativeProductRendererProbeRenderedFrames: number;
  nativeProductRendererProbeSampleRate: number;
};

export type KesshoNativeProductRendererStartStatus = {
  nativeProductRendererPrepared: boolean;
  nativeProductRendererRunning: boolean;
  nativeProductRendererStartCount: number;
};

export type KesshoNativeProductRendererStopStatus = {
  nativeProductRendererRunning: boolean;
  nativeProductRendererStopCount: number;
};

type KesshoAudioSessionPlugin = {
  getStatus: () => Promise<KesshoAudioSessionStatus>;
  syncState: (options: { stateJson: string; dualRangesJson?: string }) => Promise<void>;
  startPlayback: (options: { stateJson: string; dualRangesJson?: string; title?: string; artist?: string; album?: string }) => Promise<void>;
  stopPlayback: () => Promise<void>;
  startNativeRendererForDiagnostics?: () => Promise<KesshoNativeProductRendererStartStatus>;
  stopNativeRendererForDiagnostics?: () => Promise<KesshoNativeProductRendererStopStatus>;
  probeNativeRendererForDiagnostics?: () => Promise<KesshoNativeProductRendererProbeStatus>;
  getIOSAudioSessionTelemetry?: () => Promise<KesshoIOSAudioSessionTelemetry>;
  setNowPlaying: (options: KesshoNowPlayingPayload) => Promise<void>;
  setPlaybackState: (options: { isPlaying: boolean }) => Promise<void>;
  addListener: {
    (
      eventName: 'remoteCommand',
      listener: (event: { command: KesshoRemoteCommand }) => void,
    ): Promise<CapacitorListenerHandle>;
    (
      eventName: 'audioSessionEvent',
      listener: (event: KesshoAudioSessionEventPayload) => void,
    ): Promise<CapacitorListenerHandle>;
  };
};

type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
};

declare global {
  interface Window {
    Capacitor?: CapacitorRuntime;
  }
}

const PLUGIN_NAME = 'KesshoAudioSession';
const CAPACITOR_AUDIO_SESSION_DIAGNOSTICS_STORAGE_KEY = 'kessho.capacitorAudioSessionDiagnostics';
const CAPACITOR_NATIVE_PRODUCT_DIAGNOSTICS_STORAGE_KEY = 'kessho.nativeProductRendererDiagnostics';
const CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS = {
  oscBrightness: 2,
  filterModSpeed: 2.0,
  airNoise: 0.15,
  drumRandomMorphUpdate: false,
  drumRandomEnabled: false,
  drumRandomDensity: 0.3,
  drumRandomSubProb: 0.1,
  drumRandomKickProb: 0.15,
  drumRandomClickProb: 0.4,
  drumRandomBeepHiProb: 0.2,
  drumRandomBeepLoProb: 0.15,
  drumRandomNoiseProb: 0.25,
  drumRandomMinInterval: 80,
  drumRandomMaxInterval: 400,
  oceanWaveSynthEnabled: false,
  oceanWaveSynthLevel: 0.4,
  oceanDurationMin: 4,
  oceanDurationMax: 10,
  oceanIntervalMin: 5,
  oceanIntervalMax: 12,
  oceanFoamMin: 0.2,
  oceanFoamMax: 0.5,
  oceanDepthMin: 0.3,
  oceanDepthMax: 0.7,
} as const;

function asRecord(state: SliderState): NativeStateRecord {
  return state as unknown as NativeStateRecord;
}

function readNumber(record: NativeStateRecord, key: string, fallback: number): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(record: NativeStateRecord, key: string, fallback: boolean): boolean {
  const value = record[key];
  return typeof value === 'boolean' ? value : fallback;
}

function buildCapacitorAudioSessionState(state: SliderState): NativeStateRecord {
  const record = asRecord(state);
  const leadLevel = readNumber(record, 'leadLevel', state.lead1Level ?? 0);
  const leadReverbSend = readNumber(record, 'leadReverbSend', readNumber(record, 'lead1ReverbSend', 0.5));
  const leadDelayTime = readNumber(record, 'leadDelayTime', state.delayATime ?? 375);
  const leadDelayFeedback = readNumber(record, 'leadDelayFeedback', state.delayAFeedback ?? 0.4);
  const leadDelayMix = readNumber(record, 'leadDelayMix', state.delayAMix ?? 0.35);
  const grainSize = state.grainSize ?? 50;
  const filterCutoff = readNumber(record, 'filterCutoff', state.filterCutoff);
  const brightness = readNumber(record, 'brightness', state.presence ?? 0.3);
  const waterSurfDuration = readNumber(record, 'waterSurfDuration', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.oceanDurationMin);
  const waterSurfInterval = readNumber(record, 'waterSurfInterval', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.oceanIntervalMin);
  const waterSurfFoam = readNumber(record, 'waterSurfFoam', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.oceanFoamMin);
  const waterSurfDepth = readNumber(record, 'waterSurfDepth', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.oceanDepthMin);
  const waterLevel = readNumber(record, 'waterLevel', 0.8);

  return {
    ...DEFAULT_STATE,
    ...record,
    leadLevel,
    leadReverbSend,
    synthReverbSend: readNumber(record, 'synthReverbSend', state.pad1ReverbSend),
    leadDelayReverbSend: readNumber(record, 'leadDelayReverbSend', state.delayAReverbSend),
    oscBrightness: readNumber(record, 'oscBrightness', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.oscBrightness),
    filterModSpeed: readNumber(record, 'filterModSpeed', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.filterModSpeed),
    airNoise: readNumber(record, 'airNoise', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.airNoise),
    grainSizeMin: readNumber(record, 'grainSizeMin', grainSize),
    grainSizeMax: readNumber(record, 'grainSizeMax', grainSize),
    leadAttack: readNumber(record, 'leadAttack', state.lead1Attack),
    leadDecay: readNumber(record, 'leadDecay', state.lead1Decay),
    leadSustain: readNumber(record, 'leadSustain', state.lead1Sustain),
    leadHold: readNumber(record, 'leadHold', state.lead1Hold),
    leadRelease: readNumber(record, 'leadRelease', state.lead1Release),
    leadDelayTimeMin: readNumber(record, 'leadDelayTimeMin', leadDelayTime),
    leadDelayTimeMax: readNumber(record, 'leadDelayTimeMax', leadDelayTime),
    leadDelayFeedbackMin: readNumber(record, 'leadDelayFeedbackMin', leadDelayFeedback),
    leadDelayFeedbackMax: readNumber(record, 'leadDelayFeedbackMax', leadDelayFeedback),
    leadDelayMixMin: readNumber(record, 'leadDelayMixMin', leadDelayMix),
    leadDelayMixMax: readNumber(record, 'leadDelayMixMax', leadDelayMix),
    leadDensity: readNumber(record, 'leadDensity', state.lead1Density),
    leadOctave: readNumber(record, 'leadOctave', state.lead1Octave),
    leadOctaveRange: readNumber(record, 'leadOctaveRange', state.lead1OctaveRange),
    leadTimbreMin: readNumber(record, 'leadTimbreMin', state.leadTimbre),
    leadTimbreMax: readNumber(record, 'leadTimbreMax', state.leadTimbre),
    leadVibratoDepthMin: readNumber(record, 'leadVibratoDepthMin', state.lead1VibratoDepth),
    leadVibratoDepthMax: readNumber(record, 'leadVibratoDepthMax', state.lead1VibratoDepth),
    leadVibratoRateMin: readNumber(record, 'leadVibratoRateMin', state.lead1VibratoRate),
    leadVibratoRateMax: readNumber(record, 'leadVibratoRateMax', state.lead1VibratoRate),
    leadGlideMin: readNumber(record, 'leadGlideMin', state.lead1Glide),
    leadGlideMax: readNumber(record, 'leadGlideMax', state.lead1Glide),
    drumRandomMorphUpdate: readBoolean(record, 'drumRandomMorphUpdate', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.drumRandomMorphUpdate),
    drumRandomEnabled: readBoolean(record, 'drumRandomEnabled', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.drumRandomEnabled),
    drumRandomDensity: readNumber(record, 'drumRandomDensity', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.drumRandomDensity),
    drumRandomSubProb: readNumber(record, 'drumRandomSubProb', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.drumRandomSubProb),
    drumRandomKickProb: readNumber(record, 'drumRandomKickProb', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.drumRandomKickProb),
    drumRandomClickProb: readNumber(record, 'drumRandomClickProb', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.drumRandomClickProb),
    drumRandomBeepHiProb: readNumber(record, 'drumRandomBeepHiProb', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.drumRandomBeepHiProb),
    drumRandomBeepLoProb: readNumber(record, 'drumRandomBeepLoProb', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.drumRandomBeepLoProb),
    drumRandomNoiseProb: readNumber(record, 'drumRandomNoiseProb', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.drumRandomNoiseProb),
    drumRandomMinInterval: readNumber(record, 'drumRandomMinInterval', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.drumRandomMinInterval),
    drumRandomMaxInterval: readNumber(record, 'drumRandomMaxInterval', CAPACITOR_AUDIO_SESSION_STATE_DEFAULTS.drumRandomMaxInterval),
    oceanWaveSynthEnabled: readBoolean(record, 'oceanWaveSynthEnabled', state.waterEnabled),
    oceanWaveSynthLevel: readNumber(record, 'oceanWaveSynthLevel', waterLevel),
    oceanDurationMin: readNumber(record, 'oceanDurationMin', waterSurfDuration),
    oceanDurationMax: readNumber(record, 'oceanDurationMax', waterSurfDuration),
    oceanIntervalMin: readNumber(record, 'oceanIntervalMin', waterSurfInterval),
    oceanIntervalMax: readNumber(record, 'oceanIntervalMax', waterSurfInterval),
    oceanFoamMin: readNumber(record, 'oceanFoamMin', waterSurfFoam),
    oceanFoamMax: readNumber(record, 'oceanFoamMax', waterSurfFoam),
    oceanDepthMin: readNumber(record, 'oceanDepthMin', waterSurfDepth),
    oceanDepthMax: readNumber(record, 'oceanDepthMax', waterSurfDepth),
    oceanMix: readNumber(record, 'oceanMix', waterLevel),
    oceanWave2OffsetMin: readNumber(record, 'oceanWave2OffsetMin', 0),
    oceanWave2OffsetMax: readNumber(record, 'oceanWave2OffsetMax', 0),
    filterCutoff,
    brightness,
    reverbMix: readNumber(record, 'reverbMix', state.reverbLevel),
    leadDelayTime,
    leadDelayFeedback,
    leadDelayMix,
  };
}

function getCapacitorRuntime(): CapacitorRuntime | null {
  if (typeof window === 'undefined') return null;
  return window.Capacitor ?? null;
}

export function getCapacitorPlatform(): string | null {
  return getCapacitorRuntime()?.getPlatform?.() ?? null;
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

export function getCapacitorAudioSessionPlugin(): KesshoAudioSessionPlugin | null {
  const capacitor = getCapacitorRuntime();
  const plugin = capacitor?.Plugins?.[PLUGIN_NAME];
  if (!plugin) return null;
  return plugin as KesshoAudioSessionPlugin;
}

export function isCapacitorAudioSessionAvailable(): boolean {
  return isCapacitorNativeShell() && !!getCapacitorAudioSessionPlugin();
}

export function shouldUseCapacitorAudioSessionDiagnostics(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isCapacitorNativeShell()) return false;
  if (!isCapacitorAudioSessionAvailable()) return false;
  const params = new URLSearchParams(window.location.search);
  const queryMode = params.get('audioSession');
  const legacyMode = params.get('nativeAudio');
  if (queryMode === 'debug' || queryMode === 'on' || legacyMode === 'capacitor') {
    try {
      window.localStorage.setItem(CAPACITOR_AUDIO_SESSION_DIAGNOSTICS_STORAGE_KEY, 'debug');
    } catch {
      // Ignore storage failures and keep using runtime detection.
    }
    return true;
  }
  if (queryMode === 'off' || legacyMode === 'web' || legacyMode === 'off') {
    try {
      window.localStorage.setItem(CAPACITOR_AUDIO_SESSION_DIAGNOSTICS_STORAGE_KEY, 'off');
    } catch {
      // Ignore storage failures and keep using runtime detection.
    }
    return false;
  }
  try {
    const storedMode = window.localStorage.getItem(CAPACITOR_AUDIO_SESSION_DIAGNOSTICS_STORAGE_KEY);
    if (storedMode === 'debug' || storedMode === 'on') return true;
    if (storedMode === 'off') return false;
  } catch {
    // Ignore storage failures and keep runtime detection as the default.
  }
  return false;
}

export function shouldUseNativeProductRendererDiagnostics(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isCapacitorNativeShell()) return false;
  if (!isCapacitorAudioSessionAvailable()) return false;
  const params = new URLSearchParams(window.location.search);
  const nativeProductMode = params.get('nativeProduct');
  if (nativeProductMode === 'diagnostic' || nativeProductMode === 'on') {
    try {
      window.localStorage.setItem(CAPACITOR_NATIVE_PRODUCT_DIAGNOSTICS_STORAGE_KEY, 'diagnostic');
    } catch {
      // Ignore storage failures and keep using runtime detection.
    }
    return true;
  }
  if (nativeProductMode === 'off') {
    try {
      window.localStorage.setItem(CAPACITOR_NATIVE_PRODUCT_DIAGNOSTICS_STORAGE_KEY, 'off');
    } catch {
      // Ignore storage failures and keep using runtime detection.
    }
    return false;
  }
  try {
    const storedMode = window.localStorage.getItem(CAPACITOR_NATIVE_PRODUCT_DIAGNOSTICS_STORAGE_KEY);
    if (storedMode === 'diagnostic' || storedMode === 'on') return true;
    if (storedMode === 'off') return false;
  } catch {
    // Ignore storage failures and keep runtime detection as the default.
  }
  return false;
}

export async function getCapacitorAudioSessionStatus(): Promise<KesshoAudioSessionStatus | null> {
  const plugin = getCapacitorAudioSessionPlugin();
  if (!plugin) return null;
  return plugin.getStatus();
}

export async function probeNativeProductRendererForDiagnostics(): Promise<KesshoNativeProductRendererProbeStatus | null> {
  const plugin = getCapacitorAudioSessionPlugin();
  if (!plugin?.probeNativeRendererForDiagnostics) return null;
  return plugin.probeNativeRendererForDiagnostics();
}

export async function getIOSAudioSessionTelemetry(): Promise<KesshoIOSAudioSessionTelemetry | null> {
  const plugin = getCapacitorAudioSessionPlugin();
  if (!plugin?.getIOSAudioSessionTelemetry) return null;
  return plugin.getIOSAudioSessionTelemetry();
}

export async function syncCapacitorAudioSessionState(payload: KesshoAudioSessionStatePayload): Promise<void> {
  const plugin = getCapacitorAudioSessionPlugin();
  if (!plugin) return;
  await plugin.syncState({
    stateJson: JSON.stringify(buildCapacitorAudioSessionState(payload.state)),
    dualRangesJson: payload.dualRanges ? JSON.stringify(payload.dualRanges) : undefined,
  });
}

export async function startCapacitorAudioSessionPlayback(
  payload: KesshoAudioSessionStatePayload,
  nowPlaying?: KesshoNowPlayingPayload,
): Promise<void> {
  const plugin = getCapacitorAudioSessionPlugin();
  if (!plugin) return;
  await plugin.startPlayback({
    stateJson: JSON.stringify(buildCapacitorAudioSessionState(payload.state)),
    dualRangesJson: payload.dualRanges ? JSON.stringify(payload.dualRanges) : undefined,
    title: nowPlaying?.title,
    artist: nowPlaying?.artist,
    album: nowPlaying?.album,
  });
  if (shouldUseNativeProductRendererDiagnostics()) {
    await plugin.startNativeRendererForDiagnostics?.();
  }
}

export async function stopCapacitorAudioSessionPlayback(): Promise<void> {
  const plugin = getCapacitorAudioSessionPlugin();
  if (!plugin) return;
  await plugin.stopNativeRendererForDiagnostics?.();
  await plugin.stopPlayback();
}

export async function setCapacitorAudioSessionNowPlaying(payload: KesshoNowPlayingPayload): Promise<void> {
  const plugin = getCapacitorAudioSessionPlugin();
  if (!plugin) return;
  await plugin.setNowPlaying(payload);
}

export async function setCapacitorAudioSessionPlaybackState(isPlaying: boolean): Promise<void> {
  const plugin = getCapacitorAudioSessionPlugin();
  if (!plugin) return;
  await plugin.setPlaybackState({ isPlaying });
}

export async function addCapacitorAudioSessionRemoteCommandListener(
  listener: (command: KesshoRemoteCommand) => void,
): Promise<(() => Promise<void>) | null> {
  const plugin = getCapacitorAudioSessionPlugin();
  if (!plugin) return null;
  const handle = await plugin.addListener('remoteCommand', (event) => {
    listener(event.command);
  });
  return async () => {
    await handle.remove();
  };
}

export async function addCapacitorAudioSessionEventListener(
  listener: (event: KesshoAudioSessionEventPayload) => void,
): Promise<(() => Promise<void>) | null> {
  const plugin = getCapacitorAudioSessionPlugin();
  if (!plugin) return null;
  const handle = await plugin.addListener('audioSessionEvent', listener);
  return async () => {
    await handle.remove();
  };
}
