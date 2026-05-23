import assert from 'node:assert/strict';

import { createLegacyStatePresetEntry } from './fileIO';
import {
  hashCanonicalJson,
  materializePresetVersion,
  normalizeResolvedVersionData,
  type PresetVersionV2Row,
} from './presetStorageV2';
import { compressVersions, getVersionData } from './codec';
import {
  buildDerivedStatePresetData,
  extractOptimizedStatePresetData,
} from './statePresetOptimization';
import { isStatePresetDiffKeyActive, normalizeStatePresetDiffData } from './statePresetDiffs';
import { buildPresetVersionMetadata, getPresetVersionSnapshot } from './versionMetadataHelpers';
import { buildJourneyPresetPreview } from './journeyPresetPreview';
import { normalizePresetSummary } from './presetUtils';
import type { PresetEntry } from './types';
import { DEFAULT_STATE, migratePreset, type SavedPreset } from '../ui/state';
import { createEmptyStepOverrides, serializeStepOverrides } from '../ui/sequencer/stepOverrideSerialization';
import {
  applySequencePresetClockDivs,
  applySequencePresetEvolveConfigs,
  applySequencePresetLinked,
  applySequencePresetOverrides,
  applySequencePresetPitchBindingModes,
  applySequencePresetPitchSettings,
  applySequencePresetSubLaneStates,
  applySequencePresetSwings,
  copySequenceLaneForPreset,
  copySequenceLaneStateForPreset,
} from '../ui/sequencer/sequencePresetLane';
import type {
  EvolveConfig,
  PitchSettings,
  SubLaneKind,
  SubLaneState,
} from '../ui/sequencer/useEuclideanSequencer';
import type { PitchBindingMode } from '../audio/drumSeqTypes';
import { createDiamondJourney, createJourneyConnection } from '../audio/journeyTypes';
import {
  decodeJourneyPresetData,
  encodeJourneyPresetData,
  getJourneyNodeRefSlot,
  journeyDataReferencesStatePreset,
  removeStatePresetRefFromJourneyData,
  validateJourneyConfig,
} from './journeyPresetCodec';
import { coerceJourneyPresetEntry } from './useJourneyPresets';

const SYNTH_BINDING_MODES = ['sequence', 'linked', 'polyrhythmic', 'polyrhythmic'] as const;

function makeSubLaneState(): Record<SubLaneKind, SubLaneState> {
  return {
    pitch: { enabled: false, steps: 5, direction: 'forward', scaleQuantize: false },
    expression: { enabled: false, steps: 4, direction: 'forward', valueMode: 'sequence', rangeMin: 0.75, rangeMax: 1 },
    morph: { enabled: false, steps: 4, direction: 'forward', valueMode: 'sequence', rangeMin: 0.25, rangeMax: 0.75 },
    distance: { enabled: false, steps: 4, direction: 'forward', valueMode: 'sequence', rangeMin: 0, rangeMax: 1 },
    slice: { enabled: false, steps: 4, direction: 'forward' },
    reverse: { enabled: false, steps: 4, direction: 'forward' },
  };
}

function testMigratePresetPreservesSynthPitchBindingModes(): void {
  const migrated = migratePreset({
    name: 'Binding Check',
    timestamp: '2026-04-21T00:00:00.000Z',
    state: { ...DEFAULT_STATE },
    synthPitchBindingModes: [...SYNTH_BINDING_MODES],
  });

  assert.deepStrictEqual(
    migrated.synthPitchBindingModes,
    [...SYNTH_BINDING_MODES],
    'migratePreset should preserve synthPitchBindingModes',
  );
}

function testBuildPresetVersionMetadataIncludesAllSupportedFields(): void {
  const metadata = buildPresetVersionMetadata({
    dualRanges: {
      filterCutoffMin: { min: 0.1, max: 0.9 },
      ignoredSingle: { min: 0.2, max: 0.8 },
    },
    sliderModes: {
      filterCutoffMin: 'walk',
      ignoredSingle: 'single',
    },
    drumEvolveConfigs: [{ enabled: true, evolution: 0.5 }] as SavedPreset['drumEvolveConfigs'],
    synthEvolveConfigs: [{ enabled: true, evolution: 0.75 }] as SavedPreset['synthEvolveConfigs'],
    drumStepOverrides: {
      triggerToggles: [[{ step: 3, value: true }], [], [], []],
    },
    synthStepOverrides: {
      triggerToggles: [[{ step: 5, value: true }], [], [], []],
    },
    drumClockDivs: ['1/8', '1/16', '1/8T', '1/4'],
    synthClockDivs: ['1/4', '1/8', '1/16', '1/32'],
    drumSwings: [0, 0.1, 0.2, 0.3],
    synthSwings: [0.05, 0, 0.15, 0],
    drumLinked: [false, true, false, true],
    synthLinked: [true, false, false, true],
    drumSubLaneStates: [{ trigger: { enabled: true, steps: 8, direction: 'forward' } }] as SavedPreset['drumSubLaneStates'],
    synthSubLaneStates: [{ trigger: { enabled: false, steps: 16, direction: 'reverse' } }] as SavedPreset['synthSubLaneStates'],
    synthPitchSettings: [
      { mode: 'notes', root: 62, scale: 'Dorian' },
      { mode: 'semitones', root: 60, scale: 'Major' },
      { mode: 'noteRange', root: 60, scale: 'Major' },
      { mode: 'notes', root: 57, scale: 'Minor' },
    ],
    synthPitchBindingModes: [...SYNTH_BINDING_MODES],
  });

  assert.deepStrictEqual(metadata, {
    dualRanges: {
      filterCutoffMin: { min: 0.1, max: 0.9 },
    },
    sliderModes: {
      filterCutoffMin: 'walk',
    },
    drumEvolveConfigs: [{ enabled: true, evolution: 0.5 }],
    synthEvolveConfigs: [{ enabled: true, evolution: 0.75 }],
    drumStepOverrides: {
      triggerToggles: [[{ step: 3, value: true }], [], [], []],
    },
    synthStepOverrides: {
      triggerToggles: [[{ step: 5, value: true }], [], [], []],
    },
    drumClockDivs: ['1/8', '1/16', '1/8T', '1/4'],
    synthClockDivs: ['1/4', '1/8', '1/16', '1/32'],
    drumSwings: [0, 0.1, 0.2, 0.3],
    synthSwings: [0.05, 0, 0.15, 0],
    drumLinked: [false, true, false, true],
    synthLinked: [true, false, false, true],
    drumSubLaneStates: [{ trigger: { enabled: true, steps: 8, direction: 'forward' } }],
    synthSubLaneStates: [{ trigger: { enabled: false, steps: 16, direction: 'reverse' } }],
    synthPitchSettings: [
      { mode: 'notes', root: 62, scale: 'Dorian' },
      { mode: 'semitones', root: 60, scale: 'Major' },
      { mode: 'noteRange', root: 60, scale: 'Major' },
      { mode: 'notes', root: 57, scale: 'Minor' },
    ],
    synthPitchBindingModes: [...SYNTH_BINDING_MODES],
  });
}

function testGetPresetVersionSnapshotReturnsSelectedVersionMetadata(): void {
  const entry: PresetEntry = {
    type: 'state',
    scope: 'global',
    name: 'Snapshot Test',
    author: 'user',
    versions: [
      {
        v: 1,
        note: 'base',
        timestamp: 1,
        data: { masterVolume: 0.3 },
        synthPitchBindingModes: ['polyrhythmic', 'polyrhythmic', 'polyrhythmic', 'polyrhythmic'],
      },
      {
        v: 2,
        note: 'updated',
        timestamp: 2,
        data: { masterVolume: 0.5 },
        dualRanges: { masterVolume: { min: 0.4, max: 0.8 } },
        sliderModes: { masterVolume: 'walk' },
        synthPitchBindingModes: [...SYNTH_BINDING_MODES],
      },
    ],
    currentVersion: 2,
    createdAt: 1,
    updatedAt: 2,
  };

  const snapshot = getPresetVersionSnapshot(entry, 2);

  assert.deepStrictEqual(snapshot, {
    data: { masterVolume: 0.5 },
    metadata: {
      dualRanges: { masterVolume: { min: 0.4, max: 0.8 } },
      sliderModes: { masterVolume: 'walk' },
      synthPitchBindingModes: [...SYNTH_BINDING_MODES],
    },
  });
}

function testLegacyImportPreservesSynthPitchBindingModes(): void {
  const entry = createLegacyStatePresetEntry({
    name: 'Legacy Import',
    timestamp: '2026-04-21T00:00:00.000Z',
    state: { ...DEFAULT_STATE },
    synthPitchBindingModes: [...SYNTH_BINDING_MODES],
  } as SavedPreset);

  assert.deepStrictEqual(
    entry.versions[0]?.synthPitchBindingModes,
    [...SYNTH_BINDING_MODES],
    'legacy import should preserve synthPitchBindingModes metadata',
  );
}

function testSequenceLanePresetRoundTripKeepsRuntimeLaneState(): void {
  const sourceOverrides = createEmptyStepOverrides();
  sourceOverrides.triggerToggles[2]!.set(3, false);
  sourceOverrides.pitch[2] = [0, 2, 4];
  sourceOverrides.expression[2] = [0.4, 0.8];
  sourceOverrides.expressionDirection[2] = 'reverse';
  sourceOverrides.expressionRanges![2] = { min: 0.2, max: 0.7 };

  const serializedOverrides = serializeStepOverrides(copySequenceLaneForPreset(sourceOverrides, 2));
  const appliedOverrides = applySequencePresetOverrides(createEmptyStepOverrides(), serializedOverrides, 1);

  assert.equal(appliedOverrides.triggerToggles[1]?.get(3), false);
  assert.deepStrictEqual(appliedOverrides.pitch[1], [0, 2, 4]);
  assert.deepStrictEqual(appliedOverrides.expression[1], [0.4, 0.8]);
  assert.equal(appliedOverrides.expressionDirection[1], 'reverse');
  assert.deepStrictEqual(appliedOverrides.expressionRanges?.[1], { min: 0.2, max: 0.7 });

  const sourceSubLaneStates = Array.from({ length: 4 }, makeSubLaneState);
  sourceSubLaneStates[2] = {
    ...makeSubLaneState(),
    pitch: { enabled: true, steps: 7, direction: 'pingpong', scaleQuantize: true },
    expression: { enabled: true, steps: 3, direction: 'reverse', valueMode: 'range', rangeMin: 0.3, rangeMax: 0.9 },
  };
  const evolveConfigs: EvolveConfig[] = Array.from({ length: 4 }, () => ({
    enabled: false,
    everyBars: 4,
    evolution: 0.25,
    writeOffset: 0,
    mutationMode: 'biased',
    methods: { swingDrift: true },
  }));
  evolveConfigs[2] = {
    enabled: true,
    everyBars: 8,
    evolution: 0.65,
    writeOffset: 'auto',
    mutationMode: 'strict',
    methods: { triggerToggle: true, valueDrift: true },
    enabledSubLanes: ['pitch', 'expression'],
  };
  const pitchSettings: PitchSettings[] = Array.from({ length: 4 }, () => ({ mode: 'semitones', root: 60, scale: 'Major' }));
  pitchSettings[2] = { mode: 'notes', root: 67, scale: 'Dorian' };
  const pitchBindingModes: PitchBindingMode[] = ['polyrhythmic', 'polyrhythmic', 'sequence', 'linked'];

  const serializedState = copySequenceLaneStateForPreset({
    laneIdx: 2,
    subLaneStates: sourceSubLaneStates,
    clockDivs: ['1/8', '1/16', '1/4', '1/32'],
    swings: [0, 0.1, 0.2, 0.3],
    linked: [false, false, true, false],
    evolveConfigs,
    pitchSettings,
    pitchBindingModes,
  });

  const targetSubLaneStates = Array.from({ length: 4 }, makeSubLaneState);
  const appliedSubLaneStates = applySequencePresetSubLaneStates(targetSubLaneStates, serializedState, 1);
  assert.deepStrictEqual(appliedSubLaneStates[1]?.pitch, sourceSubLaneStates[2]?.pitch);
  assert.deepStrictEqual(appliedSubLaneStates[1]?.expression, sourceSubLaneStates[2]?.expression);
  assert.deepStrictEqual(applySequencePresetClockDivs(['1/8', '1/8', '1/8', '1/8'], serializedState, 1), ['1/8', '1/4', '1/8', '1/8']);
  assert.deepStrictEqual(applySequencePresetSwings([0, 0, 0, 0], serializedState, 1), [0, 0.2, 0, 0]);
  assert.deepStrictEqual(applySequencePresetLinked([false, false, false, false], serializedState, 1), [false, true, false, false]);
  assert.deepStrictEqual(applySequencePresetPitchSettings([
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'semitones', root: 60, scale: 'Major' },
  ], serializedState, 1)[1], pitchSettings[2]);
  assert.deepStrictEqual(
    applySequencePresetPitchBindingModes(['polyrhythmic', 'polyrhythmic', 'polyrhythmic', 'polyrhythmic'], serializedState, 1),
    ['polyrhythmic', 'sequence', 'polyrhythmic', 'polyrhythmic'],
  );
  assert.deepStrictEqual(applySequencePresetEvolveConfigs(evolveConfigs.map((config) => ({ ...config, enabled: false })), serializedState, 1)[1], evolveConfigs[2]);
}

function testOptimizedStatePresetRoundTripKeepsOnlyOverrides(): void {
  const selectorState = {
    ...DEFAULT_STATE,
    padPresetA: 'harsh_pluck',
    padPresetB: 'harsh_pluck',
    padMorph: 0,
    granularPreset: 'legacy_cloud',
    drumKickPresetA: 'Ikeda Kick',
    drumKickPresetB: 'Ikeda Kick',
    drumKickMorph: 0,
  };
  const baseState = {
    ...selectorState,
    ...buildDerivedStatePresetData(selectorState),
  };

  const overriddenState = {
    ...baseState,
    hardness: (baseState.hardness ?? 0) + 0.11,
    drumKickFreq: (baseState.drumKickFreq ?? 0) + 7,
  };

  const optimized = extractOptimizedStatePresetData(overriddenState);

  assert.equal(optimized.padPresetA, 'harsh_pluck');
  assert.equal(optimized.granularPreset, 'legacy_cloud');
  assert.equal(optimized.hardness, overriddenState.hardness);
  assert.equal(optimized.drumKickFreq, overriddenState.drumKickFreq);
  assert.equal('warmth' in optimized, false, 'unchanged pad params should be omitted');
  assert.equal('drumKickDecay' in optimized, false, 'unchanged drum params should be omitted');
  assert.equal('granularV1Mode' in optimized, false, 'unchanged granular params should be omitted');

  const roundTrip = migratePreset({
    name: 'Optimized State',
    timestamp: '2026-04-21T00:00:00.000Z',
    state: optimized,
  });

  assert.equal(roundTrip.state.hardness, overriddenState.hardness);
  assert.equal(roundTrip.state.drumKickFreq, overriddenState.drumKickFreq);
  assert.equal(roundTrip.state.warmth, overriddenState.warmth);
  assert.equal(roundTrip.state.drumKickDecay, overriddenState.drumKickDecay);
  assert.equal(roundTrip.state.granularV1Mode, overriddenState.granularV1Mode);
}

function testStatePresetDiffIgnoresInactiveMixerValues(): void {
  const saved = {
    ...DEFAULT_STATE,
    padEnabled: false,
    synthLevel: 0.54,
    pad1ReverbSend: 0.44,
    pianoEnabled: false,
    pianoLevel: 0.8,
    pianoReverbSend: 0.7,
    birdsEnabled: false,
    birdsLevel: 0.6,
    natureLevel: 0.9,
    natureReverbSend: 0.5,
  } as unknown as Record<string, unknown>;
  const current = {
    ...saved,
    padEnabled: true,
    pianoLevel: 0.2,
    pianoReverbSend: 0.1,
    birdsLevel: 0.2,
    natureLevel: 0.4,
    natureReverbSend: 0.1,
  };

  const normalizedSaved = normalizeStatePresetDiffData(saved);
  const normalizedCurrent = normalizeStatePresetDiffData(current);

  assert.equal(normalizedSaved.synthLevel, 0, 'disabled pad level should compare as silent');
  assert.equal(normalizedCurrent.synthLevel, 0.54, 'enabled pad level should remain visible');
  assert.equal(normalizedSaved.pianoLevel, 0, 'disabled saved piano level should compare as silent');
  assert.equal(normalizedCurrent.pianoLevel, 0, 'disabled current piano level should compare as silent');
  assert.equal(normalizedSaved.birdsLevel, 0, 'disabled saved birds level should compare as silent');
  assert.equal(normalizedCurrent.birdsLevel, 0, 'disabled current birds level should compare as silent');
  assert.equal(normalizedSaved.natureReverbSend, 0, 'disabled saved nature send should compare as silent');
  assert.equal(normalizedCurrent.natureReverbSend, 0, 'disabled current nature send should compare as silent');
  assert.equal(isStatePresetDiffKeyActive(current, 'pianoLevel'), false);
  assert.equal(isStatePresetDiffKeyActive({ ...current, pianoEnabled: true }, 'pianoLevel'), true);
}

function testMaterializedV2VersionPreservesAncillaryMetadata(): void {
  const metadata = buildPresetVersionMetadata({
    drumClockDivs: ['1/8', '1/16', '1/4', '1/32T'],
    synthClockDivs: ['1/4', '1/8', '1/16', '1/32'],
    drumSwings: [0, 0.1, 0.2, 0.3],
    synthSwings: [0.05, 0.1, 0, 0.25],
    drumLinked: [true, false, true, false],
    synthLinked: [false, true, false, true],
    drumEvolveConfigs: [{ enabled: true, evolution: 0.4 }] as SavedPreset['drumEvolveConfigs'],
    synthEvolveConfigs: [{ enabled: true, evolution: 0.8 }] as SavedPreset['synthEvolveConfigs'],
    drumStepOverrides: {
      triggerToggles: [[{ step: 9, value: true }], [], [], []],
    },
    synthPitchSettings: [
      { mode: 'notes', root: 64, scale: 'Lydian' },
      { mode: 'semitones', root: 60, scale: 'Major' },
      { mode: 'noteRange', root: 60, scale: 'Major' },
      { mode: 'notes', root: 55, scale: 'Minor' },
    ],
    synthPitchBindingModes: [...SYNTH_BINDING_MODES],
  });
  assert.ok(metadata, 'test metadata should not be empty');

  const row: PresetVersionV2Row = {
    id: 'version-id',
    preset_id: 'preset-id',
    version_no: 7,
    created_by: null,
    parent_version_id: 'parent-version-id',
    storage_mode: 'checkpoint',
    note: 'round trip',
    override_hash: 'override',
    metadata_hash: 'metadata',
    patch_from_prev_hash: null,
    resolved_hash: 'resolved',
    is_checkpoint: true,
    created_at: '2026-04-28T00:00:00.000Z',
  };

  const version = materializePresetVersion(row, { masterVolume: 0.42 }, metadata);

  assert.deepStrictEqual(version.drumClockDivs, metadata.drumClockDivs);
  assert.deepStrictEqual(version.synthClockDivs, metadata.synthClockDivs);
  assert.deepStrictEqual(version.drumSwings, metadata.drumSwings);
  assert.deepStrictEqual(version.synthSwings, metadata.synthSwings);
  assert.deepStrictEqual(version.drumLinked, metadata.drumLinked);
  assert.deepStrictEqual(version.synthLinked, metadata.synthLinked);
  assert.deepStrictEqual(version.drumEvolveConfigs, metadata.drumEvolveConfigs);
  assert.deepStrictEqual(version.synthEvolveConfigs, metadata.synthEvolveConfigs);
  assert.deepStrictEqual(version.drumStepOverrides, metadata.drumStepOverrides);
  assert.deepStrictEqual(version.synthPitchSettings, metadata.synthPitchSettings);
  assert.deepStrictEqual(version.synthPitchBindingModes, metadata.synthPitchBindingModes);
}

async function testMetadataOnlyChangeKeepsResolvedHashShared(): Promise<void> {
  const baseResolved = normalizeResolvedVersionData('state', 'global', {
    ...DEFAULT_STATE,
    drumDelayNoteL: '1/4',
  } as unknown as Record<string, unknown>);
  const delayRangeResolved = normalizeResolvedVersionData('state', 'global', {
    ...DEFAULT_STATE,
    drumDelayNoteL: '1/4',
  } as unknown as Record<string, unknown>);
  const baseMetadata = buildPresetVersionMetadata({
    sliderModes: { drumDelayNoteL: 'walk' },
    dualRanges: { drumDelayNoteL: { min: 0.8, max: 5 } },
    drumClockDivs: ['1/8', '1/16', '1/4', '1/32T'],
    synthClockDivs: ['1/4', '1/8', '1/16', '1/32'],
    drumLinked: [true, false, true, false],
    synthLinked: [false, true, false, true],
    drumEvolveConfigs: [{ enabled: true, evolution: 0.4 }] as SavedPreset['drumEvolveConfigs'],
  });
  const delayRangeMetadata = buildPresetVersionMetadata({
    ...baseMetadata,
    dualRanges: { drumDelayNoteL: { min: 7, max: 11 } },
  });

  assert.ok(baseMetadata, 'base metadata should not be empty');
  assert.ok(delayRangeMetadata, 'changed metadata should not be empty');

  assert.equal(
    await hashCanonicalJson(baseResolved),
    await hashCanonicalJson(delayRangeResolved),
    'resolved state hash should remain stable when only metadata changes',
  );
  assert.notEqual(
    await hashCanonicalJson(baseMetadata),
    await hashCanonicalJson(delayRangeMetadata),
    'metadata hash should change for dual-range delay edits even when the resolved slider value is unchanged',
  );
}

function testJourneyPresetCodecUsesRefsWithoutStateBloat(): void {
  const config = createDiamondJourney([]);
  const left = config.nodes.find((node) => node.position === 'left')!;
  const top = config.nodes.find((node) => node.position === 'top')!;
  const center = config.nodes.find((node) => node.position === 'center')!;
  left.presetId = 'state-left-id';
  left.presetName = 'Left State';
  left.phraseLength = 2;
  left.phraseLengthMax = 4;
  top.presetId = 'state-top-id';
  top.presetName = 'Top State';
  config.name = 'Ref Journey';
  config.connections = [
    createJourneyConnection(center.id, left.id),
    createJourneyConnection(left.id, top.id),
  ];

  const data = encodeJourneyPresetData(config);
  assert.equal('masterVolume' in (data as unknown as Record<string, unknown>), false, 'L5 data must not embed L4 state');
  assert.equal(data.nodes.find((node) => node.position === 'left')?.refSlot, getJourneyNodeRefSlot('left'));
  assert.equal(data.nodes.find((node) => node.position === 'left')?.presetName, 'Left State');

  const decoded = decodeJourneyPresetData(data as unknown as Record<string, unknown>, {
    [getJourneyNodeRefSlot('left')]: { id: 'state-left-id', name: 'Left State', version: 'latest', scope: 'global' },
    [getJourneyNodeRefSlot('top')]: { id: 'state-top-id', name: 'Top State', version: 'latest', scope: 'global' },
  }, 'Fallback');
  const decodedLeft = decoded.nodes.find((node) => node.position === 'left')!;
  assert.equal(decoded.name, 'Ref Journey');
  assert.equal(decodedLeft.presetName, 'Left State');
  assert.equal(decodedLeft.phraseLengthMax, 4);
  assert.equal(decoded.connections.length, 2);
  assert.equal(validateJourneyConfig(decoded).playable, true);

  const decodedWithoutRefs = decodeJourneyPresetData(data as unknown as Record<string, unknown>, undefined, 'Fallback');
  assert.equal(decodedWithoutRefs.nodes.find((node) => node.position === 'left')?.presetName, 'Left State');
  assert.equal(validateJourneyConfig(decodedWithoutRefs).playable, true);
}

function testJourneyPresetL4DeleteCleanupRemovesNodeAndConnections(): void {
  const config = createDiamondJourney([]);
  const left = config.nodes.find((node) => node.position === 'left')!;
  const top = config.nodes.find((node) => node.position === 'top')!;
  left.presetId = 'state-left-id';
  left.presetName = 'Left State';
  top.presetId = 'state-top-id';
  top.presetName = 'Top State';
  config.connections = [createJourneyConnection(left.id, top.id)];

  const data = encodeJourneyPresetData(config) as unknown as Record<string, unknown>;
  assert.equal(journeyDataReferencesStatePreset(data, undefined, { id: 'state-left-id', name: 'Left State' }), true);
  const cleanup = removeStatePresetRefFromJourneyData(data, {
    [getJourneyNodeRefSlot('left')]: { id: 'state-left-id', name: 'Left State', version: 'latest', scope: 'global' },
    [getJourneyNodeRefSlot('top')]: { id: 'state-top-id', name: 'Top State', version: 'latest', scope: 'global' },
  }, { id: 'state-left-id', name: 'Left State' });

  assert.equal(cleanup.changed, true);
  const decoded = decodeJourneyPresetData(cleanup.data, cleanup.refs, 'Cleaned');
  assert.equal(decoded.nodes.find((node) => node.position === 'left')?.presetName, '');
  assert.equal(decoded.nodes.find((node) => node.position === 'top')?.presetName, 'Top State');
  assert.equal(decoded.connections.length, 0);
}

function testJourneyPresetL4DeleteCleanupUsesNodeFallbackRefs(): void {
  const config = createDiamondJourney([]);
  const left = config.nodes.find((node) => node.position === 'left')!;
  const top = config.nodes.find((node) => node.position === 'top')!;
  left.presetId = 'Left State';
  left.presetName = 'Left State';
  top.presetId = 'Top State';
  top.presetName = 'Top State';
  config.connections = [createJourneyConnection(left.id, top.id)];

  const data = encodeJourneyPresetData(config) as unknown as Record<string, unknown>;
  const cleanup = removeStatePresetRefFromJourneyData(data, undefined, { name: 'Left State' });

  assert.equal(cleanup.changed, true);
  const decoded = decodeJourneyPresetData(cleanup.data, cleanup.refs, 'Cleaned');
  assert.equal(decoded.nodes.find((node) => node.position === 'left')?.presetName, '');
  assert.equal(decoded.nodes.find((node) => node.position === 'top')?.presetName, 'Top State');
  assert.equal(decoded.connections.length, 0);
}

function testJourneyOverwriteBackupKeepsFullGraphBase(): void {
  const makeData = (name: string, leftName: string, phraseLength: number): Record<string, unknown> => {
    const config = createDiamondJourney([]);
    const left = config.nodes.find((node) => node.position === 'left')!;
    left.presetId = leftName;
    left.presetName = leftName;
    left.phraseLength = phraseLength;
    config.name = name;
    return encodeJourneyPresetData(config) as unknown as Record<string, unknown>;
  };

  let entry = coerceJourneyPresetEntry(null, 'Overwrite Journey', makeData('Overwrite Journey', 'Alpha State', 1), {
    [getJourneyNodeRefSlot('left')]: { name: 'Alpha State', version: 'latest', scope: 'global' },
  });
  compressVersions(entry);

  entry = coerceJourneyPresetEntry(entry, 'Overwrite Journey', makeData('Overwrite Journey', 'Beta State', 2), {
    [getJourneyNodeRefSlot('left')]: { name: 'Beta State', version: 'latest', scope: 'global' },
  });
  compressVersions(entry);

  entry = coerceJourneyPresetEntry(entry, 'Overwrite Journey', makeData('Overwrite Journey', 'Gamma State', 3), {
    [getJourneyNodeRefSlot('left')]: { name: 'Gamma State', version: 'latest', scope: 'global' },
  });
  compressVersions(entry);

  const currentData = getVersionData(entry, entry.currentVersion);
  assert.ok(currentData);
  const currentVersion = entry.versions.find((version) => version.v === entry.currentVersion);
  const decoded = decodeJourneyPresetData(currentData, currentVersion?.refs, 'Fallback');
  const decodedLeft = decoded.nodes.find((node) => node.position === 'left')!;
  assert.equal(decodedLeft.presetName, 'Gamma State');
  assert.equal(decodedLeft.phraseLength, 3);
  assert.equal(entry.versions[0]?._isDelta, undefined);
}

function testJourneyPresetPreviewMetadataFeedsSummary(): void {
  const config = createDiamondJourney([]);
  const left = config.nodes.find((node) => node.position === 'left')!;
  const top = config.nodes.find((node) => node.position === 'top')!;
  left.presetId = 'Left State';
  left.presetName = 'Left State';
  top.presetId = 'Top State';
  top.presetName = 'Top State';
  config.connections = [
    createJourneyConnection(left.id, top.id),
    createJourneyConnection(top.id, left.id),
  ];

  const preview = buildJourneyPresetPreview(config);
  assert.ok(preview);
  assert.deepStrictEqual(preview.connections, [
    { from: 'left', to: 'top' },
    { from: 'top', to: 'left' },
  ]);
  const metadata = buildPresetVersionMetadata({ journeyPreview: preview });
  assert.deepStrictEqual(metadata?.journeyPreview, preview);

  const entry = coerceJourneyPresetEntry(
    null,
    'Preview Journey',
    encodeJourneyPresetData(config) as unknown as Record<string, unknown>,
    {
      [getJourneyNodeRefSlot('left')]: { name: 'Left State', version: 'latest', scope: 'global' },
      [getJourneyNodeRefSlot('top')]: { name: 'Top State', version: 'latest', scope: 'global' },
    },
  );
  const current = entry.versions.find((version) => version.v === entry.currentVersion);
  assert.ok(current);
  current.journeyPreview = preview;

  const summary = normalizePresetSummary(entry);
  assert.deepStrictEqual(summary.journeyPreview, preview);
}

async function run(): Promise<void> {
  testMigratePresetPreservesSynthPitchBindingModes();
  testBuildPresetVersionMetadataIncludesAllSupportedFields();
  testGetPresetVersionSnapshotReturnsSelectedVersionMetadata();
  testLegacyImportPreservesSynthPitchBindingModes();
  testSequenceLanePresetRoundTripKeepsRuntimeLaneState();
  testOptimizedStatePresetRoundTripKeepsOnlyOverrides();
  testStatePresetDiffIgnoresInactiveMixerValues();
  testMaterializedV2VersionPreservesAncillaryMetadata();
  testJourneyPresetCodecUsesRefsWithoutStateBloat();
  testJourneyPresetL4DeleteCleanupRemovesNodeAndConnections();
  testJourneyPresetL4DeleteCleanupUsesNodeFallbackRefs();
  testJourneyOverwriteBackupKeepsFullGraphBase();
  testJourneyPresetPreviewMetadataFeedsSummary();
  await testMetadataOnlyChangeKeepsResolvedHashShared();
  console.log('preset metadata regression checks passed');
}

await run();
