import { normalizeDynamicsErosionAliases, normalizeDynamicsQualityFields } from '../audio/dynamicsModel';
import {
  MAX_CHORDS_PER_PHRASE,
  legacyChordRateSecondsToChordsPerPhrase,
  normalizeChordsPerPhrase,
} from '../audio/chordPhraseTiming';
import { getPadPreset, morphPadPresets, PAD1_TO_PAD2_KEY, PAD_PRESET_PARAM_KEYS } from '../audio/padPresets';
import { normalizeDegradeReverbCrossfeed } from '../ui/routing';
import { DEFAULT_STATE, migratePreset, type SliderState } from '../ui/state';
import { migrateLegacyNatureSlotState } from '../audio/natureSlots';
import { loadPresetsFromFolder, type BundledSavedPreset } from './bundledPresetLoader';
import { getVersionData } from './codec';
import { extractPresetVersionMetadata } from './presetUtils';
import { enforceProductCorePresetBoundaryState } from './productCorePresetBoundary';
import { savedPresetSourceFor } from './savedPresetSource';
import type { PresetEntry, PresetSummary } from './types';

export type SavedPreset = BundledSavedPreset;

const CAPACITOR_LOCAL_STATE_PRESET_SCOPE = 'global';

// iOS-only reverb types that won't work on web
const IOS_ONLY_REVERB_TYPES = new Set([
  'smallRoom',
  'mediumRoom',
  'largeRoom',
  'mediumHall',
  'largeHall',
  'mediumChamber',
  'largeChamber',
  'largeRoom2',
  'mediumHall2',
  'mediumHall3',
  'largeHall2',
]);

// Check preset for iOS-only settings and return warnings
export const checkPresetCompatibility = (preset: SavedPreset): string[] => {
  const warnings: string[] = [];

  // Check for iOS-only reverb type
  if (preset.state.reverbType && IOS_ONLY_REVERB_TYPES.has(preset.state.reverbType)) {
    warnings.push(`Reverb type "${preset.state.reverbType}" is iOS-only and will use "hall" instead.`);
  }

  return warnings;
};

// Normalize iOS-only settings to web-compatible values
export const normalizePresetForWeb = (state: SliderState): SliderState => {
  const raw = state as Partial<SliderState> & Record<string, unknown>;
  const normalized = migrateLegacyNatureSlotState(raw) as unknown as SliderState;

  // Replace iOS-only reverb types with 'hall'
  if (normalized.reverbType && IOS_ONLY_REVERB_TYPES.has(normalized.reverbType)) {
    normalized.reverbType = 'hall';
  }

  // Legacy lead timbre migration:
  // Map old timbre range (0..1 Rhodes->Gamelan) to Lead 1 morph value.
  // Keep Lead 1 preset pair fixed to Soft Rhodes<->Gamelan for old presets.
  const hasLead1Morph = typeof raw.lead1Morph === 'number' || typeof raw.lead1MorphMin === 'number';
  const hasLegacyTimbreRange = typeof raw.leadTimbreMin === 'number' && typeof raw.leadTimbreMax === 'number';

  if (hasLegacyTimbreRange) {
    const legacyMin = Math.min(1, Math.max(0, Number(raw.leadTimbreMin ?? 0)));
    const legacyMax = Math.min(1, Math.max(0, Number(raw.leadTimbreMax ?? 0)));
    const currentMorph = typeof raw.lead1Morph === 'number' ? raw.lead1Morph : typeof raw.lead1MorphMin === 'number' ? raw.lead1MorphMin : undefined;
    const hasLegacyDominance = !hasLead1Morph || (currentMorph === 0 && (legacyMin !== 0 || legacyMax !== 0));
    if (hasLegacyDominance) {
      normalized.lead1Morph = (legacyMin + legacyMax) / 2;
    }
  }

  // Legacy ADSR migration:
  // If old preset includes explicit lead ADSR fields and no explicit mode, default to custom ADSR ON.
  const hasExplicitAdsrMode = typeof raw.lead1UseCustomAdsr === 'boolean' || typeof raw.leadUseCustomAdsr === 'boolean';
  const hasLegacyLeadAdsr = ['leadAttack', 'leadDecay', 'leadSustain', 'leadRelease'].some((key) => {
    const value = raw[key];
    return Object.prototype.hasOwnProperty.call(raw, key) && typeof value === 'number' && Number.isFinite(value);
  });
  if (!hasExplicitAdsrMode) {
    normalized.lead1UseCustomAdsr = hasLegacyLeadAdsr;
  } else if (typeof raw.leadUseCustomAdsr === 'boolean' && typeof raw.lead1UseCustomAdsr !== 'boolean') {
    normalized.lead1UseCustomAdsr = raw.leadUseCustomAdsr as boolean;
  }

  // Legacy ADSHR rename migration:
  // Old presets used leadAttack/Decay/Sustain/Hold/Release, now lead1*.
  const adsrhMap: [string, keyof SliderState][] = [
    ['leadAttack', 'lead1Attack'],
    ['leadDecay', 'lead1Decay'],
    ['leadSustain', 'lead1Sustain'],
    ['leadHold', 'lead1Hold'],
    ['leadRelease', 'lead1Release'],
  ];
  for (const [oldKey, newKey] of adsrhMap) {
    if (typeof raw[oldKey] === 'number' && typeof raw[newKey as string] !== 'number') {
      (normalized as unknown as Record<string, unknown>)[newKey] = raw[oldKey] as number;
    }
  }

  // Ensure legacy presets use the intended Lead 1 pair
  if (!normalized.lead1PresetA) normalized.lead1PresetA = 'soft_rhodes';
  if (!normalized.lead1PresetB) normalized.lead1PresetB = 'gamelan';

  // Legacy lead density / octave rename migration:
  // Old presets used leadDensity, leadOctave, leadOctaveRange, now lead1*.
  if (typeof raw.leadDensity === 'number' && typeof raw.lead1Density !== 'number') {
    normalized.lead1Density = raw.leadDensity as number;
  }
  if (typeof raw.leadOctave === 'number' && typeof raw.lead1Octave !== 'number') {
    normalized.lead1Octave = raw.leadOctave as number;
  }
  if (typeof raw.leadOctaveRange === 'number' && typeof raw.lead1OctaveRange !== 'number') {
    normalized.lead1OctaveRange = raw.leadOctaveRange as number;
  }

  // Legacy leadReverbSend -> lead1ReverbSend rename migration:
  if (typeof raw.leadReverbSend === 'number' && typeof raw.lead1ReverbSend !== 'number') {
    normalized.lead1ReverbSend = raw.leadReverbSend as number;
  }
  // Legacy leadLevel -> lead1Level rename migration (leadLevel is now always 1.0):
  if (typeof raw.leadLevel === 'number' && typeof raw.lead1Level !== 'number') {
    normalized.lead1Level = raw.leadLevel as number;
  }

  // Legacy waterSpace -> waterReverbSend rename migration:
  if (typeof raw.waterSpace === 'number' && typeof raw.waterReverbSend !== 'number') {
    normalized.waterReverbSend = raw.waterSpace as number;
  }

  // Legacy looper* -> granular* rename migration:
  // Old presets/cloud saves used looper* keys, now granular*.
  for (const key of Object.keys(raw)) {
    if (key.startsWith('looper')) {
      const newKey = 'granular' + key.slice(6);
      if (newKey in DEFAULT_STATE && !(newKey in raw)) {
        (normalized as unknown as Record<string, unknown>)[newKey] = raw[key];
      }
    }
  }

  Object.assign(
    normalized,
    normalizeDynamicsQualityFields(
      normalizeDynamicsErosionAliases(normalized as unknown as Record<string, unknown>),
    ),
  );

  // Defensive sanitization: preserve only valid scalar types and fall back to defaults.
  // Prevents runtime crashes when legacy/cloud presets contain null/invalid values.
  const merged = { ...DEFAULT_STATE, ...normalized } as SliderState;
  if (typeof raw.chordRate === 'number' && raw.chordRate > MAX_CHORDS_PER_PHRASE) {
    merged.chordRate = legacyChordRateSecondsToChordsPerPhrase(raw.chordRate, merged.phraseLength);
  } else {
    merged.chordRate = normalizeChordsPerPhrase(merged.chordRate);
  }
  for (const key of Object.keys(DEFAULT_STATE) as (keyof SliderState)[]) {
    const defaultValue = DEFAULT_STATE[key];
    const value = merged[key];

    if (typeof defaultValue === 'number') {
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
          (merged as unknown as Record<string, unknown>)[key] = defaultValue;
        }
      } else if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        (merged as unknown as Record<string, unknown>)[key] = Number(value);
      } else {
        (merged as unknown as Record<string, unknown>)[key] = defaultValue;
      }
    } else if (typeof defaultValue === 'boolean') {
      if (typeof value !== 'boolean') {
        (merged as unknown as Record<string, unknown>)[key] = defaultValue;
      }
    } else if (typeof defaultValue === 'string') {
      if (typeof value !== 'string') {
        (merged as unknown as Record<string, unknown>)[key] = defaultValue;
      }
    }
  }

  // Apply pad preset morph params.
  const presetA = getPadPreset(merged.padPresetA, 'pad1');
  const presetB = getPadPreset(merged.padPresetB, 'pad1');
  if (presetA && presetB) {
    const morphed = morphPadPresets(presetA, presetB, merged.padMorph);
    for (const k of PAD_PRESET_PARAM_KEYS) {
      if (k in morphed && !Object.prototype.hasOwnProperty.call(raw, k)) {
        (merged as unknown as Record<string, unknown>)[k] = morphed[k];
      }
    }
  }

  const pad2A = getPadPreset(merged.pad2PresetA, 'pad2');
  const pad2B = getPadPreset(merged.pad2PresetB, 'pad2');
  if (pad2A && pad2B) {
    const morphed = morphPadPresets(pad2A, pad2B, merged.pad2Morph);
    for (const k of PAD_PRESET_PARAM_KEYS) {
      if (k in morphed) {
        const pad2Key = PAD1_TO_PAD2_KEY[k];
        if (pad2Key && !Object.prototype.hasOwnProperty.call(raw, pad2Key)) {
          (merged as unknown as Record<string, unknown>)[pad2Key] = morphed[k];
        }
      }
    }
  }

  return enforceProductCorePresetBoundaryState(normalizeDegradeReverbCrossfeed(merged));
};

export function sortSavedStatePresetsByFreshness(presets: SavedPreset[]): SavedPreset[] {
  return [...presets].sort((left, right) => {
    const timeDiff = new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();
    if (timeDiff !== 0) return timeDiff;
    return left.name.localeCompare(right.name);
  });
}

function savedPresetFromSummary(summary: PresetSummary): SavedPreset {
  return {
    id: summary.id,
    name: summary.name,
    timestamp: new Date(summary.updatedAt ?? Date.now()).toISOString(),
    state: DEFAULT_STATE,
    source: savedPresetSourceFor(summary),
    deferred: true,
    tags: summary.tags,
    familyId: summary.familyId,
    familyName: summary.familyName,
    variantId: summary.variantId,
    variantName: summary.variantName,
    variantRank: summary.variantRank,
    versionCount: summary.versionCount,
    currentVersion: summary.currentVersion,
  };
}

export function statePresetEntryToSavedPreset(entry: PresetEntry, versionSelection: 'current' | 'highest' = 'current'): SavedPreset | null {
  const version =
    versionSelection === 'highest'
      ? entry.versions.reduce<(typeof entry.versions)[number] | null>((highest, candidate) => {
          if (!highest || candidate.v > highest.v) return candidate;
          return highest;
        }, null)
      : (entry.versions.find((v) => v.v === entry.currentVersion) ?? entry.versions[entry.versions.length - 1]);
  if (!version) return null;

  const versionData = getVersionData(entry, version.v);
  if (!versionData) return null;

  const migrated = migratePreset({
    name: entry.name,
    timestamp: new Date(version.timestamp).toISOString(),
    state: versionData as unknown as SliderState,
    ...(extractPresetVersionMetadata(version) ?? {}),
  });

  return {
    id: entry.id,
    ...migrated,
    source: savedPresetSourceFor(entry),
    tags: entry.tags,
    familyId: entry.familyId,
    familyName: entry.familyName ?? entry.name,
    variantId: entry.variantId,
    variantName: entry.variantName ?? entry.name,
    variantRank: entry.variantRank,
    versionCount: entry.versions.length,
    currentVersion: entry.currentVersion,
  };
}

export async function loadCapacitorLocalStatePresets(): Promise<SavedPreset[]> {
  const { LocalStoragePresetStore } = await import('./index');
  const store = new LocalStoragePresetStore();
  const summaries = await store.list('state', CAPACITOR_LOCAL_STATE_PRESET_SCOPE);
  const entries = await Promise.all(
    summaries
      .filter((summary) => summary.author !== 'factory' && summary.library !== 'stock')
      .map((summary) => store.load('state', summary.name, CAPACITOR_LOCAL_STATE_PRESET_SCOPE)),
  );

  return sortSavedStatePresetsByFreshness(entries.map((entry) => (entry ? statePresetEntryToSavedPreset(entry) : null)).filter((preset): preset is SavedPreset => !!preset));
}

export async function loadActiveStatePresetStorePresets(): Promise<SavedPreset[]> {
  const { getPresetStore } = await import('./index');
  const store = getPresetStore();
  const summaries = await store.list('state', CAPACITOR_LOCAL_STATE_PRESET_SCOPE);
  return sortSavedStatePresetsByFreshness(summaries.map(savedPresetFromSummary));
}

export async function loadActiveStatePresetStorePresetByName(name: string): Promise<SavedPreset | null> {
  const { getPresetStore } = await import('./index');
  const store = getPresetStore();
  const entry = await store.load('state', name, CAPACITOR_LOCAL_STATE_PRESET_SCOPE);
  return entry ? statePresetEntryToSavedPreset(entry) : null;
}

export async function loadActiveStatePresetStorePresetById(id: string): Promise<SavedPreset | null> {
  const { getPresetStore } = await import('./index');
  const store = getPresetStore();
  const entry = await store.loadById(id);
  return entry ? statePresetEntryToSavedPreset(entry) : null;
}

export async function loadBundledPresetByName(name: string): Promise<SavedPreset | null> {
  const presets = await loadPresetsFromFolder();
  return presets.find((preset) => preset.name === name) ?? null;
}
