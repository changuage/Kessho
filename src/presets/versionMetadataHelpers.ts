import { getVersionData } from './codec';
import { extractPresetVersionMetadata } from './presetUtils';
import { normalizePresetPoolMetadata } from './presetPool';
import type { PresetEntry, PresetVersionMetadata } from './types';
import {
  DRUM_EUCLIDEAN_LANE_COUNT,
  SYNTH_EUCLIDEAN_LANE_COUNT,
} from '../audio/sequencerLaneCounts';
import { normalizeSequencerPitchSettingsArray } from '../audio/sequencerPitchSettings';
import type { ProductPlayConfig } from '../audio/productPlaySequencer';
import type { PitchSettings } from '../ui/sequencer/useEuclideanSequencer';
import { getParamInfo, quantize, type SliderMode, type SliderState } from '../ui/state';
import { getSliderCapability, type SliderCapability } from '../ui/sliderSystem/sliderCapabilities';

/**
 * Canonicalizes slider automation metadata before it is persisted or hashed.
 * The optional capability map is intentionally structural so the shared
 * registry can be introduced without coupling preset storage to UI modules.
 */
export type SliderCapabilityMetadata =
  | SliderCapability
  | { capability?: 'single' | 'walk-only' | 'dual'; allowedModes?: readonly string[]; modes?: readonly string[] };

export type SliderCapabilityLookup =
  | Readonly<Record<string, SliderCapabilityMetadata>>
  | ReadonlyMap<string, SliderCapabilityMetadata>;

function getCapability(key: string, lookup?: SliderCapabilityLookup): SliderCapabilityMetadata | undefined {
  if (!lookup) return getSliderCapability(key);
  return lookup instanceof Map
    ? lookup.get(key)
    : (lookup as Readonly<Record<string, SliderCapabilityMetadata>>)[key];
}

function normalizeBehaviorMode(value: unknown): 'single' | 'walk' | 'sampleHold' {
  return value === 'walk' || value === 'sampleHold' ? value : 'single';
}

function resolveAllowedMode(
  key: string,
  rawMode: unknown,
  lookup?: SliderCapabilityLookup,
): 'walk' | 'sampleHold' | undefined {
  let mode = normalizeBehaviorMode(rawMode);
  if (mode === 'single') return undefined;
  const capability = getCapability(key, lookup);
  // Unknown keys fail closed just like the renderer. Keeping their behavior
  // would create unreachable V2 parameterBehaviorMap nodes.
  if (!capability) return undefined;
  const kind = typeof capability === 'string' ? capability : capability?.capability;
  const explicitModes = typeof capability === 'object'
    ? (capability.allowedModes ?? capability.modes)
    : undefined;
  if (explicitModes && !explicitModes.includes(mode)) {
    // Walk-only registries commonly advertise only `walk`; sample-hold is a
    // safe downgrade rather than an unreachable persisted mode.
    mode = explicitModes.includes('walk') ? 'walk' : 'single';
  } else if (kind === 'single') {
    mode = 'single';
  } else if (kind === 'walk-only' && mode === 'sampleHold') {
    mode = 'walk';
  }
  return mode === 'single' ? undefined : mode;
}

function quantizeBehaviorEndpoint(key: string, value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const info = getParamInfo(key as keyof SliderState);
  // A few legacy ranges (notably cutoff) were stored in normalized [-1, 1]
  // coordinates even though the live parameter uses an absolute Hz domain.
  // Keep those values lossless; quantize/clamp when the range is in the same
  // normalized domain or when the value is clearly an absolute-domain value.
  if (info && (info.min <= 1 && info.max >= -1 || Math.abs(value) > 1)) {
    return quantize(key as keyof SliderState, value);
  }
  // Six decimal places is below UI/audio control precision while improving
  // content-addressed deduplication for equivalent floating point payloads.
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function sanitizePresetParameterBehaviorMetadata(
  metadata: Pick<PresetVersionMetadata, 'sliderModes' | 'dualRanges'> | undefined,
  capabilities?: SliderCapabilityLookup,
): Pick<PresetVersionMetadata, 'sliderModes' | 'dualRanges'> {
  const sliderModes: Record<string, SliderMode> = {};
  const dualRanges: Record<string, { min: number; max: number }> = {};
  const keys = new Set([
    ...Object.keys(metadata?.sliderModes ?? {}),
    ...Object.keys(metadata?.dualRanges ?? {}),
  ]);
  for (const key of keys) {
    const mode = resolveAllowedMode(key, metadata?.sliderModes?.[key], capabilities);
    if (!mode) continue;
    sliderModes[key] = mode;
    const rawRange = metadata?.dualRanges?.[key];
    const min = quantizeBehaviorEndpoint(key, rawRange?.min);
    const max = quantizeBehaviorEndpoint(key, rawRange?.max);
    if (min !== undefined && max !== undefined) {
      dualRanges[key] = { min: Math.min(min, max), max: Math.max(min, max) };
    }
  }
  return {
    sliderModes: Object.keys(sliderModes).length ? sliderModes : undefined,
    dualRanges: Object.keys(dualRanges).length ? dualRanges : undefined,
  };
}

function cloneJson<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Fall through to JSON clone.
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function normalizeStatePresetPitchMetadata(source: {
  drumPitchSettings?: readonly unknown[];
  synthPitchSettings?: readonly unknown[];
}): Pick<PresetVersionMetadata, 'drumPitchSettings' | 'synthPitchSettings'> {
  return {
    drumPitchSettings: normalizeSequencerPitchSettingsArray(
      source.drumPitchSettings,
      DRUM_EUCLIDEAN_LANE_COUNT,
    ) as PitchSettings[],
    synthPitchSettings: normalizeSequencerPitchSettingsArray(
      source.synthPitchSettings,
      SYNTH_EUCLIDEAN_LANE_COUNT,
    ) as PitchSettings[],
  };
}

export function preparePresetVersionMetadataForV2Storage(
  metadata: PresetVersionMetadata | undefined,
  isL4State: boolean,
): PresetVersionMetadata | undefined {
  if (!metadata) return undefined;
  const next = { ...metadata };
  // Canonicalize legacy ARP-only metadata when a loaded preset is saved again.
  const legacyPlayConfigs = (next as Record<string, unknown>).synthArpConfigs;
  if (next.synthPlayConfigs === undefined && legacyPlayConfigs !== undefined) {
    next.synthPlayConfigs = cloneJson(legacyPlayConfigs) as PresetVersionMetadata['synthPlayConfigs'];
  }
  delete (next as Record<string, unknown>).synthArpConfigs;
  delete next.refs;
  if (isL4State) delete next.presetPool;
  const behavior = sanitizePresetParameterBehaviorMetadata(next);
  if (behavior.sliderModes) next.sliderModes = behavior.sliderModes;
  else delete next.sliderModes;
  if (behavior.dualRanges) next.dualRanges = behavior.dualRanges;
  else delete next.dualRanges;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function buildPresetVersionMetadata(
  source: Partial<PresetVersionMetadata> | null | undefined,
): PresetVersionMetadata | undefined {
  if (!source) return undefined;

  const metadata: PresetVersionMetadata = {};
  let hasMetadata = false;

  const behavior = sanitizePresetParameterBehaviorMetadata(source);
  const filteredSliderModes = behavior.sliderModes;

  if (source.routingMuteGroups) {
    metadata.routingMuteGroups = cloneJson(source.routingMuteGroups);
    hasMetadata = true;
  }

  if (behavior.dualRanges) {
    const nextDualRanges = behavior.dualRanges;
    if (Object.keys(nextDualRanges).length > 0) {
      metadata.dualRanges = cloneJson(nextDualRanges);
      hasMetadata = true;
    }
  }

  if (filteredSliderModes && Object.keys(filteredSliderModes).length > 0) {
    metadata.sliderModes = cloneJson(filteredSliderModes);
    hasMetadata = true;
  }

  if (source.drumEvolveConfigs && source.drumEvolveConfigs.length > 0) {
    metadata.drumEvolveConfigs = cloneJson(source.drumEvolveConfigs);
    hasMetadata = true;
  }

  if (source.synthEvolveConfigs && source.synthEvolveConfigs.length > 0) {
    metadata.synthEvolveConfigs = cloneJson(source.synthEvolveConfigs);
    hasMetadata = true;
  }

  if (source.drumStepOverrides && Object.keys(source.drumStepOverrides).length > 0) {
    metadata.drumStepOverrides = cloneJson(source.drumStepOverrides);
    hasMetadata = true;
  }

  if (source.synthStepOverrides && Object.keys(source.synthStepOverrides).length > 0) {
    metadata.synthStepOverrides = cloneJson(source.synthStepOverrides);
    hasMetadata = true;
  }

  if (source.drumClockDivs && source.drumClockDivs.length > 0) {
    metadata.drumClockDivs = cloneJson(source.drumClockDivs);
    hasMetadata = true;
  }

  if (source.synthClockDivs && source.synthClockDivs.length > 0) {
    metadata.synthClockDivs = cloneJson(source.synthClockDivs);
    hasMetadata = true;
  }

  if (source.drumSwings && source.drumSwings.length > 0) {
    metadata.drumSwings = cloneJson(source.drumSwings);
    hasMetadata = true;
  }

  if (source.synthSwings && source.synthSwings.length > 0) {
    metadata.synthSwings = cloneJson(source.synthSwings);
    hasMetadata = true;
  }

  if (source.drumLinked && source.drumLinked.length > 0) {
    metadata.drumLinked = cloneJson(source.drumLinked);
    hasMetadata = true;
  }

  if (source.synthLinked && source.synthLinked.length > 0) {
    metadata.synthLinked = cloneJson(source.synthLinked);
    hasMetadata = true;
  }

  if (source.drumSubLaneStates && source.drumSubLaneStates.length > 0) {
    metadata.drumSubLaneStates = cloneJson(source.drumSubLaneStates);
    hasMetadata = true;
  }

  if (source.synthSubLaneStates && source.synthSubLaneStates.length > 0) {
    metadata.synthSubLaneStates = cloneJson(source.synthSubLaneStates);
    hasMetadata = true;
  }

  const legacyPlayConfigs = (source as Record<string, unknown>).synthArpConfigs as ProductPlayConfig[] | undefined;
  const synthPlayConfigs = source.synthPlayConfigs ?? legacyPlayConfigs;
  if (synthPlayConfigs && synthPlayConfigs.length > 0) {
    metadata.synthPlayConfigs = cloneJson(synthPlayConfigs);
    hasMetadata = true;
  }

  if (source.drumPitchSettings && source.drumPitchSettings.length > 0) {
    metadata.drumPitchSettings = cloneJson(source.drumPitchSettings);
    hasMetadata = true;
  }

  if (source.synthPitchSettings && source.synthPitchSettings.length > 0) {
    metadata.synthPitchSettings = cloneJson(source.synthPitchSettings);
    hasMetadata = true;
  }

  if (source.synthPitchBindingModes && source.synthPitchBindingModes.length > 0) {
    metadata.synthPitchBindingModes = cloneJson(source.synthPitchBindingModes);
    hasMetadata = true;
  }

  if (source.drumScatterState) {
    metadata.drumScatterState = cloneJson(source.drumScatterState);
    hasMetadata = true;
  }

  if (source.journeyPreview) {
    metadata.journeyPreview = cloneJson(source.journeyPreview);
    hasMetadata = true;
  }

  const presetPool = normalizePresetPoolMetadata(source.presetPool);
  if (presetPool && Object.keys(presetPool.pools).length > 0) {
    metadata.presetPool = presetPool;
    hasMetadata = true;
  }

  if (source.refs && Object.keys(source.refs).length > 0) {
    metadata.refs = cloneJson(source.refs);
    hasMetadata = true;
  }

  return hasMetadata ? metadata : undefined;
}

export function getPresetVersionSnapshot(
  entry: PresetEntry,
  versionNum?: number,
): { data: Record<string, unknown>; metadata?: PresetVersionMetadata } | null {
  const version = versionNum !== undefined
    ? entry.versions.find(candidate => candidate.v === versionNum)
    : (entry.versions.find(candidate => candidate.v === entry.currentVersion)
      ?? entry.versions[entry.versions.length - 1]);
  if (!version) return null;

  const data = getVersionData(entry, version.v);
  if (!data) return null;

  return {
    data,
    metadata: extractPresetVersionMetadata(version),
  };
}
