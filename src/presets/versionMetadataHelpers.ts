import { getVersionData } from './codec';
import { extractPresetVersionMetadata } from './presetUtils';
import { normalizePresetPoolMetadata } from './presetPool';
import type { PresetEntry, PresetVersionMetadata } from './types';
import {
  DRUM_EUCLIDEAN_LANE_COUNT,
  SYNTH_EUCLIDEAN_LANE_COUNT,
} from '../audio/sequencerLaneCounts';
import { normalizeSequencerPitchSettingsArray } from '../audio/sequencerPitchSettings';
import type { PitchSettings } from '../ui/sequencer/useEuclideanSequencer';

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
  if (next.synthPlayConfigs === undefined && next.synthArpConfigs !== undefined) {
    next.synthPlayConfigs = cloneJson(next.synthArpConfigs);
  }
  delete next.synthArpConfigs;
  delete next.refs;
  if (isL4State) delete next.presetPool;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function buildPresetVersionMetadata(
  source: Partial<PresetVersionMetadata> | null | undefined,
): PresetVersionMetadata | undefined {
  if (!source) return undefined;

  const metadata: PresetVersionMetadata = {};
  let hasMetadata = false;

  const filteredSliderModes = source.sliderModes
    ? Object.fromEntries(
        Object.entries(source.sliderModes).filter(([, mode]) => mode !== 'single'),
      )
    : undefined;

  if (source.routingMuteGroups) {
    metadata.routingMuteGroups = cloneJson(source.routingMuteGroups);
    hasMetadata = true;
  }

  if (source.dualRanges) {
    const nextDualRanges = filteredSliderModes
      ? Object.fromEntries(
          Object.entries(source.dualRanges).filter(([key]) => key in filteredSliderModes),
        )
      : source.dualRanges;
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

  const synthPlayConfigs = source.synthPlayConfigs ?? source.synthArpConfigs;
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
