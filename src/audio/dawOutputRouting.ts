import { CORE_PRODUCT_GRAPH_TAP_IDS } from './coreProductGraphTaps';
import { STEM_RECORD_TRACK_LABELS } from './recordingTracks';

export const DAW_OUTPUT_MAX_CHANNELS = 32;
export const DAW_OUTPUT_DEFAULT_CHANNEL_COUNT = 32;
export const DAW_OUTPUT_CHANNEL_COUNT_OPTIONS = [8, 16, 32] as const;
export const DAW_OUTPUT_STORAGE_KEY = 'kessho:daw-output-routing:v1';
export const DAW_OUTPUT_DEVICE_STORAGE_KEY = 'kessho:daw-output-device:v1';

export const DAW_OUTPUT_SOURCE_DEFS = [
  { sourceId: 'pad1', label: STEM_RECORD_TRACK_LABELS.pad1, tapId: CORE_PRODUCT_GRAPH_TAP_IDS.pad1Dry },
  { sourceId: 'pad2', label: STEM_RECORD_TRACK_LABELS.pad2, tapId: CORE_PRODUCT_GRAPH_TAP_IDS.pad2Dry },
  { sourceId: 'lead1', label: STEM_RECORD_TRACK_LABELS.lead1, tapId: CORE_PRODUCT_GRAPH_TAP_IDS.lead1Dry },
  { sourceId: 'lead2', label: STEM_RECORD_TRACK_LABELS.lead2, tapId: CORE_PRODUCT_GRAPH_TAP_IDS.lead2Dry },
  { sourceId: 'piano', label: STEM_RECORD_TRACK_LABELS.piano, tapId: CORE_PRODUCT_GRAPH_TAP_IDS.pianoDry },
  { sourceId: 'drums', label: STEM_RECORD_TRACK_LABELS.drums, tapId: CORE_PRODUCT_GRAPH_TAP_IDS.drumDry },
  { sourceId: 'granular', label: STEM_RECORD_TRACK_LABELS.granular, tapId: CORE_PRODUCT_GRAPH_TAP_IDS.granularOutput },
  { sourceId: 'waves', label: STEM_RECORD_TRACK_LABELS.waves, tapId: CORE_PRODUCT_GRAPH_TAP_IDS.wavesDry },
  { sourceId: 'water', label: STEM_RECORD_TRACK_LABELS.water, tapId: CORE_PRODUCT_GRAPH_TAP_IDS.waterDry },
  { sourceId: 'insects', label: STEM_RECORD_TRACK_LABELS.insects, tapId: CORE_PRODUCT_GRAPH_TAP_IDS.insectsDry },
  { sourceId: 'nature', label: STEM_RECORD_TRACK_LABELS.nature, tapId: CORE_PRODUCT_GRAPH_TAP_IDS.natureDry },
  { sourceId: 'delayAOut', label: STEM_RECORD_TRACK_LABELS.delayAOut, tapId: CORE_PRODUCT_GRAPH_TAP_IDS.delayAOut },
  { sourceId: 'delayBOut', label: STEM_RECORD_TRACK_LABELS.delayBOut, tapId: CORE_PRODUCT_GRAPH_TAP_IDS.delayBOut },
  { sourceId: 'reverb', label: STEM_RECORD_TRACK_LABELS.reverb, tapId: CORE_PRODUCT_GRAPH_TAP_IDS.reverb },
  { sourceId: 'dynamics', label: STEM_RECORD_TRACK_LABELS.dynamics, tapId: CORE_PRODUCT_GRAPH_TAP_IDS.dynamicsOutput },
] as const;

export type DawOutputSourceId = typeof DAW_OUTPUT_SOURCE_DEFS[number]['sourceId'];

export type DawOutputRoute = {
  sourceId: DawOutputSourceId;
  tapId: number;
  label: string;
  channel: number;
};

export type DawOutputRoutingConfig = {
  enabled: boolean;
  channelCount: number;
  routes: DawOutputRoute[];
};

export type DawOutputDeviceSelection = {
  deviceId: string;
  label: string;
};

const DAW_OUTPUT_SOURCE_BY_ID = new Map<DawOutputSourceId, typeof DAW_OUTPUT_SOURCE_DEFS[number]>(
  DAW_OUTPUT_SOURCE_DEFS.map((source) => [source.sourceId, source]),
);

function normalizeDawOutputChannelCount(rawValue: unknown): number {
  const numeric = Math.trunc(Number(rawValue));
  if (!Number.isFinite(numeric)) return DAW_OUTPUT_DEFAULT_CHANNEL_COUNT;
  const clamped = Math.max(2, Math.min(DAW_OUTPUT_MAX_CHANNELS, numeric));
  return clamped % 2 === 0 ? clamped : Math.max(2, clamped - 1);
}

export function normalizeDawOutputStereoLeftChannel(rawValue: unknown, channelCount: number): number | null {
  const numeric = Math.trunc(Number(rawValue));
  if (!Number.isFinite(numeric)) return null;
  const channel = numeric % 2 === 0 ? numeric - 1 : numeric;
  if (channel < 3 || channel + 1 > channelCount) return null;
  return channel;
}

export function getDawOutputStereoPairOptions(channelCount: number): number[] {
  const normalizedChannelCount = normalizeDawOutputChannelCount(channelCount);
  const options: number[] = [];
  for (let channel = 3; channel + 1 <= normalizedChannelCount; channel += 2) {
    options.push(channel);
  }
  return options;
}

export function createDefaultDawOutputRoutingConfig(): DawOutputRoutingConfig {
  return {
    enabled: false,
    channelCount: DAW_OUTPUT_DEFAULT_CHANNEL_COUNT,
    routes: [],
  };
}

export function createDawOutputRoute(sourceId: DawOutputSourceId, channel: number): DawOutputRoute | null {
  const source = DAW_OUTPUT_SOURCE_BY_ID.get(sourceId);
  if (!source) return null;
  return {
    sourceId,
    tapId: source.tapId,
    label: source.label,
    channel,
  };
}

export function createDefaultDawOutputRoutesForSources(
  sourceIds: readonly DawOutputSourceId[],
  channelCount: number,
): DawOutputRoute[] {
  const routes: DawOutputRoute[] = [];
  const pairs = getDawOutputStereoPairOptions(channelCount);
  for (let index = 0; index < sourceIds.length && index < pairs.length; index += 1) {
    const route = createDawOutputRoute(sourceIds[index]!, pairs[index]!);
    if (route) routes.push(route);
  }
  return routes;
}

export function sanitizeDawOutputRoutingConfig(rawConfig: unknown): DawOutputRoutingConfig {
  const fallback = createDefaultDawOutputRoutingConfig();
  if (!rawConfig || typeof rawConfig !== 'object') return fallback;
  const config = rawConfig as Partial<DawOutputRoutingConfig>;
  const channelCount = normalizeDawOutputChannelCount(config.channelCount);
  const routes: DawOutputRoute[] = [];
  const seenSources = new Set<DawOutputSourceId>();

  if (Array.isArray(config.routes)) {
    for (const rawRoute of config.routes) {
      if (!rawRoute || typeof rawRoute !== 'object') continue;
      const route = rawRoute as Partial<DawOutputRoute>;
      const sourceId = route.sourceId;
      if (!sourceId || !DAW_OUTPUT_SOURCE_BY_ID.has(sourceId) || seenSources.has(sourceId)) continue;
      const channel = normalizeDawOutputStereoLeftChannel(route.channel, channelCount);
      if (channel === null) continue;
      const normalizedRoute = createDawOutputRoute(sourceId, channel);
      if (!normalizedRoute) continue;
      routes.push(normalizedRoute);
      seenSources.add(sourceId);
    }
  }

  return {
    enabled: Boolean(config.enabled),
    channelCount,
    routes,
  };
}

export function filterDawOutputRoutingConfigForSources(
  config: DawOutputRoutingConfig,
  sourceIds: readonly DawOutputSourceId[],
): DawOutputRoutingConfig {
  const activeSources = new Set(sourceIds);
  const sanitized = sanitizeDawOutputRoutingConfig(config);
  return {
    ...sanitized,
    routes: sanitized.routes.filter((route) => activeSources.has(route.sourceId)),
  };
}

export function loadDawOutputRoutingConfig(): DawOutputRoutingConfig {
  if (typeof window === 'undefined') return createDefaultDawOutputRoutingConfig();
  try {
    const raw = window.localStorage.getItem(DAW_OUTPUT_STORAGE_KEY);
    if (!raw) return createDefaultDawOutputRoutingConfig();
    return sanitizeDawOutputRoutingConfig(JSON.parse(raw));
  } catch {
    return createDefaultDawOutputRoutingConfig();
  }
}

export function saveDawOutputRoutingConfig(config: DawOutputRoutingConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      DAW_OUTPUT_STORAGE_KEY,
      JSON.stringify(sanitizeDawOutputRoutingConfig(config)),
    );
  } catch {
    // Storage can fail in private browsing or constrained shells; live routing still works.
  }
}

export function createDefaultDawOutputDeviceSelection(): DawOutputDeviceSelection {
  return { deviceId: '', label: '' };
}

export function sanitizeDawOutputDeviceSelection(rawSelection: unknown): DawOutputDeviceSelection {
  if (!rawSelection || typeof rawSelection !== 'object') return createDefaultDawOutputDeviceSelection();
  const selection = rawSelection as Partial<DawOutputDeviceSelection>;
  return {
    deviceId: typeof selection.deviceId === 'string' ? selection.deviceId : '',
    label: typeof selection.label === 'string' ? selection.label : '',
  };
}

export function loadDawOutputDeviceSelection(): DawOutputDeviceSelection {
  if (typeof window === 'undefined') return createDefaultDawOutputDeviceSelection();
  try {
    const raw = window.localStorage.getItem(DAW_OUTPUT_DEVICE_STORAGE_KEY);
    if (!raw) return createDefaultDawOutputDeviceSelection();
    return sanitizeDawOutputDeviceSelection(JSON.parse(raw));
  } catch {
    return createDefaultDawOutputDeviceSelection();
  }
}

export function saveDawOutputDeviceSelection(selection: DawOutputDeviceSelection): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      DAW_OUTPUT_DEVICE_STORAGE_KEY,
      JSON.stringify(sanitizeDawOutputDeviceSelection(selection)),
    );
  } catch {
    // Storage can fail in private browsing or constrained shells; live output still follows the current selection.
  }
}

export function isBlackHoleAudioDeviceLabel(label: string): boolean {
  return /\bblackhole\b/i.test(label);
}
