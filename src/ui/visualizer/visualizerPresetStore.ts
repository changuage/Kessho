import { getVersionData } from '../../presets/codec';
import { getPresetStore } from '../../presets/PresetStore';
import type { PresetEntry, PresetSummary } from '../../presets/types';
import type { ReactiveVisualizerControls } from './ReactiveVisualizerRenderer';
import type {
  VisualizerMode,
  VisualizerReactionSettings,
  VisualizerReactiveRanges,
} from './visualizerModulation';

export const VISUALIZER_PRESET_SCOPE = 'visualizer';
const VISUALIZER_PRESET_LEVEL = 'source' as const;

export type VisualizerPresetData = {
  format: 'kessho-visualizer-preset';
  formatVersion: 1;
  mode: VisualizerMode;
  controls: ReactiveVisualizerControls;
  reactiveRanges: VisualizerReactiveRanges;
  reaction: VisualizerReactionSettings;
  seed: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeVisualizerPresetData(value: unknown): VisualizerPresetData | null {
  if (!isRecord(value)) return null;
  if (value.format !== 'kessho-visualizer-preset') return null;
  if (!isRecord(value.controls) || !isRecord(value.reaction)) return null;
  return value as VisualizerPresetData;
}

export async function listVisualizerPresets(): Promise<PresetSummary[]> {
  return getPresetStore().list(VISUALIZER_PRESET_LEVEL, VISUALIZER_PRESET_SCOPE);
}

export async function loadVisualizerPreset(name: string): Promise<{
  entry: PresetEntry;
  data: VisualizerPresetData;
} | null> {
  const entry = await getPresetStore().load(VISUALIZER_PRESET_LEVEL, name, VISUALIZER_PRESET_SCOPE);
  if (!entry) return null;
  const data = normalizeVisualizerPresetData(getVersionData(entry));
  if (!data) return null;
  return { entry, data };
}

export async function saveVisualizerPreset(
  name: string,
  data: VisualizerPresetData,
): Promise<PresetEntry | null> {
  const store = getPresetStore();
  const existing = await store.load(VISUALIZER_PRESET_LEVEL, name, VISUALIZER_PRESET_SCOPE);
  const now = Date.now();
  if (existing) {
    const maxVersion = Math.max(...existing.versions.map((version) => version.v));
    existing.versions.push({
      v: maxVersion + 1,
      note: '',
      timestamp: now,
      data: data as unknown as Record<string, unknown>,
    });
    existing.currentVersion = maxVersion + 1;
    existing.updatedAt = now;
    await store.save(existing);
    return store.load(VISUALIZER_PRESET_LEVEL, name, VISUALIZER_PRESET_SCOPE);
  }

  const entry: PresetEntry = {
    type: VISUALIZER_PRESET_LEVEL,
    scope: VISUALIZER_PRESET_SCOPE,
    source: VISUALIZER_PRESET_SCOPE,
    name,
    author: 'user',
    library: 'user',
    visibility: 'private',
    familyName: name,
    variantName: name,
    tags: ['visualizer'],
    versions: [{
      v: 1,
      note: '',
      timestamp: now,
      data: data as unknown as Record<string, unknown>,
    }],
    currentVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
  await store.save(entry);
  return store.load(VISUALIZER_PRESET_LEVEL, name, VISUALIZER_PRESET_SCOPE);
}
