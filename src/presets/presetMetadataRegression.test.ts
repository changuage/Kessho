import assert from 'node:assert/strict';

import { createLegacyStatePresetEntry } from './fileIO';
import {
  hashCanonicalJson,
  materializePresetVersion,
  normalizeResolvedVersionData,
  type PresetVersionV2Row,
} from './presetStorageV2';
import {
  buildDerivedStatePresetData,
  extractOptimizedStatePresetData,
} from './statePresetOptimization';
import { isStatePresetDiffKeyActive, normalizeStatePresetDiffData } from './statePresetDiffs';
import { buildPresetVersionMetadata, getPresetVersionSnapshot } from './versionMetadataHelpers';
import type { PresetEntry } from './types';
import { DEFAULT_STATE, migratePreset, type SavedPreset } from '../ui/state';

const SYNTH_BINDING_MODES = ['sequence', 'linked', 'polyrhythmic', 'polyrhythmic'] as const;

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

async function run(): Promise<void> {
  testMigratePresetPreservesSynthPitchBindingModes();
  testBuildPresetVersionMetadataIncludesAllSupportedFields();
  testGetPresetVersionSnapshotReturnsSelectedVersionMetadata();
  testLegacyImportPreservesSynthPitchBindingModes();
  testOptimizedStatePresetRoundTripKeepsOnlyOverrides();
  testStatePresetDiffIgnoresInactiveMixerValues();
  testMaterializedV2VersionPreservesAncillaryMetadata();
  await testMetadataOnlyChangeKeepsResolvedHashShared();
  console.log('preset metadata regression checks passed');
}

await run();
