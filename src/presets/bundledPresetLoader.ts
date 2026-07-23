import type { ProductPlayConfig } from '../audio/productPlaySequencer';
import type { ClockDivision, PitchBindingMode } from '../audio/drumSeqTypes';
import {
  type SerializedStepOverrides,
  type SliderMode,
  type SliderState,
} from '../ui/state';
import { getVersionData } from './codec';
import { decodeCurrentPresetEntry } from './currentPresetSchema';
import { extractPresetVersionMetadata } from './presetUtils';
import { enforceProductCorePresetBoundaryState } from './productCorePresetBoundary';
import type { RoutingMuteGroupsState } from '../ui/routing/routingMuteGroups';
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
  id?: string;
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
  routingMuteGroups?: RoutingMuteGroupsState;
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
  synthPlayConfigs?: ProductPlayConfig[];
  /** @deprecated Legacy metadata key retained for decode compatibility. */
  synthArpConfigs?: ProductPlayConfig[];
  drumPitchSettings?: PitchSettings[];
  synthPitchSettings?: PitchSettings[];
  synthPitchBindingModes?: PitchBindingMode[];
  presetPool?: PresetPoolMetadata;
}

function bundledPresetFromFileData(
  data: Record<string, unknown>,
  fallbackName: string,
  source: SavedPresetSource,
): BundledSavedPreset {
  const rawEntry = data.kesshoPreset === true && data.entry ? data.entry : data;
  const entry = decodeCurrentPresetEntry(rawEntry);
  if (entry.type !== 'state') {
    throw new Error(`Bundled preset ${fallbackName} is not a state preset`);
  }
  const version = entry.versions.find(candidate => candidate.v === entry.currentVersion);
  const versionData = version ? getVersionData(entry, version.v) : null;
  if (!version || !versionData) throw new Error(`Bundled preset ${fallbackName} has no current version`);
  const metadata = extractPresetVersionMetadata(version) ?? {};
  return {
    id: entry.id,
    name: entry.name,
    timestamp: new Date(version.timestamp).toISOString(),
    state: enforceProductCorePresetBoundaryState(versionData as unknown as SliderState),
    ...metadata,
    source,
    tags: entry.tags,
    familyId: entry.familyId,
    familyName: entry.familyName,
    variantId: entry.variantId,
    variantName: entry.variantName,
    variantRank: entry.variantRank,
    versionCount: entry.versions.length,
    currentVersion: entry.currentVersion,
  } as BundledSavedPreset;
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
