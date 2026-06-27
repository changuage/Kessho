import {
  AUDIO_ENGINE_PARAM as PRODUCT_RUNTIME_PARAM,
  AUDIO_ENGINE_SWITCHER_PARAM as PRODUCT_RUNTIME_SWITCHER_PARAM,
  getProductRuntimeModes,
  type ProductRuntimeSelectionMode,
} from '../audio/product/ProductAudioRuntimeSelection';
import type { ProductPerfSnapshot, ProductTelemetrySnapshot } from '../audio/product/ProductEngineTypes';
import {
  DEFAULT_STATE,
  migratePreset,
  serializeState,
  type SliderState,
} from './state';

export const PRODUCT_RUNTIME_SWITCH_STATE_PARAM = 'engineState';
export const PRODUCT_RUNTIME_SWITCH_COLUMN_COUNT = 3;

const PRODUCT_RUNTIME_CPU_SUMMARY_STORAGE_KEY = 'kessho:audio-engine-cpu-summary:v1';
const PRODUCT_RUNTIME_SWITCH_STATE_STORAGE_PREFIX = 'kessho:audio-engine-switch-state:v1:';

export type ProductRuntimePerfMetric = {
  avgPercent: number;
  peakPercent: number;
  missPercent: number | null;
  scope?: 'worklet' | 'source';
};

export type ProductRuntimeCpuSummary = {
  avgPercent: number;
  peakPercent: number;
  missPercent: number | null;
  moduleCount: number;
  updatedAt: number;
};

export type ProductRuntimeCpuSummaries = Partial<Record<ProductRuntimeSelectionMode, ProductRuntimeCpuSummary>>;

export function shouldShowProductRuntimeSwitcher(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      getProductRuntimeModes().length > 1 ||
      params.get(PRODUCT_RUNTIME_SWITCHER_PARAM) === '1' ||
      params.has(PRODUCT_RUNTIME_PARAM)
    );
  } catch {
    return getProductRuntimeModes().length > 1;
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

export function productRuntimeModeLabel(mode: ProductRuntimeSelectionMode): string {
  if (mode === 'web-ts') return 'Web';
  if (mode === 'core-smoke') return 'Smoke';
  return 'Product';
}

export function productRuntimeModeTitle(mode: ProductRuntimeSelectionMode): string {
  if (mode === 'web-ts') return 'Switch to Web TS reference';
  if (mode === 'core-smoke') return 'Switch to Core smoke renderer';
  return 'Switch to Product Core';
}

function isProductRuntimePerfMetric(entry: unknown): entry is ProductRuntimePerfMetric {
  if (!entry || typeof entry !== 'object') return false;
  const metric = entry as Partial<ProductRuntimePerfMetric>;
  return (
    typeof metric.avgPercent === 'number' &&
    Number.isFinite(metric.avgPercent) &&
    typeof metric.peakPercent === 'number' &&
    Number.isFinite(metric.peakPercent)
  );
}

function saveProductRuntimeSwitchState(state: SliderState): string | null {
  try {
    const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(`${PRODUCT_RUNTIME_SWITCH_STATE_STORAGE_PREFIX}${key}`, serializeState(state));
    return key;
  } catch {
    return null;
  }
}

export function readProductRuntimeSwitchStateFromSession(): SliderState | null {
  try {
    const key = new URLSearchParams(window.location.search).get(PRODUCT_RUNTIME_SWITCH_STATE_PARAM);
    if (!key) return null;
    const serialized = window.sessionStorage.getItem(`${PRODUCT_RUNTIME_SWITCH_STATE_STORAGE_PREFIX}${key}`);
    if (!serialized) return null;
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return migratePreset({
      name: 'Product Runtime Switch',
      state: { ...DEFAULT_STATE, ...(parsed as Partial<SliderState>) },
    }).state;
  } catch {
    return null;
  }
}

export function buildProductRuntimeSwitchUrl(mode: ProductRuntimeSelectionMode, state: SliderState): string {
  const currentParams = new URLSearchParams(window.location.search);
  const nextParams = new URLSearchParams();
  const stateKey = saveProductRuntimeSwitchState(state);

  for (const key of [PRODUCT_RUNTIME_SWITCHER_PARAM, 'parity', 'snowflakePrototype']) {
    const value = currentParams.get(key);
    if (value !== null) nextParams.set(key, value);
  }
  nextParams.set(PRODUCT_RUNTIME_SWITCHER_PARAM, '1');
  if (stateKey) nextParams.set(PRODUCT_RUNTIME_SWITCH_STATE_PARAM, stateKey);

  nextParams.set(PRODUCT_RUNTIME_PARAM, mode);

  const query = nextParams.toString();
  return `${window.location.pathname || '/'}${query ? `?${query}` : ''}${window.location.hash}`;
}

export function summarizeProductRuntimeCpu(data: Record<string, ProductRuntimePerfMetric>): ProductRuntimeCpuSummary | null {
  const primaryMetrics = Object.values(data).filter((entry): entry is ProductRuntimePerfMetric => (
    isProductRuntimePerfMetric(entry) && entry.scope !== 'source'
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

export function createProductPerfData(telemetry: ProductTelemetrySnapshot): Record<string, ProductRuntimePerfMetric> {
  return {
    product: {
      avgPercent: telemetry.renderCpuPercent ?? 0,
      peakPercent: telemetry.renderCpuPeakPercent ?? 0,
      missPercent: telemetry.missedQuantumCount ?? null,
      scope: 'worklet',
    },
  };
}

export function filterProductRuntimePerfMetrics(data: ProductPerfSnapshot): Record<string, ProductRuntimePerfMetric> {
  const metrics: Record<string, ProductRuntimePerfMetric> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isProductRuntimePerfMetric(value)) metrics[key] = value;
  }
  return metrics;
}

export function readProductRuntimeCpuSummaries(): ProductRuntimeCpuSummaries {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(PRODUCT_RUNTIME_CPU_SUMMARY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ProductRuntimeCpuSummaries;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

export function writeProductRuntimeCpuSummaries(summaries: ProductRuntimeCpuSummaries): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PRODUCT_RUNTIME_CPU_SUMMARY_STORAGE_KEY, JSON.stringify(summaries));
  } catch {
    // Ignore storage failures; the live readout still works.
  }
}
