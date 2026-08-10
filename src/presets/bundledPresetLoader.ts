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
import type { PresetPoolMetadata, PresetVersionMetadata } from './types';
import type { SerializedSeqScatterState } from '../ui/drums/scatter/scatterTypes';
import { sanitizePresetParameterBehaviorMetadata } from './versionMetadataHelpers';
import { canonicalizeStoredPresetEntry } from './storedPresetCompatibility';
import { completeCanonicalPresetState } from './presetStateCompatibility';
import type { DualSliderConfig } from '../ui/sliderSystem/dualConfigReducer';

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
  dualSliderConfigs?: Partial<Record<string, DualSliderConfig>>;
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
  drumPitchSettings?: PitchSettings[];
  synthPitchSettings?: PitchSettings[];
  synthPitchBindingModes?: PitchBindingMode[];
  drumScatterState?: SerializedSeqScatterState;
  presetPool?: PresetPoolMetadata;
}

function bundledPresetFromFileData(
  data: Record<string, unknown>,
  fallbackName: string,
  source: SavedPresetSource,
): BundledSavedPreset {
  // The direct-file Point Clouds generator emits the already materialized
  // SavedPreset shape. Keep that shape as the canonical local asset so the
  // regular browser build can use the exact same snapshot without contacting
  // Supabase or rebuilding a V2 graph from an export envelope.
  if (
    typeof data.name === 'string'
    && typeof data.timestamp === 'string'
    && data.state
    && typeof data.state === 'object'
    && !Array.isArray(data.state)
    && !data.type
    && !data.versions
  ) {
    const metadata = { ...data } as Record<string, unknown>;
    delete metadata.state;
    delete metadata.timestamp;
    delete metadata.name;
    const behavior = sanitizePresetParameterBehaviorMetadata(metadata as PresetVersionMetadata);
    if (behavior.sliderModes) metadata.sliderModes = behavior.sliderModes;
    else delete metadata.sliderModes;
    if (behavior.dualRanges) metadata.dualRanges = behavior.dualRanges;
    else delete metadata.dualRanges;
    if (behavior.dualSliderConfigs) metadata.dualSliderConfigs = behavior.dualSliderConfigs;
    else delete metadata.dualSliderConfigs;
    return {
      ...metadata,
      id: typeof data.id === 'string' ? data.id : undefined,
      name: data.name,
      timestamp: new Date(data.timestamp).toISOString(),
      state: enforceProductCorePresetBoundaryState(completeCanonicalPresetState(data.state as SliderState)),
      source,
    } as BundledSavedPreset;
  }

  const rawEntry = data.kesshoPreset === true && data.entry ? data.entry : data;
  const entry = decodeCurrentPresetEntry(canonicalizeStoredPresetEntry(rawEntry));
  if (entry.type !== 'state') {
    throw new Error(`Bundled preset ${fallbackName} is not a state preset`);
  }
  const version = entry.versions.find(candidate => candidate.v === entry.currentVersion);
  const versionData = version ? getVersionData(entry, version.v) : null;
  if (!version || !versionData) throw new Error(`Bundled preset ${fallbackName} has no current version`);
  const metadata = extractPresetVersionMetadata(version) ?? {};
  const behavior = sanitizePresetParameterBehaviorMetadata(metadata);
  if (behavior.sliderModes) metadata.sliderModes = behavior.sliderModes;
  else delete metadata.sliderModes;
  if (behavior.dualRanges) metadata.dualRanges = behavior.dualRanges;
  else delete metadata.dualRanges;
  if (behavior.dualSliderConfigs) metadata.dualSliderConfigs = behavior.dualSliderConfigs;
  else delete metadata.dualSliderConfigs;
  return {
    id: entry.id,
    name: entry.name,
    timestamp: new Date(version.timestamp).toISOString(),
    state: enforceProductCorePresetBoundaryState(completeCanonicalPresetState(versionData)),
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
