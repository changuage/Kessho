import { PARAM_REGISTRY, type ParamLevel } from './ParamRegistry';
import { PRESET_VERSION_METADATA_FIELDS } from './presetUtils';

export type PresetPersistenceOwner =
  | 'portable-content'
  | 'slot-binding'
  | 'arrangement-global'
  | 'identity-metadata'
  | 'derived-runtime-cache'
  | 'user-preference';

export type PresetOwnershipContext = 'state-composition' | 'named-leaf';

export interface PresetContentOwnershipEntry {
  key: string;
  owner: PresetPersistenceOwner;
  context: PresetOwnershipContext | 'metadata';
  level?: ParamLevel;
  scope?: string;
}

const DERIVED_STATE_SCOPES = new Set([
  'pad1',
  'pad2',
  'drumSub',
  'drumKick',
  'drumClick',
  'drumBeepHi',
  'drumBeepLo',
  'drumNoise',
  'drumMembrane',
  'granularVoice1',
  'granularVoice2',
  'granularVoice3',
  'granularVoice4',
  'granularLegacy',
  'legacyGranular',
  'water',
]);

const HARMONY_CONTENT_KEYS = new Set([
  'rootNote',
  'scaleMode',
  'tension',
  'voicingSpread',
  'harmonyChordSlots',
  'harmonyChordSlotsA',
  'harmonyChordSlotsB',
  'harmonyChordSequence',
  'harmonyChordSequenceA',
  'harmonyChordSequenceB',
]);

const SEQUENCER_ARRANGEMENT_KEYS = new Set([
  'synthSequencerFaces',
  'synthSequencerChain',
  'drumSequencerChain',
  'synthEuclideanMasterEnabled',
  'synthEuclidBaseBPM',
  'synthEuclideanTempo',
  'drumEuclidMasterEnabled',
  'drumEuclidBaseBPM',
  'drumEuclidTempo',
  'drumEuclidSwing',
  'drumEuclidDivision',
]);

const SLOT_BINDING_KEYS = new Set([
  'padEnabled',
  'pad2Enabled',
  'leadEnabled',
  'lead2Enabled',
  'sample1Enabled',
  'sample2Enabled',
  'pianoEnabled',
  'insectsEnabled',
  'insects2Enabled',
  'waterEnabled',
  'granularEnabled',
  'synthVoiceMask',
  'synthChordGeneratorSource',
  'synthChordSequencerSource',
  'padDiffuseSend',
  'padDistance',
  'padFitEnvelopeToChord',
  'padPostLPF',
  'padStereoWidth',
  'pad2DiffuseSend',
  'pad2Distance',
  'pad2FitEnvelopeToChord',
  'pad2PostLPF',
  'pad2StereoWidth',
]);

const METADATA_OWNERS: Readonly<Record<string, PresetPersistenceOwner>> = Object.freeze({
  routingMuteGroups: 'portable-content',
  dualRanges: 'portable-content',
  sliderModes: 'portable-content',
  drumEvolveConfigs: 'portable-content',
  synthEvolveConfigs: 'portable-content',
  drumStepOverrides: 'portable-content',
  synthStepOverrides: 'portable-content',
  drumClockDivs: 'portable-content',
  synthClockDivs: 'portable-content',
  drumSwings: 'portable-content',
  synthSwings: 'portable-content',
  drumLinked: 'portable-content',
  synthLinked: 'portable-content',
  drumSubLaneStates: 'portable-content',
  synthSubLaneStates: 'portable-content',
  synthArpConfigs: 'portable-content',
  drumPitchSettings: 'portable-content',
  synthPitchSettings: 'portable-content',
  synthPitchBindingModes: 'portable-content',
  journeyPreview: 'identity-metadata',
  presetPool: 'user-preference',
  refs: 'identity-metadata',
});

function isSequencerBindingKey(key: string): boolean {
  return /^synthEuclid\d+(?:Enabled|Solo|Level|Source|VoiceMask|ResumeQuantization)$/.test(key)
    || /^drumEuclid\d+(?:Enabled|Solo|Level|ResumeQuantization|Target[A-Za-z0-9]+)$/.test(key);
}

function isMixBindingKey(key: string, level: ParamLevel): boolean {
  if (SLOT_BINDING_KEYS.has(key)) return true;
  if (/^granularV\d+(?:Enabled|Gain)$/.test(key)) return true;
  if (/^dynamicsEq\d+Enabled$/.test(key)) return true;
  if (isSequencerBindingKey(key)) return true;
  if (level !== 4) {
    return /^(?:sample1|sample2)(?:DiffuseSend|ReverbSend)$/.test(key);
  }
  return /(?:Level|ReverbSend|DelayASend|DelayBSend|GranularSend|DegradeSend|DynamicsBus|Bus|Target)$/.test(key);
}

function stateCompositionOwner(
  key: string,
  entry: { level: ParamLevel; scope: string },
): PresetPersistenceOwner {
  if (isMixBindingKey(key, entry.level)) return 'slot-binding';
  if (HARMONY_CONTENT_KEYS.has(key)) return 'portable-content';
  if (SEQUENCER_ARRANGEMENT_KEYS.has(key)) return 'arrangement-global';
  if (DERIVED_STATE_SCOPES.has(entry.scope)) return 'derived-runtime-cache';
  if (entry.scope === 'synthEuclidean' || entry.scope === 'drumEuclidean') return 'portable-content';
  if (entry.level < 4) return 'portable-content';
  return 'arrangement-global';
}

export function getPresetContentOwner(
  key: string,
  context: PresetOwnershipContext = 'state-composition',
): PresetPersistenceOwner | undefined {
  const entry = PARAM_REGISTRY[key];
  if (!entry) return undefined;
  if (context === 'named-leaf') return 'portable-content';
  return stateCompositionOwner(key, entry);
}

export function getPresetMetadataOwner(key: string): PresetPersistenceOwner | undefined {
  return METADATA_OWNERS[key];
}

export function auditPresetContentOwnership(): {
  entries: PresetContentOwnershipEntry[];
  counts: Record<PresetPersistenceOwner, number>;
  unowned: string[];
  duplicateMetadataKeys: string[];
} {
  const entries: PresetContentOwnershipEntry[] = [];
  const unowned: string[] = [];
  const counts: Record<PresetPersistenceOwner, number> = {
    'portable-content': 0,
    'slot-binding': 0,
    'arrangement-global': 0,
    'identity-metadata': 0,
    'derived-runtime-cache': 0,
    'user-preference': 0,
  };

  for (const [key, registryEntry] of Object.entries(PARAM_REGISTRY)) {
    const owner = getPresetContentOwner(key, 'state-composition');
    if (!owner) {
      unowned.push(key);
      continue;
    }
    counts[owner] += 1;
    entries.push({
      key,
      owner,
      context: 'state-composition',
      level: registryEntry.level,
      scope: registryEntry.scope,
    });
  }

  const metadataKeys = [...PRESET_VERSION_METADATA_FIELDS, 'refs'];
  const seenMetadata = new Set<string>();
  const duplicateMetadataKeys: string[] = [];
  for (const key of metadataKeys) {
    if (seenMetadata.has(key)) duplicateMetadataKeys.push(key);
    seenMetadata.add(key);
    const owner = getPresetMetadataOwner(key);
    if (!owner) {
      unowned.push(`metadata:${key}`);
      continue;
    }
    counts[owner] += 1;
    entries.push({ key, owner, context: 'metadata' });
  }

  return {
    entries,
    counts,
    unowned: unowned.sort(),
    duplicateMetadataKeys: duplicateMetadataKeys.sort(),
  };
}

export const PRESET_METADATA_OWNERSHIP = METADATA_OWNERS;
