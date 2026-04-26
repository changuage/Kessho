import assert from 'node:assert/strict';

import { createLegacyStatePresetEntry } from './fileIO';
import {
  buildDerivedStatePresetData,
  extractOptimizedStatePresetData,
} from './statePresetOptimization';
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
    drumSubLaneStates: [{ trigger: { enabled: true, steps: 8, direction: 'forward' } }] as SavedPreset['drumSubLaneStates'],
    synthSubLaneStates: [{ trigger: { enabled: false, steps: 16, direction: 'reverse' } }] as SavedPreset['synthSubLaneStates'],
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
    drumSubLaneStates: [{ trigger: { enabled: true, steps: 8, direction: 'forward' } }],
    synthSubLaneStates: [{ trigger: { enabled: false, steps: 16, direction: 'reverse' } }],
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

function run(): void {
  testMigratePresetPreservesSynthPitchBindingModes();
  testBuildPresetVersionMetadataIncludesAllSupportedFields();
  testGetPresetVersionSnapshotReturnsSelectedVersionMetadata();
  testLegacyImportPreservesSynthPitchBindingModes();
  testOptimizedStatePresetRoundTripKeepsOnlyOverrides();
  console.log('preset metadata regression checks passed');
}

run();
