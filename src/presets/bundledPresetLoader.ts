import type { ProductArpConfig } from '../audio/productArpeggiator';
import type { ClockDivision, PitchBindingMode } from '../audio/drumSeqTypes';
import {
  migratePreset,
  type SerializedStepOverrides,
  type SliderMode,
  type SliderState,
} from '../ui/state';
import type {
  EvolveConfig,
  PitchSettings,
  SubLaneKind,
  SubLaneState,
} from '../ui/sequencer/useEuclideanSequencer';
import type { SavedPresetSource } from './savedPresetSource';
import type { PresetPoolMetadata } from './types';

const BUNDLED_PRESET_FALLBACK_FILES = [
  'Ethereal_Ambient.json',
  'Dark_Textures.json',
  'Bright_Bells.json',
  'StringWaves.json',
  'ZoneOut1.json',
  'Gamelantest.json',
];

export interface BundledSavedPreset {
  name: string;
  timestamp: string;
  state: SliderState;
  source?: SavedPresetSource;
  deferred?: boolean;
  tags?: string[];
  familyId?: string;
  familyName?: string;
  variantId?: string;
  variantName?: string;
  variantRank?: number;
  versionCount?: number;
  currentVersion?: number;
  dualRanges?: Record<string, { min: number; max: number }>;
  sliderModes?: Record<string, SliderMode>;
  drumEvolveConfigs?: EvolveConfig[];
  synthEvolveConfigs?: EvolveConfig[];
  drumStepOverrides?: SerializedStepOverrides;
  synthStepOverrides?: SerializedStepOverrides;
  drumClockDivs?: ClockDivision[];
  synthClockDivs?: ClockDivision[];
  drumSwings?: number[];
  synthSwings?: number[];
  drumLinked?: boolean[];
  synthLinked?: boolean[];
  drumSubLaneStates?: Record<SubLaneKind, SubLaneState>[];
  synthSubLaneStates?: Record<SubLaneKind, SubLaneState>[];
  synthArpConfigs?: ProductArpConfig[];
  drumPitchSettings?: PitchSettings[];
  synthPitchSettings?: PitchSettings[];
  synthPitchBindingModes?: PitchBindingMode[];
  presetPool?: PresetPoolMetadata;
}

function bundledPresetFromFileData(
  data: Partial<BundledSavedPreset> & Record<string, unknown>,
  fallbackName: string,
  source: SavedPresetSource,
): BundledSavedPreset {
  const migrated = migratePreset({
    name: typeof data.name === 'string' && data.name.trim() ? data.name : fallbackName,
    timestamp: typeof data.timestamp === 'string' ? data.timestamp : new Date().toISOString(),
    state: (data.state && typeof data.state === 'object' ? data.state : data) as SliderState,
    tags: Array.isArray(data.tags) ? data.tags : undefined,
    dualRanges: data.dualRanges,
    sliderModes: data.sliderModes,
    drumEvolveConfigs: data.drumEvolveConfigs,
    synthEvolveConfigs: data.synthEvolveConfigs,
    drumStepOverrides: data.drumStepOverrides,
    synthStepOverrides: data.synthStepOverrides,
    drumClockDivs: data.drumClockDivs,
    synthClockDivs: data.synthClockDivs,
    drumSwings: data.drumSwings,
    synthSwings: data.synthSwings,
    drumLinked: data.drumLinked,
    synthLinked: data.synthLinked,
    drumSubLaneStates: data.drumSubLaneStates,
    synthSubLaneStates: data.synthSubLaneStates,
    synthArpConfigs: data.synthArpConfigs as ProductArpConfig[] | undefined,
    drumPitchSettings: data.drumPitchSettings,
    synthPitchSettings: data.synthPitchSettings,
    synthPitchBindingModes: data.synthPitchBindingModes,
    presetPool: data.presetPool,
  });
  return { ...migrated, source } as BundledSavedPreset;
}

async function loadBundledPresetFiles(files: readonly string[]): Promise<BundledSavedPreset[]> {
  const presets: BundledSavedPreset[] = [];
  for (const file of files) {
    try {
      const response = await fetch(`/presets/${file}`);
      if (response.ok) {
        const data = await response.json();
        presets.push(bundledPresetFromFileData(data, file.replace('.json', ''), 'bundled'));
      }
    } catch {
      // Missing or invalid bundled files should not block offline/local presets.
    }
  }
  return presets;
}

export async function loadPresetsFromFolder(): Promise<BundledSavedPreset[]> {
  const presets: BundledSavedPreset[] = [];
  try {
    const manifestResponse = await fetch('/presets/manifest.json');
    if (!manifestResponse.ok) {
      console.warn('No preset manifest found, trying known files...');
      return loadBundledPresetFiles(BUNDLED_PRESET_FALLBACK_FILES);
    }

    const manifest = await manifestResponse.json();
    const files = Array.isArray(manifest.files) ? manifest.files : [];
    if (files.length === 0) {
      return loadBundledPresetFiles(BUNDLED_PRESET_FALLBACK_FILES);
    }

    for (const file of files) {
      try {
        const response = await fetch(`/presets/${file}`);
        if (response.ok) {
          const data = await response.json();
          presets.push(bundledPresetFromFileData(data, file.replace('.json', ''), 'bundled'));
        }
      } catch (error) {
        console.warn(`Failed to load preset ${file}:`, error);
      }
    }
  } catch (error) {
    console.warn('Failed to load presets:', error);
  }
  return presets;
}
