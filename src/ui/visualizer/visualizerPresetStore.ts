import { getVersionData } from '../../presets/codec';
import { getPresetCommandService } from '../../presets/presetCommands';
import { getPresetStore } from '../../presets/PresetStore';
import type { PresetEntry, PresetSummary } from '../../presets/types';
import {
  normalizeTransportControls,
  type TransportControls,
} from './visualizerTransportSchema';
import {
  sanitizeTransportAssignments,
  type TransportAssignment,
} from './transportAssignments';
import type { VisualizerQualityMode } from './visualizerQuality';

export const VISUALIZER_PRESET_SCOPE = 'visualizer';
const VISUALIZER_PRESET_LEVEL = 'source' as const;

export type TransportVisualizerPresetData = {
  format: 'kessho-visualizer-preset';
  formatVersion: 3;
  renderer: 'transport';
  controls: TransportControls;
  assignments: TransportAssignment[];
  qualityMode: VisualizerQualityMode;
  seed: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeTransportVisualizerPresetData(value: unknown): TransportVisualizerPresetData | null {
  if (!isRecord(value)) return null;
  if (value.format !== 'kessho-visualizer-preset' || value.formatVersion !== 3) return null;
  if (value.renderer !== 'transport' || !isRecord(value.controls)) return null;
  const qualityMode = value.qualityMode === 'mobileSafe' || value.qualityMode === 'desktopBeauty'
    ? value.qualityMode
    : 'auto';
  return {
    format: 'kessho-visualizer-preset',
    formatVersion: 3,
    renderer: 'transport',
    controls: normalizeTransportControls(value.controls),
    assignments: sanitizeTransportAssignments(value.assignments),
    qualityMode,
    seed: typeof value.seed === 'number' && Number.isFinite(value.seed) ? value.seed : 0,
  };
}

export async function listVisualizerPresets(): Promise<PresetSummary[]> {
  return getPresetStore().list(VISUALIZER_PRESET_LEVEL, VISUALIZER_PRESET_SCOPE);
}

export async function loadTransportVisualizerPreset(name: string): Promise<{
  entry: PresetEntry;
  data: TransportVisualizerPresetData;
} | null> {
  const entry = await getPresetStore().load(VISUALIZER_PRESET_LEVEL, name, VISUALIZER_PRESET_SCOPE);
  if (!entry) return null;
  const data = normalizeTransportVisualizerPresetData(getVersionData(entry));
  if (!data) return null;
  return { entry, data };
}

export async function saveTransportVisualizerPreset(
  name: string,
  data: TransportVisualizerPresetData,
): Promise<PresetEntry | null> {
  const normalizedData = normalizeTransportVisualizerPresetData(data);
  if (!normalizedData) return null;
  const result = await getPresetCommandService(getPresetStore()).save({
    type: VISUALIZER_PRESET_LEVEL,
    scope: VISUALIZER_PRESET_SCOPE,
    name,
    data: normalizedData as unknown as Record<string, unknown>,
    tags: ['visualizer', 'transport'],
    forkReadOnly: true,
  });
  return result.entry;
}
