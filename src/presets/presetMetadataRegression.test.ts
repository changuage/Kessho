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
import {
  planRoutingMuteGroupMetadataStorage,
  reconstructRoutingMuteGroupMetadata,
  routingMuteGroupSceneRefSlot,
} from './routingMuteGroupPresetStorage';
import { normalizePresetSummary } from './presetUtils';
import {
  collectPresetPoolTags,
  filterPresetPoolCandidates,
  getDefaultPresetPoolIds,
  normalizePresetPoolMetadata,
  normalizePresetTags,
  presetPoolCandidateMatches,
  resolvePresetPoolKey,
  type PresetPoolCandidate,
} from './presetPool';
import {
  applyEuclideanPatternToDrumState,
  applyEuclideanPatternToSynthLaneState,
  extractEuclideanPatternLaneDataFromSynthState,
} from './euclideanPatternBank';
import type { PresetEntry, PresetPoolMetadata, PresetRecoveryWarning, PresetVersionMetadata } from './types';
import { DEFAULT_STATE, decodeStateFromUrl, encodeStateToUrl, migratePreset, type SavedPreset } from '../ui/state';
import { createEmptyStepOverrides, deserializeStepOverrides, serializeStepOverrides } from '../ui/sequencer/stepOverrideSerialization';
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
  inferLegacySequencerSubLaneStatesFromOverrides,
} from '../ui/sequencer/sequencePresetLane';
import type {
  EvolveConfig,
  PitchSettings,
  SubLaneKind,
  SubLaneState,
} from '../ui/sequencer/useEuclideanSequencer';
import { stepOverridesForEngineSubLaneState } from '../ui/sequencer/engineStepOverrides';
import {
  drumPitchBaseMidiFromState,
  drumPitchUiValuesToEngineOffsets,
  evolvedDrumPitchOffsetToUiValue,
} from '../ui/sequencer/drumPitchSequencer';
import type { PitchBindingMode } from '../audio/drumSeqTypes';
import { drumVoiceBaseMidi } from '../audio/drumVoiceMidi';
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
import { getPadPreset, morphPadPresets } from '../audio/padPresets';
import { DEFAULT_GAMELAN, DEFAULT_SOFT_RHODES, morphPresets } from '../audio/lead4opfm';
import { getPreset as getDrumPreset } from '../audio/drumPresets';
import { getAllMorphedDrumParams, interpolatePresets as morphDrumPresets } from '../audio/drumMorph';

const SYNTH_BINDING_MODES = ['sequence', 'linked', 'polyrhythmic', 'polyrhythmic'] as const;

function testStateUrlRoundTripRestoresBooleanSequencerState(): void {
  const source = {
    ...DEFAULT_STATE,
    drumEnabled: true,
    drumDelayEnabled: true,
    drumSubMorphAuto: true,
    drumEuclidMasterEnabled: true,
    drumEuclid1Enabled: true,
    drumEuclid1TargetKick: false,
    drumEuclid1TargetNoise: true,
    synthEuclideanMasterEnabled: true,
    synthEuclid1Enabled: false,
    synthEuclid2Enabled: true,
    synthChordSequencerEnabled: false,
    granularV2TempoSync: true,
    reverbEnabled: false,
  };

  const decoded = decodeStateFromUrl(`?${encodeStateToUrl(source)}`);
  assert.ok(decoded, 'encoded state should decode');
  assert.equal(decoded.drumEnabled, true);
  assert.equal(decoded.drumDelayEnabled, true);
  assert.equal(decoded.drumSubMorphAuto, true);
  assert.equal(decoded.drumEuclidMasterEnabled, true);
  assert.equal(decoded.drumEuclid1Enabled, true);
  assert.equal(decoded.drumEuclid1TargetKick, false);
  assert.equal(decoded.drumEuclid1TargetNoise, true);
  assert.equal(decoded.synthEuclideanMasterEnabled, true);
  assert.equal(decoded.synthEuclid1Enabled, false);
  assert.equal(decoded.synthEuclid2Enabled, true);
  assert.equal(decoded.synthChordSequencerEnabled, false);
  assert.equal(decoded.granularV2TempoSync, true);
  assert.equal(decoded.reverbEnabled, false);
}

function testSoundEnginePresetMorphClampsEndpointB(): void {
  const padA = getPadPreset('init', 'pad1');
  const padB = getPadPreset('harsh_pluck', 'pad1');
  assert.ok(padA && padB, 'pad morph regression presets should exist');
  assert.deepStrictEqual(
    morphPadPresets(padA, padB, 100),
    morphPadPresets(padA, padB, 1),
    'pad preset morph should clamp normalized endpoint B instead of extrapolating',
  );

  assert.deepStrictEqual(
    morphPresets(DEFAULT_SOFT_RHODES, DEFAULT_GAMELAN, 100),
    morphPresets(DEFAULT_SOFT_RHODES, DEFAULT_GAMELAN, 1),
    'lead preset morph should clamp normalized endpoint B instead of extrapolating',
  );

  const kickA = getDrumPreset('kick', 'Ikeda Kick');
  const kickB = getDrumPreset('kick', 'Ambient Boom');
  assert.ok(kickA && kickB, 'drum morph regression presets should exist');
  assert.deepStrictEqual(
    morphDrumPresets(kickA, kickB, 100),
    morphDrumPresets(kickA, kickB, 1),
    'drum preset morph should clamp normalized endpoint B instead of extrapolating',
  );
}

function testDefaultDrumSliderCacheMatchesSelectedPresetA(): void {
  const defaultState = DEFAULT_STATE as unknown as Record<string, unknown>;
  const resolvedDrumParams = getAllMorphedDrumParams(DEFAULT_STATE) as Record<string, unknown>;
  const mismatches = Object.entries(resolvedDrumParams)
    .filter(([key, value]) => !Object.is(defaultState[key], value))
    .map(([key, value]) => ({ key, defaultValue: defaultState[key], presetValue: value }));

  assert.deepStrictEqual(
    mismatches,
    [],
    'DEFAULT_STATE drum slider cache should match the selected default drum preset endpoints',
  );
}

function testGenericDrumEuclideanPatternKeepsTimingParamTypes(): void {
  const loaded = applyEuclideanPatternToDrumState(
    { ...DEFAULT_STATE, drumEuclidTempo: 0.5, drumEuclidDivision: 8 },
    {
      euclideanPatternEnabled: true,
      euclideanPatternPreset: 'tresillo',
      euclideanPatternSteps: 8,
      euclideanPatternHits: 3,
      euclideanPatternRotation: 0,
    },
  );

  assert.equal(loaded.drumEuclidTempo, 1, 'generic drum pattern presets should load a tempo multiplier');
  assert.equal(loaded.drumEuclidDivision, 16, 'generic drum pattern presets should load a numeric division');
}

function testSynthLanePatternRoundTripKeepsNoteRangeBounds(): void {
  const saved = extractEuclideanPatternLaneDataFromSynthState({
    ...DEFAULT_STATE,
    synthEuclid1NoteMin: 48,
    synthEuclid1NoteMax: 67,
  }, 0);

  const loaded = applyEuclideanPatternToSynthLaneState({
    ...DEFAULT_STATE,
    synthEuclid1NoteMin: 72,
    synthEuclid1NoteMax: 84,
  }, saved, 0);

  assert.equal(saved.euclideanPatternNoteMin, 48, 'synth lane pattern extract should include noteRange low bound');
  assert.equal(saved.euclideanPatternNoteMax, 67, 'synth lane pattern extract should include noteRange high bound');
  assert.equal(loaded.synthEuclid1NoteMin, 48, 'synth lane pattern load should restore noteRange low bound');
  assert.equal(loaded.synthEuclid1NoteMax, 67, 'synth lane pattern load should restore noteRange high bound');
}

function makeSubLaneState(): Record<SubLaneKind, SubLaneState> {
  return {
    pitch: { enabled: false, steps: 5, direction: 'forward', scaleQuantize: false },
    expression: { enabled: false, steps: 4, direction: 'forward', valueMode: 'sequence', rangeMin: 0.75, rangeMax: 1 },
    morph: { enabled: false, steps: 4, direction: 'forward', valueMode: 'sequence', rangeMin: 0.25, rangeMax: 0.75 },
    distance: { enabled: false, steps: 4, direction: 'forward', valueMode: 'sequence', rangeMin: 0, rangeMax: 1 },
    nudge: { enabled: false, steps: 4, direction: 'forward' },
    slice: { enabled: false, steps: 4, direction: 'forward' },
    reverse: { enabled: false, steps: 4, direction: 'forward' },
  };
}

function testEngineStepOverridesTrimHiddenSubLaneValues(): void {
  const overrides = createEmptyStepOverrides();
  overrides.pitch[0] = [0, 2, 4, 7];
  overrides.expression[0] = [0.4];
  overrides.expressionRanges![0] = { min: 0.2, max: 0.8 };
  overrides.ratchet[0] = [2, 3, 4, 1];
  overrides.ratchet[1] = [4, 4];
  overrides.morph[0] = [0.2, 0.6, 0.9];
  overrides.morphRanges![0] = { min: 0.1, max: 0.7 };
  overrides.slice[0] = [8, 12];
  overrides.reverse[0] = [1, 0, 1, 0];

  const states = Array.from({ length: 4 }, makeSubLaneState);
  states[0] = {
    ...makeSubLaneState(),
    pitch: { enabled: true, steps: 2, direction: 'forward', scaleQuantize: false },
    expression: { enabled: true, steps: 3, direction: 'forward', valueMode: 'range', rangeMin: 0.75, rangeMax: 1 },
    morph: { enabled: false, steps: 2, direction: 'forward', valueMode: 'sequence', rangeMin: 0.25, rangeMax: 0.75 },
    slice: { enabled: true, steps: 1, direction: 'forward' },
    reverse: { enabled: true, steps: 3, direction: 'forward' },
  };

  const engineOverrides = stepOverridesForEngineSubLaneState(overrides, states);
  assert.deepStrictEqual(engineOverrides.pitch[0], [0, 2]);
  assert.deepStrictEqual(engineOverrides.expression[0], [0.4, 1, 1]);
  assert.deepStrictEqual(engineOverrides.expressionRanges?.[0], { min: 0.2, max: 0.8 });
  assert.deepStrictEqual(engineOverrides.ratchet[0], [2, 3, 4]);
  assert.equal(engineOverrides.ratchet[1], null, 'ratchet should be inactive while expression sub-lane is disabled');
  assert.equal(engineOverrides.morph[0], null);
  assert.equal(engineOverrides.morphRanges?.[0], null);
  assert.deepStrictEqual(engineOverrides.slice[0], [8]);
  assert.deepStrictEqual(engineOverrides.reverse[0], [1, 0, 1]);
  assert.deepStrictEqual(overrides.pitch[0], [0, 2, 4, 7], 'raw UI overrides should retain hidden values');
  assert.deepStrictEqual(overrides.ratchet[1], [4, 4], 'raw UI ratchets should survive expression disable');
}

function testMigratePresetPreservesSynthPitchBindingModes(): void {
  const migrated = migratePreset({
    name: 'Binding Check',
    timestamp: '2026-04-21T00:00:00.000Z',
    state: { ...DEFAULT_STATE },
    drumPitchSettings: [{ mode: 'notes', root: 48, scale: 'Minor' }],
    synthPitchBindingModes: [...SYNTH_BINDING_MODES],
  });

  assert.deepStrictEqual(
    migrated.drumPitchSettings,
    [{ mode: 'notes', root: 48, scale: 'Minor' }],
    'migratePreset should preserve drumPitchSettings',
  );
  assert.deepStrictEqual(
    migrated.synthPitchBindingModes,
    [...SYNTH_BINDING_MODES],
    'migratePreset should preserve synthPitchBindingModes',
  );
}

function testBuildPresetVersionMetadataIncludesAllSupportedFields(): void {
  const metadata = buildPresetVersionMetadata({
    routingMuteGroups: {
      slots: [
        { mutedSourceIds: ['pad1', 'drums'] },
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    },
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
    drumPitchSettings: [
      { mode: 'notes', root: 48, scale: 'Minor' },
      { mode: 'semitones', root: 60, scale: 'Major' },
      { mode: 'notes', root: 43, scale: 'Dorian' },
      { mode: 'semitones', root: 60, scale: 'Major' },
    ],
    synthPitchSettings: [
      { mode: 'notes', root: 62, scale: 'Dorian' },
      { mode: 'semitones', root: 60, scale: 'Major' },
      { mode: 'noteRange', root: 60, scale: 'Major' },
      { mode: 'notes', root: 57, scale: 'Minor' },
    ],
    synthPitchBindingModes: [...SYNTH_BINDING_MODES],
    presetPool: {
      version: 1,
      pools: {
        pad: ['saturated_drift', 'buchla_pluck'],
        lead4opfm: ['soft_rhodes', 'gamelan'],
        drumKick: [],
      },
    },
  });

  assert.deepStrictEqual(metadata, {
    routingMuteGroups: {
      slots: [
        { mutedSourceIds: ['pad1', 'drums'] },
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    },
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
    drumPitchSettings: [
      { mode: 'notes', root: 48, scale: 'Minor' },
      { mode: 'semitones', root: 60, scale: 'Major' },
      { mode: 'notes', root: 43, scale: 'Dorian' },
      { mode: 'semitones', root: 60, scale: 'Major' },
    ],
    synthPitchSettings: [
      { mode: 'notes', root: 62, scale: 'Dorian' },
      { mode: 'semitones', root: 60, scale: 'Major' },
      { mode: 'noteRange', root: 60, scale: 'Major' },
      { mode: 'notes', root: 57, scale: 'Minor' },
    ],
    synthPitchBindingModes: [...SYNTH_BINDING_MODES],
    presetPool: {
      version: 1,
      pools: {
        pad: ['saturated_drift', 'buchla_pluck'],
        lead4opfm: ['soft_rhodes', 'gamelan'],
        drumKick: [],
      },
    },
  });
}

function testPresetPoolDefaultsUseStableIdsAndSharedEngineScopes(): void {
  const padCandidates: PresetPoolCandidate[] = [
    { id: 'pad-saturated-id', name: 'Saturated Drift', aliases: ['saturated_drift'], tags: ['warm', 'drift'] },
    { id: 'pad-buchla-id', name: 'Buchla Pluck', aliases: ['buchla_pluck'], tags: ['pluck'] },
    { id: 'pad-soft-id', name: 'Soft Pluck', aliases: ['soft_pluck'], tags: ['soft', 'pluck'] },
    { id: 'pad-extra-id', name: 'Cathedral Organ', tags: ['organ'] },
  ];
  const leadCandidates: PresetPoolCandidate[] = [
    { id: 'lead-rhodes-id', name: 'Soft Rhodes', aliases: ['soft_rhodes'], tags: ['keys'] },
    { id: 'lead-gamelan-id', name: 'Gamelan', aliases: ['gamelan'], tags: ['bell'] },
    { id: 'lead-extra-id', name: 'Classic Mono', tags: ['lead'] },
  ];
  const drumCandidates: PresetPoolCandidate[] = [
    { id: 'drum-a', name: 'A' },
    { id: 'drum-b', name: 'B' },
    { id: 'drum-c', name: 'C' },
    { id: 'drum-d', name: 'D' },
  ];

  assert.equal(resolvePresetPoolKey('engine', 'pad1'), 'pad');
  assert.equal(resolvePresetPoolKey('engine', 'pad2'), 'pad');
  assert.equal(resolvePresetPoolKey('engine', 'lead1'), 'lead4opfm');
  assert.equal(resolvePresetPoolKey('engine', 'lead2'), 'lead4opfm');
  assert.equal(resolvePresetPoolKey('engine', 'lead4opfm'), 'lead4opfm');
  assert.equal(resolvePresetPoolKey('engine', 'drumKick'), 'drumKick');
  assert.equal(resolvePresetPoolKey('state', 'global'), null);

  assert.deepStrictEqual(
    getDefaultPresetPoolIds('pad', padCandidates),
    ['pad-saturated-id', 'pad-buchla-id', 'pad-soft-id'],
    'pad/synth pool defaults should store candidate ids, not full presets or display names',
  );
  assert.deepStrictEqual(
    getDefaultPresetPoolIds('lead4opfm', leadCandidates),
    ['lead-rhodes-id', 'lead-gamelan-id'],
    'lead pool defaults should store the Soft Rhodes and Gamelan candidate ids',
  );
  assert.equal(
    getDefaultPresetPoolIds('drumKick', drumCandidates).length,
    3,
    'drum engine defaults should choose three candidates',
  );
}

function testPresetPoolMatchingNormalizationAndTags(): void {
  const candidates: PresetPoolCandidate[] = [
    { id: 'cloud-123', name: 'Renamed Preset', aliases: ['Original Name'], tags: ['Warm', 'Keys'] },
    { id: 'local-456', name: 'Local Pad', tags: ['warm', 'Pad'] },
    { id: 'stock-789', name: 'Stock Tone', tags: ['Init'] },
  ];

  assert.equal(
    presetPoolCandidateMatches(candidates[0]!, ['original name']),
    true,
    'pool membership should survive a rename via candidate aliases while keeping the stable id available',
  );
  assert.deepStrictEqual(
    filterPresetPoolCandidates(candidates, ['cloud-123'], ['stock tone']).map(candidate => candidate.id),
    ['cloud-123', 'stock-789'],
    'pool filtering should include selected pool ids plus the explicitly loaded keep id',
  );
  assert.deepStrictEqual(
    normalizePresetPoolMetadata({
      version: 1,
      pools: {
        pad: ['Cloud-123', 'cloud-123', '  local-456  '],
        lead4opfm: [],
        invalid: [null, ''],
      },
    }),
    {
      version: 1,
      pools: {
        pad: ['Cloud-123', 'local-456'],
        lead4opfm: [],
        invalid: [],
      },
    },
    'pool metadata should persist ids only, preserving explicit empty pools',
  );
  assert.deepStrictEqual(normalizePresetTags(['Warm', ' warm ', 'Keys', '', 'Pad Synth']), ['warm', 'keys', 'pad synth']);
  assert.deepStrictEqual(collectPresetPoolTags(candidates), ['init', 'keys', 'pad', 'warm']);
}

function testPresetPoolMetadataRoundTripsThroughL4SavedPreset(): void {
  const presetPool: PresetPoolMetadata = {
    version: 1,
    pools: {
      pad: ['pad-saturated-id', 'pad-buchla-id'],
      lead4opfm: ['lead-rhodes-id'],
      drumKick: [],
    },
  };
  const migrated = migratePreset({
    name: 'Pool State',
    timestamp: '2026-06-21T00:00:00.000Z',
    state: { ...DEFAULT_STATE, masterVolume: 0.72 },
    presetPool,
  } as SavedPreset);

  assert.deepStrictEqual(
    migrated.presetPool,
    presetPool,
    'L4 SavedPreset migration should preserve ID-only preset pool metadata',
  );

  const entry: PresetEntry = {
    type: 'state',
    scope: 'global',
    name: 'Pool State',
    author: 'user',
    versions: [
      {
        v: 1,
        note: 'pool ids',
        timestamp: 1,
        data: { masterVolume: 0.72 },
        presetPool,
      },
    ],
    currentVersion: 1,
    createdAt: 1,
    updatedAt: 1,
  };
  assert.deepStrictEqual(
    getPresetVersionSnapshot(entry, 1)?.metadata?.presetPool,
    presetPool,
    'L4 version snapshot metadata should expose preset pool ids for app-level pool restore',
  );
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
  sourceOverrides.slice[2] = [3, 7, 11];
  sourceOverrides.reverse[2] = [1, 0, 1];
  sourceOverrides.sliceDirection[2] = 'pingpong';
  sourceOverrides.reverseDirection[2] = 'reverse';

  const serializedOverrides = serializeStepOverrides(copySequenceLaneForPreset(sourceOverrides, 2));
  const serializedStateOverrides = serializeStepOverrides(sourceOverrides);
  const appliedOverrides = applySequencePresetOverrides(createEmptyStepOverrides(), serializedOverrides, 1);

  assert.deepStrictEqual(serializedOverrides?.slice?.[0], [3, 7, 11]);
  assert.deepStrictEqual(serializedOverrides?.reverse?.[0], [1, 0, 1]);
  assert.equal(serializedOverrides?.sliceDirection?.[0], 'pingpong');
  assert.equal(serializedOverrides?.reverseDirection?.[0], 'reverse');
  assert.equal(appliedOverrides.triggerToggles[1]?.get(3), false);
  assert.deepStrictEqual(appliedOverrides.pitch[1], [0, 2, 4]);
  assert.deepStrictEqual(appliedOverrides.expression[1], [0.4, 0.8]);
  assert.equal(appliedOverrides.expressionDirection[1], 'reverse');
  assert.deepStrictEqual(appliedOverrides.expressionRanges?.[1], { min: 0.2, max: 0.7 });
  assert.deepStrictEqual(appliedOverrides.slice[1], [3, 7, 11]);
  assert.deepStrictEqual(appliedOverrides.reverse[1], [1, 0, 1]);
  assert.equal(appliedOverrides.sliceDirection[1], 'pingpong');
  assert.equal(appliedOverrides.reverseDirection[1], 'reverse');
  const malformedDirections = deserializeStepOverrides({
    expressionDirection: ['sideways', 'reverse', null, 'pingpong'],
    sliceDirection: ['forward', 'bad', 'reverse', null],
  } as any);
  assert.equal(malformedDirections?.expressionDirection[0], null);
  assert.equal(malformedDirections?.expressionDirection[1], 'reverse');
  assert.equal(malformedDirections?.sliceDirection[1], null);
  assert.equal(malformedDirections?.sliceDirection[2], 'reverse');
  const malformedRanges = deserializeStepOverrides({
    expressionRanges: [{ min: 1.2, max: -0.5 }, { min: 'bad', max: 1 }, null, { min: 0.2, max: 0.8 }],
  } as any);
  assert.deepStrictEqual(malformedRanges?.expressionRanges?.[0], { min: 0, max: 1 });
  assert.equal(malformedRanges?.expressionRanges?.[1], null);
  assert.deepStrictEqual(malformedRanges?.expressionRanges?.[3], { min: 0.2, max: 0.8 });

  const sourceSubLaneStates = Array.from({ length: 4 }, makeSubLaneState);
  sourceSubLaneStates[2] = {
    ...makeSubLaneState(),
    pitch: { enabled: true, steps: 7, direction: 'pingpong', scaleQuantize: true },
    expression: { enabled: true, steps: 3, direction: 'reverse', valueMode: 'range', rangeMin: 0.3, rangeMax: 0.9 },
    slice: { enabled: true, steps: 6, direction: 'pingpong' },
    reverse: { enabled: true, steps: 2, direction: 'reverse' },
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
  assert.deepStrictEqual(appliedSubLaneStates[1]?.pitch, {
    enabled: true,
    steps: 7,
    direction: 'pingpong',
    scaleQuantize: false,
  });
  assert.deepStrictEqual(appliedSubLaneStates[1]?.expression, sourceSubLaneStates[2]?.expression);
  assert.deepStrictEqual(appliedSubLaneStates[1]?.slice, sourceSubLaneStates[2]?.slice);
  assert.deepStrictEqual(appliedSubLaneStates[1]?.reverse, sourceSubLaneStates[2]?.reverse);
  const sanitizedSubLaneStates = applySequencePresetSubLaneStates(targetSubLaneStates, {
    subLaneStates: {
      pitch: { enabled: true, steps: 99, direction: 'sideways', scaleQuantize: true },
      expression: { enabled: true, steps: Number.NaN, direction: 'also-bad', valueMode: 'range', rangeMin: 1.2, rangeMax: -0.2 },
    },
  } as any, 1);
  assert.deepStrictEqual(sanitizedSubLaneStates[1]?.pitch, {
    enabled: true,
    steps: 32,
    direction: 'forward',
    scaleQuantize: false,
  });
  assert.deepStrictEqual(sanitizedSubLaneStates[1]?.expression, {
    enabled: true,
    steps: 1,
    direction: 'forward',
    valueMode: 'range',
    rangeMin: 0,
    rangeMax: 1,
  });
  const inferredLegacySubLaneStates = applySequencePresetSubLaneStates(targetSubLaneStates, undefined, 1, serializedOverrides);
  assert.deepStrictEqual(inferredLegacySubLaneStates[1]?.pitch, {
    enabled: true,
    steps: 3,
    direction: 'forward',
    scaleQuantize: false,
  });
  assert.deepStrictEqual(inferredLegacySubLaneStates[1]?.expression, {
    enabled: true,
    steps: 2,
    direction: 'reverse',
    valueMode: 'range',
    rangeMin: 0.2,
    rangeMax: 0.7,
  });
  assert.deepStrictEqual(inferredLegacySubLaneStates[1]?.slice, {
    enabled: true,
    steps: 3,
    direction: 'pingpong',
  });
  assert.deepStrictEqual(inferredLegacySubLaneStates[1]?.reverse, {
    enabled: true,
    steps: 3,
    direction: 'reverse',
  });
  const inferredLegacyStateSubLanes = inferLegacySequencerSubLaneStatesFromOverrides(serializedStateOverrides);
  assert.deepStrictEqual(inferredLegacyStateSubLanes?.[2]?.expression, {
    enabled: true,
    steps: 2,
    direction: 'reverse',
    valueMode: 'range',
    rangeMin: 0.2,
    rangeMax: 0.7,
  });
  assert.deepStrictEqual(inferredLegacyStateSubLanes?.[2]?.slice, {
    enabled: true,
    steps: 3,
    direction: 'pingpong',
  });
  assert.deepStrictEqual(applySequencePresetClockDivs(['1/8', '1/8', '1/8', '1/8'], serializedState, 1), ['1/8', '1/4', '1/8', '1/8']);
  assert.deepStrictEqual(applySequencePresetClockDivs(['1/8', '1/8', '1/8', '1/8'], { ...serializedState, clockDiv: '1/8t' as any }, 1), ['1/8', '1/8T', '1/8', '1/8']);
  assert.deepStrictEqual(applySequencePresetSwings([0, 0, 0, 0], serializedState, 1), [0, 0.2, 0, 0]);
  assert.deepStrictEqual(applySequencePresetSwings([0, 0, 0, 0], { ...serializedState, swing: 1.2 }, 1), [0, 0.75, 0, 0]);
  assert.deepStrictEqual(applySequencePresetLinked([false, false, false, false], serializedState, 1), [false, true, false, false]);
  assert.deepStrictEqual(applySequencePresetPitchSettings([
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'semitones', root: 60, scale: 'Major' },
  ], serializedState, 1)[1], pitchSettings[2]);
  assert.deepStrictEqual(applySequencePresetPitchSettings([
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'notes', root: 55, scale: 'Minor' },
    { mode: 'semitones', root: 60, scale: 'Major' },
    { mode: 'semitones', root: 60, scale: 'Major' },
  ], { pitchSettings: { mode: 'bad-mode', root: 999, scale: 'No Scale' } as any }, 1)[1], {
    mode: 'notes',
    root: 127,
    scale: 'Minor',
  });
  assert.deepStrictEqual(
    applySequencePresetPitchBindingModes(['polyrhythmic', 'polyrhythmic', 'polyrhythmic', 'polyrhythmic'], serializedState, 1),
    ['polyrhythmic', 'sequence', 'polyrhythmic', 'polyrhythmic'],
  );
  assert.deepStrictEqual(
    applySequencePresetPitchBindingModes(['linked', 'linked', 'linked', 'linked'], { ...serializedState, pitchBindingMode: 'bad-mode' as any }, 1),
    ['linked', 'linked', 'linked', 'linked'],
  );
  assert.deepStrictEqual(applySequencePresetEvolveConfigs(evolveConfigs.map((config) => ({ ...config, enabled: false })), serializedState, 1, 'synth')[1], {
    ...evolveConfigs[2],
    methods: {
      swingDrift: true,
      probDrift: false,
      ratchetSpray: false,
      pitchWalk: false,
      valueDrift: true,
      valueScramble: false,
      valueWiden: false,
      subLaneLengthDrift: false,
      subLaneDirectionFlip: false,
      triggerToggle: true,
    },
  });
  assert.equal(
    applySequencePresetEvolveConfigs(evolveConfigs, {
      evolveConfig: { enabled: true, everyBars: 4, evolution: 0.25, writeOffset: 0, mutationMode: 'biased', methods: {} },
    }, 1, 'synth')[1]?.methods.triggerToggle,
    false,
    'sequence preset load should restore synth evolve method defaults when legacy data has an empty methods object',
  );
  assert.equal(
    applySequencePresetEvolveConfigs(evolveConfigs, {
      evolveConfig: { enabled: true, everyBars: 4, evolution: 0.25, writeOffset: 0, mutationMode: 'biased', methods: {} },
    }, 1, 'drum')[1]?.methods.rotateDrift,
    true,
    'sequence preset load should restore drum evolve method defaults when legacy data has an empty methods object',
  );
  const sanitizedSynthEvolve = applySequencePresetEvolveConfigs(evolveConfigs, {
    evolveConfig: {
      enabled: true,
      everyBars: 'bad',
      evolution: 2,
      writeOffset: 'bad',
      mutationMode: 'strict',
      methods: { pitchWalk: 'yes', valueDrift: true },
      enabledSubLanes: ['pitch', 12, 'ratchet'],
    } as any,
  }, 1, 'synth')[1];
  assert.equal(sanitizedSynthEvolve?.everyBars, 4);
  assert.equal(sanitizedSynthEvolve?.evolution, 1);
  assert.equal(sanitizedSynthEvolve?.writeOffset, 0);
  assert.equal(sanitizedSynthEvolve?.methods.pitchWalk, false);
  assert.equal(sanitizedSynthEvolve?.methods.valueDrift, true);
  assert.deepStrictEqual(sanitizedSynthEvolve?.enabledSubLanes, ['pitch', 'ratchet']);

  const sanitizedCopiedState = copySequenceLaneStateForPreset({
    laneIdx: 1,
    subLaneStates: sourceSubLaneStates,
    clockDivs: ['1/8', '1/16', '1/4', '1/32'],
    swings: [0, 0.1, 0.2, 0.3],
    linked: [false, false, true, false],
    evolveConfigs: [
      evolveConfigs[0]!,
      {
        enabled: true,
        everyBars: Number.NaN,
        evolution: -1,
        writeOffset: Number.NaN,
        mutationMode: 'loose',
        methods: { pitchWalk: 'yes', valueDrift: true },
        enabledSubLanes: ['pitch', { bad: true }, 'expression'],
      } as any,
      evolveConfigs[2]!,
      evolveConfigs[3]!,
    ],
    pitchSettings,
    pitchBindingModes,
  });
  assert.equal(sanitizedCopiedState.evolveConfig?.everyBars, 1);
  assert.equal(sanitizedCopiedState.evolveConfig?.evolution, 0);
  assert.equal(sanitizedCopiedState.evolveConfig?.writeOffset, 0);
  assert.equal(sanitizedCopiedState.evolveConfig?.mutationMode, 'biased');
  assert.equal(sanitizedCopiedState.evolveConfig?.methods.pitchWalk, false);
  assert.equal(sanitizedCopiedState.evolveConfig?.methods.valueDrift, true);
  assert.deepStrictEqual(sanitizedCopiedState.evolveConfig?.enabledSubLanes, ['pitch', 'expression']);
}

function testDrumPitchPresetRestoreUsesEngineOffsets(): void {
  const state = {
    ...DEFAULT_STATE,
    drumEuclid1TargetKick: false,
    drumEuclid1TargetNoise: true,
  };
  const settings: PitchSettings = { mode: 'semitones', root: 60, scale: 'Major' };
  const baseMidi = drumPitchBaseMidiFromState(state, 0);
  const expectedBaseMidi = drumVoiceBaseMidi('noise');
  const expectedOffsets = [60 - expectedBaseMidi, 64 - expectedBaseMidi];
  assert.equal(baseMidi, expectedBaseMidi, 'drum pitch base should follow the loaded lane target');
  assert.deepStrictEqual(
    drumPitchUiValuesToEngineOffsets([0, 2], settings, baseMidi),
    expectedOffsets,
    'drum semitones preset restore must convert saved scale degrees to engine pitch offsets',
  );
  assert.deepStrictEqual(
    drumPitchUiValuesToEngineOffsets([60, 64], { mode: 'notes', root: 48, scale: 'Minor' }, baseMidi),
    expectedOffsets,
    'drum notes preset restore must treat saved values as fixed MIDI notes',
  );
  assert.equal(
    drumPitchUiValuesToEngineOffsets([0], { mode: 'noteRange', root: 60, scale: 'Major' }, baseMidi),
    null,
    'drum note-range pitch mode should not send a stale pitch sequence to the engine',
  );
  assert.equal(
    evolvedDrumPitchOffsetToUiValue(expectedOffsets[0]!, settings, baseMidi),
    0,
    'drum evolved pitch offsets should round-trip back to saved scale degrees',
  );
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
    synthStepOverrides: {
      triggerToggles: [[], [{ step: 11, value: false }], [], []],
      expression: [null, [0.25, 0.75], null, null],
      expressionDirection: [null, 'reverse', null, null],
      expressionRanges: [null, { min: 0.2, max: 0.9 }, null, null],
    },
    drumSubLaneStates: [{
      expression: {
        enabled: true,
        steps: 5,
        direction: 'pingpong',
        valueMode: 'range',
        rangeMin: 0.2,
        rangeMax: 0.9,
      },
    }] as SavedPreset['drumSubLaneStates'],
    synthSubLaneStates: [{
      pitch: { enabled: true, steps: 7, direction: 'reverse', scaleQuantize: true },
      expression: {
        enabled: true,
        steps: 2,
        direction: 'reverse',
        valueMode: 'range',
        rangeMin: 0.2,
        rangeMax: 0.9,
      },
    }] as SavedPreset['synthSubLaneStates'],
    drumPitchSettings: [
      { mode: 'notes', root: 45, scale: 'Minor' },
      { mode: 'semitones', root: 60, scale: 'Major' },
      { mode: 'notes', root: 41, scale: 'Dorian' },
      { mode: 'semitones', root: 60, scale: 'Major' },
    ],
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
  assert.deepStrictEqual(version.synthStepOverrides, metadata.synthStepOverrides);
  assert.deepStrictEqual(version.drumSubLaneStates, metadata.drumSubLaneStates);
  assert.deepStrictEqual(version.synthSubLaneStates, metadata.synthSubLaneStates);
  assert.deepStrictEqual(version.drumPitchSettings, metadata.drumPitchSettings);
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

async function testRoutingMuteGroupMetadataSplitsReusableSceneHashes(): Promise<void> {
  const metadata: PresetVersionMetadata = {
    routingMuteGroups: {
      slots: [
        {
          mutedSourceIds: ['delayBOut', 'pad1'],
          statePatch: {
            delayAEnabled: false,
            waterEnabled: true,
          },
          phraseRange: { min: 1, max: 2 },
        },
        {
          mutedSourceIds: ['delayBOut', 'pad1'],
          statePatch: {
            delayAEnabled: false,
            waterEnabled: true,
          },
          phraseRange: { min: 4, max: 8 },
        },
        null,
        null,
        null,
        null,
        null,
        null,
      ],
      random: {
        enabled: true,
        defaultMinPhrases: 2,
        defaultMaxPhrases: 6,
        transitionPhrases: 1.5,
        avoidRepeat: true,
      },
    },
  };

  const plan = await planRoutingMuteGroupMetadataStorage(metadata);
  assert.equal(plan.scenes.length, 2);
  assert.equal(
    plan.scenes[0]?.hash,
    plan.scenes[1]?.hash,
    'identical mute scenes should share a reusable scene hash even when phrase timing differs',
  );
  assert.deepStrictEqual(plan.scenes[0]?.scene, {
    schemaVersion: 1,
    mutedSourceIds: ['pad1', 'delayBOut'],
    statePatch: {
      delayAEnabled: false,
      waterEnabled: true,
    },
  });
  assert.equal(
    plan.scenes[0]?.hash,
    await hashCanonicalJson(plan.scenes[0]?.scene),
    'scene refs should use the canonical payload hash',
  );

  const compactSlots = plan.metadata?.routingMuteGroups?.slots as Array<Record<string, unknown> | null>;
  assert.deepStrictEqual(compactSlots[0], {
    sceneHash: plan.scenes[0]?.hash,
    phraseRange: { min: 1, max: 2 },
  });
  assert.deepStrictEqual(compactSlots[1], {
    sceneHash: plan.scenes[1]?.hash,
    phraseRange: { min: 4, max: 8 },
  });

  const scenePayloads = new Map(plan.scenes.map(scene => [scene.refSlot, scene.scene]));
  const reconstructed = reconstructRoutingMuteGroupMetadata(
    plan.metadata,
    (refSlot) => ({
      targetFound: scenePayloads.has(refSlot),
      payload: scenePayloads.get(refSlot),
    }),
  );

  assert.deepStrictEqual(reconstructed?.routingMuteGroups?.slots[0], {
    mutedSourceIds: ['pad1', 'delayBOut'],
    statePatch: {
      delayAEnabled: false,
      waterEnabled: true,
    },
    phraseRange: { min: 1, max: 2 },
  });
  assert.deepStrictEqual(reconstructed?.routingMuteGroups?.slots[1], {
    mutedSourceIds: ['pad1', 'delayBOut'],
    statePatch: {
      delayAEnabled: false,
      waterEnabled: true,
    },
    phraseRange: { min: 4, max: 8 },
  });

  const warnings: PresetRecoveryWarning[] = [];
  const missing = reconstructRoutingMuteGroupMetadata(
    plan.metadata,
    (refSlot) => ({
      targetFound: refSlot !== routingMuteGroupSceneRefSlot(0),
      payload: refSlot === routingMuteGroupSceneRefSlot(0) ? undefined : scenePayloads.get(refSlot),
    }),
    { recoveryWarnings: warnings, version: 3 },
  );
  assert.equal(missing?.routingMuteGroups?.slots[0], null);
  assert.deepStrictEqual(warnings, [{
    slot: routingMuteGroupSceneRefSlot(0),
    reason: 'missing_child_preset',
    fallback: 'empty',
    version: 3,
  }]);
}

async function run(): Promise<void> {
  testStateUrlRoundTripRestoresBooleanSequencerState();
  testSoundEnginePresetMorphClampsEndpointB();
  testDefaultDrumSliderCacheMatchesSelectedPresetA();
  testGenericDrumEuclideanPatternKeepsTimingParamTypes();
  testSynthLanePatternRoundTripKeepsNoteRangeBounds();
  testEngineStepOverridesTrimHiddenSubLaneValues();
  testMigratePresetPreservesSynthPitchBindingModes();
  testBuildPresetVersionMetadataIncludesAllSupportedFields();
  testPresetPoolDefaultsUseStableIdsAndSharedEngineScopes();
  testPresetPoolMatchingNormalizationAndTags();
  testPresetPoolMetadataRoundTripsThroughL4SavedPreset();
  testGetPresetVersionSnapshotReturnsSelectedVersionMetadata();
  testLegacyImportPreservesSynthPitchBindingModes();
  testSequenceLanePresetRoundTripKeepsRuntimeLaneState();
  testDrumPitchPresetRestoreUsesEngineOffsets();
  testOptimizedStatePresetRoundTripKeepsOnlyOverrides();
  testStatePresetDiffIgnoresInactiveMixerValues();
  testMaterializedV2VersionPreservesAncillaryMetadata();
  testJourneyPresetCodecUsesRefsWithoutStateBloat();
  testJourneyPresetL4DeleteCleanupRemovesNodeAndConnections();
  testJourneyPresetL4DeleteCleanupUsesNodeFallbackRefs();
  testJourneyOverwriteBackupKeepsFullGraphBase();
  testJourneyPresetPreviewMetadataFeedsSummary();
  await testRoutingMuteGroupMetadataSplitsReusableSceneHashes();
  await testMetadataOnlyChangeKeepsResolvedHashShared();
  console.log('preset metadata regression checks passed');
}

await run();
