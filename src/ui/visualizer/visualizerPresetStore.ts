import { getVersionData } from '../../presets/codec';
import { getPresetCommandService } from '../../presets/presetCommands';
import { getPresetStore } from '../../presets/PresetStore';
import type { PresetEntry, PresetSummary } from '../../presets/types';
import type { ReactiveVisualizerControls } from './ReactiveVisualizerRenderer';
import type {
  VisualizerPerformanceMacros,
  VisualizerLayerMacros,
  VisualizerQualityMode,
} from './visualizerControls';
import type {
  VisualizerMode,
  VisualizerReactionSettings,
  VisualizerReactiveRanges,
  VisualizerNumericControlKey,
} from './visualizerModulation';

export const VISUALIZER_PRESET_SCOPE = 'visualizer';
const VISUALIZER_PRESET_LEVEL = 'source' as const;

export type VisualizerPresetData = {
  format: 'kessho-visualizer-preset';
  formatVersion: 1 | 2;
  mode: VisualizerMode;
  controls: ReactiveVisualizerControls;
  reactiveRanges: VisualizerReactiveRanges;
  vizSliderModes?: Record<string, 'single' | 'walk' | 'sampleHold' | 'shape'>;
  reaction: VisualizerReactionSettings;
  performanceMacros?: VisualizerPerformanceMacros;
  layerMacros?: VisualizerLayerMacros;
  qualityMode?: VisualizerQualityMode;
  seed: number;
};

const NUMERIC_CONTROL_KEYS = new Set<VisualizerNumericControlKey>([
  'style', 'kaleidoscope', 'triggerResponse', 'ripples', 'motion', 'color',
  'diffusion', 'background', 'frameRate', 'shape', 'organic', 'edges',
  'backdropFade', 'noiseTurbulence', 'noiseFlow', 'noiseSpeed', 'noiseColor',
  'pulseSync', 'shapeSize', 'shapeSpread', 'shapeCount', 'noiseSize',
  'noiseDensity', 'bloomSize', 'kaleidoSize', 'glitchIntensity', 'glitchScale',
  'glitchChromatic', 'glitchRate', 'charAmount', 'charStyle', 'charGrain',
  'charDrift', 'kaleidoSegments', 'kaleidoSpin', 'kaleidoType',
  'kaleidoReflections', 'kaleidoPattern', 'brightness', 'vibrance', 'saturation',
  'impactFlash', 'visualLimiter', 'pointCloudAmount', 'pointCloudSize',
  'pointCloudDensity', 'pointCloudScatter', 'pointCloudColor',
]);

function sanitizeReactiveRanges(value: unknown): VisualizerReactiveRanges {
  if (!isRecord(value)) return {};
  const ranges: VisualizerReactiveRanges = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!NUMERIC_CONTROL_KEYS.has(key as VisualizerNumericControlKey) || !isRecord(raw)) continue;
    const min = typeof raw.min === 'number' && Number.isFinite(raw.min) ? Math.max(-1, Math.min(1, raw.min)) : undefined;
    const max = typeof raw.max === 'number' && Number.isFinite(raw.max) ? Math.max(-1, Math.min(1, raw.max)) : undefined;
    if (min === undefined || max === undefined) continue;
    ranges[key as VisualizerNumericControlKey] = { min: Math.min(min, max), max: Math.max(min, max) };
  }
  return ranges;
}

function sanitizeVizSliderModes(value: unknown): Record<string, 'single' | 'walk' | 'sampleHold' | 'shape'> {
  if (!isRecord(value)) return {};
  const modes: Record<string, 'single' | 'walk' | 'sampleHold' | 'shape'> = {};
  for (const [key, mode] of Object.entries(value)) {
    if (!NUMERIC_CONTROL_KEYS.has(key as VisualizerNumericControlKey)) continue;
    if (mode === 'walk' || mode === 'sampleHold' || mode === 'shape') modes[key] = mode;
  }
  return modes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeVisualizerPresetData(value: unknown): VisualizerPresetData | null {
  if (!isRecord(value)) return null;
  if (value.format !== 'kessho-visualizer-preset') return null;
  if (value.formatVersion !== 1 && value.formatVersion !== 2) return null;
  if (!isRecord(value.controls) || !isRecord(value.reaction)) return null;
  return {
    ...(value as unknown as VisualizerPresetData),
    formatVersion: 2,
    reactiveRanges: sanitizeReactiveRanges(value.reactiveRanges),
    vizSliderModes: sanitizeVizSliderModes(value.vizSliderModes),
  };
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
  const normalizedData = normalizeVisualizerPresetData(data);
  if (!normalizedData) return null;
  const store = getPresetStore();
  const result = await getPresetCommandService(store).save({
    type: VISUALIZER_PRESET_LEVEL,
    scope: VISUALIZER_PRESET_SCOPE,
    name,
    data: normalizedData as unknown as Record<string, unknown>,
    tags: ['visualizer'],
    forkReadOnly: true,
  });
  return result.entry;
}
