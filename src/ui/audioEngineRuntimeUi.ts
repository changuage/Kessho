import {
  AUDIO_ENGINE_PARAM,
  AUDIO_ENGINE_SWITCHER_PARAM,
  getAudioEngineRuntimeModes,
  type AudioEngineRuntimeMode,
} from '../audio/product/ProductAudioRuntimeSelection';
import type { ProductTelemetrySnapshot } from '../audio/product/ProductEngineTypes';
import {
  DEFAULT_STATE,
  migratePreset,
  serializeState,
  type SliderState,
} from './state';

export const AUDIO_ENGINE_SWITCH_STATE_PARAM = 'engineState';
export const AUDIO_ENGINE_SWITCH_COLUMN_COUNT = 3;

const AUDIO_ENGINE_CPU_SUMMARY_STORAGE_KEY = 'kessho:audio-engine-cpu-summary:v1';
const AUDIO_ENGINE_SWITCH_STATE_STORAGE_PREFIX = 'kessho:audio-engine-switch-state:v1:';

export type AudioEnginePerfMetric = {
  avgPercent: number;
  peakPercent: number;
  missPercent: number | null;
  scope?: 'worklet' | 'source';
};

export type AudioEngineCpuSummary = {
  avgPercent: number;
  peakPercent: number;
  missPercent: number | null;
  moduleCount: number;
  updatedAt: number;
};

export type AudioEngineCpuSummaries = Partial<Record<AudioEngineRuntimeMode, AudioEngineCpuSummary>>;

export function shouldShowAudioEngineSwitcher(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      getAudioEngineRuntimeModes().length > 1 ||
      params.get(AUDIO_ENGINE_SWITCHER_PARAM) === '1' ||
      params.has(AUDIO_ENGINE_PARAM)
    );
  } catch {
    return getAudioEngineRuntimeModes().length > 1;
  }
}

export function shouldStartInAdvancedEditor(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('advanced') === '1' || params.get('uiMode') === 'advanced';
  } catch {
    return false;
  }
}

export function audioEngineRuntimeModeLabel(mode: AudioEngineRuntimeMode): string {
  if (mode === 'web-ts') return 'Web';
  if (mode === 'core-smoke') return 'Smoke';
  return 'Product';
}

export function audioEngineRuntimeModeTitle(mode: AudioEngineRuntimeMode): string {
  if (mode === 'web-ts') return 'Switch to Web TS reference';
  if (mode === 'core-smoke') return 'Switch to Core smoke renderer';
  return 'Switch to Product Core';
}

function isAudioEnginePerfMetric(entry: unknown): entry is AudioEnginePerfMetric {
  if (!entry || typeof entry !== 'object') return false;
  const metric = entry as Partial<AudioEnginePerfMetric>;
  return (
    typeof metric.avgPercent === 'number' &&
    Number.isFinite(metric.avgPercent) &&
    typeof metric.peakPercent === 'number' &&
    Number.isFinite(metric.peakPercent)
  );
}

function saveAudioEngineSwitchState(state: SliderState): string | null {
  try {
    const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(`${AUDIO_ENGINE_SWITCH_STATE_STORAGE_PREFIX}${key}`, serializeState(state));
    return key;
  } catch {
    return null;
  }
}

export function readAudioEngineSwitchStateFromSession(): SliderState | null {
  try {
    const key = new URLSearchParams(window.location.search).get(AUDIO_ENGINE_SWITCH_STATE_PARAM);
    if (!key) return null;
    const serialized = window.sessionStorage.getItem(`${AUDIO_ENGINE_SWITCH_STATE_STORAGE_PREFIX}${key}`);
    if (!serialized) return null;
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return migratePreset({
      name: 'Audio Engine Switch',
      state: { ...DEFAULT_STATE, ...(parsed as Partial<SliderState>) },
    }).state;
  } catch {
    return null;
  }
}

export function buildAudioEngineSwitchUrl(mode: AudioEngineRuntimeMode, state: SliderState): string {
  const currentParams = new URLSearchParams(window.location.search);
  const nextParams = new URLSearchParams();
  const stateKey = saveAudioEngineSwitchState(state);

  for (const key of [AUDIO_ENGINE_SWITCHER_PARAM, 'parity', 'snowflakePrototype']) {
    const value = currentParams.get(key);
    if (value !== null) nextParams.set(key, value);
  }
  nextParams.set(AUDIO_ENGINE_SWITCHER_PARAM, '1');
  if (stateKey) nextParams.set(AUDIO_ENGINE_SWITCH_STATE_PARAM, stateKey);

  nextParams.set(AUDIO_ENGINE_PARAM, mode);

  const query = nextParams.toString();
  return `${window.location.pathname || '/'}${query ? `?${query}` : ''}${window.location.hash}`;
}

export function summarizeAudioEngineCpu(data: Record<string, AudioEnginePerfMetric>): AudioEngineCpuSummary | null {
  const primaryMetrics = Object.values(data).filter((entry): entry is AudioEnginePerfMetric => (
    isAudioEnginePerfMetric(entry) && entry.scope !== 'source'
  ));
  if (primaryMetrics.length === 0) return null;

  const avgPercent = primaryMetrics.reduce((sum, entry) => sum + entry.avgPercent, 0);
  const peakPercent = primaryMetrics.reduce((peak, entry) => Math.max(peak, entry.peakPercent), 0);
  const missValues = primaryMetrics
    .map((entry) => entry.missPercent)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return {
    avgPercent: Math.round(avgPercent * 10) / 10,
    peakPercent: Math.round(peakPercent * 10) / 10,
    missPercent: missValues.length > 0 ? Math.round(Math.max(...missValues) * 10) / 10 : null,
    moduleCount: primaryMetrics.length,
    updatedAt: Date.now(),
  };
}

export function createProductPerfData(telemetry: ProductTelemetrySnapshot): Record<string, AudioEnginePerfMetric> {
  return {
    product: {
      avgPercent: telemetry.renderCpuPercent ?? 0,
      peakPercent: telemetry.renderCpuPeakPercent ?? 0,
      missPercent: telemetry.missedQuantumCount ?? null,
      scope: 'worklet',
    },
  };
}

export function readAudioEngineCpuSummaries(): AudioEngineCpuSummaries {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(AUDIO_ENGINE_CPU_SUMMARY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AudioEngineCpuSummaries;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

export function writeAudioEngineCpuSummaries(summaries: AudioEngineCpuSummaries): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(AUDIO_ENGINE_CPU_SUMMARY_STORAGE_KEY, JSON.stringify(summaries));
  } catch {
    // Ignore storage failures; the live readout still works.
  }
}
