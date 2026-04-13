import { DEFAULT_STATE, type SliderState } from '../ui/state';

export type NativeDualRange = {
  min: number;
  max: number;
};

export type KesshoRemoteCommand = 'play' | 'pause' | 'togglePlayPause';

export type KesshoNowPlayingPayload = {
  title: string;
  artist?: string;
  album?: string;
  isLiveStream?: boolean;
  isPlaying?: boolean;
  elapsedTime?: number;
};

export type KesshoNativeStatePayload = {
  state: SliderState;
  dualRanges?: Record<string, NativeDualRange>;
};

type NativeStateRecord = Record<string, unknown>;

type CapacitorListenerHandle = {
  remove: () => Promise<void> | void;
};

type KesshoBackgroundAudioStatus = {
  available: boolean;
  mode: 'native-engine-controller';
  isPlaying: boolean;
  supportsBackgroundAudio: boolean;
};

type KesshoBackgroundAudioPlugin = {
  getStatus: () => Promise<KesshoBackgroundAudioStatus>;
  syncState: (options: { stateJson: string; dualRangesJson?: string }) => Promise<void>;
  startPlayback: (options: { stateJson: string; dualRangesJson?: string; title?: string; artist?: string; album?: string }) => Promise<void>;
  stopPlayback: () => Promise<void>;
  setNowPlaying: (options: KesshoNowPlayingPayload) => Promise<void>;
  setPlaybackState: (options: { isPlaying: boolean }) => Promise<void>;
  addListener: (
    eventName: 'remoteCommand',
    listener: (event: { command: KesshoRemoteCommand }) => void,
  ) => Promise<CapacitorListenerHandle>;
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

const PLUGIN_NAME = 'KesshoBackgroundAudio';
const NATIVE_AUDIO_MODE_STORAGE_KEY = 'kessho.nativeAudioMode';
const NATIVE_AUDIO_DEFAULTS = {
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

function average(a: number, b: number): number {
  return (a + b) / 2;
}

function buildCapacitorNativeState(state: SliderState): NativeStateRecord {
  const record = asRecord(state);
  const leadLevel = readNumber(record, 'leadLevel', state.lead1Level ?? 0);
  const leadReverbSend = readNumber(record, 'leadReverbSend', readNumber(record, 'lead1ReverbSend', 0.5));
  const leadDelayTime = readNumber(record, 'leadDelayTime', state.delayATime ?? 375);
  const leadDelayFeedback = readNumber(record, 'leadDelayFeedback', state.delayAFeedback ?? 0.4);
  const leadDelayMix = readNumber(record, 'leadDelayMix', state.delayAMix ?? 0.35);
  const grainSize = state.grainSize ?? 50;
  const filterCutoff = readNumber(record, 'filterCutoff', average(state.filterCutoffMin, state.filterCutoffMax));
  const brightness = readNumber(record, 'brightness', state.presence ?? 0.3);
  const waterSurfDuration = readNumber(record, 'waterSurfDuration', NATIVE_AUDIO_DEFAULTS.oceanDurationMin);
  const waterSurfInterval = readNumber(record, 'waterSurfInterval', NATIVE_AUDIO_DEFAULTS.oceanIntervalMin);
  const waterSurfFoam = readNumber(record, 'waterSurfFoam', NATIVE_AUDIO_DEFAULTS.oceanFoamMin);
  const waterSurfDepth = readNumber(record, 'waterSurfDepth', NATIVE_AUDIO_DEFAULTS.oceanDepthMin);
  const waterLevel = readNumber(record, 'waterLevel', 0.8);

  return {
    ...DEFAULT_STATE,
    ...record,
    leadLevel,
    leadReverbSend,
    synthReverbSend: readNumber(record, 'synthReverbSend', state.pad1ReverbSend),
    leadDelayReverbSend: readNumber(record, 'leadDelayReverbSend', state.delayAReverbSend),
    oscBrightness: readNumber(record, 'oscBrightness', NATIVE_AUDIO_DEFAULTS.oscBrightness),
    filterModSpeed: readNumber(record, 'filterModSpeed', NATIVE_AUDIO_DEFAULTS.filterModSpeed),
    airNoise: readNumber(record, 'airNoise', NATIVE_AUDIO_DEFAULTS.airNoise),
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
    leadVibratoDepthMin: readNumber(record, 'leadVibratoDepthMin', state.leadVibratoDepth),
    leadVibratoDepthMax: readNumber(record, 'leadVibratoDepthMax', state.leadVibratoDepth),
    leadVibratoRateMin: readNumber(record, 'leadVibratoRateMin', state.leadVibratoRate),
    leadVibratoRateMax: readNumber(record, 'leadVibratoRateMax', state.leadVibratoRate),
    leadGlideMin: readNumber(record, 'leadGlideMin', state.leadGlide),
    leadGlideMax: readNumber(record, 'leadGlideMax', state.leadGlide),
    drumRandomMorphUpdate: readBoolean(record, 'drumRandomMorphUpdate', NATIVE_AUDIO_DEFAULTS.drumRandomMorphUpdate),
    drumRandomEnabled: readBoolean(record, 'drumRandomEnabled', NATIVE_AUDIO_DEFAULTS.drumRandomEnabled),
    drumRandomDensity: readNumber(record, 'drumRandomDensity', NATIVE_AUDIO_DEFAULTS.drumRandomDensity),
    drumRandomSubProb: readNumber(record, 'drumRandomSubProb', NATIVE_AUDIO_DEFAULTS.drumRandomSubProb),
    drumRandomKickProb: readNumber(record, 'drumRandomKickProb', NATIVE_AUDIO_DEFAULTS.drumRandomKickProb),
    drumRandomClickProb: readNumber(record, 'drumRandomClickProb', NATIVE_AUDIO_DEFAULTS.drumRandomClickProb),
    drumRandomBeepHiProb: readNumber(record, 'drumRandomBeepHiProb', NATIVE_AUDIO_DEFAULTS.drumRandomBeepHiProb),
    drumRandomBeepLoProb: readNumber(record, 'drumRandomBeepLoProb', NATIVE_AUDIO_DEFAULTS.drumRandomBeepLoProb),
    drumRandomNoiseProb: readNumber(record, 'drumRandomNoiseProb', NATIVE_AUDIO_DEFAULTS.drumRandomNoiseProb),
    drumRandomMinInterval: readNumber(record, 'drumRandomMinInterval', NATIVE_AUDIO_DEFAULTS.drumRandomMinInterval),
    drumRandomMaxInterval: readNumber(record, 'drumRandomMaxInterval', NATIVE_AUDIO_DEFAULTS.drumRandomMaxInterval),
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

export function isCapacitorNativeShell(): boolean {
  const capacitor = getCapacitorRuntime();
  if (!capacitor) return false;
  if (typeof capacitor.isNativePlatform === 'function') {
    return capacitor.isNativePlatform();
  }
  const platform = capacitor.getPlatform?.();
  return platform === 'ios' || platform === 'android';
}

export function getCapacitorBackgroundAudioPlugin(): KesshoBackgroundAudioPlugin | null {
  const capacitor = getCapacitorRuntime();
  const plugin = capacitor?.Plugins?.[PLUGIN_NAME];
  if (!plugin) return null;
  return plugin as KesshoBackgroundAudioPlugin;
}

export function isCapacitorBackgroundAudioAvailable(): boolean {
  return isCapacitorNativeShell() && !!getCapacitorBackgroundAudioPlugin();
}

export function shouldUseCapacitorNativeAudioSpike(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isCapacitorNativeShell()) return false;
  const params = new URLSearchParams(window.location.search);
  const queryMode = params.get('nativeAudio');
  if (queryMode === 'capacitor') {
    try {
      window.localStorage.setItem(NATIVE_AUDIO_MODE_STORAGE_KEY, 'capacitor');
    } catch {
      // Ignore storage failures and keep using runtime detection.
    }
    return true;
  }
  if (queryMode === 'web' || queryMode === 'off') {
    try {
      window.localStorage.setItem(NATIVE_AUDIO_MODE_STORAGE_KEY, 'web');
    } catch {
      // Ignore storage failures and keep using runtime detection.
    }
    return false;
  }
  try {
    const storedMode = window.localStorage.getItem(NATIVE_AUDIO_MODE_STORAGE_KEY);
    if (storedMode === 'capacitor') return true;
    if (storedMode === 'web' || storedMode === 'off') return false;
  } catch {
    // Ignore storage failures and fall back to plugin availability.
  }
  return isCapacitorBackgroundAudioAvailable();
}

export async function getCapacitorBackgroundAudioStatus(): Promise<KesshoBackgroundAudioStatus | null> {
  const plugin = getCapacitorBackgroundAudioPlugin();
  if (!plugin) return null;
  return plugin.getStatus();
}

export async function syncCapacitorNativeAudioState(payload: KesshoNativeStatePayload): Promise<void> {
  const plugin = getCapacitorBackgroundAudioPlugin();
  if (!plugin) return;
  await plugin.syncState({
    stateJson: JSON.stringify(buildCapacitorNativeState(payload.state)),
    dualRangesJson: payload.dualRanges ? JSON.stringify(payload.dualRanges) : undefined,
  });
}

export async function startCapacitorNativePlayback(
  payload: KesshoNativeStatePayload,
  nowPlaying?: KesshoNowPlayingPayload,
): Promise<void> {
  const plugin = getCapacitorBackgroundAudioPlugin();
  if (!plugin) return;
  await plugin.startPlayback({
    stateJson: JSON.stringify(buildCapacitorNativeState(payload.state)),
    dualRangesJson: payload.dualRanges ? JSON.stringify(payload.dualRanges) : undefined,
    title: nowPlaying?.title,
    artist: nowPlaying?.artist,
    album: nowPlaying?.album,
  });
}

export async function stopCapacitorNativePlayback(): Promise<void> {
  const plugin = getCapacitorBackgroundAudioPlugin();
  if (!plugin) return;
  await plugin.stopPlayback();
}

export async function setCapacitorNowPlaying(payload: KesshoNowPlayingPayload): Promise<void> {
  const plugin = getCapacitorBackgroundAudioPlugin();
  if (!plugin) return;
  await plugin.setNowPlaying(payload);
}

export async function setCapacitorPlaybackState(isPlaying: boolean): Promise<void> {
  const plugin = getCapacitorBackgroundAudioPlugin();
  if (!plugin) return;
  await plugin.setPlaybackState({ isPlaying });
}

export async function addCapacitorRemoteCommandListener(
  listener: (command: KesshoRemoteCommand) => void,
): Promise<(() => Promise<void>) | null> {
  const plugin = getCapacitorBackgroundAudioPlugin();
  if (!plugin) return null;
  const handle = await plugin.addListener('remoteCommand', (event) => {
    listener(event.command);
  });
  return async () => {
    await handle.remove();
  };
}
